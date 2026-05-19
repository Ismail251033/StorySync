/* ============================================
   StorySync — Main Application Script
   Pure Vanilla JS, localStorage persistence
   ============================================ */

/* ---- State & Storage ---- */
const DB = {
  get: (key) => { try { return JSON.parse(localStorage.getItem('ss_' + key)) || []; } catch { return []; } },
  getObj: (key, def = {}) => { try { return JSON.parse(localStorage.getItem('ss_' + key)) || def; } catch { return def; } },
  set: (key, val) => localStorage.setItem('ss_' + key, JSON.stringify(val)),
};

// Clear any old seed data from previous versions
(function clearOldSeed() {
  const seeded = localStorage.getItem('ss_seeded_cleared');
  if (!seeded) {
    // Remove known seeded titles if they exist
    const oldTitles = ['Dune: Part Two','Shogun','Interstellar','The Bear','Dune (Novel)','Oppenheimer'];
    const lib = DB.get('library');
    const cleaned = lib.filter(i => !oldTitles.includes(i.title));
    if (cleaned.length !== lib.length) {
      DB.set('library', cleaned);
      DB.set('timeline', []);
      DB.set('collections', []);
    }
    localStorage.setItem('ss_seeded_cleared', '1');
  }
})();

let state = {
  library: DB.get('library'),
  collections: DB.get('collections'),
  timeline: DB.get('timeline'),
  profile: DB.getObj('profile', {
    username: 'CinePhile',
    bio: 'Living one story at a time ✨',
    avatar: '',
    favoriteGenres: ['Sci-Fi', 'Drama', 'Thriller'],
  }),
  currentPage: 'home',
  filterMode: 'all',
  searchQuery: '',
  editingItem: null,
  editingCollection: null,
  wrappedMode: 'weekly',
  selectedRating: 0,
  selectedStars: 0,
};

function saveLibrary() { DB.set('library', state.library); }
function saveCollections() { DB.set('collections', state.collections); }
function saveTimeline() { DB.set('timeline', state.timeline); }
function saveProfile() { DB.set('profile', state.profile); }

/* ---- PWA Install ---- */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.add('hidden');
  toast('StorySync installed! 🎉', 'success');
});

/* ---- Service Worker ---- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

/* ---- Helpers ---- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(iso);
}

function stars(n, max = 5) {
  return Array.from({ length: max }, (_, i) =>
    `<span class="star ${i < n ? 'lit' : ''}">★</span>`
  ).join('');
}

function typeEmoji(type) {
  return type === 'movie' ? '🎬' : type === 'series' ? '📺' : '📚';
}

function typeLabel(type) {
  return type === 'movie' ? 'Movie' : type === 'series' ? 'Series' : 'Book';
}

function toast(msg, type = '') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast ${type}`;
  requestAnimationFrame(() => { t.classList.add('show'); });
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function posterImg(item, cls = '') {
  if (item.posterUrl) {
    return `<img src="${item.posterUrl}" class="media-poster ${cls}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="${item.title}">
            <div class="media-poster-placeholder" style="display:none">${typeEmoji(item.type)}</div>`;
  }
  return `<div class="media-poster-placeholder">${typeEmoji(item.type)}</div>`;
}

/* ---- Navigation ---- */
const PAGE_LABELS = {
  home: 'Home', library: 'Library', collections: 'Collections',
  timeline: 'Timeline', wrapped: 'Wrapped', profile: 'Profile',
};

function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  const label = document.getElementById('topbar-label');
  if (label) label.textContent = PAGE_LABELS[page] || 'StorySync';
  renderPage(page);
  window.scrollTo(0, 0);
}

function renderPage(page) {
  switch (page) {
    case 'home': renderHome(); break;
    case 'library': renderLibrary(); break;
    case 'collections': renderCollections(); break;
    case 'timeline': renderTimeline(); break;
    case 'wrapped': renderWrapped(); break;
    case 'profile': renderProfile(); break;
  }
}

/* ---- Timeline Helper ---- */
function addTimelineEvent(text, iconClass = 'added') {
  state.timeline.unshift({ id: uid(), text, iconClass, date: new Date().toISOString() });
  if (state.timeline.length > 200) state.timeline.pop();
  saveTimeline();
}

