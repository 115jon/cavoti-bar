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
const compactTokens = (value: number, unit: string) =>
  `${value.toFixed(2).replace(/\.?0+$/, "")}${unit}`;
export const tokens = (value: number) =>
  value >= 1e9
    ? compactTokens(value / 1e9, "B")
    : value >= 1e6
      ? compactTokens(value / 1e6, "M")
      : value >= 1e3
        ? compactTokens(value / 1e3, "K")
        : integer(value);
export const date = (value: string | null) =>
  value && !Number.isNaN(Date.parse(value))
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
  | "last-24-hours"
  | "today"
  | "yesterday"
  | "last-7-days"
  | "last-14-days"
  | "last-30-days"
  | "this-month"
  | "last-month";

export const dateRangeOptions: Array<{
  value: DateRangePreset;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last-24-hours", label: "Last 24 hours" },
  { value: "last-7-days", label: "Last 7 days" },
  { value: "last-14-days", label: "Last 14 days" },
  { value: "last-30-days", label: "Last 30 days" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
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
  switch (preset) {
    case "last-24-hours":
      start.setDate(start.getDate() - 1);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "last-7-days":
      start.setDate(start.getDate() - 6);
      break;
    case "last-14-days":
      start.setDate(start.getDate() - 13);
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

export function defaultUsageFilterState(now = new Date()): UsageFilters {
  const range = dateRangeForPreset("last-7-days", now);
  return {
    ...range,
    apiKeyId: null,
    model: "",
    groupId: null,
    requestType: "",
    billingType: null,
    billingMode: "",
    sortBy: "created_at",
    sortOrder: "desc",
    granularity: "day",
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

export function planVariant(
  status: string,
  quotaState: "available" | "limited",
): "success" | "warning" | "outline" {
  const normalized = status.toLowerCase();
  if (
    quotaState === "limited" ||
    ["limited", "degraded", "expired"].includes(normalized)
  ) {
    return "warning";
  }
  return ["active", "available", "healthy"].includes(normalized)
    ? "success"
    : "outline";
}
