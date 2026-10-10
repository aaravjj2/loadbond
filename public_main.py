"""Read-only public case explorer. No customer uploads, editing or remote inference."""
import json
import tempfile
from uuid import uuid5, NAMESPACE_URL
from pathlib import Path
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse
from backend import main

# Every cold instance reconstructs only published fixtures. No author workspace is copied.
main.DATA = Path(tempfile.mkdtemp(prefix='loadbond-public-'))
main.TOKENS = {'local-demo': 'published-cases'}
app = main.app
from backend import v2, state_api, state_fixtures
_counter = 0
def fixture_uuid():
    global _counter
    _counter += 1
    return uuid5(NAMESPACE_URL, 'loadbond-public-v1:' + str(_counter))
_originals = {module: module.uuid4 for module in (main, v2, state_api, state_fixtures)}
for module in _originals:
    module.uuid4 = fixture_uuid
with TestClient(app, headers={'Authorization': 'Bearer local-demo'}) as client:
    client.post('/v2/profile', json={'name': 'Reference fixture author — not independent review'})
    for kind in ('synthetic', 'public'):
        response = client.post('/v3/references/' + kind)
        response.raise_for_status()
        ref = response.json()
        pid = ref['project']['id']
        workspace = client.get('/v3/projects/' + pid).json()
        for scenario in workspace['scenarios']:
            result = client.post('/v3/projects/' + pid + '/assessments', json={
                'model_id': ref['model_id'], 'scenario_id': scenario['id'],
                'as_of': '2026-10-09', 'horizon_end': '2026-12-04'})
            result.raise_for_status()
for module, original in _originals.items():
    module.uuid4 = original
app.middleware_stack = None

@app.middleware('http')
async def public_demo_boundary(request, call_next):
    path = request.url.path
    if path == '/v2/extraction/status':
        return JSONResponse({'ready': False, 'available': False,
            'error': 'Local AI runs on your laptop. This hosted explorer is read-only; see the video and run instructions.'})
    readonly_post = path.endswith('/comparisons') or path.endswith('/replay')
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and not readonly_post:
        return JSONResponse({'detail': 'Published case explorer is read-only. Run LoadBond locally for upload, extraction, editing and review.'}, status_code=403)
    return await call_next(request)
