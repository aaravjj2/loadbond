# Re-measured — October 9, 2026, evening

`pytest backend -q`: **62 passed** (50 test functions, some parametrized), one upstream Starlette/httpx deprecation warning. Frontend `tsc --noEmit` passes. The counts below (41, 45, 31, 22) are historical milestone records.

After extraction resilience fixes: **85 passed**. Live local extraction on PJM SA No. 4704 (162 chunks) succeeded in 31 minutes with 32 proposals. The first run hit the old 20-minute limit; the second failed on one runaway page and is now retried in halves. See `public-agreement-trial.md`. Find in document verified in the browser on the 163-page filing: matches on pages 6, 14 and 25, the same as an independent Python scan.

After the public agreement trial: **82 passed**; typecheck and production build pass. `samples/public-isa/run_trial.py` enters PJM SA No. 4704 through the API: COMPLETE, face at least $2,111,149 (lower bound), obligations $7,160,843, drawable unknown, replay byte-identical. Browser check on a production build (ports 3005/8005, throwaway data folder): the Transaction view shows "At least $2,111,149.00", and Sources & Review shows the page-20 textless warning and 74.9 MW. Captures are in `samples/public-isa/`. See `public-agreement-trial.md`.

After financial extraction 1.4 and clause extraction 1.2: **80 passed**; frontend typecheck passes. Live qwen3:4b: original corpus 12/12; held-out financial P 60% / R 100%, clauses P 88.2% / R 83.3% with both empty documents empty; gates fail (`state-engine/release.md`). The browser walkthrough below was not repeated for this change, which touches extraction only.

After extraction 1.3 and versioned migrations: **76 passed**. A copy of the local workspace database replayed all 14 stored v2 runs exactly; it contains no v3 assessments. Production build via the fixed launcher (ports 3004/8004, throwaway data folder): Riverbend browser walkthrough passed: $30M baseline, $30M after site selection, $18M after release review with $20M obligations, $30M after withdrawal, and an exact replay of the $18M snapshot. All four state-engine tabs rendered with no console errors. Capture: transaction/release-reviewed-1.3.png. Live qwen3:4b (digest 359d7dd4…): 12/12 original corpus; state-corpus held-out financial P 50% / R 66.7%, clauses P 75% / R 83.3%; gates fail; see `local-ai-release.md`. The state engine is documented in `state-engine/release.md`.

# Local AI milestone verification — October 9, 2026

41 backend tests and the Next.js production build pass. Actual browser extraction, edited imports, separate reviews, source-to-exposure calculation, evidence download and deterministic replay passed. The new synthetic Cedar agreement produced $650,000 exposure and $240,000 obligations, with unchanged face treatment.

The 12-document local evaluation passed 10 cases: precision 83.33%, recall 93.75%. The quality gate failed and the feature stays experimental. Source-enum selection prevents copied quotation errors, while missing-amount and instruction classification still need improvement. See local-ai-release.md and local-extraction-evaluation.json for the measured data.

Launcher smoke testing started ports 3002/8001, checked readiness and left both ports closed on exit. Port 3000 remained owned by its original process. Schema exports include the new project-scoped endpoints. Model replacement during extraction fails without publishing proposals.

The record below is historical and may describe functionality, assets and pending tasks at the time of its original release.

# Verification record

## V2 update — October 9, 2026

The combined suite now reports **31 passed**, with the same upstream test-client warning. V2 covers empty project initialization, strict input validation, project isolation, manual source offsets, separate instrument/claim/constraint reviews, conservative face exposure, claim-limited hypothetical modeling, duplicate component checks, amendment invalidation, versioned replay, backup integrity, legacy import, and audit-chain tamper detection. The production build passes.

The reviewer-facing integrity action checks each stored audit event hash and its link to the preceding event. The API returns only the event identifiers and failed check types, not event details. A browser check against the synthetic Harbor project verified 32 stored events. A test mutation of a saved event is reported as an integrity mismatch. This establishes consistency within the stored chain; it does not prevent a local administrator from rewriting or deleting the database.

