/* ════════════════════════════════════════════
   notifications.js — Toast + Notification Panel
   ════════════════════════════════════════════ */

const Notifications = (() => {
  let items = [];
  let unreadCount = 0;
  let panelOpen = false;

  // ── Toast ──
  function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
      info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-text">${message}</span>
      <button class="toast-close" onclick="this.closest('.toast').remove()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>`;

    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 250);
    }, duration);
  }

  // ── Date group label helpers ──
  function _getTodayLabel() {
    const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'fr';
    return { fr: "Aujourd'hui", ar: 'اليوم', ha: 'Yau' }[lang] || "Aujourd'hui";
  }

  function _getDateGroup(daysAgo) {
    const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'fr';
    if (daysAgo === 0) return _getTodayLabel();
    if (daysAgo === 1) return { fr: 'Hier', ar: 'أمس', ha: 'Jiya' }[lang] || 'Hier';
    const labels = { fr: 'Cette semaine', ar: 'هذا الأسبوع', ha: 'Wannan mako' };
    return labels[lang] || 'Cette semaine';
  }

  // ── Push a notification to the panel ──
  function push({ type = 'info', icon = '🔔', title, msg, daysAgo = 0 }) {
    const id = 'notif_' + Date.now();
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    items.unshift({
      id, type, icon, title, msg, time: timeStr, read: false,
      dateGroup: _getDateGroup(daysAgo),
      _daysAgo: daysAgo,
    });
    unreadCount++;
    _updateBadge();
    _renderPanel();
  }

  function _updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function _renderPanel() {
    const list  = document.getElementById('notif-list');
    const empty = document.getElementById('notif-empty');
    if (!list) return;

    if (items.length === 0) {
      list.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    // Group notifications by dateGroup, preserving insertion order of groups
    const groupOrder = [];
    const grouped = {};
    items.forEach(n => {
      if (!grouped[n.dateGroup]) {
        grouped[n.dateGroup] = [];
        groupOrder.push(n.dateGroup);
      }
      grouped[n.dateGroup].push(n);
    });

    let html = '';
    groupOrder.forEach(label => {
      html += `<div class="notif-date-label">${label}</div>`;
      html += grouped[label].map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" onclick="Notifications.markRead('${n.id}')">
          <div class="notif-icon-wrap ${n.type}">${n.icon}</div>
          <div class="notif-body">
            <div class="notif-title">${n.title}</div>
            <div class="notif-msg">${n.msg}</div>
            <div class="notif-time">${n.time}</div>
          </div>
          ${n.read ? '' : '<div class="notif-unread-dot"></div>'}
        </div>`).join('');
    });

    list.innerHTML = html;
  }

  function markRead(id) {
    const item = items.find(n => n.id === id);
    if (item && !item.read) {
      item.read = true;
      unreadCount = Math.max(0, unreadCount - 1);
      _updateBadge();
      _renderPanel();
    }
  }

  function markAllRead() {
    items.forEach(n => { n.read = true; });
    unreadCount = 0;
    _updateBadge();
    _renderPanel();
  }

  function openPanel() {
    const panel    = document.getElementById('notif-panel');
    const backdrop = document.getElementById('notif-backdrop');
    if (!panel) return;
    panelOpen = true;
    panel.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('show'));
    _renderPanel();
  }

  function closePanel() {
    const panel    = document.getElementById('notif-panel');
    const backdrop = document.getElementById('notif-backdrop');
    if (!panel) return;
    panelOpen = false;
    panel.classList.remove('show');
    backdrop.classList.add('hidden');
    setTimeout(() => panel.classList.add('hidden'), 280);
  }

  function togglePanel() {
    panelOpen ? closePanel() : openPanel();
  }

  function init() {
    // Seed with mock notifications spanning multiple date groups
    const welcomeNotifs = [
      {
        type: 'info', icon: '👋', daysAgo: 0,
        title: I18n.t('notif.welcome.title'),
        msg:   I18n.t('notif.welcome.msg'),
      },
      {
        type: 'success', icon: '✅', daysAgo: 1,
        title: I18n.t('notif.driver.title') || 'Chauffeur assigné',
        msg:   I18n.t('notif.driver.msg')   || 'Votre chauffeur arrive dans 4 min.',
      },
      {
        type: 'warning', icon: '🕐', daysAgo: 2,
        title: I18n.t('notif.delay.title') || 'Légère attente',
        msg:   I18n.t('notif.delay.msg')   || 'Trafic dense sur votre itinéraire.',
      },
    ];
    welcomeNotifs.forEach(n => push(n));

    // Listeners
    const notifBtn   = document.getElementById('notif-btn');
    const clearBtn   = document.getElementById('clear-notifs-btn');
    const closeBtn   = document.getElementById('notif-close-btn');
    const backdrop   = document.getElementById('notif-backdrop');

    if (notifBtn)  notifBtn.addEventListener('click', togglePanel);
    if (clearBtn)  clearBtn.addEventListener('click', markAllRead);
    if (closeBtn)  closeBtn.addEventListener('click', closePanel);
    if (backdrop)  backdrop.addEventListener('click', closePanel);
  }

  return { init, toast, push, markRead, markAllRead, openPanel, closePanel, togglePanel };
})();

/* ── Global Modal helper ── */
const Modal = (() => {
  function show({ title, body, actions }) {
    const modal    = document.getElementById('modal');
    const box      = document.getElementById('modal-box');
    const backdrop = document.getElementById('modal-backdrop');
    if (!modal) return;

    box.innerHTML = `
      <div class="modal-handle"></div>
      <h2 class="modal-title">${title}</h2>
      ${body}
      <div class="modal-actions">${actions}</div>`;

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    backdrop.classList.add('modal-z');
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  function close() {
    const modal    = document.getElementById('modal');
    const backdrop = document.getElementById('modal-backdrop');
    if (!modal) return;
    modal.classList.remove('show');
    backdrop.classList.remove('hidden', 'modal-z');
    setTimeout(() => {
      modal.classList.add('hidden');
      backdrop.classList.add('hidden');
    }, 300);
  }

  function confirm({ title, body, confirmLabel, confirmClass = 'primary', cancelLabel, onConfirm, onCancel }) {
    const cancel = cancelLabel || I18n.t('modal.keep');
    show({
      title,
      body,
      actions: `
        <button class="modal-btn secondary" onclick="Modal.close();${onCancel ? 'Modal._onCancel()' : ''}">${cancel}</button>
        <button class="modal-btn ${confirmClass}" onclick="Modal._onConfirm()">${confirmLabel}</button>`,
    });
    Modal._onConfirm = () => { close(); if (onConfirm) onConfirm(); };
    Modal._onCancel  = () => { close(); if (onCancel)  onCancel(); };

    document.getElementById('modal-backdrop').onclick = close;
  }

  function showRequestConfirm(origin, destination, estimate, onConfirm, onCancel) {
    const lang = I18n.getLang();
    const labels = {
      fr: { from: 'Départ', to: 'Destination', dist: 'Distance', time: 'Durée', price: 'Prix estimé' },
      ar: { from: 'من', to: 'إلى', dist: 'مسافة', time: 'مدة', price: 'السعر التقديري' },
      ha: { from: 'من', to: 'لـ', dist: 'مسافة', time: 'وقت', price: 'السعر' },
    }[lang] || { from: 'Départ', to: 'Destination', dist: 'Distance', time: 'Durée', price: 'Prix' };

    show({
      title: I18n.t('modal.confirm.title'),
      body: `
        <div class="confirm-details">
          <div class="confirm-row"><span class="confirm-label">${labels.from}</span><span class="confirm-value">${origin}</span></div>
          <div class="confirm-row"><span class="confirm-label">${labels.to}</span><span class="confirm-value">${destination}</span></div>
          <div class="confirm-row"><span class="confirm-label">${labels.dist}</span><span class="confirm-value">${estimate.distance}</span></div>
          <div class="confirm-row"><span class="confirm-label">${labels.time}</span><span class="confirm-value">${estimate.time}</span></div>
          <div class="confirm-row"><span class="confirm-label">${labels.price}</span><span class="confirm-value" style="color:var(--primary);font-size:16px;">${estimate.price}</span></div>
        </div>`,
      actions: `
        <button class="modal-btn secondary" onclick="Modal._onCancel()">${I18n.t('modal.keep').replace('Garder', 'Annuler').replace('احتفاظ', 'إلغاء').replace('خلي', 'إلغاء')}</button>
        <button class="modal-btn primary" onclick="Modal._onConfirm()">${I18n.t('modal.confirm.btn')}</button>`,
    });
    Modal._onConfirm = () => { close(); if (onConfirm) onConfirm(); };
    Modal._onCancel  = () => { close(); if (onCancel)  onCancel(); };
    document.getElementById('modal-backdrop').onclick = () => { close(); if (onCancel) onCancel(); };
  }

  return { show, close, confirm, showRequestConfirm, _onConfirm: null, _onCancel: null };
})();
