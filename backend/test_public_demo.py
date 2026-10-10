"""Public deployment contract tested in isolated cold-start processes."""
import json
import subprocess
import sys
from pathlib import Path

SCRIPT = '''
import json
from fastapi.testclient import TestClient
from public_main import app
c=TestClient(app,headers={'Authorization':'Bearer local-demo'})
projects=c.get('/v2/projects').json()['projects']
assert len(projects)==2
assert c.get('/v2/projects',headers={'Authorization':'Bearer invalid'}).status_code==401
assert c.post('/v2/projects',json={'name':'No public editing'}).status_code==403
results=[]
for p in projects:
 root='/v3/projects/'+p['id']
 before=c.get(root).json()
 assert len(before['runs'])==3
 preview=c.post(root+'/comparisons',json={'model_id':before['models'][0]['id'],'scenario_ids':[s['id'] for s in before['scenarios'][:2]],'as_of':'2026-10-09','horizon_end':'2026-12-04'})
 assert preview.status_code==200,preview.text
 for r in before['runs']:
  replay=c.post(root+'/assessments/'+r['id']+'/replay').json()
  assert replay['snapshot_matches'] and replay['result_matches']
  exported=c.get(root+'/assessments/'+r['id']+'/export').json()
  assert exported['snapshot_hash']==r['snapshot_hash']
 after=c.get(root).json()
 assert before==after, 'Read-only preview/replay changed stored workspace'
 results.append({'project':p['id'],'runs':[(r['id'],r['snapshot_hash'],r['result_hash']) for r in before['runs']]})
print(json.dumps(results))
'''

def test_public_demo_cold_starts_are_readonly_and_reproducible():
    root=Path(__file__).resolve().parents[1]
    def cold():
        result=subprocess.run([sys.executable,'-c',SCRIPT],cwd=root,capture_output=True,text=True,timeout=30)
        assert result.returncode==0,result.stderr
        return json.loads(result.stdout)
    assert cold()==cold()
