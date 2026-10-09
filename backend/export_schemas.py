"""Run from project root: python -m backend.export_schemas."""
import json
from pathlib import Path
from .main import app
from . import v2
from . import local_extraction

def main():
    target = Path(__file__).resolve().parents[1] / 'schemas'
    target.mkdir(exist_ok=True)
    for model in (v2.Project,v2.Site,v2.Evidence,v2.Instrument,v2.Claim,v2.Dependency,v2.Scenario,v2.Decision,v2.Comparison):
        (target / ('v2-'+model.__name__.lower()+'.schema.json')).write_text(json.dumps(model.model_json_schema(),indent=2),encoding='utf-8')
    for model in (local_extraction.Candidate, local_extraction.Output, local_extraction.Resolve, local_extraction.Abandon):
        (target / ('v2-extraction-'+model.__name__.lower()+'.schema.json')).write_text(json.dumps(model.model_json_schema(),indent=2),encoding='utf-8')
    (target / 'openapi.json').write_text(json.dumps(app.openapi(),indent=2),encoding='utf-8')

if __name__=='__main__':
    main()
