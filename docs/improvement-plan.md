# LoadBond improvement plan — phased, executable in fresh chat contexts

Authored October 9, 2026, 7:30 p.m. EDT. Each phase is self-contained: open a new chat, paste the phase, and follow its references. Do not skip a phase's verification checklist. Paths are relative to `fp/outputs/loadbond/` unless stated.

## Status — October 9, 8:00 p.m. EDT (see `git log`)

- **Phase 1 done**, except a new demo video (Phase 8). Baseline commit; byte-exact `.gitattributes`; docs reconciled; `docs/state-engine/release.md`; ZIP regenerated (206 files) and verified from a clean unzip (76 tests pass, typecheck passes). Launcher fixed for Windows PowerShell 5.1: an em-dash broke parsing, and `Invoke-WebRequest` needed `-UseBasicParsing`.
- **Phase 3 done.** Versioned migrations in `v2.migrate`, plus `test_migrations.py`. A copy of the real database replays all 14 v2 runs exactly.
- **Phase 4 done, gate still failing.** Extraction 1.3 scores 12/12 on the original corpus (which informed the fix); held-out financial precision went from 14% to 50%. Financial 1.4 / clauses 1.2 then raised held-out financial to P 60% / R 100% and clauses to P 88% / R 83% with both empty documents empty. Remaining: new held-out fixtures before any more tuning.
- **Phase 5 partly done.** Held-out baseline scored before tuning. Clause extraction unchanged: held-out P 75% / R 83%, with 0/2 empty cases staying empty.
- **Phase 2 open.** Deleting `frontend/app/experience/` needs founder approval. Button `type` fixes are deferred because adding them blindly could break form submission.
- Phases 6–7 not started.

## State measured before this work

| Fact | Evidence |
|---|---|
| Backend: **62 tests pass** (50 test functions, some parametrized), 1 Starlette/httpx deprecation warning | `.venv\Scripts\python.exe -m pytest backend -q` |
| Frontend typecheck passes | `node node_modules/typescript/bin/tsc --noEmit` in `frontend/` |
| `pnpm` is **not on PATH**; Node on PATH is **v20.14**, README requires 22+ | shell |
| Three API layers: v1 (`main.py`, no prefix), v2 (`v2.py`, `/v2`, solver `enumeration-2.0`), v3 state engine (`state_api.py` + `state_engine.py`, `/v3`, `state-enumeration-3.0`, 12-dimension limit) | `main.py:288-289`, `v2.py:551-555`, `state_api.py:18-19,235-237`, `state_engine.py:125` |
| `/` renders `workbench.tsx`, default view `model` = **StateWorkspace (v3)**; Riverbend is a tab; `/legacy` is v1 | `page.tsx`, `workbench.tsx:166,178-180,558-559` |
| `frontend/app/experience/` (~6k lines incl. 3.4k CSS) is the abandoned redesign, not routed | `docs/transaction/product-brief.md:33`; no importer of `experience/app.tsx` |
| "Migrations" are stamped, not run: every connection re-runs `CREATE TABLE IF NOT EXISTS` and inserts versions 1–3 | `v2.py:107-126` |
| `clause_jobs` table is created but never written; `models.py` is imported by nothing | `v2.py:22`, `state_api.py:68` |
| Financial extraction: 10/12 cases, precision 83.33%, recall 93.75%, gate failed. Failures: `05-missing` (extra proposal), `11-injection` (whole job rejected) | `docs/local-extraction-evaluation.json`, `evaluate_local.py:39` |
| State-engine clause AI (development split only): clauses P 0.80 / R 0.89; financial P **0.13** / R 0.67; **held_out split never evaluated** | `docs/state-engine/local-ai-development-evaluation.json` |
| `LoadBond-source.zip` (138 entries) predates the state engine: no `state_engine.py`, `state-workspace.tsx`, `state-corpus/` | zip inspection; `docs/package-manifest.json` |
| `loadbond/.git` exists with **no commits** | git |
| Docs disagree: 22 / 31 / 41 / 45 tests; README/scorecard/submission copy don't mention v3; `submission-copy.md` and `docs/demo-script.md` pre-date Riverbend | `README.md:44`, `verification.md:3,15,31`, `transaction/verification.json:4` |
| No frontend tests, no ESLint, no format script; most `<button>`s lack `type="button"` | `frontend/package.json` |
| Graphiques deadline: **Oct 10, 5 p.m. EDT** (internal target 3 p.m.) | `docs/action-plan.md:14` |

