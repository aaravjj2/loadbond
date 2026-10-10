# Graphiques Innovation Challenge submission: LoadBond

Paste each section into the Devpost field with the same name. Every figure cites a source in `docs/source-register.md` or is computed from the repository.

## Project Title

LoadBond: know what your security actually secures

## Theme

Finance & FinTech (with a direct link to Eco-Friendly & Sustainability: the collateral in question is what keeps clean-energy projects in the grid-connection queue).

## Problem Statement

**What.** Before a solar, wind or battery project can connect to the U.S. grid, it waits in an interconnection queue and must post financial security, usually cash or a bank letter of credit, at each stage. Under FERC Order No. 2023 that security escalates: a study deposit of $35,000 to $250,000, then a readiness deposit of twice that, then 5%, 10% and finally 20% of the project's estimated network-upgrade costs when the agreement is signed. The security then stays posted for years, and its required amount changes with conditions written across long filings: milestones, scope changes, tax documentation, termination and withdrawal.

**Who.** Treasury and finance teams at renewable and storage developers, especially mid-size developers with several projects in queues and limited bank credit lines. Secondary users are their lenders, counsel and the utilities that hold the security.

**Why it matters.** At the end of 2025, about 2,061 GW of generation and storage was waiting to connect, across 8,244 projects. 549 GW already had a draft or executed interconnection agreement but was not operating. The median project completed in 2025 spent 61 months in the process, and only 13% of capacity that applied from 2000 to 2020 was operating by 2025; 75% withdrew (Lawrence Berkeley National Laboratory, *Queued Up: 2026 Edition*). Letters of credit cost roughly 1–3% of their face value per year and consume the developer's bank credit capacity. One developer's portfolio averaged about $0.05 of security per watt (Segue Infrastructure). Overstating the security keeps capital idle; understating it means a surprise demand for more security, or a draw.

**Current limitations.** The required amount is conditional, but the tools that track it hold a single number. In the real agreement we tested (Chestnut Solar, PJM Service Agreement No. 4704, 163 pages, accepted by FERC in Docket ER17-1701), the security is stated as $2,111,149 on page 14. Appendix 2 §24.4 requires additional security, of an amount the agreement never states, if tax safe-harbor documentation is missing. §11.2.1 reduces the security as work completes, also without stating an amount. The terms for drawing or returning the security are in a different document, the PJM Tariff.

**Why existing approaches fail.**

- A spreadsheet records $2,111,149 as the maximum, which is wrong: the correct statement is "at least $2,111,149".
- Contract repositories store the PDF but do not combine releases, increases, expiries and draw conditions into the exposure that can exist on a given date.
- General-purpose AI summaries tend to turn an unstated amount into a confident number, which is worse than saying "unknown".

Our description of current practice is drawn from public sources and our own testing; it has not yet been validated in interviews with treasury teams.

## Proposed Solution

LoadBond is a working web application that turns a filed agreement into a defensible exposure figure, with every number traced to its source sentence.

1. **Upload** the filed agreement (PDFs up to 500 pages). Pages without extractable text are flagged rather than silently skipped.
2. **Find.** An optional AI model running on the user's own computer proposes sentences that contain amounts and conditions. Documents never leave the machine.
3. **Review.** Nothing counts until a named reviewer accepts the exact quotation. Conditions the model cannot express are recorded as unknown facts or unresolved references.
4. **Enumerate.** A rules engine checks every combination of events and conditions the reviewed contract allows, such as issuance, release, expiry, step-ups and draw conditions, and finds the maximum exactly instead of sampling.
5. **Decide.** A decision brief reports four separate answers (instrument face, the amount that can be drawn, underlying obligations and reimbursement debt), the state that produces each maximum, its sources, and a frozen snapshot that recomputes byte for byte.

On the Chestnut Solar agreement, LoadBond reports the letter of credit as **at least $2,111,149** (naming §24.4 as the reason), cost obligations of **$7,160,843** (Specifications §4.1 and §4.2), and the drawable amount as **unknown** because the draw terms are in the unloaded PJM Tariff.

## Innovation & Uniqueness

