"""Explicit live local-model evaluation: python -m backend.evaluate_local."""
import io
import json
import time
from collections import Counter
from pathlib import Path
from pypdf import PdfReader
from . import local_extraction as ai

ROOT = Path(__file__).resolve().parents[1]

def main():
    corpus=json.loads((ROOT/'samples/extraction-corpus/labels.json').read_text(encoding='utf-8'))
    ready=ai.runtime_status()
    if not ready['ready']:
        raise SystemExit(ready['message'])
    report={'model':ready['model'],'model_digest':ready['digest'],'prompt_version':ai.PROMPT_VERSION,
            'schema_version':ai.SCHEMA_VERSION,'started_at':ai.stamp(),'notice':'Synthetic software evaluation; not legal or customer validation.','cases':[]}
    total_expected=total_proposed=total_matched=0
    for case in corpus:
        raw=(ROOT/'samples/extraction-corpus'/case['file']).read_bytes()
        pages=[p.extract_text() for p in PdfReader(io.BytesIO(raw)).pages] if case['file'].endswith('.pdf') else [raw.decode('utf-8')]
        document={'id':case['id'],'pages':pages}
        start=time.monotonic();record={'id':case['id'],'expected':case['expected'],'scored_usd':case['scored_usd']}
        proposals=[];invalid=[];screened=[];seen=set()
        try:
            for page,offset,text in ai.chunks(pages):
                for candidate in ai.extract_chunk(text,ready['model']):
                    value,error=ai.validate_candidate(candidate,document,page,offset,text)
                    if error:invalid.append(error);continue
                    reason=ai.screen_reason(value)
                    if reason:screened.append({'quote':value['quote'],'reason':reason});continue
                    signature=(value['record_type'],page,value['quote'],value['amount_cents'])
                    if signature not in seen:proposals.append(value);seen.add(signature)
            # Match record type, exact amount/currency, and distinct supporting components (via expected quote).
            matched=[];remaining=list(proposals)
            for expected in case['expected']:
                index=next((i for i,p in enumerate(remaining) if p['record_type']==expected['record_type'] and p['amount_cents']==expected['amount_cents'] and p['currency']==expected['currency'] and expected.get('source_contains','') in p['quote']),None)
                if index is not None:matched.append(remaining.pop(index))
            record.update(status='FAILED_SOURCE' if invalid else 'SUCCEEDED',proposals=proposals,invalid_quotes=invalid,screened=screened,
                          matched=len(matched),case_passed=not invalid and len(matched)==len(case['expected']) and len(proposals)==len(case['expected']))
            if case['scored_usd']:
                total_expected+=len(case['expected']);total_proposed+=len(proposals)+len(invalid);total_matched+=len(matched) if not invalid else 0
        except Exception as exc:
            record.update(status='FAILED',error=str(exc),case_passed=False)
            if case['scored_usd']:total_expected+=len(case['expected'])
        record['elapsed_seconds']=round(time.monotonic()-start,3)
        with ai.client(3) as c:
            record['resident_models']=c.get('/api/ps').json().get('models',[])
        report['cases'].append(record)
        print(f"{case['id']}: {record['status']} pass={record['case_passed']} {record['elapsed_seconds']}s",flush=True)
        (ROOT/'docs/local-extraction-evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    precision=total_matched/total_proposed if total_proposed else 0
    recall=total_matched/total_expected if total_expected else 0
    report.update(finished_at=ai.stamp(),clear_usd_precision=precision,clear_usd_recall=recall,
                  expected_clear_usd=total_expected,proposed_clear_usd=total_proposed,matched_clear_usd=total_matched,
                  passed_cases=sum(c['case_passed'] for c in report['cases']),
                  release_gate_passed=precision>=.9 and recall>=.9 and all(c['case_passed'] for c in report['cases']))
    (ROOT/'docs/local-extraction-evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},indent=2))

if __name__=='__main__':main()
