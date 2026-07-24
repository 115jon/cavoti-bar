import type { UsageFilters, UsageUnit } from "../domain/snapshot";

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
export const integer = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
export const quantity = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
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
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value))
    : "Not provided";
export const usageAmount = (value: number, unit: UsageUnit) => (unit === "points" ? `${quantity(value)} pts` : money(value));

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

export function defaultUsageFilterState(): UsageFilters {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return {
    startDate: localDateInput(start),
    endDate: localDateInput(end),
    apiKeyId: null,
    model: "",
    groupId: null,
    requestType: "",
    billingType: null,
    billingMode: "",
  };
}

export function monitorVariant(status: string): "success" | "warning" | "outline" {
  return status === "operational" ? "success" : status === "degraded" || status === "outage" ? "warning" : "outline";
}
