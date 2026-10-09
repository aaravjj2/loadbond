"use client";
import { useEffect, useState } from "react";
import { GitBranch, Plus, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import {
  type Workspace,
  type Item,
  type Kind,
  type Comparison,
  type Api,
  label,
  money,
} from "./types";
import { Badge, SectionHeading } from "./ui";
export default function Scenarios({
  w,
  api,
  act,
  busy,
  edit,
  review,
  inspect,
  save,
}: {
  w: Workspace;
  api: Api;
  act: (fn: () => Promise<void>) => Promise<boolean>;
  busy: boolean;
  edit: (kind: Kind, item?: Item) => void;
  review: (table: string, item: Item) => void;
  inspect: (item: Item, table: string) => void;
  save: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    w.scenarios.slice(0, 3).map((s) => s.id),
  );
  const [comparison, setComparison] = useState<Comparison | null>(null);
  useEffect(() => {
    setComparison(null);
    setSelected((ids) =>
      ids.filter((id) => w.scenarios.some((s) => s.id === id)),
    );
  }, [w.project.revision]);
  const historical =
    comparison && comparison.project_revision !== w.project.revision;
  return (
    <div>
      <div className="lb-page-heading">
        <div>
          <div className="lb-eyebrow">SCENARIOS & ASSUMPTIONS</div>
          <h1>Compare arrangements with care.</h1>
          <p>Separate documented exposure from hypothetical changes.</p>
        </div>
        <button disabled={w.project.archived} onClick={() => edit("scenarios")}>
          <Plus size={16} />
          New scenario
        </button>
      </div>
      <div className="lb-scenario-cards">
        {w.scenarios.map((s) => (
          <article
            className={
              "lb-panel lb-scenario-card " +
              (selected.includes(s.id) ? "selected" : "")
            }
            key={s.id}
          >
            <div className="lb-inline">
              <Badge>{s.hypothetical ? "Hypothetical" : "Documented"}</Badge>
              <label className="lb-scenario-check">
                <input
                  aria-label={`Compare ${s.name}`}
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  disabled={!selected.includes(s.id) && selected.length >= 4}
                  onChange={(e) => {
                    setComparison(null);
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, s.id]
                        : ids.filter((id) => id !== s.id),
                    );
                  }}
                />
                <span>
                  <Check size={13} />
                </span>
              </label>
            </div>
            <h2>{s.name}</h2>
            <p>
              {s.dependency_ids.length} constraints · obligations{" "}
              {s.conditional_percent}% · ceilings {s.ceiling_percent}%
            </p>
            <div className="lb-inline">
              <button
                className="lb-link"
                disabled={w.project.archived}
                onClick={() => edit("scenarios", s)}
              >
                Edit assumptions
              </button>
              <button
                className="lb-link"
                disabled={busy || w.project.archived}
                onClick={() => save(s.id)}
              >
                Save assessment
                <ArrowRight size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="lb-panel">
        <SectionHeading
          title="Scenario comparison"
          subtitle="Choose two to four scenarios. Each preview uses one common frozen set of inputs."
          action={
            <button
              disabled={busy || selected.length < 2}
              onClick={() =>
                void act(async () =>
                  setComparison(
                    await api("projects/" + w.project.id + "/comparisons", {
                      scenario_ids: selected,
                    }),
                  ),
                )
              }
            >
              Compare previews
              <ArrowRight size={15} />
            </button>
          }
        />
        {comparison ? (
          <>
            <div className="lb-inline lb-comparison-status">
              <Badge status={historical ? "HISTORICAL" : "PREVIEW"} />
              <span>
                {historical
                  ? "Project inputs changed; run a new comparison."
                  : "Preview only · no assessments or review decisions saved"}
              </span>
            </div>
            <div className="lb-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Arrangement</th>
                    <th>Gross under same stress</th>
                    <th>Modeled exposure</th>
                    <th>Maximum obligations</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.comparisons.map((c) => (
                    <tr key={c.scenario_id}>
                      <td>
                        <strong>{c.scenario.name}</strong>
                      </td>
                      <td>
                        <Badge>
                          {c.scenario.hypothetical
                            ? "Hypothetical"
                            : "Documented"}
                        </Badge>
                      </td>
                      <td className="lb-number">
                        {money(c.result.gross_cents)}
                      </td>
                      <td className="lb-number">
                        <strong>{money(c.result.maximum_cents)}</strong>
                      </td>
                      <td className="lb-number">
                        {money(c.result.maximum_obligations_cents)}
                      </td>
                      <td>
                        <Badge status={c.result.status} />
                        {c.result.issues?.map((issue: string, i: number) => (
                          <small key={i}>{issue}</small>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lb-comparison-bars">
              {comparison.comparisons.map((c) => (
                <div key={c.scenario_id}>
                  <span>{c.scenario.name}</span>
                  <svg
                    viewBox="0 0 1000 18"
                    preserveAspectRatio="none"
                    aria-label={`${c.scenario.name}: ${money(c.result.maximum_cents)} modeled exposure, ${money(c.result.gross_cents)} gross under same stress`}
                    role="img"
                  >
                    <rect width="1000" height="18" rx="4" fill="#e9eef6" />
                    {typeof c.result.maximum_cents === "number" && (
                      <rect
                        width={
                          c.result.gross_cents
                            ? Math.min(
                                1000,
                                (c.result.maximum_cents /
                                  c.result.gross_cents) *
                                  1000,
                              )
                            : 0
                        }
                        height="18"
                        rx="4"
                        fill={c.scenario.hypothetical ? "#7284a6" : "#2b59ed"}
                      />
                    )}
                  </svg>
                  <strong>{money(c.result.maximum_cents, true)}</strong>
                </div>
              ))}
            </div>
            <p className="lb-small">
              Bars show exposure as a share of each scenario’s same-stress
              gross. Modeled differences are not established capital savings.
            </p>
          </>
        ) : (
          <div className="lb-comparison-empty">
            <GitBranch size={28} />
            <strong>
              See how the documented assumptions change the result.
            </strong>
            <p>
              The existing solver computes every preview. Unreviewed constraints
              receive no reduction credit.
            </p>
          </div>
        )}
      </section>
      <section className="lb-panel">
        <SectionHeading
          title="Constraint register"
          subtitle="Review each constraint separately from factual claims"
          action={
            <button
              className="lb-secondary"
              disabled={w.project.archived}
              onClick={() => edit("dependencies")}
            >
              <Plus size={15} />
              Add constraint
            </button>
          }
        />
        <div className="lb-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Constraint</th>
                <th>Maximum active</th>
                <th>Members</th>
                <th>Arrangement</th>
                <th>Review</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {w.dependencies.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button
                      className="lb-cell-link"
                      onClick={() => inspect(d, "dependencies")}
                    >
                      {label(d)}
                      <ArrowUpRight size={13} />
                    </button>
                  </td>
                  <td>{d.max_active}</td>
                  <td>{d.claim_ids.length} obligations</td>
                  <td>{d.hypothetical ? "Hypothetical" : "Documented"}</td>
                  <td>
                    <Badge status={d.verification} />
                  </td>
                  <td>
                    <div className="lb-row-actions">
                      <button
                        className="lb-link"
                        disabled={w.project.archived}
                        onClick={() => edit("dependencies", d)}
                      >
                        Edit
                      </button>
                      <button
                        className="lb-link"
                        disabled={w.project.archived}
                        onClick={() => review("dependencies", d)}
                      >
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!w.dependencies.length && (
            <p className="lb-muted">
              No constraints recorded. Add only source-supported assumptions.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