/* ---- HOME PAGE ---- */
function renderHome() {
  const watched = state.library.filter(i => i.status === 'watched');
  const toWatch = state.library.filter(i => i.status === 'towatch');
  const recent = [...state.library].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0, 8);
  const weekWatched = watched.filter(i => {
    const d = new Date(i.watchedDate || i.addedAt);
    return Date.now() - d.getTime() < 7 * 86400000;
  });

  const favGenre = getFavoriteGenre(watched);

  document.getElementById('home-content').innerHTML = `
    <div class="hero-welcome">
      <div class="hero-greeting">Welcome back, ${state.profile.username} ✨</div>
      <div class="hero-sub">Your cinematic journey continues…</div>
      <div class="quick-stats">
        <div class="quick-stat">
          <div class="quick-stat-num">${state.library.length}</div>
          <div class="quick-stat-label">Total Items</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-num">${watched.length}</div>
          <div class="quick-stat-label">Watched/Read</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-num">${toWatch.length}</div>
          <div class="quick-stat-label">Up Next</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-num">${state.collections.length}</div>
          <div class="quick-stat-label">Collections</div>
        </div>
      </div>
    </div>

    <div class="mini-wrapped" onclick="navigate('wrapped')">
      <div class="mini-wrapped-icon">🎵</div>
      <div class="mini-wrapped-info">
        <h3>This Week's Wrapped</h3>
        <p>${weekWatched.length} items watched · Favorite: ${favGenre || 'Add more content!'}</p>
      </div>
      <span style="color:var(--text-muted);font-size:1.2rem;">→</span>
    </div>

    ${recent.length ? `
    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">Recently Added</div>
          <div class="section-subtitle">Your latest additions</div>
        </div>
        <span class="see-all" onclick="navigate('library')">See all →</span>
      </div>
      <div class="scroll-row">
        ${recent.map(item => mediaCardHTML(item, true)).join('')}
      </div>
    </div>
    ` : ''}

    ${toWatch.length ? `
    <div class="section">
      <div class="section-header">
        <div>
          <div class="section-title">Up Next</div>
          <div class="section-subtitle">Your watchlist</div>
        </div>
      </div>
      <div class="scroll-row">
        ${toWatch.slice(0, 8).map(item => mediaCardHTML(item, true)).join('')}
      </div>
    </div>
    ` : ''}

    ${!state.library.length ? `
    <div class="empty-state">
      <div class="empty-icon">🎬</div>
      <div class="empty-title">Your story begins here</div>
      <div class="empty-sub">Start adding movies, series, and books to your library</div>
      <button class="btn btn-primary" onclick="navigate('library')">Go to Library</button>
    </div>
    ` : ''}
  `;

  // Attach card click handlers
  attachCardHandlers('home-content');
}

function getFavoriteGenre(items) {
  const counts = {};
  items.forEach(i => { if (i.genre) counts[i.genre] = (counts[i.genre] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/* ---- LIBRARY PAGE ---- */
function renderLibrary() {
  let items = [...state.library];
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(i => i.title.toLowerCase().includes(q) || (i.genre || '').toLowerCase().includes(q));
  }
  if (state.filterMode === 'watched') items = items.filter(i => i.status === 'watched');
  else if (state.filterMode === 'towatch') items = items.filter(i => i.status === 'towatch');
  else if (state.filterMode === 'favorites') items = items.filter(i => i.rating >= 4);

  const container = document.getElementById('library-items');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">${state.library.length ? '🔍' : '🎬'}</div>
        <div class="empty-title">${state.library.length ? 'No results found' : 'Your library is empty'}</div>
        <div class="empty-sub">${state.library.length ? 'Try a different filter or search term' : 'Click the + button to add your first item'}</div>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => mediaCardHTML(item)).join('');
  attachCardHandlers('library-items');
}

function mediaCardHTML(item, small = false) {
  return `
    <div class="media-card" data-id="${item.id}">
      ${posterImg(item)}
      <div class="media-overlay">
        <div class="overlay-actions">
          <button class="overlay-btn" onclick="event.stopPropagation();openItemDetail('${item.id}')">View</button>
          <button class="overlay-btn" onclick="event.stopPropagation();openEditItem('${item.id}')">Edit</button>
          <button class="overlay-btn danger" onclick="event.stopPropagation();deleteItem('${item.id}')">Del</button>
        </div>
      </div>
      <div class="media-info">
        <div class="media-title">${item.title}</div>
        <div class="badges">
          <span class="badge badge-${item.type}">${typeLabel(item.type)}</span>
          <span class="badge badge-${item.status}">${item.status === 'watched' ? (item.type === 'book' ? 'Read' : 'Watched') : (item.type === 'book' ? 'To Read' : 'To Watch')}</span>
        </div>
        ${item.rating ? `<div class="star-rating">${stars(item.rating)}</div>` : ''}
      </div>
    </div>`;
}

function attachCardHandlers(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.media-card[data-id]').forEach(card => {
    card.addEventListener('click', () => openItemDetail(card.dataset.id));
  });
}

