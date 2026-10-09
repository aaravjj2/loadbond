# State engine (v3) — contractual-state assessments

The default workspace view at `/` (the **Transaction**, **Sources & Review**, **States** and **Decision Brief** tabs) runs on the v3 state engine. It models dated, reviewed contractual interpretations instead of the v2 claim/instrument register. The v2 registers, the Riverbend walkthrough and local financial extraction remain available in the same workbench.

## What it computes

`backend/state_engine.py` (`state-enumeration-3.0`) evaluates a frozen snapshot of one state model:

- **Inputs:** reviewed instruments and claims (shared with v2), dated facts, transaction events (issuance, draw, reimbursement, release, expiry, fact set), contract rules (cardinality, implication, prerequisite, step-up, limit, draw condition, obligation, issuance, release/expiry, replacement), document links and opening balances. Only `VERIFIED` records backed by current, reviewed documents count.
- **Time:** every relevant date between `as_of` and `horizon_end` becomes a boundary (at most 256). Each day is evaluated separately and reported in an envelope.
- **States:** unknown facts and unconstrained conditional claims become binary dimensions (at most 12 per day). All combinations are enumerated exactly; rules filter out infeasible states.
- **Metrics:** `instrument_face`, `drawable`, `obligations` and `reimbursement_debt`. Each has its own maximizing state and contributions. Debt and LC face are never added together. A metric whose rights or balances are not established is reported as `UNKNOWN`, not zero.
- **Findings:** superseded sources, unreviewed triggers, release-evidence gaps ("lifecycle alone does not release"), replacement overlaps and document mismatches. Each finding is an investigation item with an owner, not a release authorization.
- **Views:** `RECORDED`, `FUTURE` (future-mutable facts become unknown) and `HYPOTHETICAL` (hypothetical rules allowed). Each new model starts with one scenario per view.

`economic_metrics` (facility usage, cash released, capital saved) is always `null`. The engine does not estimate economic benefit.

## API

Routes are under `/v3` (browser: `/api/v3`). Workspace: `GET /projects/{pid}`. Records: `POST/PATCH /projects/{pid}/{models|facts|events|rules|scenarios|document-links|balances}`. Review: `POST /projects/{pid}/{table}/{key}/review`. Source quotes: `POST /projects/{pid}/source-spans`. Assessments: `POST /projects/{pid}/assessments`, `GET …/{key}`, `POST …/{key}/replay`, `GET …/{key}/export`. Comparisons: `POST /projects/{pid}/comparisons`. Findings: `POST /projects/{pid}/findings/{key}/disposition`. Reference packages: `POST /references/{public|synthetic}`; the public package cites an SEC EDGAR financing-agreement exhibit, and the synthetic one is the Juniper agreement in `samples/state-reference/`.

Editing a model, fact or event revokes the review of dependent rules. Assessments store immutable snapshots and replay exactly.

## Local clause extraction (experimental)

`backend/clause_extraction.py` (prompt `local-clauses-1.1`) proposes rules and events from a document through the same local Ollama worker as financial extraction. Proposals are validated against source text, imported unverified and reviewed separately.

Measured on the synthetic 40-document state corpus (`samples/state-corpus`, 20 development + 20 held-out, labels frozen by hash). The gate is precision ≥ 95%, recall ≥ 90%, and every empty case must stay empty.

| Split | Task | Precision | Recall | Gate |
|---|---|---|---|---|
| Development | Clauses | 80.0% | 88.9% | Failed |
| Development | Financial | 13.3% | 66.7% | Failed |
| Held-out | Clauses | 75.0% (15/20) | 83.3% (15/18) | Failed; 0/2 empty cases stayed empty |
| Held-out | Financial | 14.3% (2/14) | 66.7% (2/3) | Failed; 6/17 empty cases stayed empty |

Held-out results confirm the development numbers: financial proposals on documents that contain no payable amount are the main precision failure.

Reports: `local-ai-development-evaluation.json`, `local-ai-held_out-evaluation.json` (first held-out scoring, run before any further tuning) and `local-ai-development-baseline-1.0.json` (prompt 1.0). Clause extraction remains experimental.

## Boundaries

Exact within the reviewed, bounded model only. Not a legal opinion, a complete inventory of legal states, or a confirmed economic benefit. Models with more than 12 unknown dimensions on one day or more than 256 time boundaries return `UNSUPPORTED` and must be split. `docs/state-engine/prototype.html` is a static design mock, not the running application.
