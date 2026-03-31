// Video Link Scraper - Content Script
// Scans the page for all video-related links

(function () {
  // Comprehensive video extensions
  const VIDEO_EXTENSIONS = [
    'mp4', 'webm', 'm3u8', 'mov', 'avi', 'mkv', 'flv',
    'wmv', 'm4v', 'mpg', 'mpeg', '3gp', 'ogv', 'ts',
    'f4v', 'vob', 'rm', 'rmvb', 'asf'
  ];

  // Build pattern: .(ext1|ext2|...)(\?.*)?$
  const VIDEO_PATTERN = new RegExp(
    '\\.(' + VIDEO_EXTENSIONS.join('|') + ')(\\?.*)?$',
    'i'
  );

  // Pattern for raw URLs in text
  const RAW_URL_PATTERN = new RegExp(
    'https?://[^\\s\'"<>]+\\.(' + VIDEO_EXTENSIONS.join('|') + ')(\\?[^\\s\'"<>]*)?',
    'gi'
  );

  function getVideoLinks() {
    const links = [];
    const seen = new Set();

    // Scan anchor tags
    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach((a) => {
      const href = a.href;
      if (!href || seen.has(href)) return;

      try {
        const url = new URL(href);
        const pathname = url.pathname;

        if (VIDEO_PATTERN.test(pathname)) {
          seen.add(href);
          const ext = (pathname.match(/\.([a-z0-9]+)(\?.*)?$/i) || ['', '', ''])[1].toLowerCase();
          links.push({
            href: href,
            text: (a.textContent || '').trim().slice(0, 80) || href,
            ext: ext.toUpperCase()
          });
        }
      } catch {
        // Skip invalid URLs
      }
    });

    // Scan <video> and <source> tags
    const videoEls = document.querySelectorAll('video, source');
    videoEls.forEach((el) => {
      const src = el.src || el.getAttribute('src');
      if (src && !seen.has(src)) {
        seen.add(src);
        const ext = (src.match(/\.([a-z0-9]+)(\?.*)?$/i) || ['', '', ''])[1].toLowerCase();
        links.push({
          href: src,
          text: el.tagName.toLowerCase() + ' source',
          ext: ext ? ext.toUpperCase() : 'VIDEO'
        });
      }
    });

    // Scan text nodes for raw video URLs
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      let match;
      RAW_URL_PATTERN.lastIndex = 0;
      while ((match = RAW_URL_PATTERN.exec(text)) !== null) {
        const href = match[0];
        if (!seen.has(href)) {
          seen.add(href);
          const ext = (href.match(/\.([a-z0-9]+)(\?.*)?$/i) || ['', '', ''])[1].toLowerCase();
          links.push({
            href: href,
            text: href.split('/').pop().split('?')[0] || href,
            ext: ext ? ext.toUpperCase() : 'VIDEO'
          });
        }
      }
    }

    // Scan data attributes and JSON in script tags
    const scripts = document.querySelectorAll('script[type="application/json"], script:not([type])');
    const jsonUrlPattern = new RegExp(
      'https?://[^\\s\'"<>]+\\.(' + VIDEO_EXTENSIONS.join('|') + ')(\\?[^\\s\'"<>]*)?',
      'gi'
    );
    scripts.forEach((script) => {
      const text = script.textContent;
      if (!text) return;
      let match;
      jsonUrlPattern.lastIndex = 0;
      while ((match = jsonUrlPattern.exec(text)) !== null) {
        const href = match[0];
        if (!seen.has(href)) {
          seen.add(href);
          const ext = (href.match(/\.([a-z0-9]+)(\?.*)?$/i) || ['', '', ''])[1].toLowerCase();
          links.push({
            href: href,
            text: 'script data',
            ext: ext ? ext.toUpperCase() : 'VIDEO'
          });
        }
      }
    });

    return links;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getLinks') {
      sendResponse({ links: getVideoLinks() });
    }
    if (request.action === 'highlightLinks') {
      highlightLinks();
      sendResponse({ ok: true });
    }
    if (request.action === 'clearHighlights') {
      clearHighlights();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Highlight detected video links on the page
  function highlightLinks() {
    clearHighlights();
    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach((a) => {
      try {
        if (VIDEO_PATTERN.test(new URL(a.href).pathname)) {
          a.setAttribute('data-video-highlight', 'true');
          a.style.outline = '2px solid #ff5e00';
          a.style.outlineOffset = '2px';
          a.style.borderRadius = '2px';
          a.style.backgroundColor = 'rgba(255, 94, 0, 0.12)';
        }
      } catch {
        // Skip invalid URLs
      }
    });
  }

  function clearHighlights() {
    document.querySelectorAll('[data-video-highlight]').forEach((el) => {
      el.removeAttribute('data-video-highlight');
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.borderRadius = '';
      el.style.backgroundColor = '';
    });
  }

  // Auto-scan on page load and store count for badge
  const links = getVideoLinks();
  if (links.length > 0) {
    chrome.runtime.sendMessage({ action: 'updateBadge', count: links.length });
  }
})();
