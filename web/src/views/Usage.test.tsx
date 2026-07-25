import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Usage } from "./Usage";
import { liveSnapshot } from "../test/fixtures";

describe("Usage", () => {
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
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Tokens" }));
    expect(screen.getByText("By model")).toBeInTheDocument();
    const errorsTab = screen.getByRole("tab", { name: /Errors/ });
    fireEvent.mouseDown(errorsTab);
    fireEvent.click(errorsTab);
    expect(screen.getByText("Rate limited")).toBeInTheDocument();
  });
});