---

## Phase 0 — Documentation discovery (consolidated; already done tonight)

Every later phase relies on this list. Re-read the cited lines before you edit anything near them.

### Allowed APIs and patterns (verified in source)

- **Auth:** `main.auth(authorization: str = Header(''))` maps a bearer token to a tenant through the `LOADBOND_TOKENS` JSON (default `{"local-demo":"demo"}`) — `main.py:24-32`. v2 and v3 reuse this same `auth`.
- **v2 install chain:** `v2.install(app, auth, data_path)` → `local_extraction.install(app, router, auth, db, get_project, get, rows, put, audit, evidence, validate_links, Instrument, Claim)` → `state_api.install(app, auth, db, get_project, get, rows, put, audit, evidence, create_project, data_path)` → `clause_extraction.install(router, …)` — `v2.py:551-555`, `state_api.py:235-237`.
- **DB helpers (closures inside `v2.install`):** `db()` context manager (opens with `BEGIN IMMEDIATE`), `get_project(c, pid, tenant)`, `get(c, table, pid, id)`, `rows(c, table, pid)`, `put(c, table, pid, body)`, `audit(...)`. Tables come from `TABLES` — `v2.py:21-22`.
- **Review flow to copy:** the v2 `review` handler — `v2.py:288-329`.
- **Replay dispatch:** `v2.py:451-456` (`enumeration-1.0` → `domain.solve`, otherwise `v2.solve`).
- **Extraction internals:** `PROMPT_VERSION='local-evidence-1.2'` (`local_extraction.py:18`); `PROMPT` (`:82-94`); `extract_chunk` builds quote/amount **schema enums** from the source (`:96-113`); `chunks` (8000/600) (`:115-123`); `validate_candidate` (`:140-174`); atomic publish/fail (`:263-264`). Clause variant: `clause_extraction.py`, `PROMPT_VERSION='local-clauses-1.1'`.
- **Evaluation harnesses:** `python -m backend.evaluate_local` (financial; pass rule at `evaluate_local.py:39`; gate at `:56`); `python -m backend.evaluate_state_ai --split {development,held_out,all}` (writes `docs/state-engine/local-ai-{split}-evaluation.json`).
- **Test fixture pattern:** `TestClient(main.app)` plus monkeypatching `main.DATA`/`main.TOKENS` — `test_v2.py:10-44`.
- **Frontend fetch helpers:** v2 `workbench.tsx:105-128`; v3 `state-workspace.tsx:98-122`; proxy `app/api/[...path]/route.ts` (`LOADBOND_API_URL`, forwards `authorization` + `content-type`, exports GET/POST/PATCH only).
- **Next.js 16 docs:** `frontend/node_modules/next/dist/docs/` (`01-app/…`). `frontend/AGENTS.md` requires reading them before writing Next code.
- **Packaging:** `fp/work/package_loadbond.py` (allow-list of roots/files; regenerates `docs/package-manifest.json`).

### Anti-patterns (do not do these)

- Do not invent a migration framework API; there is none. Phase 3 builds one.
- Do not change the solver output or hashes of `enumeration-1.0` / `enumeration-2.0`, or of stored snapshots. Replay must stay byte-identical.
- Do not mark extraction "production ready" or relax the gate (precision ≥ 0.90, recall ≥ 0.90, all cases pass).
- Do not tune prompts against the **held_out** split. Use development cases only, then score held_out once.
- Do not add cloud or paid inference. Ollama stays loopback-only (`127.0.0.1:11434`).
- Do not add PUT/DELETE calls from the frontend without adding them to the proxy route.
- Do not describe modeled differences as savings, or synthetic reviews as legal opinions (see README "Boundaries").

---

## Phase 1 — Submission readiness (P0, before Oct 10 3 p.m. EDT, ~3–4 h)

