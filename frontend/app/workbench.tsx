"use client";
import { useEffect, useState, type FormEvent } from "react";
import "./workbench.css";
import ExtractionPanel, { type ExtractionJob, type Proposal } from "./extraction-panel";
import TransactionWalkthrough from "./transaction-walkthrough";
import StateWorkspace from "./state-workspace";
import type {StateView} from "./state-types";
type Evidence = {
  document_id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
};
type Item = {
  id: string;
  label?: string;
  name?: string;
  verification?: string;
  evidence?: Evidence[];
  [key: string]: any;
};
type Doc = Item & {
  pages: string[];
  superseded: boolean;
  processing: string;
  version: number;
};
type Workspace = {
  project: Item;
  sites: Item[];
  documents: Doc[];
  instruments: Item[];
  claims: Item[];
  dependencies: Item[];
  scenarios: Item[];
  runs: Item[];
  events: Item[];
  extractions: ExtractionJob[];
  proposals: Proposal[];
};
type IntegrityReport = {
  valid: boolean;
  event_count: number;
  checked_at: string;
  scope: string;
  issues: { event_id: string; index: number; check: string }[];
};
type Kind =
  "project" | "sites" | "instruments" | "claims" | "dependencies" | "scenarios";
const titles: Record<Kind, string> = {
  project: "Project",
  sites: "Site",
  instruments: "Instrument",
  claims: "Obligation",
  dependencies: "Constraint",
  scenarios: "Scenario",
};
const money = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v / 100)
    : "Unknown";
function cents(v: FormDataEntryValue | null) {
  const t = String(v || "").trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t))
    throw new Error(
      "Use a nonnegative dollar amount with at most two decimals.",
    );
  const [d, c = ""] = t.split(".");
  const n = Number(d) * 100 + Number(c.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Amount too large.");
  return n;
}
function sourceHighlight(text: string, span: Evidence) {
  const chars = Array.from(text);
  return <>{chars.slice(0, span.start).join("")}<mark>{chars.slice(span.start, span.end).join("")}</mark>{chars.slice(span.end).join("")}</>;
}

