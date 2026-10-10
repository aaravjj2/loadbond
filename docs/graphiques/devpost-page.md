# Devpost project page fields

## Elevator pitch (196 of 200 characters)

Clean-energy projects post millions in collateral to hold their grid spot. LoadBond reads the agreement and computes the most it can become, traced to source. Real PJM filing: at least $2,111,149.

## About the project (paste everything between the lines)

---

## Inspiration

Before a solar farm or battery can connect to the U.S. grid, it waits in an interconnection queue, and it has to post financial security the whole time it waits. At the end of 2025, about **2,061 GW** of projects were in those queues, the median project took **61 months** to get through, and **75%** of capacity historically withdraws before it is built ([Berkeley Lab, *Queued Up 2026*](https://emp.lbl.gov/queues)). Since [FERC Order No. 2023](https://www.ferc.gov/explainer-interconnection-final-rule), that security escalates at every study stage, up to 20% of a project's network-upgrade costs when the agreement is signed. It is usually a bank letter of credit, which costs roughly 1–3% of its face value a year and uses up the developer's credit lines.

What caught our attention was that the required amount is *conditional*. It goes up or down with milestones, scope changes, tax paperwork and withdrawals, all written across filings that run to hundreds of pages. A spreadsheet holds a single number, and a single number can be confidently wrong.

## What it does

LoadBond turns a filed agreement into a defensible exposure figure, with every number traced to the sentence it came from.

1. **Upload** the filed agreement (PDFs up to 500 pages; pages with no extractable text are flagged instead of silently skipped).
2. **Find:** an optional AI model running *on the user's own computer* proposes sentences containing amounts and conditions. No document leaves the machine.
3. **Review:** nothing counts until a named reviewer accepts the exact quotation.
4. **Enumerate:** a rules engine checks every combination of events the reviewed contract allows (issuance, release, expiry, step-ups, draw conditions) and finds the maximum exactly.
5. **Decide:** a brief reports four separate answers (instrument face, drawable amount, underlying obligations, reimbursement debt), the state that produces each maximum, its sources, and a frozen snapshot that recomputes byte for byte.

We tested it on a real public filing: the **Chestnut Solar** Interconnection Service Agreement (PJM Service Agreement No. 4704, 74.9 MW, accepted by FERC in Docket ER17-1701, 163 pages). Page 14 states the security as $2,111,149. But Appendix 2 §24.4 requires *more* security, of an amount the agreement never states, if tax safe-harbor documentation is missing. So the honest answer is not "$2,111,149". It is:

- **At least $2,111,149** for the letter of credit, with a finding naming §24.4;
- **$7,160,843** in cost obligations (Specifications §4.1 and §4.2);
- **Unknown** for the amount that can be drawn, because the draw terms live in the PJM Tariff, which isn't loaded. LoadBond says so instead of guessing zero.

![The correct answer is at least $2,111,149](https://raw.githubusercontent.com/aaravjj2/loadbond/main/docs/graphiques/slides/04.png)

## How we built it

- **Backend:** Python with FastAPI and Pydantic, SQLite storage, and pypdf for text extraction. The core is a state-enumeration engine. A reviewed contract becomes a set of typed rules (implication, prerequisite, cardinality, issuance, replacement, release, expiry, limit, step-up, evergreen, draw condition, obligation). The engine enumerates every feasible state \\( s \\) over the assessment window and reports, for each metric \\( m \\),

$$ m^{\max} = \max_{s \in \mathcal{S}_{\text{feasible}}} m(s) $$

together with the state that attains it. If any reachable rule can increase \\( m \\) by an *unstated* amount, the result is reported as a lower bound, \\( m^{\max} \ge m(s^\ast) \\), never as a maximum.
- **Frontend:** Next.js and React with TypeScript: a document reader with find-in-document and highlighted source spans, a review queue, a rule editor and a printable decision brief.
- **Local AI:** Ollama running the open qwen3:4b model on a laptop, with JSON-schema-constrained output. Every proposal must quote the source verbatim and pass numeric validation before a person even sees it.
- **Trust:** an audit trail, amendment invalidation (changing a document blocks completion until re-review), and replayable snapshots. 85 automated tests with pytest.

## Challenges we ran into

Testing on a real 163-page filing broke the prototype in five places, and we fixed and documented each one:

- **The upload rejected the file.** Page and character limits were too low, and one image-only page rejected the whole document. Limits are now 500 pages, and textless pages are flagged instead.
- **The "maximum" was silently too low.** The model could only express increases with a stated percentage, so §24.4 was invisible. We added unquantified increases, which turn the answer into "at least".
- **74.9 MW was rejected** because capacity had to be a whole number.
- **Local extraction timed out** on the long filing: first after 121 of 162 sections, then on one runaway page. The time budget now scales with document length, and a stuck section is retried in halves. The third run processed all 162 sections in 31 minutes.
- **There was no way to search 163 pages**, so we added find-in-document.

The hardest challenge was being honest about the AI. Scored once on documents we never tuned on, it found **100%** of financial amounts, but only **60%** of its proposals were right. On contract clauses it scored 88% precision and 83% recall. On the real filing it found the $2,111,149 but couldn't tell totals from their components. That is why the AI only proposes and the engine computes.

## Accomplishments that we're proud of

- A real FERC-accepted agreement, end to end, reproducible from a public PDF with one script.
- Finding a correctness bug, the false maximum, that only real data could reveal, and making "at least" a first-class answer.
- A system that is *wrong out loud*: unknowns stay unknown and never default to zero.

## What we learned

- In collateral, "unknown" and "at least" are more valuable answers than a precise-looking wrong number.
- The most important terms are often *not in the agreement*. Draw and return rules for this security sit in a separate tariff, so real assessments need multi-document packages.
- Small local models are good at *finding* the money in long documents and bad at *structuring* it. Human review isn't a formality; it's the design.

## What's next for LoadBond

- Interview 10 developer treasury teams and reconstruct one real security history each. Our stop rule: if they can't show a real case where conditional security was misjudged, we stop investing in this thesis.
- Load an agreement and its tariff as one package.
- Mark estimates that are subject to true-up, and stop double-counting totals and their components.

*Limits:* LoadBond is a prototype and not legal advice. No customers, banks or utilities have validated it yet, and AI extraction is experimental. It began from an earlier synthetic prototype and research report; this work was built afterwards with AI coding assistance.

---

## Built with (14 tags)

python, fastapi, pydantic, sqlite, pypdf, uvicorn, pytest, typescript, react, next.js, node.js, ollama, qwen3, html/css

## "Try it out" links

- https://github.com/aaravjj2/loadbond
- https://github.com/aaravjj2/loadbond/blob/main/docs/graphiques/deck.pdf (pitch deck)
- https://github.com/aaravjj2/loadbond/blob/main/docs/public-agreement-trial.md (real-agreement trial write-up)

## Image gallery (3:2, upload in this order)

`docs/graphiques/gallery/`: 00-cover.png first (it becomes the thumbnail), then 04, 07, 02, 03, 06, 08, 09, 10, 11, 05, 01, 12. That's 13 images, within the 15-image limit.

## Video demo link

Upload `docs/graphiques/loadbond-walkthrough.mp4` to YouTube (unlisted is fine) and paste its URL.
