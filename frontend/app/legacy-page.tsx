"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  FileText,
  Layers,
  ShieldCheck,
  Activity,
  Download,
  X,
  Upload,
  Check,
  CircleDot,
  Building2,
  ChevronRight,
  LogOut,
} from "lucide-react";

type Source = { page: number; quote: string; sha256: string };
type Claim = {
  id: string;
  label: string;
  amount_cents: number | null;
  kind: string;
  verification: string;
  document_id: string;
  instrument_id: string | null;
  source: Source;
  extraction: { mode: string };
};
type Doc = {
  id: string;
  name: string;
  version: number;
  sha256: string;
  pages: string[];
  superseded: boolean;
  processing: string;
};
type Dependency = {
  id: string;
  label: string;
  verification: string;
  quote: string;
  claim_ids: string[];
};
type Result = {
  status: string;
  maximum_cents: number | null;
  gross_cents?: number;
  modeled_difference_cents?: number;
  active_claims?: string[];
  feasible_states?: number;
  instrument_contributions?: Record<string, number>;
};
type Run = {
  id: string;
  at: string;
  scenario: string;
  stale?: boolean;
  snapshot_hash: string;
  result: Result;
  snapshot?: { claims: Claim[]; documents: Doc[]; dependencies: Dependency[] };
};
type Workspace = {
  project: { name: string; mw: number };
  documents: Doc[];
  claims: Claim[];
  dependencies: Dependency[];
  instruments: {
    id: string;
    face_cents: number;
    lifecycle: string;
    release_verified: boolean;
  }[];
  runs: Run[];
  audit: { at: string; action: string; hash: string }[];
  ai_configured: boolean;
};
const money = (c: number | null | undefined) =>
  c == null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(c / 100);
const million = (c: number | null | undefined) =>
  c == null ? "—" : "$" + (c / 100000000).toFixed(1) + "M";
const tabs = [
  { id: "overview", label: "Exposure overview", icon: Layers },
  { id: "documents", label: "Source documents", icon: FileText },
  { id: "review", label: "Review queue", icon: ShieldCheck },
  { id: "dependencies", label: "Legal dependencies", icon: Building2 },
  { id: "history", label: "Evidence & history", icon: Activity },
];
const scenarios = [
  {
    id: "independent",
    label: "Independent obligations",
    detail: "All four branches may coexist.",
  },
  {
    id: "cap",
    label: "Hypothetical legal cap",
    detail: "At most two conditional branches.",
  },
  {
    id: "release_lag",
    label: "Release-delay stress",
    detail: "Explicit three-branch overlap.",
  },
  {
    id: "downgrade",
    label: "25% collateral step-up",
    detail: "Stress both claims and ceilings.",
  },
];

