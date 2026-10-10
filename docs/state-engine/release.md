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

`backend/clause_extraction.py` (prompt `local-clauses-1.2`) proposes rules and events from a document through the same local Ollama worker as financial extraction. Proposals are validated against source text, imported unverified and reviewed separately. Since 1.2, instruction-like sentences cannot be selected as quotations; a RELEASE or EXPIRY event whose quotation records no completed release becomes a NOTICE with an explanation; and sentences that mention no instrument, obligation or project term are withheld and listed on the job.

Measured on the synthetic 40-document state corpus (`samples/state-corpus`, 20 development + 20 held-out, labels frozen by hash). The gate is precision ≥ 95%, recall ≥ 90%, and every empty case must stay empty. Pipelines are named clause/financial.

| Split | Task | 1.1 / 1.2 | 1.1 / 1.3 | 1.2 / 1.4 |
|---|---|---|---|---|
| Development | Clauses | P 80.0% / R 88.9% | unchanged | P 94.4% (17/18) / R 94.4%; 2/2 empty |
| Development | Financial | P 13.3% / R 66.7% | P 100% (2/2) / R 66.7%; 17/17 empty | P 100% (3/3) / R 100%; 17/17 empty |
| Held-out | Clauses | P 75.0% / R 83.3%; 0/2 empty | unchanged | **P 88.2% (15/17) / R 83.3%; 2/2 empty** |
| Held-out | Financial | P 14.3% (2/14) / R 66.7%; 6/17 empty | P 50.0% (2/4) / R 66.7%; 15/17 empty | **P 60.0% (3/5) / R 100%; 15/17 empty** |

All gates still fail. Each change was designed from the development split and the original 12-case corpus only; held-out was scored once afterwards. Held-out failures under 1.2/1.4, recorded but not tuned against: the off-topic screen withheld a genuine cap clause ("documentary demands are capped at EUR 310,000"), a regression it introduced; two past events phrased as "a draw occurred" and "paid back" were published as financial obligations; and two clause labels were confused (REPLACEMENT for IMPLICATION, PREREQUISITE for ISSUANCE). Because these are now known, the held-out split no longer counts as unseen for those patterns; new held-out fixtures are needed before the next round.

Reports: `local-ai-{development,held_out}-evaluation.json` (current), `…-1.2.json` (financial pipeline 1.2) and `local-ai-development-baseline-1.0.json` (clause prompt 1.0). Clause extraction remains experimental.

## Boundaries

Exact within the reviewed, bounded model only. Not a legal opinion, a complete inventory of legal states, or a confirmed economic benefit. Models with more than 12 unknown dimensions on one day or more than 256 time boundaries return `UNSUPPORTED` and must be split. `docs/state-engine/prototype.html` is a static design mock, not the running application.
