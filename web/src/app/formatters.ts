import type { UsageFilters, UsageUnit } from "../domain/snapshot";

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
export const integer = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
export const quantity = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
export const tokens = (value: number) =>
  value >= 1e9
    ? `${(value / 1e9).toFixed(2).replace(/\.00$/, "")}B`
    : value >= 1e6
      ? `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`
      : value >= 1e3
        ? `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`
        : integer(value);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not provided";
export const usageAmount = (value: number, unit: UsageUnit) =>
  unit === "points" ? `${quantity(value)} pts` : money(value);

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "last-30-days";

export const dateRangeOptions: Array<{
  value: DateRangePreset;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-30-days", label: "Last 30 days" },
];

export function resetLabel(value: string | null): string {
  if (!value) return "Reset time unavailable";
  const remaining = Date.parse(value) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Resetting soon";
  const minutes = Math.floor(remaining / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${rest}m`;
  return `Resets in ${Math.max(1, rest)}m`;
}

export function localDateInput(dateValue: Date): string {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateRangeForPreset(
  preset: DateRangePreset,
  now = new Date(),
): Pick<UsageFilters, "startDate" | "endDate"> {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  const day = end.getDay();
  switch (preset) {
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "this-week":
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      break;
    case "last-week":
      start.setDate(start.getDate() - (day === 0 ? 13 : day + 6));
      end.setDate(end.getDate() - (day === 0 ? 7 : day));
      break;
    case "this-month":
      start.setDate(1);
      break;
    case "last-month":
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(0);
      break;
    case "last-30-days":
      start.setDate(start.getDate() - 29);
      break;
    case "today":
      break;
  }
  return { startDate: localDateInput(start), endDate: localDateInput(end) };
}

export function defaultUsageFilterState(): UsageFilters {
  const range = dateRangeForPreset("last-30-days");
  return {
    ...range,
    apiKeyId: null,
    model: "",
    groupId: null,
    requestType: "",
    billingType: null,
    billingMode: "",
  };
}

export function monitorVariant(
  status: string,
): "success" | "warning" | "outline" {
  return status === "operational"
    ? "success"
    : status === "degraded" || status === "outage"
      ? "warning"
      : "outline";
}
