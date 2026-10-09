from .test_v2 import client, post
from .v2 import Instrument

RELEASE = 'Synthetic beneficiary release: Alder Utility authorizes cancellation of the USD 12,000,000 Alder letter of credit. Underlying engineering remains payable.'

def fixture(c):
    p = post(c, 'transaction-case', {})
    root = 'projects/'+p['id']
    w = c.get('/v2/'+root).json()
    marker = next(d['transaction_case'] for d in w['documents'] if d.get('transaction_case'))
    scenario = w['scenarios'][0]['id']
    return root, w, marker, {'scenario_id':scenario}

def release(c, root, w, marker):
    post(c, 'profile', {'name':'Demo operator'})
    d = c.post('/v2/'+root+'/documents',files={'file':('release.txt',RELEASE.encode())}).json()
    i = next(i for i in w['instruments'] if i['id']==marker['instrument_a'])
    body = Instrument.model_validate({k:v for k,v in i.items() if k in Instrument.model_fields}).model_dump()
    body.update(lifecycle='RELEASED',release_evidence=[{'document_id':d['id'],'page':1,'start':0,'end':len(RELEASE),'quote':RELEASE}])
    assert c.patch('/v2/'+root+'/instruments/'+i['id'],json=body).status_code==200
    post(c,root+'/instruments/'+i['id']+'/review',{'decision':'VERIFIED','reason':'Explicit synthetic release review'})
    post(c,root+'/documents/'+d['id']+'/complete',{'reason':'Explicit synthetic document review'})
    return i,body,d

def test_transaction_selection_release_and_evidence_withdrawal(client):
    root,w,marker,req=fixture(client)
    assert w['project']['synthetic']
    for i in w['instruments']+w['claims']:
        for e in i['evidence']:
            d=next(d for d in w['documents'] if d['id']==e['document_id'])
            assert d['pages'][e['page']-1][e['start']:e['end']]==e['quote']
    original=post(client,root+'/runs',req)
    assert original['result']['maximum_cents']==3000000000
    assert original['result']['maximum_obligations_cents']==2000000000
    assert sum(original['result']['instrument_contributions'].values())==3000000000
    for sid,name,status in [(marker['site_a'],'Alder','ABANDONED'),(marker['site_b'],'Birch','SELECTED')]:
        assert client.patch('/v2/'+root+'/sites/'+sid,json={'name':name,'commercial_status':status}).status_code==200
    assert post(client,root+'/runs',req)['result']['maximum_cents']==3000000000
    assert all(i['facility_usage_cents'] is None and i['cash_collateral_cents'] is None for i in w['instruments'])
    i,body,d=release(client,root,w,marker)
    lowered=post(client,root+'/runs',req)
    assert lowered['result']['maximum_cents']==1800000000
    assert lowered['result']['maximum_obligations_cents']==2000000000
    assert lowered['result']['instrument_contributions'][marker['instrument_a']]==0
    # Release evidence is not silently inferred from abandonment or lifecycle.
    body.update(release_evidence=[],lifecycle='EFFECTIVE')
    assert client.patch('/v2/'+root+'/instruments/'+i['id'],json=body).status_code==200
    assert post(client,root+'/runs',req)['result']['status']=='INCOMPLETE'
    post(client,root+'/instruments/'+i['id']+'/review',{'decision':'VERIFIED','reason':'Synthetic withdrawal test; original face reconfirmed'})
    assert post(client,root+'/runs',req)['result']['maximum_cents']==3000000000
    assert post(client,root+'/runs/'+lowered['id']+'/replay',{})['result_matches']
    exported=client.get('/v2/'+root+'/runs/'+lowered['id']+'/export').json()
    assert exported['stale'] and exported['snapshot']==lowered['snapshot']

def test_transaction_release_amendment_isolation_and_review_gate(client):
    root,w,marker,req=fixture(client)
    assert client.get('/v2/'+root,headers={'Authorization':'Bearer b'}).status_code==404
    assert client.post('/v2/transaction-case',headers={'Authorization':'Bearer invalid'},json={}).status_code==401
    i,body,d=release(client,root,w,marker)
    prior=post(client,root+'/runs',req)
    assert prior['result']['maximum_cents']==1800000000
    r=client.post('/v2/'+root+'/documents',data={'replaces':d['id']},files={'file':('release-amendment.txt',b'Synthetic amendment: release is disputed; review required.')})
    assert r.status_code==200
    assert post(client,root+'/runs',req)['result']['status']=='INCOMPLETE'
    assert post(client,root+'/runs/'+prior['id']+'/replay',{})['result_matches']
