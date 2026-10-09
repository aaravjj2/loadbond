"use client";
import {
  ArrowUpRight,
  CheckCircle2,
  ArrowRight,
  FileText,
  ShieldCheck,
  GitBranch,
  Layers3,
  AlertCircle,
} from "lucide-react";
import { type Workspace, type Item, label, money, preciseMoney } from "./types";
import { Badge, Empty, SectionHeading } from "./ui";
type Props = {
  w: Workspace;
  run: Item | null;
  busy: boolean;
  scenario: string;
  setScenario: (s: string) => void;
  compute: () => void;
  inspect: (item: Item, table: string) => void;
  review: () => void;
  scenarios: () => void;
  guided: boolean;
  dismissGuide: () => void;
};
export default function Assessment({
  w,
  run,
  busy,
  scenario,
  setScenario,
  compute,
  inspect,
  review,
  scenarios,
  guided,
  dismissGuide,
}: Props) {
  const result = run?.result;
  const source = run?.snapshot || w;
  const stale = !!run && run.revision !== w.project.revision;
  const unfinished = w.documents.filter(
    (d) => !d.superseded && d.processing !== "REVIEWED",
  ).length;
  const awaiting = [...w.instruments, ...w.claims].filter(
    (i) => i.verification === "UNVERIFIED",
  ).length;
  const pending = w.proposals.filter((p) => p.disposition === "PENDING").length;
  const ready =
    unfinished + awaiting + pending === 0 &&
    w.instruments.some((i) => i.verification === "VERIFIED");
  const contributions = (source.instruments as Item[]).filter(
    (i) => result?.instrument_contributions?.[i.id] !== undefined,
  );
  const complete = result?.status === "COMPLETE";
  const sum = contributions.reduce(
    (total, i) => total + result.instrument_contributions[i.id],
    0,
  );
  const traceMatches = !complete || sum === result.maximum_cents;
  const max = Math.max(
    1,
    ...contributions.map((i) => result.instrument_contributions[i.id]),
  );
  return (
    <div className="lb-assessment">
      {stale && (
        <div className="lb-warning">
          <AlertCircle size={17} />
          <div>
            <strong>Historical assessment</strong>
            <span>
              Inputs have changed. This result preserves its original evidence.
            </span>
          </div>
          <button className="lb-secondary" disabled={busy} onClick={compute}>
            Recompute
          </button>
        </div>
      )}
      {guided && (
        <div className="lb-guide">
          <div className="lb-guide-icon">
            <ArrowUpRight size={22} />
          </div>
          <div>
            <strong>Follow the evidence. Understand the exposure.</strong>
            <p>
              This pre-reviewed synthetic fixture illustrates model mechanics.
              Select an instrument below to inspect the clause behind its
              amount.
            </p>
          </div>
          <button className="lb-link" onClick={dismissGuide}>
            Got it
          </button>
        </div>
      )}
      <div className="lb-page-heading">
        <div>
          <div className="lb-eyebrow">PROJECT ASSESSMENT</div>
          <h1>Every number has a source.</h1>
          <p>
            Explore the instruments, obligations, and assumptions behind your
            result.
          </p>
        </div>
        <div className="lb-heading-actions">
          <label className="lb-sr-only" htmlFor="assessment-scenario">
            Assessment scenario
          </label>
          <select
            id="assessment-scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            {w.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !scenario || w.project.archived}
            onClick={compute}
          >
            Run assessment
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <div className="lb-kpis">
        <div className="lb-kpi primary">
          <div className="lb-kpi-label">
            <ShieldCheck size={17} />
            Modeled instrument exposure
            <Badge status={stale ? "HISTORICAL" : result?.status || "EMPTY"} />
          </div>
          <strong>{money(result?.maximum_cents, true)}</strong>
          <p>
            {run?.scenario_name || "No saved assessment"}
            {result?.hypothetical ? " · Hypothetical" : ""}
          </p>
        </div>
        <div className="lb-kpi">
          <div className="lb-kpi-label">
            <Layers3 size={17} />
            Maximum obligations
          </div>
          <strong>{money(result?.maximum_obligations_cents, true)}</strong>
          <p>Calculated separately from instrument draw exposure</p>
        </div>
        <div className="lb-kpi">
          <div className="lb-kpi-label">
            <CheckCircle2 size={17} />
            Review readiness
          </div>
          <strong className={ready ? "lb-good" : ""}>
            {ready
              ? "Ready"
              : !w.documents.length && !w.instruments.length
                ? "Not started"
                : awaiting + pending + unfinished}
          </strong>
          <p>
            {ready
              ? "Current inputs and documents reviewed"
              : `${awaiting} inputs · ${pending} proposals · ${unfinished} documents pending`}
          </p>
          <button className="lb-link" onClick={review}>
            {ready ? "Inspect reviewed inputs" : "Continue review"}
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="lb-assessment-grid">
        <section className="lb-panel lb-explained">
          <SectionHeading
            title="Exposure explained"
            subtitle="Instrument contributions in the maximizing state"
            action={<span className="lb-small">USD</span>}
          />
          {!complete ? (
            <Empty
              title={
                ready
                  ? "Your reviewed inputs are ready"
                  : result?.status === "INCOMPLETE"
                    ? "Your assessment needs a few decisions"
                    : "Start with the evidence"
              }
              action={
                <button disabled={busy} onClick={ready ? compute : review}>
                  {ready ? "Run assessment" : "Open document review"}
                  <ArrowRight size={15} />
                </button>
              }
            >
              {ready
                ? "Compute the result and preserve its original evidence."
                : result?.issues?.[0] ||
                  "Upload an agreement, review the proposed inputs, then compute a source-backed result."}
            </Empty>
          ) : !traceMatches ? (
            <div className="lb-warning">
              The contribution trace does not reconcile. Recompute before using
              this assessment.
            </div>
          ) : (
            <div className="lb-contributions">
              {contributions.map((i, index) => {
                const site = source.sites.find((s: Item) => s.id === i.site_id);
                const value = result.instrument_contributions[i.id];
                return (
                  <button
                    className="lb-contribution"
                    key={i.id}
                    onClick={() => inspect(i, "instruments")}
                    aria-label={`Inspect ${label(i)}, ${preciseMoney(value)} exposure`}
                  >
                    <div className="lb-contribution-heading">
                      <div className="lb-contribution-name">
                        <span className={"lb-dot c" + (index % 4)} />
                        <strong>{site ? label(site) : label(i)}</strong>
                        <span>{label(i)}</span>
                      </div>
                      <strong>
                        {money(value, true)}
                        <ArrowUpRight size={14} />
                      </strong>
                    </div>
                    <div className="lb-bar-track">
                      <svg
                        viewBox="0 0 1000 12"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <rect width="1000" height="12" rx="6" fill="#edf1f7" />
                        <rect
                          width={Math.max(
                            value > 0 ? 2 : 0,
                            (value / max) * 1000,
                          )}
                          height="12"
                          rx="6"
                          className={"bar-c" + (index % 4)}
                        />
                      </svg>
                    </div>
                    <div className="lb-contribution-footer">
                      <span>
                        {i.basis === "FACE" ||
                        (!result.hypothetical && i.basis_hypothetical)
                          ? "Full face basis"
                          : "Reviewed claim-limited basis"}
                      </span>
                      <span>View supporting evidence</span>
                    </div>
                  </button>
                );
              })}
              <div className="lb-total">
                <span>Total modeled exposure</span>
                <strong>{preciseMoney(sum)}</strong>
              </div>
            </div>
          )}
        </section>
        <aside className="lb-panel lb-next">
          <SectionHeading
            title="From clause to calculation"
            subtitle="A reproducible decision trail"
          />
          <div className="lb-trail">
            <div>
              <span>
                <FileText size={16} />
              </span>
              <div>
                <strong>Source documents</strong>
                <p>
                  {source.documents.filter((d: Item) => !d.superseded).length}{" "}
                  current versions with exact quotations
                </p>
              </div>
            </div>
            <div>
              <span>
                <CheckCircle2 size={16} />
              </span>
              <div>
                <strong>Reviewed model inputs</strong>
                <p>
                  {
                    [...source.claims, ...source.instruments].filter(
                      (i: Item) => i.verification === "VERIFIED",
                    ).length
                  }{" "}
                  instruments and obligations
                </p>
              </div>
            </div>
            <div>
              <span>
                <GitBranch size={16} />
              </span>
              <div>
                <strong>Documented assumptions</strong>
                <p>
                  {result?.applied_dependencies?.length || 0} applied
                  constraints in this result
                </p>
              </div>
            </div>
            <div>
              <span>
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>Immutable assessment</strong>
                <p>
                  {run
                    ? "Inputs, maximizing state, and evidence retained"
                    : "Run an assessment to preserve the evidence"}
                </p>
              </div>
            </div>
          </div>
          <div className="lb-note">
            <strong>
              {result?.hypothetical
                ? "Hypothetical arrangement"
                : "Documented arrangement"}
            </strong>
            <p>
              Claim exclusivity does not automatically reduce instrument draw
              rights. User review is not a legal opinion.
            </p>
          </div>
          <button className="lb-secondary full" onClick={scenarios}>
            Compare scenarios
            <ArrowRight size={15} />
          </button>
        </aside>
      </div>
      <section className="lb-panel lb-relationships">
        <SectionHeading
          title="Connected evidence"
          subtitle="Select a record to trace its source and review decision"
        />
        {!source.instruments.length ? (
          <p className="lb-muted">
            Instrument relationships appear after inputs are recorded.
          </p>
        ) : (
          <div className="lb-relationship-rows">
            {(source.instruments as Item[]).map((i) => {
              const site = source.sites.find((s: Item) => s.id === i.site_id);
              const claims = (source.claims as Item[]).filter(
                (c) =>
                  c.instrument_id === i.id && c.verification !== "REJECTED",
              );
              return (
                <div className="lb-relationship-row" key={i.id}>
                  <button
                    className="lb-node site"
                    onClick={() =>
                      inspect(site || i, site ? "sites" : "instruments")
                    }
                  >
                    <span>SITE</span>
                    <strong>{site ? label(site) : "Unassigned site"}</strong>
                  </button>
                  <svg viewBox="0 0 48 30" aria-hidden="true">
                    <path d="M0 15H40" />
                    <path d="m35 10 5 5-5 5" />
                  </svg>
                  <button
                    className="lb-node instrument"
                    onClick={() => inspect(i, "instruments")}
                  >
                    <span>
                      INSTRUMENT ·{" "}
                      {complete && !result.hypothetical && i.basis_hypothetical
                        ? "FACE IN THIS SCENARIO"
                        : i.basis}
                    </span>
                    <strong>{label(i)}</strong>
                    <small>{money(i.face_cents, true)} face</small>
                  </button>
                  <svg viewBox="0 0 48 30" aria-hidden="true">
                    <path d="M0 15H40" />
                    <path d="m35 10 5 5-5 5" />
                  </svg>
                  <div className="lb-claim-nodes">
                    {claims.map((c) => (
                      <button
                        className={
                          "lb-node claim" +
                          (complete && !result.active_claims?.includes(c.id)
                            ? " inactive"
                            : "")
                        }
                        key={c.id}
                        onClick={() => inspect(c, "claims")}
                      >
                        <strong>{label(c)}</strong>
                        <small>
                          {money(c.amount_cents, true)} · {c.kind}
                          {complete && !result.active_claims?.includes(c.id)
                            ? " · inactive in this state"
                            : ""}
                        </small>
                      </button>
                    ))}
                    {!claims.length && (
                      <span className="lb-muted">No linked obligations</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(source.dependencies as Item[])
          .filter((d) => result?.applied_dependencies?.includes(d.id))
          .map((d) => (
            <button
              className="lb-constraint-link"
              key={d.id}
              onClick={() => inspect(d, "dependencies")}
            >
              <GitBranch size={15} />
              {label(d)}
              <Badge>{d.hypothetical ? "Hypothetical" : "Documented"}</Badge>
              <ArrowUpRight size={14} />
            </button>
          ))}
      </section>
      <details className="lb-panel lb-financial-details">
        <summary>
          Additional financial metrics
          <span>Capacity and capital release are not established</span>
        </summary>
        <div className="lb-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Facility usage</th>
                <th>Cash collateral</th>
                <th>Guarantee</th>
                <th>Surety</th>
              </tr>
            </thead>
            <tbody>
              {source.instruments.map((i: Item) => (
                <tr key={i.id}>
                  <td>{label(i)}</td>
                  {[
                    "facility_usage_cents",
                    "cash_collateral_cents",
                    "guarantee_cents",
                    "surety_cents",
                  ].map((f) => (
                    <td key={f}>{money(i[f])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {!!result?.issues?.length && (
        <section className="lb-panel">
          <SectionHeading title="Complete the assessment" />
          {result.issues.map((issue: string, index: number) => (
            <button className="lb-issue-row" onClick={review} key={index}>
              <AlertCircle size={16} />
              {issue}
              <ArrowRight size={15} />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
