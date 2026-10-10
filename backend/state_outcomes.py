"""Explanation of an assessment: which reviewed conditions produce each amount.

Kept outside the hashed result, so stored results, hashes and replays are unchanged.
"""
from .state_engine import METRICS


class Collector:
    """Pass as evaluate(..., observe=Collector()) to aggregate every evaluated state."""
    def __init__(self):
        self.seen = {}
        self.groups = {m: {} for m in METRICS}

    def __call__(self, day, state, totals):
        for k, v in state.items():
            self.seen.setdefault(k, set()).add(v)
        for m in METRICS:
            cents = totals.get(m)
            group = self.groups[m].get(cents)
            if group is None:
                self.groups[m][cents] = {'cents': cents, 'states': 1, 'requires': dict(state), 'dates': {day}}
            else:
                group['states'] += 1
                group['requires'] = {k: v for k, v in group['requires'].items() if state.get(k) == v}
                group['dates'].add(day)

    def summary(self):
        varying = sorted(k for k, v in self.seen.items() if len(v) > 1)
        metrics = {}
        for m, groups in self.groups.items():
            rows = [{'cents': g['cents'], 'states': g['states'], 'requires': {k: g['requires'][k] for k in varying if k in g['requires']},
                     'dates': sorted(g['dates'])} for g in groups.values()]
            rows.sort(key=lambda r: (r['cents'] is None, -(r['cents'] or 0)))
            metrics[m] = rows
        return {'available': True, 'conditions': varying, 'metrics': metrics}


def outcomes(result):
    """Fallback for runs saved before outcomes were recorded: rebuild from the stored state samples."""
    states = result.get('states') or []
    if result.get('status') != 'COMPLETE' or not states:
        return None
    if result.get('states_truncated'):
        return {'available': False, 'reason': 'This assessment predates full outcome recording and has more than 128 states; recompute it.'}
    collector = Collector()
    for s in states:
        collector(s['as_of'], s['state'], s['totals'])
    return collector.summary()


def for_run(run):
    return run['outcomes'] if 'outcomes' in run else outcomes(run['result'])