**Goal:** what judges download and read matches what the code does.

### What to implement
1. **Baseline commit.** In `loadbond/`, run `git add -A && git commit -m "Baseline: v1/v2/v3 + Riverbend + local AI"`. Check `.gitignore` first: it already excludes `.venv`, `node_modules`, `.next`, `data`, `.env`, `*.tsbuildinfo`. Also confirm `.pytest_cache/` is excluded and no `.mp4`/`.pptx` over 50 MB is staged.
2. **Pick the demo story** (founder decision): Riverbend (v2 tab), the state engine (v3, the current default view), or both. Record it as D12 in `docs/decision-log.md`, using the format of D10/D11 (lines 21-23).
3. **Reconcile docs with measured facts.** Make all of these say 62 tests, or "N tests" re-measured at that moment:
   - `README.md:44`: replace "41 tests"; add a short "State engine (v3)" paragraph naming `/v3` and the default `model` view. Mark its AI path experimental with the dev-split numbers.
   - `docs/verification.md:3`: add a dated top entry; leave historical sections labeled as history.
   - `docs/weekly-scorecard.md:7-9`: update the counts and add the state-engine row.
   - `docs/backlog.md:14`: the "Verify live AI — deferred by manual-only scope" row is superseded by local AI; mark it so.
   - `docs/submission-copy.md:21-25` and `docs/demo-script.md`: align with the Phase 1.2 decision. Copy numbers only from `docs/transaction/verification.json` ($30M → $18M → $30M; $20M obligations).
4. **Write `docs/state-engine/release.md`.** Model it on the structure of `docs/local-ai-release.md`: runtime, workflow, measured evaluation, boundaries. Cite `state_engine.py` (metrics are kept separate; `economic_metrics` is always null at `:256`; 12-dimension and 256-boundary limits at `:105-106,125`).
5. **Fix the README environment line.** State Node 20.9+ (the version actually used) or install Node 22. Document `corepack enable` so `pnpm` resolves.
6. **Regenerate the package.** Add any new root files to `allowed_files` in `fp/work/package_loadbond.py:11` if needed, then run `python fp/work/package_loadbond.py`.

### Verification checklist
- [ ] `git log --oneline` shows the baseline commit; `git status` is clean.
- [ ] `rg -n "41 tests|41 backend|45 tests" docs README.md` matches only clearly labeled historical sections.
- [ ] The ZIP contains `loadbond/backend/state_engine.py`, `loadbond/frontend/app/state-workspace.tsx` and `loadbond/samples/state-corpus/manifest.json`.
- [ ] Unzip into a temp dir, then: `pip install -r backend/requirements.lock.txt`, `pytest backend -q` (62 pass), `pnpm install --frozen-lockfile && pnpm build` (passes).
- [ ] `start.ps1 -SmokeTest` exits cleanly.

### Anti-pattern guards
- Don't rewrite historical verification entries; append new dated ones.
- Don't claim deployment, submission or outreach happened.

---

## Phase 2 — Repository hygiene and a frontend safety net (P1, ~4 h)

### What to implement
1. **Quarantine dead code.** Move `frontend/app/experience/` to `frontend/_archive/experience/`, outside `app/` so Next ignores it, or delete it after the founder confirms (it lives in git history after Phase 1). Archive `fp/work/extract_editor.py` and `finalize_ui.py` too: they hard-code user-profile paths and patch files that have since changed.
2. **Dead backend artifacts.** Delete `backend/models.py` (no importers), or move it to `schemas/` if it is meant as published documentation; `export_schemas.py` already produces JSON schemas. Leave the `clause_jobs` table in place, because dropping a table needs Phase 3, but add a comment at `v2.py:22` saying it is reserved and unused.
3. **Frontend tooling.** Following `frontend/node_modules/next/dist/docs/01-app/…` (search for "eslint"), add ESLint using the flat config that this Next version documents. Add scripts `"lint"` and `"format": "prettier --write app"`, plus a `.prettierrc` that matches the existing style (double quotes, as in `workbench.tsx`).
4. **Button types.** Add `type="button"` to every `<button>` that is not a submit button, in `workbench.tsx`, `state-workspace.tsx`, `state-editor.tsx`, `transaction-walkthrough.tsx` and `extraction-panel.tsx`.
5. **Silence the test warning.** The Starlette warning asks for `httpx2`. Check the installed FastAPI/Starlette changelog under `.venv/Lib/site-packages` before pinning anything; if no stable fix is documented, add `filterwarnings` in a `pytest.ini`.

