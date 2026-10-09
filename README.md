# LoadBond — evidence workbench with experimental local AI

A working local application for local AI proposals, manual source-backed records, separate input review, exposure calculations, and historical replay. Local extraction remains experimental because its evaluation gate has not passed. New workspaces start empty; synthetic fixtures are optional.

The workbench opens on the v3 state engine (**Transaction**, **Sources & Review**, **States**, **Decision Brief**): exact, dated enumeration of reviewed contractual rules with separate face, drawable, obligation and reimbursement-debt metrics. See [the state-engine release](docs/state-engine/release.md); its local clause extraction is experimental.

Choose **Explore the transaction case** for Riverbend: selecting a site retains $30M instrument exposure; explicit synthetic release review changes it to $18M; withdrawing release support restores $30M. Underlying obligations remain separate at $20M. The walkthrough uses the server solver, current source evidence, explicit decisions, and immutable history. Its initial inputs are authored and pre-reviewed, not AI-extracted or user-approved.

See [the product brief](docs/transaction/product-brief.md), [90-second demonstration script](docs/transaction/demo-script.md), and [verification record](docs/transaction/verification.json). Earlier videos and submission decks show earlier milestones; they do not depict the current transaction walkthrough. No commercial benefit or legal feasibility has been validated.

## Run

Requirements: Python 3.12+, Node 20.9+ (Next.js 16), pnpm (`corepack enable` provides it). From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
cd frontend
corepack enable
pnpm install --frozen-lockfile
cd ..
.\start.ps1
```

Open http://127.0.0.1:3001/ with token `local-demo`. Dependencies are installed on the authoring machine. The launcher accepts executable paths and explicit frontend/backend ports, checks readiness, and preserves occupied ports. Both servers bind to loopback.

For local AI, run `setup-local-ai.ps1`, start `start-local-ai.ps1` in another terminal, then rerun setup to pull qwen3:4b. Runtime/models live under the enclosing chat's work directory. No paid inference or cloud fallback is used. See `docs/local-ai-release.md` for the measured evaluation and workflow.

## Use

Save your local reviewer name, create a project, add sites, and upload an ordinary prose agreement. Enter instruments and obligations using selected source text or an exact pasted quotation. Review each input separately, complete the document review, and calculate a saved scenario.

Use `samples/harbor-agreement.txt` to follow the walkthrough in `docs/v2-release.md`. It uses ordinary prose, not special parser syntax. This fixture is synthetic. The optional North Ridge sample reproduces the earlier $80M/$52.2M/$67M scenarios with explicit modeling assumptions.

Instruments default to full face exposure. Claim constraints do not automatically restrict LC draw rights. Claim-limited modeling and release evidence require their own reviewed sources. User review is not a legal opinion. Unknown bank/cash/guarantee/surety values stay unknown; modeled differences are not capital savings.

Material edits mark prior assessments historical. Replacing a document invalidates affected reviews. Old snapshots still export and replay. Print report opens the selected assessment's evidence before printing.

## Verify

```powershell
.\.venv\Scripts\python.exe -m pytest backend -q
cd frontend
pnpm build
```

74 tests pass (October 9), covering the v1/v2/v3 solvers, extraction failure atomicity, non-financial sentence withholding, isolation, review separation, the Riverbend case, state-engine release timing and legacy regressions. Production build and browser verification passed. See `docs/local-ai-release.md` and `docs/verification.md` for evidence and boundaries. Run `python -m backend.evaluate_local` separately for live model evaluation.

## Architecture and compatibility

Next.js → same-origin proxy → FastAPI → project-scoped SQLite entity tables and content-addressed original files. The API validates typed input records, source offsets and cross-project references. Project foreign keys and transaction boundaries are enforced. Record payloads remain JSON within individual entity tables.

V2 API routes are under `/v2` and state-engine routes under `/v3`; the browser uses `/api/v2` and `/api/v3`. Full OpenAPI is available locally at http://127.0.0.1:8000/docs and in `schemas/openapi.json`. Generate schemas with `python -m backend.export_schemas`.

Current data lives in `data/workbench.sqlite` and `data/objects`, excluded from Git and the source ZIP. The prior database remains `data/loadbond.sqlite`. Import historical v1 workspace copies its project and original runs into v2 once per token without overwriting it. The old interface is `/legacy`; old snapshots replay with enumeration-1.0 and new ones with enumeration-2.0.

## Boundaries

This release supports manual entry and optional local Ollama extraction. Pipeline local-evidence-1.3 passes all 12 cases of the original synthetic corpus (100% precision and recall), but that corpus informed the fix; on the unseen 20-document held-out set, financial precision is 50% and recall 67%, so extraction remains experimental. Proposals require source validation, explicit import, and separate human review. It supports USD, additive liability components, cardinality constraints, and at most 20 conditional dimensions. Ambiguous components, missing amounts and unfinished documents block completed assessments.

Local workspace tokens are not production identity, permissions or MFA. Hash-linked records and immutable snapshots are application behavior, not administrator-proof WORM storage. Use public or synthetic evidence only. Confidential documents, OCR, customer hosting, PostgreSQL, managed storage and production security are deferred.

No event submission, public deployment or commercial validation is claimed complete. The narrated walkthrough video uses actual browser captures rather than a continuous screen recording. Submission drafts and the updated eight-slide deck remain reviewable local assets.
