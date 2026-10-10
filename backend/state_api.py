"""Authenticated additive v3 API sharing existing workspace isolation and storage."""
import csv
import io
import json
import time
import re
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from .domain import digest
from . import evidence_match
from .v2 import Decision, stamp
from .state_types import StateModel, DatedFact, TransactionEvent, ContractRule, StateScenario, StateAssessment, StateComparison, FindingDisposition,SourceSelection,DocumentLink,OpeningBalance
from .state_engine import evaluate, VERSION
from .state_outcomes import Collector, for_run

TABLES=('state_models','state_facts','transaction_events','contract_rules','state_scenarios','state_runs','state_findings','clause_jobs','clause_proposals','document_links')
ALIASES={'models':'state_models','facts':'state_facts','events':'transaction_events','rules':'contract_rules','scenarios':'state_scenarios','document-links':'document_links','balances':'state_balances'}

def install(app,auth,db,get_project,get,rows,put,audit,evidence,create_project,data_path):
    router=APIRouter(prefix='/v3')
    def mutable(c,pid,tenant):
        p=get_project(c,pid,tenant)
        if p['archived']: raise HTTPException(409,'Reopen the project before editing or assessing')
        return p
    def model(c,pid,mid): return get(c,'state_models',pid,mid)
    def validate(c,pid,table,value):
        if table=='state_models':
            if len(set(value['instrument_ids']))!=len(value['instrument_ids']) or len(set(value['claim_ids']))!=len(value['claim_ids']):
                raise HTTPException(422,'Model references must be unique')
            for iid in value['instrument_ids']: get(c,'instruments',pid,iid)
            for cid in value['claim_ids']: get(c,'claims',pid,cid)
            return
        m=model(c,pid,value['model_id'])
        evidence(c,pid,value.get('evidence',[]))
        fs={f['key'] for f in rows(c,'state_facts',pid) if f['model_id']==m['id']}
        if table=='state_facts':
            if any(f['model_id']==m['id'] and f['key']==value['key'] and f['id']!=value['id'] for f in rows(c,'state_facts',pid)):
                raise HTTPException(422,'Fact keys must be unique within the model')
        elif table=='transaction_events':
            if value.get('instrument_id') and value['instrument_id'] not in m['instrument_ids']: raise HTTPException(422,'Instrument is not in this model')
            if value.get('fact_key') and value['fact_key'] not in fs: raise HTTPException(422,'Fact is not defined in this model')
        elif table=='contract_rules':
            refs={x['key'] for x in value['when']+value['any_of']} | set(value['member_keys']) | ({value['requires_key']} if value.get('requires_key') else set())
            if refs-fs: raise HTTPException(422,'Define these facts first: '+', '.join(sorted(refs-fs)))
            target=value.get('target_id')
            ids=m['claim_ids'] if value['kind']=='OBLIGATION' or value['kind']=='LIMIT' and value['metric']=='OBLIGATIONS' else m['instrument_ids']
            if target and target not in ids: raise HTTPException(422,'Rule target is not the required record type in this model')
            if value.get('successor_id') and (value['successor_id'] not in m['instrument_ids'] or value['successor_id']==target): raise HTTPException(422,'Choose a different successor instrument in the same model')
            if value.get('event_id') and get(c,'transaction_events',pid,value['event_id'])['model_id']!=m['id']: raise HTTPException(422,'Event is from another model')
        elif table=='state_scenarios':
            if set(value['assumptions'])-fs or {e['fact_key'] for e in value.get('events',[])}-fs: raise HTTPException(422,'Scenario assumptions reference undefined facts')
            for rid in value['excluded_rule_ids']:
                if get(c,'contract_rules',pid,rid)['model_id']!=m['id']: raise HTTPException(422,'Rule belongs to another model')
        elif table=='document_links':
            get(c,'documents',pid,value['source_document_id'])
            if value.get('target_document_id'):get(c,'documents',pid,value['target_document_id'])
        elif table=='state_balances':
            if value['instrument_id'] not in m['instrument_ids']:raise HTTPException(422,'Balance instrument must belong to this model')

    @router.get('/projects/{pid}')
    def workspace(pid:str,tenant=Depends(auth)):
        with db() as c:
            p=get_project(c,pid,tenant)
            out={'project':p,**{t:rows(c,t,pid) for t in ('sites','documents','instruments','claims','reviews')}}
            out.update({alias:rows(c,table,pid) for alias,table in ALIASES.items()})
            out['document_links']=out.pop('document-links')
            out['runs']=[{k:v for k,v in r.items() if k!='snapshot'} | {'stale':r['revision']!=p['revision'],'outcomes':for_run(r)} for r in rows(c,'state_runs',pid)]
            out['findings']=rows(c,'state_findings',pid)
            out['clause_jobs']=[j for j in rows(c,'extractions',pid) if j.get('scope')=='STATE_MODEL']; out['clause_proposals']=rows(c,'clause_proposals',pid)
            out['input_jobs']=[j for j in rows(c,'extractions',pid) if j.get('scope')!='STATE_MODEL'];out['input_proposals']=rows(c,'proposals',pid)
            return out

    @router.post('/references/{kind}')
    def reference(kind:str,tenant=Depends(auth)):
        if kind not in ('public','synthetic'):raise HTTPException(404,'Unknown reference package')
        from .state_fixtures import load_reference
        with db() as c:
            return load_reference(c,tenant,kind,create_project,put,audit,get_project,data_path)

    def registration(alias,schema):
        table=ALIASES[alias]
        def save(pid,req,tenant,key=None):
            value=json.loads(req.model_dump_json())
            with db() as c:
                mutable(c,pid,tenant)
                prior=get(c,table,pid,key) if key else None
                if prior and table!='state_models' and prior['model_id']!=value['model_id']: raise HTTPException(422,'Records cannot move between models')
                value={'id':key or str(uuid4()),**value,'verification':'UNVERIFIED'}
                validate(c,pid,table,value)
                if table=='state_models':
                    value['model_revision']=(prior or {}).get('model_revision',0)+1
                if prior and prior.get('extraction_provenance'): value['extraction_provenance']=prior['extraction_provenance']
                put(c,table,pid,value)
                if key and table in ('state_facts','transaction_events','state_models'):
                    for r in rows(c,'contract_rules',pid):
                        affected=table=='state_models' and r['model_id']==key or table=='transaction_events' and r.get('event_id')==key or table=='state_facts' and r['model_id']==value['model_id'] and any(x['key'] in {prior['key'],value['key']} for x in r['when']+r['any_of'])
                        if affected:
                            r['verification']='UNVERIFIED';put(c,'contract_rules',pid,r)
                audit(c,pid,tenant,'State '+alias+' saved',{'record_id':value['id'],'model_id':value.get('model_id'),'before':prior,'after':value})
                if table=='state_models' and not key:
                    for name,view in [('Recorded position','RECORDED'),('Possible future states','FUTURE'),('Hypothetical restructuring','HYPOTHETICAL')]:
                        sid=str(uuid4());put(c,'state_scenarios',pid,{'id':sid,**StateScenario(model_id=value['id'],name=name,view=view).model_dump()})
                return value
        def create(pid:str,req,tenant=Depends(auth)): return save(pid,req,tenant)
        def edit(pid:str,key:str,req,tenant=Depends(auth)): return save(pid,req,tenant,key)
        create.__annotations__['req']=schema;edit.__annotations__['req']=schema
        router.add_api_route('/projects/{pid}/'+alias,create,methods=['POST'])
        router.add_api_route('/projects/{pid}/'+alias+'/{key}',edit,methods=['PATCH'])
    for alias,schema in [('models',StateModel),('facts',DatedFact),('events',TransactionEvent),('rules',ContractRule),('scenarios',StateScenario),('document-links',DocumentLink),('balances',OpeningBalance)]: registration(alias,schema)

    @router.post('/projects/{pid}/source-spans')
    def locate(pid:str,req:SourceSelection,tenant=Depends(auth)):
        with db() as c:
            get_project(c,pid,tenant);d=get(c,'documents',pid,req.document_id)
            if d['superseded'] or req.page>len(d['pages']):raise HTTPException(422,'Select a current document page')
            text=d['pages'][req.page-1];found,normalized=evidence_match.spans(text,req.quote)
            if not found:
                elsewhere=[n for n,other in enumerate(d['pages'],1) if n!=req.page and evidence_match.spans(other,req.quote)[0]]
                if elsewhere:raise HTTPException(422,'Quotation is not on page %d; it occurs on page %s'%(req.page,', '.join(map(str,elsewhere[:10]))+(' and others' if len(elsewhere)>10 else '')))
                raise HTTPException(422,'Quotation does not occur on this page, even ignoring spacing, line-break hyphens and quotation-mark styles')
            matches=[{'document_id':d['id'],'page':req.page,'start':s,'end':e,'quote':text[s:e]} for s,e in found]
            return {'occurrences':matches,'requires_selection':len(matches)>1,'normalized':normalized}

    @router.post('/projects/{pid}/{table}/{key}/review')
    def review(pid:str,table:str,key:str,req:Decision,tenant=Depends(auth)):
        if table not in ('facts','events','rules','document-links','balances'): raise HTTPException(404,'Unknown reviewable type')
        actual=ALIASES[table]
        with db() as c:
            mutable(c,pid,tenant)
            profile=c.execute('SELECT name FROM profiles WHERE tenant=?',(tenant,)).fetchone()
            if not profile: raise HTTPException(422,'Save a local reviewer name first')
            value=get(c,actual,pid,key);before=json.loads(json.dumps(value))
            if req.decision=='VERIFIED':
                validate(c,pid,actual,value)
                if not value['evidence']: raise HTTPException(422,'Review requires exact source evidence')
                if table=='facts' and value['value'] is not None and not value['observed_on']: raise HTTPException(422,'Known fact values require an observation date; an unknown definition can be reviewed without inventing an occurrence')
                if table=='events' and not value['effective_on']: raise HTTPException(422,'Effective event date is missing')
                if table=='balances' and not value['observed_on']:raise HTTPException(422,'Opening balance observation date is missing')
            value['verification']=req.decision;put(c,actual,pid,value)
            # Review changes invalidate dependent interpretations too.
            if table=='events':
                for r in rows(c,'contract_rules',pid):
                    if r.get('event_id')==key and req.decision!='VERIFIED': r['verification']='UNVERIFIED';put(c,'contract_rules',pid,r)
            ev=audit(c,pid,tenant,'Contractual interpretation reviewed',{'type':table,'record_id':key,'decision':req.decision,'reason':req.reason})
            put(c,'reviews',pid,{'id':str(uuid4()),'type':actual,'record_id':key,'before':before,'after':value,'reason':req.reason,'reviewer':ev['reviewer'],'at':ev['at']})
            return value

    def snapshot(c,pid,tenant,req,sid=None):
        p=get_project(c,pid,tenant);m=model(c,pid,req.model_id)
        sc=get(c,'state_scenarios',pid,sid or req.scenario_id)
        if sc['model_id']!=m['id']: raise HTTPException(422,'Scenario belongs to another model')
        result={'schema_version':3,'project':p,'model':m,'scenario':sc,'as_of':req.as_of.isoformat(),'horizon_end':req.horizon_end.isoformat() if req.horizon_end else None}
        result.update({t:rows(c,t,pid) for t in ('documents','instruments','claims','sites')})
        for alias,table in [('facts','state_facts'),('rules','contract_rules'),('transaction_events','transaction_events'),('document_links','document_links'),('balances','state_balances')]:
            result[alias]=[x for x in rows(c,table,pid) if x['model_id']==m['id']]
        result['reviews']=[r for r in rows(c,'reviews',pid) if r['record_id'] in {x['id'] for x in result['instruments']+result['claims']+result['facts']+result['rules']+result['transaction_events']+result['document_links']+result['balances']}]
        return result

    @router.post('/projects/{pid}/assessments')
    def assess(pid:str,req:StateAssessment,tenant=Depends(auth)):
        signature=digest(json.loads(req.model_dump_json()))
        with db() as c:
            mutable(c,pid,tenant)
            if req.request_id:
                prior=next((r for r in rows(c,'state_runs',pid) if r.get('request_id')==req.request_id),None)
                if prior:
                    if prior['request_hash']!=signature: raise HTTPException(409,'Request identifier already used with another assessment')
                    return {**prior,'stale':prior['revision']!=get_project(c,pid,tenant)['revision'],'outcomes':for_run(prior)}
            frozen=snapshot(c,pid,tenant,req)
        started=time.perf_counter(); collector=Collector(); result=evaluate(frozen,observe=collector)
        run={'id':str(uuid4()),'at':stamp(),'revision':frozen['project']['revision'],'model_id':req.model_id,
             'scenario_id':req.scenario_id,'as_of':frozen['as_of'],'horizon_end':frozen['horizon_end'],
             'model_name':frozen['model']['name'],'scenario_name':frozen['scenario']['name'],'solver_version':VERSION,
             'snapshot':frozen,'snapshot_hash':digest(frozen),'result':result,'result_hash':digest(result),
             'request_id':req.request_id,'request_hash':signature,'outcomes':collector.summary() if result['status']=='COMPLETE' else None,'elapsed_ms':round((time.perf_counter()-started)*1000,3)}
        with db() as c:
            p=mutable(c,pid,tenant)
            if req.request_id:
                concurrent=next((r for r in rows(c,'state_runs',pid) if r.get('request_id')==req.request_id),None)
                if concurrent:
                    if concurrent['request_hash']!=signature: raise HTTPException(409,'Conflicting request identifier')
                    return {**concurrent,'stale':concurrent['revision']!=p['revision'],'outcomes':for_run(concurrent)}
            put(c,'state_runs',pid,run)
            if p['revision']==run['revision']:
                prior={f['key']:f for f in rows(c,'state_findings',pid) if f['model_id']==req.model_id}
                for f in result['findings']:
                    previous=prior.get(f['key'],{})
                    value={'id':previous.get('id',str(uuid4())),**f,'model_id':req.model_id,'run_id':run['id'],
                           'status':'INVESTIGATING' if previous.get('status')=='INVESTIGATING' else 'OPEN',
                           'history':previous.get('history',[])}
                    put(c,'state_findings',pid,value)
            audit(c,pid,tenant,'State assessment computed',{'run_id':run['id'],'snapshot_hash':run['snapshot_hash']},False)
            return {**run,'stale':p['revision']!=run['revision'],'outcomes':run['outcomes']}

    @router.post('/projects/{pid}/comparisons')
    def compare(pid:str,req:StateComparison,tenant=Depends(auth)):
        if len(set(req.scenario_ids))!=len(req.scenario_ids): raise HTTPException(422,'Choose different scenarios')
        with db() as c:
            # Validate the horizon through the same assessment contract.
            base_req=StateAssessment(model_id=req.model_id,scenario_id=req.scenario_ids[0],as_of=req.as_of,horizon_end=req.horizon_end)
            base=snapshot(c,pid,tenant,base_req)
            scenarios=[get(c,'state_scenarios',pid,sid) for sid in req.scenario_ids]
            if any(s['model_id']!=req.model_id for s in scenarios): raise HTTPException(422,'All scenarios must belong to the same model')
        inputs={k:v for k,v in base.items() if k!='scenario'}
        return {'project_revision':inputs['project']['revision'],'inputs':inputs,'comparisons':[
            {'scenario':sc,'snapshot_hash':digest({**inputs,'scenario':sc}),'result':evaluate({**inputs,'scenario':sc})} for sc in scenarios],
            'notice':'Preview only. No assessments, findings, or review decisions saved.'}

    @router.get('/projects/{pid}/assessments/{key}')
    def read(pid:str,key:str,tenant=Depends(auth)):
        with db() as c:
            p=get_project(c,pid,tenant);r=get(c,'state_runs',pid,key)
            return {**r,'stale':r['revision']!=p['revision'],'outcomes':for_run(r)}

    @router.post('/projects/{pid}/assessments/{key}/replay')
    def replay(pid:str,key:str,tenant=Depends(auth)):
        r=read(pid,key,tenant);result=evaluate(r['snapshot'])
        return {'snapshot_matches':digest(r['snapshot'])==r['snapshot_hash'],'result_matches':digest(result)==r['result_hash'],'result':result}

    @router.get('/projects/{pid}/assessments/{key}/export')
    def export(pid:str,key:str,format:str='json',tenant=Depends(auth)):
        r=read(pid,key,tenant)
        if format=='json': return Response(json.dumps(r,indent=2),media_type='application/json',headers={'Content-Disposition':'attachment; filename=loadbond-state-evidence.json'})
        if format!='csv': raise HTTPException(422,'Use json or csv')
        out=io.StringIO(); writer=csv.writer(out);writer.writerow(['assessment_id','metric','record_id','contribution_cents','maximum_cents','snapshot_hash'])
        for metric,value in r['result'].get('metrics',{}).items():
            for iid,amount in value.get('contributions',{}).items():writer.writerow([key,metric,iid,amount,value['maximum_cents'],r['snapshot_hash']])
        return Response(out.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename=loadbond-state-contributions.csv'})

    @router.post('/projects/{pid}/findings/{key}/disposition')
    def disposition(pid:str,key:str,req:FindingDisposition,tenant=Depends(auth)):
        with db() as c:
            mutable(c,pid,tenant)
            if not c.execute('SELECT name FROM profiles WHERE tenant=?',(tenant,)).fetchone():raise HTTPException(422,'Save reviewer identity first')
            f=get(c,'state_findings',pid,key)
            decision={**req.model_dump(),'at':stamp()};f.update(req.model_dump());f['history'].append(decision)
            put(c,'state_findings',pid,f)
            audit(c,pid,tenant,'Finding disposition recorded',{'finding_id':key,**decision},False)
            return f

    from .clause_extraction import install as install_clauses
    install_clauses(router,auth,db,get_project,get,rows,put,audit,evidence,validate,app)
    app.include_router(router)
