"use client";
import { useEffect, useRef, useState } from "react";

export type Proposal = {
  id: string; document_id: string; disposition: string; record_type: "instrument" | "claim";
  label: string; amount_cents: number | null; currency: string | null; beneficiary: string | null;
  kind: string; quote: string; evidence: { document_id: string; page: number; start: number; end: number; quote: string }[];
  source_page: number; validation_issues: string[];
};
export type ExtractionJob = {
  id: string; document_id: string; status: string; completed_chunks: number; total_chunks: number;
  model: string; model_digest: string; error?: string; abandoned: boolean; elapsed_seconds?: number;
};
type Readiness = { ready: boolean; message: string; model: string; digest: string | null; experimental: boolean };
type Props = {
  root: string; documentId: string; disabled: boolean; jobs: ExtractionJob[]; proposals: Proposal[];
  api: (path: string, body?: unknown, method?: string) => Promise<any>;
  perform: (fn: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>;
  edit: (p: Proposal) => void; showSource: (p: Proposal) => void;
};
export default function ExtractionPanel({ root, documentId, disabled, jobs, proposals, api, perform, refresh, edit, showSource }: Props) {
  const [ready, setReady] = useState<Readiness | null>(null);
  const [statusError, setStatusError] = useState("");
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);
  useEffect(() => {
    let cancelled = false;
    apiRef.current("extraction/status").then((s: Readiness) => { if (!cancelled) setReady(s); })
      .catch((e: Error) => { if (!cancelled) setStatusError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const attempts = jobs.filter((j) => j.document_id === documentId);
  const pending = proposals.filter((p) => p.document_id === documentId && p.disposition === "PENDING")
    .sort((a, b) => a.record_type === b.record_type ? 0 : a.record_type === "instrument" ? -1 : 1);
  const active = attempts.some((j) => ["QUEUED", "RUNNING"].includes(j.status));
  async function updateStatus() {
    setStatusError("");
    try { setReady(await api("extraction/status")); }
    catch (e) { setStatusError(e instanceof Error ? e.message : String(e)); }
  }
  return <section className="extraction-panel" aria-label="Local AI extraction">
    <div className="panel-heading"><h3>Local AI extraction</h3><span className="badge">EXPERIMENTAL · HUMAN REVIEW</span></div>
    <p>{ready?.message || statusError || "Checking local model readiness…"}</p>
    {ready?.digest && <p className="muted">{ready.model} · digest {ready.digest.slice(0, 12)}</p>}
    <div className="actions">
      <button disabled={disabled || !ready?.ready || active || pending.length > 0}
        onClick={() => void perform(async () => { await api(root + "/documents/" + documentId + "/extractions", {}); await refresh(); })}>
        {active ? "Extraction in progress" : attempts.length ? "Retry local extraction" : "Extract with local AI"}
      </button>
      <button className="secondary" onClick={() => void updateStatus()}>Check model readiness</button>
    </div>
    <p className="muted">Proposals never approve inputs or restrict draw rights. Import instruments first, then obligations. Finish document review separately.</p>
    <div aria-live="polite">
      {attempts.map((j) => <div className="extraction-attempt" key={j.id}>
        <strong>{j.status}{j.abandoned ? " · ABANDONED" : ""}</strong> · {j.completed_chunks}/{j.total_chunks} chunks
        {j.elapsed_seconds !== undefined && <> · {j.elapsed_seconds.toFixed(1)}s</>}
        {j.error && <p className="issue">{j.error}</p>}
        {["FAILED", "INTERRUPTED"].includes(j.status) && !j.abandoned && <form onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget);
          void perform(async () => { await api(root + "/extractions/" + j.id + "/abandon", { reason: f.get("reason") }); await refresh(); });
        }}><label>Reason to continue manually<input name="reason" required minLength={3} /></label><button className="secondary" disabled={disabled}>Abandon this attempt</button></form>}
      </div>)}
    </div>
    <p>{pending.length} proposals awaiting disposition</p>
    {pending.map((p) => <article className="proposal-card" key={p.id}>
      <div className="panel-heading"><h4>{p.label}</h4><span className="badge">PROPOSED {p.record_type.toUpperCase()}</span></div>
      <p>{p.amount_cents === null ? "Amount unresolved" : `${p.currency || "Unknown currency"} ${(p.amount_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</p>
      <pre className="proposal-quote"><mark>{p.quote}</mark></pre>
      {p.validation_issues.map((issue, i) => <p className="issue" key={i}>{issue}</p>)}
      <div className="actions">
        <button className="secondary" onClick={() => showSource(p)}>Show source passage</button>
        <button disabled={disabled || (p.currency !== null && p.currency !== "USD")} onClick={() => edit(p)}>Edit and import {p.record_type}</button>
      </div>
      <form onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        void perform(async () => { await api(root + "/proposals/" + p.id + "/resolve", { action: "DISMISS", reason: f.get("reason") }); await refresh(); });
      }}><label>Dismissal reason<input name="reason" required minLength={3} placeholder="Explain why this proposal is excluded" /></label><button disabled={disabled} className="secondary">Dismiss proposal</button></form>
    </article>)}
  </section>;
}
