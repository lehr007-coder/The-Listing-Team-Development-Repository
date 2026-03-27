/**
 * Ylopo Custom Object Refresh Script for Go HighLevel
 *
 * PURPOSE: Forces the Ylopo custom object widget/iframe to reload fresh data
 * every time the page is loaded, preventing stagnant/cached data from displaying.
 *
 * INSTALLATION:
 *   1. Log into your Go HighLevel account
 *   2. Go to Settings > Custom Code (or the specific page/funnel where Ylopo objects appear)
 *   3. Paste this entire script inside a <script> tag in the "Header Code" or "Footer Code" section
 *   4. Save changes
 *
 * HOW IT WORKS:
 *   - On every page load, the script finds all Ylopo-related iframes and widgets
 *   - It appends a unique cache-busting timestamp parameter to the iframe src URL
 *   - This forces the browser to fetch fresh data instead of serving cached content
 *   - It also observes the DOM for dynamically loaded iframes (SPA navigation)
 */

(function () {
  'use strict';

  /**
   * Configuration
   * Adjust these selectors if your Ylopo widget uses different identifiers.
   */
  var CONFIG = {
    // CSS selectors to match Ylopo iframes/widgets - add more if needed
    iframeSelectors: [
      'iframe[src*="ylopo"]',
      'iframe[src*="Ylopo"]',
      'iframe[title*="ylopo" i]',
      'iframe[title*="Ylopo"]',
      'iframe[data-source*="ylopo" i]',
      'iframe[id*="ylopo" i]',
      'iframe[class*="ylopo" i]',
      '.ylopo-widget iframe',
      '[data-widget="ylopo"] iframe'
    ],

    // CSS selectors for custom object containers that may lazy-load
    containerSelectors: [
      '.custom-object-section',
      '[data-section="custom-objects"]',
      '.hl-custom-objects',
      '.contact-details-custom-objects',
      '[class*="customObject"]',
      '[class*="custom-object"]'
    ],

    // How long to wait (ms) after page load before refreshing iframes
    initialDelay: 1500,

    // How long to wait (ms) after a new iframe is detected in the DOM
    mutationDelay: 500,

    // Enable console logging for debugging (set to false in production)
    debug: true
  };

  function log(message) {
    if (CONFIG.debug) {
      console.log('[Ylopo Refresh]', message);
    }
  }

  /**
   * Add a cache-busting parameter to a URL to force a fresh request.
   */
  function addCacheBuster(url) {
    if (!url) return url;
    var separator = url.indexOf('?') !== -1 ? '&' : '?';
    // Remove any existing _ylopo_refresh param to avoid stacking
    var cleanUrl = url.replace(/[?&]_ylopo_refresh=\d+/, '');
    // Re-check separator after cleaning
    separator = cleanUrl.indexOf('?') !== -1 ? '&' : '?';
    return cleanUrl + separator + '_ylopo_refresh=' + Date.now();
  }

  /**
   * Find and refresh all Ylopo iframes on the page.
   */
  function refreshYlopoIframes() {
    var combinedSelector = CONFIG.iframeSelectors.join(', ');
    var iframes = document.querySelectorAll(combinedSelector);

    if (iframes.length === 0) {
      log('No Ylopo iframes found with specific selectors. Checking all iframes...');
      // Fallback: check all iframes and look for ylopo in the src
      var allIframes = document.querySelectorAll('iframe');
      allIframes.forEach(function (iframe) {
        var src = iframe.src || iframe.getAttribute('data-src') || '';
        if (src.toLowerCase().indexOf('ylopo') !== -1) {
          reloadIframe(iframe);
        }
      });
      return;
    }

    log('Found ' + iframes.length + ' Ylopo iframe(s). Refreshing...');
    iframes.forEach(function (iframe) {
      reloadIframe(iframe);
    });
  }

  /**
   * Reload a single iframe with a cache-busted URL.
   */
  function reloadIframe(iframe) {
    var currentSrc = iframe.src || iframe.getAttribute('data-src');
    if (!currentSrc) {
      log('Iframe has no src, skipping.');
      return;
    }

    var newSrc = addCacheBuster(currentSrc);
    log('Refreshing iframe: ' + currentSrc + ' -> ' + newSrc);

    // Set the new src to force reload
    iframe.src = newSrc;
  }

  /**
   * Click any "refresh" or "reload" buttons within custom object containers.
   * Some GHL widgets have built-in refresh controls.
   */
  function clickRefreshButtons() {
    var combinedSelector = CONFIG.containerSelectors.join(', ');
    var containers = document.querySelectorAll(combinedSelector);

    containers.forEach(function (container) {
      // Look for refresh/reload buttons
      var refreshBtns = container.querySelectorAll(
        'button[title*="refresh" i], button[title*="reload" i], ' +
        'button[aria-label*="refresh" i], button[aria-label*="reload" i], ' +
        '.refresh-btn, .reload-btn, [data-action="refresh"]'
      );

      refreshBtns.forEach(function (btn) {
        log('Clicking refresh button in custom object container.');
        btn.click();
      });
    });
  }

  /**
   * Force reload custom object sections by clearing their content
   * and triggering GHL's internal data fetch.
   */
  function refreshCustomObjectSections() {
    var combinedSelector = CONFIG.containerSelectors.join(', ');
    var sections = document.querySelectorAll(combinedSelector);

    sections.forEach(function (section) {
      // Dispatch a custom event that GHL's framework may listen for
      section.dispatchEvent(new Event('refresh', { bubbles: true }));

      // Trigger resize to force re-render
      window.dispatchEvent(new Event('resize'));
    });
  }

  /**
   * Set up a MutationObserver to catch dynamically loaded Ylopo iframes.
   * GHL is a single-page app, so iframes may be injected after initial load.
   */
  function observeDynamicIframes() {
    var observer = new MutationObserver(function (mutations) {
      var foundNewIframe = false;

      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          // Check if the added node is a Ylopo iframe
          if (node.tagName === 'IFRAME') {
            var src = (node.src || '').toLowerCase();
            if (src.indexOf('ylopo') !== -1) {
              foundNewIframe = true;
            }
          }

          // Check if the added node contains Ylopo iframes
          if (node.querySelectorAll) {
            var combinedSelector = CONFIG.iframeSelectors.join(', ');
            var nestedIframes = node.querySelectorAll(combinedSelector);
            if (nestedIframes.length > 0) {
              foundNewIframe = true;
            }
          }
        });
      });

      if (foundNewIframe) {
        log('New Ylopo iframe detected in DOM. Scheduling refresh...');
        setTimeout(refreshYlopoIframes, CONFIG.mutationDelay);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    log('DOM observer active. Watching for dynamically loaded Ylopo widgets.');
  }

  /**
   * Listen for GHL's SPA navigation events.
   * When a user navigates between contacts or tabs, we need to refresh again.
   */
  function listenForNavigation() {
    // Listen for URL hash changes (common in SPAs)
    window.addEventListener('hashchange', function () {
      log('Hash change detected. Scheduling Ylopo refresh...');
      setTimeout(function () {
        refreshYlopoIframes();
        clickRefreshButtons();
        refreshCustomObjectSections();
      }, CONFIG.initialDelay);
    });

    // Listen for History API navigation (pushState/replaceState)
    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(this, arguments);
      log('pushState navigation detected. Scheduling Ylopo refresh...');
      setTimeout(function () {
        refreshYlopoIframes();
        clickRefreshButtons();
        refreshCustomObjectSections();
      }, CONFIG.initialDelay);
    };

    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      log('replaceState navigation detected. Scheduling Ylopo refresh...');
      setTimeout(function () {
        refreshYlopoIframes();
        clickRefreshButtons();
        refreshCustomObjectSections();
      }, CONFIG.initialDelay);
    };

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', function () {
      log('popstate navigation detected. Scheduling Ylopo refresh...');
      setTimeout(function () {
        refreshYlopoIframes();
        clickRefreshButtons();
        refreshCustomObjectSections();
      }, CONFIG.initialDelay);
    });

    log('Navigation listeners active.');
  }

  /**
   * Main initialization - runs on every page load.
   */
  function init() {
    log('Initializing Ylopo Object Refresh script...');

    // Initial refresh after a short delay to let GHL finish rendering
    setTimeout(function () {
      refreshYlopoIframes();
      clickRefreshButtons();
      refreshCustomObjectSections();
      log('Initial refresh complete.');
    }, CONFIG.initialDelay);

    // Watch for dynamically loaded iframes
    observeDynamicIframes();

    // Listen for SPA navigation
    listenForNavigation();

    log('Ylopo Object Refresh script fully initialized.');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
