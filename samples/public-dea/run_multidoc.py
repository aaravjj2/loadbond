"""Run the DEA draw-and-return model on additional public 2024 Window 1 agreements.

These filings were not used to build the model. Competing-proposal facts stay unknown:
the proposal excerpt on hand names proposers only for the Potomac Edison and ATSI needs.
Agreements that print the security amount as N/A are entered with no face amount.

Run from the loadbond directory:
  .\\.venv\\Scripts\\python.exe samples/public-dea/run_multidoc.py
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
AS_OF = '2026-10-10'
DEAS = {
    'ppl': {'entity': 'PPL Electric Utilities Corporation', 'pdf': HERE / 'pjm-dea-ppl-2024w1.pdf',
            'url': BASE + '2024-w1-dea-ppl-projects.pdf', 'cents': 109890000, 'amount': 'in the amount of $1,098,900.00',
            'projects': 'b3908.1; b3909.1; b3910.1'},
    'aep': {'entity': 'Appalachian Power Company', 'pdf': HERE / 'pjm-dea-aep-apco-2024w1.pdf',
            'url': BASE + '2024-w1-dea-aep-apco-projects.pdf', 'cents': 478410000, 'amount': 'in the amount of $4,784,100.00',
            'projects': 'b4000.201-.208; b4000.210-.211; b4000.251-.252; b4000.359'},
    'bge': {'entity': 'Baltimore Gas and Electric Company', 'pdf': HERE / 'pjm-dea-bge-2024w1.pdf',
            'url': BASE + '2024-w1-dea-bge-projects.pdf', 'cents': None, 'amount': 'in the amount of N/A',
            'projects': 'b3906.1'},
    'comed': {'entity': 'Commonwealth Edison Company', 'pdf': HERE / 'pjm-dea-comed-2024w1.pdf',
              'url': BASE + '2024-w1-comed-projects.pdf', 'cents': None, 'amount': 'in the amount of N/A',
              'projects': 'b3915.1-.3; b3916.1'},
    'poted': {'entity': 'Potomac Edison Company', 'pdf': HERE / 'pjm-dea-poted-2024w1.pdf',
              'url': BASE + '2024-w1-poted-regional-projects.pdf', 'cents': 132690000, 'amount': 'in the amount of $1,326,900.00',
              'projects': 'b4000.11-.13; b4000.110'},
}


def call(c, method, path, **kw):
    r = getattr(c, method)(path, **kw)
    if r.status_code != 200:
        raise SystemExit(f'{method.upper()} {path} -> {r.status_code}: {r.text}')
    return r.json()


def ev(doc, needle):
    hits = [(n, text.index(needle)) for n, text in enumerate(doc['pages'], 1) if needle in text]
    if len(hits) != 1 or doc['pages'][hits[0][0] - 1].count(needle) != 1:
        raise SystemExit(f'Expected one occurrence of {needle!r} in {doc["name"]}, found {len(hits)} pages')
    page, start = hits[0]
    return [{'document_id': doc['id'], 'page': page, 'start': start, 'end': start + len(needle), 'quote': needle}]


def money(cents):
    return 'unknown' if cents is None else f'${cents / 100:,.0f}'


def enter_stated(c, name, keys, what_if_key=None):
    project = call(c, 'post', '/v2/projects', json={'name': name, 'mw': 0})
    root = 'projects/' + project['id']
    v3 = lambda path, body: call(c, 'post', f'/v3/{root}/{path}', json=body)
    review = lambda table, rec, why: call(c, 'post', f'/v3/{root}/{table}/{rec["id"]}/review', json={'decision': 'VERIFIED', 'reason': why})
    docs, ids = {}, []
    for key in keys:
        spec = DEAS[key]
        docs[key] = call(c, 'post', f'/v2/{root}/documents', files={'file': (spec['pdf'].name, spec['pdf'].read_bytes())}, data={'source_url': spec['url']})
        inst = call(c, 'post', f'/v2/{root}/instruments', json={
            'label': f'{spec["entity"]} Designated Entity Letter of Credit', 'beneficiary': 'PJM Interconnection, L.L.C.',
            'face_cents': spec['cents'], 'evidence': ev(docs[key], spec['amount'])})
        call(c, 'post', f'/v2/{root}/instruments/{inst["id"]}/review', json={'decision': 'VERIFIED', 'reason': 'Section 3.0 dollar amount checked on this filing'})
        ids.append(inst['id'])
    model = v3('models', {'name': 'DEA draw and return, competing proposal unknown', 'basis': 'CONTRACTUAL_CAPACITY', 'instrument_ids': ids,
                          'scope_notes': 'Additional 2024 Window 1 filings. Competing Nonincumbent proposals for these needs are not in the loaded proposal excerpt, so that condition stays open.'})
    labels = {}
    instruments = {key: iid for key, iid in zip(keys, ids)}
    for key in keys:
        who, doc, spec = DEAS[key]['entity'], docs[key], DEAS[key]
        facts = [
            (f'{key}_default', f'{who} in Default (Breach not cured under Section 7.3)', 'shall be in Default of this Agreement'),
            (f'{key}_no_fault_termination', f'{who} DEA terminated under Section 8.0(ii) or (iii)',
             'based on (ii) or (iii) above, Transmission Provider shall not have the right to draw upon the'),
            (f'{key}_transmission_owner', f'{who} is a Transmission Owner (Section 3.0 exemption)',
             'the Designated Entity is a Transmission Owner and (ii) the Project was selected'),
            (f'{key}_listed_selection_route', f'{who} selected under OA 1.5.8(g), (h) or (m)(1)',
             'Operating Agreement, Schedule 6, sections 1.5.8(g), 1.5.8(h), or 1.5.8(m)(1); or (B) through a'),
            (f'{key}_competing_nonincumbent', f'Nonincumbent competed for the {who} need',
             'which no Nonincumbent Developer submitted a competing proposal to address the need'),
        ]
        for fact_key, label, needle in facts:
            labels[fact_key] = label
            review('facts', v3('facts', {'model_id': model['id'], 'key': fact_key, 'label': label, 'evidence': ev(doc, needle)}),
                   'Defined in this filing. Not established as of the assessment date, and no proposer record for this need is loaded.')
        rules = [
            {'kind': 'ISSUANCE', 'label': f'{who}: required if not a Transmission Owner', 'when': [{'key': f'{key}_transmission_owner', 'value': False}],
             'evidence': ev(doc, 'the Designated Entity is not required to provide a letter of credit or cash security to the extent (i)'),
             'interpretation': 'Section 3.0 exempts only a Transmission Owner, and only then if another condition also holds.'},
            {'kind': 'ISSUANCE', 'label': f'{who}: required if a Nonincumbent competed',
             'when': [{'key': f'{key}_listed_selection_route', 'value': False}, {'key': f'{key}_competing_nonincumbent', 'value': True}],
             'evidence': ev(doc, 'which no Nonincumbent Developer submitted a competing proposal to address the need'),
             'interpretation': 'Route (B) fails when a Nonincumbent Developer competed. That fact is open for this need.'},
            {'kind': 'DRAW_CONDITION', 'label': f'{who}: draw only on Default', 'when': [{'key': f'{key}_default', 'value': True}],
             'evidence': ev(doc, 'Upon Default by Designated Entity, Transmission Provider may draw'),
             'interpretation': 'PJM may draw only upon Default.'},
            {'kind': 'DRAW_CONDITION', 'label': f'{who}: no draw after no-fault termination', 'when': [{'key': f'{key}_no_fault_termination', 'value': False}],
             'evidence': ev(doc, 'based on (ii) or (iii) above, Transmission Provider shall not have the right to draw upon the'),
             'interpretation': 'Section 8.0(ii) and (iii) take the draw right away.'},
            {'kind': 'LIMIT', 'metric': 'DRAWABLE', 'label': f'{who}: draw up to the stated security', 'amount_cents': spec['cents'],
             'when': [{'key': f'{key}_default', 'value': True}],
             'evidence': ev(doc, spec['amount']),
             'interpretation': 'The filing states this security amount and no smaller draw cap.'},
            {'kind': 'RELEASE', 'label': f'{who}: cancel within 30 days of termination', 'lag_days': 30,
             'when': [{'key': f'{key}_no_fault_termination', 'value': True}],
             'evidence': ev(doc, 'Entity Letter of Credit or return the cash security within thirty days of the termination of this'),
             'interpretation': 'The thirty days run from a dated termination. Without a date, the letter of credit stays outstanding.'},
        ]
        for rule in rules:
            review('rules', v3('rules', {'model_id': model['id'], 'target_id': instruments[key], **rule}), 'Quotation checked on this filing')
        for label, needle in [
                ('Issued letter of credit', 'shall provide Transmission Provider a letter of credit as acceptable to Transmission Provider'),
                ('Operating Agreement Schedule 6 section 1.5.8', 'In accordance with Section 1.5.8(j) of Schedule 6 of the Operating Agreement, Designated Entity'),
                ('FERC distribution of drawn funds', 'distribute such funds as determined by FERC')]:
            review('document-links', v3('document-links', {'model_id': model['id'], 'source_document_id': doc['id'],
                                                           'reference_label': f'{who}: {label}', 'required_for_assessment': False,
                                                           'evidence': ev(doc, needle)}), 'Named in the filing and not loaded')
        call(c, 'post', f'/v2/{root}/documents/{doc["id"]}/complete', json={'reason': 'Security, default, and termination clauses read on this filing'})
    workspace = call(c, 'get', '/v3/' + root)
    scenario = next(s for s in workspace['scenarios'] if s['model_id'] == model['id'] and s['view'] == 'FUTURE')
    run = v3('assessments', {'model_id': model['id'], 'scenario_id': scenario['id'], 'as_of': AS_OF})
    replay = call(c, 'post', f'/v3/{root}/assessments/{run["id"]}/replay')
    timeline = None
    if what_if_key:
        what_if = v3('scenarios', {'model_id': model['id'], 'name': 'PJM terminates under Section 8.0(ii), effective 2027-03-01', 'view': 'HYPOTHETICAL',
                                   'events': [{'label': 'Termination effective', 'fact_key': f'{what_if_key}_no_fault_termination',
                                               'fact_value': True, 'effective_on': '2027-03-01'}]})
        timed = v3('assessments', {'model_id': model['id'], 'scenario_id': what_if['id'], 'as_of': AS_OF, 'horizon_end': '2027-06-01'})
        assert call(c, 'post', f'/v3/{root}/assessments/{timed["id"]}/replay')['result_matches']
        timeline = {'status': timed['result']['status'],
                    'envelope': [{'as_of': row['as_of'], 'instrument_face': row['maxima']['instrument_face'], 'drawable': row['maxima']['drawable']}
                                 for row in timed['result']['envelope']]}
    return pack(name, keys, docs, run, replay, labels, timeline)


def enter_unstated(c, key):
    spec = DEAS[key]
    project = call(c, 'post', '/v2/projects', json={'name': f'{spec["entity"]} DEA, security printed as N/A', 'mw': 0})
    root = 'projects/' + project['id']
    doc = call(c, 'post', f'/v2/{root}/documents', files={'file': (spec['pdf'].name, spec['pdf'].read_bytes())}, data={'source_url': spec['url']})
    inst = call(c, 'post', f'/v2/{root}/instruments', json={
        'label': f'{spec["entity"]} Designated Entity Letter of Credit', 'beneficiary': 'PJM Interconnection, L.L.C.',
        'evidence': ev(doc, spec['amount'])})
    blocked = c.post(f'/v2/{root}/instruments/{inst["id"]}/review', json={'decision': 'VERIFIED', 'reason': 'Amount is printed as N/A'})
    call(c, 'post', f'/v2/{root}/documents/{doc["id"]}/complete', json={'reason': 'Section 3.0 prints the security amount as N/A; no dollar figure is stated'})
    model = call(c, 'post', f'/v3/{root}/models', json={'name': 'Unstated DEA security', 'basis': 'CONTRACTUAL_CAPACITY', 'instrument_ids': [inst['id']],
                                                       'scope_notes': 'The executed agreement prints the security amount as N/A. No dollar face was entered.'})
    workspace = call(c, 'get', '/v3/' + root)
    scenario = next(s for s in workspace['scenarios'] if s['model_id'] == model['id'] and s['view'] == 'FUTURE')
    run = call(c, 'post', f'/v3/{root}/assessments', json={'model_id': model['id'], 'scenario_id': scenario['id'], 'as_of': AS_OF})
    return {
        'name': project['name'], 'entity': spec['entity'], 'projects': spec['projects'], 'url': spec['url'], 'sha256': doc['sha256'],
        'pages': len(doc['pages']), 'quote': spec['amount'], 'face_cents_entered': inst['face_cents'],
        'review_status': blocked.status_code, 'review_detail': blocked.json().get('detail'),
        'status': run['result']['status'], 'issues': run['result']['issues'],
    }


def pack(name, keys, docs, run, replay, labels, timeline):
    result, explained = run['result'], run['outcomes']
    when = lambda req: ' and '.join(f'{labels[k]} = {"yes" if v else "no"}' for k, v in req.items()) or 'no condition is common to every such state'
    answer = []
    if explained:
        for metric, title in [('instrument_face', 'Letter of credit outstanding'), ('drawable', 'PJM can draw')]:
            answer.append(f'{title}: up to {money(result["metrics"][metric]["maximum_cents"])}')
            for row in explained['metrics'][metric]:
                answer.append(f'  {money(row["cents"])} in {row["states"]} states: {when(row["requires"])}')
    return {
        'name': name,
        'sources': [{'entity': DEAS[k]['entity'], 'projects': DEAS[k]['projects'], 'url': DEAS[k]['url'],
                     'sha256': docs[k]['sha256'], 'pages': len(docs[k]['pages']), 'security_cents': DEAS[k]['cents']} for k in keys],
        'status': result['status'], 'issues': result['issues'], 'elapsed_ms': run['elapsed_ms'],
        'feasible_states': result.get('feasible_states'), 'dimensions': len(result.get('dimensions') or []),
        'states_truncated': result.get('states_truncated'),
        'metrics': {m: {'maximum_cents': v.get('maximum_cents'), 'basis': v.get('basis')} for m, v in result.get('metrics', {}).items()},
        'outcomes': None if not explained else {m: explained['metrics'][m] for m in ('instrument_face', 'drawable')},
        'replay': {k: replay[k] for k in ('snapshot_matches', 'result_matches')},
        'termination_what_if': timeline,
        'answer': answer,
    }


def check(report):
    stated = {row['name']: row for row in report['stated']}
    ppl, aep = stated['PPL Electric Utilities DEA'], stated['Appalachian Power DEA']
    both = stated['Portfolio: PPL and Appalachian Power']
    assert ppl['status'] == 'COMPLETE' and ppl['replay'] == {'snapshot_matches': True, 'result_matches': True}
    assert ppl['feasible_states'] == 32 and ppl['dimensions'] == 5 and ppl['states_truncated'] is False
    assert ppl['metrics']['instrument_face']['maximum_cents'] == 109890000
    assert ppl['metrics']['drawable']['maximum_cents'] == 109890000
    assert sum(row['states'] for row in ppl['outcomes']['drawable']) == 32
    env = {row['as_of']: row for row in ppl['termination_what_if']['envelope']}
    assert env['2026-10-10'] == {'as_of': '2026-10-10', 'instrument_face': 109890000, 'drawable': 109890000}
    assert env['2027-03-01']['drawable'] == 0 and env['2027-03-01']['instrument_face'] == 109890000
    assert env['2027-03-31'] == {'as_of': '2027-03-31', 'instrument_face': 0, 'drawable': 0}
    assert aep['feasible_states'] == 32 and aep['metrics']['drawable']['maximum_cents'] == 478410000
    assert both['status'] == 'COMPLETE' and both['feasible_states'] == 1024 and both['dimensions'] == 10
    assert both['states_truncated'] is True
    assert both['metrics']['instrument_face']['maximum_cents'] == 109890000 + 478410000
    assert both['metrics']['drawable']['maximum_cents'] == 109890000 + 478410000
    assert sum(row['states'] for row in both['outcomes']['instrument_face']) == 1024
    assert sum(row['states'] for row in both['outcomes']['drawable']) == 1024
    assert both['replay']['result_matches'] is True
    over = report['over_dimension_limit']
    assert over['status'] == 'UNSUPPORTED'
    assert over['issues'] == ['More than 12 independent dimensions; split the model']
    for row in report['unstated']:
        assert row['face_cents_entered'] is None
        assert row['review_status'] == 422 and 'missing' in row['review_detail'].lower()
        assert row['status'] == 'INCOMPLETE'
        assert any('Missing instrument face' in issue for issue in row['issues'])


def run(server=None, token='local-demo'):
    def build(c):
        call(c, 'post', '/v2/profile', json={'name': 'Multi-document DEA check'})
        stated = [
            enter_stated(c, 'PPL Electric Utilities DEA', ['ppl'], what_if_key='ppl'),
            enter_stated(c, 'Appalachian Power DEA', ['aep']),
            enter_stated(c, 'Portfolio: PPL and Appalachian Power', ['ppl', 'aep']),
        ]
        over = enter_stated(c, 'Three DEAs past the condition limit', ['ppl', 'aep', 'poted'])
        unstated = [enter_unstated(c, key) for key in ('bge', 'comed')]
        report = {'as_of': AS_OF, 'stated': stated, 'over_dimension_limit': {
            'name': over['name'], 'status': over['status'], 'issues': over['issues'],
            'sources': over['sources'], 'elapsed_ms': over['elapsed_ms']}, 'unstated': unstated}
        check(report)
        return report

    if server:
        import httpx
        with httpx.Client(base_url=server, headers={'Authorization': 'Bearer ' + token}, timeout=180) as c:
            report = build(c)
        print('loaded', server)
        return report
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        main.DATA = Path(tmp)
        main.TOKENS = {'t': 'multidoc'}
        c = TestClient(main.app, headers={'Authorization': 'Bearer t'})
        report = build(c)
    out = HERE / 'multidoc-result.json'
    out.write_text(json.dumps(report, indent=2), encoding='utf-8')
    for case in report['stated']:
        print('\n' + case['name'], case['status'], f"{case['feasible_states']} states", f"{case['elapsed_ms']} ms")
        for line in case['answer']:
            print('  ' + line)
        if case['termination_what_if']:
            print('  what-if', case['termination_what_if']['envelope'])
    print('\n' + report['over_dimension_limit']['name'], report['over_dimension_limit']['status'], report['over_dimension_limit']['issues'])
    for row in report['unstated']:
        print(row['entity'], row['status'], row['review_status'], row['issues'])
    print('wrote', out.name)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--server')
    parser.add_argument('--token', default='local-demo')
    args = parser.parse_args()
    run(args.server, args.token)
