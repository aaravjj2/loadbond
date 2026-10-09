from .test_v2 import client, setup
from .domain import digest
from .v2 import solve

def test_golden_comparison_is_frozen_and_does_not_save(client):
    project=client.post('/v2/sample',json={}).json();root='/v2/projects/'+project['id']
    before=client.get(root).json()
    scenarios=before['scenarios'][:3]
    r=client.post(root+'/comparisons',json={'scenario_ids':[s['id'] for s in scenarios]})
    assert r.status_code==200,r.text
    comparison=r.json()
    assert [x['result']['maximum_cents'] for x in comparison['comparisons']]==[8000000000,5220000000,6700000000]
    for x in comparison['comparisons']:
        snapshot={**comparison['inputs'],'scenario':x['scenario']}
        assert digest(snapshot)==x['snapshot_hash']
        assert solve(snapshot)==x['result']
    after=client.get(root).json()
    assert before==after
    assert comparison['project_revision']==before['project']['revision']

def test_comparison_isolation_validation_and_incomplete_inputs(client):
    root,doc,inst,body,claims,dep,scenario,ev=setup(client)
    w=client.get('/v2/'+root).json();path='/v2/'+root+'/comparisons'
    ids=[x['id'] for x in w['scenarios']]
    assert client.post(path,json={'scenario_ids':ids},headers={'Authorization':'Bearer b'}).status_code==404
    assert client.post(path,json={'scenario_ids':[ids[0],ids[0]]}).status_code==422
    assert client.post(path,json={'scenario_ids':[ids[0],'unknown']}).status_code==404
    assert client.post(path,json={'scenario_ids':[ids[0]]}).status_code==422
    client.patch('/v2/'+root+'/instruments/'+inst['id'],json=body)
    before=client.get('/v2/'+root).json()
    r=client.post(path,json={'scenario_ids':ids}).json()
    assert all(x['result']['status']=='INCOMPLETE' for x in r['comparisons'])
    assert all(x['result']['maximum_cents'] is None for x in r['comparisons'])
    assert client.get('/v2/'+root).json()==before
