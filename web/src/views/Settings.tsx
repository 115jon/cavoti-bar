import { useState } from "react";
import { KeyIcon as Key } from "@phosphor-icons/react";
import { Badge, TilePager, useCompactTiles } from "../components/app/shared";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";

const refreshOptions = [
  { value: 0, label: "Manual only" },
  { value: 15, label: "Every 15 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
];

function RefreshSettings({
  refreshIntervalSeconds,
  onRefreshInterval,
  showFreshnessSeconds,
  onShowFreshnessSeconds,
}: {
  refreshIntervalSeconds: number;
  onRefreshInterval: (seconds: number) => void;
  showFreshnessSeconds: boolean;
  onShowFreshnessSeconds: (value: boolean) => void;
}) {
  return (
    <div className="refresh-settings">
      <div className="setting-row">
        <div>
          <strong>Refresh interval</strong>
          <small>Choose how often usage refreshes automatically.</small>
        </div>
        <select
          aria-label="Refresh interval"
          value={refreshIntervalSeconds}
          onChange={(event) => onRefreshInterval(Number(event.target.value))}
        >
          {refreshOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <strong>Show seconds</strong>
          <small>Show seconds for recent update timing.</small>
        </div>
        <Switch checked={showFreshnessSeconds} onCheckedChange={onShowFreshnessSeconds} aria-label="Show seconds in freshness" />
      </div>
    </div>
  );
}

export function Settings({
  topmost,
  onTopmost,
  onClear,
  onConnect,
  refreshIntervalSeconds,
  onRefreshInterval,
  showFreshnessSeconds,
  onShowFreshnessSeconds,
}: {
  topmost: boolean;
  onTopmost: (value: boolean) => void;
  onClear: () => void;
  onConnect: () => void;
  refreshIntervalSeconds: number;
  onRefreshInterval: (seconds: number) => void;
  showFreshnessSeconds: boolean;
  onShowFreshnessSeconds: (value: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  if (!compact)
    return (
      <div className="view-stack wide-settings">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Application</span>
            <h1>Settings</h1>
          </div>
          <Badge variant="outline">Local</Badge>
        </div>
        <div className="settings-grid">
          <section className="surface-section settings-section">
            <span className="eyebrow">Window behavior</span>
            <div className="setting-row">
              <div>
                <strong>Keep on top</strong>
                <small>Keep the popover above other windows.</small>
              </div>
              <Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" />
            </div>
            <RefreshSettings
              refreshIntervalSeconds={refreshIntervalSeconds}
              onRefreshInterval={onRefreshInterval}
              showFreshnessSeconds={showFreshnessSeconds}
              onShowFreshnessSeconds={onShowFreshnessSeconds}
            />
            <div className="setting-row">
              <div>
                <strong>Connection profile</strong>
                <small>Session cookies stay inside the WebView2 profile.</small>
              </div>
              <Button variant="outline" size="sm" onClick={onConnect}>
                Open sign in
              </Button>
            </div>
          </section>
          <section className="surface-section settings-section">
            <span className="eyebrow">Privacy boundary</span>
            <div className="privacy-note">
              <Key />
              <div>
                <strong>Credentials never reach this UI</strong>
                <small>Only normalized usage, plan, and account status data are forwarded.</small>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear local preferences
            </Button>
          </section>
        </div>
      </div>
    );
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Application</span>
            <h1>Settings</h1>
          </div>
          <div className="tile-heading-actions">
            <Badge variant="outline">Local</Badge>
            <TilePager page={page} count={2} onChange={setPage} label="Settings screen" />
          </div>
        </div>
        {page === 0 ? (
          <section className="surface-section settings-section">
            <span className="eyebrow">Window behavior</span>
            <div className="setting-row">
              <div>
                <strong>Keep on top</strong>
                <small>Keep the popover above other windows.</small>
              </div>
              <Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" />
            </div>
            <RefreshSettings
              refreshIntervalSeconds={refreshIntervalSeconds}
              onRefreshInterval={onRefreshInterval}
              showFreshnessSeconds={showFreshnessSeconds}
              onShowFreshnessSeconds={onShowFreshnessSeconds}
            />
            <div className="setting-row">
              <div>
                <strong>Connection profile</strong>
                <small>Session cookies stay inside the WebView2 profile.</small>
              </div>
              <Button variant="outline" size="sm" onClick={onConnect}>
                Open sign in
              </Button>
            </div>
          </section>
        ) : (
          <section className="surface-section settings-section">
            <span className="eyebrow">Privacy boundary</span>
            <div className="privacy-note">
              <Key />
              <div>
                <strong>Credentials never reach this UI</strong>
                <small>Only normalized usage, plan, and account status data are forwarded.</small>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear local preferences
            </Button>
          </section>
        )}
        <TilePager page={page} count={2} onChange={setPage} label="Settings screen" />
      </div>
    </div>
  );
}
