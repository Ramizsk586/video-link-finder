// Video Link Scraper - Popup Script

let allLinks = [];
let isHighlighting = false;
let filterText = '';
let activeTab = 'current';

const mainEl = document.getElementById('main');
const btnHighlight = document.getElementById('btnHighlight');
const btnRefresh = document.getElementById('btnRefresh');
const btnScrape = document.getElementById('btnScrape');
const btnCopyAll = document.getElementById('btnCopyAll');
const btnOpenAll = document.getElementById('btnOpenAll');
const urlInput = document.getElementById('urlInput');
const customInputRow = document.getElementById('customInputRow');
const footerNote = document.getElementById('footerNote');
const toastEl = document.getElementById('toast');
const statusBar = document.getElementById('statusBar');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const tabs = document.querySelectorAll('.tab');

const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://',
  'about:', 'data:', 'devtools://', 'view-source:'
];

// ── Tab switching ─────────────────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    customInputRow.classList.toggle('visible', activeTab === 'custom');

    if (activeTab === 'custom') {
      urlInput.focus();
      showEmptyState('Paste a page URL', 'Use this mode to scan any webpage for direct video links.', '🔗');
      showStatus('Ready to scrape a custom URL', 'active');
    } else {
      urlInput.value = '';
      filterText = '';
      scanPage();
    }
  });
});

// ── Input actions ─────────────────────────────────────────────────────────────
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

btnRefresh.addEventListener('click', () => {
  isHighlighting = false;
  btnHighlight.classList.remove('active');

  if (activeTab === 'custom') {
    const url = urlInput.value.trim();
    if (url) {
      scrapeUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } else {
      showEmptyState('Paste a page URL', 'Use this mode to scan any webpage for direct video links.', '🔗');
    }
    return;
  }

  scanPage();
});

btnHighlight.addEventListener('click', () => {
  isHighlighting = !isHighlighting;
  btnHighlight.classList.toggle('active', isHighlighting);

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0] || isRestrictedUrl(tabs[0].url)) return;
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: isHighlighting ? 'highlightLinks' : 'clearHighlights' },
      () => void chrome.runtime.lastError
    );
  });
});

btnCopyAll.addEventListener('click', async () => {
  const links = getFilteredLinks();
  if (!links.length) return;

  try {
    await navigator.clipboard.writeText(links.map(link => link.href).join('\n'));
    showToast(`Copied ${links.length} URL${links.length !== 1 ? 's' : ''}`);
  } catch {
    showToast('Copy failed', true);
  }
});

btnOpenAll.addEventListener('click', () => {
  const links = getFilteredLinks();
  if (!links.length) return;

  if (links.length > 5 && !confirm(`Open ${links.length} tabs?`)) {
    return;
  }

  links.forEach(link => chrome.tabs.create({ url: link.href, active: false }));
  showToast(`Opened ${links.length} tab${links.length !== 1 ? 's' : ''}`);
});

// ── UI helpers ────────────────────────────────────────────────────────────────
function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `toast${isError ? ' error' : ''}`;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function showStatus(text, type = 'active') {
  statusBar.classList.add('visible');
  statusDot.className = `status-dot ${type}`;
  statusText.textContent = text;
}

function hideStatus() {
  statusBar.classList.remove('visible');
}

function setActionsEnabled(enabled, count = 0) {
  btnCopyAll.disabled = !enabled;
  btnOpenAll.disabled = !enabled;
  btnOpenAll.textContent = enabled ? `Open all (${count})` : 'Open all';
}

function updateFooterNote(text) {
  footerNote.textContent = text;
}

function showLoading(text) {
  mainEl.innerHTML = `
    <div class="loading">
      <div class="loading-card">
        <div class="spinner"></div>
        <div>${escHtml(text)}</div>
      </div>
    </div>
  `;
  setActionsEnabled(false);
}

function showEmptyState(title, subtitle, icon = '🔍') {
  mainEl.innerHTML = `
    <div class="empty">
      <div class="empty-card">
        <div class="empty-icon">${icon}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-sub">${subtitle}</div>
      </div>
    </div>
  `;
  setActionsEnabled(false);
  updateFooterNote('MP4 · WebM · M3U8 · MOV · AVI · MKV');
}

function getFilename(href) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || href);
  } catch {
    return href;
  }
}

function getFilteredLinks() {
  const needle = filterText.trim().toLowerCase();
  if (!needle) return allLinks;

  return allLinks.filter(link =>
    link.href.toLowerCase().includes(needle) ||
    (link.text || '').toLowerCase().includes(needle) ||
    getFilename(link.href).toLowerCase().includes(needle)
  );
}

