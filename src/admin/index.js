export const adminHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Server - Real Listing Team</title>
  <link rel="stylesheet" href="/admin/style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <nav class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon">RLT</div>
      <span>Image Server</span>
    </div>
    <ul class="sidebar-nav">
      <li class="active" data-tab="upload"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload</li>
      <li data-tab="library"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Library</li>
      <li><a href="/admin/embed-guide.html" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:0.75rem;width:100%;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Embed Guide</a></li>
    </ul>
    <div class="sidebar-stats" id="stats"></div>
  </nav>

  <div class="main-content">
    <!-- Upload Tab -->
    <div class="tab-content active" id="tab-upload">
      <div class="page-header">
        <h1>Upload Image</h1>
        <p class="subtitle">Add images to your library for use on websites and GHL funnels</p>
      </div>
      <div class="card upload-card">
        <form id="upload-form">
          <div id="drop-zone" class="drop-zone">
            <div class="drop-zone-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p class="drop-zone-title">Drag & drop your image here</p>
            <p class="drop-zone-sub">or click to browse files</p>
            <span class="drop-zone-formats">JPEG, PNG, GIF, WebP, SVG up to 10MB</span>
            <input type="file" id="file-input" name="image" accept="image/*" hidden>
          </div>
          <div id="file-preview" class="file-preview hidden"></div>
          <div class="form-grid">
            <div class="form-group">
              <label for="alt-title">Alt Title</label>
              <input type="text" id="alt-title" name="alt_title" placeholder="e.g. Modern kitchen renovation">
            </div>
            <div class="form-group">
              <label for="slug-input">Custom URL Slug <span class="optional">(optional)</span></label>
              <input type="text" id="slug-input" name="slug" placeholder="auto-generated-if-empty">
            </div>
          </div>
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="3" placeholder="Describe this image for SEO and accessibility"></textarea>
          </div>
          <div id="upload-progress" class="progress-bar hidden">
            <div class="progress-fill"></div>
          </div>
          <button type="submit" id="upload-btn" class="btn btn-primary btn-lg" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Image
          </button>
        </form>
      </div>
    </div>

    <!-- Library Tab -->
    <div class="tab-content" id="tab-library">
      <div class="page-header">
        <div>
          <h1>Image Library</h1>
          <p class="subtitle">Manage your uploaded images</p>
        </div>
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="search-input" placeholder="Search images...">
        </div>
      </div>
      <div id="image-grid" class="image-grid"></div>
      <div id="pagination" class="pagination"></div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div id="edit-modal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Edit Image</h3>
        <button type="button" class="modal-close" onclick="closeModal()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div id="edit-preview" class="edit-preview"></div>
      <form id="edit-form">
        <input type="hidden" id="edit-id">
        <div class="form-group">
          <label for="edit-alt-title">Alt Title</label>
          <input type="text" id="edit-alt-title" name="alt_title">
        </div>
        <div class="form-group">
          <label for="edit-slug">URL Slug</label>
          <input type="text" id="edit-slug" name="slug">
        </div>
        <div class="form-group">
          <label for="edit-description">Description</label>
          <textarea id="edit-description" name="description" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>Direct URL</label>
          <div class="url-copy">
            <input type="text" id="edit-url" readonly>
            <button type="button" class="btn btn-outline btn-sm" onclick="copyUrl()">Copy</button>
          </div>
        </div>
        <div class="form-group">
          <label>Iframe Embed</label>
          <div class="url-copy">
            <input type="text" id="edit-iframe" readonly>
            <button type="button" class="btn btn-outline btn-sm" onclick="copyIframe()">Copy</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/admin/app.js"></script>
</body>
</html>`;
