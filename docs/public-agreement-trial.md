# Public agreement trial: PJM Service Agreement No. 4704 (October 9, 2026)

First test of LoadBond on a real, executed agreement instead of synthetic fixtures.

**Source.** Interconnection Service Agreement among PJM Interconnection, L.L.C., Chestnut Solar, LLC and Virginia Electric and Power Company. It covers a 74.9 MW solar facility (PJM queue AA2-057/AA2-165), was accepted by FERC in Docket ER17-1701-000, and took effect on May 3, 2017. It was downloaded from [pjm.com](https://www.pjm.com/pjmfiles/pub/planning/project-queues/isa/aa2_165_isa.pdf) and is stored at `samples/public-isa/pjm-sa4704-chestnut-solar-isa.pdf` (SHA-256 `562a469f…`). The file is 163 pages and includes the FERC acceptance letter, the ISA, its Specifications and the Appendix 2 standard terms.

**Method.** `samples/public-isa/run_trial.py` enters the agreement through the product API, as a user would. Every number cites a verbatim quotation, and each provision the vocabulary cannot express is recorded as an unknown fact or an unresolved reference. Nothing is invented. By default the script uses a throwaway database and writes `trial-result.json`. Pass `--server URL` to load the agreement into a running instance.

## Result

Assessed 2017-05-03 to 2018-12-31, possible future states, 32 feasible states. Replay is byte-identical.

| Metric | Result | Source |
|---|---|---|
| Letter of credit (Security) | **At least $2,111,149**: lower bound | ISA §5.0; Specifications §4.6 |
| Cost obligations (estimates) | $7,160,843 | Specifications §4.1 ($519,511) and §4.2 ($6,641,332) |
| Drawable amount | Unknown | Draw terms are in PJM Tariff §212.4, which is not loaded |

The security covers about 29% of the customer's estimated cost responsibility. The rest is billed quarterly in advance (Appendix 2 §11.2.2).

## How well the agreement fits the model

| Provision | Represented? |
|---|---|
| Security amount and beneficiary (§5.0) | Yes, exactly |
| Estimated charges (Specifications §4) | Yes, as fixed obligations; they are estimates subject to true-up |
| Additional tax gross-up security if safe-harbor documentation is missing (App. 2 §24.4) | **Yes, after this trial's fix.** It is an increase of unstated size, so the face is now reported as a lower bound |
| Security increase or decrease after a scope change (§11.2.1(b)) | Increase: yes, as an unstated increase. Decrease: no credit taken, which is conservative |
| Security "reduced as portions of the work … is completed" (§11.2.1(a)) | No. The amount is not stated, so the full face is kept and an open finding is raised |
| Customer termination on 60 days' notice (§16.1.2) | Recorded as an unknown condition. Security return on termination is governed by the Tariff, not the ISA |
| Final cost true-up "whether greater or lesser" (§11.2.3) | No. Obligations are shown as stated estimates |
| Milestones (§6.1–6.4, 2017–2018) | Not modeled; the ISA does not tie them to security amounts |

## What broke, and what was fixed

1. **Upload rejected the real filing.** The file had 163 pages (limit 100), 377,697 characters (limit 200,000), and one page with no extractable text, which rejected the whole file. Fixed: limits are now 500 pages and 2,000,000 characters. Textless pages are recorded on the document and shown as a warning, and only a fully textless file is rejected (OCR is still unsupported).
2. **"Maximum" understated the exposure.** §24.4 requires more security of an unstated amount, but the model could only express increases with an explicit percentage, so the reported "maximum" was silently too low. Fixed: a step-up rule may leave the percentage blank. When it can apply, the face (and drawable) metric is marked `LOWER_BOUND`, the interface shows "At least $X", and an `UNQUANTIFIED_INCREASE` finding names the provision. Earlier assessments contain no such rule, so they replay unchanged.
3. **Project capacity had to be a whole number.** 74.9 MW was rejected. Fixed for both the API and the form.

## Remaining gaps (not fixed)

- **Security terms live in other documents.** Form of security, draw conditions and return on termination are in PJM Tariff §212.4. Cost responsibility is in Tariff §217 and the construction service agreement. A real assessment needs a multi-document package, and the Tariff is far longer than this agreement.
- **Exact-quote matching against PDF text is brittle.** Extracted text contains artifacts such as "bene fit", "Int erconnection" and doubled spaces, and quotations must reproduce them exactly.
- **163 pages are navigated through a page dropdown.** There is no full-text search.
- **Estimates are not marked as estimates.** Obligations that can be "greater or lesser" are displayed like settled amounts.
- **The current status of the project is unknown.** The agreement is from 2017, and this trial reconstructs nothing that happened after execution.

## What this says about real-world use

The core calculation fits this agreement's main security terms. The trial surfaced two problems a treasury user would hit immediately: the file could not be uploaded, and the maximum was understated. It also showed that the most useful answers (when security is drawn or returned) depend on tariff provisions outside the agreement. The trial does not establish commercial value or legal accuracy.
