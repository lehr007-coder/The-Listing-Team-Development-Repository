export const adminHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Server Admin</title>
  <link rel="stylesheet" href="/admin/style.css">
</head>
<body>
  <header>
    <h1>Image Server Admin</h1>
    <div style="display:flex;align-items:center;gap:1.5rem;">
      <a href="/admin/embed-guide.html" style="font-size:0.875rem;color:#2563eb;text-decoration:none;">GHL Embed Guide</a>
      <div id="stats" class="stats"></div>
    </div>
  </header>

  <main>
    <section class="upload-section">
      <h2>Upload Image</h2>
      <form id="upload-form">
        <div id="drop-zone" class="drop-zone">
          <p>Drag & drop an image here or click to select</p>
          <input type="file" id="file-input" name="image" accept="image/*" hidden>
        </div>
        <div id="file-preview" class="file-preview hidden"></div>
        <div class="form-row">
          <div class="form-group">
            <label for="alt-title">Alt Title</label>
            <input type="text" id="alt-title" name="alt_title" placeholder="Descriptive alt text for accessibility">
          </div>
          <div class="form-group">
            <label for="slug-input">Custom Slug (optional)</label>
            <input type="text" id="slug-input" name="slug" placeholder="auto-generated-if-empty">
          </div>
        </div>
        <div class="form-group">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="3" placeholder="Image description or caption"></textarea>
        </div>
        <div id="upload-progress" class="progress-bar hidden">
          <div class="progress-fill"></div>
        </div>
        <button type="submit" id="upload-btn" class="btn btn-primary" disabled>Upload Image</button>
      </form>
    </section>

    <section class="gallery-section">
      <div class="gallery-header">
        <h2>Images</h2>
        <div class="search-box">
          <input type="text" id="search-input" placeholder="Search images...">
        </div>
      </div>
      <div id="image-grid" class="image-grid"></div>
      <div id="pagination" class="pagination"></div>
    </section>
  </main>

  <div id="edit-modal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <h3>Edit Image</h3>
      <div id="edit-preview" class="edit-preview"></div>
      <form id="edit-form">
        <input type="hidden" id="edit-id">
        <div class="form-group">
          <label for="edit-alt-title">Alt Title</label>
          <input type="text" id="edit-alt-title" name="alt_title">
        </div>
        <div class="form-group">
          <label for="edit-slug">Slug</label>
          <input type="text" id="edit-slug" name="slug">
        </div>
        <div class="form-group">
          <label for="edit-description">Description</label>
          <textarea id="edit-description" name="description" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>Public URL</label>
          <div class="url-copy">
            <input type="text" id="edit-url" readonly>
            <button type="button" class="btn btn-small" onclick="copyUrl()">Copy</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  </div>

  <script src="/admin/app.js"></script>
</body>
</html>`;
