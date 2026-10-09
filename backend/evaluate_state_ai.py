"""Live local-only evaluation, financial proposals and clauses scored separately."""
import argparse
import json
import time
from pathlib import Path
from . import local_extraction as ai
from . import clause_extraction as clauses
from .domain import digest

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--split',choices=['development','held_out','all'],default='all');args=parser.parse_args()
    root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'samples/state-corpus/manifest.json').read_text(encoding='utf-8'))
    status=ai.runtime_status()
    if not status['ready']:raise SystemExit(status['message'])
    report={'model':status['model'],'model_digest':status['digest'],'prompt_version':clauses.PROMPT_VERSION,'schema_version':clauses.SCHEMA_VERSION,
            'financial_prompt_version':ai.PROMPT_VERSION,'corpus_hash':manifest['corpus_hash'],'split':args.split,'started_at':ai.stamp(),
            'notice':'Measured synthetic evaluation, not independent legal or customer validation. Missing gates retain experimental status.','cases':[]}
    totals={kind:{'expected':0,'proposed':0,'matched':0,'empty_cases':0,'empty_passed':0} for kind in ('clauses','financial')}
    out=root/'docs/state-engine'/('local-ai-'+args.split+'-evaluation.json');out.parent.mkdir(exist_ok=True)
    for case in manifest['cases']:
        if args.split!='all' and case['split']!=args.split:continue
        text=(root/'samples/state-corpus'/case['file']).read_text(encoding='utf-8')
        if digest(text)!=case['text_hash']:raise SystemExit('Corpus changed after labels were frozen')
        row={'id':case['id'],'split':case['split']};doc={'id':case['id'],'pages':[text]}
        for task,module,expected in [('clauses',clauses,case['expected']),('financial',ai,case['financial_expected'])]:
            started=time.monotonic();proposals=[];invalid=[];failure=None
            try:
                for candidate in module.extract_chunk(text,status['model']):
                    p,problem=module.validate_candidate(candidate,doc,1,0,text)
                    if problem:invalid.append(problem)
                    else:proposals.append(p)
            except Exception as exc:failure=str(exc)
            remain=list(proposals);matched=0
            for e in expected:
                def match(p):
                    if e['source_contains'] not in p['quote']:return False
                    if task=='clauses':return p['category']==e['category'] and (p.get('rule_kind') or p.get('event_type'))==e['kind']
                    return all(p[k]==e[k] for k in ('record_type','amount_cents','currency'))
                index=next((n for n,p in enumerate(remain) if match(p)),None)
                if index is not None:matched+=1;remain.pop(index)
            # Atomic job behavior: invalid output publishes nothing, so validated siblings do not count as matches.
            if invalid or failure:matched=0
            t=totals[task];t['expected']+=len(expected);t['proposed']+=len(proposals)+len(invalid);t['matched']+=matched
            if not expected:t['empty_cases']+=1;t['empty_passed']+=int(not proposals and not invalid and not failure)
            row[task]={'expected':expected,'proposals':proposals,'validation_issues':invalid,'error':failure,'matched':matched,'elapsed_seconds':round(time.monotonic()-started,3),
                       'passed':not invalid and not failure and matched==len(expected) and len(proposals)==len(expected)}
        if ai.runtime_status().get('digest')!=status['digest']:raise SystemExit('Model changed during evaluation')
        with ai.client(3) as c:row['resident_models']=c.get('/api/ps').json().get('models',[])
        report['cases'].append(row);out.write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(f"{case['id']}: clauses={row['clauses']['passed']} financial={row['financial']['passed']}",flush=True)
    scores={}
    for task,t in totals.items():
        precision=t['matched']/t['proposed'] if t['proposed'] else 0;recall=t['matched']/t['expected'] if t['expected'] else 0
        scores[task]={**t,'precision':precision,'recall':recall,'gate_passed':precision>=.95 and recall>=.9 and t['empty_passed']==t['empty_cases']}
    report.update(finished_at=ai.stamp(),scores=scores,release_gate_passed=all(t['gate_passed'] for t in scores.values()))
    out.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(scores,indent=2))
if __name__=='__main__':main()
