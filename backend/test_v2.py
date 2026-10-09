import copy
import json
import sqlite3
import pytest
from fastapi.testclient import TestClient
from . import main
from .domain import digest
from . import v2

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'DATA', tmp_path)
    monkeypatch.setattr(main, 'TOKENS', {'a':'alice', 'b':'bob'})
    return TestClient(main.app, headers={'Authorization':'Bearer a'})

TEXT = 'The beneficiary holds a USD 500,000 letter of credit.\nIncurred work is USD 100,000.\nBranch A requires USD 200,000.\nBranch B requires USD 200,000.\nFor the hypothetical claim-limited structure, at most one branch may coexist.\nInstrument released by beneficiary.'

def post(c,path,body):
    r=c.post('/v2/'+path,json=body)
    assert r.status_code==200, r.text
    return r.json()

def setup(c):
    post(c,'profile',{'name':'Alice reviewer'})
    p=post(c,'projects',{'name':'Harbor renewal','mw':75})
    root='projects/'+p['id']
    site=post(c,root+'/sites',{'name':'Harbor'})
    r=c.post('/v2/'+root+'/documents',files={'file':('ordinary.txt',TEXT.encode())})
    assert r.status_code==200
    doc=r.json()
    def ev(quote):
        return {'document_id':doc['id'],'page':1,'start':TEXT.index(quote),'end':TEXT.index(quote)+len(quote),'quote':quote}
    inst_body={'label':'Harbor LC','beneficiary':'Utility','site_id':site['id'],'face_cents':50000000,'evidence':[ev(TEXT.splitlines()[0])]}
    inst=post(c,root+'/instruments',inst_body)
    post(c,root+'/instruments/'+inst['id']+'/review',{'decision':'VERIFIED','reason':'Face checked against the document'})
    claims=[]
    for label,amount,kind,line in [('Incurred',10000000,'fixed',1),('A',20000000,'conditional',2),('B',20000000,'conditional',3)]:
        value=post(c,root+'/claims',{'label':label,'amount_cents':amount,'kind':kind,'instrument_id':inst['id'],'mapping':'ADDITIVE','evidence':[ev(TEXT.splitlines()[line])]})
        post(c,root+'/claims/'+value['id']+'/review',{'decision':'VERIFIED','reason':'Independent liability component checked'})
        claims.append(value)
    dep=post(c,root+'/dependencies',{'label':'One branch','claim_ids':[x['id'] for x in claims[1:]],'max_active':1,'evidence':[ev(TEXT.splitlines()[4])]})
    scenario=post(c,root+'/scenarios',{'name':'Proposed structure','hypothetical':True,'dependency_ids':[dep['id']]})
    post(c,root+'/documents/'+doc['id']+'/complete',{'reason':'All material records entered'})
    return root,doc,inst,inst_body,claims,dep,scenario,ev

def test_empty_projects_isolation_and_input_validation(client):
    assert client.get('/v2/projects').json()['projects']==[]
    p=post(client,'projects',{'name':'First'})
    root='projects/'+p['id']
    assert client.get('/v2/'+root).json()['claims']==[]
    assert client.get('/v2/'+root,headers={'Authorization':'Bearer b'}).status_code==404
    assert client.get('/v2/projects',headers={'Authorization':'Bearer b'}).json()['projects']==[]
    assert client.get('/v2/projects',headers={'Authorization':'Bearer unknown'}).status_code==401
    assert client.post('/v2/'+root+'/sites',json={'name':'Site','fake':True}).status_code==422
    other=post(client,'projects',{'name':'Second'})
    assert client.get('/v2/projects/'+other['id']).json()['sites']==[]
    changed=client.patch('/v2/'+root,json={'name':'Renamed','archived':True}).json()
    assert changed['name']=='Renamed'
    assert client.post('/v2/'+root+'/sites',json={'name':'Blocked'}).status_code==409

