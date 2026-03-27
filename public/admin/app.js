const API = '/admin/api';
let currentPage = 1;
let searchTimeout = null;

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const uploadForm = document.getElementById('upload-form');
const uploadBtn = document.getElementById('upload-btn');
const progressBar = document.getElementById('upload-progress');
const progressFill = progressBar.querySelector('.progress-fill');
const imageGrid = document.getElementById('image-grid');
const pagination = document.getElementById('pagination');
const searchInput = document.getElementById('search-input');
const statsEl = document.getElementById('stats');

// Init
loadStats();
loadImages();

// -- Upload --

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    showPreview(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    showPreview(fileInput.files[0]);
  }
});

function showPreview(file) {
  const url = URL.createObjectURL(file);
  const size = (file.size / 1024).toFixed(1);
  filePreview.innerHTML = `
    <img src="${url}" alt="Preview">
    <div class="file-info">
      <strong>${escapeHtml(file.name)}</strong><br>
      ${size} KB - ${file.type}
    </div>
  `;
  filePreview.classList.remove('hidden');
  uploadBtn.disabled = false;

  // Auto-fill alt title from filename if empty
  const altInput = document.getElementById('alt-title');
  if (!altInput.value) {
    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    altInput.value = name;
  }
}

uploadForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!fileInput.files.length) return;

  const formData = new FormData();
  formData.append('image', fileInput.files[0]);
  formData.append('alt_title', document.getElementById('alt-title').value);
  formData.append('description', document.getElementById('description').value);
  const slugVal = document.getElementById('slug-input').value.trim();
  if (slugVal) formData.append('slug', slugVal);

  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  uploadBtn.disabled = true;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API}/images`);

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      progressFill.style.width = `${(e.loaded / e.total) * 100}%`;
    }
  });

  xhr.addEventListener('load', () => {
    progressBar.classList.add('hidden');
    uploadBtn.disabled = false;

    if (xhr.status === 201) {
      toast('Image uploaded successfully!', 'success');
      uploadForm.reset();
      filePreview.classList.add('hidden');
      uploadBtn.disabled = true;
      loadImages();
      loadStats();
    } else {
      const err = JSON.parse(xhr.responseText);
      toast(err.error || 'Upload failed', 'error');
    }
  });

  xhr.addEventListener('error', () => {
    progressBar.classList.add('hidden');
    uploadBtn.disabled = false;
    toast('Upload failed - network error', 'error');
  });

  xhr.send(formData);
});

// -- Image List --

async function loadImages(page = 1) {
  currentPage = page;
  const search = searchInput.value.trim();
  const params = new URLSearchParams({ page, limit: 20 });
  if (search) params.set('search', search);

  try {
    const res = await fetch(`${API}/images?${params}`);
    const data = await res.json();
    renderImages(data.images);
    renderPagination(data.page, data.totalPages);
  } catch (err) {
    imageGrid.innerHTML = '<div class="empty-state">Failed to load images</div>';
  }
}

function renderImages(images) {
  if (!images.length) {
    imageGrid.innerHTML = '<div class="empty-state">No images found. Upload your first image above!</div>';
    return;
  }

  imageGrid.innerHTML = images.map((img) => `
    <div class="image-card">
      <img class="thumb" src="/images/${escapeHtml(img.slug)}" alt="${escapeHtml(img.alt_title)}" loading="lazy">
      <div class="card-body">
        <div class="card-title">${escapeHtml(img.alt_title || img.original_name)}</div>
        <a class="card-slug" href="/images/${escapeHtml(img.slug)}" target="_blank">/images/${escapeHtml(img.slug)}</a>
        ${img.description ? `<div class="card-desc">${escapeHtml(img.description)}</div>` : ''}
        <div class="card-meta">
          <span>${formatSize(img.file_size)}</span>
          ${img.width ? `<span>${img.width}x${img.height}</span>` : ''}
          <span>${formatDate(img.created_at)}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-small" onclick="copyToClipboard('${escapeHtml(img.url)}')">Copy URL</button>
        <button class="btn btn-small" onclick="editImage(${img.id})">Edit</button>
        <button class="btn btn-small btn-danger" onclick="deleteImage(${img.id}, '${escapeHtml(img.alt_title || img.original_name)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';
  if (page > 1) html += `<button class="btn btn-small" onclick="loadImages(${page - 1})">Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      html += `<button class="btn btn-small ${i === page ? 'active' : ''}" onclick="loadImages(${i})">${i}</button>`;
    } else if (i === page - 3 || i === page + 3) {
      html += '<span style="padding:0.25rem">...</span>';
    }
  }

  if (page < totalPages) html += `<button class="btn btn-small" onclick="loadImages(${page + 1})">Next</button>`;
  pagination.innerHTML = html;
}

// -- Search --

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadImages(1), 300);
});

// -- Edit --

async function editImage(id) {
  try {
    const res = await fetch(`${API}/images/${id}`);
    const img = await res.json();

    document.getElementById('edit-id').value = img.id;
    document.getElementById('edit-alt-title').value = img.alt_title;
    document.getElementById('edit-slug').value = img.slug;
    document.getElementById('edit-description').value = img.description;
    document.getElementById('edit-url').value = img.url;
    document.getElementById('edit-preview').innerHTML = `<img src="/images/${escapeHtml(img.slug)}" alt="${escapeHtml(img.alt_title)}">`;

    document.getElementById('edit-modal').classList.remove('hidden');
  } catch (err) {
    toast('Failed to load image details', 'error');
  }
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

document.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

document.getElementById('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;

  try {
    const res = await fetch(`${API}/images/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alt_title: document.getElementById('edit-alt-title').value,
        slug: document.getElementById('edit-slug').value,
        description: document.getElementById('edit-description').value,
      }),
    });

    if (res.ok) {
      toast('Image updated!', 'success');
      closeModal();
      loadImages(currentPage);
    } else {
      const err = await res.json();
      toast(err.error || 'Update failed', 'error');
    }
  } catch (err) {
    toast('Update failed - network error', 'error');
  }
});

// -- Delete --

async function deleteImage(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API}/images/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Image deleted', 'success');
      loadImages(currentPage);
      loadStats();
    } else {
      toast('Delete failed', 'error');
    }
  } catch (err) {
    toast('Delete failed - network error', 'error');
  }
}

// -- Stats --

async function loadStats() {
  try {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();
    statsEl.innerHTML = `
      <div><span>${data.totalImages}</span> images</div>
      <div><span>${formatSize(data.totalSize)}</span> storage</div>
    `;
  } catch (err) {
    // ignore
  }
}

// -- Helpers --

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('URL copied!', 'success');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    toast('URL copied!', 'success');
  });
}

function copyUrl() {
  copyToClipboard(document.getElementById('edit-url').value);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(str) {
  return new Date(str + 'Z').toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
