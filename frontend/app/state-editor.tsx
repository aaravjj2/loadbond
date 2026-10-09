"use client";
import { useState } from "react";
import {
  type Entity,
  type StateWorkspaceData,
  type StateApi,
  type EditorType,
  type Span,
  type Condition,
  minor,
  amountText,
} from "./state-types";

const kinds = [
  "IMPLICATION",
  "PREREQUISITE",
  "CARDINALITY",
  "ISSUANCE",
  "REPLACEMENT",
  "RELEASE",
  "EXPIRY",
  "LIMIT",
  "STEP_UP",
  "EVERGREEN",
  "DRAW_CONDITION",
  "OBLIGATION",
];
export default function StateEditor({
  type,
  item,
  proposal,
  modelId,
  w,
  api,
  busy,
  onSave,
  onCancel,
  onError,
}: {
  type: EditorType;
  item?: Entity;
  proposal?: Entity;
  modelId: string;
  w: StateWorkspaceData;
  api: StateApi;
  busy: boolean;
  onSave: (body: any, reason?: string) => Promise<void>;
  onCancel: () => void;
  onError: (s: string) => void;
}) {
  const initial: Partial<Entity> = item || proposal || {};
  const [kind, setKind] = useState(
    initial.kind || initial.rule_kind || "ISSUANCE",
  );
  const [eventType, setEventType] = useState(initial.event_type || "FACT_SET");
  const [view, setView] = useState(initial.view || "FUTURE");
  const [conditions, setConditions] = useState<Condition[]>(
    initial.when?.length ? initial.when : initial.any_of || [],
  );
  const [conditionMode, setConditionMode] = useState(
    initial.any_of?.length ? "ANY" : "ALL",
  );
  const [spans, setSpans] = useState<Span[]>(
    initial.evidence?.length === 1 ? initial.evidence : [],
  );
  const [docId, setDocId] = useState(
    initial.evidence?.[0]?.document_id ||
      w.documents.find((d) => !d.superseded)?.id ||
      "",
  );
  const [page, setPage] = useState(initial.evidence?.[0]?.page || 1);
  const [quote, setQuote] = useState(initial.evidence?.[0]?.quote || "");
  const [occurrences, setOccurrences] = useState<Span[]>(
    initial.evidence?.length > 1 ? initial.evidence : [],
  );
  const [locating, setLocating] = useState(false);
  const doc = w.documents.find((d) => d.id === docId);
  const facts = w.facts.filter((f) => f.model_id === modelId);
  const events = w.events.filter((e) => e.model_id === modelId);
  const dateValue = (f: FormData, key: string) =>
    String(f.get(key) || "") || null;
  async function locate() {
    setLocating(true);
    onError("");
    try {
      const r = await api("source-spans", { document_id: docId, page, quote });
      setOccurrences(r.occurrences);
      setSpans(r.occurrences.length === 1 ? r.occurrences : []);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError("");
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) || "");
    try {
      let body: any = {
        model_id: modelId,
        label: str("label"),
        evidence: spans,
      };
      if (type === "models")
        body = {
          name: str("name"),
          basis: str("basis"),
          instrument_ids: f.getAll("instrument_ids"),
          claim_ids: f.getAll("claim_ids"),
          version: str("version"),
          scope_notes: str("scope_notes"),
        };
      if (type === "facts")
        body = {
          ...body,
          key: str("key"),
          value: str("value") === "UNKNOWN" ? null : str("value") === "true",
          observed_on: dateValue(f, "observed_on"),
          future_mutable: f.has("future_mutable"),
        };
      if (type === "events")
        body = {
          ...body,
          event_type: eventType,
          executed_on: dateValue(f, "executed_on"),
          effective_on: dateValue(f, "effective_on"),
          sequence: Number(str("sequence") || 0),
          instrument_id: str("instrument_id") || null,
          fact_key: str("fact_key") || null,
          fact_value: str("fact_value") ? str("fact_value") === "true" : null,
          amount_cents: minor(str("amount")),
          remaining_available_cents: minor(str("available")),
        };
      if (type === "balances")
        body = {
          ...body,
          instrument_id: str("instrument_id"),
          observed_on: dateValue(f, "observed_on"),
          available_cents: minor(str("available")),
          unreimbursed_cents: minor(str("unreimbursed")),
        };
      if (type === "rules")
        body = {
          ...body,
          interpretation: str("interpretation"),
          kind,
          target_id: str("target_id") || null,
          successor_id: str("successor_id") || null,
          when: conditionMode === "ALL" ? conditions : [],
          any_of: conditionMode === "ANY" ? conditions : [],
          member_keys: f.getAll("member_keys"),
          max_active: kind === "CARDINALITY" ? Number(str("max_active")) : null,
          requires_key: str("requires_key") || null,
          requires_value: str("requires_value") !== "false",
          metric: str("metric") || "FACE",
          amount_cents: kind === "LIMIT" ? minor(str("amount")) : null,
          percent: kind === "STEP_UP" ? Number(str("percent")) : null,
          valid_from: dateValue(f, "valid_from"),
          valid_to: dateValue(f, "valid_to"),
          event_id: str("event_id") || null,
          lag_days: Number(str("lag_days") || 0),
          hypothetical: f.has("hypothetical"),
        };
      if (type === "scenarios")
        body = {
          model_id: modelId,
          name: str("name"),
          view,
          assumptions: Object.fromEntries(
            facts
              .map((fa) => [fa.key, str("assumption:" + fa.key)])
              .filter(([, v]) => v !== "")
              .map(([k, v]) => [k, v === "true"]),
          ),
          excluded_rule_ids: f.getAll("excluded_rule_ids"),
          face_percent: Number(str("face_percent") || 100),
          obligation_percent: Number(str("obligation_percent") || 100),
        };
      if (type === "document-links")
        body = {
          model_id: modelId,
          source_document_id: docId,
          reference_label: str("reference_label"),
          relationship: str("relationship"),
          target_document_id: str("target_document_id") || null,
          required_for_assessment: f.has("required_for_assessment"),
          evidence: spans,
        };
      await onSave(body, str("import_reason"));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }
  const optionRecords = (items: Entity[]) =>
    items.map((i) => (
      <option value={i.id} key={i.id}>
        {i.label || i.name} · {i.verification || "record"}
      </option>
    ));
  return (
    <form className="state-editor" onSubmit={submit}>
      <div className="state-section-heading">
        <div>
          <p className="eyebrow">
            {proposal
              ? "EXPERIMENTAL AI PROPOSAL → EDITED IMPORT"
              : item
                ? "EDITED RECORD → RE-REVIEW REQUIRED"
                : "NEW UNVERIFIED MODEL INPUT"}
          </p>
          <h2>
            {type === "models"
              ? "Define the assessed transaction"
              : type === "rules"
                ? "Interpret the contractual provision"
                : type === "events"
                  ? "Record a dated occurrence"
                  : type === "facts"
                    ? "Define the project condition"
                    : type === "scenarios"
                      ? "Define an analysis scenario"
                      : "Link referenced evidence"}
          </h2>
        </div>
        <button type="button" className="secondary" onClick={onCancel}>
          Close editor
        </button>
      </div>
      {type === "models" ? (
        <>
          <div className="state-form-grid">
            <label>
              Model name
              <input
                name="name"
                defaultValue={initial.name || w.project.name + " state model"}
                required
                maxLength={160}
              />
            </label>
            <label>
              Assessment basis
              <select
                name="basis"
                defaultValue={initial.basis || "RECORDED_POSITION"}
              >
                <option value="RECORDED_POSITION">
                  Recorded position · conservative where dates are unknown
                </option>
                <option value="CONTRACTUAL_CAPACITY">
                  Contractual commitments · not actual issuance
                </option>
              </select>
            </label>
            <label>
              Model version
              <input
                name="version"
                defaultValue={initial.version || "1.0"}
                required
                maxLength={40}
              />
            </label>
          </div>
          <fieldset>
            <legend>Instruments in scope</legend>
            {w.instruments
              .filter((i) => i.verification !== "REJECTED")
              .map((i) => (
                <label className="state-check" key={i.id}>
                  <input
                    type="checkbox"
                    name="instrument_ids"
                    value={i.id}
                    defaultChecked={
                      !item || initial.instrument_ids?.includes(i.id)
                    }
                  />
                  {i.label} · {i.verification}
                </label>
              ))}
          </fieldset>
          <fieldset>
            <legend>Underlying obligations in scope</legend>
            {w.claims
              .filter((c) => c.verification !== "REJECTED")
              .map((c) => (
                <label className="state-check" key={c.id}>
                  <input
                    type="checkbox"
                    name="claim_ids"
                    value={c.id}
                    defaultChecked={!item || initial.claim_ids?.includes(c.id)}
                  />
                  {c.label} · {c.verification}
                </label>
              ))}
          </fieldset>
          <label>
            Scope and explicit limitations
            <textarea
              name="scope_notes"
              defaultValue={initial.scope_notes || ""}
              maxLength={2000}
              placeholder="Which rights, dates, documents or balances remain unestablished?"
            />
          </label>
        </>
      ) : type === "scenarios" ? (
        <>
          <div className="state-form-grid">
            <label>
              Scenario name
              <input name="name" defaultValue={initial.name || ""} required />
            </label>
            <label>
              View
              <select value={view} onChange={(e) => setView(e.target.value)}>
                <option value="RECORDED">Recorded position</option>
                <option value="FUTURE">Possible future states</option>
                <option value="HYPOTHETICAL">Hypothetical arrangements</option>
              </select>
            </label>
          </div>
          {view === "HYPOTHETICAL" && (
            <>
              <div className="state-form-grid">
                <label>
                  Instrument face stress (%)
                  <input
                    name="face_percent"
                    type="number"
                    defaultValue={initial.face_percent || 100}
                    min={100}
                    max={1000}
                  />
                </label>
                <label>
                  Obligation stress (%)
                  <input
                    name="obligation_percent"
                    type="number"
                    defaultValue={initial.obligation_percent || 100}
                    min={100}
                    max={1000}
                  />
                </label>
              </div>
              <fieldset>
                <legend>Explicit hypothetical assumptions</legend>
                {facts.map((f) => (
                  <label key={f.id}>
                    {f.label}
                    <select
                      name={"assumption:" + f.key}
                      defaultValue={
                        initial.assumptions?.[f.key] === undefined
                          ? ""
                          : String(initial.assumptions[f.key])
                      }
                    >
                      <option value="">No override</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Exclude rules for this hypothetical preview</legend>
                {w.rules
                  .filter((r) => r.model_id === modelId)
                  .map((r) => (
                    <label key={r.id} className="state-check">
                      <input
                        type="checkbox"
                        name="excluded_rule_ids"
                        value={r.id}
                        defaultChecked={initial.excluded_rule_ids?.includes(
                          r.id,
                        )}
                      />
                      {r.label}
                    </label>
                  ))}
              </fieldset>
            </>
          )}
        </>
      ) : (
        <>
          {type !== "document-links" && (
            <label>
              Label
              <input
                name="label"
                defaultValue={initial.label || ""}
                required
                maxLength={160}
              />
            </label>
          )}
          {type === "facts" && (
            <div className="state-form-grid">
              <label>
                Stable condition key
                <input
                  name="key"
                  defaultValue={initial.key || ""}
                  pattern="[a-z][a-z0-9_]{0,63}"
                  placeholder="term_converted"
                  required
                />
              </label>
              <label>
                Recorded value
                <select
                  name="value"
                  defaultValue={
                    initial.value == null ? "UNKNOWN" : String(initial.value)
                  }
                >
                  <option value="UNKNOWN">
                    Unknown · enumerate conservatively
                  </option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </label>
              <label>
                Observed on
                <input
                  name="observed_on"
                  type="date"
                  defaultValue={initial.observed_on || ""}
                />
              </label>
              <label className="state-check">
                <input
                  type="checkbox"
                  name="future_mutable"
                  defaultChecked={initial.future_mutable}
                />
                Allow this recorded condition to vary in future analysis
              </label>
            </div>
          )}
          {type === "balances" && (
            <>
              <div className="state-form-grid">
                <label>
                  Instrument
                  <select
                    name="instrument_id"
                    defaultValue={initial.instrument_id || ""}
                    required
                  >
                    <option value="">Choose modeled instrument</option>
                    {optionRecords(
                      w.instruments.filter((i) =>
                        w.models
                          .find((m) => m.id === modelId)
                          ?.instrument_ids.includes(i.id),
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Opening balance date
                  <input
                    name="observed_on"
                    type="date"
                    defaultValue={initial.observed_on || ""}
                    required
                  />
                </label>
                <label>
                  Documented available amount (USD)
                  <input
                    name="available"
                    defaultValue={amountText(initial.available_cents)}
                    inputMode="decimal"
                    placeholder="Unknown if blank"
                  />
                </label>
                <label>
                  Documented unreimbursed drawing debt (USD)
                  <input
                    name="unreimbursed"
                    defaultValue={amountText(initial.unreimbursed_cents)}
                    inputMode="decimal"
                    placeholder="Unknown if blank; enter 0 only if established"
                  />
                </label>
              </div>
              <p className="state-caption">
                Balances apply at the opening of the date, before same-day
                sequenced events. Blank values remain unknown.
              </p>
            </>
          )}
          {type === "events" && (
            <>
              <div className="state-form-grid">
                <label>
                  Event type
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                  >
                    {[
                      "FACT_SET",
                      "ISSUANCE",
                      "RELEASE",
                      "EXPIRY",
                      "DRAW",
                      "REIMBURSEMENT",
                      "NOTICE",
                      "AMENDMENT",
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Executed on
                  <input
                    name="executed_on"
                    type="date"
                    defaultValue={initial.executed_on || ""}
                  />
                </label>
                <label>
                  Effective on
                  <input
                    name="effective_on"
                    type="date"
                    defaultValue={initial.effective_on || ""}
                  />
                </label>
                <label>
                  Documented same-day sequence
                  <input
                    name="sequence"
                    type="number"
                    min={0}
                    max={1000}
                    defaultValue={initial.sequence || 0}
                  />
                </label>
              </div>
              {eventType === "FACT_SET" ? (
                <div className="state-form-grid">
                  <label>
                    Condition
                    <select
                      name="fact_key"
                      defaultValue={initial.fact_key || ""}
                      required
                    >
                      <option value="">Select condition</option>
                      {facts.map((f) => (
                        <option key={f.id} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observed value
                    <select
                      name="fact_value"
                      defaultValue={String(initial.fact_value ?? true)}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </label>
                </div>
              ) : (
                <label>
                  Affected instrument
                  <select
                    name="instrument_id"
                    defaultValue={initial.instrument_id || ""}
                  >
                    <option value="">Not instrument-specific</option>
                    {optionRecords(
                      w.instruments.filter((i) =>
                        w.models
                          .find((m) => m.id === modelId)
                          ?.instrument_ids.includes(i.id),
                      ),
                    )}
                  </select>
                </label>
              )}
              {["DRAW", "REIMBURSEMENT"].includes(eventType) && (
                <div className="state-form-grid">
                  <label>
                    Explicit amount (USD)
                    <input
                      name="amount"
                      defaultValue={amountText(initial.amount_cents)}
                      required
                      inputMode="decimal"
                    />
                  </label>
                  {eventType === "DRAW" && (
                    <label>
                      Documented remaining availability (USD)
                      <input
                        name="available"
                        defaultValue={amountText(
                          initial.remaining_available_cents,
                        )}
                        inputMode="decimal"
                        placeholder="Leave unknown if not established"
                      />
                    </label>
                  )}
                </div>
              )}
            </>
          )}
          {type === "rules" && (
            <>
              <div className="state-form-grid">
                <label>
                  Rule kind
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {kinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                {!["CARDINALITY", "IMPLICATION", "PREREQUISITE"].includes(
                  kind,
                ) && (
                  <label>
                    Target record
                    <select
                      name="target_id"
                      defaultValue={initial.target_id || ""}
                      required
                    >
                      <option value="">Resolve target</option>
                      {optionRecords(
                        kind === "OBLIGATION" || kind === "LIMIT"
                          ? [...w.instruments, ...w.claims]
                          : w.instruments,
                      )}
                    </select>
                  </label>
                )}
                {kind === "REPLACEMENT" && (
                  <label>
                    Successor instrument
                    <select
                      name="successor_id"
                      defaultValue={initial.successor_id || ""}
                      required
                    >
                      <option value="">Choose successor</option>
                      {optionRecords(w.instruments)}
                    </select>
                  </label>
                )}
              </div>
              <label>
                Interpretation and governing context
                <textarea
                  name="interpretation"
                  defaultValue={initial.interpretation || ""}
                  required
                  minLength={3}
                  maxLength={2000}
                  placeholder="Explain the supported interpretation and unresolved context."
                />
              </label>
              <fieldset>
                <legend>Conditions</legend>
                <label>
                  Condition combination
                  <select
                    value={conditionMode}
                    onChange={(e) => setConditionMode(e.target.value)}
                  >
                    <option value="ALL">All listed conditions</option>
                    <option value="ANY">Any listed condition</option>
                  </select>
                </label>
                {conditions.map((condition, index) => (
                  <div className="state-condition" key={index}>
                    <select
                      aria-label={"Condition " + (index + 1)}
                      value={condition.key}
                      onChange={(e) =>
                        setConditions((v) =>
                          v.map((x, n) =>
                            n === index ? { ...x, key: e.target.value } : x,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Choose defined condition</option>
                      {facts.map((f) => (
                        <option key={f.id} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={"Condition value " + (index + 1)}
                      value={String(condition.value)}
                      onChange={(e) =>
                        setConditions((v) =>
                          v.map((x, n) =>
                            n === index
                              ? { ...x, value: e.target.value === "true" }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setConditions((v) => v.filter((_, n) => n !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  disabled={conditions.length >= 12}
                  onClick={() =>
                    setConditions((v) => [
                      ...v,
                      { key: facts[0]?.key || "", value: true },
                    ])
                  }
                >
                  Add condition
                </button>
                <p className="state-caption">
                  An empty condition is unconditional within the stated date
                  interval. Unknown conditions are enumerated; no legal
                  conclusion is inferred.
                </p>
              </fieldset>
              {kind === "CARDINALITY" && (
                <fieldset>
                  <legend>At-most constraint</legend>
                  {facts.map((f) => (
                    <label className="state-check" key={f.id}>
                      <input
                        type="checkbox"
                        name="member_keys"
                        value={f.key}
                        defaultChecked={initial.member_keys?.includes(f.key)}
                      />
                      {f.label}
                    </label>
                  ))}
                  <label>
                    Maximum active
                    <input
                      type="number"
                      name="max_active"
                      defaultValue={initial.max_active ?? 1}
                      min={0}
                      max={12}
                      required
                    />
                  </label>
                </fieldset>
              )}
              {["IMPLICATION", "PREREQUISITE"].includes(kind) && (
                <div className="state-form-grid">
                  <label>
                    Required consequent
                    <select
                      name="requires_key"
                      defaultValue={initial.requires_key || ""}
                      required
                    >
                      <option value="">Choose condition</option>
                      {facts.map((f) => (
                        <option key={f.id} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Required value
                    <select
                      name="requires_value"
                      defaultValue={String(initial.requires_value ?? true)}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </label>
                </div>
              )}
              {kind === "LIMIT" && (
                <div className="state-form-grid">
                  <label>
                    Metric
                    <select
                      name="metric"
                      defaultValue={initial.metric || "FACE"}
                    >
                      <option value="FACE">Instrument face</option>
                      <option value="DRAWABLE">Drawable exposure</option>
                      <option value="OBLIGATIONS">Underlying obligation</option>
                    </select>
                  </label>
                  <label>
                    Explicit cap (USD)
                    <input
                      name="amount"
                      defaultValue={amountText(initial.amount_cents)}
                      required
                      inputMode="decimal"
                    />
                  </label>
                </div>
              )}
              {kind === "STEP_UP" && (
                <label>
                  Required percentage
                  <input
                    name="percent"
                    type="number"
                    defaultValue={initial.percent || 125}
                    min={100}
                    max={1000}
                    required
                  />
                </label>
              )}
              <details>
                <summary>Temporal conditions and hypothetical status</summary>
                <div className="state-form-grid">
                  <label>
                    Valid from
                    <input
                      name="valid_from"
                      type="date"
                      defaultValue={initial.valid_from || ""}
                    />
                  </label>
                  <label>
                    Valid through
                    <input
                      name="valid_to"
                      type="date"
                      defaultValue={initial.valid_to || ""}
                    />
                  </label>
                  <label>
                    Dated prerequisite
                    <select
                      name="event_id"
                      defaultValue={initial.event_id || ""}
                    >
                      <option value="">None</option>
                      {optionRecords(events)}
                    </select>
                  </label>
                  <label>
                    Days after prerequisite
                    <input
                      name="lag_days"
                      type="number"
                      min={0}
                      max={3650}
                      defaultValue={initial.lag_days || 0}
                    />
                  </label>
                </div>
                <label className="state-check">
                  <input
                    type="checkbox"
                    name="hypothetical"
                    defaultChecked={initial.hypothetical}
                  />
                  Hypothetical interpretation · excluded from documented
                  scenarios
                </label>
              </details>
            </>
          )}
          {type === "document-links" && (
            <>
              <label>
                Referenced document or missing record
                <input
                  name="reference_label"
                  defaultValue={initial.reference_label || ""}
                  required
                  maxLength={200}
                />
              </label>
              <div className="state-form-grid">
                <label>
                  Relationship
                  <select
                    name="relationship"
                    defaultValue={initial.relationship || "REFERENCES"}
                  >
                    {[
                      "REFERENCES",
                      "AMENDS",
                      "SUPPLEMENTS",
                      "NOTICE_FOR",
                      "RELEASE_FOR",
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Target evidence
                  <select
                    name="target_document_id"
                    defaultValue={initial.target_document_id || ""}
                  >
                    <option value="">Missing from package</option>
                    {optionRecords(w.documents.filter((d) => !d.superseded))}
                  </select>
                </label>
              </div>
              <label className="state-check">
                <input
                  name="required_for_assessment"
                  type="checkbox"
                  defaultChecked={initial.required_for_assessment ?? true}
                />
                Assessment must remain incomplete until this reference is
                resolved
              </label>
            </>
          )}
          <fieldset>
            <legend>Exact supporting source · server-validated offsets</legend>
            <div className="state-form-grid">
              <label>
                Document
                <select
                  value={docId}
                  onChange={(e) => {
                    setDocId(e.target.value);
                    setPage(1);
                    setSpans([]);
                    setOccurrences([]);
                  }}
                >
                  <option value="">Choose current evidence</option>
                  {optionRecords(w.documents.filter((d) => !d.superseded))}
                </select>
              </label>
              <label>
                Page
                <select
                  value={page}
                  onChange={(e) => {
                    setPage(Number(e.target.value));
                    setSpans([]);
                    setOccurrences([]);
                  }}
                >
                  {doc?.pages.map((_: string, n: number) => (
                    <option value={n + 1} key={n}>
                      {n + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Verbatim quotation
              <textarea
                value={quote}
                onChange={(e) => {
                  setQuote(e.target.value);
                  setSpans([]);
                  setOccurrences([]);
                }}
                rows={4}
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={locating || !docId || !quote}
              onClick={() => void locate()}
            >
              {locating ? "Locating…" : "Locate exact quotation"}
            </button>
            {occurrences.length > 1 && (
              <div>
                <p>This quotation repeats. Select its intended occurrence.</p>
                {occurrences.map((span, n) => (
                  <label className="state-check" key={span.start}>
                    <input
                      type="radio"
                      name="source_occurrence"
                      checked={spans[0]?.start === span.start}
                      onChange={() => setSpans([span])}
                    />
                    Occurrence {n + 1} · characters {span.start}–{span.end}
                  </label>
                ))}
              </div>
            )}
            {spans.length === 1 && (
              <p className="state-caption">
                Source matched · page {spans[0].page} · offsets {spans[0].start}
                –{spans[0].end}
              </p>
            )}
          </fieldset>
        </>
      )}
      {proposal && (
        <label>
          Import reason
          <input
            name="import_reason"
            required
            minLength={3}
            maxLength={1800}
            defaultValue="Edited experimental proposal; separate verification remains required."
          />
        </label>
      )}
      <div className="actions">
        <button
          disabled={
            busy ||
            (!["models", "scenarios", "facts"].includes(type) &&
              spans.length !== 1)
          }
        >
          {proposal
            ? "Import edited proposal as unverified"
            : item
              ? "Save edit & require re-review"
              : "Save unverified record"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="state-caption">
        Saving does not verify an input. Reviews are separate decisions with
        identity and reasons.
      </p>
    </form>
  );
}
