"use client";
import { useEffect, useState } from "react";
import StateEditor from "./state-editor";
import ExtractionPanel, { type Proposal } from "./extraction-panel";
import {
  type Entity,
  type Span,
  type StateWorkspaceData,
  type StateView,
  type EditorType,
  type StateApi,
  dollars,
  labels,
} from "./state-types";
import "./state-workspace.css";

const today = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};
function highlight(text: string, span?: Span | null) {
  if (!span) return text;
  const chars = Array.from(text);
  return (
    <>
      {chars.slice(0, span.start).join("")}
      <mark>{chars.slice(span.start, span.end).join("")}</mark>
      {chars.slice(span.end).join("")}
    </>
  );
}
export default function StateWorkspace({
  pid,
  token,
  reviewer,
  revision,
  view,
  onView,
  onRefresh,
  onRegister,
  onProposal,
}: {
  pid: string;
  token: string;
  reviewer: string;
  revision: number;
  view: StateView;
  onView: (v: StateView) => void;
  onRefresh: () => Promise<void>;
  onRegister: (
    kind: "instruments" | "claims" | "sites",
    docId?: string,
    item?: Entity,
  ) => void;
  onProposal: (p: Proposal) => void;
}) {
  const [w, setW] = useState<StateWorkspaceData | null>(null);
  const [modelId, setModelId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [horizon, setHorizon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{
    type: EditorType;
    item?: Entity;
    proposal?: Entity;
  } | null>(null);
  const [review, setReview] = useState<{
    type: EditorType | "instruments" | "claims";
    item: Entity;
  } | null>(null);
  const [run, setRun] = useState<Entity | null>(null);
  const [metric, setMetric] = useState("instrument_face");
  const [focus, setFocus] = useState<{
    id: string;
    spans: Span[];
    label: string;
  } | null>(null);
  const [docId, setDocId] = useState("");
  const [page, setPage] = useState(1);
  const [sourceSpan, setSourceSpan] = useState<Span | null>(null);
  const [comparison, setComparison] = useState<Entity | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [decisionReason, setDecisionReason] = useState("");
  const [proposalDismiss, setProposalDismiss] = useState<Entity | null>(null);
  const [findingEdit, setFindingEdit] = useState<Entity | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [replacement, setReplacement] = useState("");
  const root = "projects/" + pid;
  const api: StateApi = async (path, body, method, version = "v3") => {
    const response = await fetch("/api/" + version + "/" + root + "/" + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: "Bearer " + token,
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      const e = await response.json();
      throw new Error(
        typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail),
      );
    }
    return response.json();
  };

  const inputApi = async (path: string, body?: unknown, method?: string) => {
    const r = await fetch("/api/v2/" + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(
        typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail),
      );
    }
    return r.json();
  };
  async function load() {
    const response = await fetch("/api/v3/" + root, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("State workspace could not be loaded.");
    const next = await response.json();
    setW(next);
    setModelId((id) =>
      next.models.some((m: Entity) => m.id === id)
        ? id
        : next.models[0]?.id || "",
    );
    setDocId((id) =>
      next.documents.some((d: Entity) => d.id === id)
        ? id
        : next.documents.find((d: Entity) => !d.superseded)?.id || "",
    );
    return next;
  }
  useEffect(() => {
    let active = true;
    setW(null);
    setRun(null);
    setEditor(null);
    setReview(null);
    setFocus(null);
    setModelId("");
    setScenarioId("");
    setError("");
    fetch("/api/v3/" + root, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("State workspace unavailable.");
        const next = await r.json();
        if (active) {
          setW(next);
          const id = new URL(window.location.href).searchParams.get("model");
          setModelId(
            next.models.some((m: Entity) => m.id === id)
              ? id
              : next.models[0]?.id || "",
          );
          setDocId(next.documents.find((d: Entity) => !d.superseded)?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [pid, token]);
  useEffect(() => {
    if (w && w.project.revision !== revision)
      void load().catch((e) => setError(String(e)));
  }, [revision]);
  const activeJobs = [...(w?.clause_jobs || []), ...(w?.input_jobs || [])]
    .filter((j) => ["QUEUED", "RUNNING"].includes(j.status))
    .map((j) => j.id)
    .join(",");
  useEffect(() => {
    if (!activeJobs) return;
    const timer = setInterval(() => {
      void load().catch((e) => setError(String(e)));
    }, 2000);
    return () => clearInterval(timer);
  }, [activeJobs]);
  useEffect(() => {
    const ids = w?.scenarios.filter((s) => s.model_id === modelId) || [];
    setScenarioId((id) =>
      ids.some((s) => s.id === id)
        ? id
        : ids.find((s) => s.view === "FUTURE")?.id || ids[0]?.id || "",
    );
    if (modelId) {
      const url = new URL(window.location.href);
      url.searchParams.set("model", modelId);
      window.history.replaceState(null, "", url);
    }
  }, [modelId, w?.scenarios.length]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setComparison(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      try {
        await load();
        await onRefresh();
      } catch (e) {
        setError(String(e));
      }
      setBusy(false);
    }
  }
  function openEditor(type: EditorType, item?: Entity, proposal?: Entity) {
    setEditor({ type, item, proposal });
    setReview(null);
    setError("");
  }
  async function save(body: any, reason?: string) {
    await action(async () => {
      const value = editor!.proposal
        ? await api("clause-proposals/" + editor!.proposal.id + "/resolve", {
            action: "IMPORT",
            reason: reason || "Edited proposal imported without approval",
            edited: body,
          })
        : await api(
            editor!.type + (editor!.item ? "/" + editor!.item.id : ""),
            body,
            editor!.item ? "PATCH" : "POST",
          );
      if (editor!.type === "models") setModelId(value.id);
      setEditor(null);
      setNotice("Saved. Inputs and interpretations require separate review.");
    });
  }
  async function assess() {
    await action(async () => {
      const r = await api("assessments", {
        model_id: modelId,
        scenario_id: scenarioId,
        as_of: asOf,
        horizon_end: horizon || null,
        request_id: crypto.randomUUID(),
      });
      setRun(r);
      setNotice(
        r.result.status === "COMPLETE"
          ? "Assessment saved from frozen reviewed inputs."
          : "Assessment saved as " +
              r.result.status.toLowerCase() +
              "; resolve the listed issues.",
      );
    });
  }
  async function inspect(id: string) {
    await action(async () => {
      setRun(await api("assessments/" + id));
      onView("decision-brief");
      setFocus(null);
    });
  }
  async function trace(id: string) {
    await action(async () => {
      const full = await api("assessments/" + current!.id);
      setRun(full);
      const i = full.snapshot.instruments.find((x: Entity) => x.id === id);
      const cl = full.snapshot.claims.find((x: Entity) => x.id === id);
      const r = full.result.metrics[metric];
      const spans = i
        ? r.evidence_by_instrument?.[id] || i.evidence
        : cl?.evidence || [];
      setFocus({
        id,
        label: i?.label || cl?.label || id,
        spans: Array.from(
          new Map<string, Span>(
            spans.map((e: Span) => [
              e.document_id + ":" + e.page + ":" + e.start + ":" + e.end,
              e,
            ]),
          ).values(),
        ),
      });
    });
  }
  async function download(format: string) {
    setError("");
    try {
      const response = await fetch(
        "/api/v3/" +
          root +
          "/assessments/" +
          current!.id +
          "/export?format=" +
          format,
        { headers: { Authorization: "Bearer " + token } },
      );
      if (!response.ok) throw new Error("Evidence export failed.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadbond-state-evidence." + format;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    }
  }
  function showSource(span: Span) {
    setDocId(span.document_id);
    setPage(span.page);
    setSourceSpan(span);
    setFocus(null);
    onView("source-review");
  }
  function startReview(
    type: EditorType | "instruments" | "claims",
    item: Entity,
  ) {
    setDecisionReason("");
    setReview({ type, item });
    setEditor(null);
  }
  if (!w)
    return (
      <div className="state-app">
        <div className="panel" role="status">
          {error || "Loading transaction records…"}
        </div>
      </div>
    );
  const model = w.models.find((m) => m.id === modelId);
  const scenarios = w.scenarios.filter((s) => s.model_id === modelId);
  const current =
    run?.model_id === modelId
      ? run
      : w.runs.filter((r) => r.model_id === modelId).at(-1);
  const historical = current && current.revision !== w.project.revision;
  const result = current?.result;
  const basis = current?.snapshot || w;
  const docs = basis.documents || w.documents;
  const doc = w.documents.find((d) => d.id === docId);
  const facts = w.facts.filter((f) => f.model_id === modelId);
  const rules = w.rules.filter((r) => r.model_id === modelId);
  const events = w.events.filter((e) => e.model_id === modelId);
  const links = w.document_links?.filter((l) => l.model_id === modelId) || [];
  const blocked = busy || w.project.archived;
  const financial = result?.metrics?.[metric];
  const queue = [
    ...w.instruments.map((item) => ({ type: "instruments" as const, item })),
    ...w.claims.map((item) => ({ type: "claims" as const, item })),
    ...facts.map((item) => ({ type: "facts" as EditorType, item })),
    ...events.map((item) => ({ type: "events" as EditorType, item })),
    ...rules.map((item) => ({ type: "rules" as EditorType, item })),
    ...links.map((item) => ({ type: "document-links" as EditorType, item })),
    ...w.balances
      .filter((b) => b.model_id === modelId)
      .map((item) => ({ type: "balances" as EditorType, item })),
  ].filter(({ item }) => item.verification === "UNVERIFIED");
  const scopeInstruments = w.instruments.filter((i) =>
    model?.instrument_ids.includes(i.id),
  );
  const stateCells = (values: Record<string, boolean>) =>
    Object.entries(values).map(([key, value]) => (
      <span key={key} className="state-tag">
        {facts.find((f) => f.key === key)?.label ||
          basis.claims?.find((c: Entity) => "claim:" + c.id === key)?.label ||
          key}
        : <b>{String(value)}</b>
      </span>
    ));

  return (
    <div className="state-app">
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      <div className="state-toolbar">
        <label>
          Transaction model
          <select
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              setRun(null);
              setFocus(null);
              setComparison(null);
              setEditor(null);
            }}
          >
            <option value="">No model yet</option>
            {w.models.map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={blocked || !w.instruments.length}
          onClick={() => openEditor("models")}
        >
          New model
        </button>
        {model && (
          <button
            className="text-button"
            disabled={blocked}
            onClick={() => openEditor("models", model)}
          >
            Edit scope
          </button>
        )}
        <span className="state-badge">
          {model?.basis === "CONTRACTUAL_CAPACITY"
            ? "CONTRACTUAL CAPACITY · NOT ACTUAL BALANCES"
            : "RECORDED POSITION · UNKNOWN DATES RETAIN EXPOSURE"}
        </span>
      </div>
      {!model && !editor && (
        <section className="panel state-empty">
          <p className="eyebrow">START WITH THE TRANSACTION</p>
          <h2>What can become payable or drawable?</h2>
          <p>
            Add source-backed instruments and obligations, then define the
            model’s scope. Reviewed amounts do not automatically approve
            contractual interpretations.
          </p>
          <div className="actions">
            <button
              disabled={blocked}
              onClick={() => onRegister("instruments")}
            >
              Add an instrument
            </button>
            <button
              className="secondary"
              disabled={blocked || !w.instruments.length}
              onClick={() => openEditor("models")}
            >
              Define transaction model
            </button>
            <button
              className="text-button"
              onClick={() => onView("source-review")}
            >
              Upload evidence →
            </button>
          </div>
        </section>
      )}
      {editor && (
        <section className="panel" aria-label="Input editor">
          <StateEditor
            key={
              editor.type +
              ":" +
              (editor.item?.id || editor.proposal?.id || "new")
            }
            {...editor}
            modelId={modelId}
            w={w}
            api={api}
            busy={blocked}
            onSave={save}
            onCancel={() => setEditor(null)}
            onError={setError}
          />
        </section>
      )}
      {model && (
        <>
          <div className="state-assess-controls">
            <label>
              Scenario
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.view}
                  </option>
                ))}
              </select>
            </label>
            <label>
              As of
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </label>
            <label>
              Horizon end (optional)
              <input
                type="date"
                min={asOf}
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
              />
            </label>
            <button
              disabled={blocked || !scenarioId || !asOf}
              onClick={() => void assess()}
            >
              {busy ? "Working…" : "Assess reviewed model"}
            </button>
          </div>
          <p className="state-caption">
            {model.scope_notes ||
              "Model scope is limited to selected inputs and separately reviewed rules."}
          </p>
          {historical && (
            <div className="state-historical" role="status">
              HISTORICAL ASSESSMENT · inputs changed since revision{" "}
              {current.revision}. Recompute to assess the current transaction.
              The original snapshot remains reproducible.
            </div>
          )}
          {result && result.status !== "COMPLETE" && (
            <section className="panel" role="alert">
              <h2>
                {result.status === "UNSUPPORTED"
                  ? "Model exceeds the supported boundary"
                  : "Assessment needs more evidence or review"}
              </h2>
              <ul>
                {result.issues.map((issue: string) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              <button
                className="secondary"
                onClick={() => onView("source-review")}
              >
                Resolve in Sources & Review
              </button>
            </section>
          )}
          {view === "model" && (
            <>
              <div className="state-metrics">
                {["instrument_face", "obligations", "drawable"].map((key) => (
                  <button
                    className="state-metric"
                    key={key}
                    onClick={() => {
                      setMetric(key);
                      onView("state-explorer");
                    }}
                  >
                    <span>{labels[key]} maximum</span>
                    <strong>
                      {result?.metrics?.[key]?.basis === "LOWER_BOUND" &&
                        "At least "}
                      {dollars(result?.metrics?.[key]?.maximum_cents)}
                    </strong>
                    <small>
                      {key === "drawable" &&
                      result?.metrics?.drawable?.maximum_cents == null
                        ? "Documentary rights or balances unresolved"
                        : result?.metrics?.[key]?.basis === "LOWER_BOUND"
                          ? "Can rise by an unstated amount"
                          : current
                          ? current.scenario_name
                          : "No saved assessment"}
                    </small>
                  </button>
                ))}
              </div>
              <div className="state-verdict">
                <b>
                  {result?.status === "COMPLETE"
                    ? "Inspect the state behind the maximum before changing security."
                    : "Build a supported transaction model before relying on a financial result."}
                </b>
                <p>
                  {result?.status === "COMPLETE"
                    ? result.notice
                    : "Proposed facts, rules, and events require separate human decisions. Missing reduction evidence supplies no credit."}
                </p>
              </div>
              <div className="state-columns">
                <section className="panel">
                  <div className="state-section-heading">
                    <h2>Transaction timeline</h2>
                    <button
                      className="text-button"
                      disabled={blocked}
                      onClick={() => openEditor("events")}
                    >
                      Add dated occurrence →
                    </button>
                  </div>
                  <div className="state-timeline">
                    {events.length ? (
                      events
                        .toSorted(
                          (a, b) =>
                            (a.effective_on || "9999").localeCompare(
                              b.effective_on || "9999",
                            ) || a.sequence - b.sequence,
                        )
                        .map((e) => (
                          <article key={e.id}>
                            <span className="state-caption">
                              {e.effective_on || "Effective date unresolved"} ·{" "}
                              {e.event_type} · {e.verification}
                            </span>
                            <h3>{e.label}</h3>
                            <p>
                              Execution: {e.executed_on || "Unknown"}
                              {e.instrument_id
                                ? " · " +
                                  w.instruments.find(
                                    (i) => i.id === e.instrument_id,
                                  )?.label
                                : ""}
                            </p>
                            <button
                              className="text-button"
                              onClick={() => showSource(e.evidence[0])}
                            >
                              Inspect source →
                            </button>
                          </article>
                        ))
                    ) : (
                      <div>
                        <h3>Occurrence dates are not established.</h3>
                        <p>
                          Contract commitments do not prove actual issuance or
                          release. Add dated occurrences with their own
                          evidence.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
                <section className="panel">
                  <p className="eyebrow">NEXT DECISION</p>
                  <h2>
                    {queue.length
                      ? "Review the transaction’s interpretations"
                      : result?.findings?.length
                        ? "Resolve the evidence gaps"
                        : "Inspect the supported state model"}
                  </h2>
                  <p>
                    {queue.length} inputs await separate review.{" "}
                    {result?.findings?.length || 0} findings require
                    investigation.
                  </p>
                  <button onClick={() => onView("source-review")}>
                    Open Sources & Review
                  </button>
                  <p className="state-caption">
                    Bank utilization, restricted cash and economic benefit
                    remain unestablished unless separately evidenced.
                  </p>
                </section>
              </div>
              <section className="panel">
                <div className="state-section-heading">
                  <h2>Instrument → clause → modeled contribution</h2>
                  <button
                    className="text-button"
                    onClick={() => onView("state-explorer")}
                  >
                    Explore states →
                  </button>
                </div>
                <div className="state-instrument-grid">
                  {scopeInstruments.map((i) => {
                    const contribution =
                      result?.metrics?.instrument_face?.contributions?.[i.id];
                    return (
                      <button
                        className="state-instrument"
                        key={i.id}
                        disabled={!current || result?.status !== "COMPLETE"}
                        onClick={() => {
                          setMetric("instrument_face");
                          void trace(i.id);
                        }}
                      >
                        <span className="state-caption">{i.beneficiary}</span>
                        <h3>{i.label}</h3>
                        <strong>{dollars(contribution)}</strong>
                        <span className="state-bar">
                          <span
                            style={{
                              width:
                                typeof contribution === "number"
                                  ? Math.min(
                                      100,
                                      (contribution /
                                        (result.metrics.instrument_face
                                          .maximum_cents || 1)) *
                                        100,
                                    ) + "%"
                                  : "0%",
                            }}
                          />
                        </span>
                        <small>Open source and reviewed interpretation</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}
          {view === "state-explorer" && (
            <>
              <div className="state-section-heading">
                <div>
                  <p className="eyebrow">EXACT WITHIN THE REVIEWED MODEL</p>
                  <h2>See why this state produces the maximum.</h2>
                </div>
                <button
                  className="secondary"
                  disabled={blocked}
                  onClick={() => openEditor("scenarios")}
                >
                  New scenario
                </button>
              </div>
              <div
                className="state-metric-tabs"
                role="group"
                aria-label="Metric to inspect"
              >
                {Object.entries(labels).map(([key, label]) => (
                  <button
                    className={metric === key ? "active" : "secondary"}
                    aria-pressed={metric === key}
                    key={key}
                    onClick={() => {
                      setMetric(key);
                      setFocus(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {financial?.maximum_cents != null ? (
                <section className="panel">
                  <p className="eyebrow">
                    {historical ? "HISTORICAL" : "SAVED"} ·{" "}
                    {current!.scenario_name} · MAXIMIZING DATE {financial.as_of}
                  </p>
                  <h2>
                    {dollars(financial.maximum_cents)} · {labels[metric]}
                  </h2>
                  <div className="state-tags">
                    {stateCells(financial.state)}
                  </div>
                  <div className="state-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Contributing record</th>
                          <th>Amount</th>
                          <th>Trace</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(financial.contributions).map(
                          ([id, amount]) => (
                            <tr key={id}>
                              <td>
                                {basis.instruments.find(
                                  (i: Entity) => i.id === id,
                                )?.label ||
                                  basis.claims.find((c: Entity) => c.id === id)
                                    ?.label ||
                                  id}
                              </td>
                              <td>{dollars(amount)}</td>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => void trace(id)}
                                >
                                  Evidence →
                                </button>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <details>
                    <summary>
                      {financial.rule_trace?.length || 0} evaluated rules and
                      exact source support
                    </summary>
                    {financial.rule_trace?.map((r: Entity) => (
                      <article key={r.rule_id}>
                        <b>
                          {basis.rules?.find((x: Entity) => x.id === r.rule_id)
                            ?.label || r.kind}
                        </b>
                        <p>
                          Conditions{" "}
                          {r.condition_matches ? "matched" : "did not match"}.
                          Type: {r.kind}.
                        </p>
                        {r.evidence.map((e: Span) => (
                          <button
                            className="state-source-link"
                            key={e.document_id + e.start}
                            onClick={() => showSource(e)}
                          >
                            {e.quote}
                          </button>
                        ))}
                      </article>
                    ))}
                  </details>
                </section>
              ) : (
                <section className="panel">
                  <h2>{labels[metric]} remains unknown.</h2>
                  <p>
                    No supported value is fabricated. Review documentary
                    conditions, balances, and the model’s evidence gaps.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => onView("source-review")}
                  >
                    Review supporting evidence
                  </button>
                </section>
              )}
              {result?.envelope?.length > 0 && (
                <section className="panel">
                  <h2>Exposure across modeled boundaries</h2>
                  <ExposureChart rows={result.envelope} />
                  <div className="state-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Instrument maximum</th>
                          <th>Gross, same stress</th>
                          <th>Obligations</th>
                          <th>Feasible states</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.envelope.map((row: Entity) => (
                          <tr key={row.as_of}>
                            <td>{row.as_of}</td>
                            <td>{dollars(row.maxima.instrument_face)}</td>
                            <td>{dollars(row.gross_instrument_face_cents)}</td>
                            <td>{dollars(row.maxima.obligations)}</td>
                            <td>{row.feasible_states}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="state-caption">
                    Evaluated event dates and contractual boundaries; not an
                    inferred daily historical instrument ledger.
                  </p>
                </section>
              )}
              <section className="panel">
                <h2>Compare arrangements from one frozen input set</h2>
                <div className="state-tags">
                  {scenarios.map((s) => (
                    <label className="state-check" key={s.id}>
                      <input
                        type="checkbox"
                        checked={compareIds.includes(s.id)}
                        onChange={(e) => {
                          setComparison(null);
                          setCompareIds((ids) =>
                            e.target.checked
                              ? [...ids, s.id]
                              : ids.filter((id) => id !== s.id),
                          );
                        }}
                      />
                      {s.name} · {s.view}
                    </label>
                  ))}
                </div>
                <button
                  disabled={
                    blocked || compareIds.length < 2 || compareIds.length > 4
                  }
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void api("comparisons", {
                      model_id: modelId,
                      scenario_ids: compareIds,
                      as_of: asOf,
                      horizon_end: horizon || null,
                    })
                      .then(setComparison)
                      .catch((e) => setError(String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Preview comparison
                </button>
                {comparison && (
                  <div className="state-table-wrap">
                    <p className="state-caption">
                      PREVIEW · common revision {comparison.project_revision} ·
                      no saved assessments or reviews
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Scenario</th>
                          <th>Instrument maximum</th>
                          <th>Gross under same stress</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.comparisons.map((r: Entity) => (
                          <tr key={r.scenario.id}>
                            <td>
                              {r.scenario.name}
                              <small>{r.scenario.view}</small>
                            </td>
                            <td>
                              {dollars(
                                r.result.metrics?.instrument_face
                                  ?.maximum_cents,
                              )}
                            </td>
                            <td>
                              {dollars(r.result.gross_instrument_face_cents)}
                            </td>
                            <td>{r.result.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              {result?.states?.length > 0 && (
                <details className="panel">
                  <summary>
                    {result.feasible_states} feasible evaluations ·{" "}
                    {result.states_truncated
                      ? "first 128 samples shown"
                      : "all shown"}
                  </summary>
                  {result.states.map((row: Entity, n: number) => (
                    <div className="state-sample" key={n}>
                      <b>
                        {row.as_of} · {dollars(row.totals.instrument_face)}
                      </b>
                      <div className="state-tags">{stateCells(row.state)}</div>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          {view === "decision-brief" && (
            <section className="state-brief">
              <div className="state-section-heading">
                <div>
                  <p className="eyebrow">
                    {historical
                      ? "HISTORICAL DECISION BRIEF"
                      : "DECISION BRIEF"}{" "}
                    · {model.basis}
                  </p>
                  <h2>{current?.snapshot?.project.name || w.project.name}</h2>
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={!current}
                    onClick={() => void download("json")}
                  >
                    Export evidence JSON
                  </button>
                  <button
                    className="secondary"
                    disabled={!current}
                    onClick={() => void download("csv")}
                  >
                    Export contributions CSV
                  </button>
                  <button
                    className="secondary"
                    disabled={!current}
                    onClick={() => window.print()}
                  >
                    Print brief
                  </button>
                </div>
              </div>
              <div className="state-metrics">
                {["instrument_face", "obligations", "drawable"].map((key) => (
                  <div className="state-metric" key={key}>
                    <span>{labels[key]} maximum</span>
                    <strong>
                      {result?.metrics?.[key]?.basis === "LOWER_BOUND" &&
                        "At least "}
                      {dollars(result?.metrics?.[key]?.maximum_cents)}
                    </strong>
                    {result?.metrics?.[key]?.basis === "LOWER_BOUND" && (
                      <small>{result.metrics[key].notice}</small>
                    )}
                  </div>
                ))}
              </div>
              <section className="panel">
                <h2>What this assessment establishes</h2>
                <p>{result?.notice || "No saved assessment yet."}</p>
                <p>
                  {current?.snapshot?.model.scope_notes || model.scope_notes}
                </p>
                <dl className="state-details">
                  <dt>Model</dt>
                  <dd>
                    {current?.snapshot?.model.name || model.name} ·{" "}
                    {current?.snapshot?.model.version || model.version}
                  </dd>
                  <dt>Scenario</dt>
                  <dd>{current?.scenario_name || "Not assessed"}</dd>
                  <dt>Evidence revision</dt>
                  <dd>{current?.revision ?? "Not assessed"}</dd>
                  <dt>Solver</dt>
                  <dd>{current?.solver_version || "Not assessed"}</dd>
                  <dt>Unknown economic metrics</dt>
                  <dd>Bank facility usage, cash released, capital saved</dd>
                </dl>
                {current && (
                  <>
                    <button
                      className="secondary"
                      disabled={blocked}
                      onClick={() =>
                        void action(async () => {
                          const r = await api(
                            "assessments/" + current.id + "/replay",
                            {},
                          );
                          setNotice(
                            r.snapshot_matches && r.result_matches
                              ? "Frozen snapshot and financial result reproduced exactly."
                              : "Replay integrity mismatch; investigate before relying on this result.",
                          );
                        })
                      }
                    >
                      Replay frozen assessment
                    </button>
                    <details>
                      <summary>Snapshot and result hashes</summary>
                      <p className="state-hash">{current.snapshot_hash}</p>
                      <p className="state-hash">{current.result_hash}</p>
                    </details>
                  </>
                )}
              </section>
              <section className="panel">
                <h2>Changes since the previous assessment</h2>
                <AssessmentDelta w={w} current={current} />
              </section>
              <section className="panel">
                <h2>Evidence gaps and next decisions</h2>
                {result?.findings?.length ? (
                  result.findings.map((f: Entity) => {
                    const disposition = w.findings.find(
                      (x) => x.key === f.key && x.run_id === current?.id,
                    );
                    return (
                      <article className="state-finding" key={f.key}>
                        <p className="eyebrow">
                          {f.kind} · {disposition?.owner || f.owner} ·{" "}
                          {disposition?.status || "OPEN"}
                        </p>
                        <h3>{f.label}</h3>
                        <p>
                          Affected exposure:{" "}
                          {dollars(f.affected_exposure_cents)}. {f.notice}
                        </p>
                        {f.evidence?.[0] && (
                          <button
                            className="text-button"
                            onClick={() => showSource(f.evidence[0])}
                          >
                            Supporting source →
                          </button>
                        )}
                        {disposition && !historical && (
                          <button
                            className="secondary"
                            disabled={blocked}
                            onClick={() => {
                              setFindingEdit(disposition);
                              setDecisionReason("");
                            }}
                          >
                            Record investigation disposition
                          </button>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <p>
                    {current
                      ? "No deterministic findings in this bounded assessment. This does not establish complete legal or transaction coverage."
                      : "Run an assessment to produce findings."}
                  </p>
                )}
              </section>
              {findingEdit && (
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(async () => {
                      await api("findings/" + findingEdit.id + "/disposition", {
                        status: f.get("status"),
                        owner: f.get("owner"),
                        reason: decisionReason,
                      });
                      setFindingEdit(null);
                    });
                  }}
                >
                  <h3>Investigation disposition · {findingEdit.label}</h3>
                  <div className="state-form-grid">
                    <label>
                      Status
                      <select name="status" defaultValue={findingEdit.status}>
                        {["OPEN", "INVESTIGATING", "RESOLVED"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Responsible role
                      <select name="owner" defaultValue={findingEdit.owner}>
                        {["TREASURY", "COUNSEL", "BANK", "BENEFICIARY"].map(
                          (x) => (
                            <option key={x}>{x}</option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <label>
                    Reason
                    <textarea
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      required
                      minLength={3}
                    />
                  </label>
                  <button disabled={blocked || !reviewer}>
                    Record disposition
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setFindingEdit(null)}
                  >
                    Cancel
                  </button>
                  <p className="state-caption">
                    Resolving a finding does not change financial inputs or
                    approve a security release.
                  </p>
                </form>
              )}
              <section className="panel">
                <h2>Saved assessment history</h2>
                {w.runs
                  .filter((r) => r.model_id === modelId)
                  .toReversed()
                  .map((r) => (
                    <button
                      className="state-history-row"
                      key={r.id}
                      onClick={() => void inspect(r.id)}
                    >
                      <span>
                        {r.scenario_name} · {r.at}
                        <small>
                          Revision {r.revision} ·{" "}
                          {r.revision !== w.project.revision
                            ? "HISTORICAL"
                            : r.result.status}
                        </small>
                      </span>
                      <b>
                        {dollars(
                          r.result.metrics?.instrument_face?.maximum_cents,
                        )}
                      </b>
                    </button>
                  ))}
              </section>
            </section>
          )}
        </>
      )}
      {view === "source-review" && (
        <>
          <form
            className="panel state-upload"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="state-form-grid">
              <label>
                Primary-source URL (optional, not fetched)
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label>
                Amendment relationship
                <select
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                >
                  <option value="">New evidence document</option>
                  {w.documents
                    .filter((d) => !d.superseded)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        Replace {d.name} · v{d.version}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Upload public or synthetic evidence
              <input
                type="file"
                accept=".txt,.md,.pdf,.html,.htm"
                disabled={blocked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void action(async () => {
                    const body = new FormData();
                    body.set("file", file);
                    body.set("replaces", replacement);
                    body.set("source_url", sourceUrl);
                    const d = await api("documents", body, undefined, "v2");
                    setDocId(d.id);
                    setPage(1);
                    setSourceSpan(null);
                    setReplacement("");
                    setNotice(
                      "Document stored. Review extracted text before interpreting it.",
                    );
                  });
                  e.target.value = "";
                }}
              />
            </label>
            <p className="state-caption">
              TXT, MD, text PDF and HTML · 5 MB · scripts and external assets
              are not executed. Unsupported scans remain unsupported.
            </p>
          </form>
          <div className="state-reader-grid">
            <aside
              className="panel state-document-list"
              aria-label="Document package"
            >
              <h3>Evidence package</h3>
              {w.documents.map((d) => (
                <button
                  className={docId === d.id ? "active" : "secondary"}
                  key={d.id}
                  onClick={() => {
                    setDocId(d.id);
                    setPage(1);
                    setSourceSpan(null);
                  }}
                >
                  {d.name}
                  <small>
                    v{d.version} · {d.superseded ? "SUPERSEDED" : d.processing}
                    {!!d.textless_pages?.length &&
                      ` · ${d.textless_pages.length} textless`}
                  </small>
                </button>
              ))}
            </aside>
            <section className="panel state-reader">
              <div className="state-section-heading">
                <h2>{doc?.name || "Upload evidence to begin"}</h2>
                {doc && (
                  <label>
                    Page
                    <select
                      value={page}
                      onChange={(e) => {
                        setPage(Number(e.target.value));
                        setSourceSpan(null);
                      }}
                    >
                      {doc.pages.map((_: string, n: number) => (
                        <option key={n} value={n + 1}>
                          {n + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {doc?.source_url && (
                <a href={doc.source_url} target="_blank" rel="noreferrer">
                  Primary-source reference ↗
                </a>
              )}
              {doc?.superseded && (
                <p className="state-historical">
                  Historical source · cannot support a new review.
                </p>
              )}
              {!!doc?.textless_pages?.length && (
                <p role="alert">
                  No extractable text on page
                  {doc.textless_pages.length === 1 ? "" : "s"}{" "}
                  {doc.textless_pages.join(", ")}. Check the original file for
                  scanned or image-only content before completing review.
                </p>
              )}
              <pre>
                {doc
                  ? highlight(
                      doc.pages[page - 1] || "",
                      sourceSpan?.document_id === doc.id &&
                        sourceSpan.page === page
                        ? sourceSpan
                        : null,
                    )
                  : ""}
              </pre>
              {doc && !doc.superseded && (
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={blocked}
                    onClick={() => onRegister("instruments", doc.id)}
                  >
                    Record instrument
                  </button>
                  <button
                    className="secondary"
                    disabled={blocked}
                    onClick={() => onRegister("claims", doc.id)}
                  >
                    Record obligation
                  </button>
                  <button
                    className="secondary"
                    disabled={blocked || !model}
                    onClick={() => openEditor("rules")}
                  >
                    Interpret clause
                  </button>
                </div>
              )}
            </section>
            <section className="panel state-review-queue">
              <div className="state-section-heading">
                <h3>Review queue</h3>
                <span className="state-badge">{queue.length} pending</span>
              </div>
              {queue.length ? (
                queue.map(({ type, item }) => (
                  <button
                    className="state-queue-row"
                    key={item.id}
                    disabled={blocked}
                    onClick={() => startReview(type, item)}
                  >
                    <b>{item.label || item.reference_label}</b>
                    <small>
                      {type} · {item.kind || item.event_type || "condition"} ·
                      UNVERIFIED
                    </small>
                  </button>
                ))
              ) : (
                <p>
                  No pending state interpretations. Missing factual inputs or
                  documents may still block assessment.
                </p>
              )}
              <div className="actions">
                <button
                  className="secondary"
                  disabled={blocked || !model}
                  onClick={() => openEditor("facts")}
                >
                  Define condition
                </button>
                <button
                  className="secondary"
                  disabled={blocked || !model}
                  onClick={() => openEditor("events")}
                >
                  Record event
                </button>
                <button
                  className="secondary"
                  disabled={blocked || !model}
                  onClick={() => openEditor("balances")}
                >
                  Record opening balance
                </button>
                <button
                  className="secondary"
                  disabled={blocked || !model}
                  onClick={() => openEditor("document-links")}
                >
                  Link reference
                </button>
              </div>
            </section>
          </div>
          {doc && !doc.superseded && (
            <section className="panel">
              <ExtractionPanel
                key={doc.id}
                root={root}
                documentId={doc.id}
                disabled={blocked}
                jobs={w.input_jobs as any}
                proposals={w.input_proposals as any}
                api={inputApi}
                perform={action}
                refresh={() => load().then(() => {})}
                edit={onProposal}
                showSource={(p) => showSource(p.evidence[0])}
              />
              <div className="state-section-heading">
                <div>
                  <p className="eyebrow">
                    LOCAL AI · EXPERIMENTAL · PROPOSALS ONLY
                  </p>
                  <h2>Find contractual clauses to review</h2>
                </div>
                <button
                  disabled={blocked || !model}
                  onClick={() =>
                    void action(async () => {
                      await api("documents/" + doc.id + "/clause-extractions", {
                        model_id: modelId,
                        request_id: crypto.randomUUID(),
                      });
                      setNotice(
                        "Queued in the shared local worker. No rules are approved or imported automatically.",
                      );
                    })
                  }
                >
                  Propose clauses with local AI
                </button>
              </div>
              {w.clause_jobs
                .filter(
                  (j) => j.document_id === doc.id && j.model_id === modelId,
                )
                .toReversed()
                .map((j) => (
                  <div className="state-job" key={j.id}>
                    <b>{j.status}</b>
                    <span>
                      {j.completed_chunks}/{j.total_chunks} chunks ·{" "}
                      {j.elapsed_seconds ?? 0}s · {j.model}
                    </span>
                    {j.error && <p role="alert">{j.error}</p>}
                    {!!j.screened?.length && (
                      <details>
                        <summary>
                          {j.screened.length} source sentence
                          {j.screened.length === 1 ? "" : "s"} withheld as
                          off-topic (not proposed)
                        </summary>
                        {j.screened.map(
                          (
                            s: { page: number; quote: string; reason: string },
                            i: number,
                          ) => (
                            <p className="muted" key={i}>
                              Page {s.page} · {s.reason}: “{s.quote}”
                            </p>
                          ),
                        )}
                      </details>
                    )}
                    {["FAILED", "INTERRUPTED"].includes(j.status) &&
                      !j.abandoned && (
                        <button
                          className="secondary"
                          disabled={blocked}
                          onClick={() => {
                            const reason = window.prompt(
                              "Reason for explicitly abandoning this failed attempt:",
                            );
                            if (reason && reason.trim().length >= 3)
                              void action(async () => {
                                await api(
                                  "extractions/" + j.id + "/abandon",
                                  { reason },
                                  undefined,
                                  "v2",
                                );
                              });
                          }}
                        >
                          Abandon failed attempt
                        </button>
                      )}
                    <details>
                      <summary>Provenance</summary>
                      <p className="state-hash">
                        Model digest {j.model_digest}
                      </p>
                      <p>
                        {j.prompt_version} · {j.schema_version} · document hash{" "}
                        {j.document_hash}
                      </p>
                    </details>
                  </div>
                ))}
              {w.clause_proposals
                .filter(
                  (p) => p.document_id === doc.id && p.model_id === modelId,
                )
                .map((p) => (
                  <div className="state-proposal" key={p.id}>
                    <div>
                      <b>{p.label}</b>
                      <small>
                        {p.category} · {p.rule_kind || p.event_type || "fact"} ·{" "}
                        {p.disposition}
                      </small>
                      <p className="state-caption">
                        {p.validation_issues.join(" · ")}{" "}
                        {p.unresolved_fields.join(" · ")}
                      </p>
                    </div>
                    <div className="actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          setSourceSpan(p.evidence[0]);
                          setPage(p.source_page);
                        }}
                      >
                        Highlight source
                      </button>
                      {p.disposition === "PENDING" && (
                        <>
                          <button
                            className="secondary"
                            disabled={blocked}
                            onClick={() =>
                              openEditor(
                                p.category === "RULE"
                                  ? "rules"
                                  : p.category === "EVENT"
                                    ? "events"
                                    : "facts",
                                undefined,
                                p,
                              )
                            }
                          >
                            Edit & import
                          </button>
                          <button
                            className="secondary"
                            disabled={blocked}
                            onClick={() => {
                              setProposalDismiss(p);
                              setDecisionReason("");
                            }}
                          >
                            Dismiss with reason
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(async () => {
                    await api(
                      "documents/" + doc.id + "/complete",
                      { reason: f.get("reason") },
                      undefined,
                      "v2",
                    );
                    setNotice("Document completion recorded explicitly.");
                  });
                }}
              >
                <label>
                  Document completion reason
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Confirm all material proposals and inputs are resolved; record the remaining scope limitations."
                  />
                </label>
                <button disabled={blocked || !reviewer}>
                  Complete document review
                </button>
                <p className="state-caption">
                  Pending proposals and active or unabandoned failed attempts
                  block completion. Empty extraction never completes review
                  automatically.
                </p>
              </form>
            </section>
          )}
          <section className="panel">
            <h2>Reviewed conditions, events and rules</h2>
            <div className="state-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Type</th>
                    <th>Review status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...facts.map((item) => ({
                      type: "facts" as EditorType,
                      item,
                    })),
                    ...events.map((item) => ({
                      type: "events" as EditorType,
                      item,
                    })),
                    ...rules.map((item) => ({
                      type: "rules" as EditorType,
                      item,
                    })),
                    ...links.map((item) => ({
                      type: "document-links" as EditorType,
                      item,
                    })),
                    ...w.balances
                      .filter((b) => b.model_id === modelId)
                      .map((item) => ({
                        type: "balances" as EditorType,
                        item,
                      })),
                  ].map(({ type, item }) => (
                    <tr key={item.id}>
                      <td>{item.label || item.reference_label}</td>
                      <td>{item.kind || item.event_type || type}</td>
                      <td>{item.verification}</td>
                      <td>
                        <button
                          className="text-button"
                          disabled={blocked}
                          onClick={() => openEditor(type, item)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button"
                          disabled={blocked}
                          onClick={() => startReview(type, item)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {review && (
        <form
          className="panel state-review-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(async () => {
              await api(
                review.type + "/" + review.item.id + "/review",
                { decision: f.get("decision"), reason: decisionReason },
                undefined,
                ["instruments", "claims"].includes(review.type) ? "v2" : "v3",
              );
              setReview(null);
              setNotice("Separate review decision recorded.");
            });
          }}
        >
          <div className="state-section-heading">
            <h2>Review · {review.item.label || review.item.reference_label}</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => setReview(null)}
            >
              Close review
            </button>
          </div>
          <p>
            {review.item.interpretation ||
              review.item.event_type ||
              review.item.key}
          </p>
          {["instruments", "claims"].includes(review.type) && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onRegister(
                  review.type as "instruments" | "claims",
                  review.item.evidence?.[0]?.document_id,
                  review.item,
                )
              }
            >
              Edit amount or mapping before review
            </button>
          )}
          {review.item.evidence.map((e: Span) => (
            <blockquote key={e.document_id + e.start}>
              {e.quote}
              <button
                type="button"
                className="text-button"
                onClick={() => showSource(e)}
              >
                Inspect exact passage →
              </button>
            </blockquote>
          ))}
          <p>
            Reviewer:{" "}
            <b>{reviewer || "Save your reviewer identity above first."}</b>
          </p>
          <label>
            Decision
            <select name="decision">
              <option value="VERIFIED">
                Verify as a model input · not legal approval
              </option>
              <option value="UNVERIFIED">
                Keep unverified · no reduction credit
              </option>
              <option value="REJECTED">Reject interpretation</option>
            </select>
          </label>
          <label>
            Reason
            <textarea
              required
              minLength={3}
              maxLength={1800}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="What evidence and interpretation did you check?"
            />
          </label>
          <button
            disabled={blocked || !reviewer || decisionReason.trim().length < 3}
          >
            Record separate review
          </button>
        </form>
      )}
      {proposalDismiss && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api("clause-proposals/" + proposalDismiss.id + "/resolve", {
                action: "DISMISS",
                reason: decisionReason,
              });
              setProposalDismiss(null);
            });
          }}
        >
          <h3>Dismiss proposal · {proposalDismiss.label}</h3>
          <label>
            Dismissal reason
            <textarea
              required
              minLength={3}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
            />
          </label>
          <button disabled={blocked}>Dismiss proposal</button>
          <button
            type="button"
            className="secondary"
            onClick={() => setProposalDismiss(null)}
          >
            Cancel
          </button>
        </form>
      )}
      {focus && (
        <section
          className="panel state-evidence-drawer"
          aria-label="Financial evidence"
        >
          <div className="state-section-heading">
            <div>
              <p className="eyebrow">
                {historical
                  ? "HISTORICAL SNAPSHOT EVIDENCE"
                  : "FROZEN ASSESSMENT EVIDENCE"}
              </p>
              <h2>{focus.label}</h2>
            </div>
            <button className="secondary" onClick={() => setFocus(null)}>
              Close evidence
            </button>
          </div>
          <p>
            {labels[metric]} contribution:{" "}
            <b>{dollars(result.metrics[metric]?.contributions?.[focus.id])}</b>
          </p>
          {focus.spans.map((span) => {
            const d = docs.find((x: Entity) => x.id === span.document_id);
            return (
              <article key={span.document_id + span.page + span.start}>
                <p className="eyebrow">
                  {d?.name} · version {d?.version} · page {span.page}
                </p>
                <blockquote>{span.quote}</blockquote>
                <button
                  className="text-button"
                  onClick={() => showSource(span)}
                >
                  Open exact source passage →
                </button>
              </article>
            );
          })}
          <details>
            <summary>Review history and extraction provenance</summary>
            {(basis.reviews || w.reviews)
              .filter(
                (r: Entity) =>
                  r.record_id === focus.id ||
                  result.metrics[metric]?.applied_rules?.includes(r.record_id),
              )
              .map((r: Entity) => (
                <p key={r.id}>
                  <b>{r.reviewer}</b> · {r.at}
                  <br />
                  {r.reason}
                </p>
              ))}
            <pre>
              {JSON.stringify(
                basis.instruments.find((i: Entity) => i.id === focus.id)
                  ?.extraction_provenance ||
                  basis.claims.find((i: Entity) => i.id === focus.id)
                    ?.extraction_provenance ||
                  {},
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}

function ExposureChart({ rows }: { rows: Entity[] }) {
  if (rows.length < 2)
    return (
      <p className="state-caption">
        Set a horizon end to inspect contractual boundaries over time.
      </p>
    );
  const start = Date.parse(rows[0].as_of);
  const end = Date.parse(rows.at(-1)!.as_of);
  const max = Math.max(...rows.map((r) => r.gross_instrument_face_cents), 1);
  const points = rows.map((r) => ({
    x: 30 + ((Date.parse(r.as_of) - start) / (end - start || 1)) * 700,
    y: 160 - (r.maxima.instrument_face / max) * 140,
  }));
  const d = points
    .map((p, n) => (n ? `H${p.x}V${p.y}` : `M${p.x},${p.y}`))
    .join(" ");
  return (
    <svg
      className="state-chart"
      viewBox="0 0 760 200"
      role="img"
      aria-label="Instrument exposure at modeled time boundaries; exact values appear in the following table"
    >
      <line x1="30" y1="160" x2="730" y2="160" stroke="var(--line)" />
      <path d={d} fill="none" stroke="var(--green)" strokeWidth="3" />
      {points.map((p, n) => (
        <circle cx={p.x} cy={p.y} r="4" fill="var(--green)" key={n} />
      ))}
      <text x="30" y="190">
        {rows[0].as_of}
      </text>
      <text x="730" y="190" textAnchor="end">
        {rows.at(-1)!.as_of}
      </text>
    </svg>
  );
}
function AssessmentDelta({
  w,
  current,
}: {
  w: StateWorkspaceData;
  current?: Entity;
}) {
  if (!current) return <p>No assessment yet.</p>;
  const list = w.runs.filter((r) => r.model_id === current.model_id);
  const index = list.findIndex((r) => r.id === current.id);
  const previous = index > 0 ? list[index - 1] : null;
  if (!previous)
    return (
      <p>First assessment for this model. No earlier baseline is available.</p>
    );
  return (
    <>
      <p>
        Previous: {previous.scenario_name} · revision {previous.revision}.
        Current brief: {current.scenario_name} · revision {current.revision}.
      </p>
      <div className="state-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Previous</th>
              <th>This assessment</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(labels).map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  {dollars(previous.result.metrics?.[key]?.maximum_cents)}
                </td>
                <td>{dollars(current.result.metrics?.[key]?.maximum_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="state-caption">
        Differences may reflect dates, scenarios, or changed inputs. They are
        not automatically savings. Open the frozen assessments to inspect those
        assumptions.
      </p>
    </>
  );
}
