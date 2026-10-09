"use client";
import { useState } from "react";
import {
  Download,
  RotateCcw,
  ShieldCheck,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import { type Workspace, type Item, type Api, label, money } from "./types";
import { Badge, Empty, SectionHeading } from "./ui";
export default function History({
  w,
  run,
  choose,
  api,
  act,
  busy,
  download,
  inspect,
}: {
  w: Workspace;
  run: Item | null;
  choose: (id: string) => void;
  api: Api;
  act: (fn: () => Promise<void>) => Promise<boolean>;
  busy: boolean;
  download: (format: string) => void;
  inspect: (item: Item, table: string) => void;
}) {
  const [integrity, setIntegrity] = useState<any>(null);
  const [replayed, setReplayed] = useState(false);
  const root = "projects/" + w.project.id;
  const result = run?.result;
  const snapshot = run?.snapshot;
  const stale = run && run.revision !== w.project.revision;
  return (
    <div className="lb-history">
      <div className="lb-page-heading">
        <div>
          <div className="lb-eyebrow">ASSESSMENTS & EVIDENCE</div>
          <h1>A result you can reproduce.</h1>
          <p>
            Original inputs, source passages, and review decisions stay
            connected.
          </p>
        </div>
        {run && (
          <div className="lb-heading-actions">
            <button
              className="lb-secondary"
              disabled={!snapshot}
              onClick={() => window.print()}
            >
              Print report
            </button>
            <button
              className="lb-secondary"
              disabled={busy}
              onClick={() => download("csv")}
            >
              Export CSV
            </button>
            <button disabled={busy} onClick={() => download("json")}>
              <Download size={16} />
              Export evidence
            </button>
          </div>
        )}
      </div>
      {!w.runs.length ? (
        <div className="lb-panel">
          <Empty title="No saved assessments yet">
            Run an assessment to retain its immutable inputs and source-backed
            financial trace.
          </Empty>
        </div>
      ) : (
        <div className="lb-history-grid">
          <aside className="lb-panel lb-assessment-timeline">
            <SectionHeading
              title="Saved assessments"
              subtitle={`${w.runs.length} reproducible snapshots`}
            />
            {w.runs.toReversed().map((r) => (
              <button
                className={
                  "lb-timeline-row " + (run?.id === r.id ? "selected" : "")
                }
                key={r.id}
                onClick={() => {
                  setReplayed(false);
                  choose(r.id);
                }}
              >
                <span className="lb-timeline-dot" />
                <div>
                  <strong>{r.scenario_name}</strong>
                  <small>{new Date(r.at).toLocaleString()}</small>
                  <div className="lb-inline">
                    <Badge status={r.result.status} />
                    {r.revision !== w.project.revision && (
                      <Badge status="HISTORICAL" />
                    )}
                  </div>
                </div>
                <strong>{money(r.result.maximum_cents, true)}</strong>
              </button>
            ))}
          </aside>
          <article className="lb-panel lb-report" id="assessment-report">
            {run && (
              <>
                <div className="lb-report-top">
                  <div className="lb-eyebrow">LOADBOND / ASSESSMENT REPORT</div>
                  <Badge status={stale ? "HISTORICAL" : result.status} />
                </div>
                <h2>{run.scenario_name}</h2>
                <p>
                  {w.project.name} · {new Date(run.at).toLocaleString()}
                </p>
                <div className="lb-report-numbers">
                  <div>
                    <span>Modeled exposure</span>
                    <strong>{money(result.maximum_cents)}</strong>
                  </div>
                  <div>
                    <span>Maximum obligations</span>
                    <strong>{money(result.maximum_obligations_cents)}</strong>
                  </div>
                  <div>
                    <span>Same-stress gross</span>
                    <strong>{money(result.gross_cents)}</strong>
                  </div>
                </div>
                <div className="lb-inline lb-report-actions">
                  <button
                    className="lb-secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const replay = await api(
                          root + "/runs/" + run.id + "/replay",
                          {},
                        );
                        if (!replay.snapshot_matches || !replay.result_matches)
                          throw new Error("Snapshot or result replay mismatch");
                        setReplayed(true);
                      })
                    }
                  >
                    <RotateCcw size={15} />
                    Replay snapshot
                  </button>
                  {replayed && (
                    <span className="lb-good">
                      <ShieldCheck size={15} />
                      Snapshot and result reproduced exactly
                    </span>
                  )}
                </div>
                {snapshot ? (
                  <>
                    <SectionHeading
                      title="Instrument contributions"
                      subtitle="From this assessment’s original inputs"
                    />
                    <div className="lb-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Instrument</th>
                            <th>Basis</th>
                            <th>Face</th>
                            <th>Exposure contribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.instruments
                            .filter(
                              (i: Item) =>
                                result.instrument_contributions?.[i.id] !==
                                undefined,
                            )
                            .map((i: Item) => (
                              <tr key={i.id}>
                                <td>
                                  <button
                                    className="lb-cell-link"
                                    onClick={() => inspect(i, "instruments")}
                                  >
                                    {label(i)}
                                    <ArrowUpRight size={12} />
                                  </button>
                                </td>
                                <td>{i.basis}</td>
                                <td>{money(i.face_cents)}</td>
                                <td className="lb-number">
                                  {money(result.instrument_contributions[i.id])}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <SectionHeading title="Supporting source passages" />
                    {[...snapshot.instruments, ...snapshot.claims]
                      .filter((i: Item) => i.verification !== "REJECTED")
                      .map((i: Item) => (
                        <section className="lb-report-citation" key={i.id}>
                          <strong>{label(i)}</strong>
                          {i.evidence?.map((e: any, index: number) => (
                            <div key={index}>
                              <span>
                                {
                                  snapshot.documents.find(
                                    (d: Item) => d.id === e.document_id,
                                  )?.name
                                }{" "}
                                · page {e.page}
                              </span>
                              <blockquote>{e.quote}</blockquote>
                            </div>
                          ))}
                        </section>
                      ))}
                    {result.applied_dependencies?.length > 0 && (
                      <>
                        <SectionHeading title="Applied constraints" />
                        {snapshot.dependencies
                          .filter((d: Item) =>
                            result.applied_dependencies.includes(d.id),
                          )
                          .map((d: Item) => (
                            <div className="lb-report-citation" key={d.id}>
                              <strong>
                                {label(d)} · maximum {d.max_active}
                              </strong>
                              {(d.evidence || []).map((e: any, i: number) => (
                                <blockquote key={i}>{e.quote}</blockquote>
                              ))}
                            </div>
                          ))}
                      </>
                    )}
                  </>
                ) : (
                  <p className="lb-muted">Loading immutable inputs…</p>
                )}
                {result.issues?.map((issue: string, i: number) => (
                  <p className="lb-inline-warning" key={i}>
                    {issue}
                  </p>
                ))}
                <p className="lb-report-notice">
                  {result.notice ||
                    "Reviewed model inputs; not a legal opinion or established capital release."}
                </p>
                <details className="lb-technical">
                  <summary>Snapshot metadata and complete JSON</summary>
                  <dl className="lb-facts">
                    <div>
                      <dt>Solver</dt>
                      <dd>{run.solver_version}</dd>
                    </div>
                    <div>
                      <dt>Snapshot hash</dt>
                      <dd className="lb-mono">{run.snapshot_hash}</dd>
                    </div>
                  </dl>
                  <pre>{JSON.stringify(run, null, 2)}</pre>
                </details>
              </>
            )}
          </article>
        </div>
      )}
      <section className="lb-panel lb-audit-panel">
        <SectionHeading
          title="Review and audit history"
          subtitle="Stored event consistency, not tamper-proof storage"
          action={
            <button
              className="lb-secondary"
              disabled={busy}
              onClick={() =>
                void act(async () =>
                  setIntegrity(await api(root + "/integrity")),
                )
              }
            >
              <ShieldCheck size={16} />
              Check audit integrity
            </button>
          }
        />
        {integrity && (
          <div className={integrity.valid ? "lb-success" : "lb-warning"}>
            {integrity.valid
              ? `${integrity.event_count} stored events have consistent hashes and links.`
              : `${integrity.issues.length} consistency issues detected.`}
          </div>
        )}
        <details>
          <summary>{w.events.length} audit events · expand details</summary>
          {w.events.toReversed().map((e) => (
            <div className="lb-audit-event" key={e.id}>
              <strong>{e.action}</strong>
              <span>
                {e.reviewer} · {new Date(e.at).toLocaleString()}
              </span>
              <details>
                <summary>Event details</summary>
                <pre>{JSON.stringify(e.detail, null, 2)}</pre>
              </details>
            </div>
          ))}
        </details>
      </section>
    </div>
  );
}
