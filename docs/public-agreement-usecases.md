# Real use cases: PJM Designated Entity Agreement security (October 10)

Two executed, public agreements, entered through the product API with exact quotations. Reproduce with
`.\.venv\Scripts\python.exe samples/public-dea/run_usecase.py` (writes `samples/public-dea/usecase-result.json`);
add `--server http://127.0.0.1:8007` to load them into a running app.

## Sources

| Agreement | Projects | Security (Section 3.0) | Signed | SHA-256 |
|---|---|---|---|---|
| [PJM / Potomac Edison Company DEA](https://www.pjm.com/-/media/DotCom/planning/rtep-dev/expan-plan-process/ferc-order-1000/rtep-proposal-windows/2024-rtep-window/2024-w1-poted-regional-projects.pdf) | b4000.11-.13, b4000.110 | $1,326,900 | 6/23/2025 and 6/27/2025 | 1ec49672… |
| [PJM / American Transmission Systems, Inc. DEA](https://www.pjm.com/-/media/DotCom/planning/rtep-dev/expan-plan-process/ferc-order-1000/rtep-proposal-windows/2024-rtep-window/2024-w1-dea-atsi-projects.pdf) | b3925.1-.4 | $6,519,600 | 6/25/2025 and 6/27/2025 | 6048a7d4… |

Both are 2024 RTEP Window 1 agreements in the same form, 24 pages, fully text-extractable. The signature
names and dates are in a separate text layer of page 19; the visible signature lines look blank in plain
extraction, so check the rendered page before calling a filing unsigned.

## The treasury question

A Designated Entity must post a letter of credit (or cash) of 3% of estimated project cost. Its treasury
and its bank want to know: how much of it can PJM draw, under which conditions, and when must it come back?

## What the agreements say

- Section 7.5 and 8.1: PJM may draw only "Upon Default by Designated Entity". Default is a Breach not cured
  under Section 7.3 (30 days from notice, or a diligently pursued cure). Breach includes failing to maintain
  the security and missing a Schedule C milestone (Section 7.0).
- Section 8.0: if PJM terminates because the project is no longer required (ii) or for force majeure (iii),
  PJM "shall not have the right to draw" and must cancel the letter of credit within thirty days.
- Section 3.0: no security is required if the entity is a Transmission Owner and the project was selected by
  listed routes or in a window with no competing Nonincumbent proposal. Those facts are outside the agreement.
- Section 3.1: drawn funds are distributed as FERC determines.

## Answers from the product (as of 2026-10-10)

Both assessments are COMPLETE, and replay reproduces the snapshot and result exactly.

**Use case 1: Potomac Edison alone** (8 states)

| PJM can draw | Holds whenever |
|---|---|
| $1,326,900 | Default = yes, Section 8.0(ii)/(iii) termination = no, exemption = no |
| $0 | every other combination |

The letter of credit is outstanding at $1,326,900 unless the exemption applies.

**Use case 2: both agreements as one portfolio** (64 states), for example a bank or parent treasury holding both

| PJM can draw | Holds whenever |
|---|---|
| $7,846,500 | both entities in Default, neither agreement terminated under 8.0(ii)/(iii), neither exempt |
| $6,519,600 | ATSI in Default, not terminated under 8.0(ii)/(iii), not exempt |
| $1,326,900 | Potomac Edison in Default, not terminated under 8.0(ii)/(iii), not exempt |
| $0 | 49 other combinations |

Findings name what the answer depends on: the three open conditions per agreement, and the unloaded issued
letters of credit, Operating Agreement Schedule 6 and FERC distribution orders.

## What had to change in the product

Before this, an assessment reported only the maximum and the single state producing it, plus up to 128 raw
state samples that showed only instrument face. The question "under which conditions can it be drawn" had
no direct answer. Each assessment now lists, for every metric, each amount it can take and the conditions
that hold in every state producing that amount ("Conditions behind each amount" in States & Exposure).
It is derived when the assessment is read, from the states already stored, so stored results, hashes and
replays are unchanged. Models with more than 128 states say so instead of showing a partial explanation.

No new rule kinds were needed. The draw right is a reviewed DRAWABLE limit active on Default, plus two draw
conditions (Default; no Section 8.0(ii)/(iii) termination) and an issuance rule for the exemption.

## Limits

- Drawable equals the stated security only because the agreement states no partial-draw limit; prior draws
  and the issued instrument's own terms (issuer, expiry, draw documents) are not public and are not loaded.
- The thirty-day cancellation after a Section 8.0(ii)/(iii) termination is in the rule interpretation, not a
  dated release: no termination has occurred. Once one is recorded as a dated event, a release rule with a
  30-day lag models it.
- Whether a Default has occurred is not public here. ATSI's Schedule C financing milestone (9/1/2025) has
  passed; whether it was met is not established by these documents.
- The exemption is modeled as an open condition, not decided.
- Not a legal opinion. Interpretations were reviewed by the agent that entered them, not by counsel.
