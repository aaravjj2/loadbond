"""Reference inputs only. Product screens and the solver contain no case branches."""
import hashlib
from pathlib import Path
from uuid import uuid4
from .v2 import Project, Instrument, Claim, stamp
from .state_types import StateModel,DatedFact,ContractRule,TransactionEvent,StateScenario,DocumentLink
from .ingestion import html_pages

PUBLIC_URL='https://www.sec.gov/Archives/edgar/data/2133037/000162828026059639/exhibit107-financingagreem.htm'

def load_reference(c,tenant,kind,create_project,put,audit,get_project,data_path):
    root=Path(__file__).resolve().parents[1]
    public=kind=='public'
    p=create_project(c,tenant,Project(name='Pelicans Jaw • public commitment phases' if public else 'Juniper • replacement and adverse states',synthetic=not public).model_dump())
    pid=p['id']; mid=str(uuid4())
    path=root/'samples/public/pelicans-jaw-financing-excerpt.html' if public else root/'samples/state-reference/juniper-agreement.txt'
    raw=path.read_bytes();pages=html_pages(raw) if public else [raw.decode('utf-8')]
    sha=hashlib.sha256(raw).hexdigest()
    d={'id':str(uuid4()),'name':path.name,'pages':pages,'sha256':sha,'agreement_id':str(uuid4()),'version':1,'superseded':False,
       'processing':'REVIEWED','source_url':PUBLIC_URL if public else '',
       'capture_kind':'CURATED_DOM_EXCERPT' if public else 'AUTHORED_SYNTHETIC',
       'completion_reason':'Reference fixture author reviewed the selected source passages. Not counsel or user approval; package completeness is not established.'}
    folder=data_path()/'objects'/hashlib.sha256(tenant.encode()).hexdigest();folder.mkdir(parents=True,exist_ok=True)
    (folder/sha).write_bytes(raw);put(c,'documents',pid,d)
    def span(needle):
        for page,text in enumerate(pages,1):
            for line in text.splitlines():
                if needle in line:
                    start=text.index(line)
                    return {'document_id':d['id'],'page':page,'start':start,'end':start+len(line),'quote':line}
        raise ValueError('Reference source passage missing: '+needle)
    def authored(table,schema,body,review=True):
        value={'id':str(uuid4()),**schema(**body).model_dump(mode='json'),'verification':'VERIFIED' if review else 'UNVERIFIED'}
        if table=='instruments':value['release_verified']=False
        put(c,table,pid,value)
        if review:
            put(c,'reviews',pid,{'id':str(uuid4()),'type':table,'record_id':value['id'],'before':None,'after':value.copy(),
                                'at':stamp(),'reviewer':'Reference fixture author','reason':'Authored model interpretation for demonstration. No legal judgment or user review implied.'})
        return value
    ia=authored('instruments',Instrument,{'label':'Interconnection commitment ceiling' if public else 'Predecessor LC','beneficiary':'Transmission Service Provider — agreement reference' if public else 'Alder Utility',
        'face_cents':2004813000 if public else 900000000,'evidence':[span('20,048,130.00' if public else 'Section 1.')]})
    ib=authored('instruments',Instrument,{'label':'DSR commitment ceiling' if public else 'Replacement LC','beneficiary':'Collateral Agent — agreement reference' if public else 'Birch Utility',
        'face_cents':3565674943 if public else 1500000000,'evidence':[span('35,656,749.43' if public else 'Section 2.')]})
    cls=[]
    if not public:
        for label,amount,kind_,iid,needle in [('Completed predecessor engineering',400000000,'fixed',ia['id'],'Section 10.'),('Completed replacement engineering',300000000,'fixed',ib['id'],'Section 11.'),('Replacement construction',1200000000,'conditional',ib['id'],'Section 12.')]:
            cls.append(authored('claims',Claim,{'label':label,'amount_cents':amount,'kind':kind_,'instrument_id':iid,'mapping':'ADDITIVE','legal_status':'REVIEWED_MODEL_INPUT','evidence':[span(needle)]}))
    m={'id':mid,**StateModel(name='Public LC phase commitments — partial scope' if public else 'Replacement security and adverse conditions',basis='CONTRACTUAL_CAPACITY',
       instrument_ids=[ia['id'],ib['id']],claim_ids=[cl['id'] for cl in cls],
       scope_notes='Selected public commitment provisions only. Actual LC issuance, issuer allocations, term conversion occurrence, underlying interconnection agreement and documentary balances are unknown. Not a historical transaction reconstruction.' if public else 'Authored synthetic contractual requirements. Draw balances and actual bank/cash treatment are unestablished. Unknown conditions remain enumerated.').model_dump(mode='json'),'model_revision':1,'verification':'UNVERIFIED'}
    put(c,'state_models',pid,m)
    def fact(key,label,needle):return authored('state_facts',DatedFact,{'model_id':mid,'key':key,'label':label,'evidence':[span(needle)]},False)
    def rule(kind_,label,needle,**extras):return authored('contract_rules',ContractRule,{'model_id':mid,'kind':kind_,'label':label,'interpretation':'Reference author interpretation of the quoted provision; independently reviewed legal treatment remains pending.','evidence':[span(needle)],**extras})
    if public:
        fact('term_converted','Term conversion occurrence is unknown','shall not be permitted')
        rule('ISSUANCE','Interconnection commitment exists before conversion','20,048,130.00',target_id=ia['id'],when=[{'key':'term_converted','value':False}])
        rule('ISSUANCE','DSR commitment exists after conversion','35,656,749.43',target_id=ib['id'],when=[{'key':'term_converted','value':True}])
        for title in ['Actual issued LC and issuer allocations','Operative interconnection agreement','Term conversion occurrence and utilization records']:
            authored('document_links',DocumentLink,{'model_id':mid,'source_document_id':d['id'],'reference_label':title,'required_for_assessment':False,'evidence':[span('shall not be permitted')]})
    else:
        for key,label,needle in [('replacement_authorized','Replacement is authorized','Section 2.'),('rating_downgraded','Rating downgrade has occurred','Section 6.'),('default_occurred','Default has occurred','Section 7.'),('signed_demand','Documentary signed demand exists','Section 8.')]:fact(key,label,needle)
        rule('ISSUANCE','Replacement authorization','Section 2.',target_id=ib['id'],when=[{'key':'replacement_authorized','value':True}])
        notice=authored('transaction_events',TransactionEvent,{'model_id':mid,'label':'Valid notice acknowledged','event_type':'NOTICE','executed_on':'2026-10-12','effective_on':'2026-10-12','instrument_id':ia['id'],'evidence':[span('Section 5.')]})
        rule('RELEASE','Thirty-day release requirement','Section 4.',target_id=ia['id'],event_id=notice['id'],lag_days=30)
        rule('REPLACEMENT','Posting replacement is not release','Section 3.',target_id=ia['id'],successor_id=ib['id'])
        for iid in (ia['id'],ib['id']):
            rule('STEP_UP','Downgrade security step-up','Section 6.',target_id=iid,percent=125,when=[{'key':'rating_downgraded','value':True}])
            rule('DRAW_CONDITION','Signed documentary demand','Section 8.',target_id=iid,when=[{'key':'signed_demand','value':True}])
        rule('IMPLICATION','Default retains replacement authorization','Section 7.',when=[{'key':'default_occurred','value':True}],requires_key='replacement_authorized')
        rule('EVERGREEN','Predecessor continuation','Section 9.',target_id=ia['id'])
        rule('OBLIGATION','Construction activation','Section 12.',target_id=cls[-1]['id'],when=[{'key':'replacement_authorized','value':True}])
    for title,view,assumptions,face in [('Recorded position','RECORDED',{},100),('Possible future states','FUTURE',{},100),('Hypothetical 25% stress','HYPOTHETICAL',{},125)]:
        value={'id':str(uuid4()),**StateScenario(model_id=mid,name=title,view=view,assumptions=assumptions,face_percent=face).model_dump(mode='json')};put(c,'state_scenarios',pid,value)
    audit(c,pid,tenant,'Reference state package loaded',{'kind':'PUBLIC_SOURCE_EXCERPT' if public else 'SYNTHETIC','model_id':mid,'notice':'Authored pre-reviewed reference interpretations, not user or counsel approvals.'})
    return {'project':get_project(c,pid,tenant),'model_id':mid}
