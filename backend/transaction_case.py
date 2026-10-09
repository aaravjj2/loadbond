"""Explicitly synthetic transaction, authored inputs rather than AI extraction."""
import hashlib
from uuid import uuid4

CASE_TITLE = 'Riverbend • site selection and release'
SITE_A_TEXT = '''SYNTHETIC DEMONSTRATION — not an operative agreement.
Riverbend project / Alder site / security agreement version 1.
Alder Utility is beneficiary of an independent letter of credit with face USD 12,000,000.
Completed engineering creates a separate USD 2,000,000 payment obligation.
Abandoning Alder does not itself cancel or reduce the letter of credit; documentary release must be evidenced separately.
'''
SITE_B_TEXT = '''SYNTHETIC DEMONSTRATION — not an operative agreement.
Riverbend project / Birch site / security agreement version 1.
Birch Utility is beneficiary of a letter of credit with face USD 18,000,000.
Completed engineering creates a USD 3,000,000 payment obligation.
If Birch is selected, construction creates an additional USD 15,000,000 obligation.
Both Birch obligations are secured by the same USD 18,000,000 letter of credit; they are distinct obligation components, not additional instruments.
'''

def records():
    from .v2 import Site, Instrument, Claim, stamp
    a, b, ia, ib = [str(uuid4()) for _ in range(4)]
    tables = {key: [] for key in ('sites', 'documents', 'instruments', 'claims', 'reviews')}
    tables['sites'] = [{'id': a, **Site(name='Alder').model_dump()}, {'id': b, **Site(name='Birch').model_dump()}]
    def doc(name, text):
        value = {'id': str(uuid4()), 'name': name, 'pages': [text], 'sha256': hashlib.sha256(text.encode()).hexdigest(),
                 'agreement_id': str(uuid4()), 'version': 1, 'superseded': False, 'processing': 'REVIEWED',
                 'completion_reason': 'Pre-reviewed synthetic fixture; no user or legal review implied.'}
        tables['documents'].append(value)
        return value
    da = doc('01-riverbend-alder.txt', SITE_A_TEXT)
    db = doc('02-riverbend-birch.txt', SITE_B_TEXT)
    da['transaction_case'] = {'version': '1.0', 'site_a': a, 'site_b': b, 'instrument_a': ia, 'instrument_b': ib}
    def span(d, line):
        quote = d['pages'][0].splitlines()[line]
        start = d['pages'][0].index(quote)
        return {'document_id': d['id'], 'page': 1, 'start': start, 'end': start+len(quote), 'quote': quote}
    def reviewed(table, value):
        value['verification'] = 'VERIFIED'
        tables[table].append(value)
        tables['reviews'].append({'id': str(uuid4()), 'type': table, 'record_id': value['id'], 'before': None,
                                 'after': value.copy(), 'reviewer': 'Pre-reviewed synthetic fixture', 'at': stamp(),
                                 'reason': 'Authored demonstration input, checked against synthetic source. Not legal approval.'})
    for iid, sid, label, amount, d in [(ia,a,'Alder LC',1200000000,da),(ib,b,'Birch LC',1800000000,db)]:
        reviewed('instruments', {'id': iid, **Instrument(label=label, beneficiary=label.replace(' LC',' Utility'),
                 site_id=sid, face_cents=amount, evidence=[span(d,2)]).model_dump(), 'release_verified': False})
    for label, amount, kind, iid, sid, d, line in [('Alder completed engineering',200000000,'fixed',ia,a,da,3),
            ('Birch completed engineering',300000000,'fixed',ib,b,db,3),
            ('Birch construction',1500000000,'conditional',ib,b,db,4)]:
        reviewed('claims', {'id': str(uuid4()), **Claim(label=label, amount_cents=amount, kind=kind,
                 instrument_id=iid, site_id=sid, mapping='ADDITIVE', legal_status='REVIEWED_MODEL_INPUT', evidence=[span(d,line)]).model_dump()})
    return tables
