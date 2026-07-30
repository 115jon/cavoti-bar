import { memo, useState } from "react";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  StackIcon as Stack,
} from "@phosphor-icons/react";
import type { ModelPricing, SnapshotEnvelope } from "../domain/snapshot";
import {
  groupTone,
  modelBrand,
  modelFamily,
  modelFamilyTone,
  modelLogoUrl,
  multiplierTone,
} from "../domain/model-logos";
import { money } from "../app/formatters";
import { Badge, Empty } from "../components/app/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

function price(value: number | null, mode: string, unit: string) {
  if (value === null)
    return mode === "token" && unit === "cacheWrite" ? "Free" : null;
  return money(mode === "token" ? value * 1_000_000 : value);
}

function priceUnit(mode: string) {
  if (mode === "per_request") return "/ request";
  if (mode === "per_second") return "/ second";
  return "/ 1M tokens";
}

function Logo({ model, platform }: { model: string; platform: string }) {
  const src = modelLogoUrl(model, platform);
  return src ? (
    <img
      className="size-5 object-contain"
      src={src}
      alt={`${modelBrand(model, platform)} logo`}
    />
  ) : (
    <span className="grid size-5 place-items-center rounded-md border border-(--line) text-[9px] font-bold text-(--accent-ink)">
      {modelBrand(model, platform).slice(0, 1)}
    </span>
  );
}

function FamilyIcon({ family }: { family: string }) {
  const src = modelLogoUrl(family, family);
  return src ? (
    <img className="size-4 object-contain" src={src} alt="" />
  ) : (
    <span className="grid size-4 place-items-center text-[9px] font-bold">
      {family.slice(0, 1)}
    </span>
  );
}

function PriceCell({
  label,
  value,
  mode,
  unit,
}: {
  label: string;
  value: number | null;
  mode: string;
  unit: string;
}) {
  const amount = price(value, mode, unit);
  if (amount === null) return null;
  return (
    <div className="min-w-24 rounded-md border border-(--line) bg-(--canvas) px-2 py-1.5">
      <span className="block text-[10px] text-(--ink-muted)">{label}</span>
      <strong className="block text-sm font-semibold tabular-nums">
        {amount}
      </strong>
      <span className="block text-[10px] text-(--ink-muted)">
        {priceUnit(mode)}
      </span>
    </div>
  );
}