/* ---- ADD / EDIT ITEM MODAL ---- */
function openAddModal() {
  state.editingItem = null;
  state.selectedRating = 0;
  document.getElementById('item-modal-title').textContent = 'Add to Library';
  document.getElementById('item-form').reset();
  document.getElementById('poster-preview').innerHTML = `<span style="font-size:2rem">📷</span><span>Upload or paste URL</span>`;
  document.getElementById('rating-section').style.display = 'none';
  document.getElementById('review-section').style.display = 'none';
  document.getElementById('watched-date-section').style.display = 'none';
  updateStarInput(0);
  openModal('item-modal');
}

function openEditItem(id) {
  const item = state.library.find(i => i.id === id);
  if (!item) return;
  state.editingItem = id;
  state.selectedRating = item.rating || 0;
  document.getElementById('item-modal-title').textContent = 'Edit Item';
  document.getElementById('item-title').value = item.title;
  document.getElementById('item-type').value = item.type;
  document.getElementById('item-status').value = item.status;
  document.getElementById('item-genre').value = item.genre || '';
  document.getElementById('item-poster-url').value = item.posterUrl || '';
  document.getElementById('item-review').value = item.review || '';
  document.getElementById('item-watched-date').value = item.watchedDate || '';
  updatePosterPreview(item.posterUrl || '');
  handleStatusChange(item.status);
  updateStarInput(item.rating || 0);
  openModal('item-modal');
}

function handleStatusChange(val) {
  const show = val === 'watched';
  document.getElementById('rating-section').style.display = show ? 'block' : 'none';
  document.getElementById('review-section').style.display = show ? 'block' : 'none';
  document.getElementById('watched-date-section').style.display = show ? 'block' : 'none';
}

function updatePosterPreview(url) {
  const el = document.getElementById('poster-preview');
  if (url) {
    el.innerHTML = `<img src="${url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.remove()">`;
  } else {
    el.innerHTML = `<span style="font-size:2rem">📷</span><span>Upload or paste URL</span>`;
  }
}

function updateStarInput(val) {
  state.selectedRating = val;
  document.querySelectorAll('.star-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i < val);
  });
}

function saveItem() {
  const title = document.getElementById('item-title').value.trim();
  if (!title) { toast('Please enter a title', 'error'); return; }

  const type = document.getElementById('item-type').value;
  const status = document.getElementById('item-status').value;
  const genre = document.getElementById('item-genre').value.trim();
  const posterUrl = document.getElementById('item-poster-url').value.trim();
  const review = document.getElementById('item-review').value.trim();
  const watchedDate = document.getElementById('item-watched-date').value;
  const rating = state.selectedRating;

  if (state.editingItem) {
    const idx = state.library.findIndex(i => i.id === state.editingItem);
    if (idx > -1) {
      const old = state.library[idx];
      const wasWatched = old.status === 'watched';
      state.library[idx] = { ...old, title, type, status, genre, posterUrl, rating, review, watchedDate };
      if (!wasWatched && status === 'watched') {
        addTimelineEvent(`Finished <strong>${title}</strong> ${typeEmoji(type)}`, 'watched');
        if (rating) addTimelineEvent(`Rated <strong>${title}</strong> ${'★'.repeat(rating)}`, 'rated');
        if (review) addTimelineEvent(`Reviewed <strong>${title}</strong>`, 'reviewed');
      }
    }
    toast('Item updated ✓', 'success');
  } else {
    const item = { id: uid(), title, type, status, genre, posterUrl, rating, review, watchedDate, addedAt: new Date().toISOString() };
    state.library.unshift(item);
    addTimelineEvent(`Added <strong>${title}</strong> to ${status === 'watched' ? 'watched' : 'watchlist'} ${typeEmoji(type)}`, status === 'watched' ? 'watched' : 'added');
    if (rating) addTimelineEvent(`Rated <strong>${title}</strong> ${'★'.repeat(rating)}`, 'rated');
    toast('Added to library 🎬', 'success');
  }

  saveLibrary();
  closeModal('item-modal');
  renderPage(state.currentPage);
}