### Verification checklist
- [ ] `pnpm typecheck && pnpm lint && pnpm build` pass.
- [ ] `rg -n "<button(?![^>]*type=)" frontend/app --pcre2` returns nothing.
- [ ] `rg -n "from \.models|experience/" frontend/app backend` returns nothing.
- [ ] `pytest backend -q` still reports 62 passed, with no warnings or only documented ones.

### Anti-pattern guards
- Don't reformat whole files in the same commit as logic changes; commit formatting separately.
- Don't change `.next`-generated `AGENTS.md`; it is regenerated by `next dev`.

---

## Phase 3 — Real schema migrations (P1, ~4–6 h)

**Why:** `v2.db()` (`v2.py:107-126`) re-creates every table and stamps versions 1–3 on every connection. A future column or table change has no upgrade path, and an old database gets falsely stamped as version 3.

### What to implement
1. Extract schema setup into `backend/migrations.py` as an ordered list `MIGRATIONS = [(1, fn), (2, fn), (3, fn)]`. Each `fn(c)` runs only that version's DDL, split by the original groupings: v1 core tables + `legacy_imports`; v2 `extractions` and `proposals` (per `docs/local-ai-release.md:19`); v3 the state tables (`v2.py:22`).
2. `apply(c)` reads `SELECT version FROM migrations`, runs the missing ones in order inside one transaction, and inserts each version after its DDL succeeds.
3. Call `apply` **once per process**: guard it with a module-level flag keyed by database path. Keep `PRAGMA foreign_keys=ON` and `BEGIN IMMEDIATE` per connection exactly as now.
4. Add migration 4, which drops `clause_jobs` if it is empty. This is optional; do it only if the founder agrees in Phase 2.

### Documentation references
- Current DDL: `v2.py:114-123`. The SQLite transactional DDL behavior is standard; DDL statements inside a transaction roll back.

### Verification checklist
- [ ] New test `backend/test_migrations.py`, in the style of `test_v2.py:10-14`. It creates a DB with only the version-1 tables, then confirms that `apply` adds versions 2 and 3 and the existing rows survive.
- [ ] New test: a fresh DB reaches the latest version; a second `apply` is a no-op.
- [ ] Copy `data/workbench.sqlite` to a temp `LOADBOND_DATA`, start the backend, and replay an existing run. Hashes must match.
- [ ] All existing tests pass.

### Anti-pattern guards
- Don't change any `body` JSON layout or hashing; this phase is DDL only.
- Don't use `ALTER TABLE … DROP COLUMN` without checking the installed SQLite version (`sqlite3.sqlite_version`).

---

## Phase 4 — Financial extraction: pass the gate honestly (P1, ~6–10 h)

**Goal:** clear the 90% precision gate on the 12-case corpus without overfitting, then confirm on new held-out cases.

### Root causes (from `docs/local-extraction-evaluation.json`)
- **`05-missing`:** the model proposes the filler sentence "The amount will be set in a future agreement." as a second claim. The prompt line `local_extraction.py:90` ("Include payment obligations whose amounts are not yet specified…") invites this.
- **`11-injection`:** the model selects the injected sentence. `validate_candidate` correctly rejects it (`:147-148`), but any rejection fails the **whole job** (`:263-264`), and the scorer counts the case as failed (`evaluate_local.py:39`).

