/**
 * TLT Image Server - Embeddable Widget for GHL Funnels & Websites
 *
 * SETUP: Add this to a GHL Custom HTML/JS element or any website.
 *
 * ============================================================
 * SINGLE IMAGE:
 * ============================================================
 * <div class="tlt-image" data-slug="your-image-slug"></div>
 * <script src="https://images.yourdomain.com/embed/widget.js" data-server="https://images.yourdomain.com"></script>
 *
 * Optional attributes:
 *   data-max-width="600px"   - max width of the image
 *   data-rounded="true"      - rounded corners
 *
 * ============================================================
 * IMAGE GALLERY:
 * ============================================================
 * <div class="tlt-gallery" data-columns="3" data-limit="6"></div>
 * <script src="https://images.yourdomain.com/embed/widget.js" data-server="https://images.yourdomain.com"></script>
 *
 * Optional attributes:
 *   data-columns="3"         - number of columns (default 3)
 *   data-limit="12"          - max images to show (default 12)
 *   data-search="keyword"    - filter by search term
 *   data-gap="16px"          - spacing between images
 *   data-captions="true"     - show alt title and description
 *   data-rounded="true"      - rounded corners
 *
 * ============================================================
 */

(function () {
  // Determine server URL
  var scriptTag = document.currentScript;
  var SERVER = (scriptTag && scriptTag.getAttribute('data-server'))
    || (document.querySelector('[data-tlt-server]') && document.querySelector('[data-tlt-server]').getAttribute('data-tlt-server'))
    || window.TLT_IMAGE_SERVER
    || '';

  if (!SERVER) {
    console.warn('TLT Widget: Set your image server URL. Add data-server="https://images.yourdomain.com" to the script tag.');
    return;
  }

  var base = SERVER.replace(/\/$/, '');

  // --- Render Single Images ---
  var singleImages = document.querySelectorAll('.tlt-image');
  for (var i = 0; i < singleImages.length; i++) {
    (function (el) {
      var slug = el.getAttribute('data-slug');
      if (!slug) return;

      var maxWidth = el.getAttribute('data-max-width') || '100%';
      var rounded = el.getAttribute('data-rounded') === 'true';

      var img = document.createElement('img');
      img.src = base + '/images/' + encodeURIComponent(slug);
      img.style.maxWidth = maxWidth;
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      if (rounded) img.style.borderRadius = '8px';

      // Fetch metadata for alt text
      fetch(base + '/images/' + encodeURIComponent(slug) + '/info')
        .then(function (r) { return r.json(); })
        .then(function (info) {
          img.alt = info.alt_title || '';
          img.title = info.description || '';
        })
        .catch(function () {});

      el.innerHTML = '';
      el.appendChild(img);
    })(singleImages[i]);
  }

  // --- Render Galleries ---
  var galleries = document.querySelectorAll('.tlt-gallery');
  for (var g = 0; g < galleries.length; g++) {
    (function (el) {
      var limit = parseInt(el.getAttribute('data-limit'), 10) || 12;
      var search = el.getAttribute('data-search') || '';
      var columns = el.getAttribute('data-columns') || '3';
      var gap = el.getAttribute('data-gap') || '16px';
      var rounded = el.getAttribute('data-rounded') !== 'false';
      var showCaption = el.getAttribute('data-captions') === 'true';

      var params = 'limit=' + limit;
      if (search) params += '&search=' + encodeURIComponent(search);

      fetch(base + '/api/gallery?' + params)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var grid = document.createElement('div');
          grid.style.display = 'grid';
          grid.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';
          grid.style.gap = gap;

          data.images.forEach(function (imgData) {
            var card = document.createElement('div');
            card.style.overflow = 'hidden';
            if (rounded) card.style.borderRadius = '8px';
            card.style.background = '#f5f5f5';

            var imgEl = document.createElement('img');
            imgEl.src = imgData.url;
            imgEl.alt = imgData.alt_title || '';
            imgEl.style.width = '100%';
            imgEl.style.height = 'auto';
            imgEl.style.display = 'block';
            card.appendChild(imgEl);

            if (showCaption && (imgData.alt_title || imgData.description)) {
              var caption = document.createElement('div');
              caption.style.padding = '8px 12px';
              caption.style.fontSize = '14px';
              caption.style.lineHeight = '1.4';
              if (imgData.alt_title) {
                var title = document.createElement('strong');
                title.textContent = imgData.alt_title;
                caption.appendChild(title);
              }
              if (imgData.description) {
                var desc = document.createElement('p');
                desc.textContent = imgData.description;
                desc.style.margin = '4px 0 0';
                desc.style.color = '#666';
                caption.appendChild(desc);
              }
              card.appendChild(caption);
            }

            grid.appendChild(card);
          });

          el.innerHTML = '';
          el.appendChild(grid);
        })
        .catch(function () {
          el.innerHTML = '<span style="color:#999;font-size:14px;">Failed to load gallery</span>';
        });
    })(galleries[g]);
  }
})();
