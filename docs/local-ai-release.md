# Local AI extraction release — October 9, 2026

LoadBond now connects uploads to local-model proposals, editable imports, separate input review, exposure calculations and matching evidence exports. Manual entry remains available. Public and synthetic documents only.

## Runtime and startup

Run setup-local-ai.ps1 to obtain the standalone runtime, start start-local-ai.ps1 in another terminal, then rerun setup to pull the model. Runtime/model files live under the enclosing chat's work directory. Ollama also created its standard per-user identity file. No drivers or system-wide environment variables were changed. Cloud inference is disabled.

Ollama 0.40.2 and qwen3:4b Q4_K_M were downloaded from official sources. Model digest: 359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7. Requests use schema-constrained JSON, temperature zero, thinking disabled, an 8,192-token context, 8,000-character page-aware chunks and 600-character overlap. Quotations and monetary tokens are selected from source enums; offsets, amounts and currency are validated independently.

Application startup defaults to frontend port 3001 and backend port 8000. Occupied ports produce an error. Explicit port overrides are supported. Production mode uses the built frontend. SmokeTest starts the services, checks readiness and cleans up only owned process trees. Backend environment variables must be set in the launching process; .env.example is documentation rather than automatically loaded configuration.

## Workflow and compatibility

Choose Extract with local AI on a current document. One local worker processes persistent jobs outside database transactions. Chunk timeout is 120 seconds; whole-job timeout is 20 minutes. Incomplete processing, invalid evidence, changed documents and archived projects publish no proposals. Failed/interrupted attempts require explicit abandonment before manual completion. Restart interrupts unfinished running attempts; queued attempts resume.

Import instruments first. Imported inputs remain UNVERIFIED; obligations retain UNCERTAIN mapping. Separate review accepts model inputs. Releases, constraints and claim-limited rights remain separate manual workflows. Resolve or dismiss every proposal before document completion; zero proposals never automatically complete review. Repeated quotations require manual occurrence selection. Non-USD proposals cannot enter USD calculations.

SQLite migration 2 adds project-scoped extraction and proposal tables. Legacy snapshots and solver version enumeration-2.0 remain intact. Imported records and exports retain model, prompt, schema, document hash, job and proposal provenance, including after record edits. Historical snapshots are not retroactively changed.

## Measured evaluation

The labeled 12-document synthetic corpus is in samples/extraction-corpus. Run python -m backend.evaluate_local with Ollama active. Final prompt local-evidence-1.2 passed 10/12 cases. Clear USD record precision was 83.33%, recall 93.75%, matched by record type, exact amount/currency and supporting component. The precision gate failed; extraction remains EXPERIMENTAL. Earlier evaluations are retained for comparison.

The missing-amount case produced an extra/incorrect proposal. Embedded AI instructions caused an invalid proposal and the entire attempt was rejected. This behavior does not establish comprehensive injection resistance or real-agreement accuracy. Do not describe extraction as production ready.

The initial cold request took 65.0 seconds including model startup. Final warm corpus cases took 0.39–5.06 seconds; the browser's three-record document took 7.6 seconds. Ollama reported approximately 3.61 GiB model VRAM residency at the configured context. These are samples on this laptop, not maximum-size document performance guarantees.

## End-to-end evidence

The browser created a synthetic Cedar project and uploaded browser-local-ai-agreement.txt, outside the scored corpus. Actual local extraction proposed a $650,000 LC, $90,000 engineering obligation and $150,000 conditional construction obligation. After separate imports, mapping confirmation and reviews, the assessment returned $650,000 instrument exposure and $240,000 maximum obligations. No capital release is established.

The browser-downloaded browser-local-ai-evidence.json independently matches its snapshot hash and solver result hash and contains the installed model digest. Browser replay reproduced the result. Browser warnings/errors were empty. Captures are in local-ai-walkthrough; the new video uses actual captures with narration, not continuous screen recording.

41 backend tests and the Next.js production build pass. Launcher smoke testing verified that ports 3002/8001 start and clean up. The unrelated port 3000 service remained PID 13396. No paid inference, public deployment, event submission, confidential upload or outreach occurred in this milestone.

Next extraction work should investigate missing-amount and instruction classification using new held-out fixtures. Customer discovery templates are prepared; real contacts, interviews and transaction evidence remain uncollected.

Additional live checks: stopping the owned Ollama service left verified Cedar inputs able to recompute at $650,000 and replay their original snapshot. After restarting both services, all three reviewed inputs, the extraction attempt and two assessments remained stored. The discovery workbook passed zero/missing/duplicate-input checks and visual review using the artifact tool; native Excel was not controlled.