function deleteItem(id) {
  const item = state.library.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Remove "${item.title}" from library?`)) return;
  state.library = state.library.filter(i => i.id !== id);
  saveLibrary();
  toast('Removed from library', 'error');
  renderPage(state.currentPage);
}

/* ---- ITEM DETAIL MODAL ---- */
function openItemDetail(id) {
  const item = state.library.find(i => i.id === id);
  if (!item) return;

  const statusLabel = item.status === 'watched'
    ? (item.type === 'book' ? 'Read ✓' : 'Watched ✓')
    : (item.type === 'book' ? 'To Read' : 'To Watch');

  document.getElementById('detail-content').innerHTML = `
    ${item.posterUrl
      ? `<img src="${item.posterUrl}" class="detail-poster" onerror="this.style.display='none'">`
      : `<div class="detail-poster-placeholder">${typeEmoji(item.type)}</div>`}
    <div class="modal-title" style="margin-bottom:8px">${item.title}</div>
    <div class="badges" style="margin-bottom:16px">
      <span class="badge badge-${item.type}">${typeLabel(item.type)}</span>
      <span class="badge badge-${item.status}">${statusLabel}</span>
      ${item.genre ? `<span class="badge" style="background:var(--surface);color:var(--text-muted)">${item.genre}</span>` : ''}
    </div>
    ${item.rating ? `<div style="margin-bottom:12px"><div class="star-rating" style="gap:4px">${stars(item.rating, 5)}</div></div>` : ''}
    ${item.watchedDate ? `<div style="color:var(--text-muted);font-size:0.82rem;margin-bottom:12px">📅 ${formatDate(item.watchedDate)}</div>` : ''}
    ${item.review ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;font-size:0.88rem;line-height:1.6;color:var(--text-muted);margin-bottom:16px">"${item.review}"</div>` : ''}
    <div style="color:var(--text-dim);font-size:0.75rem">Added ${relativeTime(item.addedAt)}</div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-primary" style="flex:1" onclick="closeModal('detail-modal');openEditItem('${item.id}')">Edit</button>
      <button class="btn btn-secondary" onclick="addToCollection('${item.id}')">+ Collection</button>
    </div>
  `;

  openModal('detail-modal');
}

/* ---- COLLECTIONS ---- */
function renderCollections() {
  const container = document.getElementById('collections-grid');
  if (!container) return;

  if (!state.collections.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📚</div>
        <div class="empty-title">No collections yet</div>
        <div class="empty-sub">Create your first collection to organize your favorites</div>
        <button class="btn btn-primary" onclick="openAddCollection()">Create Collection</button>
      </div>`;
    return;
  }

  container.innerHTML = state.collections.map(col => {
    const count = (col.items || []).length;
    return `
      <div class="collection-card" onclick="openCollectionDetail('${col.id}')">
        <div class="collection-cover" style="background:${col.gradient || 'linear-gradient(135deg,#7c3aed,#ec4899)'}">
          ${col.coverUrl ? `<img src="${col.coverUrl}" onerror="this.remove()">` : `<span>${col.emoji || '✨'}</span>`}
          <div class="collection-cover-overlay"></div>
        </div>
        <div class="collection-info">
          <div class="collection-name">${col.name}</div>
          <div class="collection-meta">${count} item${count !== 1 ? 's' : ''}${col.description ? ' · ' + col.description : ''}</div>
        </div>
      </div>`;
  }).join('');
}

function openAddCollection() {
  state.editingCollection = null;
  document.getElementById('col-name').value = '';
  document.getElementById('col-desc').value = '';
  document.getElementById('col-cover-url').value = '';
  document.getElementById('col-emoji').value = '✨';
  openModal('collection-modal');
}

function saveCollection() {
  const name = document.getElementById('col-name').value.trim();
  if (!name) { toast('Please enter a collection name', 'error'); return; }

  const col = {
    id: state.editingCollection || uid(),
    name,
    description: document.getElementById('col-desc').value.trim(),
    coverUrl: document.getElementById('col-cover-url').value.trim(),
    emoji: document.getElementById('col-emoji').value.trim() || '✨',
    gradient: randomGradient(),
    items: state.editingCollection
      ? (state.collections.find(c => c.id === state.editingCollection)?.items || [])
      : [],
    createdAt: new Date().toISOString(),
  };

  if (state.editingCollection) {
    const idx = state.collections.findIndex(c => c.id === state.editingCollection);
    if (idx > -1) state.collections[idx] = { ...state.collections[idx], ...col };
    toast('Collection updated', 'success');
  } else {
    state.collections.unshift(col);
    addTimelineEvent(`Created collection <strong>${name}</strong> ✨`, 'added');
    toast('Collection created 🎉', 'success');
  }

  saveCollections();
  closeModal('collection-modal');
  renderCollections();
}

