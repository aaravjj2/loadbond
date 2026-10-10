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

D15 — October 9: The first real executed agreement (PJM SA No. 4704) showed that the reported maximum can be silently too low when a provision requires more security without stating how much. Such increases are now modeled as step-ups without a percentage, and the affected metric is labeled a lower bound ("At least") rather than a maximum. The solver version string is unchanged, because assessments without such a rule produce byte-identical results and existing snapshots must keep replaying. Upload limits were raised (500 pages, 2,000,000 characters) and textless pages are flagged instead of rejecting the file, because real filings exceed the old limits.

D16 — October 10: Loading PJM Tariff §212.4 showed that the only public text is the current one (effective April 1, 2020), not the 2017 text that governed the Chestnut agreement, and that §212.4 states no draw conditions. A linked reference previously counted as resolved as soon as any document was attached. Links now carry an optional version status: a confirmed governing version, an unconfirmed one (raises a `VERSION_MISMATCH` finding), or a later version (finding, and incomplete if the reference is required). Obligations can be marked as estimates subject to true-up, which labels the obligations metric `ESTIMATE` without changing its amount. Both fields are omitted from stored records when unset, so existing records, published reference snapshots and their replays are unchanged. Rules were not drawn from the later tariff text, because it does not govern this agreement. Drawable exposure stays unknown: the draw terms belong to the issued letter of credit, which is not public.

D17 — October 10: The first real use case (two executed PJM Designated Entity Agreements) asked when a letter of credit can be drawn, not only how much. Assessments reported only the maximum and its state, so the conditions behind each amount had no direct answer. Each assessment now lists every amount a metric can take and the conditions that hold in every state producing it. It is derived at read time from the stored states, so stored results, hashes and replays are unchanged, and it is withheld when states exceed the 128 stored samples. The draw right was modeled with existing rule kinds (a drawable limit active on Default and two draw conditions), not a new engine rule, because changing draw semantics would alter existing reference results.

D18 — October 10: Fixing the use-case limits. Outcome explanations are aggregated over every evaluated state during the assessment and stored beside the result, because a two-agreement portfolio already has 256 states and the 128 stored samples could not explain it; older runs fall back to their samples. Release and expiry rules can lag from the date their conditions were established, and hypothetical scenarios can date an occurrence; undated conditions never start a lag, so uncertainty retains exposure. The Section 3.0 exemption was split into its three conditions and the competing-proposal condition was set from PJM's public proposal report, not left open. Transource was not relied on because PJM's report calls it an incumbent.
