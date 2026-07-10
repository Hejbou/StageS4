/* ════════════════════════════════════════════
   transport.js — Request state machine + UI rendering
   ════════════════════════════════════════════ */

const Transport = (() => {
  // In-memory request list (synced to localStorage via MockData)
  let requests = MockData.getRequests();
  let activeRequestId = null;

  const STATUS = { PENDING: 'pending', ACCEPTED: 'accepted', REFUSED: 'refused', CANCELLED: 'cancelled' };

  // ── Create a new request ──
  async function createRequest(origin, destination, phone) {
    let id       = MockData.generateRequestId();
    let estimate = MockData.getEstimate(origin, destination);

    // Try to save to backend
    try {
      const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'fr';
      const authPhone = (typeof Auth !== 'undefined' && Auth.getUser()) ? Auth.getUser().phone : phone;
      const fetchFn   = (typeof Auth !== 'undefined' && Auth.authFetch) ? Auth.authFetch.bind(Auth) : fetch;

      const resp = await fetchFn('/api/trips/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          origin, destination, lang,
          client_phone: authPhone || phone || null,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.data) {
          const t = data.data;
          id = t.id;
          estimate = {
            distance: t.distance_km  ? parseFloat(t.distance_km).toFixed(1) + ' km' : estimate.distance,
            time:     t.duration_min ? t.duration_min + ' min'                       : estimate.time,
            price:    t.estimated_price ? Math.round(t.estimated_price) + ' MRU'     : estimate.price,
          };
        }
      }
    } catch (_) { /* backend offline — use mock estimate */ }

    const now = new Date().toISOString();
    const request = {
      id,
      origin,
      destination,
      phone: phone || null,
      status: STATUS.PENDING,
      driver: null,
      estimate,
      createdAt: now,
      updatedAt: now,
    };

    requests.unshift(request);
    activeRequestId = id;
    _persist();
    _renderRequests();
    _updateActiveBar();

    // Update nav badge
    _updateNavBadge();

    // Simulate backend searching for a driver
    _searchDriver(id);

    return request;
  }

  async function _searchDriver(id) {
    const result = await MockData.simulateDriverSearch();
    const req = _findById(id);
    if (!req || req.status === STATUS.CANCELLED) return;

    if (result.found) {
      req.status    = STATUS.ACCEPTED;
      req.driver    = result.driver;
      req.updatedAt = new Date().toISOString();
      _persist();
      _renderRequests();
      _updateActiveBar();
      const lang = I18n.getLang();
      const d = result.driver;
      Notifications.push({
        type: 'success',
        icon: '🚗',
        title: { fr: 'Chauffeur trouvé !', ar: 'تم العثور على سائق !', ha: 'لقينا سايق !' }[lang],
        msg:  { fr: `${d.name} — ${d.car} (${d.plate}) · ETA ${d.eta}`,
                ar: `${d.name} — ${d.car} (${d.plate}) · ${d.eta}`,
                ha: `${d.name} — ${d.car} (${d.plate}) · ${d.eta}` }[lang],
      });
      Notifications.toast(I18n.t('toast.req.accepted'), 'success');
      const driverMsg = {
        fr: `Chauffeur trouvé ! ${d.name} arrive dans ${d.eta} — ${d.car}, plaque ${d.plate}. ★ ${d.rating}.`,
        ar: `تم العثور على سائق ! ${d.name} يصل خلال ${d.eta} — ${d.car}، لوحة ${d.plate}. تقييم ⭐ ${d.rating}.`,
        ha: `لقينا سايق ! ${d.name} جاي في ${d.eta} — ${d.car}، لوحة ${d.plate}. تقييم ⭐ ${d.rating}.`,
      }[lang] || `${d.name} en route (${d.eta})`;
      Chat.addSystemMessage(driverMsg);
    } else {
      req.status = STATUS.REFUSED;
      req.updatedAt = new Date().toISOString();
      activeRequestId = null;
      _persist();
      _renderRequests();
      _updateActiveBar();
      Notifications.push({
        type: 'danger',
        icon: '❌',
        title: { fr: 'Aucun chauffeur', ar: 'لا يوجد سائق', ha: 'ما كاين سايق' }[I18n.getLang()],
        msg:  { fr: 'Aucun chauffeur disponible. Réessayez.', ar: 'لا يوجد سائق متاح. حاول مرة أخرى.', ha: 'ما كاين سايق دابا. ارجع عاود.' }[I18n.getLang()],
      });
      Notifications.toast(I18n.t('toast.req.refused'), 'error');
      Chat.addSystemMessage(I18n.t('ai.no.driver'));
    }
    _updateNavBadge();
  }

  // ── Cancel a request ──
  function cancelRequest(id) {
    const req = _findById(id || activeRequestId);
    if (!req) return;
    req.status = STATUS.CANCELLED;
    req.updatedAt = new Date().toISOString();
    if (activeRequestId === req.id) activeRequestId = null;
    _persist();
    _renderRequests();
    _updateActiveBar();
    _updateNavBadge();
    Notifications.toast(I18n.t('toast.req.cancelled'), 'info');
    Chat.addSystemMessage(I18n.t('ai.cancelled'));

    // Sync cancellation to backend (fire and forget)
    try {
      const fetchFn = (typeof Auth !== 'undefined' && Auth.authFetch) ? Auth.authFetch.bind(Auth) : fetch;
      fetchFn('/api/trips/' + req.id + '/cancel', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: 'Annulé par l\'utilisateur' }),
      }).catch(() => {});
    } catch (_) {}
  }

  // ── Getters ──
  function getActive() {
    if (!activeRequestId) return null;
    return _findById(activeRequestId);
  }

  function getAll() { return requests; }

  function _findById(id) {
    return requests.find(r => r.id === id) || null;
  }

  function _persist() {
    MockData.saveRequests(requests);
  }

  // ── Update top bar ──
  function _updateActiveBar() {
    const bar     = document.getElementById('active-request-bar');
    const text    = document.getElementById('active-req-text');
    const dot     = document.getElementById('req-dot');
    if (!bar) return;

    const active = getActive();
    if (!active) {
      // Check if there's a pending one even without activeRequestId
      const pending = requests.find(r => r.status === STATUS.PENDING);
      if (pending) { activeRequestId = pending.id; _updateActiveBar(); return; }
      bar.classList.add('hidden');
      return;
    }

    bar.classList.remove('hidden');
    dot.className = 'req-status-dot ' + active.status;

    const labels = {
      pending:   I18n.t('req.bar.pending'),
      accepted:  I18n.t('req.bar.accepted'),
      refused:   I18n.t('req.bar.refused'),
      cancelled: '',
    };
    text.textContent = labels[active.status] || '';

    if (active.status === STATUS.CANCELLED || active.status === STATUS.REFUSED) {
      setTimeout(() => bar.classList.add('hidden'), 3000);
    }
  }

  function _updateNavBadge() {
    const badge = document.getElementById('nav-req-badge');
    const count = requests.filter(r => r.status === STATUS.PENDING || r.status === STATUS.ACCEPTED).length;
    if (badge) {
      badge.textContent = count;
      count > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
    }
  }

  // ── Render Requests View ──
  function _renderRequests() {
    const container = document.getElementById('requests-container');
    if (!container) return;

    if (requests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="200" height="130" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 8px 24px rgba(14,165,233,.12))">
            <!-- Road -->
            <rect x="10" y="100" width="180" height="5" rx="2.5" fill="#F1F5F9"/>
            <rect x="76" y="101.5" width="10" height="2" rx="1" fill="#CBD5E1"/>
            <rect x="96" y="101.5" width="10" height="2" rx="1" fill="#CBD5E1"/>
            <rect x="116" y="101.5" width="10" height="2" rx="1" fill="#CBD5E1"/>
            <!-- Car shadow -->
            <ellipse cx="97" cy="108" rx="46" ry="6" fill="rgba(17,24,39,.06)"/>
            <!-- Car body -->
            <rect x="44" y="64" width="106" height="38" rx="10" fill="#1E293B"/>
            <!-- Roof / cabin -->
            <path d="M62 64 C66 45 132 45 138 64" fill="#0F172A" stroke="#0F172A" stroke-width="1"/>
            <!-- Windows -->
            <rect x="70" y="49" width="22" height="16" rx="4" fill="#0EA5E9" opacity="0.72"/>
            <rect x="100" y="49" width="22" height="16" rx="4" fill="#0EA5E9" opacity="0.72"/>
            <!-- Window glare -->
            <rect x="72" y="51" width="7" height="5" rx="2" fill="white" opacity="0.32"/>
            <rect x="102" y="51" width="7" height="5" rx="2" fill="white" opacity="0.32"/>
            <!-- Door line -->
            <line x1="95" y1="64" x2="95" y2="100" stroke="#111827" stroke-width="1" opacity="0.4"/>
            <!-- Front light -->
            <rect x="146" y="73" width="8" height="5" rx="2.5" fill="#FDE68A"/>
            <!-- Rear light -->
            <rect x="46" y="73" width="6" height="5" rx="2.5" fill="#FCA5A5"/>
            <!-- Wheels -->
            <circle cx="72" cy="102" r="12" fill="#0F172A"/>
            <circle cx="72" cy="102" r="6" fill="#334155"/>
            <circle cx="72" cy="102" r="2.5" fill="#64748B"/>
            <circle cx="124" cy="102" r="12" fill="#0F172A"/>
            <circle cx="124" cy="102" r="6" fill="#334155"/>
            <circle cx="124" cy="102" r="2.5" fill="#64748B"/>
            <!-- Motion lines -->
            <rect x="10" y="76" width="24" height="3" rx="1.5" fill="#E2E8F0"/>
            <rect x="6" y="84" width="17" height="3" rx="1.5" fill="#E5E7EB"/>
            <rect x="11" y="92" width="11" height="3" rx="1.5" fill="#F3F4F6"/>
            <!-- AI star sparkle -->
            <path d="M162 32 L164.5 24 L167 32 L175 34.5 L167 37 L164.5 45 L162 37 L154 34.5 Z" fill="#F59E0B" opacity="0.90"/>
            <!-- AI dots -->
            <circle cx="148" cy="22" r="4" fill="#0EA5E9" opacity="0.65"/>
            <circle cx="174" cy="20" r="2.5" fill="#0EA5E9" opacity="0.38"/>
            <circle cx="156" cy="14" r="2" fill="#F59E0B" opacity="0.55"/>
          </svg>
          <h3>${I18n.t('req.none')}</h3>
          <p>${I18n.t('req.none.sub')}</p>
          <button class="empty-state-btn" onclick="App.navigateTo('chat')">${I18n.t('req.new')}</button>
        </div>`;
      return;
    }

    container.innerHTML = requests.map(req => _renderCard(req)).join('');

    // Attach cancel listeners
    container.querySelectorAll('[data-cancel-req]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cancelReq;
        Modal.confirm({
          title: I18n.t('modal.cancel.title'),
          body: `<p style="color:var(--text-2);font-size:14px;">${I18n.t('modal.cancel.sub')}</p>`,
          confirmLabel: I18n.t('modal.cancel.btn'),
          confirmClass: 'danger',
          onConfirm: () => cancelRequest(id),
        });
      });
    });
  }

  function _renderCard(req) {
    const statusLabel = I18n.t('req.status.' + req.status);
    const statusClass = req.status;
    const time = _formatDate(req.createdAt);

    const driverHtml = req.driver ? `
      <div class="driver-card">
        <div class="driver-avatar">${req.driver.avatar}</div>
        <div class="driver-info">
          <div class="driver-name">${req.driver.name}</div>
          <div class="driver-plate" style="display:flex;align-items:center;gap:5px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17H5a3 3 0 0 1-3-3l2-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2l2 8a3 3 0 0 1-3 3z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
            ${req.driver.car} · ${req.driver.plate}
          </div>
          <div class="driver-rating" style="display:flex;align-items:center;gap:5px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${req.driver.rating} · ETA: ${req.driver.eta}
          </div>
        </div>
        <button class="driver-call-btn" onclick="Notifications.toast('Appel simulé...','info')" aria-label="Appeler">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.4 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
      </div>` : '';

    const timeline = _renderTimeline(req.status);

    const canCancel = req.status === STATUS.PENDING;
    const actionsHtml = canCancel ? `
      <div class="req-actions">
        <button class="req-action-btn cancel" data-cancel-req="${req.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
          ${I18n.t('req.cancel')}
        </button>
        <button class="req-action-btn chat" onclick="App.navigateTo('chat')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
          </svg>
          Chat
        </button>
      </div>` : '';

    return `
    <div class="request-card">
      <div class="req-card-header">
        <div>
          <div class="req-card-id">${req.id}</div>
          <div class="req-card-time">${time}</div>
        </div>
        <span class="status-badge ${statusClass}">${_statusIcon(req.status)} ${statusLabel}</span>
      </div>
      <div class="req-route">
        <div class="req-route-item">
          <div class="req-route-dot origin"></div>
          <span>${req.origin}</span>
        </div>
        <div class="req-route-line" style="margin-left:4px;"></div>
        <div class="req-route-item">
          <div class="req-route-dot dest"></div>
          <span>${req.destination}</span>
        </div>
      </div>
      ${req.phone ? `<div class="req-client-phone">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
        +222 ${req.phone.slice(0,2)} ${req.phone.slice(2,4)} ${req.phone.slice(4,6)} ${req.phone.slice(6)}
      </div>` : ''}
      <div style="display:flex;gap:14px;font-size:12px;color:var(--text-2);margin-bottom:4px;align-items:center;">
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
          ${req.estimate.distance}
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${req.estimate.time}
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          ${req.estimate.price}
        </span>
      </div>
      ${timeline}
      ${driverHtml}
      ${actionsHtml}
    </div>`;
  }

  function _renderTimeline(status) {
    const steps = [
      { key: 'created',   label: I18n.t('timeline.created') },
      { key: 'searching', label: I18n.t('timeline.searching') },
      { key: 'assigned',  label: I18n.t('timeline.assigned') },
      { key: 'done',      label: I18n.t('timeline.done') },
    ];

    const progressMap = {
      pending:   1, // 0→1
      accepted:  3, // 0→3
      refused:   1,
      cancelled: 0,
    };
    const doneCount = progressMap[status] ?? 0;

    const dotsHtml = steps.map((step, i) => {
      let cls = '';
      if (i < doneCount)  cls = 'done';
      if (i === doneCount && status === 'pending') cls = 'active';
      const tick = cls === 'done' ? '✓' : (i + 1);
      return `
        <div class="timeline-step">
          <div class="timeline-dot ${cls}">${tick}</div>
          <div class="timeline-label">${step.label}</div>
        </div>`;
    }).join('');

    const pct = (doneCount / (steps.length - 1)) * 100;

    return `
    <div class="status-timeline">
      <div class="timeline-progress" style="width:calc(${pct}% - 40px + ${pct === 0 ? 0 : 20}px)"></div>
      ${dotsHtml}
    </div>`;
  }

  function _statusIcon(status) {
    const icons = {
      pending:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      accepted:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      refused:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
      cancelled: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
    };
    return icons[status] || '';
  }

  function _formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
           ' · ' + d.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }

  // Public init — load and render
  function init() {
    requests = MockData.getRequests();
    // Find any still-pending request
    const pending = requests.find(r => r.status === STATUS.PENDING);
    if (pending) activeRequestId = pending.id;
    _renderRequests();
    _updateActiveBar();
    _updateNavBadge();
  }

  return {
    init,
    createRequest,
    cancelRequest,
    getActive,
    getAll,
    renderRequests: _renderRequests,
  };
})();
