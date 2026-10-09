import hashlib
import json
from itertools import product
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


class Proposal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    label: str
    amount_cents: int | None = Field(ge=0)
    kind: Literal['fixed', 'conditional']
    quote: str
    page: int = Field(ge=1)


class Extraction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    claims: list[Proposal]


def solve(snapshot):
    """Exact maximum over the explicitly modeled binary claim states, USD cents."""
    pending = [d['id'] for d in snapshot['documents'] if not d['superseded'] and d['processing'] == 'UPLOADED']
    if pending:
        return {'status': 'INCOMPLETE', 'unresolved_documents': pending, 'maximum_cents': None}
    claims = sorted([c for c in snapshot['claims'] if c['verification'] != 'REJECTED'], key=lambda c: c['id'])
    unresolved = [c['id'] for c in claims if c['verification'] != 'VERIFIED' or c['amount_cents'] is None]
    if unresolved:
        return {'status': 'INCOMPLETE', 'unresolved_claims': unresolved, 'maximum_cents': None}
    instruments = {i['id']: i for i in snapshot['instruments']}
    if any(c['instrument_id'] not in instruments for c in claims):
        raise ValueError('A claim references a missing instrument')
    # A terminal state only removes exposure when separately supported by verified evidence.
    claims = [c for c in claims if not (instruments[c['instrument_id']].get('release_verified') and instruments[c['instrument_id']]['lifecycle'] in ['RELEASED', 'EXPIRED', 'CANCELLED'])]
    variables = [c for c in claims if c['kind'] == 'conditional']
    if len(variables) > 20:
        raise ValueError('Demo limit: 20 conditional dimensions. Split the assessment.')
    scenario = snapshot['scenario']
    step = 125 if scenario == 'downgrade' else 100
    deps = [d for d in snapshot['dependencies'] if d['verification'] == 'VERIFIED' and scenario != 'independent']

    def amounts(active):
        by_instrument = {}
        for c in active:
            value = c['amount_cents'] * (step if c['kind'] == 'conditional' else 100) // 100
            by_instrument[c['instrument_id']] = by_instrument.get(c['instrument_id'], 0) + value
        # For the synthetic downgrade scenario, collateral ceilings also step up.
        return {key: min(value, instruments[key]['face_cents'] * step // 100) for key, value in by_instrument.items()}

    gross = sum(amounts(claims).values())
    best, best_ids, trace, feasible = -1, [], {}, 0
    for bits in product((0, 1), repeat=len(variables)):
        ids = {c['id'] for c in claims if c['kind'] == 'fixed'} | {c['id'] for c, on in zip(variables, bits) if on}
        if any(len(ids.intersection(d['claim_ids'])) > (3 if scenario == 'release_lag' and d.get('demo_cap') else d['max_active']) for d in deps):
            continue
        feasible += 1
        exposure = amounts([c for c in claims if c['id'] in ids])
        value = sum(exposure.values())
        if value > best:
            best, best_ids, trace = value, sorted(ids), exposure
    if best < 0:
        raise ValueError('No feasible state; review contradictory constraints')
    return {'status': 'COMPLETE', 'maximum_cents': best, 'gross_cents': gross,
            'modeled_difference_cents': gross - best, 'active_claims': best_ids,
            'instrument_contributions': trace, 'applied_dependencies': [d['id'] for d in deps],
            'feasible_states': feasible, 'solver_version': 'enumeration-1.0',
            'metrics': {'beneficiary_face_cents': sum(i['face_cents'] for i in instruments.values()),
                        'maximum_drawable_cents': best, 'bank_facility_usage_cents': None,
                        'restricted_cash_cents': None, 'parent_guarantee_cents': None, 'surety_indemnity_cents': None},
            'notice': 'Synthetic scenario. Modeled difference is not confirmed cash or bank capacity released.'}


def seed():
    documents, claims, instruments, sites = [], [], [], []
    for index, (name, fixed, conditional) in enumerate([('North Ridge', 1800000, 18200000), ('Cedar Valley', 4000000, 16000000), ('River Bend', 5200000, 14800000), ('Mesa Creek', 7000000, 13000000)]):
        site, doc, instrument = f'site-{index+1}', f'doc-{index+1}', f'lc-{index+1}'
        text = f'SYNTHETIC / NOT EXECUTED\n{name} security agreement\nSection 1: Incurred, non-cancellable obligation: ${fixed:,}.\nSection 2: Conditional future-service obligation: ${conditional:,}.\nSection 3: Instrument ceiling: $20,000,000. Withdrawal alone does not release the instrument.'
        documents.append({'id': doc, 'agreement_id': doc, 'version': 1, 'name': name + '.txt', 'pages': [text], 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'superseded': False, 'processing': 'REVIEWED', 'source': 'synthetic'})
        sites.append({'id': site, 'name': name, 'commercial_status': 'FINALIST'})
        instruments.append({'id': instrument, 'site_id': site, 'face_cents': 2000000000, 'currency': 'USD', 'lifecycle': 'EFFECTIVE', 'release_verified': False})
        for kind, dollars, section in [('fixed', fixed, 1), ('conditional', conditional, 2)]:
            quote = text.splitlines()[section+1]
            claims.append({'id': f'{site}-{kind}', 'label': f'{name} / {kind}', 'site_id': site, 'instrument_id': instrument,
                           'document_id': doc, 'amount_cents': dollars*100, 'currency': 'USD', 'kind': kind, 'legal_status': 'CALLABLE',
                           'verification': 'VERIFIED', 'source': {'page': 1, 'quote': quote, 'start': text.index(quote), 'end': text.index(quote)+len(quote), 'sha256': hashlib.sha256(quote.encode()).hexdigest()},
                           'extraction': {'mode': 'curated synthetic fixture', 'model': None}})
    quote = 'For this hypothetical restructuring only, no more than two conditional future-service branches may coexist. This clause is synthetic and not an executed agreement.'
    documents.append({'id': 'doc-cap', 'agreement_id': 'doc-cap', 'version': 1, 'name': 'Hypothetical cap.txt', 'pages': [quote], 'sha256': hashlib.sha256(quote.encode()).hexdigest(), 'superseded': False, 'processing': 'REVIEWED', 'source': 'synthetic'})
    return {'project': {'id': 'LB-001', 'name': 'North Ridge portfolio', 'mw': 300, 'currency': 'USD', 'synthetic': True}, 'sites': sites,
            'documents': documents, 'claims': claims, 'instruments': instruments,
            'dependencies': [{'id': 'dep-cap', 'label': 'Hypothetical two-branch cap', 'claim_ids': [c['id'] for c in claims if c['kind'] == 'conditional'], 'max_active': 2, 'verification': 'UNVERIFIED', 'document_id': 'doc-cap', 'quote': quote, 'demo_cap': True}],
            'reviews': [], 'runs': [], 'audit': [], 'revision': 0}
