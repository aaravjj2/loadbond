"""Versioned, non-executable contractual modeling vocabulary."""
from datetime import date
from typing import Literal
from pydantic import Field, model_validator
from .v2 import Strict, Evidence

Key = str
class StateModel(Strict):
    name: str = Field(min_length=1, max_length=160)
    basis: Literal['RECORDED_POSITION','CONTRACTUAL_CAPACITY'] = 'RECORDED_POSITION'
    instrument_ids: list[str] = Field(min_length=1, max_length=100)
    claim_ids: list[str] = Field(default_factory=list, max_length=200)
    version: str = Field(default='1.0', min_length=1, max_length=40)
    scope_notes: str = Field(default='',max_length=2000)

class Condition(Strict):
    key: str = Field(pattern=r'^[a-z][a-z0-9_]{0,63}$')
    value: bool

class DatedFact(Strict):
    model_id: str
    key: str = Field(pattern=r'^[a-z][a-z0-9_]{0,63}$')
    label: str = Field(min_length=1, max_length=160)
    value: bool | None = None
    observed_on: date | None = None
    future_mutable: bool = False
    evidence: list[Evidence] = Field(default_factory=list)

class TransactionEvent(Strict):
    model_id: str
    label: str = Field(min_length=1, max_length=160)
    event_type: Literal['FACT_SET','ISSUANCE','RELEASE','EXPIRY','DRAW','REIMBURSEMENT','NOTICE','AMENDMENT']
    executed_on: date | None = None
    effective_on: date | None = None
    sequence: int = Field(default=0, ge=0, le=1000)
    instrument_id: str | None = None
    fact_key: str | None = Field(default=None, pattern=r'^[a-z][a-z0-9_]{0,63}$')
    fact_value: bool | None = None
    amount_cents: int | None = Field(default=None, ge=0, le=10**15, strict=True)
    remaining_available_cents: int | None = Field(default=None, ge=0, le=10**15, strict=True)
    evidence: list[Evidence] = Field(min_length=1)
    @model_validator(mode='after')
    def shape(self):
        if self.event_type=='FACT_SET' and (not self.fact_key or self.fact_value is None):
            raise ValueError('FACT_SET requires a fact key and boolean value')
        if self.event_type in ('ISSUANCE','RELEASE','EXPIRY','DRAW','REIMBURSEMENT') and not self.instrument_id:
            raise ValueError('Instrument event requires instrument_id')
        if self.event_type in ('DRAW','REIMBURSEMENT') and self.amount_cents is None:
            raise ValueError('Draw/reimbursement amount must be explicit')
        return self

class ContractRule(Strict):
    model_id: str
    label: str = Field(min_length=1, max_length=160)
    interpretation: str = Field(min_length=3, max_length=2000)
    kind: Literal['IMPLICATION','PREREQUISITE','CARDINALITY','ISSUANCE','REPLACEMENT','RELEASE','EXPIRY','LIMIT','STEP_UP','EVERGREEN','DRAW_CONDITION','OBLIGATION']
    target_id: str | None = None
    successor_id: str | None = None
    when: list[Condition] = Field(default_factory=list, max_length=12)
    any_of: list[Condition] = Field(default_factory=list, max_length=12)
    member_keys: list[str] = Field(default_factory=list, max_length=12)
    max_active: int | None = Field(default=None, ge=0, le=12)
    requires_key: str | None = Field(default=None, pattern=r'^[a-z][a-z0-9_]{0,63}$')
    requires_value: bool = True
    metric: Literal['FACE','DRAWABLE','OBLIGATIONS'] = 'FACE'
    amount_cents: int | None = Field(default=None, ge=0, le=10**15, strict=True)
    percent: int | None = Field(default=None, ge=100, le=1000, strict=True)
    valid_from: date | None = None
    valid_to: date | None = None
    event_id: str | None = None
    lag_days: int = Field(default=0, ge=0, le=3650)
    hypothetical: bool = False
    evidence: list[Evidence] = Field(min_length=1)
    @model_validator(mode='after')
    def shape(self):
        if self.valid_from and self.valid_to and self.valid_from>self.valid_to:
            raise ValueError('Rule interval is reversed')
        if self.kind in ('IMPLICATION','PREREQUISITE') and not self.requires_key:
            raise ValueError('Implication/prerequisite requires a consequent fact')
        if self.kind=='CARDINALITY' and (not self.member_keys or len(set(self.member_keys))!=len(self.member_keys) or self.max_active is None):
            raise ValueError('Cardinality requires unique members and a cap')
        if self.kind not in ('IMPLICATION','PREREQUISITE','CARDINALITY') and not self.target_id:
            raise ValueError('Rule requires a target instrument or obligation')
        if self.kind=='REPLACEMENT' and not self.successor_id:
            raise ValueError('Replacement requires a successor instrument')
        if self.kind=='LIMIT' and self.amount_cents is None:
            raise ValueError('Limit amount is unresolved')
        if self.kind=='STEP_UP' and self.percent is None:
            raise ValueError('Step-up percentage is unresolved')
        if self.lag_days and not self.event_id:
            raise ValueError('Release lag requires a dated source event')
        return self

