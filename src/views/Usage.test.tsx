import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { trendChartData, trendTooltipData, Usage } from "./Usage";
import { liveSnapshot } from "../test/fixtures";
import { dateRangeForPreset } from "../app/formatters";
import { TooltipProvider } from "../components/ui/tooltip";

describe("Usage", () => {
  it("preserves aggregate token totals when trend breakdowns are absent", () => {
    expect(
      trendChartData([
        {
          date: "2026-07-24",
          requests: 4,
          tokens: 128,
          actualCost: 0.12,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        totalTokens: 128,
        inputTokens: 0,
        outputTokens: 0,
      }),
    ]);
  });

  it("maps aggregate trend tooltip payloads to visible values", () => {
    expect(
      trendTooltipData([
        { dataKey: "totalTokens", name: "Total tokens", value: 128 },
      ]),
    ).toEqual({ totalTokens: 128 });
  });

  it("reveals custom date inputs when the custom range is selected", async () => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
      scrollIntoView: { configurable: true, value: () => undefined },
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 768,
    });
    render(<Usage snapshot={liveSnapshot} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Date range" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "Custom range" }),
    );

    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
  });

  it("dispatches a same-day refresh when Today is selected", async () => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
      scrollIntoView: { configurable: true, value: () => undefined },
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 768,
    });
    const refreshes: Array<
      CustomEvent<{ filters: { startDate: string; endDate: string } }>
    > = [];
    const listener = (event: Event) =>
      refreshes.push(
        event as CustomEvent<{
          filters: { startDate: string; endDate: string };
        }>,
      );
    window.addEventListener("cavoti-usage-refresh", listener);
    render(<Usage snapshot={liveSnapshot} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Date range" }));
    fireEvent.click(await screen.findByRole("option", { name: "Today" }));

    expect(
      screen.getByRole("combobox", { name: "Date range" }),
    ).toHaveTextContent("Today");
    expect(refreshes.at(-1)?.detail.filters).toMatchObject({
      startDate: dateRangeForPreset("today").startDate,
      endDate: dateRangeForPreset("today").endDate,
      granularity: "hour",
    });
    window.removeEventListener("cavoti-usage-refresh", listener);
  });

  it("switches model metrics and activity tabs for rich usage data", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 768,
    });
    render(
      <TooltipProvider>
        <Usage
          snapshot={{
            ...liveSnapshot,
            models: [
              {
                name: "gpt-5.6-luna",
                requests: 10,
                tokens: 100,
                actualCost: 0.2,
                standardCost: 0.3,
              },
            ],
            usageLogs: [
              {
                id: 1,
                requestId: "req-1",
                apiKeyName: "Primary",
                model: "gpt-5.6-luna",
                reasoningEffort: "high",
                endpoint: "/v1/chat/completions",
                groupName: "Core",
                inputTokens: 40,
                outputTokens: 30,
                cacheCreationTokens: 10,
                cacheReadTokens: 20,
                totalTokens: 100,
                actualCost: 0.2,
                standardCost: 0.3,
                inputCost: 0.04,
                outputCost: 0.06,
                cacheCreationCost: 0,
                cacheReadCost: 0.1,
                rateMultiplier: 0.75,
                subscriptionCost: 0.2,
                balanceCost: 0,
                unchargedCost: 0,
                timeToFirstTokenMs: 80,
                durationMs: 500,
                ipAddress: "192.0.2.10",
                location: null,
                userAgent: "test",
                createdAt: "2026-07-24T10:00:00Z",
              },
            ],
            errors: [
              {
                id: 2,
                createdAt: "2026-07-24T10:01:00Z",
                model: "gpt-5.6-luna",
                endpoint: "/v1/chat/completions",
                statusCode: 429,
                category: "rate_limit",
                platform: "openai",
                message: "Rate limited",
                keyName: "Primary",
                keyDeleted: false,
              },
            ],
          }}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Tokens" }));
    expect(screen.getByText("By model")).toBeInTheDocument();
    const errorsTab = screen.getByRole("tab", { name: /Errors/ });
    fireEvent.mouseDown(errorsTab);
    fireEvent.click(errorsTab);
    expect(screen.getByText("Rate limited")).toBeInTheDocument();
  });
});
