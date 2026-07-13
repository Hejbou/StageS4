/* ════════════════════════════════════════════
   admin.js — Admin Dashboard Logic
   ════════════════════════════════════════════ */

(function () {

  // ── Auth guard ──────────────────────────────────────────────────
  if (!Auth.requireAdmin()) return;
  const me = Auth.getUser();

  // ── DOM refs ────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function $$(sel) { return document.querySelectorAll(sel); }

  // ── Section navigation ──────────────────────────────────────────
  function showSection(id) {
    $$('.section').forEach(s => s.classList.remove('active'));
    $$('.nav-link').forEach(n => n.classList.remove('active'));
    const sec = $('section-' + id);
    // La page dédiée "Ajouter/Modifier un lieu" n'a pas son propre lien de
    // navigation : elle garde la section parente active dans la sidebar.
    const navId = id === 'place-form' ? 'places' : id;
    const lnk = $('nav-' + navId);
    if (sec) sec.classList.add('active');
    if (lnk) lnk.classList.add('active');
    document.title = 'ChatIA Admin — ' + (id === 'place-form' ? 'Base des lieux' : id.charAt(0).toUpperCase() + id.slice(1));
    if (id === 'dashboard')  renderDashboard();
    if (id === 'users')      renderUsers();   // async, fire-and-forget
    if (id === 'requests')   renderRequests();
    if (id === 'settings')   renderSettings();
    if (id === 'places')     renderPlaces();    // async, fire-and-forget
    if (id === 'geo')        renderGeo();        // async, fire-and-forget
  }

  window.goSection = showSection;

  // ── Toast ───────────────────────────────────────────────────────
  function toast(msg, type) {
    var t = $('admin-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'admin-toast ' + (type || '') + ' show';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 3000);
  }

  // ── Format timestamp ────────────────────────────────────────────
  function fmt(ts) {
    return ts ? new Date(ts).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  }
  function fmtDate(ts) {
    return ts ? new Date(ts).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  }

  // ── Get all requests from Transport localStorage ─────────────────
  // Même clé que MockData.getRequests()/saveRequests() (mock-data.js) —
  // c'est là que transport.js persiste réellement les courses.
  function getRequests() {
    try {
      return JSON.parse(localStorage.getItem('chatia_requests') || '[]');
    } catch (_) { return []; }
  }

  // ── DASHBOARD ───────────────────────────────────────────────────
  function renderDashboard() {
    const users    = Auth.getAllUsers();
    const requests = getRequests();
    const pending  = requests.filter(r => r.status === 'pending').length;
    const accepted = requests.filter(r => r.status === 'accepted').length;

    $('stat-users').textContent    = users.length;
    $('stat-requests').textContent = requests.length;
    $('stat-pending').textContent  = pending;
    $('stat-accepted').textContent = accepted;

    // Recent requests table
    const tbody = $('recent-requests-body');
    if (!tbody) return;
    const recent = requests.slice(-6).reverse();
    if (recent.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Aucune course pour l\'instant</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(r => `
      <tr>
        <td><code style="font-size:11px;color:var(--p-dark)">${r.id}</code></td>
        <td>${r.origin || '—'}</td>
        <td>${r.destination || '—'}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td style="font-size:12px;color:var(--text3)">${fmtDate(r.createdAt)}</td>
      </tr>`).join('');
  }

  // ── USERS ───────────────────────────────────────────────────────
  let _userSearch = '';
  let _allUsers   = [];

  async function fetchUsers() {
    // Try backend API
    try {
      const resp = await Auth.authFetch('/api/admin/users');
      if (resp.ok) {
        const data = await resp.json();
        _allUsers = (data.data || []).map(u => ({
          id:        u.phone,
          phone:     u.phone,
          name:      u.name,
          role:      u.role,
          isActive:  u.is_active !== false,
          createdAt: u.created_at ? new Date(u.created_at).getTime() : null,
        }));
        return;
      }
    } catch (_) {}
    // localStorage fallback
    _allUsers = Auth.getAllUsers().map(u => ({ ...u, isActive: u.isActive !== false }));
  }

  async function renderUsers() {
    await fetchUsers();
    const query = _userSearch.toLowerCase();
    const users = query
      ? _allUsers.filter(u => (u.phone||'').includes(query) || (u.name||'').toLowerCase().includes(query))
      : _allUsers;

    const tbody = $('users-body');
    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Aucun utilisateur trouvé</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isMe    = u.phone === me.phone;
      const isAdmin = u.role === 'admin';
      const blocked = !u.isActive;
      return `
      <tr class="${blocked ? 'row-blocked' : ''}">
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:${blocked ? 'linear-gradient(135deg,#6B7280,#9CA3AF)' : 'linear-gradient(135deg,#3730A3,#6C63FF)'};display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:800;flex-shrink:0">
              ${(u.name||'?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight:700;color:var(--text)">${u.name || '—'}</div>
              <div style="font-size:11px;color:var(--text3)">+222 ${u.phone || '—'}</div>
            </div>
          </div>
        </td>
        <td><span class="badge ${u.role}">${isAdmin ? 'Admin' : 'Utilisateur'}</span></td>
        <td>
          <span class="badge ${blocked ? 'refused' : 'accepted'}" style="font-size:11px">
            ${blocked ? '🔒 Bloqué' : '✓ Actif'}
          </span>
        </td>
        <td style="font-size:12px;color:var(--text3)">${fmtDate(u.createdAt)}</td>
        <td>
          <div class="action-btns">
            ${!isMe && !isAdmin ? `
              <button class="icon-btn-sm ${blocked ? 'success' : 'warning'}" onclick="toggleBlock('${u.phone}', ${blocked})" title="${blocked ? 'Débloquer' : 'Bloquer'}">
                ${blocked
                  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
                  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'}
              </button>
              <button class="icon-btn-sm danger" onclick="deleteUser('${u.phone}')" title="Supprimer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            ` : `<span style="font-size:11px;color:var(--text4)">${isMe ? 'Vous' : 'Protégé'}</span>`}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Custom confirm dialog ───────────────────────────────────────
  var _confirmCallback = null;

  function adminConfirm(icon, title, msg, okLabel, okClass, cb) {
    $('admin-confirm-icon').textContent  = icon;
    $('admin-confirm-title').textContent = title;
    $('admin-confirm-msg').textContent   = msg;
    var okBtn = $('admin-confirm-ok');
    okBtn.textContent = okLabel;
    okBtn.className   = 'admin-confirm-ok' + (okClass ? ' ' + okClass : '');
    _confirmCallback  = cb;
    $('admin-confirm-overlay').classList.remove('hidden');
  }

  window.adminConfirmCancel = function () {
    $('admin-confirm-overlay').classList.add('hidden');
    _confirmCallback = null;
  };

  $('admin-confirm-ok').addEventListener('click', function () {
    $('admin-confirm-overlay').classList.add('hidden');
    if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
  });

  window.toggleBlock = function (phone, currentlyBlocked) {
    if (currentlyBlocked) {
      adminConfirm('🔓', 'Débloquer l\'utilisateur',
        'Cet utilisateur pourra à nouveau se connecter à la plateforme.',
        'Débloquer', 'warning-btn',
        async () => {
          try {
            const resp = await Auth.authFetch(`/api/admin/users/${phone}/toggle`, { method: 'PUT' });
            if (resp.ok) { toast('Utilisateur débloqué.', 'success'); renderUsers(); return; }
          } catch (_) {}
          const users = JSON.parse(localStorage.getItem('chatia_users') || '[]');
          const u = users.find(x => x.phone === phone);
          if (u) { u.isActive = true; localStorage.setItem('chatia_users', JSON.stringify(users)); }
          toast('Utilisateur débloqué (local).', 'success');
          renderUsers();
        });
    } else {
      adminConfirm('🔒', 'Bloquer l\'utilisateur',
        'Cet utilisateur ne pourra plus se connecter. Il verra un message de blocage lors de la connexion.',
        'Bloquer', '',
        async () => {
          try {
            const resp = await Auth.authFetch(`/api/admin/users/${phone}/toggle`, { method: 'PUT' });
            if (resp.ok) { toast('Utilisateur bloqué.', 'success'); renderUsers(); return; }
          } catch (_) {}
          const users = JSON.parse(localStorage.getItem('chatia_users') || '[]');
          const u = users.find(x => x.phone === phone);
          if (u) { u.isActive = false; localStorage.setItem('chatia_users', JSON.stringify(users)); }
          toast('Utilisateur bloqué (local).', 'success');
          renderUsers();
        });
    }
  };

  window.deleteUser = function (phone) {
    adminConfirm('🗑️', 'Supprimer l\'utilisateur',
      'Cette action est irréversible. Toutes les données de cet utilisateur seront supprimées.',
      'Supprimer', '',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/users/${phone}`, { method: 'DELETE' });
          if (resp.ok) { toast('Utilisateur supprimé.', 'success'); renderUsers(); renderDashboard(); return; }
        } catch (_) {}
        const ok2 = Auth.deleteUser(phone);
        if (ok2) { toast('Utilisateur supprimé.', 'success'); renderUsers(); renderDashboard(); }
        else       toast('Impossible de supprimer.', 'danger');
      });
  };

  // ── REQUESTS ────────────────────────────────────────────────────
  let _reqSearch  = '';
  let _reqFilter  = 'all';

  function renderRequests() {
    const all = getRequests();
    const query = _reqSearch.toLowerCase();
    let filtered = all;
    if (_reqFilter !== 'all') filtered = filtered.filter(r => r.status === _reqFilter);
    if (query) filtered = filtered.filter(r =>
      (r.id || '').toLowerCase().includes(query) ||
      (r.origin || '').toLowerCase().includes(query) ||
      (r.destination || '').toLowerCase().includes(query) ||
      (r.phone || '').includes(query)
    );
    filtered = filtered.slice().reverse();

    const tbody = $('requests-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Aucune course trouvée</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td><code style="font-size:11px;color:var(--p-dark)">${r.id}</code></td>
        <td>${r.origin || '—'}</td>
        <td>${r.destination || '—'}</td>
        <td style="font-family:monospace;font-size:12px">${r.phone ? '+222 ' + r.phone : '—'}</td>
        <td><span class="badge ${r.status}">${_statusLabel(r.status)}</span></td>
        <td style="font-size:12px;color:var(--text3)">${fmtDate(r.createdAt)}</td>
        <td><button class="btn-sm primary" onclick="showCourseDetail('${r.id}')" style="font-size:11px;padding:5px 10px">Détails</button></td>
      </tr>`).join('');
  }

  function _statusLabel(s) {
    return { pending:'En attente', accepted:'Acceptée', refused:'Refusée', cancelled:'Annulée' }[s] || s;
  }

  window.filterRequests = function (filter) {
    _reqFilter = filter;
    $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    renderRequests();
  };

  // ── COURSE DETAIL PANEL ─────────────────────────────────────────
  window.showCourseDetail = function (id) {
    const requests = getRequests();
    const r = requests.find(x => x.id === id);
    if (!r) return;

    const statusColors = { pending:'#F59E0B', accepted:'#10B981', refused:'#EF4444', cancelled:'#6B7280' };
    const sc = statusColors[r.status] || '#6B7280';
    const price = r.estimatedPrice || r.price || '—';
    const distance = (r.geoData && r.geoData.distance_text) || (r.distance ? r.distance + ' km' : '—');
    const duration = (r.geoData && r.geoData.duration_text) || (r.duration ? r.duration + ' min' : '—');

    $('course-detail-body').innerHTML = `
      <div class="detail-route-card">
        <div class="detail-route-row">
          <div class="detail-route-dot origin"></div>
          <div>
            <div class="detail-route-lbl">Départ</div>
            <div class="detail-route-val">${r.origin || '—'}</div>
          </div>
        </div>
        <div class="detail-route-line"></div>
        <div class="detail-route-row">
          <div class="detail-route-dot dest"></div>
          <div>
            <div class="detail-route-lbl">Arrivée</div>
            <div class="detail-route-val">${r.destination || '—'}</div>
          </div>
        </div>
      </div>

      <div class="detail-info-grid">
        <div class="detail-info-item">
          <div class="detail-info-label">Statut</div>
          <span class="badge ${r.status}" style="font-size:12px">${_statusLabel(r.status)}</span>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Client</div>
          <div class="detail-info-val">${r.phone ? '+222 ' + r.phone : '—'}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Prix estimé</div>
          <div class="detail-info-val" style="color:var(--p);font-weight:800">${price}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Distance</div>
          <div class="detail-info-val">${distance}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Durée</div>
          <div class="detail-info-val">${duration}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">ID</div>
          <div class="detail-info-val" style="font-family:monospace;font-size:11px">${r.id}</div>
        </div>
        <div class="detail-info-item" style="grid-column:1/-1">
          <div class="detail-info-label">Date de création</div>
          <div class="detail-info-val">${fmt(r.createdAt)}</div>
        </div>
      </div>

      <div class="detail-actions-section">
        <div class="detail-actions-title">Changer le statut</div>
        <div class="detail-action-btns">
          <button class="det-status-btn accepted ${r.status==='accepted'?'active':''}" onclick="updateCourseStatus('${r.id}','accepted')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Accepter
          </button>
          <button class="det-status-btn pending ${r.status==='pending'?'active':''}" onclick="updateCourseStatus('${r.id}','pending')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            En attente
          </button>
          <button class="det-status-btn cancelled ${r.status==='cancelled'?'active':''}" onclick="updateCourseStatus('${r.id}','cancelled')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            Annuler
          </button>
        </div>
      </div>
    `;

    $('course-detail-overlay').classList.remove('hidden');
    setTimeout(() => $('course-detail-panel').classList.add('visible'), 10);
  };

  window.closeCourseDetail = function () {
    $('course-detail-panel').classList.remove('visible');
    setTimeout(() => $('course-detail-overlay').classList.add('hidden'), 260);
  };

  window.updateCourseStatus = function (id, newStatus) {
    const requests = getRequests();
    const idx = requests.findIndex(x => x.id === id);
    if (idx === -1) return;
    requests[idx].status = newStatus;
    localStorage.setItem('chatia_requests', JSON.stringify(requests));
    toast('Statut mis à jour : ' + _statusLabel(newStatus), 'success');
    renderRequests();
    renderDashboard();
    showCourseDetail(id);
  };

  // ── BASE DES LIEUX (Ville -> Wilaya -> Moughataa -> Lieu) ──────────
  // Seule gestion de lieux de l'espace admin (l'ancienne page "Lieux",
  // liée à la table historique `locations`, a été retirée). `locations`
  // elle-même reste intacte côté backend : le chat, le calcul du prix et
  // la carte continuent de la lire exactement comme avant.
  const _PLACE_TYPE_LABELS = {
    quartier: 'Quartier', marche: 'Marché', hopital: 'Hôpital', clinique: 'Clinique',
    mosquee: 'Mosquée', ecole: 'École', universite: 'Université', carrefour: 'Carrefour',
    station: 'Station', admin: 'Administration', hotel: 'Hôtel', autre: 'Autre',
  };

  const _NKC_CENTER = [18.0735, -15.9582];

  // Recherche d'adresse sur la carte du formulaire (Nominatim, gratuit).
  async function _searchLocationOnMap(query) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Nouakchott, Mauritanie')}&format=json&limit=5&countrycodes=mr&accept-language=fr`,
        { headers: { 'Accept-Language': 'fr' } }
      );
      if (!r.ok) return [];
      return await r.json();
    } catch (_) { return []; }
  }

  function _escLoc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  let _placeSearch    = '';
  let _allPlaces      = [];
  let _wilayasGeo     = [];  // [{id, name, moughataas:[{id,name}, ...]}, ...]
  let _placeHaNames   = [];
  let _placeMap       = null;
  let _placeMarker    = null;
  let _placeDetected  = null; // dernier résultat de /geo/detect (ou null)

  async function _fetchWilayasGeo(force) {
    if (_wilayasGeo.length && !force) return _wilayasGeo;
    try {
      const resp = await Auth.authFetch('/api/admin/geo/wilayas');
      if (resp.ok) {
        const data = await resp.json();
        _wilayasGeo = data.data || [];
      }
    } catch (_) {}
    return _wilayasGeo;
  }

  async function fetchPlaces() {
    try {
      const resp = await Auth.authFetch('/api/admin/lieux');
      if (resp.ok) {
        const data = await resp.json();
        _allPlaces = data.data || [];
        return;
      }
    } catch (_) {}
    _allPlaces = [];
  }

  async function renderPlaces() {
    await fetchPlaces();
    const query = _placeSearch.toLowerCase();
    const places = query
      ? _allPlaces.filter(p =>
          (p.nameFr || '').toLowerCase().includes(query) ||
          (p.nameAr || '').includes(query) ||
          (p.wilayaName || '').toLowerCase().includes(query) ||
          (p.moughataaName || '').toLowerCase().includes(query))
      : _allPlaces;

    const tbody = $('places-body');
    if (!tbody) return;

    if (places.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Aucun lieu trouvé. Ajoutez-en un avec le bouton ci-dessus.</td></tr>';
      return;
    }

    tbody.innerHTML = places.map(p => {
      const disabled = !p.is_active;
      return `
      <tr class="${disabled ? 'row-blocked' : ''}">
        <td>
          <div style="font-weight:700;color:var(--text)">${p.nameFr || '—'}</div>
          <div style="font-size:11px;color:var(--text3)" dir="rtl">${p.nameAr || ''}</div>
        </td>
        <td><span class="badge">${_PLACE_TYPE_LABELS[p.type] || p.type}</span></td>
        <td>${p.wilayaName || '—'}</td>
        <td>${p.moughataaName || '—'}</td>
        <td style="font-family:monospace;font-size:11.5px;color:var(--text3)">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</td>
        <td>
          <span class="badge ${disabled ? 'refused' : 'accepted'}" style="font-size:11px">
            ${disabled ? '🔒 Désactivé' : '✓ Actif'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="icon-btn-sm" onclick='openPlaceForm(${JSON.stringify(p)})' title="Modifier">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn-sm ${disabled ? 'success' : 'warning'}" onclick="togglePlace(${p.id}, ${disabled})" title="${disabled ? 'Activer' : 'Désactiver'}">
              ${disabled
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'}
            </button>
            <button class="icon-btn-sm danger" onclick='deletePlace(${p.id}, ${JSON.stringify(p.nameFr || "")})' title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function _populatePlaceWilayaSelect(selectedWilayaId) {
    const sel = $('place-wilaya');
    sel.innerHTML = '<option value="">— Choisir une wilaya —</option>' +
      _wilayasGeo.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    if (selectedWilayaId) sel.value = String(selectedWilayaId);
  }

  function _populatePlaceMoughataaSelect(wilayaId, selectedMoughataaId) {
    const sel = $('place-moughataa');
    if (!wilayaId) {
      sel.innerHTML = '<option value="">— Choisir d\'abord une wilaya —</option>';
      sel.disabled = true;
      return;
    }
    const w = _wilayasGeo.find(w => String(w.id) === String(wilayaId));
    if (!w || !w.moughataas.length) {
      sel.innerHTML = '<option value="">— Aucune moughataa —</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">— Choisir une moughataa —</option>' +
      w.moughataas.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    if (selectedMoughataaId) sel.value = String(selectedMoughataaId);
  }

  window._onPlaceWilayaChange = function () {
    const wilayaId = $('place-wilaya').value;
    _populatePlaceMoughataaSelect(wilayaId);
  };

  function _renderPlaceHaChips() {
    const box = $('place-ha-chips');
    box.innerHTML = _placeHaNames.map((n, i) => `
      <span class="ha-chip">${_escLoc(n)}<button type="button" onclick="removePlaceHaName(${i})" title="Retirer">×</button></span>
    `).join('');
  }

  window.addPlaceHaName = function () {
    const input = $('place-name-ha-input');
    const name = input.value.trim();
    if (!name) return;
    _placeHaNames.push(name);
    input.value = '';
    _renderPlaceHaChips();
  };

  window.removePlaceHaName = function (i) {
    _placeHaNames.splice(i, 1);
    _renderPlaceHaChips();
  };

  // ── Validation automatique GPS <-> Wilaya/Moughataa ────────────────
  // Déclenchée à chaque nouveau point choisi par l'admin (clic/glissé sur
  // la carte, résultat de recherche, saisie manuelle des coordonnées) --
  // jamais au chargement initial du formulaire en édition (coordonnées
  // déjà enregistrées, pas un nouveau choix de l'admin).
  function _hideGeoWarning() {
    $('place-geo-warning').style.display = 'none';
  }

  async function _detectGeoForCurrentCoords() {
    const lat = parseFloat($('place-lat').value);
    const lng = parseFloat($('place-lng').value);
    if (isNaN(lat) || isNaN(lng)) { _placeDetected = null; _hideGeoWarning(); return; }

    let detected = null;
    try {
      const resp = await Auth.authFetch(`/api/admin/geo/detect?lat=${lat}&lng=${lng}`);
      if (resp.ok) {
        const data = await resp.json();
        detected = data.data || null;
      }
    } catch (_) {}
    _placeDetected = detected;
    if (!detected) { _hideGeoWarning(); return; }

    const selectedWilaya    = $('place-wilaya').value;
    const selectedMoughataa = $('place-moughataa').value;

    if (!selectedWilaya || !selectedMoughataa) {
      // Rien choisi encore -> remplissage automatique silencieux.
      _populatePlaceWilayaSelect(detected.wilayaId);
      _populatePlaceMoughataaSelect(detected.wilayaId, detected.moughataaId);
      _hideGeoWarning();
      return;
    }

    if (String(selectedMoughataa) === String(detected.moughataaId)) {
      _hideGeoWarning();
      return;
    }

    // Une Wilaya/Moughataa était déjà choisie et ne correspond pas au
    // point GPS -> avertir et laisser l'admin décider.
    $('place-geo-detected-label').textContent = `${detected.wilayaName} / ${detected.moughataaName}`;
    $('place-geo-warning').style.display = 'flex';
  }

  window.applyDetectedGeo = function () {
    if (!_placeDetected) return;
    _populatePlaceWilayaSelect(_placeDetected.wilayaId);
    _populatePlaceMoughataaSelect(_placeDetected.wilayaId, _placeDetected.moughataaId);
    _hideGeoWarning();
  };

  window.dismissGeoWarning = function () {
    _hideGeoWarning();
  };

  function _initPlaceMap(lat, lng) {
    if (typeof L === 'undefined') return;
    const center = (typeof lat === 'number' && typeof lng === 'number') ? [lat, lng] : _NKC_CENTER;

    if (!_placeMap) {
      _placeMap = L.map('place-map', { zoomControl: true }).setView(center, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '© OpenStreetMap',
      }).addTo(_placeMap);
      _placeMap.on('click', (e) => _setPlaceMarker(e.latlng.lat, e.latlng.lng));
    } else {
      _placeMap.setView(center, _placeMarker ? 15 : 14);
      setTimeout(() => _placeMap.invalidateSize(), 150);
    }

    if (typeof lat === 'number' && typeof lng === 'number') {
      _setPlaceMarker(lat, lng, /*skipInputs*/ true);
    } else if (_placeMarker) {
      _placeMap.removeLayer(_placeMarker);
      _placeMarker = null;
    }
  }

  function _setPlaceMarker(lat, lng, skipInputs) {
    if (!_placeMap) return;
    if (_placeMarker) {
      _placeMarker.setLatLng([lat, lng]);
    } else {
      _placeMarker = L.marker([lat, lng], { draggable: true }).addTo(_placeMap);
      _placeMarker.on('dragend', () => {
        const p = _placeMarker.getLatLng();
        $('place-lat').value = p.lat.toFixed(8);
        $('place-lng').value = p.lng.toFixed(8);
        _detectGeoForCurrentCoords(); // async ok
      });
    }
    if (!skipInputs) {
      $('place-lat').value = lat.toFixed(8);
      $('place-lng').value = lng.toFixed(8);
      _detectGeoForCurrentCoords(); // async ok
    }
  }

  function _wirePlaceMapSearch() {
    const input = $('place-map-search');
    const box   = $('place-map-search-results');
    if (!input || !box) return;

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        const results = await _searchLocationOnMap(q);
        if (!results.length) { box.innerHTML = '<div class="loc-map-search-item">Aucun résultat.</div>'; box.classList.remove('hidden'); return; }
        box.innerHTML = results.map((r, i) => `<div class="loc-map-search-item" data-i="${i}">${_escLoc(r.display_name)}</div>`).join('');
        box.classList.remove('hidden');
        box._results = results;
      }, 320);
    });

    box.addEventListener('click', (e) => {
      const item = e.target.closest('.loc-map-search-item');
      if (!item || !box._results) return;
      const r = box._results[Number(item.dataset.i)];
      if (!r) return;
      const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
      _setPlaceMarker(lat, lng);
      if (_placeMap) _placeMap.setView([lat, lng], 16);
      box.classList.add('hidden');
    });

    input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 220));
  }

  window.openPlaceForm = async function (place) {
    $('place-form-err').textContent = '';
    const isEdit = !!(place && place.id);
    $('place-form-title').textContent = isEdit ? 'Modifier le lieu' : 'Ajouter un lieu';
    $('place-id').value      = isEdit ? place.id : '';
    $('place-name-fr').value = isEdit ? place.nameFr || '' : '';
    $('place-name-ar').value = isEdit ? place.nameAr || '' : '';
    $('place-type').value    = isEdit ? place.type || 'autre' : 'autre';
    $('place-lat').value     = isEdit ? place.lat : '';
    $('place-lng').value     = isEdit ? place.lng : '';
    $('place-map-search').value = '';
    $('place-map-search-results').classList.add('hidden');
    $('place-name-ha-input').value = '';
    _placeHaNames = isEdit ? (place.namesHa || []).slice() : [];
    _renderPlaceHaChips();
    _placeDetected = null;
    _hideGeoWarning();

    await _fetchWilayasGeo();
    _populatePlaceWilayaSelect(isEdit ? place.wilayaId : '');
    _populatePlaceMoughataaSelect(isEdit ? place.wilayaId : '', isEdit ? place.moughataaId : '');

    goSection('place-form');
    setTimeout(() => {
      _initPlaceMap(
        isEdit ? Number(place.lat) : undefined,
        isEdit ? Number(place.lng) : undefined
      );
    }, 60);
  };

  window.closePlaceForm = function () {
    goSection('places');
  };

  window.savePlaceForm = async function () {
    const errEl = $('place-form-err');
    errEl.textContent = '';

    const id           = $('place-id').value;
    const nameFr       = $('place-name-fr').value.trim();
    const nameAr       = $('place-name-ar').value.trim();
    const moughataaId  = $('place-moughataa').value;
    const lat          = parseFloat($('place-lat').value);
    const lng          = parseFloat($('place-lng').value);

    if (!$('place-wilaya').value)      { errEl.textContent = 'Choisissez une wilaya.'; return; }
    if (!moughataaId)                  { errEl.textContent = 'Choisissez une moughataa.'; return; }
    if (!nameAr)                        { errEl.textContent = 'Le nom en arabe est obligatoire.'; return; }
    if (!nameFr)                        { errEl.textContent = 'Le nom en français est obligatoire.'; return; }
    if (isNaN(lat) || isNaN(lng))       { errEl.textContent = 'Placez le lieu sur la carte (ou saisissez latitude/longitude).'; return; }

    const payload = {
      moughataa_id: Number(moughataaId),
      name_fr: nameFr,
      name_ar: nameAr,
      names_ha: _placeHaNames,
      type: $('place-type').value,
      lat, lng,
    };

    try {
      const url    = id ? `/api/admin/lieux/${id}` : '/api/admin/lieux';
      const method = id ? 'PUT' : 'POST';
      const resp   = await Auth.authFetch(url, { method, body: JSON.stringify(payload) });
      const data   = await resp.json();
      if (!resp.ok) { errEl.textContent = data.error || 'Erreur lors de l\'enregistrement.'; return; }
      toast(id ? 'Lieu mis à jour.' : 'Lieu créé.', 'success');
      closePlaceForm();
      renderPlaces();
    } catch (_) {
      errEl.textContent = 'Backend hors ligne — impossible d\'enregistrer.';
    }
  };

  window.togglePlace = function (id, currentlyDisabled) {
    adminConfirm(
      currentlyDisabled ? '📍' : '🔒',
      currentlyDisabled ? 'Activer le lieu' : 'Désactiver le lieu',
      currentlyDisabled
        ? 'Ce lieu redevient disponible.'
        : 'Ce lieu sera masqué (il reste modifiable et réactivable).',
      currentlyDisabled ? 'Activer' : 'Désactiver',
      currentlyDisabled ? 'warning-btn' : '',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/lieux/${id}/toggle`, { method: 'PUT' });
          if (resp.ok) { toast(currentlyDisabled ? 'Lieu activé.' : 'Lieu désactivé.', 'success'); renderPlaces(); return; }
        } catch (_) {}
        toast('Backend hors ligne — action impossible.', 'danger');
      });
  };

  window.deletePlace = function (id, name) {
    adminConfirm(
      '🗑️',
      'Supprimer le lieu',
      `"${name}" sera définitivement supprimé. Cette action est irréversible.`,
      'Supprimer',
      'warning-btn',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/lieux/${id}`, { method: 'DELETE' });
          if (resp.ok) { toast('Lieu supprimé.', 'success'); renderPlaces(); return; }
          const data = await resp.json().catch(() => ({}));
          toast(data.error || 'Suppression impossible.', 'danger');
        } catch (_) {
          toast('Backend hors ligne — action impossible.', 'danger');
        }
      });
  };

  // ── WILAYAS & MOUGHATAAS (gestion de la hiérarchie) ────────────────
  // Permet d'ajouter/modifier/supprimer des wilayas et des moughataas
  // (et de déplacer une moughataa vers une autre wilaya), pour alimenter
  // la Base des lieux ci-dessus. Une wilaya/moughataa non vide ne peut
  // pas être supprimée (contrôle serveur + bouton désactivé côté client).

  async function renderGeo() {
    await _fetchWilayasGeo(/*force*/ true);
    const box = $('geo-wilayas-list');
    if (!box) return;

    if (!_wilayasGeo.length) {
      box.innerHTML = '<div class="table-card"><div style="padding:20px;color:var(--text3);font-size:13px;">Aucune wilaya. Ajoutez-en une avec le bouton ci-dessus.</div></div>';
      return;
    }

    box.innerHTML = _wilayasGeo.map(w => {
      const wCount = w.moughataasCount || 0;
      const wDeleteDisabled = wCount > 0;
      return `
      <div class="table-card" style="margin-bottom:16px;">
        <div class="table-header">
          <h3>${_escLoc(w.name)}${w.nameAr ? ` <span style="font-size:11px;color:var(--text3);font-weight:500;" dir="rtl">${_escLoc(w.nameAr)}</span>` : ''}</h3>
          <div class="table-header-right" style="gap:8px;">
            <button class="btn-sm primary" onclick='openGeoModal("moughataa", null, ${w.id})'>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Ajouter une moughataa
            </button>
            <button class="icon-btn-sm" onclick='openGeoModal("wilaya", ${JSON.stringify({id: w.id, name: w.name, nameAr: w.nameAr})})' title="Modifier">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn-sm ${wDeleteDisabled ? '' : 'danger'}" ${wDeleteDisabled ? 'disabled style="opacity:.4;cursor:not-allowed;"' : `onclick='deleteGeoWilaya(${w.id}, ${JSON.stringify(w.name)})'`} title="${wDeleteDisabled ? `Contient ${wCount} moughataa(s) — videz-la d'abord` : 'Supprimer'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
        <table>
          <thead><tr><th>Moughataa</th><th>Arabe</th><th>Lieux</th><th>Actions</th></tr></thead>
          <tbody>
            ${w.moughataas.length ? w.moughataas.map(m => {
              const mDeleteDisabled = (m.lieuxCount || 0) > 0;
              return `
              <tr>
                <td style="font-weight:600;">${_escLoc(m.name)}</td>
                <td dir="rtl" style="color:var(--text3);">${_escLoc(m.nameAr || '')}</td>
                <td><span class="badge">${m.lieuxCount || 0}</span></td>
                <td>
                  <div class="action-btns">
                    <button class="icon-btn-sm" onclick='openGeoModal("moughataa", ${JSON.stringify({id: m.id, name: m.name, nameAr: m.nameAr, wilayaId: w.id})})' title="Modifier">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="icon-btn-sm ${mDeleteDisabled ? '' : 'danger'}" ${mDeleteDisabled ? 'disabled style="opacity:.4;cursor:not-allowed;"' : `onclick='deleteGeoMoughataa(${m.id}, ${JSON.stringify(m.name)})'`} title="${mDeleteDisabled ? `Contient ${m.lieuxCount} lieu(x) — déplacez/supprimez-les d'abord` : 'Supprimer'}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`;
            }).join('') : '<tr class="empty-row"><td colspan="4">Aucune moughataa dans cette wilaya.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    }).join('');
  }

  window.openGeoModal = async function (kind, entity, wilayaIdForNewMoughataa) {
    await _fetchWilayasGeo();
    const isEdit = !!(entity && entity.id);

    $('geo-modal-kind').value = kind;
    $('geo-modal-id').value   = isEdit ? entity.id : '';
    $('geo-modal-name').value    = isEdit ? entity.name || '' : '';
    $('geo-modal-name-ar').value = isEdit ? entity.nameAr || '' : '';
    $('geo-modal-err').textContent = '';

    const wilayaRow = $('geo-modal-wilaya-row');
    if (kind === 'moughataa') {
      wilayaRow.style.display = '';
      const sel = $('geo-modal-wilaya-select');
      sel.innerHTML = _wilayasGeo.map(w => `<option value="${w.id}">${_escLoc(w.name)}</option>`).join('');
      const preselect = isEdit ? entity.wilayaId : wilayaIdForNewMoughataa;
      if (preselect) sel.value = String(preselect);
      $('geo-modal-title').textContent = isEdit ? 'Modifier la moughataa' : 'Ajouter une moughataa';
    } else {
      wilayaRow.style.display = 'none';
      $('geo-modal-title').textContent = isEdit ? 'Modifier la wilaya' : 'Ajouter une wilaya';
    }

    $('geo-modal-overlay').classList.remove('hidden');
  };

  window.closeGeoModal = function () {
    $('geo-modal-overlay').classList.add('hidden');
  };

  window.saveGeoModal = async function () {
    const errEl = $('geo-modal-err');
    errEl.textContent = '';

    const kind = $('geo-modal-kind').value;
    const id   = $('geo-modal-id').value;
    const name = $('geo-modal-name').value.trim();
    const nameAr = $('geo-modal-name-ar').value.trim();

    if (!name) { errEl.textContent = 'Le nom (français) est obligatoire.'; return; }

    let url, payload;
    if (kind === 'moughataa') {
      const wilayaId = $('geo-modal-wilaya-select').value;
      if (!wilayaId) { errEl.textContent = 'Choisissez une wilaya.'; return; }
      payload = { name, name_ar: nameAr, wilaya_id: Number(wilayaId) };
      url = id ? `/api/admin/geo/moughataas/${id}` : '/api/admin/geo/moughataas';
    } else {
      payload = { name, name_ar: nameAr };
      url = id ? `/api/admin/geo/wilayas/${id}` : '/api/admin/geo/wilayas';
    }

    try {
      const resp = await Auth.authFetch(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const data = await resp.json();
      if (!resp.ok) { errEl.textContent = data.error || 'Erreur lors de l\'enregistrement.'; return; }
      toast(id ? 'Enregistré.' : 'Ajouté.', 'success');
      closeGeoModal();
      renderGeo();
    } catch (_) {
      errEl.textContent = 'Backend hors ligne — impossible d\'enregistrer.';
    }
  };

  window.deleteGeoWilaya = function (id, name) {
    adminConfirm(
      '🗑️',
      'Supprimer la wilaya',
      `"${name}" sera définitivement supprimée. Cette action est irréversible.`,
      'Supprimer',
      'warning-btn',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/geo/wilayas/${id}`, { method: 'DELETE' });
          if (resp.ok) { toast('Wilaya supprimée.', 'success'); renderGeo(); return; }
          const data = await resp.json().catch(() => ({}));
          toast(data.error || 'Suppression impossible.', 'danger');
        } catch (_) {
          toast('Backend hors ligne — action impossible.', 'danger');
        }
      });
  };

  window.deleteGeoMoughataa = function (id, name) {
    adminConfirm(
      '🗑️',
      'Supprimer la moughataa',
      `"${name}" sera définitivement supprimée. Cette action est irréversible.`,
      'Supprimer',
      'warning-btn',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/geo/moughataas/${id}`, { method: 'DELETE' });
          if (resp.ok) { toast('Moughataa supprimée.', 'success'); renderGeo(); return; }
          const data = await resp.json().catch(() => ({}));
          toast(data.error || 'Suppression impossible.', 'danger');
        } catch (_) {
          toast('Backend hors ligne — action impossible.', 'danger');
        }
      });
  };

  // ── SETTINGS SUB-PANEL ───────────────────────────────────────────
  window.openSettingsPanel = function (category) {
    $('settings-overview').classList.add('hidden');
    const panel = $('settings-sub-panel');
    panel.classList.remove('hidden');

    const titles = {
      welcome:  'Messages d\'accueil',
      phrases:  'Phrases de l\'IA',
      behavior: 'Comportement IA',
      call:     'Appel & Voix IA',
      training: 'Entraînement IA',
      llm:      'Fournisseur LLM',
    };
    $('sub-panel-title').textContent = titles[category] || 'Paramètres';
    $('sub-panel-body').innerHTML = _buildPanelBody(category);

    // Populate with stored values
    renderSettings();
    if (category === 'llm') loadLlmSettings(); // async, fire-and-forget
    setTimeout(() => panel.classList.add('visible'), 10);
  };

  window.closeSettingsPanel = function () {
    const panel = $('settings-sub-panel');
    panel.classList.remove('visible');
    setTimeout(() => {
      panel.classList.add('hidden');
      $('settings-overview').classList.remove('hidden');
    }, 260);
  };

  function _buildPanelBody(cat) {
    const saveIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

    if (cat === 'welcome') return `
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Message de bienvenue — Français (FR)</div>
        <textarea class="setting-input" id="ai-welcome-fr" rows="3" placeholder="Bonjour ! Je suis ChatIA..."></textarea>
      </div>
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Message de bienvenue — Arabe (AR) — عربي</div>
        <textarea class="setting-input" id="ai-welcome-ar" rows="3" dir="rtl" placeholder="مرحباً..."></textarea>
      </div>
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Message de bienvenue — Hassaniya (HA) — حسانية</div>
        <textarea class="setting-input" id="ai-welcome-ha" rows="3" dir="rtl" placeholder="أهلاً..."></textarea>
      </div>
      <button class="save-btn" onclick="saveWelcome()">${saveIcon} Sauvegarder</button>`;

    if (cat === 'phrases') return `
      <p style="font-size:12.5px;color:var(--text3);margin-bottom:16px;">Modifiez les réponses de l'IA dans les 3 langues. Chaque phrase peut être traduite indépendamment.</p>
      ${_buildPhrasesEditor()}
      <button class="save-btn" onclick="savePhrases()">${saveIcon} Sauvegarder toutes les phrases</button>`;

    if (cat === 'behavior') return `
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Délai de réponse texte (ms)</div>
        <input type="number" class="setting-input" id="ai-reply-delay" min="200" max="3000" step="100">
        <div class="sub-panel-hint">Temps d'attente avant que l'IA réponde (200–3000 ms).</div>
      </div>
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Max tentatives de localisation</div>
        <input type="number" class="setting-input" id="ai-max-retries" min="1" max="5" step="1">
        <div class="sub-panel-hint">Nombre de fois que l'IA redemande si le lieu n'est pas reconnu.</div>
      </div>
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Zone de service (rayon en km)</div>
        <input type="number" class="setting-input" id="ai-service-radius" min="5" max="100" step="5">
        <div class="sub-panel-hint">L'IA accepte uniquement les lieux dans ce rayon autour de Nouakchott.</div>
      </div>
      <button class="save-btn" onclick="saveBehavior()">${saveIcon} Sauvegarder le comportement</button>`;

    if (cat === 'call') return `
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Message d'accueil appel IA (FR)</div>
        <textarea class="setting-input" id="ai-call-greeting" rows="2" placeholder="Bonjour, bienvenue..."></textarea>
      </div>
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Message de fin d'appel (FR)</div>
        <textarea class="setting-input" id="ai-call-end" rows="2" placeholder="L'appel est terminé..."></textarea>
      </div>
      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Synthèse vocale (TTS)</div>
        <select class="setting-input" id="ai-tts-enabled">
          <option value="1">✓ Activée — L'IA parle en mode appel</option>
          <option value="0">✗ Désactivée — Texte uniquement</option>
        </select>
        <div class="sub-panel-hint">Active la voix de l'IA lors des appels vocaux.</div>
      </div>
      <button class="save-btn" onclick="saveBehavior()">${saveIcon} Sauvegarder</button>`;

    if (cat === 'training') return `
      <p style="font-size:12.5px;color:var(--text3);margin-bottom:4px;">
        Paramètres d'entraînement et de personnalité de l'IA. Ces réglages influencent le comportement global de ChatIA.
      </p>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Niveau de verbosité</div>
        <select class="setting-input" id="ai-verbosity">
          <option value="concise">Concis — réponses courtes et directes</option>
          <option value="normal">Normal — équilibré (recommandé)</option>
          <option value="verbose">Détaillé — réponses riches et complètes</option>
          <option value="very_verbose">Très détaillé — l'IA explique tout</option>
        </select>
        <div class="sub-panel-hint">Contrôle la longueur et la richesse des réponses de l'IA.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Mode de réponse</div>
        <select class="setting-input" id="ai-response-mode">
          <option value="transport_only">Transport uniquement — l'IA refuse les hors-sujets</option>
          <option value="all_questions">Toutes les questions — l'IA répond à tout</option>
          <option value="general_help">Assistant général — transport + aide quotidienne</option>
        </select>
        <div class="sub-panel-hint">Détermine si l'IA répond aux questions hors transport.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Ton et personnalité</div>
        <select class="setting-input" id="ai-tone">
          <option value="friendly">Amical — chaleureux et détendu</option>
          <option value="formal">Formel — professionnel et poli</option>
          <option value="neutral">Neutre — factuel et concis</option>
          <option value="enthusiastic">Enthousiaste — énergique et motivant</option>
        </select>
        <div class="sub-panel-hint">Style de communication de l'IA avec l'utilisateur.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Sensibilité de compréhension vocale</div>
        <select class="setting-input" id="ai-comprehension">
          <option value="standard">Standard — équilibré</option>
          <option value="high">Haute — comprend mieux les accents et bruits</option>
          <option value="strict">Stricte — exige une diction claire</option>
          <option value="expert">Expert — tolérance maximale aux variations</option>
        </select>
        <div class="sub-panel-hint">Niveau d'effort pour interpréter la parole et les abréviations.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Fréquence d'initiation</div>
        <select class="setting-input" id="ai-initiative">
          <option value="reactive">Réactive — l'IA attend toujours la demande de l'utilisateur</option>
          <option value="proactive">Proactive — l'IA propose des options et relances</option>
        </select>
        <div class="sub-panel-hint">Contrôle si l'IA anticipe et propose sans être sollicitée.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Mémoire de contexte (nombre de tours)</div>
        <select class="setting-input" id="ai-context-depth">
          <option value="2">2 tours — mémoire minimale</option>
          <option value="5">5 tours — recommandé</option>
          <option value="10">10 tours — mémoire étendue</option>
          <option value="20">20 tours — mémoire longue</option>
        </select>
        <div class="sub-panel-hint">Nombre d'échanges que l'IA mémorise pour adapter ses réponses.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Comportement hors-sujet</div>
        <select class="setting-input" id="ai-offtopic">
          <option value="redirect">Rediriger — ramène vers le transport</option>
          <option value="answer">Répondre — aide l'utilisateur quand même</option>
          <option value="ignore">Ignorer — ne répond pas aux hors-sujets</option>
        </select>
        <div class="sub-panel-hint">Réaction de l'IA face aux questions sans rapport avec le transport.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Langue par défaut de l'IA</div>
        <select class="setting-input" id="ai-default-lang">
          <option value="fr">Français (FR)</option>
          <option value="ar">Arabe (AR)</option>
          <option value="ha">Hassaniya (HA)</option>
          <option value="auto">Automatique — détecte la langue de l'utilisateur</option>
        </select>
        <div class="sub-panel-hint">Langue utilisée par l'IA si aucune préférence n'est détectée.</div>
      </div>

      <button class="save-btn" onclick="saveTraining()">${saveIcon} Sauvegarder l'entraînement IA</button>`;

    if (cat === 'llm') return `
      <p style="font-size:12.5px;color:var(--text3);margin:-4px 0 4px;">
        Seul "Google Gemini" est aujourd'hui réellement branché : le sélectionner active de vrais appels vers l'API Gemini pour la compréhension du langage (le moteur de réservation, lui, reste toujours 100% géré par ChatIA). Les autres fournisseurs listés ci-dessous n'ont pas encore d'adaptateur côté serveur — les sélectionner fera échouer chaque appel et le chat retombera automatiquement sur "Rules".
      </p>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Fournisseur</div>
        <select class="setting-input" id="llm-provider" onchange="document.getElementById('llm-provider-custom-wrap').style.display = this.value === 'autre' ? '' : 'none'">
          <option value="rules">Rules — moteur actuel (aucun appel externe)</option>
          <option value="gemini">Google Gemini (actif)</option>
          <option value="groq">Groq (pas encore câblé)</option>
          <option value="openrouter">OpenRouter (pas encore câblé)</option>
          <option value="openai">OpenAI (pas encore câblé)</option>
          <option value="anthropic">Anthropic — Claude (pas encore câblé)</option>
          <option value="autre">Autre… (pas encore câblé)</option>
        </select>
      </div>

      <div class="sub-panel-section" id="llm-provider-custom-wrap" style="display:none">
        <div class="sub-panel-section-label">Nom du fournisseur personnalisé</div>
        <input type="text" class="setting-input" id="llm-provider-custom" placeholder="ex: mistral">
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Modèle</div>
        <input type="text" class="setting-input" id="llm-model" placeholder="ex: gemini-2.0-flash, llama-3.3-70b-versatile...">
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Clé API</div>
        <input type="password" class="setting-input" id="llm-api-key" placeholder="Laisser vide pour ne pas modifier" autocomplete="new-password">
        <div class="sub-panel-hint" id="llm-api-key-hint">Aucune clé enregistrée.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Température</div>
        <input type="number" class="setting-input" id="llm-temperature" min="0" max="2" step="0.1">
        <div class="sub-panel-hint">0 = réponses strictes et prévisibles · 2 = réponses très variées.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Max tokens</div>
        <input type="number" class="setting-input" id="llm-max-tokens" min="1" step="1">
        <div class="sub-panel-hint">Longueur maximale d'une réponse générée par le LLM.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Prompt système</div>
        <textarea class="setting-input" id="llm-system-prompt" rows="5" placeholder="ex: Tu es l'assistant transport de ChatIA à Nouakchott. Tu aides uniquement à identifier un départ, une destination et à réserver une course..."></textarea>
        <div class="sub-panel-hint">Instructions envoyées au LLM avant chaque conversation.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Langues activées</div>
        <div style="display:flex;gap:16px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;"><input type="checkbox" id="llm-lang-fr"> Français</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;"><input type="checkbox" id="llm-lang-ar"> Arabe</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;"><input type="checkbox" id="llm-lang-ha"> Hassaniya</label>
        </div>
        <div class="sub-panel-hint">Langues pour lesquelles le LLM est autorisé à répondre.</div>
      </div>

      <div class="sub-panel-section">
        <div class="sub-panel-section-label">Taille de l'historique envoyé au LLM</div>
        <input type="number" class="setting-input" id="llm-history-size" min="1" max="50" step="1">
        <div class="sub-panel-hint">Nombre de derniers messages de la conversation transmis comme contexte.</div>
      </div>

      <div class="sub-panel-section">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="llm-strict-transport">
          <span class="sub-panel-section-label" style="margin:0">Mode strict Transport</span>
        </label>
        <div class="sub-panel-hint">Si activé, le LLM ne répond qu'aux questions liées au transport et à la réservation — tout le reste est redirigé.</div>
      </div>

      <span class="admin-confirm-msg" id="llm-form-err" style="display:block;color:#DC2626;font-size:12.5px;"></span>

      <button class="save-btn" onclick="saveLlmSettings()">${saveIcon} Sauvegarder la configuration LLM</button>`;

    return '<p>Sélectionnez une catégorie.</p>';
  }

  function _buildPhrasesEditor() {
    const phrases = [
      { id: 'ai-ask-origin',   label: 'Demande de départ',       arKey: 'ai-ask-origin-ar',   haKey: 'ai-ask-origin-ha' },
      { id: 'ai-ask-dest',     label: 'Demande de destination',  arKey: 'ai-ask-dest-ar',     haKey: 'ai-ask-dest-ha' },
      { id: 'ai-no-active-fr', label: 'Aucune course active',    arKey: 'ai-no-active-ar',    haKey: 'ai-no-active-ha' },
      { id: 'ai-no-driver-fr', label: 'Aucun chauffeur dispo',   arKey: 'ai-no-driver-ar',    haKey: 'ai-no-driver-ha' },
      { id: 'ai-confirmed-fr', label: 'Course confirmée',        arKey: 'ai-confirmed-ar',    haKey: 'ai-confirmed-ha' },
      { id: 'ai-cancelled-fr', label: 'Course annulée',          arKey: 'ai-cancelled-ar',    haKey: 'ai-cancelled-ha' },
    ];
    return phrases.map(p => `
      <div class="phrase-block">
        <div class="phrase-block-title">${p.label}</div>
        <div class="phrase-lang-row">
          <span class="phrase-lang-tag fr">FR</span>
          <textarea class="setting-input phrase-ta" id="${p.id}" rows="2"></textarea>
        </div>
        <div class="phrase-lang-row">
          <span class="phrase-lang-tag ar">AR</span>
          <textarea class="setting-input phrase-ta" id="${p.arKey}" rows="2" dir="rtl"></textarea>
        </div>
        <div class="phrase-lang-row">
          <span class="phrase-lang-tag ha">HA</span>
          <textarea class="setting-input phrase-ta" id="${p.haKey}" rows="2" dir="rtl"></textarea>
        </div>
      </div>`).join('');
  }

  // ── SETTINGS ────────────────────────────────────────────────────
  function renderSettings() {
    const fields = [
      ['ai-welcome-fr',     'ai.welcome.fr',     'Bonjour ! Je suis ChatIA, votre assistant transport intelligent. Comment puis-je vous aider ?'],
      ['ai-welcome-ar',     'ai.welcome.ar',     'مرحباً! أنا ChatIA، مساعدك الذكي للنقل. كيف يمكنني مساعدتك؟'],
      ['ai-welcome-ha',     'ai.welcome.ha',     'أهلاً بيك! أنا ChatIA، المساعد ديالك للنقل. بغيتي شنو اليوم؟'],
      ['ai-ask-origin',     'ai.ask_origin',     'Parfait ! Depuis quel endroit souhaitez-vous partir ?'],
      ['ai-ask-origin-ar',  'ai.ask_origin_ar',  'بكل سرور! من أي مكان تريد الانطلاق؟'],
      ['ai-ask-origin-ha',  'ai.ask_origin_ha',  'مزيان! فمن بغيتي تمشي؟'],
      ['ai-ask-dest',       'ai.ask_dest',       'Merci. Quelle est votre destination ?'],
      ['ai-ask-dest-ar',    'ai.ask_dest_ar',    'شكراً. وإلى أين تريد الذهاب؟'],
      ['ai-ask-dest-ha',    'ai.ask_dest_ha',    'شكراً. فين بغيتي تروح؟'],
      ['ai-no-active-fr',   'ai.no_active_fr',   'Vous n\'avez aucune demande active en ce moment. Dites-moi si vous souhaitez réserver un transport.'],
      ['ai-no-active-ar',   'ai.no_active_ar',   'ليس لديك أي طلب نشط في الوقت الحالي. أخبرني إذا كنت تريد حجز رحلة.'],
      ['ai-no-active-ha',   'ai.no_active_ha',   'ما عندك طلب دابا. إذا بغيتي كار، قول لي.'],
      ['ai-no-driver-fr',   'ai.no_driver_fr',   'Désolé, aucun chauffeur n\'est disponible en ce moment. Veuillez réessayer dans quelques minutes.'],
      ['ai-no-driver-ar',   'ai.no_driver_ar',   'أعتذر، لا يوجد سائق متاح في الوقت الحالي. يرجى المحاولة مرة أخرى بعد دقائق قليلة.'],
      ['ai-no-driver-ha',   'ai.no_driver_ha',   'آسف، ما كاين سايق دابا. ارجع عاود بعد شوية.'],
      ['ai-confirmed-fr',   'ai.confirmed_fr',   'Votre demande a bien été envoyée ! Je recherche un chauffeur disponible près de vous...'],
      ['ai-confirmed-ar',   'ai.confirmed_ar',   'تم إرسال طلبك بنجاح! جاري البحث عن سائق متاح بالقرب منك...'],
      ['ai-confirmed-ha',   'ai.confirmed_ha',   'الطلب وصل مزيان! كنبحث على سايق قريب منك...'],
      ['ai-cancelled-fr',   'ai.cancelled_fr',   'Demande annulée. N\'hésitez pas à faire appel à moi si vous avez besoin d\'autre chose.'],
      ['ai-cancelled-ar',   'ai.cancelled_ar',   'تم إلغاء طلبك. لا تتردد في التواصل معي متى احتجت مساعدة.'],
      ['ai-cancelled-ha',   'ai.cancelled_ha',   'الطلب تلغى. إذا احتجت أي شي، قول لي.'],
      ['ai-reply-delay',    'ai.reply_delay',    '850'],
      ['ai-max-retries',    'ai.max_retries',    '2'],
      ['ai-service-radius', 'ai.service_radius', '30'],
      ['ai-call-greeting',  'ai.call_greeting',  'Bonjour, bienvenue dans le service de transport ChatIA. Comment puis-je vous aider ?'],
      ['ai-call-end',       'ai.call_end',       'L\'appel est terminé. Merci d\'avoir contacté ChatIA Transport.'],
      ['ai-tts-enabled',    'ai.tts_enabled',    '1'],
      ['ai-verbosity',      'ai.verbosity',      'normal'],
      ['ai-response-mode',  'ai.response_mode',  'all_questions'],
      ['ai-tone',           'ai.tone',           'friendly'],
      ['ai-comprehension',  'ai.comprehension',  'high'],
      ['ai-initiative',     'ai.initiative',     'proactive'],
      ['ai-context-depth',  'ai.context_depth',  '5'],
      ['ai-offtopic',       'ai.offtopic',       'answer'],
      ['ai-default-lang',   'ai.default_lang',   'auto'],
    ];
    fields.forEach(([elId, key, def]) => {
      var el = $(elId);
      if (el) el.value = Auth.getAISetting(key, def);
    });
  }

  window.saveWelcome = function () {
    var fr = (($('ai-welcome-fr') || {}).value || '').trim();
    var ar = (($('ai-welcome-ar') || {}).value || '').trim();
    var ha = (($('ai-welcome-ha') || {}).value || '').trim();
    if (!fr) { toast('Message FR vide.', 'danger'); return; }
    Auth.updateAISetting('ai.welcome.fr', fr);
    Auth.updateAISetting('ai.welcome.ar', ar);
    Auth.updateAISetting('ai.welcome.ha', ha);
    toast('Messages de bienvenue sauvegardés !', 'success');
  };

  window.savePricing = function () {
    var base = parseFloat($('ai-base-price').value);
    var km   = parseFloat($('ai-per-km').value);
    var unit = parseFloat($('ai-km-per-unit').value);
    if (isNaN(base) || isNaN(km) || isNaN(unit)) { toast('Valeurs invalides.', 'danger'); return; }
    Auth.updateAISetting('ai.base_price',  base);
    Auth.updateAISetting('ai.per_km',      km);
    Auth.updateAISetting('ai.km_per_unit', unit);
    toast('Tarification sauvegardée !', 'success');
  };

  window.savePhrases = function () {
    var map = {
      'ai-ask-origin':   'ai.ask_origin',    'ai-ask-origin-ar': 'ai.ask_origin_ar', 'ai-ask-origin-ha': 'ai.ask_origin_ha',
      'ai-ask-dest':     'ai.ask_dest',      'ai-ask-dest-ar':   'ai.ask_dest_ar',   'ai-ask-dest-ha':   'ai.ask_dest_ha',
      'ai-no-active-fr': 'ai.no_active_fr',  'ai-no-active-ar':  'ai.no_active_ar',  'ai-no-active-ha':  'ai.no_active_ha',
      'ai-no-driver-fr': 'ai.no_driver_fr',  'ai-no-driver-ar':  'ai.no_driver_ar',  'ai-no-driver-ha':  'ai.no_driver_ha',
      'ai-confirmed-fr': 'ai.confirmed_fr',  'ai-confirmed-ar':  'ai.confirmed_ar',  'ai-confirmed-ha':  'ai.confirmed_ha',
      'ai-cancelled-fr': 'ai.cancelled_fr',  'ai-cancelled-ar':  'ai.cancelled_ar',  'ai-cancelled-ha':  'ai.cancelled_ha',
    };
    Object.entries(map).forEach(([elId, key]) => { var el=$(elId); if(el && el.value.trim()) Auth.updateAISetting(key, el.value.trim()); });
    toast('Phrases IA sauvegardées (FR + AR + HA) !', 'success');
  };

  window.saveBehavior = function () {
    var delay    = parseInt(($('ai-reply-delay')    || {}).value) || 850;
    var retries  = parseInt(($('ai-max-retries')    || {}).value) || 2;
    var radius   = parseInt(($('ai-service-radius') || {}).value) || 30;
    var greeting = (($('ai-call-greeting') || {}).value || '').trim();
    var end      = (($('ai-call-end')      || {}).value || '').trim();
    var tts      = ($('ai-tts-enabled') || {}).value || '1';
    Auth.updateAISetting('ai.reply_delay',    delay);
    Auth.updateAISetting('ai.max_retries',    retries);
    Auth.updateAISetting('ai.service_radius', radius);
    Auth.updateAISetting('ai.tts_enabled',    tts);
    if (greeting) Auth.updateAISetting('ai.call_greeting', greeting);
    if (end)      Auth.updateAISetting('ai.call_end',      end);
    toast('Comportement & appel IA sauvegardés !', 'success');
  };

  window.saveTraining = function () {
    var verbosity   = ($('ai-verbosity')     || {}).value || 'normal';
    var respMode    = ($('ai-response-mode') || {}).value || 'all_questions';
    var tone        = ($('ai-tone')          || {}).value || 'friendly';
    var comprehend  = ($('ai-comprehension') || {}).value || 'high';
    var initiative  = ($('ai-initiative')    || {}).value || 'proactive';
    var ctxDepth    = ($('ai-context-depth') || {}).value || '5';
    var offtopic    = ($('ai-offtopic')      || {}).value || 'answer';
    var defLang     = ($('ai-default-lang')  || {}).value || 'auto';
    Auth.updateAISetting('ai.verbosity',     verbosity);
    Auth.updateAISetting('ai.response_mode', respMode);
    Auth.updateAISetting('ai.tone',          tone);
    Auth.updateAISetting('ai.comprehension', comprehend);
    Auth.updateAISetting('ai.initiative',    initiative);
    Auth.updateAISetting('ai.context_depth', ctxDepth);
    Auth.updateAISetting('ai.offtopic',      offtopic);
    Auth.updateAISetting('ai.default_lang',  defLang);
    toast('Entraînement IA sauvegardé !', 'success');
  };

  // ── FOURNISSEUR LLM ───────────────────────────────────────────────
  // Table backend dédiée (voir /api/admin/llm-settings) — pas localStorage,
  // pour ne jamais exposer la clé API au navigateur (voir GET, qui ne
  // renvoie qu'un booléen apiKeySet). "gemini" est le seul provider avec
  // un adaptateur câblé côté serveur (backend/app/utils/llm_providers/) ;
  // les autres noms sont acceptés par ce formulaire pour préparer leur
  // ajout futur mais /api/nlu/analyze les rejette tant qu'aucun adaptateur
  // n'existe pour eux (le chat retombe alors sur "rules" via le fallback).
  const _LLM_KNOWN_PROVIDERS = ['rules', 'gemini', 'groq', 'openrouter', 'openai', 'anthropic'];

  async function loadLlmSettings() {
    const errEl = $('llm-form-err');
    if (errEl) errEl.textContent = '';
    try {
      const resp = await Auth.authFetch('/api/admin/llm-settings/');
      if (!resp.ok) throw new Error('bad response');
      const s = (await resp.json()).data;

      const isKnown = _LLM_KNOWN_PROVIDERS.includes(s.provider);
      $('llm-provider').value = isKnown ? s.provider : 'autre';
      $('llm-provider-custom-wrap').style.display = isKnown ? 'none' : '';
      $('llm-provider-custom').value = isKnown ? '' : s.provider;
      $('llm-model').value = s.modelName || '';
      $('llm-api-key').value = '';
      $('llm-api-key-hint').textContent = s.apiKeySet
        ? 'Une clé est déjà enregistrée — laissez vide pour la garder.'
        : 'Aucune clé enregistrée.';
      $('llm-temperature').value = s.temperature;
      $('llm-max-tokens').value = s.maxTokens;
      $('llm-system-prompt').value = s.systemPrompt || '';
      $('llm-lang-fr').checked = s.enabledLanguages.includes('fr');
      $('llm-lang-ar').checked = s.enabledLanguages.includes('ar');
      $('llm-lang-ha').checked = s.enabledLanguages.includes('ha');
      $('llm-history-size').value = s.historySize;
      $('llm-strict-transport').checked = !!s.strictTransportMode;
    } catch (_) {
      if (errEl) errEl.textContent = 'Backend hors ligne — impossible de charger la configuration LLM.';
    }
  }

  window.saveLlmSettings = async function () {
    const errEl = $('llm-form-err');
    errEl.textContent = '';

    const providerSel = $('llm-provider').value;
    const provider = providerSel === 'autre' ? $('llm-provider-custom').value.trim() : providerSel;
    if (providerSel === 'autre' && !provider) { errEl.textContent = 'Précisez le nom du fournisseur personnalisé.'; return; }

    const langs = [];
    if ($('llm-lang-fr').checked) langs.push('fr');
    if ($('llm-lang-ar').checked) langs.push('ar');
    if ($('llm-lang-ha').checked) langs.push('ha');
    if (!langs.length) { errEl.textContent = 'Activez au moins une langue.'; return; }

    const payload = {
      provider,
      modelName:   $('llm-model').value.trim(),
      temperature: parseFloat($('llm-temperature').value),
      maxTokens:   parseInt($('llm-max-tokens').value, 10),
      systemPrompt: $('llm-system-prompt').value.trim(),
      enabledLanguages: langs,
      historySize: parseInt($('llm-history-size').value, 10),
      strictTransportMode: $('llm-strict-transport').checked,
    };
    // Clé API : n'envoyer le champ que si l'admin a tapé quelque chose,
    // pour ne jamais écraser une clé déjà enregistrée avec une valeur vide.
    const apiKey = $('llm-api-key').value;
    if (apiKey) payload.apiKey = apiKey;

    if (isNaN(payload.temperature) || isNaN(payload.maxTokens) || isNaN(payload.historySize)) {
      errEl.textContent = 'Température, max tokens et taille d\'historique doivent être des nombres.';
      return;
    }

    try {
      const resp = await Auth.authFetch('/api/admin/llm-settings/', { method: 'PUT', body: JSON.stringify(payload) });
      const data = await resp.json();
      if (!resp.ok) { errEl.textContent = data.error || 'Erreur lors de l\'enregistrement.'; return; }
      toast('Configuration LLM sauvegardée.', 'success');
      loadLlmSettings();
    } catch (_) {
      errEl.textContent = 'Backend hors ligne — impossible d\'enregistrer.';
    }
  };

  window.resetAllData = function () {
    adminConfirm('🗑️', 'Effacer toutes les courses',
      'Cette action supprimera définitivement toutes les courses. Irréversible.',
      'Effacer tout', '',
      () => {
        localStorage.removeItem('chatia_requests');
        toast('Données courses supprimées.', 'danger');
        renderDashboard();
        renderRequests();
      });
  };

  // ── Search bindings ─────────────────────────────────────────────
  function bindSearch(inputId, cb) {
    var el = $(inputId);
    if (el) el.addEventListener('input', function () { cb(this.value); });
  }

  bindSearch('user-search', function (v) { _userSearch = v; renderUsers(); /* async ok */ });
  bindSearch('req-search',  function (v) { _reqSearch  = v; renderRequests(); });

  bindSearch('place-search', function (v) { _placeSearch = v; renderPlaces(); /* async ok */ });
  _wirePlaceMapSearch();

  ['place-lat', 'place-lng'].forEach(id => {
    $(id)?.addEventListener('change', () => {
      const lat = parseFloat($('place-lat').value);
      const lng = parseFloat($('place-lng').value);
      if (!isNaN(lat) && !isNaN(lng) && _placeMap) {
        _setPlaceMarker(lat, lng, /*skipInputs*/ true);
        _placeMap.setView([lat, lng], 15);
        _detectGeoForCurrentCoords(); // async ok -- saisie manuelle des coordonnées
      }
    });
  });

  $('place-name-ha-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addPlaceHaName(); }
  });

  // ── Logout ──────────────────────────────────────────────────────
  window.adminLogout = function () { Auth.logout(); };

  // ── Topbar user display ─────────────────────────────────────────
  var topbarName   = $('topbar-name');
  var topbarAvatar = $('topbar-avatar');
  if (topbarName)   topbarName.textContent   = me.name || me.phone;
  if (topbarAvatar) topbarAvatar.textContent = (me.name || me.phone).charAt(0).toUpperCase();

  // ── Initial section ─────────────────────────────────────────────
  showSection('dashboard');

})();
