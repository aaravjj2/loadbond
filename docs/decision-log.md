# Decision log

## October 9 — v2 scope selected by founder

Target: local hackathon demonstration using public documents and realistic fixtures. Manual evidence entry first; no paid or local-model extraction in this build. Delivery is a local app, reproducible source and captured walkthrough video. New projects start empty; sample data is explicit. Instruments default to full face exposure; claim-limited modeling requires reviewed evidence and separately labeled hypothetical assumptions where applicable. Legacy snapshots retain their original solver and hashes. No commercial or legal gate has passed.

| ID | Date | Decision | Basis / status |
|---|---|---|---|
| D01 | 2026-10-09 | Prioritize Graphiques and HACK47; later Galuxium conditional | User decision; event reuse restrictions require clarification |
| D02 | 2026-10-09 | One founder + AI; no assumed paid team | User decision |
| D03 | 2026-10-09 | Next.js and FastAPI local implementation | Approved architecture |
| D04 | 2026-10-09 | SQLite and local content-addressed files for runnable MVP | Implementation staging choice; PostgreSQL/object-store cutover deferred to pilot gate |
| D05 | 2026-10-09 | Explicit local parser; AI opt-in | No provider credentials or spending ceiling supplied |
| D06 | 2026-10-09 | Unknown documents/claims block completeness | Prevent silent omission of unreviewed exposure |
| D07 | 2026-10-09 | Simulated approval of synthetic cap only | No legal enforceability opinion or actual counterparty consent |
| D08 | 2026-10-09 | Use $5M OR 20% bank threshold | Resolve report's 15–20% range as an explicit planning default |
| D09 | 2026-10-09 | Fail cross-site gate with fewer than two qualifiers after adequate 10/3 sample | Resolve inconsistent report failure wording |

Separate future entries into verified fact, synthetic assumption, product decision, or untested commercial hypothesis. Record the evidence and owner for every change.


D10 — October 9: Founder selected local AI extraction as the next milestone and local models only. This supersedes the manual-only implementation choice for the current release, while retaining manual entry and deferring paid inference/public hosting. Ollama/qwen3:4b is installed under chat work storage, with process-scoped configuration and cloud inference disabled.

D11 — October 9: Keep extraction labeled experimental after measured precision of 83.33% failed the 90% gate. All proposals require source validation, explicit import and separate review. Corpus tuning is not real-customer validation. No legal or commercial gate passed.

D12 — October 9 (product decision, delegated by founder): Lead submissions with the Riverbend transaction, the only flow verified end to end in a browser, followed by the state engine as the default workspace. Score the state-engine held-out split before any further prompt tuning, and record the result whether or not it passes. Source control starts with a baseline commit; files are stored byte-exact (`.gitattributes`) because fixtures and evidence are hashed.

D13 — October 9: Extraction 1.3 withholds source-verified sentences that are not financial records instead of failing or publishing them, and shows them to the reviewer. Rejections that signal fabrication (a quote absent from the source, or instruction text) remain job-fatal. The original 12-case corpus informed the change, so release claims rest on held-out results: financial precision 50%, which fails the gate. Extraction stays experimental.

D14 — October 9: Financial 1.4 turns payment-only "instrument" proposals into obligations rather than withholding them, because the missed record was a real obligation with the wrong label. Clause 1.2 applies the same input screening as financial extraction, downgrades unconfirmed releases to notices (a false release would lower modeled exposure, the unsafe direction), and withholds off-topic sentences. Held-out was scored once: improved on every metric, gates still fail. The off-topic screen caused one held-out miss; we record it and do not fix it against held-out. The next round needs fresh held-out fixtures.
