"use client";
import { useState } from "react";
import "./transaction-walkthrough.css";

type Item = { id: string; [key: string]: any };
type Span = {
  document_id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
};
type Workspace = {
  project: Item;
  sites: Item[];
  documents: Item[];
  instruments: Item[];
  claims: Item[];
  scenarios: Item[];
  runs: Item[];
};
type Api = (path: string, body?: unknown, method?: string) => Promise<any>;
const SELECTION =
  "SYNTHETIC DEMONSTRATION — not an operative notice.\nRiverbend selects Birch and abandons Alder.\nCommercial site selection does not release the Alder letter of credit.\n";
const RELEASE_QUOTE =
  "Alder Utility authorizes cancellation of the USD 12,000,000 Alder letter of credit in full; this release concerns the instrument only and does not extinguish the separate engineering payment obligation.";
const RELEASE =
  "SYNTHETIC DEMONSTRATION — not an operative release.\nRiverbend / Alder / beneficiary release version 1.\n" +
  RELEASE_QUOTE +
  "\n";
const usd = (cents: number | null | undefined) =>
  cents == null
    ? "Not assessed"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(cents / 100);

export default function TransactionWalkthrough({
  w,
  reviewer,
  busy,
  api,
  act,
  refresh,
  onRun,
  onSource,
  onHistory,
}: {
  w: Workspace;
  reviewer: string;
  busy: boolean;
  api: Api;
  act: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  onRun: (run: Item) => void;
  onSource: (span: Span) => void;
  onHistory: (id: string) => void;
}) {
  const [focus, setFocus] = useState<string>("");
  const [decision, setDecision] = useState<
    "selection" | "release" | "withdraw" | null
  >(null);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const marker = w.documents.find((d) => d.transaction_case)?.transaction_case;
  if (!marker) return null;
  const root = "projects/" + w.project.id;
  const alder = w.instruments.find((i) => i.id === marker.instrument_a);
  const birch = w.instruments.find((i) => i.id === marker.instrument_b);
  const site = w.sites.find((s) => s.id === marker.site_a);
  const releaseDoc = w.documents.find(
    (d) => d.name === "04-riverbend-release.txt" && !d.superseded,
  );
  const selectionDoc = w.documents.find(
    (d) => d.name === "03-riverbend-selection.txt" && !d.superseded,
  );
  const selected = site?.commercial_status === "ABANDONED";
  const released =
    alder?.verification === "VERIFIED" &&
    alder?.release_verified &&
    ["RELEASED", "CANCELLED", "EXPIRED"].includes(alder?.lifecycle);
  const latest = w.runs.at(-1);
  const result = latest?.result;
  const current = latest && !latest.stale && result?.status === "COMPLETE";
  const chosen = w.instruments.find((i) => i.id === focus);
  const sourceSpans: Span[] = chosen
    ? [...chosen.evidence, ...(chosen.release_evidence || [])]
    : [];
  const stage = released
    ? 3
    : releaseDoc && !alder?.release_verified
      ? 2
      : selected
        ? 1
        : 0;

  async function operate(fn: () => Promise<void>) {
    await act(async () => {
      try {
        await fn();
      } finally {
        await refresh();
      }
    });
  }
  async function upload(name: string, text: string, existing?: Item) {
    if (existing) return existing;
    const body = new FormData();
    body.set("file", new File([text], name, { type: "text/plain" }));
    return api(root + "/documents", body);
  }
  async function assess() {
    const run = await api(root + "/runs", { scenario_id: w.scenarios[0].id });
    onRun(run);
  }
  function startDecision(value: "selection" | "release" | "withdraw") {
    setDecision(value);
    setReason("");
    setAck(false);
  }
  async function confirm() {
    const value = decision;
    if (!value || !reviewer || reason.trim().length < 3 || !ack || !alder)
      return;
    await operate(async () => {
      if (value === "selection") {
        const doc = await upload(
          "03-riverbend-selection.txt",
          SELECTION,
          selectionDoc,
        );
        await api(
          root + "/sites/" + marker.site_a,
          { name: "Alder", commercial_status: "ABANDONED" },
          "PATCH",
        );
        await api(
          root + "/sites/" + marker.site_b,
          { name: "Birch", commercial_status: "SELECTED" },
          "PATCH",
        );
        await api(root + "/documents/" + doc.id + "/complete", {
          reason: "Demonstration site-selection review: " + reason.trim(),
        });
      } else {
        // Pass only the existing instrument contract; keep imports and review separate.
        const fields = [
          "label",
          "beneficiary",
          "site_id",
          "face_cents",
          "currency",
          "lifecycle",
          "governing_law",
          "basis",
          "basis_hypothetical",
          "evidence",
          "basis_evidence",
          "release_evidence",
          "facility_usage_cents",
          "cash_collateral_cents",
          "guarantee_cents",
          "surety_cents",
        ];
        const body = Object.fromEntries(
          fields
            .filter((k) => alder[k] !== undefined)
            .map((k) => [k, alder[k]]),
        );
        if (value === "release") {
          if (!releaseDoc)
            throw new Error("Attach the release document first.");
          const text = releaseDoc.pages[0];
          const start = text.indexOf(RELEASE_QUOTE);
          if (start < 0)
            throw new Error(
              "The current release text differs. Review it through the manual workbench.",
            );
          body.lifecycle = "RELEASED";
          body.release_evidence = [
            {
              document_id: releaseDoc.id,
              page: 1,
              start,
              end: start + RELEASE_QUOTE.length,
              quote: RELEASE_QUOTE,
            },
          ];
        } else {
          body.lifecycle = "EFFECTIVE";
          body.release_evidence = [];
        }
        await api(root + "/instruments/" + alder.id, body, "PATCH");
        await api(root + "/instruments/" + alder.id + "/review", {
          decision: "VERIFIED",
          reason:
            "Demonstration " +
            (value === "release"
              ? "release"
              : "withdrawal of release evidence") +
            " review: " +
            reason.trim(),
        });
        if (releaseDoc && releaseDoc.processing !== "REVIEWED")
          await api(root + "/documents/" + releaseDoc.id + "/complete", {
            reason: "Demonstration release document review: " + reason.trim(),
          });
      }
      setDecision(null);
      await assess();
    });
  }

  return (
    <section
      className="transaction-case"
      aria-label="Riverbend transaction walkthrough"
    >
      <div className="case-heading">
        <div>
          <p className="eyebrow">
            PRE-REVIEWED SYNTHETIC CASE · NO AI EXTRACTION IMPLIED
          </p>
          <h2>
            One site selected.
            <br />
            Two letters of credit outstanding?
          </h2>
          <p>
            Follow the decision from commercial intent to documentary evidence.
          </p>
        </div>
        <span className="case-label">300 MW · 2 sites</span>
      </div>
      <ol className="case-stages" aria-label="Transaction milestones">
        {[
          "Security posted",
          "Birch selected",
          "Release received",
          "Release reviewed",
        ].map((label, i) => (
          <li
            key={label}
            aria-current={i === stage ? "step" : undefined}
            className={i === stage ? "current" : ""}
          >
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="case-summary">
        <div>
          <span>
            {current
              ? "Modeled instrument exposure"
              : latest
                ? "Historical instrument exposure"
                : "Instrument exposure"}
          </span>
          <strong>{usd(result?.maximum_cents)}</strong>
          <small>
            {current
              ? "Current reviewed inputs · face basis"
              : latest
                ? "Inputs changed or incomplete; recompute before relying on this result."
                : "Run the server assessment to see the result."}
          </small>
        </div>
        <div>
          <span>Maximum underlying obligations</span>
          <strong>{usd(result?.maximum_obligations_cents)}</strong>
          <small>Obligations and instrument face are separate.</small>
        </div>
        <div>
          <span>Bank capacity / cash released</span>
          <strong className="case-unknown">Not established</strong>
          <small>No bank utilization or cash evidence in this fixture.</small>
        </div>
      </div>
      <div className="case-verdict" role="status">
        <b>
          {released
            ? "Release evidence supports removing Alder’s instrument contribution."
            : selected
              ? "Selecting Birch did not release Alder’s letter of credit."
              : "Alder and Birch both have outstanding instruments."}
        </b>
        <p>
          {released
            ? "The separate $2M Alder engineering obligation remains in the model. A lower instrument exposure does not prove a bank-capacity or cash benefit."
            : "The model retains the full face of each instrument. A site decision alone cannot supply the missing documentary release."}
        </p>
      </div>
      {latest && result?.status !== "COMPLETE" && (
        <div role="alert" className="error">
          <b>Assessment incomplete</b>
          <ul>
            {result?.issues?.map((issue: string) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="case-body">
        <div className="panel">
          <h3>Explain each contribution</h3>
          <p>
            Choose an instrument to inspect the exact evidence and review
            history.
          </p>
          {[alder, birch].filter(Boolean).map((i) => (
            <button
              key={i!.id}
              className={
                focus === i!.id
                  ? "case-contribution selected"
                  : "case-contribution"
              }
              onClick={() => setFocus(i!.id)}
              aria-pressed={focus === i!.id}
            >
              <span>
                <b>{i!.label}</b>
                <small>
                  {w.sites.find((s) => s.id === i!.site_id)?.commercial_status}{" "}
                  · {i!.lifecycle}
                </small>
              </span>
              <strong>
                {current
                  ? usd(result.instrument_contributions[i!.id])
                  : "Recompute"}
              </strong>
              <span className="case-bar">
                <span
                  style={{
                    width: current
                      ? Math.min(
                          100,
                          (result.instrument_contributions[i!.id] /
                            (result.maximum_cents || 1)) *
                            100,
                        ) + "%"
                      : "0%",
                  }}
                />
              </span>
            </button>
          ))}
          <p className="case-note">
            Birch’s $3M engineering and $15M construction obligations share one
            $18M instrument. Its face is counted once.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void operate(assess)}
          >
            Recompute from current inputs
          </button>
        </div>
        <div className="panel">
          <p className="eyebrow">NEXT DECISION</p>
          <h3>
            {released
              ? "Confirm the economic effect"
              : releaseDoc
                ? "Review the beneficiary release"
                : selected
                  ? "Obtain documentary release"
                  : "Record which site was selected"}
          </h3>
          <p>
            {released
              ? "Treasury still needs evidence of actual facility usage, cash collateral, and bank treatment. Those metrics remain unknown."
              : releaseDoc
                ? "Receiving a document does not approve it. Confirm its exact quotation and record an explicit demonstration review."
                : selected
                  ? "The old instrument remains exposed. Request the beneficiary and issuer documentation needed to support its release."
                  : "Review the synthetic selection notice. This updates commercial status without changing documentary rights."}
          </p>
          {!selected && (
            <button disabled={busy} onClick={() => startDecision("selection")}>
              Review & record site selection
            </button>
          )}
          {selected && !releaseDoc && (
            <button
              disabled={busy}
              onClick={() =>
                void operate(async () => {
                  await upload("04-riverbend-release.txt", RELEASE);
                })
              }
            >
              Attach synthetic release document
            </button>
          )}
          {releaseDoc && !released && (
            <button disabled={busy} onClick={() => startDecision("release")}>
              Review release evidence
            </button>
          )}
          {released && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => startDecision("withdraw")}
            >
              Test withdrawal of release evidence
            </button>
          )}
          <p className="case-note">
            All actions are local, auditable demonstration activity. No outreach
            or legal approval occurs.
          </p>
        </div>
      </div>
      {chosen && (
        <div className="panel case-evidence">
          <div className="case-evidence-heading">
            <h3>{chosen.label} · evidence</h3>
            <button className="secondary" onClick={() => setFocus("")}>
              Close evidence
            </button>
          </div>
          <p>
            Face {usd(chosen.face_cents)} · {chosen.verification} · release{" "}
            {chosen.release_verified ? "reviewed" : "not supported"}
          </p>
          {sourceSpans.map((span, n) => {
            const doc = w.documents.find((d) => d.id === span.document_id);
            return (
              <article key={span.document_id + ":" + span.start}>
                <p className="eyebrow">
                  {n < chosen.evidence.length
                    ? "INSTRUMENT FACE"
                    : "RELEASE EVIDENCE"}{" "}
                  · {doc?.name} · v{doc?.version} · page {span.page}
                </p>
                <blockquote>{span.quote}</blockquote>
                <button className="text-button" onClick={() => onSource(span)}>
                  Open exact source passage →
                </button>
              </article>
            );
          })}
          <h4>Review history</h4>
          {((w as Workspace & { reviews?: Item[] }).reviews || [])
            .filter((r) => r.record_id === chosen.id)
            .map((r) => (
              <p key={r.id}>
                <b>{r.reviewer}</b> · {r.at}
                <br />
                {r.reason}
              </p>
            ))}
        </div>
      )}
      {decision && (
        <form
          className="panel case-review"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p className="eyebrow">EXPLICIT DEMONSTRATION DECISION</p>
          <h3>
            {decision === "selection"
              ? "Review the selection notice"
              : decision === "release"
                ? "Review the instrument release"
                : "Withdraw release evidence and restore face exposure"}
          </h3>
          <blockquote>
            {decision === "selection"
              ? SELECTION
              : decision === "release"
                ? releaseDoc?.pages[0]
                : "This test removes the modeled release evidence and restores the instrument to EFFECTIVE. Earlier results remain historical and reproducible."}
          </blockquote>
          <label>
            Decision reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={1800}
              placeholder="Explain what you checked in this synthetic evidence."
            />
          </label>
          <label className="case-check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              required
            />
            I am recording a synthetic demonstration decision, not a legal
            opinion.
          </label>
          <p>
            Reviewer:{" "}
            <b>
              {reviewer || "Save your reviewer name above before continuing."}
            </b>
          </p>
          <div className="actions">
            <button
              disabled={busy || !reviewer || !ack || reason.trim().length < 3}
            >
              Confirm decision & assess
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setDecision(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="panel">
        <h3>Assessment history · what changed and why</h3>
        {!w.runs.length ? (
          <p>No saved assessment yet.</p>
        ) : (
          <ol className="case-history">
            {w.runs.map((r) => (
              <li key={r.id}>
                <button className="text-button" onClick={() => onHistory(r.id)}>
                  {usd(r.result.maximum_cents)} · revision {r.revision} ·{" "}
                  {r.stale ? "historical" : "current"}
                </button>
                <span>
                  {r.result.status} · {r.at}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="case-note">
          Open any assessment to inspect its frozen inputs, replay it, and
          export its evidence package.
        </p>
      </div>
    </section>
  );
}