class StateScenario(Strict):
    model_id: str
    name: str = Field(min_length=1, max_length=160)
    view: Literal['RECORDED','FUTURE','HYPOTHETICAL'] = 'FUTURE'
    assumptions: dict[str,bool] = Field(default_factory=dict)
    excluded_rule_ids: list[str] = Field(default_factory=list)
    face_percent: int = Field(default=100, ge=100, le=1000, strict=True)
    obligation_percent: int = Field(default=100, ge=100, le=1000, strict=True)
    @model_validator(mode='after')
    def shape(self):
        if self.view!='HYPOTHETICAL' and (self.assumptions or self.excluded_rule_ids or self.face_percent!=100 or self.obligation_percent!=100):
            raise ValueError('Overrides and stress multipliers require a hypothetical scenario')
        return self

class StateAssessment(Strict):
    model_id: str
    scenario_id: str
    as_of: date
    horizon_end: date | None = None
    request_id: str | None = Field(default=None,min_length=8,max_length=100)
    @model_validator(mode='after')
    def shape(self):
        if self.horizon_end and (self.horizon_end<self.as_of or (self.horizon_end-self.as_of).days>1826):
            raise ValueError('Horizon must be after as-of and within five years')
        return self

class StateComparison(Strict):
    model_id: str
    scenario_ids: list[str] = Field(min_length=2,max_length=4)
    as_of: date
    horizon_end: date | None = None
    @model_validator(mode='after')
    def horizon(self):
        if self.horizon_end and (self.horizon_end<self.as_of or (self.horizon_end-self.as_of).days>1826):raise ValueError('Horizon must be after as-of and within five years')
        return self

class FindingDisposition(Strict):
    status: Literal['OPEN','INVESTIGATING','RESOLVED']
    owner: Literal['TREASURY','COUNSEL','BANK','BENEFICIARY']
    reason: str = Field(min_length=3,max_length=2000)

class SourceSelection(Strict):
    document_id: str
    page: int = Field(ge=1)
    quote: str = Field(min_length=1,max_length=20000)

class DocumentLink(Strict):
    model_id: str
    source_document_id: str
    reference_label: str = Field(min_length=1,max_length=200)
    relationship: Literal['REFERENCES','AMENDS','SUPPLEMENTS','NOTICE_FOR','RELEASE_FOR'] = 'REFERENCES'
    target_document_id: str | None = None
    required_for_assessment: bool = True
    evidence: list[Evidence] = Field(min_length=1)

class OpeningBalance(Strict):
    model_id: str
    label: str = Field(min_length=1,max_length=160)
    instrument_id: str
    observed_on: date | None = None
    available_cents: int | None = Field(default=None,ge=0,le=10**15,strict=True)
    unreimbursed_cents: int | None = Field(default=None,ge=0,le=10**15,strict=True)
    evidence: list[Evidence] = Field(min_length=1)