export default function Page() {
  const [token, setToken] = useState(""),
    [entry, setEntry] = useState("local-demo"),
    [data, setData] = useState<Workspace | null>(null),
    [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [scenario, setScenario] = useState("independent"),
    [selected, setSelected] = useState<Claim | null>(null),
    [docId, setDocId] = useState(""),
    [replace, setReplace] = useState(""),
    [amount, setAmount] = useState(""),
    [instrument, setInstrument] = useState(""),
    [reason, setReason] = useState(""),
    [depReason, setDepReason] = useState(""),
    [runId, setRunId] = useState("");
  const [evidence, setEvidence] = useState<Run | null>(null),
    [historical, setHistorical] = useState(false);
  async function api(path: string, options: RequestInit = {}, access = token) {
    const headers = new Headers(options.headers);
    headers.set("Authorization", "Bearer " + access);
    if (typeof options.body === "string")
      headers.set("Content-Type", "application/json");
    const r = await fetch("/api/" + path, { ...options, headers });
    if (!r.ok) {
      const body = await r.json();
      throw new Error(
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail),
      );
    }
    return r;
  }
  async function refresh(access = token) {
    const w = await (await api("workspace", {}, access)).json();
    setData(w);
    return w as Workspace;
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const saved = sessionStorage.getItem("loadbond-token");
    if (saved) {
      setToken(saved);
      void refresh(saved).catch(() =>
        sessionStorage.removeItem("loadbond-token"),
      );
    }
  }, []); // Initial session restore only.
  async function login() {
    await act(async () => {
      await refresh(entry);
      setToken(entry);
      sessionStorage.setItem("loadbond-token", entry);
    });
  }
  const latest = data?.runs.find((r) => r.id === runId) || data?.runs.at(-1);
  const result = latest?.result;
  const unverified =
    data?.claims.filter((c) => c.verification === "UNVERIFIED").length || 0;
  const doc = data?.documents.find((d) => d.id === docId) || data?.documents[0];
  const capApproved = data?.dependencies[0]?.verification === "VERIFIED";
  async function compute() {
    await act(async () => {
      const r = await (
        await api("runs", {
          method: "POST",
          body: JSON.stringify({ scenario }),
        })
      ).json();
      setRunId(r.id);
      await refresh();
      setNotice(
        r.result.status === "COMPLETE"
          ? "Exposure computed from an immutable snapshot."
          : "Assessment incomplete. Resolve claims in the review queue.",
      );
    });
  }
  function inspect(c: Claim, readOnly = false) {
    setHistorical(readOnly);
    setSelected(c);
    setAmount(c.amount_cents === null ? "" : String(c.amount_cents / 100));
    setInstrument(c.instrument_id || "");
    setReason("");
  }
  async function showTrace() {
    if (!latest) return;
    await act(async () => {
      setEvidence(await (await api("runs/" + latest.id)).json());
    });
  }
  async function replay() {
    if (!latest) return;
    await act(async () => {
      const r = await (
        await api("runs/" + latest.id + "/replay", { method: "POST" })
      ).json();
      if (!r.snapshot_matches || !r.result_matches)
        throw new Error("Snapshot verification failed");
      setNotice("Historical snapshot and result reproduced exactly.");
    });
  }
  async function review(decision: string) {
    if (!selected) return;
    await act(async () => {
      const cents = amount === "" ? null : Math.round(Number(amount) * 100);
      if (amount !== "" && (!Number.isFinite(cents) || Number(amount) < 0))
        throw new Error("Enter a valid USD amount");
      await api("claims/" + selected.id + "/review", {
        method: "POST",
        body: JSON.stringify({
          decision,
          amount_cents: cents,
          instrument_id: instrument || null,
          reason,
        }),
      });
      await refresh();
      setSelected(null);
      setNotice("Review saved. Earlier results are now historical.");
    });
  }
  async function download(format: string) {
    if (!latest) return;
    await act(async () => {
      const blob = await (
        await api("runs/" + latest.id + "/export?format=" + format)
      ).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadbond-evidence." + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (!data)
    return (
      <main className="login">
        <div className="brand">
          <span className="mark">▥</span> LoadBond
        </div>
        <p className="eyebrow">INFRASTRUCTURE SECURITY / WORKBENCH</p>
        <h1>
          Every obligation.
          <br />
          <em>Accounted for.</em>
        </h1>
        <p>
          Trace the document. Challenge the legal state.
          <br />
          Understand what your security actually secures.
        </p>
        <div className="loginbox">
          <label>
            Workspace token
            <input
              type="password"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void login();
              }}
            />
          </label>
          <button disabled={busy} onClick={login}>
            Open workspace <ArrowRight size={17} />
          </button>
          <small>
            Local synthetic demo token: local-demo. No confidential documents.
          </small>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">▥</span> LoadBond
        </div>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <div className="project-chip">
          <CircleDot size={16} />
          <div>
            North Ridge portfolio<small>300 MW · Four candidate sites</small>
          </div>
        </div>
        <nav aria-label="Workbench">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={17} />
              {t.label}
              {t.id === "review" && unverified > 0 && <b>{unverified}</b>}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <span className="status-dot" /> Local demonstration
          <p>
            Synthetic records. Simulated review.
            <br />
            No confirmed capital release.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem("loadbond-token");
              setToken("");
              setData(null);
            }}
          >
            <LogOut size={15} /> Close workspace
          </button>
        </div>
      </aside>
      <main className="main">
        <header>
          <div>
            Projects <ChevronRight size={13} /> <strong>LB-001</strong>{" "}
            <span className="badge">SYNTHETIC</span>
          </div>
          <button className="subtle" onClick={() => window.print()}>
            Print report <ArrowUpRight size={15} />
          </button>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SECURITY EXPOSURE WORKBENCH</p>
              <h1>{tabs.find((t) => t.id === tab)?.label}</h1>
            </div>
            <div className="heading-note">
              <span className="status-dot" /> Evidence before inference
              <br />
              <small>USD · Deterministic enumeration</small>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {busy && (
            <div className="notice" role="status">
              Working…
            </div>
          )}
          {tab === "overview" && (
            <>
              <section className="hero-panel">
                <div>
                  <p className="eyebrow">NORTH RIDGE / 300 MW</p>
                  <h2>
                    Start with every obligation.
                    <br />
                    <em>Then earn the reduction.</em>
                  </h2>
                  <p>
                    Four candidate sites. Independent instruments. A commercial
                    choice alone does not extinguish a beneficiary’s claim.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("dependencies")}
                  >
                    Inspect the legal dependency <ArrowRight size={16} />
                  </button>
                </div>
                <div className="exposure">
                  <span>MAXIMUM MODELED DRAWABLE EXPOSURE</span>
                  <strong>{million(result?.maximum_cents)}</strong>
                  <div className="badge">
                    {!latest
                      ? "NOT YET COMPUTED"
                      : latest.stale
                        ? "HISTORICAL · RECOMPUTE"
                        : result?.status === "INCOMPLETE"
                          ? "INCOMPLETE ASSESSMENT"
                          : latest.scenario === "independent"
                            ? "NO OPTIMIZATION"
                            : "HYPOTHETICAL SCENARIO"}
                  </div>
                  <p>
                    {latest
                      ? scenarios.find((s) => s.id === latest.scenario)?.label
                      : "Run the independent baseline to begin."}
                  </p>
                </div>
              </section>
              <section className="metrics">
                <div>
                  <span>Gross under same stress</span>
                  <strong>{million(result?.gross_cents)}</strong>
                </div>
                <div>
                  <span>Modeled difference</span>
                  <strong>{million(result?.modeled_difference_cents)}</strong>
                </div>
                <div>
                  <span>Bank capacity released</span>
                  <strong className="unknown">Not established</strong>
                </div>
                <div>
                  <span>Restricted cash released</span>
                  <strong className="unknown">Not established</strong>
                </div>
              </section>
              <section className="two-col">
                <div className="panel">
                  <div className="panel-heading">
                    <h3>Challenge the exposure</h3>
                    <span className="eyebrow">01 / SCENARIO</span>
                  </div>
                  <div className="scenario-list">
                    {scenarios.map((s) => (
                      <button
                        key={s.id}
                        className={scenario === s.id ? "chosen" : ""}
                        onClick={() => setScenario(s.id)}
                      >
                        <span className="radio" />
                        <div>
                          <strong>{s.label}</strong>
                          <small>{s.detail}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="hint">
                    {capApproved
                      ? "The synthetic dependency has a simulated approval."
                      : "No dependency approved. Cap scenarios receive zero reduction credit."}
                  </p>
                  <button disabled={busy} onClick={compute}>
                    Compute exposure <ArrowRight size={16} />
                  </button>
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <h3>What the result means</h3>
                    <span className="eyebrow">02 / EVIDENCE</span>
                  </div>
                  <div className="barlabel">
                    <span>Independent exposure</span>
                    <b>{million(result?.gross_cents)}</b>
                  </div>
                  <div className="track">
                    <div style={{ width: "100%" }} />
                  </div>
                  <div className="barlabel">
                    <span>Feasible maximum</span>
                    <b>{million(result?.maximum_cents)}</b>
                  </div>
                  <div className="track">
                    <div
                      className="green"
                      style={{
                        width: result?.gross_cents
                          ? ((result.maximum_cents || 0) / result.gross_cents) *
                              100 +
                            "%"
                          : "0%",
                      }}
                    />
                  </div>
                  <p className="explain">
                    A lower modeled maximum is a scenario result. Bank capacity,
                    restricted cash, guarantees, and surety obligations require
                    separate evidence.
                  </p>
                  <div className="fact">
                    <span>Feasible states enumerated</span>
                    <b>{result?.feasible_states ?? "—"}</b>
                  </div>
                  <div className="fact">
                    <span>Claims needing review</span>
                    <b>{unverified}</b>
                  </div>
                  <button
                    className="text-button"
                    disabled={!latest}
                    onClick={() => setTab("history")}
                  >
                    Open evidence package <ArrowUpRight size={16} />
                  </button>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h3>Obligation register</h3>
                  <span>{data.claims.length} claims</span>
                </div>
                <ClaimTable claims={data.claims} inspect={inspect} />
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h3>Instrument register</h3>
                  <span>{data.instruments.length} instruments · USD</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Instrument</th>
                        <th>Face amount</th>
                        <th>Lifecycle</th>
                        <th>Release evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.instruments.map((i) => (
                        <tr key={i.id}>
                          <td>{i.id}</td>
                          <td>{money(i.face_cents)}</td>
                          <td>{i.lifecycle}</td>
                          <td>
                            {i.release_verified ? "Verified" : "Not verified"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">
                  Face amounts are separate from drawable exposure. Facility
                  usage, cash collateral, guarantees and surety obligations have
                  not been established.
                </p>
              </section>
            </>
          )}
          {tab === "documents" && (
            <>
              <div className="notice">
                Upload synthetic or public material only. Text-based PDF, TXT,
                MD · 5 MB maximum. Replacing a document invalidates affected
                approvals.
              </div>
              <section className="upload-row">
                <label>
                  Document being amended
                  <select
                    value={replace}
                    onChange={(e) => setReplace(e.target.value)}
                  >
                    <option value="">New agreement</option>
                    {data.documents
                      .filter((d) => !d.superseded)
                      .map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="upload-button">
                  <Upload size={17} /> Upload document
                  <input
                    aria-label="Upload document"
                    disabled={busy}
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void act(async () => {
                        const form = new FormData();
                        form.set("file", file);
                        form.set("replaces", replace);
                        const d = await (
                          await api("documents", { method: "POST", body: form })
                        ).json();
                        await refresh();
                        setDocId(d.id);
                        setNotice(
                          "Document stored. Extract proposals, then review each obligation.",
                        );
                      });
                      e.target.value = "";
                    }}
                  />
                </label>
              </section>
              <section className="document-layout">
                <div className="document-list">
                  {data.documents.map((d) => (
                    <button
                      key={d.id}
                      className={doc?.id === d.id ? "selected" : ""}
                      onClick={() => setDocId(d.id)}
                    >
                      <FileText size={19} />
                      <div>
                        {d.name}
                        <small>
                          Version {d.version} ·{" "}
                          {d.superseded ? "SUPERSEDED" : d.processing}
                        </small>
                      </div>
                    </button>
                  ))}
                </div>
                {doc && (
                  <div className="panel">
                    <div className="panel-heading">
                      <h3>{doc.name}</h3>
                      <span className="badge">v{doc.version}</span>
                    </div>
                    <div className="actions">
                      <button
                        disabled={busy || doc.superseded}
                        onClick={() =>
                          act(async () => {
                            await api("documents/" + doc.id + "/extract", {
                              method: "POST",
                              body: JSON.stringify({ mode: "local" }),
                            });
                            await refresh();
                            setTab("review");
                          })
                        }
                      >
                        Parse sample format
                      </button>
                      <button
                        className="secondary"
                        disabled={busy || doc.superseded || !data.ai_configured}
                        onClick={() =>
                          act(async () => {
                            await api("documents/" + doc.id + "/extract", {
                              method: "POST",
                              body: JSON.stringify({ mode: "ai" }),
                            });
                            await refresh();
                            setTab("review");
                          })
                        }
                      >
                        Extract with live AI
                      </button>
                    </div>
                    <p className="hint">
                      {data.ai_configured
                        ? "Live AI is configured; results still require source validation and human review."
                        : "Live AI is not configured. Local parsing is deterministic and is not AI."}
                    </p>
                    {doc.pages.map((p, i) => (
                      <div key={i} className="paper">
                        <span className="eyebrow">PAGE {i + 1}</span>
                        <pre>{p}</pre>
                      </div>
                    ))}
                    <small className="hash">SHA-256 {doc.sha256}</small>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "review" && (
            <>
              <div className="notice">
                Factual verification does not approve legal dependencies. Map
                each proposal to its actual securing instrument before accepting
                it.
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h3>{unverified} claims await review</h3>
                  <span>All decisions retained</span>
                </div>
                <ClaimTable claims={data.claims} inspect={inspect} />
              </section>
            </>
          )}
          {tab === "dependencies" && (
            <>
              <section className="hero-panel compact">
                <div>
                  <p className="eyebrow">LEGAL STATE ≠ COMMERCIAL INTENT</p>
                  <h2>
                    Show why claims
                    <br />
                    <em>cannot coexist.</em>
                  </h2>
                  <p>
                    This is a simulated review of a synthetic restructuring. It
                    does not represent counsel approval or an executed
                    transaction.
                  </p>
                </div>
                <ShieldCheck size={100} strokeWidth={0.7} />
              </section>
              {data.dependencies.map((d) => (
                <section className="panel" key={d.id}>
                  <div className="panel-heading">
                    <h3>{d.label}</h3>
                    <span className="badge">{d.verification}</span>
                  </div>
                  <div className="nodes">
                    {d.claim_ids.map((id) => (
                      <div key={id}>
                        <span className="status-dot" />
                        {data.claims.find((c) => c.id === id)?.label}
                        <strong>
                          {million(
                            data.claims.find((c) => c.id === id)?.amount_cents,
                          )}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="constraint">
                    {d.verification === "VERIFIED"
                      ? "Σ active conditional branches ≤ 2"
                      : "No enforceable cap recognized"}
                    <small>
                      Release-delay scenario explicitly permits three branches.
                      Independent baseline ignores the cap.
                    </small>
                  </div>
                  <blockquote>{d.quote}</blockquote>
                  <label>
                    Reason for simulated legal review
                    <input
                      value={depReason}
                      onChange={(e) => setDepReason(e.target.value)}
                      placeholder="Explain the demo approval or revocation"
                    />
                  </label>
                  <button
                    disabled={busy || depReason.trim().length < 3}
                    onClick={() =>
                      act(async () => {
                        await api("dependencies/" + d.id + "/review", {
                          method: "POST",
                          body: JSON.stringify({
                            approved: d.verification !== "VERIFIED",
                            reason: depReason,
                          }),
                        });
                        await refresh();
                        setDepReason("");
                        setNotice(
                          "Simulated review saved. Recompute exposure to use the current decision.",
                        );
                      })
                    }
                  >
                    {d.verification === "VERIFIED"
                      ? "Revoke simulated approval"
                      : "Approve for synthetic demonstration"}{" "}
                    <Check size={16} />
                  </button>
                </section>
              ))}
            </>
          )}
          {tab === "history" && (
            <>
              <section className="two-col">
                <div className="panel">
                  <div className="panel-heading">
                    <h3>Exposure snapshots</h3>
                    <span>{data.runs.length} runs</span>
                  </div>
                  {data.runs.length === 0 ? (
                    <p>No runs yet. Compute an exposure scenario first.</p>
                  ) : (
                    [...data.runs].reverse().map((r) => (
                      <button
                        className={
                          "run-row " + (latest?.id === r.id ? "selected" : "")
                        }
                        key={r.id}
                        onClick={() => setRunId(r.id)}
                      >
                        <div>
                          <strong>
                            {scenarios.find((s) => s.id === r.scenario)?.label}
                          </strong>
                          <small>
                            {new Date(r.at).toLocaleString()} ·{" "}
                            {r.stale ? "HISTORICAL" : r.result.status}
                          </small>
                        </div>
                        <b>{million(r.result.maximum_cents)}</b>
                      </button>
                    ))
                  )}
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <h3>Evidence package</h3>
                    <Download size={18} />
                  </div>
                  <p>
                    Exports contain the original run’s claims, source
                    references, scenario, and result. JSON also includes
                    complete document and input snapshots.
                  </p>
                  <div className="actions">
                    <button
                      disabled={!latest || busy}
                      onClick={() => download("json")}
                    >
                      Export JSON
                    </button>
                    <button
                      className="secondary"
                      disabled={!latest || busy}
                      onClick={() => download("csv")}
                    >
                      Export CSV
                    </button>
                    <button
                      className="secondary"
                      disabled={!latest || busy}
                      onClick={showTrace}
                    >
                      Inspect run evidence
                    </button>
                    <button
                      className="secondary"
                      disabled={!latest || busy}
                      onClick={replay}
                    >
                      Replay snapshot
                    </button>
                  </div>
                  <small className="hash">
                    {latest
                      ? "Snapshot " + latest.snapshot_hash
                      : "Create a run to generate an evidence package."}
                  </small>
                  <p className="hint">
                    Historical results stay reproducible. They do not
                    automatically reflect later document or approval changes.
                  </p>
                </div>
              </section>
              {evidence?.id === latest?.id && evidence?.snapshot && (
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Maximizing state evidence</h3>
                    <span className="badge">READ-ONLY SNAPSHOT</span>
                  </div>
                  <p>
                    Amounts below are source claim amounts. The solver caps each
                    instrument’s combined claims at its modeled ceiling.
                  </p>
                  {Object.entries(
                    evidence.result.instrument_contributions || {},
                  ).map(([id, value]) => (
                    <div className="fact" key={id}>
                      <span>{id} · instrument contribution</span>
                      <b>{money(value)}</b>
                    </div>
                  ))}
                  <ClaimTable
                    claims={evidence.snapshot.claims.filter((c) =>
                      evidence.result.active_claims?.includes(c.id),
                    )}
                    inspect={(c) => inspect(c, true)}
                  />
                  {evidence.snapshot.dependencies
                    .filter(
                      (d) =>
                        d.verification === "VERIFIED" &&
                        evidence.scenario !== "independent",
                    )
                    .map((d) => (
                      <div key={d.id}>
                        <h3>{d.label}</h3>
                        <blockquote>{d.quote}</blockquote>
                      </div>
                    ))}
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <h3>Audit trail</h3>
                  <span>Hash-linked local events</span>
                </div>
                {[...data.audit].reverse().map((e, i) => (
                  <div className="audit" key={e.hash}>
                    <span className="audit-line" />
                    <div>
                      <strong>{e.action}</strong>
                      <small>{new Date(e.at).toLocaleString()}</small>
                      <code>{e.hash.slice(0, 24)}…</code>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
          <footer>
            LOADBOND{" "}
            <span>
              Structured evidence. Deterministic exposure. Human judgment.
            </span>
            <span>Local MVP · USD · Synthetic</span>
          </footer>
        </div>
      </main>
      {selected && (
        <div className="drawer-back" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Review claim"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <span className="eyebrow">CLAIM / EVIDENCE</span>
              <button
                className="icon-button"
                aria-label="Close review"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <h2>{selected.label}</h2>
            <span className="badge">{selected.verification}</span>
            <p className="hint">
              {selected.extraction.mode} · Page {selected.source.page}
            </p>
            <blockquote>{selected.source.quote}</blockquote>
            <small className="hash">
              Source SHA-256 {selected.source.sha256}
            </small>
            {historical ? (
              <div className="notice">
                Original snapshot record · {money(selected.amount_cents)} ·{" "}
                {selected.instrument_id}. Open the current review queue to
                change records.
              </div>
            ) : (
              <>
                <label>
                  Verified amount (USD)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  Securing instrument
                  <select
                    aria-label="Securing instrument"
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value)}
                  >
                    <option value="">Select an instrument</option>
                    {data.instruments.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.id} · Face {money(i.face_cents)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Review reason
                  <textarea
                    aria-label="Review reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Record what you checked or changed"
                  />
                </label>
                <div className="actions">
                  <button
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => review("VERIFIED")}
                  >
                    Verify facts <Check size={15} />
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => review("REJECTED")}
                  >
                    Reject
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => review("UNVERIFIED")}
                  >
                    Reopen
                  </button>
                </div>
                <p className="hint">
                  Synthetic demo reviewer. This decision is recorded with the
                  before/after values and does not approve legal exclusivity.
                </p>
              </>
            )}
            {error && <p className="error">{error}</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function ClaimTable({
  claims,
  inspect,
}: {
  claims: Claim[];
  inspect: (c: Claim) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Obligation / source</th>
            <th>Class</th>
            <th>Amount</th>
            <th>Review</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id}>
              <td>
                <button className="claim-link" onClick={() => inspect(c)}>
                  {c.label}
                </button>
                <small>
                  Page {c.source.page} ·{" "}
                  {c.instrument_id || "Unmapped instrument"}
                </small>
              </td>
              <td>
                <span className={"pill " + c.kind}>{c.kind}</span>
              </td>
              <td className="numeric">{money(c.amount_cents)}</td>
              <td>
                <span
                  className={"review-status " + c.verification.toLowerCase()}
                >
                  {c.verification}
                </span>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Review " + c.label}
                  onClick={() => inspect(c)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
