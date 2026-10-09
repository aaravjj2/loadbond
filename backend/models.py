"""Published MVP record schemas. Production jurisdiction/role policy remains separate."""
from typing import Literal
from pydantic import BaseModel, Field


class SourceSpan(BaseModel):
    page: int = Field(ge=1)
    quote: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    sha256: str


class ClaimRecord(BaseModel):
    id: str
    label: str
    document_id: str
    instrument_id: str | None
    site_id: str | None
    amount_cents: int | None = Field(ge=0)
    currency: Literal['USD']
    kind: Literal['fixed','conditional']
    legal_status: str
    verification: Literal['UNVERIFIED','VERIFIED','REJECTED']
    source: SourceSpan
    extraction: dict


class InstrumentRecord(BaseModel):
    id: str
    site_id: str
    face_cents: int = Field(ge=0)
    currency: Literal['USD']
    lifecycle: str
    release_verified: bool


class DocumentVersion(BaseModel):
    id: str
    agreement_id: str
    version: int = Field(ge=1)
    name: str
    pages: list[str]
    sha256: str
    superseded: bool
    processing: Literal['UPLOADED','EXTRACTED','REVIEWED']
    source: str
