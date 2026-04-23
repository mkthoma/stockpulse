'use strict';

document.getElementById('open-sidebar').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch(() => {});
  }
  window.close();
});

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Show last query if available
chrome.storage.local.get('lastResult').then(stored => {
  const last = stored.lastResult;
  if (!last?.query) return;
  document.getElementById('last-query').style.display = 'block';
  document.getElementById('last-text').textContent = last.query;
});