def test_face_basis_constraint_review_and_claim_limited(client):
    root,doc,inst,body,claims,dep,scenario,ev=setup(client)
    req={'scenario_id':scenario['id']}
    before=post(client,root+'/runs',req)
    assert before['result']['maximum_cents']==50000000
    assert before['result']['maximum_obligations_cents']==50000000
    post(client,root+'/dependencies/'+dep['id']+'/review',{'decision':'VERIFIED','reason':'Reviewed hypothetical assumption'})
    face=post(client,root+'/runs',req)
    assert face['result']['maximum_cents']==50000000
    assert face['result']['maximum_obligations_cents']==30000000
    body.update(basis='CLAIM_LIMITED',basis_evidence=[ev(TEXT.splitlines()[4])])
    r=client.patch('/v2/'+root+'/instruments/'+inst['id'],json=body)
    assert r.status_code==200
    assert post(client,root+'/runs',req)['result']['status']=='INCOMPLETE'
    post(client,root+'/instruments/'+inst['id']+'/review',{'decision':'VERIFIED','reason':'Hypothetical claim-limited modeling reviewed'})
    limited=post(client,root+'/runs',req)
    assert limited['result']['maximum_cents']==30000000
    assert limited['result']['gross_cents']==50000000
    baseline=client.get('/v2/'+root).json()['scenarios'][0]
    assert post(client,root+'/runs',{'scenario_id':baseline['id']})['result']['maximum_cents']==50000000
    assert digest(limited['snapshot'])==limited['snapshot_hash']
    assert post(client,root+'/runs/'+limited['id']+'/replay',{})['result_matches']
    assert client.get('/v2/'+root+'/runs/'+limited['id']+'/export',headers={'Authorization':'Bearer b'}).status_code==404

def test_source_validation_and_review_requirements(client):
    root,doc,inst,body,claims,dep,scenario,ev=setup(client)
    bad=ev(TEXT.splitlines()[1]);bad['start']+=1
    invalid=client.post('/v2/'+root+'/claims',json={'label':'Bad','instrument_id':inst['id'],'evidence':[bad]})
    assert invalid.status_code==422
    unknown=post(client,root+'/claims',{'label':'Unknown','instrument_id':inst['id'],'evidence':[ev(TEXT.splitlines()[1])]})
    assert client.post('/v2/'+root+'/claims/'+unknown['id']+'/review',json={'decision':'VERIFIED','reason':'Missing amount'}).status_code==422
    assert post(client,root+'/runs',{'scenario_id':scenario['id']})['result']['status']=='INCOMPLETE'
    post(client,root+'/claims/'+unknown['id']+'/review',{'decision':'REJECTED','reason':'Duplicate passage excluded'})
    assert post(client,root+'/runs',{'scenario_id':scenario['id']})['result']['status']=='COMPLETE'
    assert client.post('/v2/'+root+'/scenarios',json={'name':'Bad baseline','dependency_ids':[dep['id']]}).status_code==422
    duplicate=post(client,root+'/claims',{'label':'Duplicate','amount_cents':10000000,'kind':'fixed','instrument_id':inst['id'],'mapping':'ADDITIVE','evidence':[ev(TEXT.splitlines()[1])]})
    assert client.post('/v2/'+root+'/claims/'+duplicate['id']+'/review',json={'decision':'VERIFIED','reason':'Wrong duplicate'}).status_code==422

def test_amendment_history_audit_and_backup(client,tmp_path):
    root,doc,inst,body,claims,dep,scenario,ev=setup(client)
    original=post(client,root+'/runs',{'scenario_id':scenario['id']})
    r=client.post('/v2/'+root+'/documents',data={'replaces':doc['id']},files={'file':('amendment.txt',b'New terms replace all prior provisions.')})
    assert r.status_code==200
    w=client.get('/v2/'+root).json()
    assert all(x['verification']=='UNVERIFIED' for x in w['claims']+w['instruments']+w['dependencies'])
    assert w['runs'][0]['stale']
    assert post(client,root+'/runs/'+original['id']+'/replay',{})['result_matches']
    exported=client.get('/v2/'+root+'/runs/'+original['id']+'/export').json()
    assert exported['snapshot']==original['snapshot']
    assert post(client,root+'/runs',{'scenario_id':scenario['id']})['result']['status']=='INCOMPLETE'
    for index,event in enumerate(w['events']):
        payload={k:v for k,v in event.items() if k!='hash'}
        assert digest(payload)==event['hash']
        assert event['previous_hash']==(w['events'][index-1]['hash'] if index else None)
    db=main.DATA/'workbench.sqlite'
    with sqlite3.connect(db) as source,sqlite3.connect(tmp_path/'backup.sqlite') as dest:
        source.backup(dest)
    with sqlite3.connect(tmp_path/'backup.sqlite') as restored:
        assert json.loads(restored.execute('SELECT body FROM runs WHERE id=?',(original['id'],)).fetchone()[0])['snapshot_hash']==original['snapshot_hash']
        assert restored.execute('PRAGMA foreign_key_check').fetchall()==[]

