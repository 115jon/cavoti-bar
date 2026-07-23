(function () {
  const toast = document.getElementById('toast');
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function post(action, value) {
    if (window.chrome?.webview) window.chrome.webview.postMessage({ action, value });
  }

  function setView(view) {
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
    document.querySelectorAll('[data-view-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.viewPane === view));
  }

  document.addEventListener('click', (event) => {
    const viewTarget = event.target.closest('[data-view]');
    if (viewTarget) setView(viewTarget.dataset.view);

    const range = event.target.closest('[data-range]');
    if (range) {
      document.querySelectorAll('[data-range]').forEach((button) => button.classList.toggle('selected', button === range));
      showToast(`Showing ${range.textContent.trim().toLowerCase()} of usage`);
    }

    const tag = event.target.closest('.tag');
    if (tag) {
      document.querySelectorAll('.tag').forEach((button) => button.classList.toggle('selected', button === tag));
      showToast(`Filtered to ${tag.textContent.trim()}`);
    }

    const toggle = event.target.closest('.toggle');
    if (toggle) {
      toggle.classList.toggle('on');
      post('setting', { name: toggle.dataset.setting, enabled: toggle.classList.contains('on') });
      showToast(`${toggle.dataset.setting === 'topmost' ? 'Keep on top' : 'Launch at sign in'} ${toggle.classList.contains('on') ? 'enabled' : 'disabled'}`);
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'refresh') {
      document.getElementById('sync-label').textContent = 'Just refreshed';
      showToast('Fixture metrics refreshed');
    }
    if (action === 'minimize' || action === 'close') post(action);
    if (action === 'open-site') {
      post('open-site');
      if (!window.chrome?.webview) window.open('https://cavoti.com/usage', '_blank', 'noopener');
    }
    if (action === 'account') showToast('Account session: j***7@gmail.com');
    if (action === 'interval') showToast('Refresh interval menu coming with the live bridge');
    if (action === 'clear') showToast('Local data clear is available after the live bridge is connected');
  });
})();
