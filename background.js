// Background service worker - handles URL scraping

const VIDEO_EXTENSIONS = [
  'mp4', 'webm', 'm3u8', 'mov', 'avi', 'mkv', 'flv',
  'wmv', 'm4v', 'mpg', 'mpeg', '3gp', 'ogv', 'ts',
  'f4v', 'vob', 'rm', 'rmvb', 'asf'
];

const VIDEO_PATTERN = new RegExp(
  'https?://[^\\s\'"<>]+\\.(' + VIDEO_EXTENSIONS.join('|') + ')(\\?[^\\s\'"<>]*)?',
  'gi'
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge' && sender.tab) {
    const count = request.count;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : '',
      tabId: sender.tab.id
    });
    chrome.action.setBadgeBackgroundColor({ color: '#ff5e00', tabId: sender.tab.id });
  }

  if (request.action === 'scrapeUrl') {
    scrapeUrl(request.url).then(links => {
      sendResponse({ links });
    }).catch(err => {
      sendResponse({ error: err.message, links: [] });
    });
    return true; // async response
  }
});

async function scrapeUrl(url) {
  const links = [];
  const seen = new Set();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract video URLs from HTML
    let match;
    VIDEO_PATTERN.lastIndex = 0;
    while ((match = VIDEO_PATTERN.exec(html)) !== null) {
      let href = match[0];

      // Resolve relative URLs
      if (href.startsWith('//')) {
        href = 'https:' + href;
      } else if (href.startsWith('/')) {
        const baseUrl = new URL(url);
        href = baseUrl.origin + href;
      }

      if (!seen.has(href)) {
        seen.add(href);
        const ext = (href.match(/\.([a-z0-9]+)(\?.*)?$/i) || ['', '', ''])[1].toLowerCase();
        const filename = href.split('/').pop().split('?')[0] || href;
        links.push({
          href,
          text: filename,
          ext: ext ? ext.toUpperCase() : 'VIDEO'
        });
      }
    }

    // Also extract from src/href attributes in HTML
    const attrPattern = /(?:src|href|data-src|data-url|data-video)=["']([^"']+)["']/gi;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(html)) !== null) {
      let href = attrMatch[1];

      // Resolve relative URLs
      if (href.startsWith('//')) {
        href = 'https:' + href;
      } else if (href.startsWith('/')) {
        const baseUrl = new URL(url);
        href = baseUrl.origin + href;
      } else if (!href.startsWith('http')) {
        continue;
      }

      // Check if it's a video URL
      const extMatch = href.match(/\.([a-z0-9]+)(\?.*)?$/i);
      if (extMatch && VIDEO_EXTENSIONS.includes(extMatch[1].toLowerCase())) {
        if (!seen.has(href)) {
          seen.add(href);
          const ext = extMatch[1].toLowerCase();
          const filename = href.split('/').pop().split('?')[0] || href;
          links.push({
            href,
            text: filename,
            ext: ext.toUpperCase()
          });
        }
      }
    }

    // Extract from JSON strings (common in modern sites)
    const jsonPattern = /"url"\s*:\s*"(https?:\/\/[^"]+)"/gi;
    let jsonMatch;
    while ((jsonMatch = jsonPattern.exec(html)) !== null) {
      let href = jsonMatch[1].replace(/\\\//g, '/');
      const extMatch = href.match(/\.([a-z0-9]+)(\?.*)?$/i);
      if (extMatch && VIDEO_EXTENSIONS.includes(extMatch[1].toLowerCase())) {
        if (!seen.has(href)) {
          seen.add(href);
          const ext = extMatch[1].toLowerCase();
          const filename = href.split('/').pop().split('?')[0] || href;
          links.push({
            href,
            text: filename,
            ext: ext.toUpperCase()
          });
        }
      }
    }

  } catch (err) {
    throw new Error(`Failed to fetch: ${err.message}`);
  }

  return links;
}

// Clear badge when tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
