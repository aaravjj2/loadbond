import json
import sqlite3
import pytest
from fastapi.testclient import TestClient
from . import main, v2

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'DATA', tmp_path)
    monkeypatch.setattr(main, 'TOKENS', {'a':'alice'})
    return TestClient(main.app, headers={'Authorization':'Bearer a'})

def tables(path):
    with sqlite3.connect(path) as c:
        return {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}

def versions(path):
    with sqlite3.connect(path) as c:
        return [r[0] for r in c.execute('SELECT version FROM migrations ORDER BY version')]

def test_version_one_database_upgrades_without_losing_records(client, tmp_path):
    path = tmp_path / 'workbench.sqlite'
    with sqlite3.connect(path) as c:
        c.execute('CREATE TABLE migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
        c.execute('INSERT INTO migrations VALUES(1,?)', ('2026-10-01T00:00:00+00:00',))
        c.execute('CREATE TABLE profiles(tenant TEXT PRIMARY KEY, name TEXT NOT NULL)')
        c.execute('CREATE TABLE projects(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL)')
        for table in v2.MIGRATIONS[0][1]:
            c.execute(f'CREATE TABLE {table}(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), body TEXT NOT NULL)')
        c.execute('CREATE TABLE legacy_imports(tenant TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id))')
        body = {'id':'p1','name':'Older project','mw':None,'archived':False,'synthetic':False}
        c.execute('INSERT INTO projects VALUES(?,?,?,?)', ('p1','alice',1,json.dumps(body)))
    assert 'extractions' not in tables(path)
    projects = client.get('/v2/projects').json()['projects']
    assert [p['name'] for p in projects] == ['Older project']
    assert set(v2.TABLES) <= tables(path)
    assert versions(path) == [1, 2, 3]

def test_fresh_database_reaches_latest_version_once(client, tmp_path):
    client.get('/v2/projects')
    client.get('/v2/projects')
    path = tmp_path / 'workbench.sqlite'
    assert versions(path) == [v for v, _ in v2.MIGRATIONS]
    assert set(v2.TABLES) | {'profiles', 'projects', 'legacy_imports', 'migrations'} <= tables(path)
