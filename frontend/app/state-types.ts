export type Span = {
  document_id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
};
export type Entity = { id: string; [key: string]: any };
export type StateWorkspaceData = {
  project: Entity;
  models: Entity[];
  facts: Entity[];
  events: Entity[];
  rules: Entity[];
  scenarios: Entity[];
  instruments: Entity[];
  claims: Entity[];
  documents: Entity[];
  document_links: Entity[];
  runs: Entity[];
  findings: Entity[];
  reviews: Entity[];
  clause_jobs: Entity[];
  clause_proposals: Entity[];
  input_jobs: Entity[];
  input_proposals: Entity[];
  balances: Entity[];
};
export type StateView =
  "model" | "source-review" | "state-explorer" | "decision-brief";
export type StateApi = (
  path: string,
  body?: unknown,
  method?: string,
  version?: "v2" | "v3",
) => Promise<any>;
export type EditorType =
  | "models"
  | "facts"
  | "events"
  | "rules"
  | "scenarios"
  | "document-links"
  | "balances";
export type Condition = { key: string; value: boolean };
export const dollars = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v / 100)
    : "Unknown";
export const labels: Record<string, string> = {
  instrument_face: "Instrument face",
  drawable: "Drawable exposure",
  obligations: "Underlying obligations",
  reimbursement_debt: "Reimbursement debt",
};
export function minor(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Use a nonnegative USD amount with up to two decimals.");
  const [d, c = ""] = value.split(".");
  const n = Number(d) * 100 + Number(c.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 1e15)
    throw new Error("Amount exceeds supported precision.");
  return n;
}
export const amountText = (value: number | null | undefined) =>
  value == null
    ? ""
    : Math.floor(value / 100) + "." + String(value % 100).padStart(2, "0");
