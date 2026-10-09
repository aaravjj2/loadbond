"use client";
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  ArrowUpDown,
  ArrowUpRight,
  Shield,
  FileText,
  MapPin,
} from "lucide-react";
import { type Workspace, type Item, type Kind, label, money } from "./types";
import { Badge, Empty } from "./ui";
export default function Register({
  w,
  edit,
  inspect,
  review,
}: {
  w: Workspace;
  edit: (kind: Kind, item?: Item) => void;
  inspect: (item: Item, table: string) => void;
  review: (table: string, item: Item) => void;
}) {
  const [tab, setTab] = useState<"instruments" | "claims" | "sites">(
    "instruments",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ field: string; direction: number }>({
    field: "label",
    direction: 1,
  });
  const [filter, setFilter] = useState("all");
  const rows = useMemo(
    () =>
      w[tab]
        .filter(
          (i) =>
            (filter === "all" || i.verification === filter) &&
            JSON.stringify([
              i.label,
              i.name,
              i.beneficiary,
              i.mapping,
              i.commercial_status,
            ])
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .toSorted((a, b) => {
          const av =
            sort.field === "amount"
              ? (a.face_cents ?? a.amount_cents)
              : sort.field === "label"
                ? label(a)
                : a[sort.field];
          const bv =
            sort.field === "amount"
              ? (b.face_cents ?? b.amount_cents)
              : sort.field === "label"
                ? label(b)
                : b[sort.field];
          return (
            sort.direction *
            (typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av || "").localeCompare(String(bv || "")))
          );
        }),
    [w, tab, filter, query, sort],
  );
  function order(field: string) {
    setSort((s) => ({
      field,
      direction: s.field === field ? -s.direction : 1,
    }));
  }
  return (
    <div>
      <div className="lb-page-heading">
        <div>
          <div className="lb-eyebrow">PROJECT REGISTER</div>
          <h1>One register. Clear relationships.</h1>
          <p>
            Keep instruments, obligations, and sites connected to their sources.
          </p>
        </div>
        <button disabled={w.project.archived} onClick={() => edit(tab)}>
          <Plus size={16} />
          Add{" "}
          {tab === "claims"
            ? "obligation"
            : tab === "sites"
              ? "site"
              : "instrument"}
        </button>
      </div>
      <div className="lb-tab-bar">
        {[
          ["instruments", "Instruments", Shield],
          ["claims", "Obligations", FileText],
          ["sites", "Sites", MapPin],
        ].map(([id, title, Icon]) => {
          const I = Icon as typeof Shield;
          return (
            <button
              key={id as string}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id as typeof tab);
                setFilter("all");
              }}
            >
              <I size={16} />
              {title as string}
              <span>{w[id as typeof tab].length}</span>
            </button>
          );
        })}
      </div>
      <section className="lb-panel lb-register-panel">
        <div className="lb-table-toolbar">
          <label className="lb-search">
            <Search size={16} />
            <input
              aria-label="Search register"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, beneficiaries, or status…"
            />
          </label>
          {tab !== "sites" && (
            <select
              aria-label="Filter review status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All review statuses</option>
              <option value="UNVERIFIED">Needs review</option>
              <option value="VERIFIED">Reviewed</option>
              <option value="REJECTED">Excluded</option>
            </select>
          )}
          <span className="lb-small">{rows.length} records</span>
        </div>
        {!rows.length ? (
          <Empty
            title={
              query
                ? "No matching records"
                : "Your register is ready for its first record"
            }
            action={
              <button className="lb-secondary" onClick={() => edit(tab)}>
                Add a record
              </button>
            }
          >
            Record a source-backed input or import a proposal from document
            review.
          </Empty>
        ) : (
          <div className="lb-table-wrap">
            <table>
              <thead>
                <tr>
                  <th
                    aria-sort={
                      sort.field === "label"
                        ? sort.direction === 1
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button onClick={() => order("label")}>
                      Name
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  {tab !== "sites" && (
                    <th
                      aria-sort={
                        sort.field === "amount"
                          ? sort.direction === 1
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button onClick={() => order("amount")}>
                        {tab === "instruments"
                          ? "Face amount"
                          : "Obligation amount"}
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                  )}
                  <th>
                    {tab === "instruments"
                      ? "Beneficiary"
                      : tab === "claims"
                        ? "Securing instrument"
                        : "Commercial status"}
                  </th>
                  <th>
                    {tab === "instruments"
                      ? "Modeling basis"
                      : tab === "claims"
                        ? "Component treatment"
                        : "Site ID"}
                  </th>
                  <th>Review</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button
                        className="lb-cell-link"
                        onClick={() => inspect(i, tab)}
                      >
                        {label(i)}
                        <ArrowUpRight size={13} />
                      </button>
                      {tab !== "sites" && (
                        <small>
                          {w.sites.find((s) => s.id === i.site_id)?.name ||
                            "No site assigned"}
                        </small>
                      )}
                    </td>
                    {tab !== "sites" && (
                      <td className="lb-number">
                        {money(i.face_cents ?? i.amount_cents)}
                      </td>
                    )}
                    <td>
                      {tab === "instruments"
                        ? i.beneficiary
                        : tab === "claims"
                          ? w.instruments.find((x) => x.id === i.instrument_id)
                              ?.label || "Unresolved"
                          : i.commercial_status}
                    </td>
                    <td>
                      {tab === "instruments" ? (
                        i.basis
                      ) : tab === "claims" ? (
                        i.mapping
                      ) : (
                        <span className="lb-mono">{i.id.slice(0, 8)}</span>
                      )}
                    </td>
                    <td>
                      {tab === "sites" ? (
                        <Badge>Commercial record</Badge>
                      ) : (
                        <Badge status={i.verification} />
                      )}
                    </td>
                    <td>
                      <div className="lb-row-actions">
                        <button
                          className="lb-link"
                          disabled={w.project.archived}
                          onClick={() => edit(tab, i)}
                        >
                          Edit
                        </button>
                        {tab !== "sites" && (
                          <button
                            className="lb-link"
                            disabled={w.project.archived}
                            onClick={() => review(tab, i)}
                          >
                            Review
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="lb-table-foot">
          {tab === "instruments"
            ? "Face, draw restrictions, and release evidence are reviewed separately."
            : tab === "claims"
              ? "Confirm distinct additive components before accepting an obligation."
              : "Commercial site abandonment does not release an instrument."}
        </div>
      </section>
    </div>
  );
}
