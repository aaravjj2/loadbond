"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FileText,
  Table2,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  ArrowUpRight,
  Plus,
  ChevronDown,
  Settings,
  Menu,
  X,
  LogOut,
  Search,
  CheckCircle2,
  Layers3,
  Upload,
  Download,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { useWorkspace } from "./use-workspace";
import {
  type Item,
  type Kind,
  type View,
  type Workspace,
  type Evidence,
  label,
  money,
} from "./types";
import { Badge, Overlay } from "./ui";
import Assessment from "./assessment";
import Documents from "./documents";
import Register from "./register";
import Scenarios from "./scenarios";
import History from "./history";
import EvidenceDrawer from "./evidence-drawer";
import RecordEditor from "./record-editor";
import "./experience.css";
const navigation = [
  { id: "assessment" as View, title: "Assessment", icon: Activity },
  { id: "review" as View, title: "Documents & Review", icon: FileText },
  { id: "register" as View, title: "Register", icon: Table2 },
  { id: "scenarios" as View, title: "Scenarios", icon: GitBranch },
  { id: "evidence" as View, title: "Evidence", icon: ShieldCheck },
];
export default function Experience() {
  const s = useWorkspace();
  const { w, api, busy, act, refresh } = s;
  const [editor, setEditor] = useState<{ kind: Kind; item?: Item } | null>(
    null,
  );
  const [review, setReview] = useState<{ table: string; item: Item } | null>(
    null,
  );
  const [settings, setSettings] = useState(false);
  const [drawer, setDrawer] = useState<{
    item: Item;
    table: string;
    context: Workspace;
    historical: boolean;
  } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [run, setRun] = useState<Item | null>(null);
  const [runId, setRunId] = useState("");
  const [scenario, setScenario] = useState("");
  const [model, setModel] = useState<any>(null);
  const [guided, setGuided] = useState(false);
  const [docLink, setDocLink] = useState<{
    id: string;
    page: number;
    span?: Evidence;
  } | null>(null);
  const [entry, setEntry] = useState("local-demo");
  const root = "projects/" + w?.project.id;
  const pid = w?.project.id || "";
  useEffect(() => {
    setRun(null);
    setRunId("");
    setDocLink(null);
    const q = new URLSearchParams(window.location.search);
    const documentId = q.get("document");
    if (documentId) setDocLink({ id: documentId, page: 1 });
  }, [pid]);
  useEffect(() => {
    if (!w) return;
    setScenario((prev) =>
      w.scenarios.some((x) => x.id === prev) ? prev : w.scenarios[0]?.id || "",
    );
    const requested = new URLSearchParams(window.location.search).get("run");
    const id = w.runs.some((r) => r.id === runId)
      ? runId
      : w.runs.some((r) => r.id === requested)
        ? requested
        : w.runs.at(-1)?.id;
    if (!id) {
      setRun(null);
      return;
    }
    let stop = false;
    api(root + "/runs/" + id)
      .then((next) => {
        if (!stop) setRun(next);
      })
      .catch((e) => {
        if (!stop) s.setError(e.message);
      });
    return () => {
      stop = true;
    };
  }, [pid, w?.runs.length, runId, api]);
  useEffect(() => {
    if (!s.token) return;
    let stop = false;
    api("extraction/status")
      .then((next) => {
        if (!stop) setModel(next);
      })
      .catch(() => {
        if (!stop) setModel({ ready: false });
      });
    return () => {
      stop = true;
    };
  }, [s.token, api]);
  const editorOpen = !!editor;
  useEffect(() => {
    if (!editorOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>(".lb-app .editor");
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ) || [],
      );
    controls()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setEditor(null);
      if (e.key === "Tab") {
        const nodes = controls();
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [editorOpen]);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const closeSettings = useCallback(() => setSettings(false), []);
  const closeReview = useCallback(() => setReview(null), []);
  function go(view: View) {
    s.navigate(view);
    setMobile(false);
  }
  function edit(kind: Kind, item?: Item) {
    s.setError("");
    setEditor({ kind, item });
  }
  function reviewRecord(table: string, item: Item) {
    if (!s.reviewer) {
      setSettings(true);
      s.setNotice("Save your reviewer name before recording a decision.");
      return;
    }
    s.setError("");
    setReview({ table, item });
  }
  function inspect(item: Item, table: string, context?: Workspace) {
    if (!w) return;
    const source =
      context ??
      ((s.view === "assessment" || s.view === "evidence") && run?.snapshot
        ? ({
            ...w,
            ...run!.snapshot,
            reviews: w.reviews.filter((r) => r.at <= run!.at),
          } as Workspace)
        : w);
    setDrawer({
      item,
      table,
      context: source,
      historical:
        !!run &&
        (s.view === "assessment" || s.view === "evidence") &&
        run.revision !== w.project.revision,
    });
  }
  function openDocument(id: string, page: number, span?: Evidence) {
    setDrawer(null);
    setDocLink({ id, page, span });
    s.navigate("review", pid, { document: id });
  }
  async function compute(id = scenario) {
    await act(async () => {
      const next = await api(root + "/runs", { scenario_id: id });
      setRunId(next.id);
      setRun(next);
      await refresh();
      s.setNotice(
        next.result.status === "COMPLETE"
          ? "Assessment saved with its original inputs and evidence."
          : "Assessment saved as incomplete. Resolve the listed inputs.",
      );
    });
  }
  async function sample() {
    await act(async () => {
      const project = await api("sample", {});
      await s.open(project.id, "assessment");
      const workspace = await api("projects/" + project.id);
      const next = await api("projects/" + project.id + "/runs", {
        scenario_id: workspace.scenarios[0].id,
      });
      await refresh(project.id);
      setRun(next);
      setRunId(next.id);
      setGuided(true);
      s.setNotice(
        "Pre-reviewed synthetic fixture loaded. These reviews are demonstration assumptions.",
      );
    });
  }
  async function download(format: string) {
    if (!run) return;
    await act(async () => {
      const response = await fetch(
        "/api/v2/" + root + "/runs/" + run.id + "/export?format=" + format,
        { headers: { Authorization: "Bearer " + s.token } },
      );
      if (!response.ok) throw new Error("Evidence export failed.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadbond-evidence." + format;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  async function saveRecord(body: unknown) {
    await act(async () => {
      if (!editor) return;
      if (editor.kind === "project") {
        const p = await api(
          "projects" + (editor.item ? "/" + editor.item.id : ""),
          body,
          editor.item ? "PATCH" : "POST",
        );
        await s.open(p.id);
      } else {
        await api(
          root + "/" + editor.kind + (editor.item ? "/" + editor.item.id : ""),
          body,
          editor.item ? "PATCH" : "POST",
        );
        await refresh();
      }
      setEditor(null);
      s.setNotice("Input saved. Material record edits require a new review.");
    });
  }
  const reviewCount = w
    ? [...w.instruments, ...w.claims].filter(
        (i) => i.verification === "UNVERIFIED",
      ).length + w.proposals.filter((p) => p.disposition === "PENDING").length
    : 0;
  return (
    <div className="lb-app">
      <a className="lb-skip" href="#lb-main">
        Skip to main content
      </a>
      <aside className={"lb-sidebar " + (mobile ? "open" : "")}>
        <button
          className="lb-brand"
          onClick={() => {
            s.allProjects();
            setMobile(false);
          }}
          aria-label="LoadBond projects"
        >
          <span className="lb-brand-mark">
            <i />
            <i />
            <i />
          </span>
          LoadBond
          <span className="lb-brand-dot" />
        </button>
        <div className="lb-workspace-label">
          WORKSPACE<Badge>LOCAL</Badge>
        </div>
        <button
          className="lb-project-switch"
          onClick={() => {
            s.allProjects();
            setMobile(false);
          }}
        >
          <span className="lb-project-avatar">
            {w ? String(w.project.name).slice(0, 1) : "L"}
          </span>
          <div>
            <strong>{w?.project.name || "Your projects"}</strong>
            <small>
              {w
                ? `${w.sites.length} sites · USD`
                : "Evidence-first assessments"}
            </small>
          </div>
          <ChevronDown size={15} />
        </button>
        <div className="lb-nav-label">PROJECT</div>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              disabled={!w}
              className={s.view === n.id && w ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              <span>{n.title}</span>
              {n.id === "review" && reviewCount > 0 && (
                <span className="lb-nav-count">{reviewCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="lb-sidebar-bottom">
          <div className="lb-local-note">
            <span
              className={"lb-status-dot " + (model?.ready ? "online" : "")}
            />
            <span>Local AI {model?.ready ? "available" : "offline"}</span>
          </div>
          <Badge status="EXPERIMENTAL" />
          <p>
            Public and synthetic evidence only. Model outputs require review.
          </p>
          <button onClick={() => setSettings(true)}>
            <Settings size={17} />
            Workspace settings
          </button>
          <a href="/legacy">
            <ExternalLink size={14} />
            Historical interface
          </a>
          {s.token && (
            <button onClick={s.logout}>
              <LogOut size={15} />
              Close workspace
            </button>
          )}
        </div>
      </aside>
      {mobile && (
        <button
          className="lb-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="lb-main-shell">
        <header className="lb-header">
          <div className="lb-header-context">
            <button
              className="lb-icon-button lb-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile((v) => !v)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{w?.project.name || "Projects"}</strong>
            {w && (
              <Badge status={w.project.synthetic ? "SYNTHETIC" : "PUBLIC"} />
            )}
          </div>
          <div className="lb-header-actions">
            {w && (
              <select
                className="lb-project-select"
                aria-label="Switch project"
                value={pid}
                onChange={(e) => void act(() => s.open(e.target.value))}
              >
                {s.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="lb-reviewer-button"
              onClick={() => setSettings(true)}
            >
              <span>
                {s.reviewer
                  ? s.reviewer
                      .split(" ")
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")
                  : "?"}
              </span>
              <strong>{s.reviewer || "Set reviewer"}</strong>
            </button>
            {run && (
              <button
                className="lb-secondary lb-export-top"
                onClick={() => {
                  setRunId(run.id);
                  s.navigate("evidence", pid, { run: run.id });
                }}
              >
                <Download size={15} />
                Evidence
              </button>
            )}
          </div>
        </header>
        <main id="lb-main" className="lb-main" tabIndex={-1}>
          {s.error && (
            <div className="lb-error" role="alert">
              <strong>Action needs attention</strong>
              <span>{s.error}</span>
              <button
                className="lb-icon-button"
                aria-label="Dismiss error"
                onClick={() => s.setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {s.notice && (
            <div className="lb-toast" role="status">
              <CheckCircle2 size={16} />
              <span>{s.notice}</span>
              <button
                className="lb-icon-button"
                aria-label="Dismiss notification"
                onClick={() => s.setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {s.loading ? (
            <div className="lb-loading" role="status">
              <div className="lb-loading-line" />
              <h2>Opening your workspace…</h2>
              <p>Loading documents and reviewed inputs.</p>
            </div>
          ) : !w ? (
            <div className="lb-project-home">
              <div className="lb-home-intro">
                <div className="lb-eyebrow">
                  CONTRACTS → EVIDENCE → EXPOSURE
                </div>
                <h1>
                  Know what your
                  <br />
                  security actually secures.
                </h1>
                <p>
                  Turn contractual obligations into a reviewed, reproducible
                  picture of instrument exposure.
                </p>
                <div className="lb-home-actions">
                  {!s.token ? (
                    <button onClick={() => s.connect(entry)}>
                      Open local workspace
                      <ArrowRight size={17} />
                    </button>
                  ) : (
                    <>
                      <button disabled={busy} onClick={() => edit("project")}>
                        <Plus size={17} />
                        Create project
                      </button>
                      <button
                        className="lb-secondary"
                        disabled={busy}
                        onClick={() => void sample()}
                      >
                        Explore synthetic demo
                        <ArrowUpRight size={16} />
                      </button>
                    </>
                  )}
                </div>
                <div className="lb-home-proof">
                  <span>
                    <FileText size={15} />
                    Exact source references
                  </span>
                  <span>
                    <ShieldCheck size={15} />
                    Human review
                  </span>
                  <span>
                    <GitBranch size={15} />
                    Reproducible results
                  </span>
                </div>
                {!s.token && (
                  <details className="lb-connection">
                    <summary>Use a different workspace token</summary>
                    <label>
                      Workspace token
                      <input
                        type="password"
                        value={entry}
                        onChange={(e) => setEntry(e.target.value)}
                      />
                    </label>
                  </details>
                )}
              </div>
              <div className="lb-story-board">
                <div className="lb-story-top">
                  <span className="lb-story-label">HOW LOADBOND WORKS</span>
                  <Badge>Synthetic illustration</Badge>
                </div>
                <div className="lb-story-step">
                  <div className="lb-story-number">01</div>
                  <div>
                    <span>THE SOURCE</span>
                    <strong>Start with the clause.</strong>
                    <blockquote>
                      “The developer owes USD 90,000 for completed engineering.”
                    </blockquote>
                  </div>
                </div>
                <div className="lb-story-connector" />
                <div className="lb-story-step">
                  <div className="lb-story-number">02</div>
                  <div>
                    <span>THE REVIEW</span>
                    <strong>Confirm the model input.</strong>
                    <div className="lb-story-input">
                      <FileText size={19} />
                      <div>
                        Engineering obligation
                        <small>USD 90,000 · exact quotation</small>
                      </div>
                      <ShieldCheck size={18} />
                    </div>
                  </div>
                </div>
                <div className="lb-story-connector" />
                <div className="lb-story-step">
                  <div className="lb-story-number">03</div>
                  <div>
                    <span>THE ASSESSMENT</span>
                    <strong>Trace the instrument exposure.</strong>
                    <p>
                      Reviewed obligations and instrument rights remain
                      distinct. Every saved result retains its evidence.
                    </p>
                  </div>
                </div>
              </div>
              {s.token && (
                <section className="lb-project-list">
                  <div className="lb-section-heading">
                    <div>
                      <h2>Your projects</h2>
                      <p>
                        {s.projects.length
                          ? "Pick up an existing assessment or start with new evidence."
                          : "New projects start empty. The synthetic example is optional."}
                      </p>
                    </div>
                    <button
                      className="lb-link"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const p = await api("import-legacy", {});
                          await s.open(p.id);
                        })
                      }
                    >
                      Import historical workspace
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="lb-project-cards">
                    {s.projects.map((p) => (
                      <button
                        key={p.id}
                        className="lb-project-card"
                        onClick={() => void act(() => s.open(p.id))}
                      >
                        <div className="lb-inline">
                          <span className="lb-project-card-icon">
                            <Layers3 size={23} />
                          </span>
                          <Badge>
                            {p.synthetic ? "Synthetic" : "Public evidence"}
                          </Badge>
                        </div>
                        <h3>{p.name}</h3>
                        <p>
                          {p.mw
                            ? `${p.mw} MW economic project`
                            : "Project evidence workspace"}
                        </p>
                        <div>
                          Open assessment
                          <ArrowUpRight size={16} />
                        </div>
                      </button>
                    ))}
                    {!s.projects.length && (
                      <button
                        className="lb-project-card new"
                        onClick={() => edit("project")}
                      >
                        <Plus size={26} />
                        <h3>Create your first project</h3>
                        <p>Upload an agreement and build from its evidence.</p>
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <>
              {w.project.archived && (
                <div className="lb-warning">
                  Archived project. Reopen it in project settings before editing
                  inputs.
                </div>
              )}
              {s.view === "assessment" && (
                <Assessment
                  w={w}
                  run={run}
                  busy={busy}
                  scenario={scenario}
                  setScenario={setScenario}
                  compute={() => void compute()}
                  inspect={inspect}
                  review={() => go("review")}
                  scenarios={() => go("scenarios")}
                  guided={guided}
                  dismissGuide={() => setGuided(false)}
                />
              )}
              {s.view === "review" && (
                <Documents
                  key={pid}
                  w={w}
                  api={api}
                  busy={busy}
                  act={act}
                  refresh={refresh}
                  reviewer={s.reviewer}
                  askReviewer={() => setSettings(true)}
                  add={(kind) => edit(kind)}
                  initialDoc={docLink?.id}
                  initialPage={docLink?.page}
                  initialSpan={docLink?.span}
                  routeDoc={(id) => s.navigate("review", pid, { document: id })}
                />
              )}
              {s.view === "register" && (
                <Register
                  w={w}
                  edit={edit}
                  inspect={inspect}
                  review={reviewRecord}
                />
              )}
              {s.view === "scenarios" && (
                <Scenarios
                  w={w}
                  api={api}
                  act={act}
                  busy={busy}
                  edit={edit}
                  review={reviewRecord}
                  inspect={inspect}
                  save={(id) => void compute(id)}
                />
              )}
              {s.view === "evidence" && (
                <History
                  w={w}
                  run={run}
                  choose={(id) => {
                    setRunId(id);
                    s.navigate("evidence", pid, { run: id });
                  }}
                  api={api}
                  act={act}
                  busy={busy}
                  download={(format) => void download(format)}
                  inspect={inspect}
                />
              )}
            </>
          )}
        </main>
        <footer className="lb-app-footer">
          <span>
            <span className="lb-mini-mark" />
            LoadBond
          </span>
          <span>Evidence-backed modeling · Experimental local extraction</span>
          <a href="/legacy">Historical v1</a>
        </footer>
      </div>
      {editor && (
        <RecordEditor
          kind={editor.kind}
          item={editor.item}
          w={w}
          initialDoc={
            docLink?.id || w?.documents.find((d) => !d.superseded)?.id
          }
          busy={busy}
          serverError={s.error}
          close={() => setEditor(null)}
          save={saveRecord}
        />
      )}
      {drawer && (
        <EvidenceDrawer
          item={drawer.item}
          table={drawer.table}
          w={drawer.context}
          close={closeDrawer}
          openDocument={openDocument}
          historical={drawer.historical}
          edit={
            drawer.table !== "sites" || !drawer.historical
              ? () => {
                  const current = w?.[drawer.table as "instruments"].find(
                    (i) => i.id === drawer.item.id,
                  );
                  setDrawer(null);
                  if (current) edit(drawer.table as Kind, current);
                }
              : undefined
          }
        />
      )}
      {settings && (
        <Overlay title="Workspace settings" close={closeSettings}>
          {s.error && <p className="lb-error" role="alert">{s.error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api("profile", { name: f.get("name") });
                await refresh();
                setSettings(false);
                s.setNotice("Reviewer identity saved for local decisions.");
              });
            }}
          >
            <label>
              Reviewer name
              <input
                name="name"
                defaultValue={s.reviewer}
                required
                minLength={2}
                placeholder="Your name"
              />
            </label>
            <p className="lb-muted">
              This identifies your local review decisions. It does not establish
              professional authority.
            </p>
            <button disabled={busy || !s.token}>Save reviewer</button>
          </form>
          {w && (
            <div className="lb-settings-project">
              <h3>Project</h3>
              <p>{w.project.name}</p>
              <button
                className="lb-secondary"
                onClick={() => {
                  setSettings(false);
                  edit("project", w.project);
                }}
              >
                Edit project settings
              </button>
            </div>
          )}
          <div className="lb-note">
            <strong>Local demonstration workspace</strong>
            <p>
              Use public or synthetic documents. Local workspace tokens are not
              customer authentication. Extraction remains experimental after its
              precision gate failed.
            </p>
          </div>
        </Overlay>
      )}
      {review && (
        <Overlay title={"Review " + label(review.item)} close={closeReview}>
          {s.error && <p className="lb-error" role="alert">{s.error}</p>}
          <p className="lb-muted">
            {review.table === "dependencies"
              ? "This is a separate review of a modeling constraint. A simulated demonstration decision is not counsel approval."
              : "Accepting this model input records your decision; it is not a legal opinion."}
          </p>
          <div className="lb-review-summary">
            <Badge status={review.item.verification} />
            <strong>
              {money(review.item.face_cents ?? review.item.amount_cents)}
            </strong>
            {review.item.evidence?.map((e, i) => (
              <blockquote key={i}>{e.quote}</blockquote>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api(
                  root + "/" + review.table + "/" + review.item.id + "/review",
                  { decision: f.get("decision"), reason: f.get("reason") },
                );
                await refresh();
                setReview(null);
                s.setNotice("Separate review decision recorded.");
              });
            }}
          >
            <label>
              Decision
              <select name="decision">
                <option value="VERIFIED">Accept reviewed model input</option>
                <option value="UNVERIFIED">Return for review</option>
                <option value="REJECTED">Exclude input</option>
              </select>
            </label>
            <label>
              Review reason
              <textarea name="reason" minLength={3} required />
            </label>
            <button disabled={busy}>Save review decision</button>
          </form>
        </Overlay>
      )}
    </div>
  );
}
