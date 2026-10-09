"use client";
import { useEffect, useState } from "react";
import {
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  Plus,
  RefreshCw,
  GripVertical,
} from "lucide-react";
import {
  type Workspace,
  type Item,
  type Doc,
  type Evidence,
  type Api,
  label,
  money,
  cents,
} from "./types";
import { Badge, Empty } from "./ui";
type Props = {
  w: Workspace;
  api: Api;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
  refresh: () => Promise<void>;
  reviewer: string;
  askReviewer: () => void;
  add: (kind: "instruments" | "claims") => void;
  initialDoc?: string;
  initialPage?: number;
  initialSpan?: Evidence;
  routeDoc: (id: string) => void;
};
export default function Documents({
  w,
  api,
  busy,
  act,
  refresh,
  reviewer,
  askReviewer,
  add,
  initialDoc,
  initialPage,
  initialSpan,
  routeDoc,
}: Props) {
  const [docId, setDocId] = useState(
    initialDoc || w.documents.find((d) => !d.superseded)?.id || "",
  );
  const [page, setPage] = useState(initialPage || 1);
  const [selected, setSelected] = useState<{
    id: string;
    type: "proposal" | "record";
    table: "claims" | "instruments";
  } | null>(null);
  const [ready, setReady] = useState<any>(null);
  const [replacement, setReplacement] = useState("");
  const [mobilePane, setMobilePane] = useState("source");
  const [layout, setLayout] = useState(false);
  const [listWidth, setListWidth] = useState(174);
  const [queueWidth, setQueueWidth] = useState(350);
  const [selection, setSelection] = useState<Evidence | null>(null);
  const [selecting, setSelecting] = useState(false);
  const root = "projects/" + w.project.id;
  const doc =
    w.documents.find((d) => d.id === docId) ||
    w.documents.find((d) => !d.superseded) ||
    w.documents[0];
  const proposals = w.proposals.filter(
    (p) => p.document_id === doc?.id && p.disposition === "PENDING",
  );
  const records: (Item & { table: "instruments" | "claims" })[] = [
    ...w.instruments.map((i) => ({ ...i, table: "instruments" as const })),
    ...w.claims.map((i) => ({ ...i, table: "claims" as const })),
  ].filter(
    (i) =>
      i.verification === "UNVERIFIED" &&
      i.evidence?.some(
        (e) =>
          e.document_id === doc?.id ||
          (doc &&
            w.documents.find((d) => d.id === e.document_id)?.agreement_id ===
              doc.agreement_id),
      ),
  );
  const proposal =
    selected?.type === "proposal"
      ? proposals.find((p) => p.id === selected.id)
      : null;
  const record =
    selected?.type === "record"
      ? records.find((p) => p.id === selected.id)
      : null;
  const focused = proposal || record;
  const attempts = w.extractions.filter((j) => j.document_id === doc?.id);
  const active = attempts.some((j) => ["RUNNING", "QUEUED"].includes(j.status));
  const latest = attempts.at(-1);
  useEffect(() => {
    let stop = false;
    api("extraction/status")
      .then((r) => {
        if (!stop) setReady(r);
      })
      .catch((e) => {
        if (!stop) setReady({ ready: false, message: e.message });
      });
    return () => {
      stop = true;
    };
  }, [api]);
  useEffect(() => {
    if (initialDoc) {
      setDocId(initialDoc);
      setPage(initialPage || 1);
      setSelected(null);
    }
  }, [initialDoc, initialPage]);
  function chooseDoc(id: string) {
    setDocId(id);
    setPage(1);
    setSelected(null);
    setSelection(null);
    routeDoc(id);
  }
  function choose(
    item: Item,
    type: "proposal" | "record",
    table: "claims" | "instruments",
  ) {
    setSelected({ id: item.id, type, table });
    const e = item.evidence?.find((e) => e.document_id === doc?.id);
    setPage(e?.page || item.source_page || 1);
    setSelection(null);
    setMobilePane("queue");
  }
  function nextItem() {
    const options = [
      ...proposals.map((p) => ({
        p,
        type: "proposal" as const,
        table: (p.record_type === "instrument" ? "instruments" : "claims") as
          "instruments" | "claims",
      })),
      ...records.map((p) => ({ p, type: "record" as const, table: p.table })),
    ];
    const index = options.findIndex((x) => x.p.id === selected?.id);
    const next = options[(index + 1) % options.length];
    if (next) choose(next.p, next.type, next.table);
  }
  const quoteSpan =
    selection ||
    focused?.evidence?.find(
      (e: Evidence) => e.page === page && e.document_id === doc?.id,
    ) ||
    (initialSpan &&
    doc &&
    initialSpan.document_id === doc.id &&
    initialSpan.page === page
      ? initialSpan
      : null);
  const text = doc?.pages[page - 1] || "";
  const chars = Array.from(text);
  const blocked = busy || !!doc?.superseded || w.project.archived;
  function resize(which: "list" | "queue", event: React.PointerEvent) {
    event.preventDefault();
    const start = event.clientX;
    const width = which === "list" ? listWidth : queueWidth;
    function move(e: PointerEvent) {
      const value = width + (e.clientX - start) * (which === "list" ? 1 : -1);
      if (which === "list") setListWidth(Math.min(240, Math.max(130, value)));
      else setQueueWidth(Math.min(470, Math.max(300, value)));
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  }
  return (
    <div className="lb-documents">
      <div className="lb-page-heading">
        <div>
          <div className="lb-eyebrow">DOCUMENTS & REVIEW</div>
          <h1>Turn clauses into reviewed inputs.</h1>
          <p>Keep the document and every decision in view.</p>
        </div>
        <div className="lb-heading-actions">
          <button
            className="lb-secondary"
            onClick={() => setLayout((v) => !v)}
            aria-expanded={layout}
          >
            <SlidersHorizontal size={16} />
            Layout
          </button>
          <label className="lb-upload">
            <Upload size={16} />
            Upload agreement
            <input
              type="file"
              accept=".txt,.md,.pdf"
              disabled={busy || w.project.archived}
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
                    chooseDoc(d.id);
                    setReplacement("");
                  });
              }}
            />
          </label>
        </div>
      </div>
      <div className="lb-doc-toolbar">
        <span>
          <FileText size={15} />
          {w.documents.filter((d) => !d.superseded).length} current documents
        </span>
        <span className="lb-muted">
          Text PDF, TXT, MD · 5 MB · Public or synthetic evidence
        </span>
        <label className="lb-amend">
          Upload replaces
          <select
            aria-label="Document being amended"
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
      </div>
      {layout && (
        <div className="lb-layout-controls">
          <label>
            Document list width
            <input
              type="range"
              min="130"
              max="240"
              value={listWidth}
              onChange={(e) => setListWidth(+e.target.value)}
            />
          </label>
          <label>
            Review queue width
            <input
              type="range"
              min="300"
              max="470"
              value={queueWidth}
              onChange={(e) => setQueueWidth(+e.target.value)}
            />
          </label>
          <button
            className="lb-link"
            onClick={() => {
              setListWidth(174);
              setQueueWidth(350);
            }}
          >
            Reset layout
          </button>
        </div>
      )}
      {!doc ? (
        <div className="lb-panel">
          <Empty title="Your first agreement starts the assessment">
            Upload a supported document to extract proposals or record
            source-backed inputs manually.
          </Empty>
        </div>
      ) : (
        <>
          <div className="lb-mobile-tabs">
            {["documents", "source", "queue"].map((id) => (
              <button
                className={mobilePane === id ? "active" : ""}
                key={id}
                onClick={() => setMobilePane(id)}
              >
                {id === "queue"
                  ? "Review queue"
                  : id === "source"
                    ? "Source reader"
                    : "Documents"}
              </button>
            ))}
          </div>
          <div
            className={"lb-review-layout pane-" + mobilePane}
            style={
              {
                "--list-width": listWidth + "px",
                "--queue-width": queueWidth + "px",
              } as React.CSSProperties
            }
          >
            <aside className="lb-doc-list">
              <div className="lb-pane-header">
                <strong>Documents</strong>
                <span>{w.documents.length}</span>
              </div>
              {w.documents.map((d) => (
                <button
                  className={
                    "lb-doc-row " + (doc.id === d.id ? "selected" : "")
                  }
                  key={d.id}
                  onClick={() => chooseDoc(d.id)}
                >
                  <FileText size={18} />
                  <div>
                    <strong title={d.name}>{d.name}</strong>
                    <small>Version {d.version}</small>
                    <Badge
                      status={d.superseded ? "SUPERSEDED" : d.processing}
                    />
                  </div>
                </button>
              ))}
            </aside>
            <div
              className="lb-resizer"
              role="separator"
              tabIndex={0}
              aria-label="Resize document list"
              aria-orientation="vertical"
              aria-valuenow={Math.round(listWidth)}
              aria-valuemin={130}
              aria-valuemax={240}
              onPointerDown={(e) => resize("list", e)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setListWidth((v) =>
                    Math.min(
                      240,
                      Math.max(130, v + (e.key === "ArrowRight" ? 10 : -10)),
                    ),
                  );
                }
              }}
            >
              <GripVertical size={10} />
            </div>
            <section className="lb-source-pane">
              <div className="lb-pane-header">
                <div>
                  <strong title={doc.name}>{doc.name}</strong>
                  <small>
                    Version {doc.version} ·{" "}
                    {doc.superseded ? "Superseded evidence" : "Source text"}
                  </small>
                </div>
                <div className="lb-page-control">
                  <button
                    className="lb-icon-button"
                    aria-label="Previous source page"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <label>
                    Page
                    <select
                      aria-label="Source page"
                      value={page}
                      onChange={(e) => {
                        setPage(+e.target.value);
                        setSelection(null);
                      }}
                    >
                      {doc.pages.map((_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>/ {doc.pages.length}</span>
                  <button
                    className="lb-icon-button"
                    aria-label="Next source page"
                    disabled={page >= doc.pages.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              <div className="lb-source-actions">
                <span>
                  {focused
                    ? "Selected record highlighted"
                    : "Select a proposal to locate its source"}
                </span>
                <button
                  className="lb-link"
                  onClick={() => setSelecting((v) => !v)}
                >
                  {selecting ? "Show reading view" : "Select a passage"}
                </button>
              </div>
              <div className="lb-paper">
                {selecting ? (
                  <textarea
                    className="lb-source-select"
                    aria-label="Select supporting passage"
                    value={text}
                    readOnly
                    onSelect={(e) => {
                      const el = e.currentTarget;
                      const start = Array.from(
                        text.slice(0, el.selectionStart),
                      ).length;
                      const end = Array.from(
                        text.slice(0, el.selectionEnd),
                      ).length;
                      if (end > start)
                        setSelection({
                          document_id: doc.id,
                          page,
                          start,
                          end,
                          quote: chars.slice(start, end).join(""),
                        });
                    }}
                  />
                ) : (
                  <div className="lb-source-text">
                    {quoteSpan ? (
                      <>
                        {chars.slice(0, quoteSpan.start).join("")}
                        <mark>
                          {chars.slice(quoteSpan.start, quoteSpan.end).join("")}
                        </mark>
                        {chars.slice(quoteSpan.end).join("")}
                      </>
                    ) : (
                      text
                    )}
                  </div>
                )}
                <div className="lb-paper-footer">
                  {doc.name} · page {page}
                  <span>Exact source text</span>
                </div>
              </div>
              {doc.superseded && (
                <div className="lb-warning">
                  <AlertTriangle size={16} />
                  This version is historical. Record changes against current
                  evidence.
                </div>
              )}
            </section>
            <div
              className="lb-resizer"
              role="separator"
              tabIndex={0}
              aria-label="Resize review queue"
              aria-orientation="vertical"
              aria-valuenow={Math.round(queueWidth)}
              aria-valuemin={300}
              aria-valuemax={470}
              onPointerDown={(e) => resize("queue", e)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setQueueWidth((v) =>
                    Math.min(
                      470,
                      Math.max(300, v + (e.key === "ArrowLeft" ? 10 : -10)),
                    ),
                  );
                }
              }}
            >
              <GripVertical size={10} />
            </div>
            <aside className="lb-review-pane">
              <div className="lb-pane-header">
                <strong>Review queue</strong>
                <Badge>{proposals.length + records.length} pending</Badge>
              </div>
              <div className="lb-extract-box">
                <div className="lb-inline">
                  <span
                    className={
                      "lb-status-dot " + (ready?.ready ? "online" : "")
                    }
                  />
                  <strong>Local AI</strong>
                  <Badge status="EXPERIMENTAL" />
                </div>
                <p>
                  {ready?.ready
                    ? `${ready.model} · runs on this laptop`
                    : ready?.message || "Checking model readiness…"}
                </p>
                <div className="lb-inline">
                  <button
                    disabled={
                      blocked || !ready?.ready || active || proposals.length > 0
                    }
                    onClick={() =>
                      void act(async () => {
                        await api(
                          root + "/documents/" + doc.id + "/extractions",
                          {},
                        );
                        await refresh();
                      })
                    }
                  >
                    {active ? "Extracting…" : "Extract proposals"}
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="lb-icon-button"
                    aria-label="Check local model readiness"
                    onClick={() =>
                      void act(async () =>
                        setReady(await api("extraction/status")),
                      )
                    }
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
                {latest && (
                  <div className="lb-job-progress">
                    <Badge status={latest.status} />
                    <span>
                      {latest.completed_chunks}/{latest.total_chunks} chunks
                      {latest.elapsed_seconds !== undefined
                        ? ` · ${latest.elapsed_seconds.toFixed(1)}s`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
              {attempts
                .filter(
                  (j) =>
                    ["FAILED", "INTERRUPTED"].includes(j.status) &&
                    !j.abandoned,
                )
                .map((j) => (
                  <form
                    className="lb-job-error"
                    key={j.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(async () => {
                        await api(root + "/extractions/" + j.id + "/abandon", {
                          reason: f.get("reason"),
                        });
                        await refresh();
                      });
                    }}
                  >
                    <strong>Extraction needs attention</strong>
                    <p>{j.error}</p>
                    <label>
                      Reason to continue manually
                      <input name="reason" required minLength={3} />
                    </label>
                    <button className="lb-secondary" disabled={blocked}>
                      Abandon this attempt
                    </button>
                  </form>
                ))}
              <div className="lb-queue-heading">
                <span>PROPOSALS & INPUTS</span>
                <button
                  className="lb-link"
                  disabled={!proposals.length && !records.length}
                  onClick={nextItem}
                >
                  Next item
                  <ArrowRight size={13} />
                </button>
              </div>
              <div className="lb-queue-list">
                {[...proposals]
                  .sort((a, b) =>
                    a.record_type === b.record_type
                      ? 0
                      : a.record_type === "instrument"
                        ? -1
                        : 1,
                  )
                  .map((p) => (
                    <button
                      className={
                        "lb-queue-row " +
                        (selected?.id === p.id ? "selected" : "")
                      }
                      key={p.id}
                      onClick={() =>
                        choose(
                          p,
                          "proposal",
                          p.record_type === "instrument"
                            ? "instruments"
                            : "claims",
                        )
                      }
                    >
                      <span className={"lb-record-icon " + p.record_type}>
                        {p.record_type === "instrument" ? "I" : "O"}
                      </span>
                      <div>
                        <strong title={p.label}>{p.label}</strong>
                        <small>
                          {p.record_type === "instrument"
                            ? "Instrument"
                            : "Obligation"}{" "}
                          ·{" "}
                          {p.amount_cents === null
                            ? "Amount unresolved"
                            : p.currency === "USD"
                              ? money(p.amount_cents)
                              : `${p.currency} ${p.amount_cents / 100}`}
                        </small>
                      </div>
                      <Badge status="PENDING" />
                    </button>
                  ))}
                {records.map((i) => (
                  <button
                    className={
                      "lb-queue-row " +
                      (selected?.id === i.id ? "selected" : "")
                    }
                    key={i.id}
                    onClick={() => choose(i, "record", i.table)}
                  >
                    <span
                      className={
                        "lb-record-icon " +
                        (i.table === "instruments" ? "instrument" : "claim")
                      }
                    >
                      {i.table === "instruments" ? "I" : "O"}
                    </span>
                    <div>
                      <strong>{label(i)}</strong>
                      <small>
                        {money(i.face_cents ?? i.amount_cents)} ·{" "}
                        {i.mapping || i.basis}
                      </small>
                    </div>
                    <Badge status="UNVERIFIED" />
                  </button>
                ))}
              </div>
              {focused && selected ? (
                <ReviewItem
                  key={focused.id}
                  item={focused}
                  proposal={!!proposal}
                  table={selected.table}
                  doc={doc}
                  selection={selection}
                  w={w}
                  api={api}
                  act={act}
                  refresh={refresh}
                  blocked={blocked}
                  reviewer={reviewer}
                  askReviewer={askReviewer}
                  onResolved={(recordId?: string) => {
                    setSelection(null);
                    if (recordId)
                      setSelected({
                        id: recordId,
                        type: "record",
                        table: selected.table,
                      });
                    else setSelected(null);
                  }}
                />
              ) : (
                <div className="lb-queue-empty">
                  <CheckCircle2 size={23} />
                  <strong>
                    {proposals.length + records.length
                      ? "Select an item to review"
                      : "No pending items"}
                  </strong>
                  <p>
                    {proposals.length + records.length
                      ? "Inspect its amount and source passage beside the document."
                      : latest?.status === "SUCCEEDED"
                        ? "Extraction is finished. Review the document explicitly, even when no records were proposed."
                        : "Extract proposals or record instruments and obligations manually."}
                  </p>
                </div>
              )}
              <div className="lb-manual-actions">
                <button
                  className="lb-secondary"
                  disabled={blocked}
                  onClick={() => add("instruments")}
                >
                  <Plus size={14} />
                  Instrument
                </button>
                <button
                  className="lb-secondary"
                  disabled={blocked}
                  onClick={() => add("claims")}
                >
                  <Plus size={14} />
                  Obligation
                </button>
              </div>
              <details
                className="lb-complete-document"
                open={
                  doc.processing !== "REVIEWED" &&
                  proposals.length + records.length === 0
                }
              >
                <summary>
                  <CheckCircle2 size={16} />
                  Document review
                  <Badge status={doc.processing} />
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(async () => {
                      await api(root + "/documents/" + doc.id + "/complete", {
                        reason: f.get("reason"),
                      });
                      await refresh();
                    });
                  }}
                >
                  <p>
                    Confirm that all relevant clauses have been reconciled.
                    Extraction alone cannot complete review.
                  </p>
                  <label>
                    Completion reason
                    <textarea name="reason" required minLength={3} />
                  </label>
                  <button disabled={blocked || proposals.length > 0 || active}>
                    Finish document review
                  </button>
                </form>
              </details>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
function ReviewItem({
  item,
  proposal,
  table,
  doc,
  selection,
  w,
  api,
  act,
  refresh,
  blocked,
  reviewer,
  askReviewer,
  onResolved,
}: {
  item: Item;
  proposal: boolean;
  table: "instruments" | "claims";
  doc: Doc;
  selection: Evidence | null;
  w: Workspace;
  api: Api;
  act: Props["act"];
  refresh: Props["refresh"];
  blocked: boolean;
  reviewer: string;
  askReviewer: () => void;
  onResolved: (id?: string) => void;
}) {
  const root = "projects/" + w.project.id;
  const unsupported = proposal && item.currency && item.currency !== "USD";
  const spans = selection ? [selection] : item.evidence || [];
  const superseded = spans.some(
    (e) => w.documents.find((d) => d.id === e.document_id)?.superseded,
  );
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    action: "save" | "review" | "dismiss",
  ) {
    e.preventDefault();
    if (!reviewer) {
      askReviewer();
      return;
    }
    const f = new FormData(e.currentTarget);
    await act(async () => {
      const reason = String(f.get("reason") || "");
      if (action === "dismiss") {
        if (proposal)
          await api(root + "/proposals/" + item.id + "/resolve", {
            action: "DISMISS",
            reason,
          });
        else
          await api(root + "/" + table + "/" + item.id + "/review", {
            decision: "REJECTED",
            reason,
          });
        await refresh();
        onResolved();
        return;
      }
      const fields =
        table === "instruments"
          ? [
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
            ]
          : [
              "label",
              "amount_cents",
              "currency",
              "kind",
              "instrument_id",
              "site_id",
              "legal_status",
              "mapping",
              "evidence",
            ];
      const value: Record<string, unknown> = proposal
        ? {}
        : Object.fromEntries(
            fields
              .filter((k) => item[k] !== undefined)
              .map((k) => [k, item[k]]),
          );
      value.label = f.get("label");
      value.currency = "USD";
      value.evidence = spans;
      const amount = cents(f.get("amount"));
      if (table === "instruments") {
        value.face_cents = amount;
        value.beneficiary = f.get("beneficiary");
        if (proposal) {
          value.basis = "FACE";
          value.lifecycle = "EFFECTIVE";
        }
      } else {
        value.amount_cents = amount;
        value.kind = f.get("kind");
        value.instrument_id = f.get("instrument_id") || null;
        value.mapping = proposal ? "UNCERTAIN" : f.get("mapping");
        value.legal_status = "UNKNOWN";
      }
      if (proposal) {
        const p = await api(root + "/proposals/" + item.id + "/resolve", {
          action: "IMPORT",
          reason,
          edited: value,
        });
        await refresh();
        onResolved(p.record_id);
      } else {
        await api(root + "/" + table + "/" + item.id, value, "PATCH");
        if (action === "review") {
          try {
            await api(root + "/" + table + "/" + item.id + "/review", {
              decision: "VERIFIED",
              reason,
            });
          } catch (e) {
            await refresh();
            throw e;
          }
        }
        await refresh();
        if (action === "review") onResolved();
      }
    });
  }
  return (
    <form
      className="lb-focused-review"
      onSubmit={(e) =>
        void submit(
          e,
          (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
            "data-action",
          ) === "dismiss"
            ? "dismiss"
            : (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                  "data-action",
                ) === "review"
              ? "review"
              : "save",
        )
      }
    >
      <div className="lb-inline">
        <Badge status={proposal ? "PENDING" : "UNVERIFIED"} />
        <strong>
          {proposal ? "Inspect and import" : "Review model input"}
        </strong>
      </div>
      <p>
        {proposal
          ? "Import records this proposal without approving it."
          : "Acceptance records your review of this input, not a legal opinion."}
      </p>
      {item.validation_issues?.map((issue: string, i: number) => (
        <div className="lb-inline-warning" key={i}>
          <AlertTriangle size={14} />
          {issue}
        </div>
      ))}
      {superseded && (
        <div className="lb-inline-warning">
          <AlertTriangle size={14} />
          This input cites a superseded version. Select its replacement passage
          in the current source before review.
        </div>
      )}
      <label>
        Label
        <input
          name="label"
          defaultValue={item.label}
          required
          maxLength={160}
        />
      </label>
      <label>
        {table === "instruments" ? "Face amount USD" : "Obligation amount USD"}
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={
            typeof (item.face_cents ?? item.amount_cents) === "number"
              ? String((item.face_cents ?? item.amount_cents) / 100)
              : ""
          }
          placeholder="Unknown"
        />
      </label>
      {table === "instruments" ? (
        <label>
          Beneficiary
          <input
            name="beneficiary"
            defaultValue={item.beneficiary || ""}
            required
          />
        </label>
      ) : (
        <>
          <label>
            Payment condition
            <select name="kind" defaultValue={item.kind || "fixed"}>
              <option value="fixed">Fixed obligation</option>
              <option value="conditional">Conditional obligation</option>
            </select>
          </label>
          <label>
            Securing instrument
            <select
              name="instrument_id"
              defaultValue={item.instrument_id || ""}
            >
              <option value="">Unresolved mapping</option>
              {w.instruments
                .filter((i) => i.verification !== "REJECTED")
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {label(i)}
                    {i.verification !== "VERIFIED" ? " · needs review" : ""}
                  </option>
                ))}
            </select>
          </label>
          {!proposal && (
            <label>
              Component treatment
              <select name="mapping" defaultValue={item.mapping || "UNCERTAIN"}>
                <option value="UNCERTAIN">
                  Uncertain — resolve before acceptance
                </option>
                <option value="ADDITIVE">Distinct additive obligation</option>
              </select>
            </label>
          )}
        </>
      )}
      <div className="lb-selected-citation">
        <span>
          {spans.length
            ? `Evidence attached · p${spans[0].page}`
            : "Source selection required"}
        </span>
        <blockquote>
          {spans[0]?.quote ||
            "Select the intended supporting passage in the source reader."}
        </blockquote>
        {selection && <Badge>New selection</Badge>}
      </div>
      <label>
        {proposal ? "Import or dismissal reason" : "Review reason"}
        <textarea
          name="reason"
          required
          minLength={3}
          placeholder="Explain the source-backed decision"
        />
      </label>
      <div className="lb-focused-actions">
        <button
          disabled={blocked || unsupported || !spans.length}
          data-action={proposal ? "save" : "review"}
        >
          {proposal ? "Import for review" : "Accept reviewed input"}
          <ArrowRight size={14} />
        </button>
        {!proposal && (
          <button
            className="lb-secondary"
            disabled={blocked || !spans.length}
            data-action="save"
          >
            Save without approval
          </button>
        )}
        <button
          className="lb-link danger"
          disabled={blocked}
          data-action="dismiss"
          formNoValidate
        >
          {proposal ? "Dismiss proposal" : "Exclude input"}
        </button>
      </div>
    </form>
  );
}
