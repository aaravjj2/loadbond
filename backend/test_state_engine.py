import copy
from .test_v2 import client, setup, post
from .domain import digest

def p(c,root,path,body):
    r=c.post('/v3/'+root+'/'+path,json=body);assert r.status_code==200,r.text;return r.json()

def make(c):
    root,doc,i,body,claims,dep,sc,ev=setup(c)
    m=p(c,root,'models',{'name':'Unfamiliar branch contract','instrument_ids':[i['id']],'claim_ids':[x['id'] for x in claims]})
    w=c.get('/v3/'+root).json(); scenario=next(s for s in w['scenarios'] if s['view']=='FUTURE')
    for key,line in [('branch_a',2),('branch_b',3)]:
        p(c,root,'facts',{'model_id':m['id'],'key':key,'label':key,'evidence':[ev(doc['pages'][0].splitlines()[line])]})
    for key,cl in zip(['branch_a','branch_b'],claims[1:]):
        rule=p(c,root,'rules',{'model_id':m['id'],'label':key+' activation','interpretation':'Payment component is active when this branch is active.','kind':'OBLIGATION','target_id':cl['id'],'when':[{'key':key,'value':True}],'evidence':cl['evidence']})
        p(c,root,'rules/'+rule['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic mapping reviewed'})
    req={'model_id':m['id'],'scenario_id':scenario['id'],'as_of':'2026-10-09'}
    return root,m,req,doc,i,claims,ev

def test_metrics_separate_state_witnesses_and_unverified_no_credit(client):
    root,m,req,doc,i,claims,ev=make(client)
    before=p(client,root,'assessments',req)
    assert before['result']['metrics']['instrument_face']['maximum_cents']==50000000
    assert before['result']['metrics']['obligations']['maximum_cents']==50000000
    assert before['result']['metrics']['drawable']['maximum_cents'] is None
    cap=p(client,root,'rules',{'model_id':m['id'],'label':'One branch','interpretation':'Explicit synthetic cardinality.','kind':'CARDINALITY','member_keys':['branch_a','branch_b'],'max_active':1,'evidence':[ev(doc['pages'][0].splitlines()[4])]})
    assert p(client,root,'assessments',req)['result']['metrics']['obligations']['maximum_cents']==50000000
    p(client,root,'rules/'+cap['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic cap reviewed separately'})
    result=p(client,root,'assessments',req)['result']
    assert result['metrics']['obligations']['maximum_cents']==30000000
    assert result['metrics']['instrument_face']['maximum_cents']==50000000
    assert result['metrics']['instrument_face']['state']!=result['metrics']['obligations']['state']
    assert cap['id'] in result['metrics']['obligations']['applied_rules']
    for metric,v in result['metrics'].items():
        if v['maximum_cents'] is not None: assert sum(v['contributions'].values())==v['maximum_cents']
    p(client,root,'rules/'+cap['id']+'/review',{'decision':'UNVERIFIED','reason':'Withdraw synthetic cap review'})
    assert p(client,root,'assessments',req)['result']['metrics']['obligations']['maximum_cents']==50000000

def test_public_style_capacity_issuance_and_nonconcurrent_phases(client):
    root,m,req,doc,i,claims,ev=make(client)
    second=post(client,root+'/instruments',{'label':'Successor LC','beneficiary':'Other beneficiary','face_cents':3565674943,'evidence':i['evidence']})
    post(client,root+'/instruments/'+second['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic capacity amount checked'})
    m=p(client,root,'models',{'name':'Capacity phases','basis':'CONTRACTUAL_CAPACITY','instrument_ids':[i['id'],second['id']]})
    fact=p(client,root,'facts',{'model_id':m['id'],'key':'term_converted','label':'Term conversion has occurred','evidence':i['evidence']})
    for iid,val in [(i['id'],False),(second['id'],True)]:
        r=p(client,root,'rules',{'model_id':m['id'],'label':'Issuance phase','interpretation':'Synthetic mutually exclusive issuance phases.','kind':'ISSUANCE','target_id':iid,'when':[{'key':'term_converted','value':val}],'evidence':i['evidence']})
        p(client,root,'rules/'+r['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic issuance phase checked'})
    sc=next(s for s in client.get('/v3/'+root).json()['scenarios'] if s['model_id']==m['id'] and s['view']=='FUTURE')
    r=p(client,root,'assessments',{'model_id':m['id'],'scenario_id':sc['id'],'as_of':'2026-10-09'})['result']
    assert r['basis']=='CONTRACTUAL_CAPACITY'
    assert r['metrics']['instrument_face']['maximum_cents']==3565674943
    assert r['gross_instrument_face_cents']==3565674943+50000000
    assert r['feasible_states']==2

