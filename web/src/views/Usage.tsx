import { useState } from "react";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  ChartBarIcon as ChartBar,
  StackIcon as Stack,
  UsersThreeIcon as UsersThree,
  XIcon as X,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope, UsageFilters as UsageFilterState } from "../domain/snapshot";
import { defaultUsageFilterState, integer, money, tokens } from "../app/formatters";
import { Badge, Empty, TilePager, useCompactTiles } from "../components/app/shared";
import { Button } from "../components/ui/button";

function StatRail({ snapshot }: { snapshot: SnapshotEnvelope }) {
  return (
    <div className="stat-rail">
      <div>
        <span>Requests</span>
        <strong>{integer(snapshot.stats.requests)}</strong>
      </div>
      <div>
        <span>Total tokens</span>
        <strong>{tokens(snapshot.stats.totalTokens)}</strong>
      </div>
      <div>
        <span>Actual cost</span>
        <strong>{money(snapshot.stats.actualCost)}</strong>
      </div>
    </div>
  );
}

function ModelRows({ rows }: { rows: Array<{ name: string; requests: number; tokens: number; actualCost: number }> }) {
  return rows.length ? (
    <div className="model-rows">
      {rows.map((row) => (
        <div className="model-row" key={row.name}>
          <span>
            <i className="model-dot" />
            {row.name}
          </span>
          <strong>{money(row.actualCost)}</strong>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No model detail" message="The connected session returned no model breakdown." compact />
  );
}

function DataRows({ rows, empty }: { rows: Array<{ name: string; requests: number; tokens: number; actualCost: number }>; empty: string }) {
  return rows.length ? (
    <div className="data-rows">
      {rows.map((row) => (
        <div className="data-row" key={row.name}>
          <span className="row-name">{row.name}</span>
          <span>{integer(row.requests)} req</span>
          <span>{tokens(row.tokens)}</span>
          <strong>{money(row.actualCost)}</strong>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No rows" message={empty} compact />
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="usage-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.value} key={`${label}-${option.value}`}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function UsageFilters({
  snapshot,
  filters,
  onChange,
  onRefresh,
  onReset,
}: {
  snapshot: SnapshotEnvelope;
  filters: UsageFilterState;
  onChange: (filters: UsageFilterState) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const models = snapshot.models
    .map((model) => model.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();
  const update = (patch: Partial<UsageFilterState>) => onChange({ ...filters, ...patch });
  return (
    <section className="usage-filters">
      <div className="usage-filter-grid">
        <label className="usage-filter-field">
          <span>Date range</span>
          <div className="usage-date-pair">
            <input type="date" value={filters.startDate} onChange={(event) => update({ startDate: event.target.value })} />
            <input type="date" value={filters.endDate} onChange={(event) => update({ endDate: event.target.value })} />
          </div>
        </label>
        <FilterSelect
          label="API key"
          value={filters.apiKeyId === null ? "" : String(filters.apiKeyId)}
          options={[
            { value: "", label: "All API keys" },
            ...snapshot.apiKeys.map((item) => ({ value: String(item.id), label: item.name })),
          ]}
          onChange={(value) => update({ apiKeyId: value ? Number(value) : null })}
        />
        <FilterSelect
          label="Model"
          value={filters.model}
          options={[{ value: "", label: "All models" }, ...models.map((model) => ({ value: model, label: model }))]}
          onChange={(model) => update({ model })}
        />
        <FilterSelect
          label="Group"
          value={filters.groupId === null ? "" : String(filters.groupId)}
          options={[
            { value: "", label: "All groups" },
            ...snapshot.groupOptions.map((item) => ({ value: String(item.id), label: item.name })),
          ]}
          onChange={(value) => update({ groupId: value ? Number(value) : null })}
        />
        <FilterSelect
          label="Type"
          value={filters.requestType}
          options={[
            { value: "", label: "All types" },
            { value: "ws_v2", label: "WS" },
            { value: "stream", label: "Stream" },
            { value: "sync", label: "Sync" },
          ]}
          onChange={(requestType) => update({ requestType })}
        />
        <FilterSelect
          label="Billing type"
          value={filters.billingType === null ? "" : String(filters.billingType)}
          options={[
            { value: "", label: "All billing types" },
            { value: "0", label: "Balance" },
            { value: "1", label: "Subscription" },
          ]}
          onChange={(value) => update({ billingType: value ? Number(value) : null })}
        />
        <FilterSelect
          label="Billing mode"
          value={filters.billingMode}
          options={[
            { value: "", label: "All billing modes" },
            { value: "token", label: "Token" },
            { value: "per_request", label: "Per request" },
            { value: "image", label: "Image" },
          ]}
          onChange={(billingMode) => update({ billingMode })}
        />
      </div>
      <div className="usage-filter-actions">
        <Button size="sm" onClick={onRefresh}>
          <ArrowsClockwise data-icon="inline-start" /> Refresh usage
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          <X data-icon="inline-start" /> Reset filters
        </Button>
      </div>
    </section>
  );
}

function TrendChart({ rows }: { rows: SnapshotEnvelope["dailyTrend"] }) {
  if (!rows.length) return <Empty title="No trend data" message="Try a wider date range or fewer filters." compact />;
  const width = 640;
  const height = 190;
  const pad = 18;
  const max = Math.max(...rows.map((row) => row.actualCost), 0.01);
  const points = rows
    .map(
      (row, index) =>
        `${pad + (index / Math.max(rows.length - 1, 1)) * (width - pad * 2)},${height - pad - (row.actualCost / max) * (height - pad * 2)}`,
    )
    .join(" ");
  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily actual cost trend" preserveAspectRatio="none">
        <path d={`M ${pad} ${height - pad} H ${width - pad}`} className="chart-axis" />
        <polyline points={points} className="chart-line" />
        <circle cx={points.split(" ")[0]?.split(",")[0]} cy={points.split(" ")[0]?.split(",")[1]} r="3" className="chart-point" />
      </svg>
      <div className="chart-labels">
        <span>{rows[0]?.date}</span>
        <span>{rows[rows.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function DistributionChart({ rows }: { rows: Array<{ name: string; actualCost: number }> }) {
  const values = rows.filter((row) => row.actualCost > 0).slice(0, 5);
  const total = values.reduce((sum, row) => sum + row.actualCost, 0);
  if (!total) return <Empty title="No distribution data" message="No cost distribution returned for these filters." compact />;
  let cursor = 0;
  const colors = ["#8f4a22", "#2f6b3f", "#956412", "#7b628e", "#536b7f"];
  const stops = values
    .map((row, index) => {
      const start = cursor;
      cursor += (row.actualCost / total) * 100;
      return `${colors[index]} ${start}% ${cursor}%`;
    })
    .join(", ");
  return (
    <div className="distribution-chart">
      <div className="donut-chart" style={{ background: `conic-gradient(${stops})` }}>
        <span>{money(total)}</span>
      </div>
      <div className="distribution-legend">
        {values.map((row, index) => (
          <div key={row.name}>
            <i style={{ background: colors[index] }} />
            <span>{row.name}</span>
            <strong>{money(row.actualCost)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageWide({
  snapshot,
  filters,
  onChange,
  onRefresh,
  onReset,
}: {
  snapshot: SnapshotEnvelope;
  filters: UsageFilterState;
  onChange: (filters: UsageFilterState) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  return (
    <div className="view-stack wide-usage">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Usage dashboard</span>
          <h1>Usage</h1>
        </div>
        <Badge variant="outline">
          {filters.startDate} to {filters.endDate}
        </Badge>
      </div>
      <UsageFilters snapshot={snapshot} filters={filters} onChange={onChange} onRefresh={onRefresh} onReset={onReset} />
      <div className="usage-chart-grid">
        <section className="surface-section chart-section">
          <div className="section-top">
            <div>
              <span className="eyebrow">Actual cost</span>
              <h2>Daily trend</h2>
            </div>
            <ChartBar className="section-icon" />
          </div>
          <TrendChart rows={snapshot.dailyTrend} />
        </section>
        <section className="surface-section chart-section">
          <div className="section-top">
            <div>
              <span className="eyebrow">Share of spend</span>
              <h2>By model</h2>
            </div>
            <Stack className="section-icon" />
          </div>
          <DistributionChart rows={snapshot.models} />
        </section>
      </div>
      <StatRail snapshot={snapshot} />
      <div className="wide-data-grid">
        <section className="surface-section">
          <div className="section-top">
            <h2>Endpoints</h2>
          </div>
          <DataRows rows={snapshot.stats.endpoints.slice(0, 5)} empty="No endpoint data returned." />
        </section>
        <section className="surface-section">
          <div className="section-top">
            <h2>Groups</h2>
          </div>
          <DataRows rows={snapshot.groups.slice(0, 5)} empty="No group data returned." />
        </section>
      </div>
    </div>
  );
}

export function Usage({ snapshot }: { snapshot: SnapshotEnvelope }) {
  const [filters, setFilters] = useState(defaultUsageFilterState);
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const apply = () => window.dispatchEvent(new CustomEvent("cavoti-usage-refresh", { detail: filters }));
  const reset = () => {
    const next = defaultUsageFilterState();
    setFilters(next);
    window.dispatchEvent(new CustomEvent("cavoti-usage-refresh", { detail: next }));
  };
  if (!compact) return <UsageWide snapshot={snapshot} filters={filters} onChange={setFilters} onRefresh={apply} onReset={reset} />;
  const pageCount = 6;
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">
              {page === 0
                ? "Filters"
                : page === 1
                  ? "Daily trend"
                  : page === 2
                    ? "Model distribution"
                    : page === 3
                      ? "Endpoints"
                      : page === 4
                        ? "Groups"
                        : "Models"}
            </span>
            <h1>Usage</h1>
          </div>
          <div className="tile-heading-actions">
            <Badge variant="outline">
              {filters.startDate} to {filters.endDate}
            </Badge>
            <TilePager page={page} count={pageCount} onChange={setPage} label="Usage screen" />
          </div>
        </div>
        {page === 0 ? (
          <>
            <UsageFilters snapshot={snapshot} filters={filters} onChange={setFilters} onRefresh={apply} onReset={reset} />
            <StatRail snapshot={snapshot} />
          </>
        ) : page === 1 ? (
          <section className="surface-section chart-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Daily trend</h2>
              </div>
              <ChartBar className="section-icon" />
            </div>
            <TrendChart rows={snapshot.dailyTrend} />
          </section>
        ) : page === 2 ? (
          <section className="surface-section chart-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Share of spend</span>
                <h2>By model</h2>
              </div>
              <Stack className="section-icon" />
            </div>
            <DistributionChart rows={snapshot.models} />
          </section>
        ) : page === 3 ? (
          <section className="surface-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Cost centers</h2>
              </div>
              <span className="muted-label">endpoints</span>
            </div>
            <DataRows rows={snapshot.stats.endpoints.slice(0, 8)} empty="No endpoint data returned." />
          </section>
        ) : page === 4 ? (
          <section className="surface-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Billing groups</h2>
              </div>
              <UsersThree className="section-icon" />
            </div>
            <DataRows rows={snapshot.groups.slice(0, 8)} empty="No group data returned." />
          </section>
        ) : (
          <section className="surface-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Model spend</h2>
              </div>
              <ChartBar className="section-icon" />
            </div>
            <ModelRows rows={snapshot.models.slice(0, 8)} />
          </section>
        )}
        <TilePager page={page} count={pageCount} onChange={setPage} label="Usage screen" />
      </div>
    </div>
  );
}