### What to implement
1. **Remove instruction-like sentences before the model sees them.** In `extract_chunk` (`:98`), drop quotation-enum entries that match the instruction regex at `:147`. The model then cannot select them. Keep the validator check as defense in depth.
2. **Record dropped sentences** as `screened_sentences` on the job, so the reviewer can see that instruction-like text was present. Show them in `extraction-panel.tsx`.
3. **Merge or flag non-payment sentences.** If a claim's quote has no money token and no payment verb (`pay|payable|reimburse|indemnif`), attach it as context to the adjacent obligation or flag it as `NON_OBLIGATION_CANDIDATE`. Prefer the deterministic rule over prompt wording. Bump `PROMPT_VERSION` to `local-evidence-1.3` if the prompt changes at all.
4. **Do not change the job-level atomic failure** for genuinely invalid quotes (a quote not found in the source). Only pre-screened sentences change behavior.
5. **Add 6–10 new held-out fixtures** under `samples/extraction-corpus/held-out/`, with labels in the same format as `labels.json`: long agreements over 8,000 characters (to cross chunk boundaries), varied injection phrasing that does not match the regex, placeholders such as "TBD" or "to be agreed", and amounts written as words. Add a `--split` flag to `evaluate_local.py`, mirroring `evaluate_state_ai.py:11,19`.

### Verification checklist
- [ ] Unit tests in `test_local_extraction.py` with a mocked `client`, following the existing mock-response tests: (a) injection sentences are absent from the schema enum; (b) a placeholder sentence is not published as a separate claim.
- [ ] `python -m backend.evaluate_local` (Ollama running): 12/12 pass, precision ≥ 0.90, recall ≥ 0.90. Save the output as `docs/local-extraction-evaluation-1.3.json`; keep the old files.
- [ ] Then run held-out **once**, and report the result whatever it is.
- [ ] Update `docs/local-ai-release.md` with the new numbers. Keep the label "experimental" unless held-out also passes.

### Anti-pattern guards
- No case-specific string matching (for example, matching "future agreement" literally).
- Don't edit `labels.json` expectations to make cases pass.

---

## Phase 5 — State-engine AI: held-out evaluation and financial precision (P1, ~8–12 h)

### What to implement
1. **Score held-out as-is first:** `python -m backend.evaluate_state_ai --split held_out`. Commit `docs/state-engine/local-ai-held_out-evaluation.json` as the honest baseline.
2. **Investigate financial precision (0.13).** Read the per-case `financial` sections of `local-ai-development-evaluation.json` and group false positives by cause. Apply the Phase 4 techniques (screening the quotation enum, deterministic money-token validation) inside `clause_extraction.py`, reusing `local_extraction.amounts` and `MONEY` rather than duplicating them.
3. Bump `clause_extraction.PROMPT_VERSION` for any prompt change; re-run development, then held-out once.
4. Fill in `docs/state-engine/release.md` (from Phase 1) with the measured tables.

### Verification checklist
- [ ] The held-out baseline JSON exists, dated before any tuning commit (`git log` proves the order).
- [ ] `test_state_release.py` gains mocked tests for the new screening.
- [ ] Development and held-out numbers both appear in the release doc; the gate status is stated plainly.

### Anti-pattern guards
- Never look at held-out failures and then tune. If you do, write it down and create a fresh held-out set.

---

## Phase 6 — Backend structure (P2, ~6–8 h, after Phases 3–5 land)

### What to implement
1. Split the ~450-line `v2.install` closure into modules: `backend/v2/db.py` (connection, `get`/`rows`/`put`/`audit`), `routes_projects.py`, `routes_records.py`, `routes_documents.py`, `routes_runs.py`, `loaders.py` (sample, transaction case, legacy import). Pass dependencies explicitly instead of through 11-argument `install` calls (`v2.py:552,554`).
2. Deduplicate upload/PDF parsing between `main.upload` and `v2.upload` (around `v2.py:357`) into `ingestion.py`, which already holds `html_pages`.
3. Narrow the broad `except Exception` handlers at `main.py:102`, `v2.py:357` and `local_extraction.py:380` to the concrete exceptions (`pypdf` errors, `UnicodeDecodeError`, `pydantic.ValidationError`). Keep the worker's catch-all at `:279` but log the traceback.
4. Keep v1 frozen; only move it if a test proves no behavior change.

### Verification checklist
- [ ] `python -m backend.export_schemas` and `git diff schemas/openapi.json`: no route or schema changes beyond ordering.
- [ ] All tests pass at every intermediate commit.
- [ ] Replay of stored runs in `data/workbench.sqlite` is still byte-identical.