export default function Workbench() {
  const [token, setToken] = useState(""),
    [entry, setEntry] = useState("local-demo"),
    [projects, setProjects] = useState<Item[]>([]),
    [reviewer, setReviewer] = useState(""),
    [reviewerExpanded, setReviewerExpanded] = useState(false),
    [w, setW] = useState<Workspace | null>(null),
    [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<{ kind: Kind; item?: Item; proposal?: Proposal } | null>(null),
    [highlight, setHighlight] = useState<Evidence | null>(null),
    [review, setReview] = useState<{ table: string; item: Item } | null>(null),
    [run, setRun] = useState<Item | null>(null),
    [integrity, setIntegrity] = useState<IntegrityReport | null>(null),
    [scenario, setScenario] = useState(""),
    [docId, setDocId] = useState(""),
    [page, setPage] = useState(1),
    [replacement, setReplacement] = useState("");
  const root = "projects/" + w?.project.id;
  async function api(path: string, body?: unknown, method?: string) {
    const r = await fetch("/api/v2/" + path, {
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
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(
        typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail),
      );
    }
    return r.json();
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh(id = w?.project.id) {
    const list = await api("projects");
    if (!id && process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1') id = list.projects[0]?.id;
    setProjects(list.projects);
    setReviewer(list.reviewer);
    if (id) {
      const next = await api("projects/" + id);
      setW(next);
      setIntegrity(null);
      setRun((r) =>
        r ? { ...r, stale: r.revision !== next.project.revision } : null,
      );
      setScenario((s) =>
        next.scenarios.some((x: Item) => x.id === s)
          ? s
          : next.scenarios[0]?.id || "",
      );
      return next;
    }
  }
  async function open(id: string) {
    const next = await refresh(id);
    setRun(null);
    setIntegrity(null);
    setDocId("");
    setPage(1);
    setTab("model");
  }
  useEffect(() => {
    const t = process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1' ? 'local-demo' : sessionStorage.getItem("loadbond-v2-token");
    if (t) setToken(t);
  }, []);
  useEffect(() => {
    if (token) void act(async () => {
      const url = new URL(window.location.href);
      const id = url.searchParams.get("project") || undefined;
      const next = await refresh(id);
      if (next) {
        const view = url.searchParams.get("view") || "model";
        const allowed = ["model","source-review","state-explorer","decision-brief","overview","documents","sites","instruments","claims","dependencies","scenarios","history","transaction"];
        setTab(allowed.includes(view) ? view : "model");
      }
    });
  }, [token]);
  useEffect(() => {
    if (!w) return;
    const url = new URL(window.location.href);
    url.searchParams.set("project", w.project.id);
    url.searchParams.set("view", tab);
    window.history.replaceState(null, "", url);
  }, [w?.project.id, tab]);
  const activeJobs = w?.extractions?.filter((j) => ["QUEUED", "RUNNING"].includes(j.status)).map((j) => j.id).join(",") || "";
  useEffect(() => {
    if (!activeJobs || !w?.project.id) return;
    let cancelled = false;
    const projectId = w.project.id;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch("/api/v2/projects/" + projectId, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (!r.ok) throw new Error("Extraction progress unavailable; check the backend.");
        const next = await r.json();
        if (!cancelled) {
          setW(next);
          setRun((r) => r ? { ...r, stale: r.revision !== next.project.revision } : null);
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeJobs, w?.project.id, token]);
  const dialogOpen = !!(editor || review);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const candidates = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ) || [],
      );
    candidates()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditor(null);
        setReview(null);
      }
      if (e.key === "Tab") {
        const items = candidates(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [dialogOpen]);
  const doc =
      w?.documents.find((d) => d.id === docId) ||
      w?.documents.find((d) => !d.superseded),
    current = run || w?.runs.at(-1);
  async function inspect(id: string) {
    setRun(await api(root + "/runs/" + id));
    setTab("history");
  }
  async function checkIntegrity() {
    setIntegrity(await api(root + "/integrity"));
  }
  async function download(format: string) {
    const r = await fetch(
      "/api/v2/" + root + "/runs/" + current!.id + "/export?format=" + format,
      { headers: { Authorization: "Bearer " + token } },
    );
    if (!r.ok) throw new Error("Export failed.");
    const url = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = "loadbond-evidence." + format;
    a.click();
    URL.revokeObjectURL(url);
  }
  const actions = (table: Kind, item: Item) => (
    <div className="actions">
      <button
        className="secondary"
        onClick={() => setEditor({ kind: table, item })}
      >
        Edit {item.label || item.name}
      </button>
      {["claims", "instruments", "dependencies"].includes(table) && (
        <button onClick={() => setReview({ table, item })}>
          Review {item.label}
        </button>
      )}
    </div>
  );
  if (!token)
    return (
      <main className="login">
        <p className="eyebrow">LOADBOND / LOCAL WORKBENCH</p>
        <h1>
          Build the assessment
          <br />
          from its evidence.
        </h1>
        <p>Local AI proposals and manual entry. Exact calculation. Public and synthetic documents.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem("loadbond-v2-token", entry);
            setToken(entry);
          }}
        >
          <label>
            Workspace token
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              required
            />
          </label>
          <button>Open workspace</button>
        </form>
        <small>
          Local token: local-demo. This is not customer authentication.
        </small>
      </main>
    );
  return (
    <div className="shell v2">
      {process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1' && <div role="status" style={{position:'fixed',bottom:12,left:250,right:20,zIndex:60,padding:'12px 18px',background:'#213e43',color:'#fff',borderRadius:8,fontSize:13}}>Public case explorer · Read-only synthetic/public evidence · AI extraction and editing run locally. <a href="https://github.com/aaravjj2/loadbond" style={{color:'#fff'}}>Source & run instructions</a></div>}
      <aside className="sidebar">
        <div className="brand">▥ LoadBond</div>
        <div className="workspace-label">
          LOCAL WORKBENCH <span>02</span>
        </div>
        <button
          className="project-button"
          onClick={() => {
            setW(null);
            setRun(null);
          }}
        >
          {w?.project.name || "Your projects"}
          <small>
            {w
              ? w.sites.length +
                " sites · " +
                w.instruments.length +
                " instruments"
              : "Start from an empty project"}
          </small>
        </button>
        <nav aria-label="Workbench">
          <div className="state-primary-nav">{[["model","Transaction"],["source-review","Sources & Review"],["state-explorer","States"],["decision-brief","Decision Brief"]].map(([id,label])=><button key={id} disabled={!w} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</div>
          <details className="state-advanced-nav" open={!['model','source-review','state-explorer','decision-brief'].includes(tab)}><summary>Registers, audit & earlier workbench</summary>
          {w?.documents.some(d => d.transaction_case) && <button className={tab === "transaction" ? "active" : ""} onClick={() => setTab("transaction")}>Riverbend tutorial</button>}
          {[
            ["overview", "Exposure overview"],
            ["documents", "Source documents"],
            ["sites", "Sites"],
            ["instruments", "Instrument register"],
            ["claims", "Obligations & review"],
            ["dependencies", "Constraints"],
            ["scenarios", "Scenarios"],
            ["history", "Evidence & history"],
          ].map(([id, label]) => (
            <button
              key={id}
              disabled={!w}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          </details>
        </nav>
        <div className="sidebar-bottom">
          <b>Evidence review workflow</b>
          <p>
            User review is not a legal opinion.
            <br />
            No confirmed capital savings.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem("loadbond-v2-token");
              setToken("");
              setW(null);
            }}
          >
            Close workspace
          </button>
          <a href="/legacy">Historical v1 interface</a>
        </div>
      </aside>
      <main className="main">
        <header>
          <span>
            {w?.project.name || "Projects"} /{" "}
            {w?.project.synthetic ? "SYNTHETIC" : "PUBLIC EVIDENCE"}
          </span>
          <button
            className="secondary"
            onClick={() =>
              void act(async () => {
                if (current) await inspect(current.id);
                requestAnimationFrame(() => window.print());
              })
            }
          >
            Print report
          </button>
        </header>
        <div className="content">
          <div className="title-row">
            <div>
              <p className="eyebrow">EVIDENCE → REVIEW → ASSESSMENT</p>
              <h1>
                {w
                  ? (
                      {
                        model: "What can coexist?",
                        'source-review': "Sources & Review",
                        'state-explorer': "States & Exposure",
                        'decision-brief': "Decision Brief",
                        transaction: "Transaction walkthrough",
                        overview: "Exposure overview",
                        documents: "Source documents",
                        sites: "Sites",
                        instruments: "Instrument register",
                        claims: "Obligations & review",
                        dependencies: "Constraints",
                        scenarios: "Scenarios",
                        history: "Evidence & history",
                      } as Record<string, string>
                    )[tab]
                  : "Your projects"}
              </h1>
            </div>
            <span className="muted">USD · Local operator</span>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
              {!w && (
                <button onClick={() => setToken("")}>Return to sign-in</button>
              )}
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
            </div>
          )}
          {['model','source-review','state-explorer','decision-brief','transaction'].includes(tab) && reviewer && <div className="case-reviewer"><span>Reviewer: <b>{reviewer}</b> · Local model-input decisions</span><button className="text-button" onClick={() => setReviewerExpanded(v => !v)}>{reviewerExpanded ? "Close reviewer setup" : "Edit reviewer"}</button></div>}
          {(!['model','source-review','state-explorer','decision-brief','transaction'].includes(tab) || !reviewer || reviewerExpanded) && <form
            className="profile-row"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api("profile", { name: f.get("name") });
                await refresh();
                setNotice("Reviewer saved.");
              });
            }}
          >
            <label>
              Reviewer name
              <input
                key={reviewer}
                name="name"
                defaultValue={reviewer}
                required
                minLength={2}
                placeholder="Your name"
              />
            </label>
            <button className="secondary" disabled={busy}>
              Save reviewer
            </button>
            <small>
              This name identifies local decisions; it does not establish
              professional authority.
            </small>
          </form>}
          {!w ? (
            <>
              <div className="actions">
                {['public','synthetic'].map(kind=><button key={kind} className={kind==='public'?'':'secondary'} disabled={busy} onClick={()=>void act(async()=>{
                  if (process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1') {
                    const existing = projects.find(p => p.synthetic === (kind === 'synthetic'));
                    if (existing) await open(existing.id);
                    return;
                  }
                  const r=await fetch('/api/v3/references/'+kind,{method:'POST',headers:{Authorization:'Bearer '+token}});
                  if(!r.ok){const e=await r.json();throw new Error(typeof e.detail==='string'?e.detail:JSON.stringify(e.detail));}
                  const value=await r.json();await open(value.project.id);
                })}>{kind==='public'?'Explore public commitment phases':'Explore synthetic adverse states'}</button>)}
                <button disabled={busy || process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1'} onClick={() => void act(async () => {
                  const p = await api("transaction-case", {});
                  await open(p.id);
                  const next = await api("projects/" + p.id);
                  const r = await api("projects/" + p.id + "/runs", { scenario_id: next.scenarios[0].id });
                  setRun(r);
                  await refresh(p.id);
                  setTab('transaction');
                })}>Explore the transaction case</button>
                <button disabled={process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1'} onClick={() => setEditor({ kind: "project" })}>
                  Create project
                </button>
                <button
                  className="secondary"
                  disabled={busy || process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1'}
                  onClick={() =>
                    void act(async () => {
                      const p = await api("sample", {});
                      await open(p.id);
                    })
                  }
                >
                  Load sample project
                </button>
                <button
                  className="secondary"
                  disabled={busy || process.env.NEXT_PUBLIC_LOADBOND_PUBLIC_DEMO === '1'}
                  onClick={() =>
                    void act(async () => {
                      const p = await api("import-legacy", {});
                      await open(p.id);
                    })
                  }
                >
                  Import historical v1 workspace
                </button>
              </div>
              <section className="record-grid">
                {projects.map((p) => (
                  <article className="panel" key={p.id}>
                    <p className="eyebrow">
                      {p.synthetic ? "SYNTHETIC" : "PUBLIC EVIDENCE"}
                      {p.archived ? " · ARCHIVED" : ""}
                    </p>
                    <h2>{p.name}</h2>
                    <p>
                      {p.mw == null ? "Capacity not recorded" : p.mw + " MW"}
                    </p>
                    <button onClick={() => void act(() => open(p.id))}>
                      Open {p.name}
                    </button>
                  </article>
                ))}
              </section>
              {!projects.length && (
                <div className="panel empty">
                  <h2>No projects yet.</h2>
                  <p>
                    Create a project and enter its evidence. The sample is
                    optional.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {w.project.archived && (
                <div className="notice">
                  Archived project. Reopen it through project settings to edit
                  inputs.
                </div>
              )}
              {tab === "transaction" && <TransactionWalkthrough w={w} reviewer={reviewer} busy={busy || !!w.project.archived} api={api} act={act} refresh={() => refresh()} onRun={setRun} onHistory={id => void act(() => inspect(id))} onSource={span => { setDocId(span.document_id); setPage(span.page); setHighlight(span); setTab("documents"); }} />}
              {['model','source-review','state-explorer','decision-brief'].includes(tab) && <StateWorkspace key={w.project.id} pid={w.project.id} token={token} reviewer={reviewer} revision={w.project.revision} view={tab as StateView} onView={setTab} onRefresh={()=>refresh().then(()=>{})} onRegister={(kind,documentId,item)=>{if(documentId)setDocId(documentId);setEditor({kind,item});}} onProposal={p=>{setDocId(p.document_id);setPage(p.source_page);setEditor({kind:p.record_type==='instrument'?'instruments':'claims',proposal:p,item:{id:'',label:p.label,beneficiary:p.beneficiary||'',face_cents:p.amount_cents,amount_cents:p.amount_cents,kind:p.kind,evidence:p.evidence}});}} />}
              {tab === "overview" && (
                <>
                  <section className="hero-panel">
                    <div>
                      <p className="eyebrow">{w.project.name}</p>
                      <h2>
                        What can be supported
                        <br />
                        by the documents?
                      </h2>
                      <p>
                        {w.documents.length} documents · {w.instruments.length}{" "}
                        instruments · {w.claims.length} obligations
                      </p>
                      <button
                        className="text-button"
                        onClick={() =>
                          setEditor({ kind: "project", item: w.project })
                        }
                      >
                        Project settings →
                      </button>
                    </div>
                    <div className="exposure">
                      <p className="eyebrow">
                        {current?.scenario_name || "NO ASSESSMENT YET"}
                      </p>
                      <div className="big-number">
                        {money(current?.result.maximum_cents)}
                      </div>
                      <span>
                        {current?.result.status || "Add and review inputs"}
                        {current?.stale ? " · HISTORICAL" : ""}
                        {current?.result.hypothetical ? " · HYPOTHETICAL" : ""}
                      </span>
                    </div>
                  </section>
                  <section className="metrics">
                    {[
                      [
                        "Gross under same stress",
                        money(current?.result.gross_cents),
                      ],
                      [
                        "Maximum modeled obligations",
                        money(current?.result.maximum_obligations_cents),
                      ],
                      [
                        "Modeled exposure difference",
                        money(current?.result.modeled_difference_cents),
                      ],
                      ["Capital released", "Not established"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </section>
                  <section className="two-col">
                    <div className="panel">
                      <h3>Run an assessment</h3>
                      <label>
                        Scenario
                        <select
                          value={scenario}
                          onChange={(e) => setScenario(e.target.value)}
                        >
                          {w.scenarios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="muted">
                        Active instruments default to full face. Hypothetical
                        claim-limited modeling requires explicit reviewed
                        evidence.
                      </p>
                      <button
                        disabled={busy || !scenario || w.project.archived}
                        onClick={() =>
                          void act(async () => {
                            const r = await api(root + "/runs", {
                              scenario_id: scenario,
                            });
                            setRun(r);
                            await refresh();
                            setNotice("Assessment saved: " + r.result.status);
                          })
                        }
                      >
                        Compute exposure
                      </button>
                    </div>
                    <div className="panel">
                      <h3>Assessment readiness</h3>
                      <p>
                        {
                          w.documents.filter(
                            (d) => !d.superseded && d.processing !== "REVIEWED",
                          ).length
                        }{" "}
                        unfinished documents
                      </p>
                      <p>
                        {
                          [...w.claims, ...w.instruments].filter(
                            (x) => x.verification === "UNVERIFIED",
                          ).length
                        }{" "}
                        inputs awaiting review
                      </p>
                      {current?.result.issues?.map(
                        (issue: string, i: number) => (
                          <p key={i} className="issue">
                            {issue}
                          </p>
                        ),
                      )}
                      <button
                        className="secondary"
                        disabled={!current || busy}
                        onClick={() => void act(() => inspect(current!.id))}
                      >
                        Inspect assessment evidence
                      </button>
                    </div>
                  </section>
                </>
              )}
              {tab === "documents" && (
                <>
                  <div className="notice">
                    Public or synthetic evidence only. Text PDF, TXT, MD · 5 MB
                    maximum. Documents are evidence, never application
                    instructions.
                  </div>
                  <div className="upload-row">
                    <label>
                      Document being amended
                      <select
                        value={replacement}
                        onChange={(e) => setReplacement(e.target.value)}
                      >
                        <option value="">New agreement</option>
                        {w.documents
                          .filter((d) => !d.superseded)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} v{d.version}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="upload-button">
                      Upload document
                      <input
                        type="file"
                        accept=".txt,.md,.pdf"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file)
                            void act(async () => {
                              const f = new FormData();
                              f.set("file", file);
                              f.set("replaces", replacement);
                              const d = await api(root + "/documents", f);
                              await refresh();
                              setDocId(d.id);
                              setPage(1);
                              setReplacement("");
                              setNotice(
                                "Document saved. Record relevant inputs, then finish review.",
                              );
                            });
                        }}
                      />
                    </label>
                  </div>
                  <section className="document-layout">
                    <div className="document-list">
                      {w.documents.map((d) => (
                        <button
                          key={d.id}
                          className={doc?.id === d.id ? "selected" : ""}
                          onClick={() => {
                            setDocId(d.id);
                            setPage(1);
                          }}
                        >
                          {d.name}
                          <small>
                            v{d.version} ·{" "}
                            {d.superseded ? "SUPERSEDED" : d.processing}
                            {!!d.textless_pages?.length &&
                              ` · no text on page ${d.textless_pages.join(", ")}`}
                          </small>
                        </button>
                      ))}
                    </div>
                    <div className="panel">
                      {doc ? (
                        <>
                          <h3>{doc.name}</h3>
                          <label>
                            Page
                            <select
                              value={page}
                              onChange={(e) => setPage(Number(e.target.value))}
                            >
                              {doc.pages.map((_, i) => (
                                <option key={i} value={i + 1}>
                                  {i + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                          <pre className="document-text">
                            {highlight?.document_id === doc.id && highlight.page === page ? sourceHighlight(doc.pages[page - 1], highlight) : doc.pages[page - 1]}
                          </pre>
                          <div className="actions">
                            <button
                              onClick={() => setEditor({ kind: "claims" })}
                            >
                              Record an obligation
                            </button>
                            <button
                              className="secondary"
                              onClick={() => setEditor({ kind: "instruments" })}
                            >
                              Record an instrument
                            </button>
                          </div>
                          <ExtractionPanel key={doc.id} root={root} documentId={doc.id} disabled={busy || doc.superseded || !!w.project.archived}
                            jobs={w.extractions || []} proposals={w.proposals || []} api={api} perform={act} refresh={refresh}
                            showSource={(p) => { setPage(p.source_page); setHighlight(p.evidence[0] || null); }}
                            edit={(p) => setEditor({ kind: p.record_type === "instrument" ? "instruments" : "claims", proposal: p,
                              item: { id: "", label: p.label, beneficiary: p.beneficiary || "", face_cents: p.amount_cents, amount_cents: p.amount_cents, kind: p.kind, evidence: p.evidence } })} />
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void act(async () => {
                                await api(
                                  root + "/documents/" + doc.id + "/complete",
                                  { reason: f.get("reason") },
                                );
                                await refresh();
                                setNotice(
                                  "Document review completed. Record reviews are separate.",
                                );
                              });
                            }}
                          >
                            <label>
                              Completion reason
                              <textarea
                                name="reason"
                                required
                                minLength={3}
                                placeholder="All relevant records entered, or explain why none apply."
                              />
                            </label>
                            <button disabled={busy || doc.superseded}>
                              Finish document review
                            </button>
                          </form>
                        </>
                      ) : (
                        <p>Upload a source document.</p>
                      )}
                    </div>
                  </section>
                </>
              )}
              {(
                [
                  "sites",
                  "instruments",
                  "claims",
                  "dependencies",
                  "scenarios",
                ] as string[]
              ).includes(tab) && (
                <>
                  <button onClick={() => setEditor({ kind: tab as Kind })}>
                    Add {titles[tab as Kind].toLowerCase()}
                  </button>
                  <p className="muted">
                    {tab === "claims"
                      ? "Resolve overlapping claims; confirm additive mapping before review."
                      : tab === "dependencies"
                        ? "Review constraints separately. A user decision is not counsel approval."
                        : tab === "instruments"
                          ? "Face, modeling basis and release evidence remain separate. Editing revokes review."
                          : tab === "scenarios"
                            ? "Choose explicit constraints and multipliers. Unreviewed constraints give no reduction."
                            : "Commercial site abandonment does not release security."}
                  </p>
                  <section className="record-grid">
                    {(w[tab as "sites"] as Item[]).map((item) => (
                      <article className="panel" key={item.id}>
                        <div className="panel-heading">
                          <h3>{item.label || item.name}</h3>
                          <span className="badge">
                            {item.verification ||
                              (item.hypothetical
                                ? "HYPOTHETICAL"
                                : item.commercial_status || "DOCUMENTED")}
                          </span>
                        </div>
                        {tab === "instruments" && (
                          <>
                            <p>
                              {item.beneficiary} · {item.lifecycle}
                            </p>
                            <p>
                              Face <b>{money(item.face_cents)}</b> ·{" "}
                              {item.basis}
                            </p>
                            <p>
                              Release:{" "}
                              {item.release_verified
                                ? "Reviewed"
                                : "Not reviewed"}
                            </p>
                            <p>
                              Facility {money(item.facility_usage_cents)} · Cash{" "}
                              {money(item.cash_collateral_cents)} · Guarantee{" "}
                              {money(item.guarantee_cents)} · Surety{" "}
                              {money(item.surety_cents)}
                            </p>
                          </>
                        )}
                        {tab === "claims" && (
                          <p>
                            {money(item.amount_cents)} · {item.kind} ·{" "}
                            {item.mapping}
                            <br />
                            {w.instruments.find(
                              (i) => i.id === item.instrument_id,
                            )?.label || "Unmapped"}
                          </p>
                        )}
                        {tab === "dependencies" && (
                          <p>
                            At most {item.max_active} of {item.claim_ids.length}{" "}
                            selected claims
                          </p>
                        )}
                        {tab === "scenarios" && (
                          <p>
                            Conditional {item.conditional_percent}% · Ceilings{" "}
                            {item.ceiling_percent}% ·{" "}
                            {item.dependency_ids.length} constraints
                          </p>
                        )}
                        {item.evidence?.map((ev, i) => (
                          <blockquote key={i}>
                            {ev.quote}
                            <small>
                              {
                                w.documents.find((d) => d.id === ev.document_id)
                                  ?.name
                              }{" "}
                              · page {ev.page}
                            </small>
                          </blockquote>
                        ))}
                        {actions(tab as Kind, item)}
                      </article>
                    ))}
                  </section>
                </>
              )}
              {tab === "history" && (
                <>
                  <section className="two-col">
                    <div className="panel">
                      <h3>Saved assessments</h3>
                      {w.runs.map((r) => (
                        <button
                          className="run-row"
                          key={r.id}
                          onClick={() => void act(() => inspect(r.id))}
                        >
                          <span>
                            {r.scenario_name}
                            <small>
                              {new Date(r.at).toLocaleString()} ·{" "}
                              {r.stale ? "HISTORICAL" : r.result.status}
                            </small>
                          </span>
                          <b>{money(r.result.maximum_cents)}</b>
                        </button>
                      ))}
                    </div>
                    <div className="panel">
                      <h3>{current?.scenario_name || "No assessment"}</h3>
                      <p>{current?.result.notice}</p>
                      <div className="actions">
                        <button
                          disabled={!current || busy}
                          onClick={() => void act(() => download("json"))}
                        >
                          Export JSON
                        </button>
                        <button
                          disabled={!current || busy}
                          onClick={() => void act(() => download("csv"))}
                        >
                          Export CSV
                        </button>
                        <button
                          disabled={!current || busy}
                          onClick={() =>
                            void act(async () => {
                              const r = await api(
                                root + "/runs/" + current!.id + "/replay",
                                {},
                              );
                              setNotice(
                                r.snapshot_matches && r.result_matches
                                  ? "Historical snapshot and result reproduced exactly."
                                  : "Replay mismatch. Do not rely on this assessment.",
                              );
                            })
                          }
                        >
                          Replay snapshot
                        </button>
                      </div>
                      <p className="hash">{current?.snapshot_hash}</p>
                      {current?.result.issues?.map((s: string, i: number) => (
                        <p className="issue" key={i}>
                          {s}
                        </p>
                      ))}
                    </div>
                  </section>
                  {run?.snapshot && (
                    <section className="panel">
                      <h3>Original snapshot evidence · read only</h3>
                      <p>
                        {run.scenario_name} · Exposure{" "}
                        {money(run.result.maximum_cents)} · Obligation maximum{" "}
                        {money(run.result.maximum_obligations_cents)}
                      </p>
                      <p>
                        {run.snapshot.scenario?.hypothetical
                          ? "Hypothetical assumptions"
                          : "Documented baseline"}{" "}
                        · {run.result.feasible_states} feasible states
                      </p>
                      {Object.entries(
                        run.result.instrument_contributions || {},
                      ).map(([id, v]) => (
                        <div className="fact" key={id}>
                          <span>
                            {run.snapshot.instruments.find(
                              (i: Item) => i.id === id,
                            )?.label || id}
                          </span>
                          <b>{money(v)}</b>
                        </div>
                      ))}
                      <h4>Instrument amounts and modeling basis</h4>
                      {run.snapshot.instruments.map((i: Item) => (
                        <article key={i.id}>
                          <h4>
                            {i.label || i.id} · Face {money(i.face_cents)} ·{" "}
                            {i.basis || "Legacy modeling basis"}
                            {i.basis === "CLAIM_LIMITED" && i.basis_hypothetical
                              ? " (hypothetical)"
                              : ""}
                          </h4>
                          {[
                            "evidence",
                            "basis_evidence",
                            "release_evidence",
                          ].map((field) =>
                            (i[field] || []).map((e: Evidence, n: number) => (
                              <blockquote key={field + n}>
                                {e.quote}
                                <small>
                                  {field.replaceAll("_", " ")} ·{" "}
                                  {
                                    run.snapshot.documents.find(
                                      (d: Item) => d.id === e.document_id,
                                    )?.name
                                  }{" "}
                                  · page {e.page}
                                </small>
                              </blockquote>
                            )),
                          )}
                        </article>
                      ))}
                      <h4>Applied constraints</h4>
                      {run.snapshot.dependencies
                        .filter((d: Item) =>
                          run.result.applied_dependencies?.includes(d.id),
                        )
                        .map((d: Item) => (
                          <article key={d.id}>
                            <h4>
                              {d.label} · at most {d.max_active} claims
                            </h4>
                            {d.evidence?.map((e: Evidence, n: number) => (
                              <blockquote key={n}>
                                {e.quote}
                                <small>
                                  {
                                    run.snapshot.documents.find(
                                      (x: Item) => x.id === e.document_id,
                                    )?.name
                                  }{" "}
                                  · page {e.page}
                                </small>
                              </blockquote>
                            ))}
                          </article>
                        ))}
                      {run.snapshot.claims
                        .filter((c: Item) =>
                          run.result.active_claims?.includes(c.id),
                        )
                        .map((c: Item) => (
                          <article key={c.id}>
                            <h4>
                              {c.label} · {money(c.amount_cents)}
                            </h4>
                            {(c.evidence || []).map((e, i) => (
                              <blockquote key={i}>
                                {e.quote}
                                <small>
                                  {
                                    run.snapshot.documents.find(
                                      (d: Item) => d.id === e.document_id,
                                    )?.name
                                  }{" "}
                                  · page {e.page}
                                </small>
                              </blockquote>
                            ))}
                          </article>
                        ))}
                      <details>
                        <summary>Complete immutable inputs and result</summary>
                        <pre className="json-view">
                          {JSON.stringify(run, null, 2)}
                        </pre>
                      </details>
                    </section>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Review and audit history</h3>
                        <p className="muted">
                          Verify stored event hashes and links. This checks internal
                          consistency; local storage is not tamper-proof.
                        </p>
                      </div>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void act(checkIntegrity)}
                      >
                        Check audit integrity
                      </button>
                    </div>
                    {integrity && (
                      <div
                        className={integrity.valid ? "notice" : "error"}
                        role={integrity.valid ? "status" : "alert"}
                      >
                        <b>
                          {integrity.valid
                            ? `Consistent stored history · ${integrity.event_count} events checked`
                            : `Integrity mismatch · ${integrity.issues.length} issue${integrity.issues.length === 1 ? "" : "s"}`}
                        </b>
                        <small className="integrity-meta">
                          Checked {new Date(integrity.checked_at).toLocaleString()}
                        </small>
                        {integrity.issues.map((issue, index) => (
                          <div className="integrity-issue" key={issue.event_id + issue.check + index}>
                            Event {issue.index + 1} · {issue.check.replace("_", " ")}
                          </div>
                        ))}
                      </div>
                    )}
                    {w.events
                      .slice()
                      .reverse()
                      .map((e) => (
                        <div className="audit-row" key={e.id}>
                          <b>{e.action}</b>
                          <span>
                            {e.reviewer} · {new Date(e.at).toLocaleString()}
                          </span>
                          <details>
                            <summary>Event details</summary>
                            <pre className="json-view">
                              {JSON.stringify(e.detail, null, 2)}
                            </pre>
                          </details>
                        </div>
                      ))}
                  </section>
                </>
              )}
            </>
          )}
        </div>
        <footer>
          LoadBond · Evidence workbench · Experimental local AI · Exact enumeration · Public /
          synthetic evidence
        </footer>
      </main>
      {editor && (
        <Editor
          kind={editor.kind}
          item={editor.item}
          w={w}
          initialDoc={doc?.id}
          proposalMode={!!editor.proposal}
          busy={busy}
          serverError={error}
          close={() => setEditor(null)}
          save={async (body) => {
            await act(async () => {
              if (editor.kind === "project") {
                const p = await api(
                  "projects" + (editor.item ? "/" + editor.item.id : ""),
                  body,
                  editor.item ? "PATCH" : "POST",
                );
                await open(p.id);
              } else if (editor.proposal) {
                const edited = { ...(body as Record<string, unknown>), ...(editor.kind === "claims" ? { mapping: "UNCERTAIN", legal_status: "UNKNOWN" } : {}) };
                await api(root + "/proposals/" + editor.proposal.id + "/resolve", { action: "IMPORT", reason: "Edited proposal imported for separate input review", edited });
                await refresh();
              } else {
                await api(
                  root +
                    "/" +
                    editor.kind +
                    (editor.item ? "/" + editor.item.id : ""),
                  body,
                  editor.item ? "PATCH" : "POST",
                );
                await refresh();
              }
              setEditor(null);
              setNotice("Record saved. Material input edits require review.");
            });
          }}
        />
      )}
      {review && (
        <div className="modal-back">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Review record"
            className="editor panel"
          >
            <button
              className="close"
              aria-label="Close review"
              onClick={() => setReview(null)}
            >
              ×
            </button>
            <h2>Review {review.item.label}</h2>
            <p>User review of a model input, not legal certification.</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  if (!reviewer)
                    throw new Error("Save your reviewer name first.");
                  await api(
                    root +
                      "/" +
                      review.table +
                      "/" +
                      review.item.id +
                      "/review",
                    { decision: f.get("decision"), reason: f.get("reason") },
                  );
                  await refresh();
                  setReview(null);
                  setNotice("Review recorded.");
                });
              }}
            >
              <label>
                Decision
                <select name="decision">
                  <option value="VERIFIED">Accept reviewed input</option>
                  <option value="REJECTED">Reject</option>
                  <option value="UNVERIFIED">Return for review</option>
                </select>
              </label>
              <label>
                Review reason
                <textarea name="reason" required minLength={3} />
              </label>
              <button disabled={busy}>Save decision</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function Editor({
  kind,
  item,
  w,
  initialDoc,
  proposalMode = false,
  busy,
  serverError,
  close,
  save,
}: {
  kind: Kind;
  item?: Item;
  w: Workspace | null;
  initialDoc?: string;
  proposalMode?: boolean;
  busy: boolean;
  serverError: string;
  close: () => void;
  save: (body: unknown) => Promise<void>;
}) {
  const docs = w?.documents.filter((d) => !d.superseded) || [];
  const [docId, setDocId] = useState(initialDoc || docs[0]?.id || ""),
    [page, setPage] = useState(1),
    [selection, setSelection] = useState<{ start: number; end: number } | null>(
      null,
    ),
    [evidence, setEvidence] = useState<Record<string, Evidence[]>>({
      evidence: item?.evidence || [],
      basis_evidence: item?.basis_evidence || [],
      release_evidence: item?.release_evidence || [],
    }),
    [purpose, setPurpose] = useState("evidence"),
    [members, setMembers] = useState<string[]>(
      item?.[kind === "scenarios" ? "dependency_ids" : "claim_ids"] || [],
    ),
    [error, setError] = useState("");
  const [exactQuote, setExactQuote] = useState("");
  const d = docs.find((x) => x.id === docId),
    text = d?.pages[page - 1] || "";
  const field = (
    name: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={item?.[name] ?? ""}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
      />
    </label>
  );
  const amount = (name: string, label: string) => (
    <label>
      {label}
      <input
        name={name}
        inputMode="decimal"
        defaultValue={
          typeof item?.[name] === "number" ? String(item[name] / 100) : ""
        }
        placeholder="Unknown"
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    values: string[],
    fallback: string,
  ) => (
    <label>
      {label}
      <select name={name} defaultValue={item?.[name] ?? fallback} disabled={proposalMode && name === "mapping"}>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  const checkbox = (name: string, label: string, defaultValue: boolean) => (
    <label className="check">
      <input
        type="checkbox"
        name={name}
        defaultChecked={item ? Boolean(item[name]) : defaultValue}
      />
      {label}
    </label>
  );
  const site = (
    <label>
      Site
      <select name="site_id" defaultValue={item?.site_id || ""}>
        <option value="">Not assigned</option>
        {w?.sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const f = new FormData(e.currentTarget),
        get = (n: string) => String(f.get(n) || "");
      let b: Record<string, unknown> = {};
      if (kind === "project")
        b = {
          name: get("name"),
          mw: get("mw") ? Number(get("mw")) : null,
          synthetic: f.get("synthetic") === "on",
          archived: f.get("archived") === "on",
        };
      if (kind === "sites")
        b = { name: get("name"), commercial_status: get("commercial_status") };
      if (kind === "instruments")
        b = {
          label: get("label"),
          beneficiary: get("beneficiary"),
          site_id: get("site_id") || null,
          face_cents: cents(f.get("face_cents")),
          currency: "USD",
          lifecycle: get("lifecycle"),
          governing_law: get("governing_law"),
          basis: get("basis"),
          basis_hypothetical: f.get("basis_hypothetical") === "on",
          ...evidence,
          ...Object.fromEntries(
            [
              "facility_usage_cents",
              "cash_collateral_cents",
              "guarantee_cents",
              "surety_cents",
            ].map((k) => [k, cents(f.get(k))]),
          ),
        };
      if (kind === "claims")
        b = {
          label: get("label"),
          amount_cents: cents(f.get("amount_cents")),
          currency: "USD",
          kind: get("kind"),
          instrument_id: get("instrument_id"),
          site_id: get("site_id") || null,
          legal_status: "UNKNOWN",
          mapping: get("mapping"),
          estimate: f.get("estimate") === "on",
          evidence: evidence.evidence,
        };
      if (kind === "dependencies")
        b = {
          label: get("label"),
          claim_ids: members,
          max_active: Number(get("max_active")),
          hypothetical: f.get("hypothetical") === "on",
          evidence: evidence.evidence,
        };
      if (kind === "scenarios")
        b = {
          name: get("name"),
          hypothetical: f.get("hypothetical") === "on",
          conditional_percent: Number(get("conditional_percent")),
          ceiling_percent: Number(get("ceiling_percent")),
          dependency_ids: members,
        };
      await save(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="modal-back">
      <section
        className="editor panel"
        role="dialog"
        aria-modal="true"
        aria-label={(item ? "Edit " : "Create ") + titles[kind]}
      >
        <button className="close" aria-label="Close editor" onClick={close}>
          ×
        </button>
        <h2>
          {item ? "Edit" : "Create"} {titles[kind].toLowerCase()}
        </h2>
        <p>{proposalMode ? "Import creates an unverified input. Obligation mapping stays uncertain until you confirm it after import." : "Save proposed inputs, then review material records separately."}</p>
        {(error || serverError) && (
          <p role="alert" className="error">
            {error || serverError}
          </p>
        )}
        <form onSubmit={submit}>
          <div className="form-grid">
            {kind === "project" && (
              <>
                {field("name", "Project name", "text", true)}
                {field("mw", "Capacity MW", "number")}
                {checkbox("synthetic", "Synthetic project", false)}
                {checkbox("archived", "Archived", false)}
              </>
            )}
            {kind === "sites" && (
              <>
                {field("name", "Site name", "text", true)}
                {select(
                  "commercial_status",
                  "Commercial status",
                  ["CANDIDATE", "SELECTED", "ABANDONED"],
                  "CANDIDATE",
                )}
              </>
            )}
            {["claims", "instruments", "dependencies"].includes(kind) &&
              field("label", "Label", "text", true)}
            {kind === "instruments" && (
              <>
                {field("beneficiary", "Beneficiary", "text", true)}
                {site}
                {amount("face_cents", "Face amount USD")}
                {select(
                  "lifecycle",
                  "Lifecycle",
                  ["EFFECTIVE", "RELEASED", "EXPIRED", "CANCELLED"],
                  "EFFECTIVE",
                )}
                {field("governing_law", "Governing law description")}
                {select(
                  "basis",
                  "Exposure basis",
                  ["FACE", "CLAIM_LIMITED"],
                  "FACE",
                )}
                {checkbox(
                  "basis_hypothetical",
                  "Claim-limited basis is hypothetical",
                  true,
                )}
                {amount("facility_usage_cents", "Facility usage USD")}
                {amount("cash_collateral_cents", "Cash collateral USD")}
                {amount("guarantee_cents", "Guarantee USD")}
                {amount("surety_cents", "Surety USD")}
              </>
            )}
            {kind === "claims" && (
              <>
                {amount("amount_cents", "Obligation amount USD")}
                {select(
                  "kind",
                  "Obligation category",
                  ["fixed", "conditional"],
                  "fixed",
                )}
                {site}
                <label>
                  Securing instrument
                  <select
                    name="instrument_id"
                    defaultValue={item?.instrument_id || ""}
                    required
                  >
                    <option value="">Choose instrument</option>
                    {w?.instruments.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </label>
                {select(
                  "mapping",
                  "Component mapping",
                  ["UNCERTAIN", "ADDITIVE"],
                  "UNCERTAIN",
                )}
                {checkbox(
                  "estimate",
                  "Estimate subject to true-up (final amount may be greater or lesser)",
                  false,
                )}
              </>
            )}
            {kind === "dependencies" && (
              <>
                <label>
                  Maximum simultaneous claims
                  <input
                    name="max_active"
                    type="number"
                    min={0}
                    max={20}
                    defaultValue={item?.max_active ?? 1}
                    required
                  />
                </label>
                {checkbox("hypothetical", "Hypothetical constraint", true)}
              </>
            )}
            {kind === "scenarios" && (
              <>
                {field("name", "Scenario name", "text", true)}
                <label>
                  Conditional amount percent
                  <input
                    name="conditional_percent"
                    type="number"
                    min={100}
                    max={1000}
                    defaultValue={item?.conditional_percent ?? 100}
                    required
                  />
                </label>
                <label>
                  Instrument ceiling percent
                  <input
                    name="ceiling_percent"
                    type="number"
                    min={100}
                    max={1000}
                    defaultValue={item?.ceiling_percent ?? 100}
                    required
                  />
                </label>
                {checkbox("hypothetical", "Hypothetical scenario", false)}
              </>
            )}
          </div>
          {["dependencies", "scenarios"].includes(kind) && (
            <fieldset>
              <legend>
                {kind === "scenarios"
                  ? "Apply constraints"
                  : "Constraint members"}
              </legend>
              {(kind === "scenarios" ? w?.dependencies : w?.claims)?.map(
                (x) => (
                  <label className="check" key={x.id}>
                    <input
                      type="checkbox"
                      checked={members.includes(x.id)}
                      onChange={(e) =>
                        setMembers(
                          e.target.checked
                            ? [...members, x.id]
                            : members.filter((id) => id !== x.id),
                        )
                      }
                    />
                    {x.label} · {x.verification}
                  </label>
                ),
              )}
            </fieldset>
          )}
          {["claims", "instruments", "dependencies"].includes(kind) && (
            <fieldset>
              <legend>Supporting evidence</legend>
              <div className="form-grid">
                <label>
                  Source document
                  <select
                    value={docId}
                    onChange={(e) => {
                      setDocId(e.target.value);
                      setPage(1);
                      setSelection(null);
                    }}
                  >
                    <option value="">Choose document</option>
                    {docs.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} v{x.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Source page
                  <select
                    value={page}
                    onChange={(e) => {
                      setPage(Number(e.target.value));
                      setSelection(null);
                    }}
                  >
                    {d?.pages.map((_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                {kind === "instruments" && (
                  <label>
                    Evidence purpose
                    <select
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      <option value="evidence">Face amount / identity</option>
                      <option value="basis_evidence">
                        Claim-limited draw basis
                      </option>
                      <option value="release_evidence">
                        Instrument release
                      </option>
                    </select>
                  </label>
                )}
              </div>
              <label>
                Select the exact supporting passage
                <textarea
                  aria-label="Select the exact supporting passage"
                  className="source-selection"
                  value={text}
                  readOnly
                  onSelect={(e) => {
                    const el = e.currentTarget;
                    setSelection({
                      start: Array.from(text.slice(0, el.selectionStart))
                        .length,
                      end: Array.from(text.slice(0, el.selectionEnd)).length,
                    });
                  }}
                />
              </label>
              <button
                className="secondary"
                type="button"
                disabled={!d || !selection || selection.start === selection.end}
                onClick={() => {
                  if (d && selection) {
                    setEvidence({
                      ...evidence,
                      [purpose]: [
                        ...evidence[purpose],
                        {
                          document_id: d.id,
                          page,
                          ...selection,
                          quote: Array.from(text)
                            .slice(selection.start, selection.end)
                            .join(""),
                        },
                      ],
                    });
                    setSelection(null);
                  }
                }}
              >
                Attach selected passage
              </button>
              <label>
                Or paste an exact quotation
                <textarea
                  aria-label="Or paste an exact quotation"
                  value={exactQuote}
                  onChange={(e) => setExactQuote(e.target.value)}
                />
              </label>
              <button
                className="secondary"
                type="button"
                disabled={!d || !exactQuote.trim()}
                onClick={() => {
                  const start = text.indexOf(exactQuote);
                  if (start < 0) {
                    setError("The quotation is not present on this page.");
                    return;
                  }
                  if (text.indexOf(exactQuote, start + 1) >= 0) {
                    setError(
                      "This passage occurs more than once. Select the intended occurrence in the source text.",
                    );
                    return;
                  }
                  const offset = Array.from(text.slice(0, start)).length;
                  setEvidence({
                    ...evidence,
                    [purpose]: [
                      ...evidence[purpose],
                      {
                        document_id: d!.id,
                        page,
                        start: offset,
                        end: offset + Array.from(exactQuote).length,
                        quote: exactQuote,
                      },
                    ],
                  });
                  setExactQuote("");
                  setError("");
                }}
              >
                Attach exact quotation
              </button>
              {Object.entries(evidence).map(([role, spans]) =>
                spans.map((e, i) => (
                  <blockquote key={role + i}>
                    <small>
                      {role.replace("_", " ")} · page {e.page}
                    </small>
                    {e.quote}
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        setEvidence({
                          ...evidence,
                          [role]: spans.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove passage
                    </button>
                  </blockquote>
                )),
              )}
              {!docs.length && <p>Upload a source document first.</p>}
            </fieldset>
          )}
          <div className="actions">
            <button disabled={busy}>Save {titles[kind].toLowerCase()}</button>
            <button className="secondary" type="button" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
