"""Local evidence workbench. v1 snapshots remain owned by the legacy solver."""
import csv
import hashlib
import io
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from itertools import product
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from pypdf import PdfReader
from .domain import digest, seed, solve as legacy_solve

router = APIRouter(prefix='/v2')
TABLES = ('sites', 'documents', 'instruments', 'claims', 'dependencies', 'scenarios', 'runs', 'reviews', 'events', 'extractions', 'proposals')
TABLES += ('state_models','state_facts','transaction_events','contract_rules','state_scenarios','state_runs','state_findings','clause_jobs','clause_proposals','document_links','state_balances')

def stamp():
    return datetime.now(timezone.utc).isoformat()

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Project(Strict):
    name: str = Field(min_length=1, max_length=160)
    mw: int | None = Field(default=None, ge=0)
    archived: bool = False
    synthetic: bool = False

class Site(Strict):
    name: str = Field(min_length=1, max_length=160)
    commercial_status: Literal['CANDIDATE', 'SELECTED', 'ABANDONED'] = 'CANDIDATE'

class Evidence(Strict):
    document_id: str
    page: int = Field(ge=1)
    start: int = Field(ge=0)
    end: int = Field(ge=1)
    quote: str = Field(min_length=1)

class Instrument(Strict):
    label: str = Field(min_length=1, max_length=160)
    beneficiary: str = Field(min_length=1, max_length=160)
    site_id: str | None = None
    face_cents: int | None = Field(default=None, ge=0, le=10**15, strict=True)
    currency: Literal['USD'] = 'USD'
    lifecycle: Literal['EFFECTIVE', 'RELEASED', 'EXPIRED', 'CANCELLED'] = 'EFFECTIVE'
    governing_law: str = ''
    basis: Literal['FACE', 'CLAIM_LIMITED'] = 'FACE'
    basis_hypothetical: bool = True
    evidence: list[Evidence] = []
    basis_evidence: list[Evidence] = []
    release_evidence: list[Evidence] = []
    facility_usage_cents: int | None = Field(default=None, ge=0, strict=True)
    cash_collateral_cents: int | None = Field(default=None, ge=0, strict=True)
    guarantee_cents: int | None = Field(default=None, ge=0, strict=True)
    surety_cents: int | None = Field(default=None, ge=0, strict=True)

class Claim(Strict):
    label: str = Field(min_length=1, max_length=200)
    amount_cents: int | None = Field(default=None, ge=0, le=10**15, strict=True)
    currency: Literal['USD'] = 'USD'
    kind: Literal['fixed', 'conditional'] = 'fixed'
    instrument_id: str | None = None
    site_id: str | None = None
    legal_status: Literal['UNKNOWN', 'REVIEWED_MODEL_INPUT'] = 'UNKNOWN'
    mapping: Literal['ADDITIVE', 'UNCERTAIN'] = 'UNCERTAIN'
    evidence: list[Evidence] = Field(min_length=1)

class Dependency(Strict):
    label: str = Field(min_length=1, max_length=200)
    claim_ids: list[str] = Field(min_length=1)
    max_active: int = Field(ge=0, le=20)
    hypothetical: bool = True
    evidence: list[Evidence] = Field(min_length=1)

class Scenario(Strict):
    name: str = Field(min_length=1, max_length=160)
    hypothetical: bool = False
    conditional_percent: int = Field(default=100, ge=100, le=1000)
    ceiling_percent: int = Field(default=100, ge=100, le=1000)
    dependency_ids: list[str] = []

class Decision(Strict):
    decision: Literal['VERIFIED', 'REJECTED', 'UNVERIFIED']
    reason: str = Field(min_length=3, max_length=2000)

class Reviewer(Strict):
    name: str = Field(min_length=2, max_length=100)

class Completion(Strict):
    reason: str = Field(min_length=3, max_length=2000)

class Assessment(Strict):
    scenario_id: str

class Comparison(Strict):
    scenario_ids: list[str] = Field(min_length=2, max_length=4)

