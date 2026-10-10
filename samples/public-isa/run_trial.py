"""Enter a real, publicly filed interconnection agreement through the product API.

Source: PJM Service Agreement No. 4704 (Chestnut Solar, LLC / VEPCO / PJM), downloaded from
pjm.com. Runs against a throwaway data folder; writes trial-result.json next to this file.
Run from the loadbond directory: .\\.venv\\Scripts\\python.exe samples/public-isa/run_trial.py
"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from fastapi.testclient import TestClient  # noqa: E402
from backend import main  # noqa: E402

SOURCE_URL = 'https://www.pjm.com/pjmfiles/pub/planning/project-queues/isa/aa2_165_isa.pdf'
PDF = HERE / 'pjm-sa4704-chestnut-solar-isa.pdf'


def call(c, method, path, **kw):
    r = getattr(c, method)(path, **kw)
    if r.status_code != 200:
        raise SystemExit(f'{method.upper()} {path} -> {r.status_code}: {r.text}')
    return r.json()


def run(server=None, token='local-demo'):
    if server:
        import httpx
        with httpx.Client(base_url=server, headers={'Authorization': 'Bearer ' + token}, timeout=120) as c:
            enter(c)
        return
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        main.DATA = Path(tmp)
        main.TOKENS = {'t': 'trial'}
        enter(TestClient(main.app, headers={'Authorization': 'Bearer t'}), HERE / 'trial-result.json')


def enter(c, report_path=None):
    v2 = lambda path, body: call(c, 'post', '/v2/' + path, json=body)
    call(c, 'post', '/v2/profile', json={'name': 'Public agreement trial'})
    project = v2('projects', {'name': 'Chestnut Solar ISA (PJM SA No. 4704) - public trial', 'mw': 74.9})
    root = 'projects/' + project['id']
    v3 = lambda path, body: call(c, 'post', '/v3/' + root + '/' + path, json=body)
    doc = call(c, 'post', '/v2/' + root + '/documents', files={'file': (PDF.name, PDF.read_bytes())}, data={'source_url': SOURCE_URL})

    def ev(needle):
        hits = [(n, text.index(needle)) for n, text in enumerate(doc['pages'], 1) if needle in text]
        if len(hits) != 1:
            raise SystemExit(f'Expected one occurrence of {needle!r}, found {len(hits)}')
        page, start = hits[0]
        return [{'document_id': doc['id'], 'page': page, 'start': start, 'end': start + len(needle), 'quote': needle}]

    def review(prefix, table, record, reason):
        call(c, 'post', f'/{prefix}/{root}/{table}/{record["id"]}/review', json={'decision': 'VERIFIED', 'reason': reason})

    lc = v2(root + '/instruments', {'label': 'ISA Security (letter of credit)', 'beneficiary': 'PJM Interconnection, L.L.C. (for the benefit of VEPCO)',
                                    'face_cents': 211114900, 'evidence': ev('in the amount of  $2,111,149')})
    review('v2', 'instruments', lc, 'Section 5.0 face amount checked against the filed agreement')
    claims = []
    for label, cents, needle in [('Attachment Facilities Charge (estimate)', 51951100, '4.1 Attachment Facilities Charge: $519,511'),
                                 ('Network Upgrades Charge (estimate)', 664133200, '4.2 Network Upgrades Charge: $6,641,332')]:
        claim = v2(root + '/claims', {'label': label, 'amount_cents': cents, 'kind': 'fixed', 'instrument_id': lc['id'],
                                      'mapping': 'ADDITIVE', 'legal_status': 'REVIEWED_MODEL_INPUT', 'evidence': ev(needle)})
        review('v2', 'claims', claim, 'Specifications charge checked; estimate subject to final true-up')
        claims.append(claim)

    model = v3('models', {'name': 'ISA security and cost responsibility', 'basis': 'CONTRACTUAL_CAPACITY',
                          'instrument_ids': [lc['id']], 'claim_ids': [c_['id'] for c_ in claims],
                          'scope_notes': 'Public filed ISA only. The PJM Tariff, the Interconnection Construction Service Agreement, issued LC terms and PJM notices are not loaded.'})
    unmodeled = {
        'upgrade_work_completed': ('Upgrade work completed (security reduction trigger)', 'shall be reduced as portions of the work on required Local Upgrades'),
        'safe_harbor_documentation_provided': ('Tax safe-harbor documentation provided', 'required under Section 24.1 prior to execution of the Interconnection Service Agreement'),
        'customer_terminated': ('Customer terminated on 60 days notice', 'Interconnection Customer may unilaterally terminate the Interconnection Service Agreement'),
        'scope_change_increases_cost': ('Scope change increases cost responsibility', 'shall be increased or decreased as required to'),
    }
    for key, (label, needle) in unmodeled.items():
        review('v3', 'facts', v3('facts', {'model_id': model['id'], 'key': key, 'label': label, 'evidence': ev(needle)}),
               'Condition exists in the agreement; occurrence unknown at the as-of date')
    for label, key, value, needle in [
            ('Tax gross-up additional Security', 'safe_harbor_documentation_provided', False, 'The required additional Security shall be in an amount equal to the amount necessary to gross up'),
            ('Security increase after scope change', 'scope_change_increases_cost', True, 'shall be increased or decreased as required to')]:
        rule = v3('rules', {'model_id': model['id'], 'kind': 'STEP_UP', 'label': label, 'target_id': lc['id'], 'percent': None,
                            'when': [{'key': key, 'value': value}], 'evidence': ev(needle),
                            'interpretation': 'The agreement requires more Security in this condition but states no amount or percentage.'})
        review('v3', 'rules', rule, 'Increase is explicit; its size is not stated in the agreement')
    references = [
        ('PJM Tariff Section 212.4 - form of security, draw and return terms', 'In accord with Section 212.4 of the Tariff'),
        ('PJM notice of additional tax gross-up Security amount (Appendix 2 Section 24.4)', 'writing of the amount of additional Security'),
        ('Final cost accounting after construction (Appendix 2 Section 11.2.3)', 'Within 120 days after the Interconnected Transmission Owner completes construction'),
    ]
    for label, needle in references:
        review('v3', 'document-links', v3('document-links', {'model_id': model['id'], 'source_document_id': doc['id'], 'reference_label': label,
                                                             'required_for_assessment': False, 'evidence': ev(needle)}),
               'Referenced material governs security but is not loaded')
    call(c, 'post', f'/v2/{root}/documents/{doc["id"]}/complete', json={'reason': 'Security, cost and termination provisions entered; page 20 has no extractable text'})

    workspace = call(c, 'get', '/v3/' + root)
    scenario = next(s for s in workspace['scenarios'] if s['model_id'] == model['id'] and s['view'] == 'FUTURE')
    run = v3('assessments', {'model_id': model['id'], 'scenario_id': scenario['id'], 'as_of': '2017-05-03', 'horizon_end': '2018-12-31'})
    replay = call(c, 'post', f'/v3/{root}/assessments/{run["id"]}/replay')
    result = run['result']
    report = {
        'source': {'url': SOURCE_URL, 'sha256': doc['sha256'], 'pages': len(doc['pages']), 'characters': sum(map(len, doc['pages'])),
                   'textless_pages': doc['textless_pages']},
        'status': result['status'], 'issues': result['issues'],
        'metrics': {m: {'maximum_cents': v['maximum_cents'], 'basis': v['basis']} for m, v in result.get('metrics', {}).items()},
        'dimensions': result.get('dimensions'), 'feasible_states': result.get('feasible_states'),
        'findings': sorted(f['kind'] + ': ' + f['label'] for f in result['findings']),
        'replay': {k: replay[k] for k in ('snapshot_matches', 'result_matches')},
    }
    if report_path:
        report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', help='Load into a running backend, e.g. http://127.0.0.1:8004')
    parser.add_argument('--token', default='local-demo')
    args = parser.parse_args()
    run(args.server, args.token)