def test_temporal_release_lags_replay_amendment_and_invalidation(client):
    for lag in (30,60,180):
        root,m,req,doc,i,claims,ev=make(client)
        notice=p(client,root,'events',{'model_id':m['id'],'label':'Notice','event_type':'NOTICE','effective_on':'2026-10-09','evidence':i['evidence']})
        p(client,root,'events/'+notice['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic dated notice reviewed'})
        release=p(client,root,'rules',{'model_id':m['id'],'label':'Delayed release','interpretation':'Synthetic release becomes effective after notice lag.','kind':'RELEASE','target_id':i['id'],'event_id':notice['id'],'lag_days':lag,'evidence':i['evidence']})
        p(client,root,'rules/'+release['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic delayed release rule reviewed'})
        before=p(client,root,'assessments',{**req,'horizon_end':'2027-04-09'})
        assert before['result']['envelope'][0]['maxima']['instrument_face']==50000000
        assert before['result']['envelope'][-1]['maxima']['instrument_face']==0
        assert before['result']['metrics']['obligations']['maximum_cents']==50000000
        assert digest(before['snapshot'])==before['snapshot_hash']
        amended=client.post('/v2/'+root+'/documents',data={'replaces':doc['id']},files={'file':('new-terms.txt',b'New operative terms require full re-review.')})
        assert amended.status_code==200
        w=client.get('/v3/'+root).json()
        assert all(r['verification']=='UNVERIFIED' for r in w['rules'])
        assert p(client,root,'assessments',req)['result']['status']=='INCOMPLETE'
        assert p(client,root,'assessments/'+before['id']+'/replay',{})['result_matches']

def test_draw_balances_are_not_added_to_face_and_sequence_is_explicit(client):
    root,m,req,doc,i,claims,ev=make(client)
    balance=p(client,root,'balances',{'model_id':m['id'],'label':'Documented opening balance','instrument_id':i['id'],'observed_on':'2026-10-09','available_cents':50000000,'unreimbursed_cents':0,'evidence':i['evidence']})
    p(client,root,'balances/'+balance['id']+'/review',{'decision':'VERIFIED','reason':'Explicit synthetic opening balance and zero debt checked'})
    event=p(client,root,'events',{'model_id':m['id'],'label':'Partial draw','event_type':'DRAW','instrument_id':i['id'],'amount_cents':10000000,'remaining_available_cents':40000000,'effective_on':'2026-10-09','evidence':i['evidence']})
    p(client,root,'events/'+event['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic amount and available balance confirmed'})
    r=p(client,root,'assessments',req)['result']
    assert r['metrics']['instrument_face']['maximum_cents']==50000000
    assert r['metrics']['drawable']['maximum_cents']==40000000
    assert r['metrics']['reimbursement_debt']['maximum_cents']==10000000
    assert 'total_exposure' not in r
    pay=p(client,root,'events',{'model_id':m['id'],'label':'Reimbursement','event_type':'REIMBURSEMENT','instrument_id':i['id'],'amount_cents':10000000,'effective_on':'2026-10-09','evidence':i['evidence']})
    p(client,root,'events/'+pay['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic repayment amount confirmed'})
    assert p(client,root,'assessments',req)['result']['status']=='INCOMPLETE'
    body={k:v for k,v in pay.items() if k not in ('id','verification')};body['sequence']=1
    assert client.patch('/v3/'+root+'/events/'+pay['id'],json=body).status_code==200
    p(client,root,'events/'+pay['id']+'/review',{'decision':'VERIFIED','reason':'Separate documented sequence confirmed'})
    assert p(client,root,'assessments',req)['result']['metrics']['reimbursement_debt']['maximum_cents']==0

def test_comparisons_idempotency_isolation_and_limits(client):
    root,m,req,doc,i,claims,ev=make(client)
    req['request_id']='same-request-123'
    first=p(client,root,'assessments',req);second=p(client,root,'assessments',req)
    assert first['id']==second['id']
    assert client.post('/v3/'+root+'/assessments',json={**req,'as_of':'2026-10-10'}).status_code==409
    before=client.get('/v3/'+root).json()
    scenarios=[s['id'] for s in before['scenarios'] if s['model_id']==m['id']][:2]
    comparison=p(client,root,'comparisons',{'model_id':m['id'],'scenario_ids':scenarios,'as_of':'2026-10-09'})
    assert before==client.get('/v3/'+root).json()
    for r in comparison['comparisons']: assert r['snapshot_hash']==digest({**comparison['inputs'],'scenario':r['scenario']})
    assert client.get('/v3/'+root,headers={'Authorization':'Bearer b'}).status_code==404
    assert client.get('/v3/'+root+'/assessments/'+first['id']+'/export',headers={'Authorization':'Bearer b'}).status_code==404
    for n in range(11):p(client,root,'facts',{'model_id':m['id'],'key':'additional_'+str(n),'label':'Extra unknown'})
    assert p(client,root,'assessments',{k:v for k,v in req.items() if k!='request_id'})['result']['status']=='UNSUPPORTED'

def test_html_is_text_only_and_exact_sources_are_reviewed(client):
    project=post(client,'projects',{'name':'HTML evidence'})
    root='projects/'+project['id']
    r=client.post('/v2/'+root+'/documents',files={'file':('filing.html',b'<h1>Section 2.2</h1><p>A USD <b>500,000</b> letter of credit.</p><script>stealTokens()</script><style>body{display:none}</style>')},data={'source_url':'https://www.sec.gov/example'})
    assert r.status_code==200
    d=r.json();assert 'Section 2.2' in d['pages'][0] and 'stealTokens' not in d['pages'][0] and 'display:none' not in d['pages'][0]
    assert 'USD 500,000' in d['pages'][0]
    assert d['source_url']=='https://www.sec.gov/example'
