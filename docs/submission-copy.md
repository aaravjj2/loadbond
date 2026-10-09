# LoadBond submission copy

## Title and tagline

LoadBond — Know what your security actually secures.

An evidence-based workbench for infrastructure obligations and modeled financial exposure.

## Problem

Infrastructure projects can involve several sites, agreements and security instruments. A commercial decision to leave a site does not by itself establish that an outstanding instrument has been released. Reviewing obligations, documentary conditions and release evidence across these records is the problem LoadBond explores.

## What we built

A Next.js and FastAPI local application that starts with an empty workspace. Users create projects and sites, upload ordinary prose contracts, record obligations and instruments with exact source quotations, review them, define constraints and scenarios, and compute deterministic exposure. Each run preserves its inputs and evidence for export and replay. The application includes versioning, amendment invalidation, audit records and project isolation.

The current release uses optional local Ollama/qwen3:4b extraction alongside manual entry. Source-sentence selection and numerical validation constrain proposals; explicit import creates unverified records, followed by separate review. A 12-document synthetic evaluation passed 10 cases with 83.33% precision and 93.75% recall on clear USD cases. Precision failed the 90% gate, so extraction stays experimental. AI coding assistance was used during implementation.

## Demonstration

Four sites have $80M in synthetic security. With independent obligations, the model returns $80M. Under an explicitly approved hypothetical two-branch constraint, it returns $52.2M. A three-branch release-delay stress raises the result to $67M. The difference is modeled exposure, not confirmed savings, cash release or bank capacity.

The new walkthrough creates Harbor renewal from scratch. Its reviewed one-branch cap lowers obligations from $500,000 to $300,000 while LC face exposure stays $500,000. Only a separately reviewed hypothetical draw basis lowers modeled exposure. Amendment blocks completion until re-review, while the original result stays reproducible. All amounts are synthetic.

The local-AI walkthrough uses a new Cedar agreement outside the scored corpus. Actual extraction proposed a $650,000 LC and $90,000/$150,000 obligations. After separate imports, mapping confirmation and reviews, modeled exposure remained $650,000 with $240,000 maximum obligations. The downloaded evidence package preserved extraction provenance and replayed exactly. This is synthetic software behavior, not commercial or legal validation.

## What is distinctive

The proposed extraction and the exposure decision are separate. Human review controls the records. The solver uses documented constraints and a frozen input snapshot. Unverified dependencies provide no reduction credit; unprocessed documents or unreviewed claims make the assessment incomplete.

## Commercial validation

The first offer to test is a security diagnostic for developer treasury, supported by counsel review. We will reconstruct actual timelines, ask banks for measurable economic treatment and invite utilities to identify any protection shortfall. The cross-site thesis remains unvalidated. We will stop investing in it if adequate historical evidence does not meet the documented threshold.

## Provenance and limitations

The starting materials were an existing synthetic HTML prototype and a research report. This implementation replaces the hard-coded UI calculation with a Python solver and adds document/review/persistence/export workflows. Disclose these materials and the dates of new work for each event. AI coding assistance was used. No bank writes, real collateral actions or legal opinions are provided.

## Before submission

- Enter founder identity and verified eligibility in the event's own fields.
- Add the actual repository, hosted demo and video URLs; none are fabricated here.
- Review the event's exact track prompt and required custom fields.
- Confirm public access from a signed-out session.
- Keep confidential records out of the repository and demo.
- Describe the tested local-model workflow accurately and disclose its failed quality gate. Public AI hosting has not been implemented.
- Do not submit to Galuxium without resolving prior-work eligibility.
