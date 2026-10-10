"""Bounded exact evaluation of reviewed, explicit contractual interpretations.

No code evaluation, legal inference, remote calls or storage access. Each metric
has its own maximizing state; debt and LC face are NEVER added into one metric.
"""
from datetime import date, timedelta
from itertools import product

VERSION = 'state-enumeration-3.0'
METRICS = ('instrument_face','drawable','obligations','reimbursement_debt')

def eligible(item, docs):
    return item.get('verification')=='VERIFIED' and all(e['document_id'] in docs and not docs[e['document_id']].get('superseded') for e in item.get('evidence',[]))

def predicate(rule, values):
    return all(values.get(c['key'])==c['value'] for c in rule['when']) and (not rule['any_of'] or any(values.get(c['key'])==c['value'] for c in rule['any_of']))

def applies(rule, day, events):
    if rule.get('valid_from') and day<rule['valid_from'] or rule.get('valid_to') and day>rule['valid_to']:
        return False
    if rule.get('event_id'):
        event=events.get(rule['event_id'])
        if not event or not event.get('effective_on'):
            return False
        threshold=date.fromisoformat(event['effective_on'])+timedelta(days=rule['lag_days'])
        return day>=threshold.isoformat()
    return True

def evaluate(snapshot):
    docs={d['id']:d for d in snapshot['documents']}
    model, scenario = snapshot['model'], snapshot['scenario']
    instruments=sorted([i for i in snapshot['instruments'] if i['id'] in model['instrument_ids']],key=lambda i:i['id'])
    claims=sorted([c for c in snapshot['claims'] if c['id'] in model['claim_ids']],key=lambda c:c['id'])
    issues=[]; findings=[]
    def finding(kind,label,ids,evidence,amount=None,owner='COUNSEL'):
        key=kind+':'+':'.join(sorted(ids))
        if not any(f['key']==key for f in findings):
            findings.append({'key':key,'kind':kind,'label':label,'record_ids':ids,'evidence':evidence,
                             'affected_exposure_cents':amount,'owner':owner,'status':'OPEN',
                             'notice':'Investigation required; not a release authorization or savings claim.'})
    for item in instruments+claims:
        if not eligible(item,docs):
            issues.append('Review current source-backed input: '+item['label'])
            if any(docs.get(e['document_id'],{}).get('superseded') for e in item.get('evidence',[])):
                finding('SUPERSEDED_SOURCE','Replace superseded evidence for '+item['label'],[item['id']],item['evidence'])
    if len(instruments)!=len(model['instrument_ids']) or len(claims)!=len(model['claim_ids']):
        issues.append('The model references missing inputs')
    for i in instruments:
        if i.get('face_cents') is None: issues.append('Missing instrument face: '+i['label'])
    for c in claims:
        if c.get('amount_cents') is None or c.get('mapping')!='ADDITIVE' or c.get('instrument_id') not in model['instrument_ids']:
            issues.append('Resolve amount and mapping: '+c['label'])
    selected_docs={e['document_id'] for i in instruments+claims for e in i.get('evidence',[])}
    selected_docs.update(e['document_id'] for i in snapshot['facts']+snapshot['rules']+snapshot['transaction_events']+snapshot.get('document_links',[])+snapshot.get('balances',[]) if i.get('verification')!='REJECTED' for e in i.get('evidence',[]))
    for did in selected_docs:
        d=docs.get(did)
        if not d or (not d.get('superseded') and d['processing']!='REVIEWED'):
            issues.append('Finish document review: '+(d['name'] if d else did))
    agreements={docs[k].get('agreement_id') for k in selected_docs if k in docs and docs[k].get('agreement_id')}
    for d in docs.values():
        if d.get('agreement_id') in agreements and not d.get('superseded') and d['processing']!='REVIEWED':
            issues.append('Review current amendment: '+d['name'])
    rules=[r for r in snapshot['rules'] if eligible(r,docs) and r['id'] not in scenario['excluded_rule_ids'] and (scenario['view']=='HYPOTHETICAL' or not r['hypothetical'])]
    ignored=[r for r in snapshot['rules'] if r not in rules and r.get('verification')!='REJECTED']
    for r in ignored:
        finding('UNRESOLVED_TRIGGER','Rule supplies no modeling credit: '+r['label'],[r['id']],r['evidence'])
        if r.get('verification')!='VERIFIED' and r['kind'] in ('STEP_UP','OBLIGATION','ISSUANCE'):
            issues.append('Review exposure-affecting rule: '+r['label'])
    event_rows=[e for e in snapshot['transaction_events'] if eligible(e,docs)]
    events={e['id']:e for e in event_rows}
    for e in snapshot['transaction_events']:
        if e.get('verification')=='UNVERIFIED':
            finding('UNRESOLVED_TRIGGER','Review dated event: '+e['label'],[e['id']],e['evidence'])
            if e['event_type'] in ('DRAW','ISSUANCE','FACT_SET','REIMBURSEMENT'):
                issues.append('Review dated event: '+e['label'])
    for r in rules:
        if r.get('event_id') and r['event_id'] not in events:
            finding('UNRESOLVED_TRIGGER','Dated prerequisite is missing or unreviewed: '+r['label'],[r['id']],r['evidence'])
    facts=sorted(snapshot['facts'],key=lambda f:f['key'])
    keys={f['key'] for f in facts}
    for link in snapshot.get('document_links',[]):
        target=docs.get(link.get('target_document_id'))
        if not target or target.get('superseded') or not eligible(link,docs):
            finding('DOCUMENT_MISMATCH','Referenced evidence unresolved: '+link['reference_label'],[link['id']],link['evidence'])
            if link['required_for_assessment']:issues.append('Required reference unresolved: '+link['reference_label'])
        elif link.get('target_version') in ('UNCONFIRMED','LATER'):
            note=(': '+link['target_version_note']) if link.get('target_version_note') else ''
            if link['target_version']=='LATER':
                finding('VERSION_MISMATCH','Attached text is a later version than the one governing '+link['reference_label']+note,[link['id']],link['evidence'],None,'COUNSEL')
                if link['required_for_assessment']:issues.append('Required reference is attached only in a later version: '+link['reference_label'])
            else:
                finding('VERSION_MISMATCH','Governing version not confirmed for '+link['reference_label']+note,[link['id']],link['evidence'],None,'COUNSEL')
    for r in rules:
        refs={c['key'] for c in r['when']+r['any_of']} | set(r['member_keys']) | ({r['requires_key']} if r.get('requires_key') else set())
        if refs-keys: issues.append('Missing fact definitions: '+', '.join(sorted(refs-keys)))
    if set(scenario['assumptions'])-keys: issues.append('Scenario references undefined facts')
    if issues:
        return {'status':'INCOMPLETE','solver_version':VERSION,'issues':sorted(set(issues)),'findings':findings,'metrics':{},'envelope':[]}
    days={snapshot['as_of']}
    end=snapshot.get('horizon_end') or snapshot['as_of']
    def boundary(value):
        if value and snapshot['as_of']<=value<=end: days.add(value)
    boundary(end)
    for e in event_rows: boundary(e.get('effective_on'))
    for f in facts: boundary(f.get('observed_on'))
    for b in snapshot.get('balances',[]):boundary(b.get('observed_on'))
    for r in rules:
        boundary(r.get('valid_from'))
        if r.get('valid_to'): boundary((date.fromisoformat(r['valid_to'])+timedelta(days=1)).isoformat())
        if r.get('event_id') and r['event_id'] in events and events[r['event_id']].get('effective_on'):
            boundary((date.fromisoformat(events[r['event_id']]['effective_on'])+timedelta(days=r['lag_days'])).isoformat())
    if len(days)>256:
        return {'status':'UNSUPPORTED','solver_version':VERSION,'issues':['More than 256 time boundaries; split the model'],'metrics':{},'findings':findings,'envelope':[]}
    best={m:None for m in METRICS}; envelope=[]; all_states=[]; total_states=0; unknown_draw=False; unknown_metrics=set(); lower_bound=set()
    claim_rules={r['target_id'] for r in rules if r['kind']=='OBLIGATION'}
    total_dimensions=set()
    def day_state(day):
        values={f['key']:f['value'] if eligible(f,docs) and f.get('observed_on') and f['observed_on']<=day else None for f in facts}
        ordered=sorted([e for e in event_rows if e.get('effective_on') and e['effective_on']<=day],key=lambda e:(e['effective_on'],e.get('sequence',0),e['id']))
        by_time={}
        for e in ordered:
            if e['event_type']=='FACT_SET':
                sig=(e['effective_on'],e.get('sequence',0),e['fact_key'])
                if sig in by_time and by_time[sig]!=e['fact_value']: raise ValueError('Conflicting same-date fact events: '+e['fact_key'])
                by_time[sig]=e['fact_value']; values[e['fact_key']]=e['fact_value']
        for f in facts:
            if scenario['view']!='RECORDED' and f['future_mutable']: values[f['key']]=None
        values.update(scenario['assumptions'])
        dimensions=sorted(k for k,v in values.items() if v is None)
        conditional=[c for c in claims if c['kind']=='conditional' and c['id'] not in claim_rules]
        dimensions += ['claim:'+c['id'] for c in conditional]
        if len(dimensions)>12: raise OverflowError('More than 12 independent dimensions; split the model')
        total_dimensions.update(dimensions)
        return values,ordered,dimensions
    try:
        for day in sorted(days):
            values, ordered,dimensions=day_state(day)
            usable=[r for r in rules if applies(r,day,events)]
            maxima={m:None for m in METRICS}; feasible=0; gross_face=0; day_unknown_draw=False; day_lower=set()
            for bits in product((False,True),repeat=len(dimensions)):
                state={**values,**dict(zip(dimensions,bits))}
                if any((r['kind'] in ('IMPLICATION','PREREQUISITE') and predicate(r,state) and state.get(r['requires_key'])!=r['requires_value']) or
                       (r['kind']=='CARDINALITY' and predicate(r,state) and sum(bool(state[k]) for k in r['member_keys'])>r['max_active']) for r in usable):
                    continue
                face={i['id']:i['face_cents']*scenario['face_percent']//100 for i in instruments}
                draw={i['id']:None for i in instruments}; debt={i['id']:None for i in instruments}
                applied={i['id']:[] for i in instruments}; evidence={i['id']:list(i['evidence']) for i in instruments}
                balance_dates={}
                for iid in face:
                    bs=sorted([b for b in snapshot.get('balances',[]) if b['instrument_id']==iid and eligible(b,docs) and b.get('observed_on') and b['observed_on']<=day],key=lambda b:(b['observed_on'],b['id']))
                    if bs:
                        b=bs[-1]
                        same=[x for x in bs if x['observed_on']==b['observed_on']]
                        if len({(x['available_cents'],x['unreimbursed_cents']) for x in same})>1:raise ValueError('Conflicting opening balances on the same day')
                        if b['available_cents'] is not None and b['available_cents']>next(i['face_cents'] for i in instruments if i['id']==iid):raise ValueError('Opening availability exceeds documented face')
                        draw[iid]=b['available_cents'];debt[iid]=b['unreimbursed_cents'];balance_dates[iid]=b['observed_on'];evidence[iid]+=b['evidence'];applied[iid].append(b['id'])
                for i in instruments:
                    # v2 release has no effective date: it cannot establish dated v3 history.
                    spans=i.get('release_evidence',[])
                    if i['lifecycle'] in ('RELEASED','EXPIRED','CANCELLED') and not any(e.get('instrument_id')==i['id'] and e['event_type'] in ('RELEASE','EXPIRY') for e in ordered):
                        finding('RELEASE_EVIDENCE_GAP','Lifecycle alone does not release '+i['label'],[i['id']],i['evidence'],i['face_cents'],'BENEFICIARY')
                balance_last={}
                for e in ordered:
                    iid=e.get('instrument_id')
                    if iid not in face: continue
                    evidence[iid]+=e['evidence']; applied[iid].append(e['id'])
                    if e['event_type']=='ISSUANCE': face[iid]=next(i['face_cents'] for i in instruments if i['id']==iid)*scenario['face_percent']//100
                    elif e['event_type'] in ('RELEASE','EXPIRY'): face[iid]=0; draw[iid]=0
                    elif e['event_type']=='DRAW':
                        if e['effective_on']<balance_dates.get(iid,'0000'):continue
                        if debt[iid] is not None:debt[iid]+=e['amount_cents']
                        draw[iid]=e.get('remaining_available_cents')
                        if draw[iid] is not None and draw[iid]>next(i['face_cents'] for i in instruments if i['id']==iid): raise ValueError('Remaining availability exceeds documented face')
                    elif e['event_type']=='REIMBURSEMENT':
                        if e['effective_on']<balance_dates.get(iid,'0000'):continue
                        if debt[iid] is not None:
                            debt[iid]-=e['amount_cents']
                            if debt[iid]<0: raise ValueError('Reimbursement exceeds documented drawing debt')
                    if e['event_type'] in ('DRAW','REIMBURSEMENT','ISSUANCE','RELEASE','EXPIRY'):
                        sig=(iid,e['effective_on'],e.get('sequence',0))
                        if sig in balance_last: raise ValueError('Order of same-day instrument events is unresolved; record separate reviewed sequence numbers')
                        balance_last[sig]=e['event_type']
                gross=dict(face)
                # Increasing stress applies to gross and constrained exposure under the same state.
                unquantified=[]
                for iid in face:
                    step=[r for r in usable if r['kind']=='STEP_UP' and r['target_id']==iid and predicate(r,state)]
                    known=[r for r in step if r['percent'] is not None]
                    if len({r['percent'] for r in known})>1: raise ValueError('Conflicting step-up interpretations')
                    if known:
                        face[iid]=face[iid]*known[0]['percent']//100; gross[iid]=gross[iid]*known[0]['percent']//100
                    unquantified+=[r for r in step if r['percent'] is None]
                for r in unquantified:
                    finding('UNQUANTIFIED_INCREASE','Required security can increase by an unstated amount: '+r['label'],[r['id']],r['evidence'])
                if unquantified: day_lower.update(('instrument_face','drawable')); lower_bound.update(('instrument_face','drawable'))
                active=[r for r in usable if predicate(r,state)]
                for iid in face:
                    rs=[r for r in usable if r.get('target_id')==iid]
                    issuance=[r for r in rs if r['kind']=='ISSUANCE']
                    if issuance and model['basis']=='CONTRACTUAL_CAPACITY' and not any(predicate(r,state) for r in issuance): face[iid]=0; draw[iid]=0
                    limits=[r for r in active if r['kind']=='LIMIT' and r['target_id']==iid and r['metric']=='FACE']
                    if len({r['amount_cents'] for r in limits})>1: raise ValueError('Conflicting face limits; resolve controlling provisions')
                    if limits: face[iid]=min(face[iid],limits[0]['amount_cents']*scenario['face_percent']//100)
                    for r in active:
                        if r.get('target_id')!=iid: continue
                        applied[iid].append(r['id']); evidence[iid]+=r['evidence']
                        if r['kind'] in ('RELEASE','EXPIRY'): face[iid]=0; draw[iid]=0
                        if r['kind']=='REPLACEMENT' and face.get(r['successor_id'],0)>0 and face[iid]>0:
                            finding('REPLACEMENT_OVERLAP','Both predecessor and replacement remain exposed',[iid,r['successor_id']],r['evidence'],face[iid]+face[r['successor_id']],'TREASURY')
                    draw_limits=[r for r in active if r['kind']=='LIMIT' and r['target_id']==iid and r['metric']=='DRAWABLE']
                    if len({r['amount_cents'] for r in draw_limits})>1: raise ValueError('Conflicting documentary draw limits')
                    if draw_limits: draw[iid]=min(face[iid],draw_limits[0]['amount_cents']*scenario['face_percent']//100,draw[iid] if draw[iid] is not None else face[iid])
                    conditions=[r for r in rs if r['kind']=='DRAW_CONDITION']
                    if conditions and not all(predicate(r,state) for r in conditions): draw[iid]=0
                    if face[iid]==0: draw[iid]=0
                    if draw[iid] is None:
                        finding('UNRESOLVED_TRIGGER','Documentary draw rights or remaining availability unresolved',[iid],evidence[iid],face[iid],'COUNSEL')
                obligations={}; active_claims=[]
                for c in claims:
                    cr=[r for r in usable if r['kind']=='OBLIGATION' and r['target_id']==c['id']]
                    on=any(predicate(r,state) for r in cr) if cr else c['kind']=='fixed' or state.get('claim:'+c['id'],False)
                    if on:
                        amount=c['amount_cents']*scenario['obligation_percent']//100
                        limits=[r for r in active if r['kind']=='LIMIT' and r['target_id']==c['id'] and r['metric']=='OBLIGATIONS']
                        if len({r['amount_cents'] for r in limits})>1: raise ValueError('Conflicting obligation limits')
                        if limits: amount=min(amount,limits[0]['amount_cents']*scenario['obligation_percent']//100)
                        obligations[c['id']]=amount; active_claims.append(c['id'])
                totals={'instrument_face':sum(face.values()),'drawable':None if any(v is None for v in draw.values()) else sum(draw.values()),'obligations':sum(obligations.values()) if claims else None,'reimbursement_debt':None if any(v is None for v in debt.values()) else sum(debt.values())}
                if any(v is not None and v>2**53-1 for v in totals.values()): raise OverflowError('Financial totals exceed supported display precision')
                traces={'instrument_face':face,'drawable':draw,'obligations':obligations,'reimbursement_debt':debt}
                feasible+=1; gross_face=max(gross_face,sum(gross.values()))
                for metric,value in totals.items():
                    if value is None:
                        unknown_metrics.add(metric)
                        if metric=='drawable':unknown_draw=True;day_unknown_draw=True
                        continue
                    record={'maximum_cents':value,'state':state,'as_of':day,'contributions':traces[metric],
                            'active_claims':active_claims,'applied_rules':sorted(set(x for xs in applied.values() for x in xs)),
                            'evidence_by_instrument':evidence,
                            'rule_trace':[{'rule_id':r['id'],'kind':r['kind'],'target_id':r.get('target_id'),'condition_matches':predicate(r,state),'evidence':r['evidence']} for r in usable]}
                    record['applied_rules']=sorted(set(record['applied_rules']) | {r['id'] for r in usable if r['kind'] in ('CARDINALITY','IMPLICATION','PREREQUISITE','ISSUANCE','OBLIGATION','DRAW_CONDITION')})
                    if maxima[metric] is None or value>maxima[metric]['maximum_cents']: maxima[metric]=record
                    if best[metric] is None or value>best[metric]['maximum_cents']: best[metric]=record
                if len(all_states)<128: all_states.append({'as_of':day,'state':state,'totals':totals})
            if not feasible: raise ValueError('No feasible state; resolve contradictory reviewed rules')
            envelope.append({'as_of':day,'feasible_states':feasible,'gross_instrument_face_cents':gross_face,
                             'maxima':{m:maxima[m]['maximum_cents'] if maxima[m] and not (m=='drawable' and day_unknown_draw) else None for m in METRICS}})
            if day_lower: envelope[-1]['lower_bound_metrics']=sorted(day_lower)
            total_states+=feasible
    except (ValueError,OverflowError) as exc:
        return {'status':'UNSUPPORTED' if isinstance(exc,OverflowError) else 'INCOMPLETE','solver_version':VERSION,'issues':[str(exc)],'findings':findings,'metrics':{},'envelope':[]}
    if unknown_draw: best['drawable']=None
    for metric in unknown_metrics:best[metric]=None
    if not claims:finding('DOCUMENT_MISMATCH','Underlying obligations are outside the supplied model',[model['id']],[])
    for f in facts:
        if not eligible(f,docs) or f['value'] is None or not f.get('observed_on'):
            finding('UNRESOLVED_TRIGGER','Recorded fact remains unknown: '+f['label'],[f['id']],f['evidence'])
    for c in claims:
        iid=c['instrument_id']
        if iid not in best['instrument_face']['contributions']:
            finding('DOCUMENT_MISMATCH','Obligation is not mapped to a modeled instrument',[c['id']],c['evidence'])
    metrics={m:({'maximum_cents':None,'basis':'UNKNOWN','notice':'Documentary rights or balances are not sufficiently established.'} if best[m] is None else {**best[m],'basis':'REVIEWED_MODEL'}) for m in METRICS}
    for m in lower_bound:
        if best[m] is not None: metrics[m].update(basis='LOWER_BOUND',notice='A reviewed provision can increase this amount by an unstated size; the true maximum is at least this figure.')
    estimated=sorted(c['id'] for c in claims if c.get('estimate') and best['obligations'] and c['id'] in best['obligations']['active_claims'])
    if estimated:
        metrics['obligations'].update(basis='ESTIMATE',estimated_claim_ids=estimated,notice='Includes estimated amounts subject to final true-up; the settled figure may be greater or lesser.')
    gross=max(e['gross_instrument_face_cents'] for e in envelope)
    return {'status':'COMPLETE','solver_version':VERSION,'issues':[],'metrics':metrics,'findings':findings,
            'gross_instrument_face_cents':gross,'modeled_difference_cents':gross-metrics['instrument_face']['maximum_cents'],
            'envelope':envelope,'feasible_states':total_states,'dimensions':sorted(total_dimensions),'states':all_states,
            'states_truncated':total_states>128,'ignored_rules':[r['id'] for r in ignored],
            'basis':model['basis'],'view':scenario['view'],
            'evidence_scope':{'document_ids':sorted(selected_docs),'reviewed_rule_ids':[r['id'] for r in rules],'unknown_fact_keys':[f['key'] for f in facts if f['value'] is None or not eligible(f,docs)]},
            'economic_metrics':{'facility_usage':None,'cash_released':None,'capital_saved':None},
            'notice':'Exact within the reviewed bounded model. Not a legal opinion, complete legal-state inventory, or confirmed economic benefit.'}