function PricingRow({
  item,
  showFamilyBadge,
  showGroupBadge,
}: {
  item: ModelPricing;
  showFamilyBadge: boolean;
  showGroupBadge: boolean;
}) {
  const family = modelFamily(item.name, item.platform);
  return (
    <article className="grid gap-3 border-b border-(--line) px-3 py-3 last:border-b-0 lg:grid-cols-[minmax(15rem,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Logo model={item.name} platform={item.platform} />
          <strong className="truncate font-mono text-sm">{item.name}</strong>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-(--ink-muted)">
          {showFamilyBadge ? (
            <span
              className={`rounded-md border px-1.5 py-0.5 font-medium ${modelFamilyTone(family)}`}
            >
              {family}
            </span>
          ) : null}
          <Badge variant="outline">
            {item.billingMode.replaceAll("_", " ")}
          </Badge>
          {showGroupBadge ? (
            <span
              className={`rounded-md border px-1.5 py-0.5 font-medium ${groupTone(item.groupId)}`}
            >
              {item.groupName || `Group ${item.groupId}`}
              {item.rateMultiplier ? (
                <span className={multiplierTone(item.rateMultiplier)}>
                  {` · ${item.rateMultiplier}x`}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {item.intervals.length ? (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-(--ink-muted)">
            {item.intervals.map((interval) => {
              const entry = interval as {
                tier_label?: string;
                per_request_price?: number | null;
                min_tokens?: number;
              };
              return (
                <span
                  key={`${entry.tier_label ?? "tier"}-${entry.min_tokens ?? 0}-${entry.per_request_price ?? "free"}`}
                >
                  {entry.tier_label ?? "Tier"}
                  {entry.per_request_price !== null &&
                  entry.per_request_price !== undefined
                    ? ` ${money(entry.per_request_price)}`
                    : ""}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 lg:justify-end">
        <PriceCell
          label="Input"
          value={item.inputPrice}
          mode={item.billingMode}
          unit="input"
        />
        <PriceCell
          label="Output"
          value={item.outputPrice}
          mode={item.billingMode}
          unit="output"
        />
        <PriceCell
          label="Cache write"
          value={item.cacheWritePrice}
          mode={item.billingMode}
          unit="cacheWrite"
        />
        <PriceCell
          label="Cache read"
          value={item.cacheReadPrice}
          mode={item.billingMode}
          unit="cacheRead"
        />
        <PriceCell
          label="Per request"
          value={item.perRequestPrice}
          mode="per_request"
          unit="request"
        />
        {item.pointPrice !== null ? (
          <div className="min-w-24 rounded-md border border-(--line) bg-(--canvas) px-2 py-1.5">
            <span className="block text-[10px] text-(--ink-muted)">Points</span>
            <strong className="block text-sm font-semibold tabular-nums">
              {item.pointPrice}
            </strong>
            <span className="block text-[10px] text-(--ink-muted)">
              points / request
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const Pricing = memo(function Pricing({
  snapshot,
}: {
  snapshot: SnapshotEnvelope;
}) {
  const families = new Map<string, Set<string>>();
  for (const item of snapshot.modelPricing) {
    const family = modelFamily(item.name, item.platform);
    const models = families.get(family) ?? new Set<string>();
    models.add(item.name);
    families.set(family, models);
  }
  const familyOptions = [...families.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const [family, setFamily] = useState("all");
  const [group, setGroup] = useState("all");
  const groups = new Map<
    number,
    { name: string; count: Set<string>; multiplier?: number }
  >();
  for (const item of snapshot.modelPricing) {
    if (family !== "all" && modelFamily(item.name, item.platform) !== family) {
      continue;
    }
    const group = groups.get(item.groupId) ?? {
      name: item.groupName || `Group ${item.groupId}`,
      count: new Set<string>(),
      multiplier: item.rateMultiplier,
    };
    group.count.add(item.name);
    groups.set(item.groupId, group);
  }
  const activeGroup =
    group !== "all" && groups.has(Number(group)) ? group : "all";
  const filtered = snapshot.modelPricing.filter(
    (item) =>
      (family === "all" || modelFamily(item.name, item.platform) === family) &&
      (activeGroup === "all" || String(item.groupId) === activeGroup),
  );
  const groupOptions = [...groups.entries()].sort(
    ([, left], [, right]) =>
      (left.multiplier ?? Number.POSITIVE_INFINITY) -
        (right.multiplier ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name),
  );
  const filteredModels = new Set(filtered.map((item) => item.name));
  return (
    <div className="flex w-full max-w-370 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold">Model pricing</h1>
          <p className="mt-1 text-sm text-(--ink-muted)">
            Current Cavoti prices by model family and price group.
          </p>
        </div>
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-(--line) text-(--ink-muted) hover:bg-(--canvas)"
          aria-label="Refresh model pricing"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("cavoti-refresh"))
          }
        >
          <ArrowsClockwise />
        </button>
      </div>
      <section className="flex flex-col gap-3 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
        <div className="text-xs font-semibold text-(--ink-muted)">Models</div>
        <Tabs value={family} onValueChange={setFamily}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="all" className="gap-1.5">
              <Stack className="size-4" />
              All{" "}
              <span className="text-[10px] text-(--ink-muted)">
                {new Set(snapshot.modelPricing.map((item) => item.name)).size}
              </span>
            </TabsTrigger>
            {familyOptions.map(([name, models]) => (
              <TabsTrigger
                value={name}
                key={name}
                className={`gap-1.5 ${modelFamilyTone(name)} ${family === name ? "ring-2 ring-accent" : "opacity-80"}`}
              >
                <FamilyIcon family={name} />
                {name}{" "}
                <span className="text-[10px] opacity-70">{models.size}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="text-xs font-semibold text-(--ink-muted)">
          Price groups
        </div>
        <Tabs value={activeGroup} onValueChange={setGroup}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="all" className="gap-1.5">
              All groups{" "}
              <span className="text-[10px] text-(--ink-muted)">
                {groupOptions.length}
              </span>
            </TabsTrigger>
            {groupOptions.map(([id, entry]) => (
              <TabsTrigger
                value={String(id)}
                key={id}
                className={`gap-1.5 ${groupTone(id)} ${activeGroup === String(id) ? "ring-2 ring-accent" : "opacity-80"}`}
              >
                {entry.name}
                {entry.multiplier ? (
                  <span
                    className={`text-[10px] font-semibold ${multiplierTone(entry.multiplier)}`}
                  >
                    {entry.multiplier}x
                  </span>
                ) : null}
                <span className="text-[10px] opacity-70">
                  {entry.count.size}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>
      {filtered.length ? (
        <Card className="rounded-xl border border-(--line) bg-white/75 shadow-sm">
          <CardHeader className="flex items-center justify-between gap-3 border-b border-(--line) p-4">
            <div>
              <CardTitle className="text-base">
                {family === "all" ? "All model families" : family}
              </CardTitle>
              <span className="text-xs text-(--ink-muted)">
                {filteredModels.size} models · {filtered.length} price entries
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.map((item) => (
              <PricingRow
                item={item}
                showFamilyBadge={family === "all"}
                showGroupBadge={activeGroup === "all"}
                key={`${item.platform}-${item.name}-${item.groupId}`}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Empty
          title="No pricing records"
          message="Connect Cavoti to read current model pricing."
        />
      )}
    </div>
  );
});
