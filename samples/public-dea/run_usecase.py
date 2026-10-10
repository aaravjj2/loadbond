"""Treasury use cases on two executed, public PJM Designated Entity Agreements (2024 RTEP Window 1).

Question: how much of each letter of credit can PJM draw, under which conditions, and when must it
come back? Entered through the product API with exact quotations from the downloaded PDFs.
Run from the loadbond directory: .\\.venv\\Scripts\\python.exe samples/public-dea/run_usecase.py
"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from fastapi.testclient import TestClient  # noqa: E402
from backend import main  # noqa: E402

BASE = 'https://www.pjm.com/-/media/DotCom/planning/rtep-dev/expan-plan-process/ferc-order-1000/rtep-proposal-windows/2024-rtep-window/'
DEAS = {
    'poted': {'entity': 'Potomac Edison Company', 'pdf': HERE / 'pjm-dea-poted-2024w1.pdf', 'url': BASE + '2024-w1-poted-regional-projects.pdf',
              'cents': 132690000, 'amount': 'in the amount of $1,326,900.00', 'projects': 'b4000.11-.13, b4000.110'},
    'atsi': {'entity': 'American Transmission Systems, Inc.', 'pdf': HERE / 'pjm-dea-atsi-2024w1.pdf', 'url': BASE + '2024-w1-dea-atsi-projects.pdf',
             'cents': 651960000, 'amount': 'in the amount of $6,519,600.00', 'projects': 'b3925.1-.4'},
}
AS_OF = '2026-10-10'
CASES = [('Potomac Edison DEA security (PJM 2024 Window 1)', ['poted']),
         ('Portfolio: Potomac Edison and ATSI DEA security (PJM 2024 Window 1)', ['poted', 'atsi'])]


def call(c, method, path, **kw):
    r = getattr(c, method)(path, **kw)
    if r.status_code != 200:
        raise SystemExit(f'{method.upper()} {path} -> {r.status_code}: {r.text}')
    return r.json()


def run(server=None, token='local-demo'):
    if server:
        import httpx
        with httpx.Client(base_url=server, headers={'Authorization': 'Bearer ' + token}, timeout=120) as c:
            call(c, 'post', '/v2/profile', json={'name': 'Public agreement use case'})
            for name, keys in CASES:
                print(name, enter(c, name, keys)['status'])
        return
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        main.DATA = Path(tmp)
        main.TOKENS = {'t': 'usecase'}
        c = TestClient(main.app, headers={'Authorization': 'Bearer t'})
        call(c, 'post', '/v2/profile', json={'name': 'Public agreement use case'})
        report = {'as_of': AS_OF, 'use_cases': [enter(c, name, keys) for name, keys in CASES]}
    (HERE / 'usecase-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    for case in report['use_cases']:
        print('\n' + case['name'])
        for line in case['answer']:
            print('  ' + line)


def enter(c, name, keys):
    project = call(c, 'post', '/v2/projects', json={'name': name, 'mw': 0})
    root = 'projects/' + project['id']
    v2 = lambda path, body: call(c, 'post', f'/v2/{root}/{path}', json=body)
    v3 = lambda path, body: call(c, 'post', f'/v3/{root}/{path}', json=body)
    review = lambda prefix, table, rec, why: call(c, 'post', f'/{prefix}/{root}/{table}/{rec["id"]}/review', json={'decision': 'VERIFIED', 'reason': why})
    docs, lcs = {}, {}
    for k in keys:
        spec = DEAS[k]
        docs[k] = call(c, 'post', f'/v2/{root}/documents', files={'file': (spec['pdf'].name, spec['pdf'].read_bytes())}, data={'source_url': spec['url']})
        lcs[k] = v2('instruments', {'label': f'{spec["entity"]} Designated Entity Letter of Credit', 'beneficiary': 'PJM Interconnection, L.L.C.',
                                    'face_cents': spec['cents'], 'evidence': ev(docs[k], spec['amount'])})
        review('v2', 'instruments', lcs[k], 'Section 3.0 amount checked against the executed agreement')
    model = v3('models', {'name': 'DEA letter of credit: draw and return rights', 'basis': 'CONTRACTUAL_CAPACITY',
                          'instrument_ids': [lcs[k]['id'] for k in keys],
                          'scope_notes': 'Executed Designated Entity Agreements only. The issued letters of credit, the PJM Operating Agreement, '
                                         'breach notices, milestone status and FERC distribution orders are not loaded.'})
    mid = model['id']
    labels = {}
    for k in keys:
        d, lc, who = docs[k], lcs[k], DEAS[k]['entity']
        facts = {
            f'{k}_default': (f'{who} in Default (Breach not cured under Section 7.3)', 'shall be in Default of this Agreement'),
            f'{k}_no_fault_termination': (f'{who} DEA terminated under Section 8.0(ii) or (iii)', 'based on (ii) or (iii) above, Transmission Provider shall not have the right to draw upon the'),
            f'{k}_security_exempt': (f'{who} Section 3.0 Transmission Owner exemption applies', 'the Designated Entity is not required to provide a letter of credit or cash security to the extent (i)'),
        }
        for key, (label, needle) in facts.items():
            labels[key] = label
            review('v3', 'facts', v3('facts', {'model_id': mid, 'key': key, 'label': label, 'evidence': ev(d, needle)}),
                   'Condition is defined in the agreement; its occurrence is not established at the as-of date')
        rules = [
            {'kind': 'ISSUANCE', 'label': 'Security required unless the Transmission Owner exemption applies', 'when': [{'key': f'{k}_security_exempt', 'value': False}],
             'evidence': ev(d, 'the Designated Entity is not required to provide a letter of credit or cash security to the extent (i)'),
             'interpretation': 'Section 3.0 requires the stated security unless the entity is a Transmission Owner and the project was selected by one of the listed routes '
                               'or in a window without a competing Nonincumbent proposal. Those selection facts are outside this agreement.'},
            {'kind': 'DRAW_CONDITION', 'label': 'PJM may draw only upon Default (Sections 7.5 and 8.1)', 'when': [{'key': f'{k}_default', 'value': True}],
             'evidence': ev(d, 'Upon Default by Designated Entity, Transmission Provider may draw') + ev(d, 'Transmission Provider may draw upon the Designated Entity Letter of Credit or retain the cash'),
             'interpretation': 'The agreement gives PJM a draw right only upon Default by the Designated Entity. Default requires a Breach that is not cured within the Section 7.3 cure period.'},
            {'kind': 'DRAW_CONDITION', 'label': 'No draw after termination because the project is no longer required or force majeure (Section 8.0)',
             'when': [{'key': f'{k}_no_fault_termination', 'value': False}],
             'evidence': ev(d, 'based on (ii) or (iii) above, Transmission Provider shall not have the right to draw upon the')
                         + ev(d, 'Entity Letter of Credit or return the cash security within thirty days of the termination of this'),
             'interpretation': 'After a Section 8.0(ii) or (iii) termination PJM has no draw right and must cancel the letter of credit within thirty days of termination. '
                               'The letter of credit remains outstanding until cancelled.'},
            {'kind': 'LIMIT', 'metric': 'DRAWABLE', 'label': 'Draw right covers the full stated security', 'amount_cents': DEAS[k]['cents'],
             'when': [{'key': f'{k}_default', 'value': True}],
             'evidence': ev(d, DEAS[k]['amount']) + ev(d, 'Upon Default by Designated Entity, Transmission Provider may draw'),
             'interpretation': 'Section 7.5 permits a draw upon the Designated Entity Letter of Credit without a partial-draw limit; Section 3.0 states its amount. '
                               'Prior draws and the issued instrument\'s own terms are not loaded.'},
        ]
        for rule in rules:
            review('v3', 'rules', v3('rules', {'model_id': mid, 'target_id': lc['id'], **rule}), 'Interpretation checked against the quoted sections')
        for label, needle in [
                ('Issued Designated Entity Letter of Credit (issuer, expiry, draw documents, amounts drawn)', 'shall provide Transmission Provider a letter of credit as acceptable to Transmission Provider'),
                ('PJM Operating Agreement Schedule 6 Section 1.5.8 (security, selection route, re-evaluation)', 'In accordance with Section 1.5.8(j) of Schedule 6 of the Operating Agreement, Designated Entity'),
                ('FERC determination distributing drawn funds (Section 3.1)', 'distribute such funds as determined by FERC')]:
            review('v3', 'document-links', v3('document-links', {'model_id': mid, 'source_document_id': d['id'], 'reference_label': f'{who}: {label}',
                                                                 'required_for_assessment': False, 'evidence': ev(d, needle)}),
                   'Referenced material governs the security but is not loaded')
        call(c, 'post', f'/v2/{root}/documents/{d["id"]}/complete', json={'reason': 'Articles 3, 7 and 8 and Schedule C read in full'})

    workspace = call(c, 'get', '/v3/' + root)
    scenario = next(s for s in workspace['scenarios'] if s['model_id'] == mid and s['view'] == 'FUTURE')
    run = v3('assessments', {'model_id': mid, 'scenario_id': scenario['id'], 'as_of': AS_OF})
    replay = call(c, 'post', f'/v3/{root}/assessments/{run["id"]}/replay')
    result, explained = run['result'], run['outcomes']
    money = lambda cents: 'unknown' if cents is None else f'${cents / 100:,.0f}'
    when = lambda req: ' and '.join(f'{labels[k]} = {"yes" if v else "no"}' for k, v in req.items()) or 'in every other state'
    answer = []
    for metric, title in [('instrument_face', 'Letter of credit outstanding'), ('drawable', 'PJM can draw')]:
        answer.append(f'{title}: up to {money(result["metrics"][metric]["maximum_cents"])}')
        for row in explained['metrics'][metric]:
            answer.append(f'  {money(row["cents"])} in {row["states"]} states: {when(row["requires"])}')
    return {
        'name': name,
        'sources': [{'entity': DEAS[k]['entity'], 'projects': DEAS[k]['projects'], 'url': DEAS[k]['url'], 'sha256': docs[k]['sha256'],
                     'pages': len(docs[k]['pages'])} for k in keys],
        'status': result['status'], 'issues': result['issues'],
        'metrics': {m: {'maximum_cents': v['maximum_cents'], 'basis': v['basis']} for m, v in result['metrics'].items()},
        'feasible_states': result['feasible_states'], 'conditions': explained['conditions'],
        'outcomes': {m: explained['metrics'][m] for m in ('instrument_face', 'drawable')},
        'findings': sorted(f['kind'] + ': ' + f['label'] for f in result['findings']),
        'replay': {k: replay[k] for k in ('snapshot_matches', 'result_matches')},
        'answer': answer,
    }


def ev(doc, needle):
    hits = [(n, text.index(needle)) for n, text in enumerate(doc['pages'], 1) if needle in text]
    if len(hits) != 1 or doc['pages'][hits[0][0] - 1].count(needle) != 1:
        raise SystemExit(f'Expected one occurrence of {needle!r} in {doc["name"]}, found {len(hits)} pages')
    page, start = hits[0]
    return [{'document_id': doc['id'], 'page': page, 'start': start, 'end': start + len(needle), 'quote': needle}]


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', help='Load into a running backend, e.g. http://127.0.0.1:8004')
    parser.add_argument('--token', default='local-demo')
    args = parser.parse_args()
    run(args.server, args.token)