def test_audit_integrity_endpoint_detects_event_tampering(client):
    root,doc,inst,body,claims,dep,scenario,ev=setup(client)
    path='/v2/'+root+'/integrity'
    report=client.get(path).json()
    assert report['valid'] is True
    assert report['event_count'] > 1
    assert report['issues']==[]
    assert client.get(path,headers={'Authorization':'Bearer b'}).status_code==404

    db=main.DATA/'workbench.sqlite'
    with sqlite3.connect(db) as c:
        row=c.execute('SELECT id,body FROM events WHERE project_id=? ORDER BY rowid LIMIT 1',(root.split('/')[-1],)).fetchone()
        event=json.loads(row[1])
        event['detail']['name']='Tampered project'
        c.execute('UPDATE events SET body=? WHERE id=?',(json.dumps(event),row[0]))
    report=client.get(path).json()
    assert report['valid'] is False
    assert any(issue['event_id']==row[0] and issue['check']=='event_hash' for issue in report['issues'])

def test_release_requires_separate_evidence(client):
    root,doc,inst,body,claims,dep,scenario,ev=setup(client)
    body['lifecycle']='RELEASED'
    assert client.patch('/v2/'+root+'/instruments/'+inst['id'],json=body).status_code==200
    post(client,root+'/instruments/'+inst['id']+'/review',{'decision':'VERIFIED','reason':'Lifecycle checked; release unproven'})
    assert post(client,root+'/runs',{'scenario_id':scenario['id']})['result']['maximum_cents']==50000000
    body['release_evidence']=[ev(TEXT.splitlines()[-1])]
    client.patch('/v2/'+root+'/instruments/'+inst['id'],json=body)
    post(client,root+'/instruments/'+inst['id']+'/review',{'decision':'VERIFIED','reason':'Beneficiary release inspected'})
    assert post(client,root+'/runs',{'scenario_id':scenario['id']})['result']['maximum_cents']==0

def test_sample_golden_and_legacy_migration(client):
    p=post(client,'sample',{})
    root='projects/'+p['id']
    w=client.get('/v2/'+root).json()
    expected={'Documented baseline':8000000000,'Hypothetical two-branch cap':5220000000,'Three-branch overlap':6700000000,'25% step-up':6075000000}
    for s in w['scenarios']:
        result=post(client,root+'/runs',{'scenario_id':s['id']})['result']
        assert result['maximum_cents']==expected[s['name']]
    # Populate a legacy workspace; import it once, preserving historical hashes.
    legacy=client.get('/workspace').json()
    old=client.post('/runs',json={'scenario':'independent'}).json()
    migrated=post(client,'import-legacy',{})
    assert post(client,'import-legacy',{})['id']==migrated['id']
    history=client.get('/v2/projects/'+migrated['id']).json()['runs'][0]
    assert history['snapshot_hash']==old['snapshot_hash']
    assert post(client,'projects/'+migrated['id']+'/runs/'+history['id']+'/replay',{})['result_matches']

def test_infeasible_dimension_limit_and_monotonicity(client):
    p=post(client,'sample',{})
    w=client.get('/v2/projects/'+p['id']).json()
    s={**w,'schema_version':2,'scenario':w['scenarios'][1]}
    baseline=v2.solve(s)['maximum_cents']
    bigger=copy.deepcopy(s);bigger['claims'][0]['amount_cents']+=1000000
    assert v2.solve(bigger)['maximum_cents']>=baseline
    weaker=copy.deepcopy(s);weaker['dependencies'][0]['max_active']=3
    assert v2.solve(weaker)['maximum_cents']>=baseline
    infeasible=copy.deepcopy(s);d=infeasible['dependencies'][0];d['claim_ids']=[c['id'] for c in s['claims'] if c['kind']=='fixed'];d['max_active']=0
    assert v2.solve(infeasible)['status']=='INCOMPLETE'
    huge=copy.deepcopy(s)
    for n in range(21):
        huge['claims'].append({**huge['claims'][1],'id':'extra-'+str(n),'kind':'conditional'})
    assert v2.solve(huge)['status']=='UNSUPPORTED'

def test_upload_limits_completion_and_cross_project_links(client):
    p=post(client,'projects',{'name':'Empty'})
    root='projects/'+p['id']
    base=client.get('/v2/'+root).json()['scenarios'][0]
    assert post(client,root+'/runs',{'scenario_id':base['id']})['result']['status']=='INCOMPLETE'
    assert client.post('/v2/'+root+'/documents',files={'file':('x.exe',b'hello')}).status_code==422
    assert client.post('/v2/'+root+'/documents',files={'file':('x.txt',b'x'*5000001)}).status_code==413
    root2,doc,inst,body,claims,dep,scenario,ev=setup(client)
    body['evidence']=[ev(TEXT.splitlines()[0])]
    assert client.post('/v2/'+root+'/instruments',json=body).status_code==404
    assert client.post('/v2/'+root2+'/instruments',json={**body,'face_cents':1.5}).status_code==422
