# Real use cases: PJM Designated Entity Agreement security (October 10)

Two executed, public agreements, entered through the product API with exact quotations. Reproduce with
`.\.venv\Scripts\python.exe samples/public-dea/run_usecase.py` (writes `samples/public-dea/usecase-result.json`);
add `--server http://127.0.0.1:8007` to load them into a running app.

## Sources

| Agreement | Projects | Security (Section 3.0) | Signed | SHA-256 |
|---|---|---|---|---|
| [PJM / Potomac Edison Company DEA](https://www.pjm.com/-/media/DotCom/planning/rtep-dev/expan-plan-process/ferc-order-1000/rtep-proposal-windows/2024-rtep-window/2024-w1-poted-regional-projects.pdf) | b4000.11-.13, b4000.110 | $1,326,900 | 6/23/2025 and 6/27/2025 | 1ec49672… |
| [PJM / American Transmission Systems, Inc. DEA](https://www.pjm.com/-/media/DotCom/planning/rtep-dev/expan-plan-process/ferc-order-1000/rtep-proposal-windows/2024-rtep-window/2024-w1-dea-atsi-projects.pdf) | b3925.1-.4 | $6,519,600 | 6/25/2025 and 6/27/2025 | 6048a7d4… |

Both are 2024 RTEP Window 1 agreements in the same form, 24 pages, fully text-extractable. A four-page excerpt of
PJM's [Constructability & Financial Analysis Final Report](https://www.pjm.com/-/media/DotCom/committees-groups/committees/teac/2025/20250107/20250107-2024-rtep-window-1-constructability--financial-analysis.pdf)
(December 20, 2024) names the competing proposers; `make_proposals_excerpt.py` rebuilds it and records hashes. The signature
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

All assessments are COMPLETE, and replay reproduces each snapshot and result exactly.

**Is the security required at all?** On PJM's public record, a Nonincumbent Developer did submit competing
proposals for both needs: LS Power and NextEra for the regional need behind Potomac Edison's Proposal 551, and
NextEra (Proposals 294, 357 and 533) in the ATSI cluster behind Proposal 605. Under the Operating Agreement a
Transmission Owner proposing outside its own Zone is also a Nonincumbent Developer. That removes exemption route
(B). The security can therefore be avoided only if the entity is a Transmission Owner and the project was
selected under Operating Agreement Schedule 6 sections 1.5.8(g), (h) or (m)(1), which these documents do not
establish. Transource is called an incumbent in the PJM report and is not relied on.

**Use case 1: Potomac Edison alone** (16 states)

| PJM can draw | Holds whenever |
|---|---|
| $1,326,900 | Default = yes and no Section 8.0(ii)/(iii) termination (3 of the 4 exemption combinations) |
| $0 | every other combination |

The letter of credit is outstanding at $1,326,900 in 12 of 16 states; it is $0 only if both open exemption
conditions hold.

**What if PJM terminates under Section 8.0(ii), effective 2027-03-01?** (hypothetical scenario, horizon 2027-06-01)

| From | Outstanding | PJM can draw |
|---|---|---|
| 2026-10-10 | $1,326,900 | $1,326,900 |
| 2027-03-01 | $1,326,900 | $0 |
| 2027-03-31 | $0 | $0 |

The draw right ends with termination; the letter of credit must be cancelled within thirty days, so exposure
is kept until the last permitted day.

**Use case 2: both agreements as one portfolio** (256 states), for example a bank or parent treasury holding both

| PJM can draw | Holds whenever |
|---|---|
| $7,846,500 | both entities in Default, neither agreement terminated under 8.0(ii)/(iii) |
| $6,519,600 | ATSI in Default, not terminated under 8.0(ii)/(iii) |
| $1,326,900 | Potomac Edison in Default, not terminated under 8.0(ii)/(iii) |
| $0 | 169 other combinations |

Findings name what the answer depends on: the open conditions per agreement, and the unloaded issued letters
of credit, Operating Agreement Schedule 6 and FERC distribution orders.

## What had to change in the product

- **Conditions behind each amount.** An assessment used to report only the maximum and its state, plus up to
  128 raw samples showing only instrument face. Each assessment now lists every amount a metric can take and
  the conditions holding in every state producing it (States & Exposure). It is aggregated over every
  evaluated state while the assessment runs and stored beside the result, not inside it, so result hashes and
  replays are unchanged. The 256-state portfolio is explained in full.
- **Release measured from dated conditions.** A release or expiry rule can now carry a lag measured from the
  date its conditions were established by dated facts or events (here: cancellation within thirty days of a
  termination). A condition without a date never starts the lag, so exposure is retained.
- **Dated hypothetical occurrences.** Hypothetical scenarios can set a condition from a date ("terminated from
  2027-03-01") instead of only throughout. The exposure table now shows drawable amounts by date.

The draw right uses existing rule kinds: a reviewed DRAWABLE limit active on Default and two draw conditions.
Earlier records never combine a lag with no source event, and scenarios without dated occurrences store no new
field, so existing snapshots, reference packages and replays are unchanged.

## Limits

- Drawable equals the stated security only because the agreement states no partial-draw limit; prior draws
  and the issued instrument's own terms (issuer, expiry, draw documents) are not public and are not loaded.
- Whether either project was selected under sections 1.5.8(g), (h) or (m)(1), and whether each entity is a
  Transmission Owner for this purpose, are left open. The competing-proposal finding relies on PJM's report and
  the Operating Agreement definition; the definition text itself is not loaded.
- Whether a Default or a termination has occurred is not public here. ATSI's Schedule C financing milestone
  (9/1/2025) has passed; whether it was met is not established by these documents.
- Not a legal opinion. Interpretations were reviewed by the agent that entered them, not by counsel.