The browser created Harbor renewal from scratch, added a site, uploaded ordinary prose, entered and reviewed one instrument and three claims, finished document review, and computed $500,000. A reviewed one-branch cap lowered obligations to $300,000 while face exposure remained $500,000. An explicitly reviewed hypothetical draw basis produced $300,000 exposure. Amendment revoked affected reviews and blocked completion; the old snapshot still replayed and exported. Editing and re-reviewing current evidence produced a new $600,000 baseline. Captures are in `walkthrough/`; the narrated video explains each step.

`browser-v2-evidence.json` is the actual browser-downloaded pre-amendment run. Its snapshot and result hashes are independently checked against the v2 solver. This establishes synthetic software mechanics, not actual LC treatment. V2 makes no AI calls.

The earlier record below describes v1; the sample parser and optional AI adapter belong to the preserved historical interface.

Final delivery checks: the v2 project, amended records and five assessments survived a service restart. Browser error logs were empty. The narrated capture video is 3 minutes 38 seconds, H.264/AAC, 1600×900, and fully decoded without errors. The updated `LoadBond-Graphiques-v2.pptx` passed package/layout/re-import checks; all changed slides were visually inspected. The earlier deck is retained as a historical asset.

Recorded October 9, 2026, for the local synthetic demonstration. These results do not establish legal enforceability, customer economics or production readiness.

## Automated checks

- Python 3.12: `python -m pytest backend -q` — **22 passed**. One upstream Starlette/httpx test-client deprecation warning; no failed tests.
- Next.js production build — passed, including TypeScript checks. The browser verification used the built production application with the FastAPI service on loopback.
- Golden fixtures: independent **$80.0M**; approved two-branch cap **$52.2M**; explicit three-branch release overlap **$67.0M**; 25% step-up **$60.75M**, compared with stressed gross **$100.0M**.
- Removing cap approval restores independent exposure. Monotonicity checks cover larger amounts and weaker exclusivity.
- Missing amounts and unresolved proposals block completion. Commercial abandonment does not release an instrument. Multiple claims mapped to the same instrument share its ceiling.
- Amendment invalidates affected reviews and makes old results historical. Original snapshots and financial traces replay identically after later changes.
- Authentication and workspace isolation cover documents, reviews, runs and exports. SQLite backup/restore reproduces the stored result.
- Text-PDF extraction and scan rejection tested. Mocked structured-output responses cover successful proposals, invalid source quotes/pages, refusal, incomplete response and provider failure. Failures save no claims; AI never approves dependencies.

## Browser walkthrough

Verified in the Codex in-app browser at `http://127.0.0.1:3000/`:

1. Open workspace with `local-demo`; calculate independent exposure.
2. Approve the synthetic dependency with a simulated review reason; calculate cap and release-delay cases.
3. Upload the sample text, parse its explicitly supported format, inspect the quoted source, map the proposed claim to lc-1, and verify it with a reason.
4. Recompute, download the JSON evidence package, and independently check its snapshot digest and deterministic solver result. Both match. A copy is saved as `browser-evidence-example.json`.
5. Restart both servers; the document, reviewed claim and four prior runs survive. Inspect the selected run's original maximizing-state claims and dependency evidence.
6. Replay that snapshot in the browser; the application confirms: “Historical snapshot and result reproduced exactly.”

The uploaded sample adds a ninth claim. Its mapped instrument ceiling prevents double counting; a new claim does not necessarily increase the maximum. A fresh source checkout starts with eight seed claims and an unapproved cap.

No browser error logs were observed at the end of the walkthrough. `workbench.jpg` captures the completed UI. This was desktop browser verification; mobile devices, cross-browser coverage and public hosting have not been certified.

## Presentation and remaining gates

`LoadBond-Graphiques.pptx` contains eight editable slides. PowerPoint package, layout and re-import validation passed. All eight rendered slides were visually inspected.

Live AI provider access is **not verified**: credentials, model availability and a spending ceiling were not supplied. The local parser is labeled as such. Public deployment, signed-out judge access, event registration/submission and a recorded video remain pending. Confidential documents require the production controls listed in `operations.md`; the local token system and SQLite storage are demonstration infrastructure.

No outreach was sent, no paid infrastructure was activated, and no customer, counsel, bank or utility gate is recorded as passed.

Local AI follow-up: actual model-outage recomputation and service-restart persistence passed. Discovery workbook verification preserved numeric zero and marked missing/duplicate face inputs unavailable. Native Excel application behavior was not tested.
