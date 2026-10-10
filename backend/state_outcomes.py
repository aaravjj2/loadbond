"""Read-time explanation of an assessment: which reviewed conditions produce each amount.

Derived from the enumerated states already stored in the result, so stored results,
hashes and replays are unchanged.
"""
from .state_engine import METRICS


def outcomes(result):
    states = result.get('states') or []
    if result.get('status') != 'COMPLETE' or not states:
        return None
    if result.get('states_truncated'):
        return {'available': False, 'reason': 'More than 128 states; split the model to explain each amount.'}
    keys = sorted({k for s in states for k in s['state']})
    varying = [k for k in keys if len({s['state'].get(k) for s in states}) > 1]
    explained = {}
    for metric in METRICS:
        groups = {}
        for s in states:
            groups.setdefault(s['totals'].get(metric), []).append(s)
        rows = []
        for cents, members in groups.items():
            requires = {k: members[0]['state'].get(k) for k in varying if len({m['state'].get(k) for m in members}) == 1}
            rows.append({'cents': cents, 'states': len(members), 'requires': requires,
                         'dates': sorted({m['as_of'] for m in members})})
        rows.sort(key=lambda r: (r['cents'] is None, -(r['cents'] or 0)))
        explained[metric] = rows
    return {'available': True, 'conditions': varying, 'metrics': explained}
