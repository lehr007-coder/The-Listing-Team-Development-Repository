export const adminJS = `
var API = '/admin/api';
var currentPage = 1;
var searchTimeout = null;

// Tab navigation
document.querySelectorAll('.sidebar-nav li[data-tab]').forEach(function(li) {
  li.addEventListener('click', function() {
    document.querySelectorAll('.sidebar-nav li').forEach(function(l) { l.classList.remove('active'); });
    li.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
    document.getElementById('tab-' + li.getAttribute('data-tab')).classList.add('active');
  });
});

var dropZone = document.getElementById('drop-zone');
var fileInput = document.getElementById('file-input');
var filePreview = document.getElementById('file-preview');
var uploadForm = document.getElementById('upload-form');
var uploadBtn = document.getElementById('upload-btn');
var progressBar = document.getElementById('upload-progress');
var progressFill = progressBar.querySelector('.progress-fill');
var imageGrid = document.getElementById('image-grid');
var pagination = document.getElementById('pagination');
var searchInput = document.getElementById('search-input');
var statsEl = document.getElementById('stats');

loadStats();
loadImages();

dropZone.addEventListener('click', function() { fileInput.click(); });

dropZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', function() {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    showPreview(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', function() {
  if (fileInput.files.length) showPreview(fileInput.files[0]);
});

function showPreview(file) {
  var url = URL.createObjectURL(file);
  var size = (file.size / 1024).toFixed(1);
  filePreview.innerHTML = '<img src="' + url + '" alt="Preview">' +
    '<div class="file-info"><strong>' + escapeHtml(file.name) + '</strong>' + size + ' KB &middot; ' + file.type + '</div>';
  filePreview.classList.remove('hidden');
  uploadBtn.disabled = false;
  var altInput = document.getElementById('alt-title');
  if (!altInput.value) {
    altInput.value = file.name.replace(/\\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }
}

uploadForm.addEventListener('submit', function(e) {
  e.preventDefault();
  if (!fileInput.files.length) return;

  var formData = new FormData();
  formData.append('image', fileInput.files[0]);
  formData.append('alt_title', document.getElementById('alt-title').value);
  formData.append('description', document.getElementById('description').value);
  var slugVal = document.getElementById('slug-input').value.trim();
  if (slugVal) formData.append('slug', slugVal);

  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  uploadBtn.disabled = true;

  var xhr = new XMLHttpRequest();
  xhr.open('POST', API + '/images');

  xhr.upload.addEventListener('progress', function(e) {
    if (e.lengthComputable) progressFill.style.width = ((e.loaded / e.total) * 100) + '%';
  });

  xhr.addEventListener('load', function() {
    progressBar.classList.add('hidden');
    uploadBtn.disabled = false;
    if (xhr.status === 201) {
      toast('Image uploaded successfully!', 'success');
      uploadForm.reset();
      filePreview.classList.add('hidden');
      uploadBtn.disabled = true;
      loadImages();
      loadStats();
      // Switch to library tab
      document.querySelector('[data-tab="library"]').click();
    } else {
      var err = JSON.parse(xhr.responseText);
      toast(err.error || 'Upload failed', 'error');
    }
  });

  xhr.addEventListener('error', function() {
    progressBar.classList.add('hidden');
    uploadBtn.disabled = false;
    toast('Upload failed - network error', 'error');
  });

  xhr.send(formData);
});

function loadImages(page) {
  page = page || 1;
  currentPage = page;
  var search = searchInput.value.trim();
  var params = 'page=' + page + '&limit=20';
  if (search) params += '&search=' + encodeURIComponent(search);

  fetch(API + '/images?' + params)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      renderImages(data.images);
      renderPagination(data.page, data.totalPages);
    })
    .catch(function() {
      imageGrid.innerHTML = '<div class="empty-state"><p>Failed to load images</p></div>';
    });
}

function renderImages(images) {
  if (!images.length) {
    imageGrid.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>No images yet. Upload your first image!</p></div>';
    return;
  }

  imageGrid.innerHTML = images.map(function(img) {
    var iframeCode = '<iframe src=&quot;' + escapeHtml(img.url).replace('/images/', '/embed/') + '&quot; width=&quot;600&quot; height=&quot;400&quot; frameborder=&quot;0&quot; style=&quot;border:none;&quot;></iframe>';
    return '<div class="image-card">' +
      '<img class="thumb" src="/images/' + escapeHtml(img.slug) + '" alt="' + escapeHtml(img.alt_title) + '" loading="lazy">' +
      '<div class="card-body">' +
        '<div class="card-title">' + escapeHtml(img.alt_title || img.original_name) + '</div>' +
        '<a class="card-slug" href="/images/' + escapeHtml(img.slug) + '" target="_blank">/images/' + escapeHtml(img.slug) + '</a>' +
        (img.description ? '<div class="card-desc">' + escapeHtml(img.description) + '</div>' : '') +
        '<div class="card-meta">' +
          '<span>' + formatSize(img.file_size) + '</span>' +
          (img.width ? '<span>' + img.width + ' x ' + img.height + '</span>' : '') +
          '<span>' + formatDate(img.created_at) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="btn btn-sm btn-outline" onclick="copyToClipboard(\\'' + escapeHtml(img.url) + '\\')">URL</button>' +
        '<button class="btn btn-sm btn-outline" onclick="copyToClipboard(\\'<iframe src=&quot;' + escapeHtml(img.url).replace('/images/', '/embed/') + '&quot; width=&quot;600&quot; height=&quot;400&quot; frameborder=&quot;0&quot; style=&quot;border:none;&quot;></iframe>\\')">Iframe</button>' +
        '<button class="btn btn-sm btn-outline" onclick="editImage(' + img.id + ')">Edit</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteImage(' + img.id + ', \\'' + escapeHtml(img.alt_title || img.original_name).replace(/'/g, "\\\\'") + '\\')">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) { pagination.innerHTML = ''; return; }
  var html = '';
  if (page > 1) html += '<button class="btn btn-sm" onclick="loadImages(' + (page - 1) + ')">Prev</button>';
  for (var i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      html += '<button class="btn btn-sm ' + (i === page ? 'active' : '') + '" onclick="loadImages(' + i + ')">' + i + '</button>';
    } else if (i === page - 3 || i === page + 3) {
      html += '<span style="padding:0.25rem;color:var(--text-dim)">...</span>';
    }
  }
  if (page < totalPages) html += '<button class="btn btn-sm" onclick="loadImages(' + (page + 1) + ')">Next</button>';
  pagination.innerHTML = html;
}

searchInput.addEventListener('input', function() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(function() { loadImages(1); }, 300);
});

function editImage(id) {
  fetch(API + '/images/' + id)
    .then(function(r) { return r.json(); })
    .then(function(img) {
      document.getElementById('edit-id').value = img.id;
      document.getElementById('edit-alt-title').value = img.alt_title;
      document.getElementById('edit-slug').value = img.slug;
      document.getElementById('edit-description').value = img.description;
      document.getElementById('edit-url').value = img.url;
      document.getElementById('edit-iframe').value = '<iframe src="' + img.url.replace('/images/', '/embed/') + '" width="600" height="400" frameborder="0" style="border:none;"></iframe>';
      document.getElementById('edit-preview').innerHTML = '<img src="/images/' + escapeHtml(img.slug) + '" alt="' + escapeHtml(img.alt_title) + '">';
      document.getElementById('edit-modal').classList.remove('hidden');
    })
    .catch(function() { toast('Failed to load image details', 'error'); });
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

document.querySelector('.modal-backdrop').addEventListener('click', closeModal);

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('edit-form').addEventListener('submit', function(e) {
  e.preventDefault();
  var id = document.getElementById('edit-id').value;

  fetch(API + '/images/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alt_title: document.getElementById('edit-alt-title').value,
      slug: document.getElementById('edit-slug').value,
      description: document.getElementById('edit-description').value,
    }),
  })
    .then(function(res) {
      if (res.ok) {
        toast('Image updated!', 'success');
        closeModal();
        loadImages(currentPage);
      } else {
        return res.json().then(function(err) { toast(err.error || 'Update failed', 'error'); });
      }
    })
    .catch(function() { toast('Update failed - network error', 'error'); });
});

function deleteImage(id, name) {
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
  fetch(API + '/images/' + id, { method: 'DELETE' })
    .then(function(res) {
      if (res.ok) { toast('Image deleted', 'success'); loadImages(currentPage); loadStats(); }
      else toast('Delete failed', 'error');
    })
    .catch(function() { toast('Delete failed - network error', 'error'); });
}

function loadStats() {
  fetch(API + '/stats')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      statsEl.innerHTML = '<div class="stat-row"><span>Images</span><span class="stat-value">' + data.totalImages + '</span></div>' +
        '<div class="stat-row"><span>Storage</span><span class="stat-value">' + formatSize(data.totalSize) + '</span></div>';
    })
    .catch(function() {});
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    toast('Copied to clipboard!', 'success');
  }).catch(function() {
    var input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    toast('Copied to clipboard!', 'success');
  });
}

function copyUrl() {
  copyToClipboard(document.getElementById('edit-url').value);
}

function copyIframe() {
  copyToClipboard(document.getElementById('edit-iframe').value);
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
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(message, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3000);
}
`;