def install(app, auth, data_path):
    @contextmanager
    def db():
        root = data_path()
        root.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(root / 'workbench.sqlite', timeout=30) as c:
            c.row_factory = sqlite3.Row
            c.execute('PRAGMA foreign_keys=ON')
            c.execute('CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
            c.execute('CREATE TABLE IF NOT EXISTS profiles(tenant TEXT PRIMARY KEY, name TEXT NOT NULL)')
            c.execute('CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL)')
            for table in TABLES:
                c.execute(f'CREATE TABLE IF NOT EXISTS {table}(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), body TEXT NOT NULL)')
                c.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_project ON {table}(project_id)')
            c.execute('CREATE TABLE IF NOT EXISTS legacy_imports(tenant TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id))')
            c.execute('INSERT OR IGNORE INTO migrations VALUES(1,?)', (stamp(),))
            c.execute('INSERT OR IGNORE INTO migrations VALUES(2,?)', (stamp(),))
            c.execute('INSERT OR IGNORE INTO migrations VALUES(3,?)', (stamp(),))
            c.commit()
            c.execute('BEGIN IMMEDIATE')
            yield c

    def get_project(c, pid, tenant):
        row = c.execute('SELECT * FROM projects WHERE id=? AND tenant=?', (pid, tenant)).fetchone()
        if not row:
            raise HTTPException(404, 'Project not found')
        return {**json.loads(row['body']), 'id': row['id'], 'revision': row['revision']}

    def get(c, table, pid, key):
        row = c.execute(f'SELECT body FROM {table} WHERE id=? AND project_id=?', (key, pid)).fetchone()
        if not row:
            raise HTTPException(404, 'Record not found in this project')
        return json.loads(row['body'])

    def rows(c, table, pid):
        return [json.loads(r[0]) for r in c.execute(f'SELECT body FROM {table} WHERE project_id=? ORDER BY rowid', (pid,))]

    def put(c, table, pid, body):
        c.execute(f'INSERT INTO {table}(id,project_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', (body['id'], pid, json.dumps(body)))

    def audit(c, pid, tenant, action, detail, material=True):
        profile = c.execute('SELECT name FROM profiles WHERE tenant=?', (tenant,)).fetchone()
        prior = c.execute('SELECT body FROM events WHERE project_id=? ORDER BY rowid DESC LIMIT 1', (pid,)).fetchone()
        event = {'id': str(uuid4()), 'at': stamp(), 'reviewer': profile[0] if profile else 'Local operator', 'action': action, 'detail': detail, 'previous_hash': json.loads(prior[0])['hash'] if prior else None}
        event['hash'] = digest(event)
        put(c, 'events', pid, event)
        if material:
            c.execute('UPDATE projects SET revision=revision+1 WHERE id=?', (pid,))
        return event

    def evidence(c, pid, spans):
        for span in spans:
            d = get(c, 'documents', pid, span['document_id'])
            if d['superseded'] or span['page'] > len(d['pages']):
                raise HTTPException(422, 'Evidence must reference a current document page')
            text = d['pages'][span['page']-1]
            if span['end'] > len(text) or text[span['start']:span['end']] != span['quote'] or not span['quote'].strip():
                raise HTTPException(422, 'Evidence offsets do not match the exact quotation')

    def validate_links(c, pid, table, value):
        if value.get('site_id'):
            get(c, 'sites', pid, value['site_id'])
        for field in ('evidence', 'basis_evidence', 'release_evidence'):
            evidence(c, pid, value.get(field, []))
        if table == 'claims' and value['instrument_id']:
            get(c, 'instruments', pid, value['instrument_id'])
        if table == 'dependencies':
            if len(set(value['claim_ids'])) != len(value['claim_ids']) or value['max_active'] > len(value['claim_ids']):
                raise HTTPException(422, 'Constraint members must be unique and the cap cannot exceed their count')
            for key in value['claim_ids']:
                get(c, 'claims', pid, key)
        if table == 'scenarios':
            for key in value['dependency_ids']:
                d = get(c, 'dependencies', pid, key)
                if d['hypothetical'] and not value['hypothetical']:
                    raise HTTPException(422, 'Hypothetical constraints require a hypothetical scenario')
            if not value['hypothetical'] and (value['conditional_percent'] != 100 or value['ceiling_percent'] != 100):
                raise HTTPException(422, 'Stress multipliers require a hypothetical scenario')

    @router.get('/projects')
    def projects(tenant=Depends(auth)):
        with db() as c:
            profile = c.execute('SELECT name FROM profiles WHERE tenant=?', (tenant,)).fetchone()
            values = [{**json.loads(r['body']), 'id': r['id'], 'revision': r['revision']} for r in c.execute('SELECT * FROM projects WHERE tenant=? ORDER BY rowid', (tenant,))]
            return {'projects': values, 'reviewer': profile[0] if profile else '', 'schema_version': 2}

    @router.post('/profile')
    def profile(req: Reviewer, tenant=Depends(auth)):
        with db() as c:
            c.execute('INSERT INTO profiles VALUES(?,?) ON CONFLICT(tenant) DO UPDATE SET name=excluded.name', (tenant, req.name))
        return req

    def create_project(c, tenant, body):
        pid = str(uuid4())
        c.execute('INSERT INTO projects VALUES(?,?,0,?)', (pid, tenant, json.dumps(body)))
        audit(c, pid, tenant, 'Project created', body)
        sid = str(uuid4())
        put(c, 'scenarios', pid, {'id': sid, **Scenario(name='Documented baseline').model_dump()})
        return get_project(c, pid, tenant)

    @router.post('/projects')
    def new_project(req: Project, tenant=Depends(auth)):
        with db() as c:
            return create_project(c, tenant, req.model_dump())

    @router.patch('/projects/{pid}')
    def edit_project(pid: str, req: Project, tenant=Depends(auth)):
        with db() as c:
            get_project(c, pid, tenant)
            c.execute('UPDATE projects SET body=? WHERE id=?', (req.model_dump_json(), pid))
            audit(c, pid, tenant, 'Project updated', req.model_dump())
            return get_project(c, pid, tenant)

    @router.get('/projects/{pid}')
    def workspace(pid: str, tenant=Depends(auth)):
        with db() as c:
            p = get_project(c, pid, tenant)
            result = {'project': p, **{t: rows(c, t, pid) for t in TABLES}}
            for r in result['runs']:
                r['stale'] = r['revision'] != p['revision']
                r.pop('snapshot', None)
            return result

    @router.get('/projects/{pid}/integrity')
    def audit_integrity(pid: str, tenant=Depends(auth)):
        """Check consistency of the stored audit chain without exposing event details."""
        with db() as c:
            get_project(c, pid, tenant)
            events = rows(c, 'events', pid)
            issues = []
            previous_hash = None
            for index, event in enumerate(events):
                event_id = event.get('id', '')
                if event.get('previous_hash') != previous_hash:
                    issues.append({'event_id': event_id, 'index': index, 'check': 'previous_hash'})
                payload = {key: value for key, value in event.items() if key != 'hash'}
                if event.get('hash') != digest(payload):
                    issues.append({'event_id': event_id, 'index': index, 'check': 'event_hash'})
                previous_hash = event.get('hash')
            return {
                'valid': not issues,
                'event_count': len(events),
                'issues': issues,
                'checked_at': stamp(),
                'scope': 'stored audit events only; local storage is not tamper-proof WORM storage',
            }

    def registration(table, model):
        def save(pid, req, tenant, key=None):
            with db() as c:
                p = get_project(c, pid, tenant)
                if p['archived']:
                    raise HTTPException(409, 'Reopen the archived project before editing')
                old = get(c, table, pid, key) if key else None
                body = req.model_dump()
                validate_links(c, pid, table, body)
                value = {'id': key or str(uuid4()), **body}
                if old and old.get('extraction_provenance'):
                    value['extraction_provenance'] = old['extraction_provenance']
                if table in ('claims', 'instruments', 'dependencies'):
                    value.update(verification='UNVERIFIED', release_verified=False)
                if old:
                    # Editing a reviewed input revokes dependent constraints too.
                    for d in rows(c, 'dependencies', pid):
                        if table == 'claims' and key in d['claim_ids']:
                            d['verification'] = 'UNVERIFIED'
                            put(c, 'dependencies', pid, d)
                put(c, table, pid, value)
                audit(c, pid, tenant, f'{table} saved', {'before': old, 'after': value})
                return value
        def create(pid: str, req, tenant=Depends(auth)):
            return save(pid, req, tenant)
        def edit(pid: str, key: str, req, tenant=Depends(auth)):
            return save(pid, req, tenant, key)
        create.__annotations__['req'] = model
        edit.__annotations__['req'] = model
        router.add_api_route('/projects/{pid}/'+table, create, methods=['POST'], name='create_'+table)
        router.add_api_route('/projects/{pid}/'+table+'/{key}', edit, methods=['PATCH'], name='edit_'+table)

    for table, model in [('sites', Site), ('instruments', Instrument), ('claims', Claim), ('dependencies', Dependency), ('scenarios', Scenario)]:
        registration(table, model)

    @router.post('/projects/{pid}/{table}/{key}/review')
    def review(pid: str, table: Literal['claims', 'instruments', 'dependencies'], key: str, req: Decision, tenant=Depends(auth)):
        with db() as c:
            p = get_project(c, pid, tenant)
            if p['archived']:
                raise HTTPException(409, 'Reopen the project before reviewing inputs')
            if not c.execute('SELECT name FROM profiles WHERE tenant=?', (tenant,)).fetchone():
                raise HTTPException(422, 'Save your local reviewer name first')
            value = get(c, table, pid, key)
            before = json.loads(json.dumps(value))
            if req.decision == 'VERIFIED':
                validate_links(c, pid, table, value)
                if not value.get('evidence'):
                    raise HTTPException(422, 'Review requires source evidence')
                if table == 'claims' and (value['amount_cents'] is None or value['mapping'] != 'ADDITIVE' or not value['instrument_id']):
                    raise HTTPException(422, 'Resolve the amount and confirm additive mapping before review')
                if table == 'claims':
                    for other in rows(c, 'claims', pid):
                        if other['id'] == key or other['verification'] != 'VERIFIED':
                            continue
                        same_component = other['instrument_id'] == value['instrument_id'] and other['kind'] == value['kind'] and other['amount_cents'] == value['amount_cents']
                        overlaps = any(a['document_id'] == b['document_id'] and a['page'] == b['page'] and max(a['start'],b['start']) < min(a['end'],b['end']) for a in value['evidence'] for b in other['evidence'])
                        if same_component and overlaps:
                            raise HTTPException(422, 'A reviewed claim already cites this overlapping amount component. Resolve the duplicate or cite distinct supporting evidence.')
                if table == 'instruments':
                    if value['face_cents'] is None:
                        raise HTTPException(422, 'Instrument face amount is missing')
                    if value['basis'] == 'CLAIM_LIMITED' and not value['basis_evidence']:
                        raise HTTPException(422, 'Claim-limited modeling needs its own supporting evidence')
                    value['release_verified'] = bool(value['release_evidence'])
            else:
                value['release_verified'] = False
            value['verification'] = req.decision
            put(c, table, pid, value)
            if table == 'claims':
                for dep in rows(c, 'dependencies', pid):
                    if key in dep['claim_ids']:
                        dep['verification'] = 'UNVERIFIED'
                        put(c, 'dependencies', pid, dep)
            ev = audit(c, pid, tenant, 'User input reviewed', {'type': table, 'id': key, 'decision': req.decision, 'reason': req.reason})
            put(c, 'reviews', pid, {'id': str(uuid4()), 'type': table, 'record_id': key, 'before': before, 'after': value, 'reason': req.reason, 'reviewer': ev['reviewer'], 'at': ev['at']})
            return value

    @router.post('/projects/{pid}/documents')
    async def upload(pid: str, file: UploadFile = File(...), replaces: str = Form(''), source_url: str = Form(''), tenant=Depends(auth)):
        raw = await file.read(5_000_001)
        if len(raw) > 5_000_000:
            raise HTTPException(413, 'Maximum file size is 5 MB')
        name = Path(file.filename or 'document.txt').name
        try:
            if name.lower().endswith('.pdf'):
                reader = PdfReader(io.BytesIO(raw))
                if len(reader.pages) > 100:
                    raise ValueError('Maximum 100 pages')
                pages = [p.extract_text() or '' for p in reader.pages]
                if any(not p.strip() for p in pages):
                    raise ValueError('PDF contains a page without text; OCR is not supported')
            elif name.lower().endswith(('.html','.htm')):
                from .ingestion import html_pages
                pages=html_pages(raw)
            elif name.lower().endswith(('.txt', '.md')):
                pages = [raw.decode('utf-8-sig')]
            else:
                raise ValueError('Use text PDF, TXT, MD or HTML')
            limit=2_000_000 if name.lower().endswith(('.html','.htm')) else 200_000
            if not ''.join(pages).strip() or sum(map(len, pages)) > limit:
                raise ValueError('Document text exceeds supported size or is empty')
            if source_url and not source_url.startswith('https://'):
                raise ValueError('Primary-source reference must be an HTTPS URL; no URL is fetched automatically')
        except Exception as exc:
            raise HTTPException(422, str(exc)) from exc
        with db() as c:
            if get_project(c, pid, tenant)['archived']:
                raise HTTPException(409, 'Reopen the project before uploading evidence')
            old = get(c, 'documents', pid, replaces) if replaces else None
            if old and old['superseded']:
                raise HTTPException(409, 'Replace the current version')
            if old:
                old['superseded'] = True
                put(c, 'documents', pid, old)
                for proposal in rows(c, 'proposals', pid)+rows(c,'clause_proposals',pid):
                    if proposal['document_id'] == replaces and proposal['disposition'] == 'PENDING':
                        proposal['disposition'] = 'SUPERSEDED'
                        put(c, 'clause_proposals' if proposal.get('category') else 'proposals', pid, proposal)
                affected = set()
                for table in ('claims', 'instruments', 'dependencies','state_facts','transaction_events','contract_rules','document_links','state_balances'):
                    for item in rows(c, table, pid):
                        if any(e['document_id'] == replaces for field in ('evidence', 'basis_evidence', 'release_evidence') for e in item.get(field, [])):
                            item['verification'], item['release_verified'] = 'UNVERIFIED', False
                            affected.add(item['id'])
                            put(c, table, pid, item)
                for dep in rows(c, 'dependencies', pid):
                    if affected.intersection(dep['claim_ids']):
                        dep['verification'] = 'UNVERIFIED'
                        put(c, 'dependencies', pid, dep)
            sha = hashlib.sha256(raw).hexdigest()
            folder = data_path() / 'objects' / hashlib.sha256(tenant.encode()).hexdigest()
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / sha
            if not target.exists():
                target.write_bytes(raw)
            value = {'id': str(uuid4()), 'name': name, 'pages': pages, 'sha256': sha, 'agreement_id': old['agreement_id'] if old else str(uuid4()), 'version': old['version']+1 if old else 1, 'superseded': False, 'processing': 'UPLOADED'}
            value['source_url']=source_url
            put(c, 'documents', pid, value)
            audit(c, pid, tenant, 'Document uploaded', {'document_id': value['id'], 'replaces': replaces, 'sha256': sha})
            return value

    @router.post('/projects/{pid}/documents/{key}/complete')
    def complete_document(pid: str, key: str, req: Completion, tenant=Depends(auth)):
        with db() as c:
            if get_project(c, pid, tenant)['archived']:
                raise HTTPException(409, 'Reopen the project before completing review')
            d = get(c, 'documents', pid, key)
            if d['superseded']:
                raise HTTPException(409, 'Cannot complete superseded evidence')
            if any(p['document_id'] == key and p['disposition'] == 'PENDING' for p in rows(c, 'proposals', pid)+rows(c,'clause_proposals',pid)):
                raise HTTPException(409, 'Resolve or dismiss every extraction proposal before completing document review')
            if any(j['document_id'] == key and not j.get('abandoned') and j['status'] in ('QUEUED', 'RUNNING', 'FAILED', 'INTERRUPTED') for j in rows(c, 'extractions', pid)):
                raise HTTPException(409, 'Wait for extraction, or explicitly abandon failed/interrupted attempts before manual completion')
            d['processing'], d['completion_reason'] = 'REVIEWED', req.reason
            put(c, 'documents', pid, d)
            audit(c, pid, tenant, 'Document review completed', {'document_id': key, 'reason': req.reason})
            return d

    def snapshot(c, pid, tenant, scenario_id):
        return {'schema_version': 2, 'project': get_project(c, pid, tenant), 'scenario': get(c, 'scenarios', pid, scenario_id), **{t: rows(c, t, pid) for t in ('sites', 'documents', 'instruments', 'claims', 'dependencies')}}

    @router.post('/projects/{pid}/comparisons')
    def compare(pid: str, req: Comparison, tenant=Depends(auth)):
        if len(set(req.scenario_ids)) != len(req.scenario_ids):
            raise HTTPException(422, 'Choose two to four different scenarios')
        with db() as c:
            base = snapshot(c, pid, tenant, req.scenario_ids[0])
            scenarios = [get(c, 'scenarios', pid, key) for key in req.scenario_ids]
        # All scenarios use one frozen set of records; solving does not retain a write lock.
        inputs = {k:v for k,v in base.items() if k != 'scenario'}
        comparisons = []
        for scenario in scenarios:
            frozen = {**inputs, 'scenario': scenario}
            comparisons.append({'scenario_id':scenario['id'], 'scenario':scenario,
                                'snapshot_hash':digest(frozen), 'result':solve(frozen)})
        return {'project_revision':inputs['project']['revision'], 'inputs':inputs,
                'comparisons':comparisons, 'notice':'Preview only. No assessment or review decision was saved.'}

    @router.post('/projects/{pid}/runs')
    def run(pid: str, req: Assessment, tenant=Depends(auth)):
        with db() as c:
            if get_project(c, pid, tenant)['archived']:
                raise HTTPException(409, 'Reopen the project before creating an assessment')
            s = snapshot(c, pid, tenant, req.scenario_id)
            result = solve(s)
            value = {'id': str(uuid4()), 'at': stamp(), 'revision': s['project']['revision'], 'solver_version': 'enumeration-2.0', 'scenario_name': s['scenario']['name'], 'snapshot': s, 'snapshot_hash': digest(s), 'result': result, 'result_hash': digest(result)}
            put(c, 'runs', pid, value)
            audit(c, pid, tenant, 'Assessment computed', {'run_id': value['id'], 'snapshot_hash': value['snapshot_hash']}, False)
            return value

    @router.get('/projects/{pid}/runs/{key}')
    def read_run(pid: str, key: str, tenant=Depends(auth)):
        with db() as c:
            p = get_project(c, pid, tenant)
            value = get(c, 'runs', pid, key)
            return {**value, 'stale': value['revision'] != p['revision']}

    @router.post('/projects/{pid}/runs/{key}/replay')
    def replay(pid: str, key: str, tenant=Depends(auth)):
        r = read_run(pid, key, tenant)
        fn = legacy_solve if r['solver_version'] == 'enumeration-1.0' else solve
        result = fn(r['snapshot'])
        return {'snapshot_matches': digest(r['snapshot']) == r['snapshot_hash'], 'result_matches': digest(result) == r['result_hash'], 'result': result}

    @router.get('/projects/{pid}/runs/{key}/export')
    def export(pid: str, key: str, format: Literal['json', 'csv'] = 'json', tenant=Depends(auth)):
        r = read_run(pid, key, tenant)
        if format == 'json':
            return Response(json.dumps(r, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename=loadbond-evidence.json'})
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(['run_id', 'snapshot_hash', 'claim_id', 'label', 'amount_cents', 'instrument_id', 'document_id', 'page', 'quote', 'extraction_provenance'])
        for claim in r['snapshot']['claims']:
            spans = claim.get('evidence', [dict(claim.get('source', {}), document_id=claim.get('document_id'))])
            for e in spans:
                values = [key, r['snapshot_hash'], claim['id'], claim['label'], claim['amount_cents'], claim['instrument_id'], e['document_id'], e['page'], e['quote'], json.dumps(claim.get('extraction_provenance', {}), sort_keys=True)]
                writer.writerow(["'"+v if isinstance(v, str) and v.startswith(('=', '+', '-', '@', '\t', '\r')) else v for v in values])
        return Response(out.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename=loadbond-claims.csv'})

    def import_values(c, tenant, old, legacy=False):
        p = create_project(c, tenant, Project(name=old['project']['name'], mw=old['project'].get('mw'), synthetic=True).model_dump())
        pid = p['id']
        maps = {t: {x['id']: str(uuid4()) for x in old[t]} for t in ('sites', 'documents', 'instruments', 'claims', 'dependencies')}
        for d in old['documents']:
            put(c, 'documents', pid, {**d, 'id': maps['documents'][d['id']], 'processing': 'REVIEWED'})
        for site in old['sites']:
            put(c, 'sites', pid, {'id': maps['sites'][site['id']], **Site(name=site['name']).model_dump()})
        def span(claim):
            return {k: claim['source'][k] for k in ('page', 'start', 'end', 'quote')} | {'document_id': maps['documents'][claim['document_id']]}
        for i in old['instruments']:
            doc = next(d for d in old['documents'] if d['id'] == 'doc-'+i['id'].split('-')[-1])
            q = doc['pages'][0]
            ev = Evidence(document_id=maps['documents'][doc['id']], page=1, start=0, end=len(q), quote=q)
            value = Instrument(label=i['id'], beneficiary='Synthetic beneficiary', site_id=maps['sites'][i['site_id']], face_cents=i['face_cents'], basis='CLAIM_LIMITED', evidence=[ev], basis_evidence=[ev]).model_dump()
            put(c, 'instruments', pid, {'id': maps['instruments'][i['id']], **value, 'verification': 'VERIFIED', 'release_verified': False})
        for cl in old['claims']:
            value = Claim(label=cl['label'], amount_cents=cl['amount_cents'], kind=cl['kind'], instrument_id=maps['instruments'].get(cl['instrument_id']), site_id=maps['sites'].get(cl['site_id']), mapping='ADDITIVE' if cl['verification']=='VERIFIED' else 'UNCERTAIN', evidence=[span(cl)]).model_dump()
            put(c, 'claims', pid, {'id': maps['claims'][cl['id']], **value, 'verification': cl['verification']})
        dep_ids = []
        for d in old['dependencies']:
            doc = next(x for x in old['documents'] if x['id'] == d['document_id'])
            text, quote = doc['pages'][0], d['quote']
            value = Dependency(label=d['label'], claim_ids=[maps['claims'][x] for x in d['claim_ids']], max_active=d['max_active'], evidence=[Evidence(document_id=maps['documents'][doc['id']], page=1, start=text.index(quote), end=text.index(quote)+len(quote), quote=quote)]).model_dump()
            dep_id = maps['dependencies'][d['id']]
            put(c, 'dependencies', pid, {'id': dep_id, **value, 'verification': 'VERIFIED' if not legacy else 'UNVERIFIED'})
            dep_ids.append(dep_id)
            three = {**value, 'label': 'Explicit three-branch overlap', 'max_active': 3}
            rid = str(uuid4())
            put(c, 'dependencies', pid, {'id': rid, **three, 'verification': 'VERIFIED' if not legacy else 'UNVERIFIED'})
            for name, pct, ceiling, ids in [('Hypothetical two-branch cap',100,100,[dep_id]), ('Three-branch overlap',100,100,[rid]), ('25% step-up',125,125,[dep_id])]:
                put(c, 'scenarios', pid, {'id': str(uuid4()), **Scenario(name=name, hypothetical=True, conditional_percent=pct, ceiling_percent=ceiling, dependency_ids=ids).model_dump()})
        for r in old.get('runs', []):
            put(c, 'runs', pid, {**r, 'id': str(uuid4()), 'revision': -1, 'solver_version': 'enumeration-1.0', 'scenario_name': 'Legacy: '+r['scenario']})
        audit(c, pid, tenant, 'Legacy imported' if legacy else 'Sample project loaded', {'notice': 'Synthetic sample assumptions. User review is not legal approval.'})
        return get_project(c, pid, tenant)

    @router.post('/sample')
    def sample(tenant=Depends(auth)):
        with db() as c:
            return import_values(c, tenant, seed())

    @router.post('/transaction-case')
    def transaction_case(tenant=Depends(auth)):
        from .transaction_case import CASE_TITLE, records
        fixture = records()
        with db() as c:
            p = create_project(c, tenant, Project(name=CASE_TITLE, mw=300, synthetic=True).model_dump())
            for table, values in fixture.items():
                for value in values:
                    put(c, table, p['id'], value)
            folder = data_path() / 'objects' / hashlib.sha256(tenant.encode()).hexdigest()
            folder.mkdir(parents=True, exist_ok=True)
            for d in fixture['documents']:
                target = folder / d['sha256']
                if not target.exists():
                    target.write_bytes(d['pages'][0].encode())
            audit(c, p['id'], tenant, 'Synthetic transaction fixture loaded', {
                'fixture_version': 'riverbend-1.0', 'notice': 'Pre-reviewed authored inputs. No AI extraction, user review, or legal approval implied.'})
            return get_project(c, p['id'], tenant)

    @router.post('/import-legacy')
    def import_legacy(tenant=Depends(auth)):
        source = data_path() / 'loadbond.sqlite'
        if not source.exists():
            raise HTTPException(404, 'No legacy database found')
        with db() as c:
            prior = c.execute('SELECT project_id FROM legacy_imports WHERE tenant=?', (tenant,)).fetchone()
            if prior:
                return get_project(c, prior[0], tenant)
            with sqlite3.connect(source) as legacy:
                row = legacy.execute('SELECT body FROM workspaces WHERE tenant=?', (tenant,)).fetchone()
            if not row:
                raise HTTPException(404, 'No legacy workspace for this token')
            result = import_values(c, tenant, json.loads(row[0]), True)
            c.execute('INSERT INTO legacy_imports VALUES(?,?)', (tenant, result['id']))
            return result

    from .local_extraction import install as install_extraction
    app.state.local_extraction = install_extraction(app, router, auth, db, get_project, get, rows, put, audit, evidence, validate_links, Instrument, Claim)
    from .state_api import install as install_state
    install_state(app,auth,db,get_project,get,rows,put,audit,evidence,create_project,data_path)
    app.include_router(router)

def solve(s):
    scenario = s['scenario']
    errors = []
    docs = {d['id']: d for d in s['documents']}
    for d in docs.values():
        if not d['superseded'] and d['processing'] != 'REVIEWED':
            errors.append('Finish document review: '+d['name'])
    instruments = [i for i in s['instruments'] if i['verification'] != 'REJECTED']
    claims = sorted([c for c in s['claims'] if c['verification'] != 'REJECTED'], key=lambda c: c['id'])
    if not instruments:
        errors.append('Add and review at least one instrument')
    for item in instruments+claims:
        if item['verification'] != 'VERIFIED':
            errors.append('Review input: '+item['label'])
        if any(docs[e['document_id']]['superseded'] for field in ('evidence','basis_evidence','release_evidence') for e in item.get(field, [])):
            errors.append('Replace superseded evidence: '+item['label'])
    for i in instruments:
        if i['face_cents'] is None:
            errors.append('Missing face amount: '+i['label'])
    valid = {i['id'] for i in instruments}
    for cl in claims:
        if cl['amount_cents'] is None or cl['mapping'] != 'ADDITIVE' or cl['instrument_id'] not in valid:
            errors.append('Resolve amount or instrument mapping: '+cl['label'])
    if errors:
        return {'status': 'INCOMPLETE', 'maximum_cents': None, 'issues': errors, 'solver_version': 'enumeration-2.0'}
    variables = [c for c in claims if c['kind'] == 'conditional']
    if len(variables) > 20:
        return {'status': 'UNSUPPORTED', 'maximum_cents': None, 'issues': ['More than 20 conditional claims; split the assessment'], 'solver_version': 'enumeration-2.0'}
    dependencies = [d for d in s['dependencies'] if d['id'] in scenario['dependency_ids'] and d['verification'] == 'VERIFIED' and (scenario['hypothetical'] or not d['hypothetical'])]
    ignored = [d['id'] for d in s['dependencies'] if d['id'] in scenario['dependency_ids'] and d not in dependencies]
    pct, ceiling = scenario['conditional_percent'], scenario['ceiling_percent']
    def amounts(active):
        totals = {}
        obligations = 0
        for c in active:
            amount = c['amount_cents']*(pct if c['kind'] == 'conditional' else 100)//100
            obligations += amount
            totals[c['instrument_id']] = totals.get(c['instrument_id'], 0)+amount
        exposure = {}
        for i in instruments:
            face = i['face_cents']*ceiling//100
            released = i['release_verified'] and i['lifecycle'] in ('RELEASED','CANCELLED','EXPIRED')
            limited = i['basis'] == 'CLAIM_LIMITED' and (scenario['hypothetical'] or not i['basis_hypothetical'])
            exposure[i['id']] = 0 if released else min(face, totals.get(i['id'],0)) if limited else face
        return obligations, exposure
    gross_obligations, gross_trace = amounts(claims)
    if max(gross_obligations, sum(gross_trace.values())) > 2**53-1:
        return {'status':'UNSUPPORTED','maximum_cents':None,'issues':['Totals exceed the supported display precision; split the assessment.'],'solver_version':'enumeration-2.0'}
    best, max_obligations, best_ids, trace, feasible, best_obligations = -1, -1, [], {}, 0, -1
    for bits in product((0,1), repeat=len(variables)):
        active = [c for c in claims if c['kind'] == 'fixed']+[c for c,on in zip(variables,bits) if on]
        ids = {c['id'] for c in active}
        if any(len(ids.intersection(d['claim_ids'])) > d['max_active'] for d in dependencies):
            continue
        feasible += 1
        obligations, exposure = amounts(active)
        max_obligations = max(max_obligations, obligations)
        value = sum(exposure.values())
        if value > best or (value == best and obligations > best_obligations):
            best, best_ids, trace, best_obligations = value, sorted(ids), exposure, obligations
    if best < 0:
        return {'status':'INCOMPLETE','maximum_cents':None,'issues':['No feasible state. Resolve contradictory constraints.'],'solver_version':'enumeration-2.0'}
    return {'status':'COMPLETE','maximum_cents':best,'gross_cents':sum(gross_trace.values()), 'modeled_difference_cents':sum(gross_trace.values())-best,
            'maximum_obligations_cents':max_obligations,'gross_obligations_cents':gross_obligations, 'active_claims':best_ids, 'instrument_contributions':trace,
            'applied_dependencies':[d['id'] for d in dependencies], 'ignored_dependencies':ignored,'feasible_states':feasible,'solver_version':'enumeration-2.0',
            'hypothetical':scenario['hypothetical'],'notice':'User-reviewed model inputs; not a legal opinion or confirmed capital savings.'}
