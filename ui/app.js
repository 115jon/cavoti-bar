(function () {
  'use strict';

  const content = document.getElementById('app-content');
  const toast = document.getElementById('toast');
  const syncLabel = document.getElementById('sync-label');
  const sessionBoundaryLabel = 'session boundary';
  const fixtureLabel = 'fixture mode';
  let activeView = 'overview';
  let snapshot = null;
  let toastTimer;
  let refreshTimer;
  let refreshIntervalTimer;
  let refreshInProgress = false;

  function icon(name) {
    return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? Math.max(0, result) : 0;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number(value));
  }

  function formatInteger(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number(value));
  }

  function formatTokens(value) {
    const amount = number(value);
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return formatInteger(amount);
  }

  function percentage(used, limit) {
    if (number(limit) <= 0) return 0;
    return Math.min(100, Math.max(0, number(used) / number(limit) * 100));
  }

  function formatPercent(value) {
    return `${number(value).toFixed(1)}%`;
  }

  function formatDate(value) {
    if (!value) return 'Not provided';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not provided';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  function formatCapturedAt(value) {
    if (!value) return 'capture time unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'capture time unavailable';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(date) + ' UTC';
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeNumbers(value, fields) {
    const safe = { ...value };
    fields.forEach((field) => { safe[field] = number(value[field]); });
    return safe;
  }

  function normalizeSnapshot(raw, hostSettings) {
    if (!raw || typeof raw !== 'object') return null;
    const subscriptions = Array.isArray(raw.subscriptions)
      ? raw.subscriptions.filter(isRecord).map((plan) => normalizeNumbers(plan, ['daily_usage_usd', 'daily_limit_usd', 'weekly_usage_usd', 'weekly_limit_usd']))
      : [];
    const stats = isRecord(raw.stats)
      ? normalizeNumbers(raw.stats, ['total_requests', 'total_input_tokens', 'total_output_tokens', 'total_cache_tokens', 'total_tokens', 'total_cost', 'total_actual_cost'])
      : {};
    const active = subscriptions.find((plan) => plan.status === 'active') || subscriptions[0] || {};
    const me = isRecord(raw.me) ? raw.me : null;
    return {
      ...raw,
      mode: 'fixture',
      session: {
        kind: me?.status === 'active' ? fixtureLabel : me ? 'expired' : 'missing',
        isLive: false,
        label: 'Fixture mode',
      },
      overview: {
        account: me?.username || 'Session not connected',
        isActive: me?.status === 'active',
        plan: active.plan_name || 'No plan detected',
        expiresAt: active.expires_at || null,
        dailyPercent: percentage(active.daily_usage_usd, active.daily_limit_usd),
        weeklyPercent: percentage(active.weekly_usage_usd, active.weekly_limit_usd),
        requests: number(stats.total_requests),
        tokens: formatTokens(stats.total_tokens),
        cost: formatMoney(stats.total_actual_cost),
      },
      settings: hostSettings || raw.settings || {},
      subscriptions,
      stats,
      models: Array.isArray(raw.models) ? raw.models.filter(isRecord).map((model) => normalizeNumbers(model, ['requests', 'actual_cost'])) : [],
      trend: Array.isArray(raw.trend) ? raw.trend.filter(isRecord).map((item) => normalizeNumbers(item, ['requests', 'actual_cost'])) : [],
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string') : [],
    };
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
  }

  function post(action, value) {
    if (!window.chrome?.webview) return;
    try {
      window.chrome.webview.postMessage({ action, value });
    } catch {
      showToast('The desktop bridge is unavailable');
    }
  }

  function readSetting(name, fallback) {
    try {
      const stored = window.localStorage.getItem(`cavoti.${name}`);
      return stored === null ? fallback : stored === 'true';
    } catch {
      return fallback;
    }
  }

  function writeSetting(name, value) {
    try {
      window.localStorage.setItem(`cavoti.${name}`, String(value));
    } catch {
      // The native host remains authoritative for topmost state.
    }
  }

  function renderBoundary(kind, title, message, action = '') {
    const iconName = kind === 'error' ? 'alert' : 'info';
    content.innerHTML = `
      <section class="boundary-panel ${kind}" aria-labelledby="boundary-title">
        <div class="boundary-icon">${icon(iconName)}</div>
        <p class="eyebrow">${sessionBoundaryLabel}</p>
        <h1 id="boundary-title">${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${action ? `<button class="primary-button" data-action="open-site">${escapeHtml(action)} ${icon('external')}</button>` : ''}
      </section>`;
    syncLabel.textContent = kind === 'error' ? 'Bridge error' : 'Waiting for snapshot';
  }

  function renderHeader(eyebrow, title, action) {
    return `<div class="view-heading">
      <div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>
      ${action}
    </div>`;
  }

  function renderSourceBanner() {
    return `<div class="source-banner">
      <div class="source-icon">${icon('info')}</div>
      <div><strong>Fixture mode</strong><span>Sanitized snapshot from ${escapeHtml(formatCapturedAt(snapshot.capturedAt))}. No live connection.</span></div>
      <button class="quiet-button" data-action="open-site">Open Cavoti ${icon('external')}</button>
    </div>`;
  }

  function renderOverview() {
    const data = snapshot.overview;
    const trend = snapshot.trend;
    const models = snapshot.models;
    const latest = trend[trend.length - 1] || {};
    const planStatusClass = data.isActive ? 'good' : 'bad';
    return `<section class="view active" data-view-pane="overview" aria-labelledby="overview-title">
      ${renderHeader(`Snapshot from ${escapeHtml(formatCapturedAt(snapshot.capturedAt))}`, '<span id="overview-title">Overview</span>', `<button class="refresh-button" data-action="refresh">${icon('refresh')}<span>Refresh</span></button>`)}
      ${renderSourceBanner()}
      <div class="metric-grid">
        <article class="metric-card accent-card"><div class="card-kicker"><span>Current plan</span><span class="status-label ${planStatusClass}">${escapeHtml(snapshot.session.kind === fixtureLabel ? 'active' : 'check')}</span></div><strong class="metric-value">${escapeHtml(data.plan)}</strong><p class="metric-note">Renews ${escapeHtml(formatDate(data.expiresAt))}</p><div class="progress-track"><span class="meter-fill accent" data-percent="${data.dailyPercent}"></span></div><div class="metric-meta"><span>Daily window</span><strong>${formatPercent(data.dailyPercent)}</strong></div></article>
        <article class="metric-card"><div class="card-kicker"><span>Actual cost</span><span class="muted">7 days</span></div><strong class="metric-value">${escapeHtml(data.cost)}</strong><p class="metric-note">Recorded in the snapshot</p><div class="sparkline" aria-label="Requests by day">${trend.map((item) => `<span data-percent="${percentage(item.requests, Math.max(...trend.map((point) => number(point.requests)), 1))}"></span>`).join('')}</div></article>
        <article class="metric-card"><div class="card-kicker"><span>Requests</span><span class="muted">${escapeHtml(latest.date || '7 days')}</span></div><strong class="metric-value">${formatInteger(data.requests)}</strong><p class="metric-note">${escapeHtml(data.tokens)} tokens processed</p><div class="metric-foot"><span class="status-dot good"></span><span>Aggregate usage available</span></div></article>
      </div>
      <div class="section-row"><div><p class="eyebrow">Window health</p><h2>Usage at a glance</h2></div><button class="text-button" data-view="usage">View details ${icon('chevron')}</button></div>
      <div class="usage-card">
        <div class="usage-row"><div class="usage-title"><span class="usage-mark accent"></span><div><strong>Daily</strong><small>Current plan allowance</small></div></div><div class="usage-meter"><div class="progress-track"><span class="meter-fill accent" data-percent="${data.dailyPercent}"></span></div><strong>${formatPercent(data.dailyPercent)}</strong></div></div>
        <div class="usage-row"><div class="usage-title"><span class="usage-mark good"></span><div><strong>Weekly</strong><small>Current plan allowance</small></div></div><div class="usage-meter"><div class="progress-track"><span class="meter-fill good" data-percent="${data.weeklyPercent}"></span></div><strong>${formatPercent(data.weeklyPercent)}</strong></div></div>
      </div>
      <div class="bottom-grid"><section><p class="eyebrow">Most active</p><h2>Models</h2><div class="model-list">${renderModelRows(models)}</div></section><section class="snapshot-note"><p class="eyebrow">Data boundary</p><strong>Sanitized usage snapshot</strong><p>Model costs are reported as captured. Live health and account actions are not available in fixture mode.</p></section></div>
    </section>`;
  }

  function renderModelRows(models) {
    if (!models.length) return `<div class="empty-inline">No model records in this snapshot.</div>`;
    return models.map((model) => `<div class="model-row"><span class="model-name"><i class="model-dot"></i>${escapeHtml(model.model || 'Unknown model')}</span><strong>${escapeHtml(formatMoney(model.actual_cost))}</strong></div>`).join('');
  }

  function renderUsage() {
    const data = snapshot.overview;
    const trend = snapshot.trend;
    const models = snapshot.models;
    const maxRequests = Math.max(...trend.map((item) => number(item.requests)), 1);
    const tags = snapshot.tags.length ? snapshot.tags : ['All traffic'];
    const supportedTag = tags[0];
    const ranges = [
      { value: '7d', label: '7 days', supported: true },
      { value: '30d', label: '30 days', supported: false },
      { value: 'all', label: 'All time', supported: false },
    ];
    return `<section class="view" data-view-pane="usage" aria-labelledby="usage-title">
      ${renderHeader('Usage ledger', '<span id="usage-title">Consumption</span>', `<button class="refresh-button" data-action="refresh">${icon('refresh')}<span>Refresh</span></button>`)}
      <div class="filter-bar"><div class="segmented" role="group" aria-label="Usage range">${ranges.map((range) => `<button class="${range.supported ? 'selected' : ''}" data-range="${range.value}" aria-pressed="${range.supported}" aria-disabled="${!range.supported}" title="${range.supported ? 'Captured fixture range' : 'Unavailable in fixture mode'}">${range.label}</button>`).join('')}</div><div class="tag-picker" role="group" aria-label="Usage tag">${tags.map((tag, index) => { const supported = tag === supportedTag; return `<button class="tag${supported ? ' selected' : ''}" data-tag="${escapeHtml(tag)}" aria-pressed="${supported}" aria-disabled="${!supported}" title="${supported ? 'Captured fixture tag' : 'Unavailable in fixture mode'}">${escapeHtml(tag)}</button>`; }).join('')}</div><p class="filter-note">Fixture mode: 7-day, all-traffic snapshot only.</p></div>
      <div class="usage-summary"><div><span class="summary-label">Actual cost</span><strong>${escapeHtml(data.cost)}</strong><small>Recorded actual cost</small></div><div><span class="summary-label">Requests</span><strong>${formatInteger(data.requests)}</strong><small>${escapeHtml(data.tokens)} tokens</small></div><div><span class="summary-label">Latency</span><strong>Not captured</strong><small>Unavailable in fixture</small></div></div>
      <section class="chart-card" aria-labelledby="throughput-title"><div class="chart-head"><div><p class="eyebrow">Daily throughput</p><h2 id="throughput-title">Requests per day</h2></div><span class="chart-note">Snapshot values</span></div><div class="bar-chart"><div class="y-axis" aria-hidden="true"><span>${formatInteger(maxRequests)}</span><span>${formatInteger(maxRequests / 2)}</span><span>0</span></div><div class="bars">${trend.length ? trend.map((item, index) => `<div class="bar${index === trend.length - 1 ? ' current' : ''}" data-percent="${number(item.requests) / maxRequests * 100}"><b>${formatInteger(item.requests)}</b><span></span><small>${escapeHtml(item.date || '')}</small></div>`).join('') : '<div class="empty-inline">No trend records in this snapshot.</div>'}</div></div></section>
      <section class="table-card" aria-labelledby="model-breakdown-title"><div class="table-head"><h2 id="model-breakdown-title">Model breakdown</h2><span>${escapeHtml(data.cost)} total</span></div><div class="data-table"><div class="table-row table-label" role="row"><span>Model</span><span>Requests</span><span>Cost</span></div>${models.length ? models.map((model) => `<div class="table-row" role="row"><span class="model-name"><i class="model-dot"></i>${escapeHtml(model.model || 'Unknown model')}</span><span>${formatInteger(model.requests)}</span><strong>${escapeHtml(formatMoney(model.actual_cost))}</strong></div>`).join('') : '<div class="empty-inline">No model records in this snapshot.</div>'}</div></section>
    </section>`;
  }

  function renderPlans() {
    const plans = snapshot.subscriptions;
    return `<section class="view" data-view-pane="plans" aria-labelledby="plans-title">
      ${renderHeader('Entitlements', '<span id="plans-title">Plans</span>', `<button class="quiet-button" data-action="open-site">Manage on Cavoti ${icon('external')}</button>`)}
      ${plans.length ? `<div class="plan-stack">${plans.map((plan, index) => `<article class="plan-card${index === 0 ? ' primary' : ''}"><div class="plan-top"><div><span class="status-label ${plan.status === 'active' ? 'good' : 'muted'}">${escapeHtml(plan.status || 'unknown')}</span><h2>${escapeHtml(plan.plan_name || 'Unnamed plan')}</h2><p>${index === 0 ? 'Primary subscription group.' : 'Additional subscription group.'}</p></div><span class="plan-index">${String(index + 1).padStart(2, '0')}</span></div><div class="plan-rule"></div><div class="plan-meta"><span><small>Daily</small><strong>${escapeHtml(formatMoney(plan.daily_usage_usd))} / ${escapeHtml(formatMoney(plan.daily_limit_usd))}</strong></span><span><small>Weekly</small><strong>${escapeHtml(formatMoney(plan.weekly_usage_usd))} / ${escapeHtml(formatMoney(plan.weekly_limit_usd))}</strong></span><span><small>Renews</small><strong>${escapeHtml(formatDate(plan.expires_at))}</strong></span></div></article>`).join('')}</div>` : `<div class="empty-panel"><div class="boundary-icon">${icon('info')}</div><strong>No plan records</strong><p>The snapshot did not include any subscriptions.</p></div>`}
      <div class="inline-note"><span class="status-dot neutral"></span><div><strong>Fixture source</strong><p>Plan entitlements are from the sanitized capture. Manage changes in the Cavoti browser session.</p></div></div>
    </section>`;
  }

  function renderStatus() {
    const isActive = snapshot.session.kind === fixtureLabel;
    return `<section class="view" data-view-pane="status" aria-labelledby="status-title">
      ${renderHeader('Service monitor', '<span id="status-title">Status</span>', `<span class="overall-status ${isActive ? 'neutral' : 'bad'}"><i class="status-dot ${isActive ? 'neutral' : 'bad'}"></i>${isActive ? 'Snapshot received' : 'Session unavailable'}</span>`)}
      <section class="status-summary"><div class="status-icon ${isActive ? 'neutral' : 'bad'}">${icon(isActive ? 'check' : 'alert')}</div><div><p class="eyebrow">Cavoti connection</p><h2>${isActive ? 'Fixture data is available.' : 'No active session snapshot.'}</h2><p>This surface does not claim live service health. It only reports whether the local sanitized snapshot arrived.</p></div></section>
      <section class="check-list" aria-labelledby="checks-title"><div class="section-row"><div><p class="eyebrow">Evidence</p><h2 id="checks-title">Snapshot checks</h2></div><span class="table-caption">${escapeHtml(formatCapturedAt(snapshot.capturedAt))}</span></div><div class="check-row"><span class="status-dot ${isActive ? 'good' : 'bad'}"></span><div><strong>Account record</strong><small>${isActive ? 'Active status present in fixture' : 'No active status returned'}</small></div><span class="check-state">${isActive ? 'Present' : 'Missing'}</span></div><div class="check-row"><span class="status-dot ${snapshot.subscriptions.length ? 'good' : 'neutral'}"></span><div><strong>Plan records</strong><small>${snapshot.subscriptions.length ? `${snapshot.subscriptions.length} record${snapshot.subscriptions.length === 1 ? '' : 's'} included` : 'No subscription records included'}</small></div><span class="check-state">${snapshot.subscriptions.length ? 'Present' : 'Empty'}</span></div><div class="check-row"><span class="status-dot ${snapshot.trend.length ? 'good' : 'neutral'}"></span><div><strong>Usage trend</strong><small>${snapshot.trend.length ? `${snapshot.trend.length} daily records included` : 'No daily trend records included'}</small></div><span class="check-state">${snapshot.trend.length ? 'Present' : 'Empty'}</span></div></section>
      <div class="session-boundary"><div class="boundary-icon">${icon('info')}</div><div><strong>Live session is not connected</strong><p>The capture did not contain reusable cookies or authorization headers. No credential replay is attempted.</p></div><button class="quiet-button" data-action="open-site">Open sign-in ${icon('external')}</button></div>
    </section>`;
  }

  function readStorage(name, fallback) {
    try {
      return window.localStorage.getItem(`cavoti.${name}`) || fallback;
    } catch {
      return fallback;
    }
  }

  function scheduleFixtureRefresh(value) {
    clearInterval(refreshIntervalTimer);
    const minutes = Math.max(1, number(value) || 15);
    refreshIntervalTimer = setInterval(() => refreshFixture(), minutes * 60 * 1000);
  }

  function updateIntervalControl(value) {
    const menu = document.getElementById('interval-menu');
    const trigger = document.querySelector('[data-action="interval"]');
    if (!menu || !trigger) return;
    trigger.firstChild.textContent = `${value} min `;
    menu.querySelectorAll('[data-interval]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.interval === String(value))));
  }

  function renderSettings() {
    const topmost = typeof snapshot.settings.topmost === 'boolean' ? snapshot.settings.topmost : readSetting('topmost', true);
    const interval = readStorage('interval', '15');
    return `<section class="view" data-view-pane="settings" aria-labelledby="settings-title">
      ${renderHeader('Application', '<span id="settings-title">Settings</span>', '<span class="save-state"><span class="status-dot good"></span>Saved locally</span>')}
      <section class="settings-group"><p class="eyebrow">Window behavior</p><div class="setting-row"><div><strong>Keep on top</strong><small>Keep this flyout above other windows.</small></div>${renderToggle(topmost)}</div><div class="setting-row interval-row"><div><strong>Refresh interval</strong><small>Schedule a local reread of the sanitized fixture.</small></div><div class="popover-wrap"><button class="select-button" data-action="interval" aria-expanded="false" aria-haspopup="true" aria-controls="interval-menu">${escapeHtml(interval)} min ${icon('chevron')}</button><div class="popover" id="interval-menu" hidden>${['5', '15', '30'].map((value) => `<button data-interval="${value}" aria-pressed="${value === interval}">${value} minutes</button>`).join('')}</div></div></div></section>
      <section class="settings-group"><p class="eyebrow">Data source</p><div class="connection-row"><span class="source-icon">${icon('layers')}</span><div><strong>Sanitized snapshot</strong><small>${escapeHtml(snapshot.source || 'Fixture data')} | no live connection</small></div><span class="status-dot neutral"></span></div><button class="outline-button" data-action="open-site">Open Cavoti sign-in ${icon('external')}</button></section>
      <section class="settings-group danger-zone"><p class="eyebrow">Local data</p><div class="setting-row"><div><strong>Clear preferences</strong><small>Remove saved window and refresh preferences.</small></div><button class="outline-button danger" data-action="clear">Clear</button></div></section>
    </section>`;
  }

  function renderToggle(enabled) {
    return `<button class="toggle${enabled ? ' on' : ''}" data-setting="topmost" role="switch" aria-checked="${enabled}" aria-label="Toggle keep on top"><span></span></button>`;
  }

  function setView(view) {
    if (!['overview', 'usage', 'plans', 'status', 'settings'].includes(view)) return;
    activeView = view;
    document.querySelectorAll('[data-view]').forEach((item) => {
      const selected = item.dataset.view === view;
      item.classList.toggle('active', selected);
      if (selected) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-view-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.viewPane === view));
  }

  function setDynamicMeters() {
    content.querySelectorAll('[data-percent]').forEach((element) => {
      const value = Math.min(100, Math.max(0, number(element.dataset.percent)));
      element.style.setProperty('--meter', `${value}%`);
      if (element.classList.contains('bar')) element.style.setProperty('--bar-height', `${Math.max(8, value * .62)}%`);
    });
  }

  function renderSnapshot(raw, hostSettings) {
    snapshot = normalizeSnapshot(raw, hostSettings);
    if (!snapshot) {
      renderBoundary('error', 'Snapshot could not be read.', 'The desktop host sent an invalid snapshot. No live data was requested.');
      return;
    }
    content.innerHTML = [renderOverview(), renderUsage(), renderPlans(), renderStatus(), renderSettings()].join('');
    setDynamicMeters();
    setView(activeView);
    scheduleFixtureRefresh(readStorage('interval', '15'));
    syncLabel.textContent = `Fixture mode | ${formatCapturedAt(snapshot.capturedAt)}`;
  }

  function setRefreshState(isRefreshing) {
    refreshInProgress = isRefreshing;
    document.querySelectorAll('[data-action="refresh"]').forEach((button) => {
      button.disabled = isRefreshing;
      button.setAttribute('aria-busy', String(isRefreshing));
      button.classList.toggle('loading', isRefreshing);
      const label = button.querySelector('span:last-child');
      if (label) label.textContent = isRefreshing ? 'Refreshing' : 'Refresh';
    });
  }

  function refreshFixture() {
    if (refreshInProgress) return;
    setRefreshState(true);
    syncLabel.textContent = 'Refreshing fixture';
    showToast('Refreshing sanitized snapshot');
    clearTimeout(refreshTimer);
    post('refresh');
    if (window.chrome?.webview) {
      refreshTimer = setTimeout(() => {
        setRefreshState(false);
        showToast('Fixture refresh did not complete');
      }, 2500);
      return;
    }
    refreshTimer = setTimeout(() => {
      setRefreshState(false);
      if (snapshot) renderSnapshot(snapshot);
      else renderBoundary('error', 'Snapshot unavailable.', 'The local host has not supplied fixture data yet.');
      showToast('Fixture snapshot refreshed');
    }, 420);
  }

  function applyHostSettings(settings) {
    if (!settings || typeof settings.topmost !== 'boolean') return;
    if (snapshot) snapshot.settings = { ...snapshot.settings, topmost: settings.topmost };
    const toggle = document.querySelector('[data-setting="topmost"]');
    if (!toggle) return;
    toggle.setAttribute('aria-checked', String(settings.topmost));
    toggle.classList.toggle('on', settings.topmost);
  }

  function handleHostMessage(data) {
    if (!data || typeof data !== 'object') {
      renderBoundary('error', 'Bridge message was invalid.', 'The desktop host sent an unsupported message.');
      return;
    }
    if (data.type === 'snapshot') {
      const wasRefreshing = refreshInProgress;
      clearTimeout(refreshTimer);
      if (wasRefreshing) setRefreshState(false);
      renderSnapshot(data.snapshot, data.settings);
      if (wasRefreshing) showToast('Fixture snapshot refreshed');
    } else if (data.type === 'host-error') {
      const wasRefreshing = refreshInProgress;
      clearTimeout(refreshTimer);
      if (wasRefreshing) setRefreshState(false);
      renderBoundary('error', 'Desktop host error.', data.message || 'The local content could not be loaded.');
    } else if (data.type === 'settings') {
      applyHostSettings(data.settings);
    }
  }

  document.addEventListener('click', (event) => {
    const viewTarget = event.target.closest('[data-view]');
    if (viewTarget) {
      setView(viewTarget.dataset.view);
      return;
    }

    const range = event.target.closest('[data-range]');
    if (range) {
      if (range.getAttribute('aria-disabled') === 'true') {
        showToast('That range is unavailable in fixture mode; only the captured 7-day window is available.');
        return;
      }
      document.querySelectorAll('[data-range]').forEach((button) => {
        const selected = button === range;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      showToast(`Showing ${range.textContent.trim().toLowerCase()} of usage`);
      return;
    }

    const tag = event.target.closest('[data-tag]');
    if (tag) {
      if (tag.getAttribute('aria-disabled') === 'true') {
        showToast('That tag is unavailable in fixture mode; only captured all-traffic data is available.');
        return;
      }
      document.querySelectorAll('[data-tag]').forEach((button) => {
        const selected = button === tag;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      showToast(`Filtered to ${tag.dataset.tag}`);
      return;
    }

    const interval = event.target.closest('[data-interval]');
    if (interval) {
      writeSetting('interval', interval.dataset.interval);
      const menu = document.getElementById('interval-menu');
        const trigger = document.querySelector('[data-action="interval"]');
        if (menu && trigger) {
          menu.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          updateIntervalControl(interval.dataset.interval);
          scheduleFixtureRefresh(interval.dataset.interval);
        }
      showToast(`Local fixture refresh interval set to ${interval.dataset.interval} minutes`);
      return;
    }

    const toggle = event.target.closest('.toggle');
    if (toggle) {
      const enabled = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.classList.toggle('on', enabled);
      writeSetting(toggle.dataset.setting, enabled);
      if (toggle.dataset.setting === 'topmost' && snapshot?.settings) snapshot.settings.topmost = enabled;
      post('setting', { name: toggle.dataset.setting, enabled });
      showToast(`Keep on top ${enabled ? 'enabled' : 'disabled'}`);
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    const action = actionTarget?.dataset.action;
    if (!action) return;
    if (action === 'refresh') refreshFixture();
    if (action === 'minimize' || action === 'close' || action === 'drag') post(action);
    if (action === 'open-site') {
      post('open-site');
      if (!window.chrome?.webview) window.open('https://cavoti.com/usage', '_blank', 'noopener');
    }
    if (action === 'account' && snapshot) showToast(`Account session: ${snapshot.overview.account}`);
    if (action === 'interval') {
      const menu = document.getElementById('interval-menu');
      if (menu) {
        const expanded = actionTarget.getAttribute('aria-expanded') === 'true';
        menu.hidden = expanded;
        actionTarget.setAttribute('aria-expanded', String(!expanded));
      }
    }
    if (action === 'clear') {
      try { window.localStorage.clear(); } catch { /* Storage may be unavailable in a local file. */ }
      if (snapshot?.settings) snapshot.settings.topmost = true;
      applyHostSettings({ topmost: true });
      updateIntervalControl('15');
      scheduleFixtureRefresh('15');
      post('clear');
      showToast('Local preferences cleared; topmost restored');
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-drag-region]') && !event.target.closest('button')) post('drag');
  });

  window.addEventListener('message', (event) => handleHostMessage(event.data));
  if (window.chrome?.webview) window.chrome.webview.addEventListener('message', (event) => handleHostMessage(event.data));

  if (window.CAVOTI_DEMO && typeof window.CAVOTI_DEMO === 'object') renderSnapshot(window.CAVOTI_DEMO);
  else setTimeout(() => {
    if (!snapshot) renderBoundary('session', 'Waiting for the desktop snapshot.', 'This window only displays sanitized fixture data delivered by the local host.');
  }, 1200);
})();
