# Public agreement trial: PJM Service Agreement No. 4704 (October 9, 2026)

First test of LoadBond on a real, executed agreement instead of synthetic fixtures.

**Source.** Interconnection Service Agreement among PJM Interconnection, L.L.C., Chestnut Solar, LLC and Virginia Electric and Power Company. It covers a 74.9 MW solar facility (PJM queue AA2-057/AA2-165), was accepted by FERC in Docket ER17-1701-000, and took effect on May 3, 2017. It was downloaded from [pjm.com](https://www.pjm.com/pjmfiles/pub/planning/project-queues/isa/aa2_165_isa.pdf) and is stored at `samples/public-isa/pjm-sa4704-chestnut-solar-isa.pdf` (SHA-256 `562a469f…`). The file is 163 pages and includes the FERC acceptance letter, the ISA, its Specifications and the Appendix 2 standard terms.

**Method.** `samples/public-isa/run_trial.py` enters the agreement through the product API, as a user would. Every number cites a verbatim quotation, and each provision the vocabulary cannot express is recorded as an unknown fact or an unresolved reference. Nothing is invented. By default the script uses a throwaway database and writes `trial-result.json`. Pass `--server URL` to load the agreement into a running instance.

## Result

Assessed 2017-05-03 to 2018-12-31, possible future states, 32 feasible states. Replay is byte-identical.

| Metric | Result | Source |
|---|---|---|
| Letter of credit (Security) | **At least $2,111,149**: lower bound | ISA §5.0; Specifications §4.6 |
| Cost obligations | $7,160,843, labelled **estimate, subject to true-up** | Specifications §4.1 ($519,511) and §4.2 ($6,641,332); Appendix 2 §11.2.3 |
| Drawable amount | Unknown | Neither the ISA nor PJM Tariff §212.4 states when the security may be drawn; that is in the issued letter of credit, which is not public |

The package has two documents: the ISA and a three-page excerpt of the current PJM Tariff §212.4 (see "Loading the tariff" below).

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
4. **Local AI extraction could not finish a long filing.** First run: it stopped at the fixed 20-minute job limit after 121 of 162 chunks and reported only a generic error. Fixed: the time budget scales with document length (60 seconds per chunk, at least 20 minutes and at most 4 hours), and timeouts name the page and chunk. Second run: on page 114, an ordinary prose page with no amounts, the model ran past the 120-second chunk limit while every other call took 0.4–28 seconds, and 112 finished chunks were discarded. Fixed: a runaway or truncated chunk is retried in two halves, then in quarters. A document still publishes nothing unless every part is processed.
5. **No way to find text in 163 pages.** Fixed: **Find in document** searches all pages, jumps to the next match and highlights it (`samples/public-isa/find-in-document.png`).

## Local AI extraction on the real filing

Third run, after the fixes above: it **succeeded** on all 162 chunks in 31 minutes (qwen3:4b, local-evidence-1.4). It produced 32 proposals and withheld more than 100 sentences; the stored list is capped at 100. The full output is in `samples/public-isa/extraction-result.json`. This is a single real-world data point, not a scored evaluation. It was not used for tuning.

Compared with the manual entry (one $2,111,149 letter of credit and two charges, $519,511 and $6,641,332):

- **Found:** the $2,111,149 security, quoted from the Specifications total on page 25. The §5.0 sentence was not proposed.
- **Missed:** the two charges as stated in Specifications §4.1 and §4.2. Instead it proposed the four cost-breakdown lines (labor and material) and their $7,160,843 total. That total equals the sum of the two charges, so importing the lines and the total together would double count.
- **Double-counting risks:** the two security-sizing components, $1,220,026 and $891,123, were proposed as separate obligations, though they only explain the security amount. The cost lines were also proposed twice, once from FERC's acceptance letter and once from the Specifications.
- **Noise:**
  - A $0 "Option to Build Security" instrument.
  - A $851.88 monthly charge from the cover letter.
  - 20 obligations with no amount, which are standard payment and indemnity boilerplate from Appendix 2.

Verdict: extraction works as a way to find the money in a long filing. It surfaced every dollar figure in the security and cost sections without a reviewer reading 163 pages. It is not yet reliable as structured input: it cannot tell components from totals, a cover letter from the agreement, or boilerplate from a quantified obligation. Separate human review of every proposal remains essential.

## Fixed after the trial (October 10)

- **Pasted quotations now match PDF text artifacts.** Extracted text contains splits such as "bene fit" and "Int erconnection", line-break hyphens, doubled spaces and curly quotes. A quotation copied cleanly from a PDF viewer used to fail. Locating a quotation now ignores whitespace, line-break hyphens, soft hyphens and quotation-mark or dash styles. The stored evidence is still the page's own characters, `page_text[start:end]`, so review and replay are unchanged. Folding needs at least 8 meaningful characters, and a quotation that is on a different page reports that page. `samples/public-isa/check_quotes.py` confirms clean quotations of the §5.0 sentence (page 14) and the security total (page 25) now locate in this filing.
- **Totals, components and repeats are flagged before review.** Proposals whose amount equals the sum of a consecutive run of nearby proposals are flagged on both sides ("import the total or its components, not both"), and an amount proposed from different sentences is flagged as a repeat. On this filing's saved extraction, the check flags the $7,160,843 total and its four cost lines on page 24, and the $3,157,592 line repeated from FERC's letter on page 6. It does not flag the $2,111,149 security. Flags are review issues, not automatic deletions.

## Loading the tariff (October 10)

The ISA says its security is provided "in accord with Section 212.4 of the Tariff". The consolidated PJM Open Access Transmission Tariff is public, but it is one 146 MB PDF of 6,606 pages ([pjm.com](https://www.pjm.com/directory/merged-tariffs/oatt.pdf), SHA-256 `d9daac65…`). That exceeds the upload limit, so `samples/public-isa/make_tariff_excerpt.py` cuts out the three pages of §212.4 (pages 553–555) and records their provenance in `pjm-oatt-212.4-excerpt.json`.

What the tariff text showed:

- **It is the wrong version.** Its header says it took effect on April 1, 2020 (Docket ER19-1958). The Chestnut ISA took effect on May 3, 2017, so this is not necessarily the text that governed it. Before this trial, attaching any document resolved a reference. Links now record whether the attached text is the governing version, an unconfirmed one, or a later one. This trial marks it as later, which raises a `VERSION_MISMATCH` finding for counsel. Had the reference been required, the assessment would stay incomplete.
- **It states no draw conditions.** §212.4(b)(3) says the provider "shall hold the security related to construction until as-built drawings are received and settlement of the final invoice", and that it "may be reduced as construction progresses". It does not say when the security may be drawn. The draw terms belong to the issued letter of credit, which is not public, so the drawable amount stays unknown, now for a specific and documented reason.
- **No rules were taken from it.** Using a later version to model a 2017 agreement would be the kind of silent error LoadBond exists to prevent.

The two cost charges are now marked as estimates. The ISA calls them estimates, and Appendix 2 §11.2.3 trues them up "whether greater or lesser". The obligations metric keeps the same amount but is labelled `ESTIMATE` with that notice.

## Remaining gaps (not fixed)

- **The governing 2017 text of §212.4 is not loaded.** Historical tariff versions are on FERC's eTariff system; this trial did not retrieve one. Cost responsibility is also in Tariff §217 and the construction service agreement, neither of which is loaded.
- **Very large references must be excerpted by hand.** The product has no way to load a page range of a 6,606-page document; the excerpt and its provenance are made outside the product.
- **Boilerplate obligations without amounts** (about 20 on this filing) are still proposed; the reviewer must dismiss them.
- **The current status of the project is unknown.** The agreement is from 2017, and this trial reconstructs nothing that happened after execution.

## What this says about real-world use

The core calculation fits this agreement's main security terms. The trial surfaced two problems a treasury user would hit immediately: the file could not be uploaded, and the maximum was understated. It also showed that the most useful answers (when security is drawn or returned) depend on tariff provisions outside the agreement. The trial does not establish commercial value or legal accuracy.
