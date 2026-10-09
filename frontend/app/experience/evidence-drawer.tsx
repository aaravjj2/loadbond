"use client";
import { ArrowUpRight, FileText, ShieldCheck, History } from "lucide-react";
import {
  type Workspace,
  type Item,
  type Evidence,
  label,
  preciseMoney,
} from "./types";
import { Overlay, Badge } from "./ui";
export default function EvidenceDrawer({
  item,
  table,
  w,
  close,
  openDocument,
  edit,
  historical = false,
}: {
  item: Item;
  table: string;
  w: Workspace;
  close: () => void;
  openDocument: (id: string, page: number, span?: Evidence) => void;
  edit?: () => void;
  historical?: boolean;
}) {
  const reviews = w.reviews?.filter((r) => r.record_id === item.id) || [];
  return (
    <Overlay title="Supporting evidence" close={close}>
      <div className="lb-evidence-identity">
        <div className="lb-eyebrow">
          {table === "instruments"
            ? "INSTRUMENT"
            : table === "claims"
              ? "OBLIGATION"
              : table === "dependencies"
                ? "CONSTRAINT"
                : "SITE"}
        </div>
        <h3>{label(item)}</h3>
        <div className="lb-inline">
          <Badge status={item.verification} />
          {historical && <Badge status="HISTORICAL" />}
          {item.hypothetical && <Badge>Hypothetical</Badge>}
        </div>
      </div>
      <dl className="lb-facts">
        {table === "instruments" ? (
          <>
            <div>
              <dt>Face amount</dt>
              <dd>{preciseMoney(item.face_cents)}</dd>
            </div>
            <div>
              <dt>Recorded modeling basis</dt>
              <dd>
                {item.basis}
                {item.basis_hypothetical ? " · hypothetical" : ""}
              </dd>
            </div>
            <div>
              <dt>Beneficiary</dt>
              <dd>{item.beneficiary}</dd>
            </div>
            <div>
              <dt>Release evidence</dt>
              <dd>{item.release_verified ? "Reviewed" : "Not reviewed"}</dd>
            </div>
          </>
        ) : table === "claims" ? (
          <>
            <div>
              <dt>Obligation amount</dt>
              <dd>{preciseMoney(item.amount_cents)}</dd>
            </div>
            <div>
              <dt>Component treatment</dt>
              <dd>{item.mapping}</dd>
            </div>
            <div>
              <dt>Payment condition</dt>
              <dd>{item.kind}</dd>
            </div>
          </>
        ) : table === "dependencies" ? (
          <div>
            <dt>Maximum active claims</dt>
            <dd>{item.max_active}</dd>
          </div>
        ) : (
          <div>
            <dt>Commercial status</dt>
            <dd>{item.commercial_status}</dd>
          </div>
        )}
      </dl>
      <div className="lb-drawer-label">
        <FileText size={16} />
        Source passages
      </div>
      {["evidence", "basis_evidence", "release_evidence"].flatMap((role) =>
        (item[role] || []).map((e: any, index: number) => {
          const d = w.documents.find((d) => d.id === e.document_id);
          return (
            <div className="lb-citation" key={role + index}>
              <div className="lb-citation-meta">
                <span>
                  {d?.name || "Source document"} · v{d?.version || "?"} · p
                  {e.page}
                </span>
                <span>{role.replaceAll("_", " ")}</span>
              </div>
              <blockquote>{e.quote}</blockquote>
              <button
                className="lb-link"
                onClick={() => openDocument(e.document_id, e.page, e)}
              >
                Open source document
                <ArrowUpRight size={14} />
              </button>
            </div>
          );
        }),
      )}
      <div className="lb-drawer-label">
        <ShieldCheck size={16} />
        Review decision
      </div>
      <p className="lb-muted">
        {item.verification === "VERIFIED"
          ? "Accepted as a model input. This does not establish legal enforceability."
          : "This input has not been accepted for calculation."}
      </p>
      {reviews.length ? (
        reviews.map((r) => (
          <div className="lb-review-entry" key={r.id}>
            <strong>{r.reviewer}</strong>
            <span>{new Date(r.at).toLocaleString()}</span>
            <p>{r.reason}</p>
          </div>
        ))
      ) : (
        <p className="lb-small">
          {w.project.synthetic
            ? "The optional fixture includes pre-reviewed synthetic inputs. They are demonstration assumptions."
            : "No review history is available in these inputs."}
        </p>
      )}
      {item.extraction_provenance && (
        <details className="lb-provenance">
          <summary>
            <History size={15} />
            Extraction provenance
          </summary>
          <dl className="lb-facts">
            {Object.entries(item.extraction_provenance).map(([k, v]) => (
              <div key={k}>
                <dt>{k.replaceAll("_", " ")}</dt>
                <dd className="lb-mono">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {edit && !historical && (
        <button className="lb-secondary full" onClick={edit}>
          Edit model input
        </button>
      )}
    </Overlay>
  );
}
