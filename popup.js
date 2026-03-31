// Video Link Scraper - Popup Script

let allLinks = [];
let isHighlighting = false;
let filterText = '';
let activeTab = 'current';

const mainEl = document.getElementById('main');
const btnHighlight = document.getElementById('btnHighlight');
const btnRefresh = document.getElementById('btnRefresh');
const btnScrape = document.getElementById('btnScrape');
const urlInput = document.getElementById('urlInput');
const toastEl = document.getElementById('toast');
const statusBar = document.getElementById('statusBar');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const tabs = document.querySelectorAll('.tab');

// ── Tab switching ─────────────────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;

    if (activeTab === 'custom') {
      urlInput.focus();
    } else {
      scanPage();
    }
  });
});

// ── Scrape button ─────────────────────────────────────────────────────────────
btnScrape.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.classList.add('error');
    setTimeout(() => urlInput.classList.remove('error'), 1500);
    showToast('Please enter a URL', true);
    return;
  }

  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
    urlInput.value = targetUrl;
  }

  scrapeUrl(targetUrl);
});

urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnScrape.click();
});

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.className = 'toast' + (isError ? ' error' : '');
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2000);
}

// ── Status bar ────────────────────────────────────────────────────────────────
function showStatus(text, type = 'active') {
  statusBar.style.display = 'flex';
  statusDot.className = 'status-dot ' + type;
  statusText.textContent = text;
}

function hideStatus() {
  statusBar.style.display = 'none';
}

// ── Render helpers ────────────────────────────────────────────────────────────
function getFilename(href) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1]) || href;
  } catch {
    return href;
  }
}

function getExtClass(ext) {
  const e = ext.toLowerCase();
  if (['mp4', 'webm', 'm3u8', 'mov', 'avi', 'mkv', 'flv'].includes(e)) return e;
  return 'default';
}

function renderLinks(links) {
  const filtered = links.filter(l =>
    !filterText ||
    l.href.toLowerCase().includes(filterText) ||
    l.text.toLowerCase().includes(filterText)
  );

  const toolbar = `
    <div class="toolbar">
      <div class="count-pill">
        <span class="count-num">${filtered.length}</span>
        <span>video link${filtered.length !== 1 ? 's' : ''} found</span>
      </div>
      <input class="filter-input" id="filterInput" placeholder="Filter links…" value="${filterText}" />
    </div>
  `;

  if (filtered.length === 0) {
    mainEl.innerHTML = toolbar + `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">${links.length === 0 ? 'No video links found' : 'No matches'}</div>
        <div class="empty-sub">${links.length === 0
          ? 'This page doesn\'t contain any video links (mp4, webm, m3u8, etc.).'
          : 'Try a different search term.'}</div>
      </div>
    `;
    renderFooter(0, filtered.length);
    attachFilterListener();
    return;
  }

  const items = filtered.map((link, i) => `
    <div class="link-item" data-href="${escHtml(link.href)}" data-index="${i}" style="animation-delay:${i * 30}ms">
      <div class="ext-badge ${getExtClass(link.ext)}">${escHtml(link.ext)}</div>
      <div class="link-info">
        <div class="link-name" title="${escHtml(getFilename(link.href))}">${escHtml(getFilename(link.href))}</div>
        <div class="link-url" title="${escHtml(link.href)}">${escHtml(link.href)}</div>
      </div>
      <div class="link-actions">
        <button class="action-btn btn-copy" data-href="${escHtml(link.href)}" title="Copy URL">⎘</button>
        <button class="action-btn btn-open" data-href="${escHtml(link.href)}" title="Open in new tab">↗</button>
      </div>
    </div>
  `).join('');

  mainEl.innerHTML = toolbar + `<div class="list">${items}</div>`;
  renderFooter(filtered.length, filtered.length);
  attachListeners(filtered);
  attachFilterListener();
}

function renderFooter(shown, total) {
  const existing = document.querySelector('.footer');
  if (existing) existing.remove();

  const footer = document.createElement('div');
  footer.className = 'footer';
  footer.innerHTML = `
    <span class="footer-info">MP4 · WebM · M3U8 · MOV · AVI · MKV · FLV</span>
    <div class="footer-actions">
      <button class="btn-copy-all" id="btnCopyAll" ${shown === 0 ? 'disabled' : ''}>
        Copy All
      </button>
      <button class="btn-open-all" id="btnOpenAll" ${shown === 0 ? 'disabled' : ''}>
        Open All (${shown})
      </button>
    </div>
  `;
  document.body.appendChild(footer);

  document.getElementById('btnOpenAll')?.addEventListener('click', () => {
    const filtered = allLinks.filter(l =>
      !filterText ||
      l.href.toLowerCase().includes(filterText) ||
      l.text.toLowerCase().includes(filterText)
    );
    if (filtered.length > 5) {
      const ok = confirm(`Open ${filtered.length} tabs at once?`);
      if (!ok) return;
    }
    filtered.forEach(l => chrome.tabs.create({ url: l.href, active: false }));
    showToast(`Opened ${filtered.length} tab${filtered.length !== 1 ? 's' : ''} ✓`);
  });

  document.getElementById('btnCopyAll')?.addEventListener('click', async () => {
    const filtered = allLinks.filter(l =>
      !filterText ||
      l.href.toLowerCase().includes(filterText) ||
      l.text.toLowerCase().includes(filterText)
    );
    const urls = filtered.map(l => l.href).join('\n');
    try {
      await navigator.clipboard.writeText(urls);
      showToast(`Copied ${filtered.length} URLs ✓`);
    } catch {
      showToast('Copy failed', true);
    }
  });
}

