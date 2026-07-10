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
    // navigation : elle garde "Lieux" actif dans la sidebar.
    const lnk = $('nav-' + (id === 'location-form' ? 'locations' : id));
    if (sec) sec.classList.add('active');
    if (lnk) lnk.classList.add('active');
    document.title = 'ChatIA Admin — ' + (id === 'location-form' ? 'Lieux' : id.charAt(0).toUpperCase() + id.slice(1));
    if (id === 'dashboard')  renderDashboard();
    if (id === 'users')      renderUsers();   // async, fire-and-forget
    if (id === 'requests')   renderRequests();
    if (id === 'settings')   renderSettings();
    if (id === 'locations')  renderLocations(); // async, fire-and-forget
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

  // ── LIEUX (POI) ───────────────────────────────────────────────────
  const _LOCATION_TYPE_LABELS = {
    quartier: 'Quartier', marche: 'Marché', hopital: 'Hôpital', mosquee: 'Mosquée',
    ecole: 'École', carrefour: 'Carrefour', station: 'Station', admin: 'Administration',
    hotel: 'Hôtel', autre: 'Autre',
  };

  let _locSearch  = '';
  let _allLocations = [];
  let _locMap    = null;
  let _locMarker = null;
  const _NKC_CENTER = [18.0735, -15.9582];

  function _initLocMap(lat, lng) {
    if (typeof L === 'undefined') return;
    const center = (typeof lat === 'number' && typeof lng === 'number') ? [lat, lng] : _NKC_CENTER;

    if (!_locMap) {
      _locMap = L.map('loc-map', { zoomControl: true }).setView(center, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '© OpenStreetMap',
      }).addTo(_locMap);
      _locMap.on('click', (e) => _setLocMarker(e.latlng.lat, e.latlng.lng));
    } else {
      _locMap.setView(center, _locMarker ? 15 : 14);
      setTimeout(() => _locMap.invalidateSize(), 150);
    }

    if (typeof lat === 'number' && typeof lng === 'number') {
      _setLocMarker(lat, lng, /*skipInputs*/ true);
    } else if (_locMarker) {
      _locMap.removeLayer(_locMarker);
      _locMarker = null;
    }
  }

  function _setLocMarker(lat, lng, skipInputs) {
    if (!_locMap) return;
    if (_locMarker) {
      _locMarker.setLatLng([lat, lng]);
    } else {
      _locMarker = L.marker([lat, lng], { draggable: true }).addTo(_locMap);
      _locMarker.on('dragend', () => {
        const p = _locMarker.getLatLng();
        $('loc-lat').value = p.lat.toFixed(8);
        $('loc-lng').value = p.lng.toFixed(8);
      });
    }
    if (!skipInputs) {
      $('loc-lat').value = lat.toFixed(8);
      $('loc-lng').value = lng.toFixed(8);
    }
  }

  async function fetchLocations() {
    try {
      const resp = await Auth.authFetch('/api/admin/locations');
      if (resp.ok) {
        const data = await resp.json();
        _allLocations = data.data || [];
        return;
      }
    } catch (_) {}
    _allLocations = [];
  }

  async function renderLocations() {
    await fetchLocations();
    const query = _locSearch.toLowerCase();
    const locations = query
      ? _allLocations.filter(l =>
          (l.name || '').toLowerCase().includes(query) ||
          (l.nameAr || '').includes(query) ||
          (l.quartier || '').toLowerCase().includes(query))
      : _allLocations;

    const tbody = $('locations-body');
    if (!tbody) return;

    if (locations.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Aucun lieu trouvé. Le backend est peut-être hors ligne.</td></tr>';
      return;
    }

    tbody.innerHTML = locations.map(l => {
      const disabled  = !l.is_active;
      const addedByAdmin = !!l.created_by;
      const addedLabel = addedByAdmin
        ? new Date(l.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
      return `
      <tr class="${disabled ? 'row-blocked' : ''}">
        <td>
          <div style="font-weight:700;color:var(--text)">${l.name || '—'}</div>
          <div style="font-size:11px;color:var(--text3)" dir="rtl">${l.nameAr || ''}</div>
        </td>
        <td><span class="badge">${_LOCATION_TYPE_LABELS[l.type] || l.type}</span></td>
        <td>${l.quartier || '—'}</td>
        <td style="font-family:monospace;font-size:11.5px;color:var(--text3)">${Number(l.lat).toFixed(5)}, ${Number(l.lng).toFixed(5)}</td>
        <td style="font-size:12px;color:var(--text3)">
          ${addedByAdmin ? addedLabel : '<span class="badge" style="font-size:10.5px">Catalogue</span>'}
        </td>
        <td>
          <span class="badge ${disabled ? 'refused' : 'accepted'}" style="font-size:11px">
            ${disabled ? '🔒 Désactivé' : '✓ Actif'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="icon-btn-sm" onclick='openLocationForm(${JSON.stringify(l)})' title="Modifier">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn-sm ${disabled ? 'success' : 'warning'}" onclick="toggleLocation(${l.id}, ${disabled})" title="${disabled ? 'Activer' : 'Désactiver'}">
              ${disabled
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'}
            </button>
            ${addedByAdmin ? `
            <button class="icon-btn-sm danger" onclick='deleteLocation(${l.id}, ${JSON.stringify(l.name || "")})' title="Supprimer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  window.openLocationForm = function (location) {
    $('loc-form-err').textContent = '';
    const isEdit = !!(location && location.id);
    $('location-form-title').textContent = isEdit ? 'Modifier le lieu' : 'Ajouter un lieu';
    $('loc-id').value       = isEdit ? location.id : '';
    $('loc-name').value     = isEdit ? location.name || '' : '';
    $('loc-name-ar').value  = isEdit ? location.nameAr || '' : '';
    $('loc-name-ha').value  = isEdit ? location.nameHa || '' : '';
    $('loc-type').value     = isEdit ? location.type || 'autre' : 'autre';
    $('loc-lat').value      = isEdit ? location.lat : '';
    $('loc-lng').value      = isEdit ? location.lng : '';
    $('loc-map-search').value = '';
    $('loc-map-search-results').classList.add('hidden');

    goSection('location-form');
    setTimeout(() => {
      _initLocMap(
        isEdit ? Number(location.lat) : undefined,
        isEdit ? Number(location.lng) : undefined
      );
    }, 60);
  };

  window.closeLocationForm = function () {
    goSection('locations');
  };

  // ── Recherche d'adresse sur la carte du formulaire (Nominatim, gratuit) ──
  let _locSearchTimer = null;
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

  function _wireLocMapSearch() {
    const input = $('loc-map-search');
    const box   = $('loc-map-search-results');
    if (!input || !box) return;

    input.addEventListener('input', () => {
      clearTimeout(_locSearchTimer);
      const q = input.value.trim();
      if (q.length < 3) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      _locSearchTimer = setTimeout(async () => {
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
      _setLocMarker(lat, lng);
      if (_locMap) _locMap.setView([lat, lng], 16);
      box.classList.add('hidden');
    });

    input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 220));
  }

  function _escLoc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.saveLocationForm = async function () {
    const errEl = $('loc-form-err');
    errEl.textContent = '';

    const id       = $('loc-id').value;
    const name     = $('loc-name').value.trim();
    const lat      = parseFloat($('loc-lat').value);
    const lng      = parseFloat($('loc-lng').value);

    if (!name) { errEl.textContent = 'Le nom (français) est obligatoire.'; return; }
    if (isNaN(lat) || isNaN(lng)) { errEl.textContent = 'Placez le lieu sur la carte (ou saisissez latitude/longitude).'; return; }

    const payload = {
      name, lat, lng,
      name_ar: $('loc-name-ar').value.trim(),
      name_ha: $('loc-name-ha').value.trim(),
      type:    $('loc-type').value,
    };

    try {
      const url    = id ? `/api/admin/locations/${id}` : '/api/admin/locations';
      const method = id ? 'PUT' : 'POST';
      const resp   = await Auth.authFetch(url, { method, body: JSON.stringify(payload) });
      const data   = await resp.json();
      if (!resp.ok) { errEl.textContent = data.error || 'Erreur lors de l\'enregistrement.'; return; }
      toast(id ? 'Lieu mis à jour.' : 'Lieu créé.', 'success');
      closeLocationForm();
      renderLocations();
    } catch (_) {
      errEl.textContent = 'Backend hors ligne — impossible d\'enregistrer.';
    }
  };

  window.toggleLocation = function (id, currentlyDisabled) {
    adminConfirm(
      currentlyDisabled ? '📍' : '🔒',
      currentlyDisabled ? 'Activer le lieu' : 'Désactiver le lieu',
      currentlyDisabled
        ? 'Le chat pourra à nouveau proposer ce lieu.'
        : 'Le chat ne proposera plus ce lieu (il reste dans l\'historique des courses passées).',
      currentlyDisabled ? 'Activer' : 'Désactiver',
      currentlyDisabled ? 'warning-btn' : '',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/locations/${id}/toggle`, { method: 'PUT' });
          if (resp.ok) { toast(currentlyDisabled ? 'Lieu activé.' : 'Lieu désactivé.', 'success'); renderLocations(); return; }
        } catch (_) {}
        toast('Backend hors ligne — action impossible.', 'danger');
      });
  };

  // Réservé aux lieux ajoutés par un admin (created_by non nul) -- le
  // catalogue de base n'est jamais supprimable, seulement désactivable.
  window.deleteLocation = function (id, name) {
    adminConfirm(
      '🗑️',
      'Supprimer le lieu',
      `"${name}" sera définitivement supprimé et ne sera plus proposé par le chat. Cette action est irréversible.`,
      'Supprimer',
      'warning-btn',
      async () => {
        try {
          const resp = await Auth.authFetch(`/api/admin/locations/${id}`, { method: 'DELETE' });
          if (resp.ok) { toast('Lieu supprimé.', 'success'); renderLocations(); return; }
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
    };
    $('sub-panel-title').textContent = titles[category] || 'Paramètres';
    $('sub-panel-body').innerHTML = _buildPanelBody(category);

    // Populate with stored values
    renderSettings();
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
  bindSearch('location-search', function (v) { _locSearch = v; renderLocations(); /* async ok */ });
  _wireLocMapSearch();

  // Saisie manuelle lat/lng -> déplace aussi le marqueur sur la carte.
  ['loc-lat', 'loc-lng'].forEach(id => {
    $(id)?.addEventListener('change', () => {
      const lat = parseFloat($('loc-lat').value);
      const lng = parseFloat($('loc-lng').value);
      if (!isNaN(lat) && !isNaN(lng) && _locMap) {
        _setLocMarker(lat, lng, /*skipInputs*/ true);
        _locMap.setView([lat, lng], 15);
      }
    });
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