### Anti-pattern guards
- Refactor only: no behavior changes or renamed routes. Do one module per commit.

---

## Phase 7 — Frontend structure and end-to-end coverage (P2, ~8–10 h)

### What to implement
1. **Shared client and types.** Create `frontend/app/lib/api.ts`, merging `workbench.tsx:105-128` and `state-workspace.tsx:98-122` (parameterized by `v2`/`v3`), and `frontend/app/lib/types.ts`, consolidating `Evidence`, `Span`, `Workspace` and `money` from `state-types.ts` and the inline copies. Replace `[key: string]: any` (`state-types.ts:8,36`, `workbench.tsx:21`) with typed records generated from, or checked against, `schemas/v2-*.schema.json`.
2. **Split the monoliths.** `workbench.tsx` (1,818 lines) becomes a shell plus `registers/`, `document-viewer.tsx`, `record-editor.tsx` and `history-panel.tsx`; `state-workspace.tsx` (2,001 lines) splits by its four views (`model`, `source-review`, `state-explorer`, `decision-brief`). Follow the existing CSS scoping (`.v2 …`, `.state-…`).
3. **Playwright smoke tests** (check the installed Playwright docs first):
   - Riverbend: start the case → $30M → select Birch → review release → $18M → withdraw → $30M → replay the $18M run, which must report an exact match. Expected values come from `docs/transaction/verification.json`.
   - Manual Harbor flow from `docs/v2-release.md` steps 1–7 ($500,000 → $300,000 obligations, face retained).
   - Run against `start.ps1 -Production -FrontendPort 3002 -BackendPort 8001` with a temp `LOADBOND_DATA`.

### Verification checklist
- [ ] `pnpm typecheck && pnpm lint && pnpm build && pnpm test:e2e` all pass.
- [ ] `rg -n ": any|\[key: string\]: any" frontend/app` count is reduced; list the remaining ones and why they stay.
- [ ] Screenshots at 1440×900 match the pre-refactor captures (`docs/transaction/transaction-1440.png`).

### Anti-pattern guards
- Don't change visual design during the split. Don't revive `experience/`.

---

## Phase 8 — Founder-gated work (not executable by an agent alone)

These need decisions, accounts or money. Don't start them without explicit approval:
- **Public hosting for judges** (`docs/operations.md` "Hosting"): one Node and one Python service, a persistent volume, a non-default `LOADBOND_TOKENS`, HTTPS. Needs a hosting choice and budget.
- **Event submissions:** HACK47 (Oct 15, midnight official), Next Founders (Oct 15, 5 p.m., 5-minute video), Galuxium (Oct 31, 7:30 a.m.; clarify reuse rules first). Re-check the official rules; `source-register.md:32` says they were not re-checked for this milestone.
- **New demo video** for the current milestone. The existing MP4s show earlier milestones (README line 7).
- **Customer discovery** (`docs/customer-discovery-guide.md`, `outreach-drafts.md`): nothing has been sent.
- **Production gate** (PostgreSQL/RLS, OIDC/MFA, object storage): deferred to pilot, per `docs/backlog.md` P2.

---

## Phase 9 — Final verification (run after any phase set)

1. `pytest backend -q`: record the exact count in `docs/verification.md` under a new dated heading.
2. `pnpm typecheck && pnpm lint && pnpm build` (and `pnpm test:e2e` once Phase 7 exists).
3. Replay check: for every run in a copy of `data/workbench.sqlite`, `POST /v2/projects/{pid}/runs/{id}/replay` reports an exact match.
4. Anti-pattern greps:
   - `rg -n "production.ready|capital saving|legal opinion" docs README.md`: only negations remain.
   - `rg -n "11434" backend`: only `127.0.0.1`.
   - `rg -n "C:\\\\Users" loadbond`: no hard-coded user paths in source.
5. Regenerate `LoadBond-source.zip`; unzip, build and test from a clean temp directory.
6. Update `docs/backlog.md` statuses, linking each to an artifact, as `backlog.md:28` requires.
