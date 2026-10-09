"use client";
import { useState, type FormEvent } from "react";
import {
  type Kind,
  type Item,
  type Workspace,
  type Evidence,
  titles,
  cents,
} from "./types";
export default function RecordEditor({
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
      <select
        name={name}
        defaultValue={item?.[name] ?? fallback}
        disabled={proposalMode && name === "mapping"}
      >
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
        <p>
          {proposalMode
            ? "Import creates an unverified input. Obligation mapping stays uncertain until you confirm it after import."
            : "Save proposed inputs, then review material records separately."}
        </p>
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
