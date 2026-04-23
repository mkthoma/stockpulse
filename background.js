import { runAgentLoop } from './agent/AgentRunner.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RUN_AGENT') {
    const tabId = sender.tab?.id;
    handleAgentRun(message.query, tabId);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener(command => {
  if (command === 'toggle-sidebar') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs[0]?.id;
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_SIDEBAR' }).catch(() => {});
    });
  }
});

async function handleAgentRun(userQuery, tabId) {
  function sendStep(step) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { type: 'AGENT_STEP', step }).catch(() => {});
  }

  try {
    const answer = await runAgentLoop(userQuery, sendStep);
    await chrome.storage.local.set({
      lastResult: { query: userQuery, answer, timestamp: Date.now() }
    });
  } catch (err) {
    sendStep({ type: 'error', message: err.message });
  }
}
