(function () {
  'use strict';

  if (window.__stockpulseInjected) return;
  window.__stockpulseInjected = true;

  let sidebarEl   = null;
  let backdropEl  = null;
  let iframeEl    = null;
  let isVisible   = false;

  function createBackdrop() {
    if (backdropEl) return;
    backdropEl = document.createElement('div');
    backdropEl.id = 'stockpulse-backdrop';
    backdropEl.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 2147483640',
      'backdrop-filter: blur(6px) saturate(0.8)',
      '-webkit-backdrop-filter: blur(6px) saturate(0.8)',
      'background: rgba(10, 24, 16, 0.35)',
      'opacity: 0',
      'transition: opacity 0.3s cubic-bezier(0.16,1,0.3,1)',
      'pointer-events: none',
      'will-change: opacity'
    ].join(';');
    backdropEl.addEventListener('click', hideSidebar);
    document.documentElement.appendChild(backdropEl);
  }

  function createSidebar() {
    if (sidebarEl) return;
    createBackdrop();

    sidebarEl = document.createElement('div');
    sidebarEl.id = 'stockpulse-container';
    sidebarEl.style.cssText = [
      'position: fixed',
      'top: 0',
      'right: -380px',
      'width: 360px',
      'height: 100vh',
      'z-index: 2147483647',
      'transition: right 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s cubic-bezier(0.16,1,0.3,1)',
      'box-shadow: none',
      'background: transparent'
    ].join(';');

    iframeEl = document.createElement('iframe');
    iframeEl.id  = 'stockpulse-sidebar';
    iframeEl.src = chrome.runtime.getURL('sidebar/sidebar.html');
    iframeEl.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframeEl.allow = '';

    sidebarEl.appendChild(iframeEl);
    document.documentElement.appendChild(sidebarEl);
  }

  function showSidebar() {
    createSidebar();
    sidebarEl.style.right = '0px';
    sidebarEl.style.boxShadow = '-8px 0 48px rgba(0,0,0,0.28), -2px 0 0 rgba(82,183,136,0.18)';
    if (backdropEl) {
      backdropEl.style.pointerEvents = 'auto';
      // rAF ensures the transition fires after the element is painted
      requestAnimationFrame(() => { backdropEl.style.opacity = '1'; });
    }
    isVisible = true;
  }

  function hideSidebar() {
    if (sidebarEl) {
      sidebarEl.style.right = '-380px';
      sidebarEl.style.boxShadow = 'none';
    }
    if (backdropEl) {
      backdropEl.style.opacity = '0';
      backdropEl.style.pointerEvents = 'none';
    }
    isVisible = false;
  }

  function toggleSidebar() {
    isVisible ? hideSidebar() : showSidebar();
  }

  // Messages from background → forward to sidebar iframe
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_SIDEBAR') {
      toggleSidebar();
      return;
    }

    if (message.type === 'AGENT_STEP' && iframeEl?.contentWindow) {
      // targetOrigin '*': content script runs in web-page context, not extension
      // context, so we can't use the extension origin here. Message integrity
      // is verified by the 'source' field in the sidebar receiver.
      iframeEl.contentWindow.postMessage(
        { source: 'stockpulse-bg', payload: message.step },
        '*'
      );
    }
  });

  // Messages from sidebar iframe → forward to background
  window.addEventListener('message', event => {
    const sidebarOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
    if (event.origin !== sidebarOrigin) return;

    const { source, type, payload } = event.data ?? {};
    if (source !== 'stockpulse-sidebar') return;

    if (type === 'RUN_AGENT') {
      chrome.runtime.sendMessage({ type: 'RUN_AGENT', query: payload.query }).catch(() => {});
    }

    if (type === 'OPEN_OPTIONS') {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => {});
    }

    if (type === 'CLOSE_SIDEBAR') {
      hideSidebar();
    }
  });

  // Open sidebar on extension icon click (popup triggers this)
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'SHOW_SIDEBAR') showSidebar();
  });
})();
