export type Evidence = {
  document_id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
};
export type Item = {
  id: string;
  label?: string;
  name?: string;
  verification?: string;
  evidence?: Evidence[];
  [key: string]: any;
};
export type Doc = Item & {
  pages: string[];
  superseded: boolean;
  processing: string;
  version: number;
};
export type Workspace = {
  project: Item;
  sites: Item[];
  documents: Doc[];
  instruments: Item[];
  claims: Item[];
  dependencies: Item[];
  scenarios: Item[];
  runs: Item[];
  reviews: Item[];
  events: Item[];
  extractions: Item[];
  proposals: Item[];
};
export type View =
  "assessment" | "review" | "register" | "scenarios" | "evidence";
export type Kind =
  "project" | "sites" | "instruments" | "claims" | "dependencies" | "scenarios";
export type Comparison = {
  project_revision: number;
  inputs: Workspace;
  comparisons: {
    scenario_id: string;
    scenario: Item;
    snapshot_hash: string;
    result: any;
  }[];
  notice: string;
};
export type Api = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<any>;
export const titles: Record<Kind, string> = {
  project: "Project",
  sites: "Site",
  instruments: "Instrument",
  claims: "Obligation",
  dependencies: "Constraint",
  scenarios: "Scenario",
};
export const money = (value: unknown, compact = false) =>
  typeof value === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        ...(compact && Math.abs(value) >= 100000000
          ? { notation: "compact" as const, maximumFractionDigits: 2 }
          : { maximumFractionDigits: value % 100 === 0 ? 0 : 2 }),
      }).format(value / 100)
    : "Unknown";
export const preciseMoney = (value: unknown) =>
  typeof value === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value / 100)
    : "Unknown";
export function cents(v: FormDataEntryValue | null) {
  const t = String(v || "").trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t))
    throw new Error(
      "Enter a nonnegative dollar amount with at most two decimals.",
    );
  const [d, c = ""] = t.split(".");
  const n = Number(d) * 100 + Number(c.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Amount is too large.");
  return n;
}
export const label = (item: Item) => item.label || item.name || item.id;
export const statusLabel = (status?: string) =>
  ({
    VERIFIED: "Reviewed",
    UNVERIFIED: "Needs review",
    REJECTED: "Excluded",
    PENDING: "Proposed",
    IMPORTED: "Imported",
    DISMISSED: "Dismissed",
    REVIEWED: "Review complete",
    UPLOADED: "Not completed",
    COMPLETE: "Complete",
    INCOMPLETE: "Incomplete",
  })[status || ""] ||
  status ||
  "Not reviewed";