- **Unknown stays unknown.** Missing facts, unreviewed claims and unloaded documents either block completion or appear as "unknown". They never default to zero.
- **Lower bounds instead of false maximums.** When a clause can raise the security by an unstated amount, the answer becomes "at least X". We added this rule after testing the real agreement showed the previous "maximum" was silently too low.
- **Exact rather than simulated.** Every feasible contract state is enumerated, so the maximum comes with the exact combination of events that produces it, and any assessment can be replayed identically later.
- **AI finds, people decide.** The model only proposes source sentences. Calculations use reviewed records alone, so a model error cannot reach the number without a person approving it. The model is small and local: no paid cloud service and no confidential document sent anywhere.

The result is an auditable calculator for conditional collateral: a category between document storage and generic AI, whose output can be defended to a bank, an auditor or a utility.

## Supporting Materials

- **Pitch deck:** `docs/graphiques/deck.pdf` (12 slides); images for the gallery are in `docs/graphiques/slides/`.
- **Walkthrough video:** `docs/graphiques/loadbond-walkthrough.mp4` (silent, 2 min 53 s); narration script in `docs/graphiques/narration.md`.
- **Real-agreement trial:** `docs/public-agreement-trial.md`, with the public PJM filing and a reproducible script in `samples/public-isa/`.
- **Market research and sources:** `docs/source-register.md`.
- **Business model and validation plan:** slide 10 and `docs/customer-discovery-guide.md`.
- **Prototype source:** the repository (85 automated tests).

## Project Presentation

**Target users.** Treasury and finance teams at renewable and storage developers. The first offer to test is a security diagnostic: load a project's agreements, reconstruct its security history and show where the stated amount differs from what the contract allows.

**Implementation.** A Next.js web interface and a Python FastAPI backend with an exact state-enumeration engine, a review workflow, an audit trail and replayable snapshots. Optional extraction runs on Ollama with the open qwen3:4b model on a normal laptop.

**Resources required.** The prototype runs on one laptop at no inference cost. The next stage needs time with 10 developer treasury teams, a securities or energy lawyer to review the rule vocabulary, and access to complete agreement packages (agreement plus tariff).

**Challenges, and what testing found.**

- The real 163-page filing was initially rejected by upload limits; one textless page rejected the whole file. Fixed.
- The reported maximum was silently too low because the model could not express an increase of unstated size. Fixed: the answer is now "at least".
- Local AI extraction initially timed out on the long filing. Fixed: it now processes all 162 sections in 31 minutes.
- Scored once on documents never used for tuning, AI extraction found 100% of financial amounts, but only 60% of its proposals were right. On contract clauses, precision was 88% and recall 83%. On the real filing it found the $2,111,149 but could not tell totals from their components.
- Open: the security's draw and return terms sit in a separate tariff, so real assessments need multi-document packages.

**Expected outcomes.** For a single project like Chestnut, letter-of-credit fees at 1–3% come to roughly $21,000–$63,000 a year, so knowing exactly when security can be reduced or returned has direct value. As an order-of-magnitude illustration (not a measured market size), 549 GW of signed-but-unbuilt projects at $0.05 per watt would mean about $27 billion of posted security. With 75% of queued capacity historically withdrawing, every exit also needs a clear answer on what security comes back and what is still owed. Faster, correct release returns capital to building clean energy.

**Honest limits.** No customers, banks or utilities have validated the value yet. LoadBond is not legal advice. One real agreement has been tested, and AI extraction is experimental and below our own quality gate. Our stop rule: if treasury teams cannot show a real case where conditional security was misjudged, we stop investing in this thesis.

## Optional Demonstration

Upload `docs/graphiques/loadbond-walkthrough.mp4` to YouTube or Vimeo (unlisted is fine) and paste the link. A narrated version can be recorded over it using `docs/graphiques/narration.md`.

## Disclosure

LoadBond began from an earlier synthetic HTML prototype and a research report, both pre-existing. The application, rules engine, real-agreement trial, deck and this text were produced afterwards with AI coding and writing assistance. All agreements used are public filings or synthetic fixtures.