function renderLinks() {
  const filtered = getFilteredLinks();
  const countLabel = `${filtered.length} video link${filtered.length !== 1 ? 's' : ''}`;

  if (!allLinks.length) {
    showEmptyState('No video links found', 'This page does not seem to contain direct video files.', '📭');
    showStatus('No links found', 'error');
    return;
  }

  mainEl.innerHTML = `
    <div class="summary">
      <div class="summary-left">
        <div class="summary-count">${filtered.length}</div>
        <div class="summary-label">${filtered.length === allLinks.length ? 'Links found' : `Filtered from ${allLinks.length}`}</div>
      </div>
      <div style="width: 150px; max-width: 48%;">
        <input class="filter-input" id="filterInput" placeholder="Filter links" value="${escHtml(filterText)}" />
      </div>
    </div>
    <div class="list">
      ${filtered.length ? filtered.map(link => `
        <div class="link-item" data-href="${escHtml(link.href)}">
          <div class="ext-badge">${escHtml(link.ext || 'VIDEO')}</div>
          <div class="link-info">
            <div class="link-name" title="${escHtml(getFilename(link.href))}">${escHtml(getFilename(link.href))}</div>
            <div class="link-url" title="${escHtml(link.href)}">${escHtml(link.href)}</div>
          </div>
          <div class="link-actions">
            <button class="mini-btn btn-copy" data-href="${escHtml(link.href)}" title="Copy link">⎘</button>
            <button class="mini-btn btn-open" data-href="${escHtml(link.href)}" title="Open link">↗</button>
          </div>
        </div>
      `).join('') : `
        <div class="empty">
          <div class="empty-card">
            <div class="empty-icon">🧹</div>
            <div class="empty-title">No matches</div>
            <div class="empty-sub">Try a different filter keyword.</div>
          </div>
        </div>
      `}
    </div>
  `;

  setActionsEnabled(filtered.length > 0, filtered.length);
  updateFooterNote(countLabel);
  attachRenderedListeners();
}

function attachRenderedListeners() {
  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    filterInput.addEventListener('input', event => {
      filterText = event.target.value;
      renderLinks();
      setTimeout(() => {
        const newInput = document.getElementById('filterInput');
        if (newInput) {
          newInput.focus();
          const pos = newInput.value.length;
          newInput.setSelectionRange(pos, pos);
        }
      }, 0);
    });
  }

  document.querySelectorAll('.link-item').forEach(item => {
    item.addEventListener('click', event => {
      if (event.target.closest('.mini-btn')) return;
      chrome.tabs.create({ url: item.dataset.href, active: true });
    });
  });

  document.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      chrome.tabs.create({ url: btn.dataset.href, active: true });
    });
  });

  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async event => {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(btn.dataset.href);
        btn.classList.add('copy-done');
        btn.textContent = '✓';
        showToast('URL copied');
        setTimeout(() => {
          btn.classList.remove('copy-done');
          btn.textContent = '⎘';
        }, 1200);
      } catch {
        showToast('Copy failed', true);
      }
    });
  });
}

// ── Restricted URL handling ───────────────────────────────────────────────────
function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

function showAccessError(message) {
  showEmptyState('Cannot access this page', message, '🚫');
  showStatus('Access error', 'error');
}

function showIncognitoAccessError() {
  showEmptyState(
    'Incognito access is off',
    'Enable “Allow in Incognito” in the extension settings, then reload the incognito tab.',
    '🕵️'
  );
  showStatus('Incognito access required', 'error');
}

// ── Scrape custom URL ─────────────────────────────────────────────────────────
function scrapeUrl(url) {
  showLoading('Scraping video links…');
  showStatus('Fetching page HTML…', 'active');
  urlInput.disabled = true;
  btnScrape.disabled = true;

  chrome.runtime.sendMessage({ action: 'scrapeUrl', url }, response => {
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
    renderLinks();
    showStatus(`Scraped ${allLinks.length} link${allLinks.length !== 1 ? 's' : ''}`, allLinks.length ? 'active' : 'error');
  });
}

// ── Scan current tab ──────────────────────────────────────────────────────────
function scanPage() {
  showLoading('Scanning current tab…');
  hideStatus();

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0];
    if (!tab) {
      showAccessError('No active tab found.');
      return;
    }

    if (tab.incognito) {
      chrome.extension.isAllowedIncognitoAccess(isAllowed => {
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
    showAccessError('Browser internal pages like chrome:// and edge:// cannot be scanned.');
    return;
  }

  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, files: ['content.js'] },
    () => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || 'This page cannot be accessed.';
        if (tab.incognito && /incognito/i.test(message)) {
          showIncognitoAccessError();
          return;
        }
        showAccessError(message);
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'getLinks' }, response => {
        if (chrome.runtime.lastError || !response) {
          showAccessError('Could not read the page. Try refreshing it.');
          return;
        }

        allLinks = response.links || [];
        filterText = '';
        renderLinks();
        showStatus(`Found ${allLinks.length} link${allLinks.length !== 1 ? 's' : ''}`, allLinks.length ? 'active' : 'error');
      });
    }
  );
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
customInputRow.classList.remove('visible');
scanPage();
