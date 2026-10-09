Historical manual release. The current local-AI milestone is documented in [local-ai-release.md](local-ai-release.md).

# LoadBond v2: manual evidence workbench

Implemented October 9, 2026. This release replaces the fixed first-screen portfolio with an empty project list. The local app accepts ordinary prose documents without requiring the sample parser's special syntax.

## Walkthrough

1. Open the local app with `local-demo`. Save a reviewer name and create a project. The sample is an optional separate action.
2. Add sites. Upload a public or synthetic text document or text-based PDF under Source documents.
3. Add an instrument. Enter its face, beneficiary and site. Select a source passage, or paste an exact quote and attach it. Face-based exposure is the default. Review the proposed instrument separately.
4. Add obligations with their amounts, categories and securing instruments. Attach their exact quotes. Resolve uncertain mapping before confirming an additive component. Review each record.
5. Finish each document's review with a reason. If it contains no relevant obligations, record that explicitly; uploading or obtaining zero claims does not complete review.
6. Create source-supported constraints and review them separately. A hypothetical constraint belongs only in a hypothetical scenario.
7. Compute the baseline or a saved scenario. Inspect the source-backed maximizing state, instrument amounts, modeling basis and applied constraints. Export JSON/CSV or print the selected evidence report.
8. Amend a document using the replacement selector. Affected input reviews and dependent constraints are revoked. Earlier results become historical. Edit the records to cite the current evidence, re-review, and compute a new assessment.
9. Select an old assessment and replay it. Its frozen inputs and hashes remain unchanged.
10. In Evidence & history, check the stored audit chain. LoadBond reports broken event hashes or links without claiming that local SQLite is tamper-proof storage.

`samples/harbor-agreement.txt` and `harbor-amendment.txt` are prose fixtures for this workflow, explicitly synthetic. The captured browser walkthrough creates Harbor renewal manually; it does not load the North Ridge sample.

## Numerical behavior

Harbor's initial instrument face is $500,000; obligations are $100,000 fixed plus two $200,000 conditional components. A reviewed one-branch cap produces $300,000 maximum obligations but retains $500,000 face-based instrument exposure. Only an explicitly reviewed hypothetical claim-limited basis produces $300,000 exposure in the hypothetical scenario. The documented baseline remains face-based.

The amendment changes the face to $600,000 and components to $120,000/$240,000/$240,000. The browser verified that stale evidence blocks completion, the old $300,000 result still replays, and the new reviewed baseline returns $600,000.

The optional North Ridge sample still reproduces $80M/$52.2M/$67M. Its reduced scenarios explicitly depend on synthetic claim-limited assumptions. They are not observed savings or executed LC arrangements.

## Storage, compatibility and boundaries

`data/workbench.sqlite` contains project-scoped entity tables, transactional reviews, hash-linked events and immutable run snapshots. Each entity stores a validated payload; project foreign keys are enforced by SQLite, and cross-record references are validated by the API. This is not a complete relational projection of every payload field.

The **Import historical v1 workspace** action reads the prior database once per token, creates a separate project and copies original run snapshots and hashes. It does not overwrite the old database. Migrated current inputs may require correction and review. Legacy run replay dispatches to enumeration-1.0; new runs use enumeration-2.0. The historical interface remains available at `/legacy`.

V2 routes are project-scoped under `/v2` on FastAPI and `/api/v2` on Next.js. They cover project/site/instrument/claim/constraint/scenario creation and editing, upload and completion, independent record review, run inspection, replay and exports. Schemas are in `schemas/v2-*.schema.json`; full OpenAPI includes both API versions.

This release makes no AI provider calls. The older adapter remains in the historical v1 application; it is not part of the v2 workflow. Hosting, OCR, confidential customer data, customer identity and production security remain outside this release.

The video is a narrated sequence of actual browser captures, not a continuous screen recording. It demonstrates synthetic software behavior and is not evidence of commercial or legal validation.
