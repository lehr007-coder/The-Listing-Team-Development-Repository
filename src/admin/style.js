export const adminCSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg: #0f1117;
  --bg-secondary: #161822;
  --surface: #1c1e2e;
  --surface-hover: #242640;
  --border: #2a2d42;
  --border-light: #353851;
  --text: #e8eaed;
  --text-muted: #8b8fa3;
  --text-dim: #5f6377;
  --primary: #6366f1;
  --primary-hover: #818cf8;
  --primary-glow: rgba(99, 102, 241, 0.15);
  --primary-soft: rgba(99, 102, 241, 0.1);
  --danger: #ef4444;
  --danger-hover: #f87171;
  --success: #22c55e;
  --success-soft: rgba(34, 197, 94, 0.1);
  --warning: #f59e0b;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.4);
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  width: 240px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 50;
}

.sidebar-brand {
  padding: 1.25rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.brand-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--primary), #a855f7);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: white;
}

.sidebar-nav {
  list-style: none;
  padding: 0.75rem;
  flex: 1;
}

.sidebar-nav li {
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all var(--transition);
  margin-bottom: 2px;
}

.sidebar-nav li:hover {
  color: var(--text);
  background: var(--surface);
}

.sidebar-nav li.active {
  color: white;
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.sidebar-stats {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.sidebar-stats .stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0;
}

.sidebar-stats .stat-value {
  font-weight: 600;
  color: var(--text);
}

/* Main Content */
.main-content {
  margin-left: 240px;
  flex: 1;
  padding: 2rem 2.5rem;
  min-height: 100vh;
}

.tab-content { display: none; }
.tab-content.active { display: block; }

.page-header {
  margin-bottom: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/* Cards */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2rem;
}

.upload-card {
  max-width: 720px;
}

/* Drop Zone */
.drop-zone {
  border: 2px dashed var(--border-light);
  border-radius: var(--radius);
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  transition: all var(--transition);
  background: var(--bg);
}

.drop-zone:hover, .drop-zone.dragover {
  border-color: var(--primary);
  background: var(--primary-glow);
}

.drop-zone-icon {
  color: var(--text-dim);
  margin-bottom: 1rem;
}

.drop-zone.dragover .drop-zone-icon { color: var(--primary); }

.drop-zone-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text);
  margin-bottom: 0.25rem;
}

.drop-zone-sub {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.drop-zone-formats {
  display: inline-block;
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-dim);
  background: var(--surface);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
}

/* File Preview */
.file-preview {
  margin: 1.25rem 0;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.file-preview img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.file-preview .file-info {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.file-preview .file-info strong {
  color: var(--text);
  display: block;
  margin-bottom: 0.15rem;
}

/* Forms */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 1rem;
}

.form-grid .form-group { margin-top: 0; }

label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

label .optional {
  font-weight: 400;
  text-transform: none;
  color: var(--text-dim);
}

input[type="text"], textarea {
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-family: inherit;
  width: 100%;
  transition: all var(--transition);
  background: var(--bg);
  color: var(--text);
}

input[type="text"]::placeholder, textarea::placeholder {
  color: var(--text-dim);
}

input[type="text"]:focus, textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

/* Buttons */
.btn {
  padding: 0.55rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 500;
  transition: all var(--transition);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn:hover { background: var(--surface-hover); border-color: var(--border-light); }

.btn-primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-lg {
  padding: 0.75rem 1.5rem;
  font-size: 0.95rem;
  margin-top: 1.5rem;
  border-radius: var(--radius);
}

.btn-sm { padding: 0.35rem 0.65rem; font-size: 0.8rem; }

.btn-outline {
  background: transparent;
  border-color: var(--border-light);
  color: var(--text-muted);
}

.btn-outline:hover { background: var(--surface); color: var(--text); }

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-muted);
}

.btn-ghost:hover { background: var(--surface); color: var(--text); }

.btn-danger { color: var(--danger); border-color: transparent; background: transparent; }
.btn-danger:hover { background: rgba(239, 68, 68, 0.1); }

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 6px;
}

/* Progress */
.progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 1.25rem;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), #a855f7);
  width: 0%;
  transition: width 0.3s;
  border-radius: 2px;
}

/* Search */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-box svg {
  position: absolute;
  left: 0.75rem;
  color: var(--text-dim);
  pointer-events: none;
}

.search-box input {
  padding-left: 2.25rem;
  width: 280px;
  background: var(--surface);
}

/* Image Grid */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
}

.image-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: all var(--transition);
}

.image-card:hover {
  border-color: var(--border-light);
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.image-card .thumb {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
  background: var(--bg);
}

.image-card .card-body { padding: 1rem; }

.image-card .card-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-card .card-slug {
  font-size: 0.75rem;
  color: var(--primary-hover);
  word-break: break-all;
  text-decoration: none;
}

.image-card .card-slug:hover { text-decoration: underline; }

.image-card .card-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.image-card .card-meta {
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-top: 0.5rem;
  display: flex;
  gap: 1rem;
}

.image-card .card-actions {
  display: flex;
  gap: 0.35rem;
  padding: 0.65rem 1rem;
  border-top: 1px solid var(--border);
}

.image-card .card-actions .btn {
  flex: 1;
  text-align: center;
  padding: 0.4rem;
  font-size: 0.8rem;
  border-radius: 6px;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 2rem;
}

.pagination button { min-width: 36px; border-radius: 6px; }
.pagination button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* Modal */
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal-content {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.75rem;
  width: 90%;
  max-width: 520px;
  box-shadow: var(--shadow-lg);
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.modal-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.25rem;
  border-radius: 6px;
  transition: all var(--transition);
}

.modal-close:hover { color: var(--text); background: var(--surface-hover); }

.edit-preview {
  margin-bottom: 1rem;
}

.edit-preview img {
  max-width: 100%;
  max-height: 200px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.url-copy {
  display: flex;
  gap: 0.5rem;
}

.url-copy input {
  flex: 1;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.8rem;
  background: var(--bg);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

/* Toast */
.hidden { display: none !important; }

.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.85rem 1.25rem;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  z-index: 200;
  animation: slideIn 0.3s var(--transition), fadeOut 0.3s 2.7s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: var(--shadow);
}

.toast.success { background: var(--success); }
.toast.error { background: var(--danger); }

@keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-muted);
}

.empty-state svg { color: var(--text-dim); margin-bottom: 1rem; }
.empty-state p { font-size: 0.95rem; }

/* Responsive */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .main-content { margin-left: 0; padding: 1rem; }
  .form-grid { grid-template-columns: 1fr; }
  .search-box input { width: 100%; }
  .image-grid { grid-template-columns: 1fr; }
  .page-header { flex-direction: column; }
}
`;