function randomGradient() {
  const opts = [
    'linear-gradient(135deg,#7c3aed,#ec4899)',
    'linear-gradient(135deg,#14b8a6,#7c3aed)',
    'linear-gradient(135deg,#f59e0b,#ec4899)',
    'linear-gradient(135deg,#3b82f6,#7c3aed)',
    'linear-gradient(135deg,#10b981,#14b8a6)',
    'linear-gradient(135deg,#f43f5e,#f59e0b)',
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function openCollectionDetail(id) {
  const col = state.collections.find(c => c.id === id);
  if (!col) return;
  const items = (col.items || []).map(iid => state.library.find(i => i.id === iid)).filter(Boolean);

  document.getElementById('col-detail-title').textContent = col.name;
  document.getElementById('col-detail-content').innerHTML = `
    <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px">${col.description || ''}</div>
    ${items.length ? `
      <div class="collection-items-grid">
        ${items.map(item => `
          <div class="media-card" style="cursor:pointer" onclick="closeModal('col-detail-modal');openItemDetail('${item.id}')">
            ${posterImg(item)}
            <div class="media-info"><div class="media-title">${item.title}</div></div>
          </div>`).join('')}
      </div>
    ` : `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No items yet</div><div class="empty-sub">Add items from your library</div></div>`}
    <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
      <button class="btn btn-secondary" onclick="addItemToCollection('${col.id}')">+ Add Items</button>
      <button class="btn btn-secondary" onclick="editCollection('${col.id}')">Edit</button>
      <button class="btn btn-ghost" style="color:#ef4444" onclick="deleteCollection('${col.id}')">Delete</button>
    </div>
  `;
  openModal('col-detail-modal');
}

function addItemToCollection(colId) {
  const col = state.collections.find(c => c.id === colId);
  if (!col) return;
  const available = state.library.filter(i => !(col.items || []).includes(i.id));
  if (!available.length) { toast('No items to add', 'error'); return; }

  closeModal('col-detail-modal');
  const picker = document.getElementById('item-picker-modal');
  document.getElementById('item-picker-list').innerHTML = available.map(item => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.2s"
         onmouseenter="this.style.borderColor='var(--purple)'"
         onmouseleave="this.style.borderColor='var(--border)'"
         onclick="pickItemForCollection('${colId}','${item.id}')">
      <span style="font-size:1.3rem">${typeEmoji(item.type)}</span>
      <div>
        <div style="font-weight:600;font-size:0.9rem">${item.title}</div>
        <div style="color:var(--text-muted);font-size:0.75rem">${typeLabel(item.type)}</div>
      </div>
    </div>
  `).join('');
  openModal('item-picker-modal');
}

function pickItemForCollection(colId, itemId) {
  const col = state.collections.find(c => c.id === colId);
  if (!col) return;
  if (!col.items) col.items = [];
  col.items.push(itemId);
  saveCollections();
  closeModal('item-picker-modal');
  toast('Added to collection ✓', 'success');
  renderCollections();
}

function addToCollection(itemId) {
  closeModal('detail-modal');
  if (!state.collections.length) { toast('Create a collection first', 'error'); return; }
  const picker = document.getElementById('item-picker-modal');
  document.getElementById('item-picker-list').innerHTML = `
    <div style="margin-bottom:8px;color:var(--text-muted);font-size:0.85rem">Select a collection:</div>
    ${state.collections.map(col => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.2s;margin-bottom:8px"
           onmouseenter="this.style.borderColor='var(--purple)'"
           onmouseleave="this.style.borderColor='var(--border)'"
           onclick="pickItemForCollection('${col.id}','${itemId}')">
        <span style="font-size:1.3rem">${col.emoji || '✨'}</span>
        <div>
          <div style="font-weight:600;font-size:0.9rem">${col.name}</div>
          <div style="color:var(--text-muted);font-size:0.75rem">${(col.items||[]).length} items</div>
        </div>
      </div>
    `).join('')}
  `;
  openModal('item-picker-modal');
}

function editCollection(id) {
  const col = state.collections.find(c => c.id === id);
  if (!col) return;
  state.editingCollection = id;
  document.getElementById('col-name').value = col.name;
  document.getElementById('col-desc').value = col.description || '';
  document.getElementById('col-cover-url').value = col.coverUrl || '';
  document.getElementById('col-emoji').value = col.emoji || '✨';
  closeModal('col-detail-modal');
  openModal('collection-modal');
}

function deleteCollection(id) {
  if (!confirm('Delete this collection?')) return;
  state.collections = state.collections.filter(c => c.id !== id);
  saveCollections();
  closeModal('col-detail-modal');
  toast('Collection deleted', 'error');
  renderCollections();
}

/* ---- TIMELINE ---- */
function renderTimeline() {
  const container = document.getElementById('timeline-feed');
  if (!container) return;

  if (!state.timeline.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-title">No activity yet</div>
        <div class="empty-sub">Your timeline will update as you use StorySync</div>
      </div>`;
    return;
  }

  const iconMap = {
    added: { bg: 'rgba(124,58,237,0.2)', icon: '➕' },
    watched: { bg: 'rgba(20,184,166,0.2)', icon: '✅' },
    rated: { bg: 'rgba(245,158,11,0.2)', icon: '⭐' },
    reviewed: { bg: 'rgba(236,72,153,0.2)', icon: '✍️' },
  };

  container.innerHTML = state.timeline.map((ev, i) => {
    const info = iconMap[ev.iconClass] || iconMap.added;
    return `
      <div class="timeline-item" style="animation-delay:${i * 0.04}s">
        <div class="timeline-icon ${ev.iconClass}" style="background:${info.bg}">${info.icon}</div>
        <div class="timeline-content">
          <div class="timeline-text">${ev.text}</div>
          <div class="timeline-date">${relativeTime(ev.date)}</div>
        </div>
      </div>`;
  }).join('');
}

/* ---- WRAPPED PAGE ---- */
function renderWrapped() {
  const mode = state.wrappedMode;
  const now = Date.now();
  const watched = state.library.filter(i => {
    if (i.status !== 'watched') return false;
    const d = new Date(i.watchedDate || i.addedAt).getTime();
    return mode === 'weekly' ? (now - d < 7 * 86400000) : (now - d < 30 * 86400000);
  });

  const container = document.getElementById('wrapped-content');
  if (!container) return;

  if (!watched.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-title">No data for this period</div>
        <div class="empty-sub">Mark items as watched/read to generate your ${mode} wrapped</div>
        <button class="btn btn-primary" onclick="navigate('library')">Go to Library</button>
      </div>`;
    return;
  }

  const avgRating = watched.filter(i => i.rating).reduce((sum, i, _, arr) => sum + i.rating / arr.length, 0);
  const topRated = [...watched].filter(i => i.rating).sort((a, b) => b.rating - a.rating)[0];
  const favGenre = getFavoriteGenre(watched) || '—';
  const estHours = watched.reduce((sum, i) => sum + (i.type === 'movie' ? 2 : i.type === 'series' ? 8 : 5), 0);
  const movies = watched.filter(i => i.type === 'movie').length;
  const series = watched.filter(i => i.type === 'series').length;
  const books = watched.filter(i => i.type === 'book').length;

  const top5 = [...watched].filter(i => i.rating).sort((a, b) => b.rating - a.rating).slice(0, 5);

  if (mode === 'weekly') {
    container.innerHTML = `
      <div class="wrapped-grid">
        <div class="wrapped-card purple">
          <div class="wrapped-label">Items This Week</div>
          <div class="wrapped-value purple">${watched.length}</div>
          <div class="wrapped-sub">${movies} movies · ${series} series · ${books} books</div>
        </div>
        <div class="wrapped-card pink">
          <div class="wrapped-label">Favorite Genre</div>
          <div class="wrapped-value pink" style="font-size:1.5rem">${favGenre}</div>
          <div class="wrapped-sub">Your top pick this week</div>
        </div>
        <div class="wrapped-card teal">
          <div class="wrapped-label">Time Invested</div>
          <div class="wrapped-value teal">${estHours}h</div>
          <div class="wrapped-sub">Estimated watch/read time</div>
        </div>
        <div class="wrapped-card amber">
          <div class="wrapped-label">Avg. Rating</div>
          <div class="wrapped-value amber">${avgRating ? avgRating.toFixed(1) + '★' : '—'}</div>
          <div class="wrapped-sub">${topRated ? 'Top: ' + topRated.title : 'Rate your items'}</div>
        </div>
        ${top5.length ? `
        <div class="wrapped-card wrapped-full" style="grid-column:1/-1">
          <div class="wrapped-label">Your Top Picks</div>
          <div class="top5-list">
            ${top5.map((item, i) => `
              <div class="top5-item">
                <div class="top5-rank ${i === 0 ? 'gold' : ''}">${i + 1}</div>
                <div>${typeEmoji(item.type)}</div>
                <div class="top5-item-title">${item.title}</div>
                <div class="top5-item-rating">${'★'.repeat(item.rating || 0)}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div style="margin-top:20px">
        <button class="btn btn-secondary" onclick="exportWrapped()">📤 Export as Image</button>
      </div>`;
  } else {
    // Monthly
    const byWeek = [0, 0, 0, 4].map((_, wk) => watched.filter(i => {
      const d = new Date(i.watchedDate || i.addedAt);
      const weekOfMonth = Math.floor(d.getDate() / 7);
      return weekOfMonth === wk;
    }).length);
    const mostActiveWeek = byWeek.indexOf(Math.max(...byWeek)) + 1;

    container.innerHTML = `
      <div class="wrapped-grid">
        <div class="wrapped-card purple">
          <div class="wrapped-label">Items This Month</div>
          <div class="wrapped-value purple">${watched.length}</div>
          <div class="wrapped-sub">${movies} movies · ${series} series · ${books} books</div>
        </div>
        <div class="wrapped-card amber">
          <div class="wrapped-label">Average Rating</div>
          <div class="wrapped-value amber">${avgRating ? avgRating.toFixed(1) + '★' : '—'}</div>
          <div class="wrapped-sub">Across ${watched.filter(i => i.rating).length} rated items</div>
        </div>
        <div class="wrapped-card pink">
          <div class="wrapped-label">Fav Category</div>
          <div class="wrapped-value pink" style="font-size:1.5rem">${favGenre}</div>
          <div class="wrapped-sub">Your monthly obsession</div>
        </div>
        <div class="wrapped-card teal">
          <div class="wrapped-label">Hours Consumed</div>
          <div class="wrapped-value teal">${estHours}h</div>
          <div class="wrapped-sub">Most active: Week ${mostActiveWeek}</div>
        </div>
        ${top5.length ? `
        <div class="wrapped-card wrapped-full" style="grid-column:1/-1">
          <div class="wrapped-label">Monthly Top 5</div>
          <div class="top5-list">
            ${top5.map((item, i) => `
              <div class="top5-item">
                <div class="top5-rank ${i === 0 ? 'gold' : ''}">${i + 1}</div>
                <div>${typeEmoji(item.type)}</div>
                <div class="top5-item-title">${item.title}</div>
                <div class="top5-item-rating">${'★'.repeat(item.rating || 0)}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div style="margin-top:20px">
        <button class="btn btn-secondary" onclick="exportWrapped()">📤 Export as Image</button>
      </div>`;
  }
}

/* ---- PROFILE PAGE ---- */
function renderProfile() {
  const p = state.profile;
  const watched = state.library.filter(i => i.status === 'watched');
  const rated = watched.filter(i => i.rating);
  const avgRating = rated.length ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1) : '—';
  const favGenre = getFavoriteGenre(watched) || '—';

  document.getElementById('profile-content').innerHTML = `
    <div class="profile-hero" id="profile-card">
      <div class="avatar-wrapper">
        <div class="avatar" id="profile-avatar">
          ${p.avatar ? `<img src="${p.avatar}" alt="Avatar">` : '👤'}
        </div>
        <div class="avatar-edit" onclick="editAvatarPrompt()">✏️</div>
      </div>
      <div class="profile-info">
        <div class="profile-username">${p.username}</div>
        <div class="profile-bio">${p.bio}</div>
        <div class="profile-stats">
          <div class="profile-stat">
            <div class="profile-stat-num">${state.library.length}</div>
            <div class="profile-stat-label">Library</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${watched.length}</div>
            <div class="profile-stat-label">Watched</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${state.collections.length}</div>
            <div class="profile-stat-label">Collections</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-num">${avgRating}${avgRating !== '—' ? '★' : ''}</div>
            <div class="profile-stat-label">Avg. Rating</div>
          </div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-primary" onclick="openEditProfile()">✏️ Edit Profile</button>
          <button class="btn btn-secondary" onclick="shareProfile()">📤 Share Profile</button>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:32px">
      <div class="card" style="padding:24px">
        <div class="section-title" style="font-size:1rem;margin-bottom:16px">Favorite Genres</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${(p.favoriteGenres || []).map(g => `<span class="genre-tag active">${g}</span>`).join('')}
          ${!(p.favoriteGenres||[]).length ? '<span style="color:var(--text-dim);font-size:0.85rem">Edit profile to add genres</span>' : ''}
        </div>
      </div>
      <div class="card" style="padding:24px">
        <div class="section-title" style="font-size:1rem;margin-bottom:16px">Stats at a Glance</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;font-size:0.85rem">
            <span style="color:var(--text-muted)">Movies watched</span>
            <span style="font-weight:600">${watched.filter(i=>i.type==='movie').length}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem">
            <span style="color:var(--text-muted)">Series finished</span>
            <span style="font-weight:600">${watched.filter(i=>i.type==='series').length}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem">
            <span style="color:var(--text-muted)">Books read</span>
            <span style="font-weight:600">${watched.filter(i=>i.type==='book').length}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem">
            <span style="color:var(--text-muted)">Favorite genre</span>
            <span style="font-weight:600">${favGenre}</span>
          </div>
        </div>
      </div>
    </div>

    ${watched.filter(i => i.rating >= 5).length ? `
    <div class="section">
      <div class="section-header">
        <div class="section-title">Perfect 5-Star Picks ⭐</div>
      </div>
      <div class="scroll-row">
        ${watched.filter(i => i.rating >= 5).map(item => mediaCardHTML(item, true)).join('')}
      </div>
    </div>` : ''}
  `;

  attachCardHandlers('profile-content');
}

function editAvatarPrompt() {
  const url = prompt('Paste image URL for avatar (or leave blank to clear):');
  if (url !== null) {
    state.profile.avatar = url.trim();
    saveProfile();
    renderProfile();
  }
}

function openEditProfile() {
  document.getElementById('edit-username').value = state.profile.username;
  document.getElementById('edit-bio').value = state.profile.bio;
  document.getElementById('edit-genres').value = (state.profile.favoriteGenres || []).join(', ');
  openModal('edit-profile-modal');
}

function saveProfileEdit() {
  state.profile.username = document.getElementById('edit-username').value.trim() || 'CinePhile';
  state.profile.bio = document.getElementById('edit-bio').value.trim();
  state.profile.favoriteGenres = document.getElementById('edit-genres').value
    .split(',').map(g => g.trim()).filter(Boolean);
  saveProfile();
  closeModal('edit-profile-modal');
  renderProfile();
  toast('Profile updated ✓', 'success');
}

/* ---- EXPORT / SHARE ---- */
async function shareProfile() {
  const el = document.getElementById('profile-card');
  if (!el) return;

  if (typeof html2canvas === 'undefined') {
    toast('Loading export tool...', '');
    await loadHtml2Canvas();
  }

  toast('Generating image...', '');
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#0a0a0f',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = 'storysync-profile.png';
    link.href = canvas.toDataURL();
    link.click();
    toast('Profile exported! 📸', 'success');
  } catch (e) {
    toast('Export failed. Try again.', 'error');
  }
}

async function exportWrapped() {
  const el = document.getElementById('wrapped-content');
  if (!el) return;
  if (typeof html2canvas === 'undefined') await loadHtml2Canvas();
  toast('Generating wrapped image...', '');
  try {
    const canvas = await html2canvas(el, { backgroundColor: '#080810', scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = `storysync-${state.wrappedMode}-wrapped.png`;
    link.href = canvas.toDataURL();
    link.click();
    toast('Wrapped exported! 🎵', 'success');
  } catch {
    toast('Export failed', 'error');
  }
}

function loadHtml2Canvas() {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

/* ---- MODAL HELPERS ---- */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

/* ---- POSTER UPLOAD ---- */
function handlePosterUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('item-poster-url').value = e.target.result;
    updatePosterPreview(e.target.result);
  };
  reader.readAsDataURL(file);
}

/* ---- INIT ---- */
function init() {
  // Register SW
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');

  // Install button handler
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        toast('Ouvre ce site dans Chrome/Edge pour installer l\'app 📱', '');
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') { deferredPrompt = null; installBtn.classList.add('hidden'); }
    });
  }

  // Nav links
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Modal close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Status change handler
  const statusSel = document.getElementById('item-status');
  if (statusSel) statusSel.addEventListener('change', (e) => handleStatusChange(e.target.value));

  // Poster URL live preview
  const posterUrl = document.getElementById('item-poster-url');
  if (posterUrl) posterUrl.addEventListener('input', (e) => updatePosterPreview(e.target.value));

  // File upload
  const posterUpload = document.getElementById('poster-upload');
  if (posterUpload) posterUpload.addEventListener('change', (e) => handlePosterUpload(e.target.files[0]));

  // Poster click = file upload
  const posterPreview = document.getElementById('poster-preview');
  if (posterPreview) posterPreview.addEventListener('click', () => document.getElementById('poster-upload').click());

  // Star input
  document.querySelectorAll('.star-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => updateStarInput(i + 1));
    btn.addEventListener('mouseenter', () => {
      document.querySelectorAll('.star-btn').forEach((b, j) => b.classList.toggle('active', j <= i));
    });
  });
  const starInput = document.querySelector('.star-input');
  if (starInput) {
    starInput.addEventListener('mouseleave', () => updateStarInput(state.selectedRating));
  }

  // Search
  const searchInput = document.getElementById('library-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderLibrary();
    });
  }

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filterMode = tab.dataset.filter;
      renderLibrary();
    });
  });

  // Wrapped toggle
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.wrappedMode = btn.dataset.mode;
      renderWrapped();
    });
  });

  // Keyboard: ESC closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
    }
  });

  // Initial render
  navigate('home');
}

document.addEventListener('DOMContentLoaded', init);