function attachFilterListener() {
  const input = document.getElementById('filterInput');
  if (!input) return;
  input.addEventListener('input', e => {
    filterText = e.target.value.toLowerCase();
    renderLinks(allLinks);
    setTimeout(() => {
      const newInput = document.getElementById('filterInput');
      if (newInput) { newInput.focus(); newInput.setSelectionRange(9999, 9999); }
    }, 10);
  });
  if (filterText) input.focus();
}

function attachListeners(links) {
  document.querySelectorAll('.link-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.action-btn')) return;
      chrome.tabs.create({ url: item.dataset.href, active: true });
    });
  });

  document.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      chrome.tabs.create({ url: btn.dataset.href, active: true });
    });
  });

  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(btn.dataset.href);
        btn.classList.add('copy-done');
        btn.textContent = '✓';
        showToast('URL copied!');
        setTimeout(() => { btn.classList.remove('copy-done'); btn.textContent = '⎘'; }, 1500);
      } catch {
        showToast('Copy failed', true);
      }
    });
  });
}

// ── Restricted URL check ──────────────────────────────────────────────────────
const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://',
  'about:', 'data:', 'devtools://', 'view-source:'
];

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some(p => url.startsWith(p));
}

function showAccessError(msg) {
  mainEl.innerHTML = `
    <div class="empty">
      <div class="empty-icon">🚫</div>
      <div class="empty-title">Cannot Access This Page</div>
      <div class="empty-sub">${msg}</div>
    </div>`;
  renderFooter(0, 0);
  showStatus('Error', 'error');
}

function showIncognitoAccessError() {
  mainEl.innerHTML = `
    <div class="empty">
      <div class="empty-icon">🕵️</div>
      <div class="empty-title">Incognito Access Is Off</div>
      <div class="empty-sub">
        Enable <strong>Allow in Incognito</strong> for Video Link Scraper in your browser's extension settings, then reload this incognito tab.
      </div>
    </div>`;
  renderFooter(0, 0);
}

// ── Scrape URL via background service worker ──────────────────────────────────
function scrapeUrl(url) {
  mainEl.innerHTML = '<div class="loading"><div class="spinner"></div>Scraping video links…</div>';
  showStatus('Fetching HTML…', 'active');
  urlInput.disabled = true;
  btnScrape.disabled = true;

  chrome.runtime.sendMessage({ action: 'scrapeUrl', url }, (response) => {
    urlInput.disabled = false;
    btnScrape.disabled = false;

    if (chrome.runtime.lastError) {
      showAccessError(chrome.runtime.lastError.message || 'Failed to scrape URL.');
      return;
    }

    if (!response || response.error) {
      showAccessError(response?.error || 'Failed to fetch the page.');
      return;
    }

    allLinks = response.links || [];
    filterText = '';
    showStatus(`Scraped ${allLinks.length} video link${allLinks.length !== 1 ? 's' : ''}`, allLinks.length > 0 ? 'active' : 'error');
    renderLinks(allLinks);
  });
}

// ── Scan current tab ──────────────────────────────────────────────────────────
function scanPage() {
  mainEl.innerHTML = '<div class="loading"><div class="spinner"></div>Scanning for video links…</div>';
  showStatus('Scanning current tab…', 'active');
  hideStatus();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showAccessError('No active tab found.');
      return;
    }

    const tab = tabs[0];

    if (tab.incognito) {
      chrome.extension.isAllowedIncognitoAccess((isAllowed) => {
        if (!isAllowed) {
          showIncognitoAccessError();
          return;
        }
        scanTab(tab);
      });
      return;
    }

    scanTab(tab);
  });
}

function scanTab(tab) {
  if (isRestrictedUrl(tab.url)) {
    showAccessError(
      'Chrome doesn\'t allow extensions to access browser-internal pages ' +
      '(chrome://, about:, devtools, etc.). Navigate to a regular website and try again.'
    );
    return;
  }

  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, files: ['content.js'] },
    () => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || '';
        if (tab.incognito && /incognito/i.test(message)) {
          showIncognitoAccessError();
          return;
        }
        showAccessError(message || 'This page type doesn\'t allow extension access.');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'getLinks' }, (res) => {
        if (chrome.runtime.lastError) {
          showAccessError('Could not read the page. Try refreshing.');
          return;
        }

        if (!res) {
          showAccessError('Could not read the page. Try refreshing.');
          return;
        }

        allLinks = res.links || [];
        filterText = '';
        showStatus(`Found ${allLinks.length} video link${allLinks.length !== 1 ? 's' : ''}`, allLinks.length > 0 ? 'active' : 'error');
        renderLinks(allLinks);
      });
    }
  );
}

// ── Highlight toggle ──────────────────────────────────────────────────────────
btnHighlight.addEventListener('click', () => {
  isHighlighting = !isHighlighting;
  btnHighlight.classList.toggle('active', isHighlighting);
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || isRestrictedUrl(tabs[0].url)) return;
    chrome.tabs.sendMessage(tabs[0].id, {
      action: isHighlighting ? 'highlightLinks' : 'clearHighlights'
    }, () => void chrome.runtime.lastError);
  });
});

btnRefresh.addEventListener('click', () => {
  isHighlighting = false;
  btnHighlight.classList.remove('active');
  if (activeTab === 'custom') {
    const url = urlInput.value.trim();
    if (url) {
      scrapeUrl(url);
    } else {
      scanPage();
    }
  } else {
    scanPage();
  }
});

// ── Escape HTML ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
scanPage();
