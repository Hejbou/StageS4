/* ════════════════════════════════════════════
   chat.js — ONE AI Engine (Chat + Call)
   • Auto-detects language from user input
   • Replies in the customer's detected language
   • Chat mode: text only, no auto-TTS
   • Call mode: voice only, full TTS with onEnd loop
   State machine:
     IDLE → AWAITING_ORIGIN → AWAITING_DEST
          → AWAITING_CONFIRM → [request created]
     IDLE → AWAITING_PHONE_CANCEL → AWAITING_CANCEL_CONFIRM
          → [cancelled]
   ════════════════════════════════════════════ */

const Chat = (() => {

  // ── State machine ───────────────────────────────────────────────
  const STATE = {
    IDLE:                  'IDLE',
    AWAITING_ORIGIN:       'AWAITING_ORIGIN',
    AWAITING_DEST:         'AWAITING_DEST',
    AWAITING_PHONE:        'AWAITING_PHONE',
    AWAITING_CONFIRM:      'AWAITING_CONFIRM',
    AWAITING_MODIFY_CHOICE:'AWAITING_MODIFY_CHOICE',
    AWAITING_PHONE_CANCEL: 'AWAITING_PHONE_CANCEL',
    AWAITING_CANCEL_CONF:  'AWAITING_CANCEL_CONF',
    AWAITING_TRIP_ID:      'AWAITING_TRIP_ID',
  };

  let state            = STATE.IDLE;
  let pendingOrigin    = null;
  let pendingDest      = null;
  let pendingEstimate  = null;
  let pendingPhone     = null;   // client phone (collected before price confirmation)
  let pendingCancel    = null;   // request found by phone, awaiting cancel confirm
  let pendingGeoData   = null;   // données Maps résolues (origin/destination avec lat/lng)
  let _modifyingPoint  = null;   // 'origin' | 'dest' | null — used in modify flow
  let _originRetries   = 0;      // retry counter for origin validation
  let _destRetries     = 0;      // retry counter for destination validation
  let messages       = [];
  let typingTimer    = null;
  let _currentMode   = 'chat'; // 'chat' | 'call'
  let _onSpokenCb    = null;   // callback for call mode (fires after AI speaks)

  // ── Translation helper: use detected lang, not UI lang ──────────
  function _t(key, lang) {
    const src = {
      fr: window.LANG_FR || {},
      ar: window.LANG_AR || {},
      ha: window.LANG_HA || {},
    };
    const d = src[lang] || {};
    const fb = src.fr || {};
    return d[key] !== undefined ? d[key] : (fb[key] !== undefined ? fb[key] : key);
  }

  // Interpolate {placeholders} in a string
  function _fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);
  }

  // ── Intent Patterns (all 3 languages) ──────────────────────────
  // Priority order matters: most specific first to avoid false matches.
  // CANCEL_TRIP and STATUS must come BEFORE REQUEST_TRANSPORT because
  // "Annuler mon trajet" contains "trajet" (in REQUEST_TRANSPORT)
  // and Arabic cancel/status phrases contain "طلب" (in REQUEST_TRANSPORT).
  const INTENTS = {
    CANCEL_TRIP: {
      fr: /\b(annuler (mon|ma|le|la)? ?(trajet|course|demande|voyage|trip)|supprimer (ma|mon)? ?(course|trajet|demande))\b/i,
      ar: /(إلغاء (الطلب|الرحلة|الحجز)|ألغِ الطلب|إلغاء طلبي|أريد إلغاء|إلغاء طلب)/,
      ha: /(إلغاء الطلب|إلغاء الكار|بغيت تلغي|إلغاء طلبي)/,
    },
    STATUS: {
      fr: /\b(statut|état|où en est|suivi|tracking|voir mon statut|ma course|mon trajet en cours)\b/i,
      ar: /(حالة الطلب|الحالة|وضع الطلب|متابعة|حالة طلبي|ما حالة|أين السائق)/,
      ha: /(حالة الطلب|شحال الطلب|سايق|فين السايق|شحال الطلب ديالي)/,
    },
    GREET: {
      fr: /\b(bonjour|salut|hello|bonsoir|coucou|salam|ça va)\b/i,
      ar: /(مرحب|أهلاً|أهل|سلام|صباح|مساء|هلا)/,
      ha: /(أهلاً بيك|واخا|لباس|مرحب|هلا)/,
    },
    CONFIRM: {
      fr: /\b(oui|confirmer|confirme|ok|d'accord|accepter|yes|c'est bon|parfait|allons|valider|valide)\b/i,
      ar: /(نعم|تأكيد|موافق|صحيح|تمام|طيب|أكد|وافق|ايه)/,
      ha: /(نعم|واخا|صح|تمام|طيب|أكد|وافق)/,
    },
    CANCEL: {
      fr: /\b(non|stop|arrêter|refus|quitter|pas|rien)\b/i,
      ar: /(لا|وقف|توقف|ما أريد)/,
      ha: /(لا|وقف|ما|بلا)/,
    },
    MODIFY: {
      fr: /\b(modifier|modifie|changer|corriger|éditer|changer le point|modifier le point)\b/i,
      ar: /(تعديل|تغيير|تصحيح|عدل|غير الموقع)/,
      ha: /(تعديل|تغيير|تبديل|عدل|بدل)/,
    },
    REQUEST_TRANSPORT: {
      fr: /\b(transport|taxi|voiture|aller|emmène|conduire|partir|réserver|commande|besoin|veux|cherche|prendre|pars|depuis|de .+ (à|vers|pour))\b/i,
      ar: /(سيارة|تاكسي|أريد سيارة|أحتاج سيارة|نقل|موصلة|توصيل|أوصلني|خذني|أريد الذهاب|انطلاقاً)/,
      ha: /(كار|بغيت كار|نقل|سيارة|توصيلة|خذني|وصلني)/,
    },
    HELP: {
      fr: /\b(aide|help|comment|quoi|que peux|fonctionner|utiliser|faire)\b/i,
      ar: /(مساعدة|كيف|ماذا|ممكن|ما هو)/,
      ha: /(مساعدة|كيفاش|شنو|نقدر)/,
    },
    HISTORY: {
      fr: /\b(historique|passé|dernier|précédent|conversation)\b/i,
      ar: /(سجل|تاريخ|سابق|محادثة)/,
      ha: /(سجل|سابق|محادثة)/,
    },
    MAP: {
      fr: /\b(carte|maps?|itinéraire|plan|chemin|navigation|gps|localisation|trajet sur la carte|voir la carte)\b/i,
      ar: /(خريطة|خارطة|مسار|اتجاه|GPS|جي بي إس|خريطة المسار)/,
      ha: /(كارتة|خريطة|مسار|طريق)/,
    },
  };

  function _detectIntent(text) {
    const lang = LangDetect.detect(text);
    // Try current language first, then all others
    const order = [lang, 'fr', 'ar', 'ha'];
    for (const [intent, patterns] of Object.entries(INTENTS)) {
      for (const l of order) {
        if (patterns[l] && patterns[l].test(text)) return intent;
      }
    }
    return 'UNKNOWN';
  }

  // ── Rendering helpers ───────────────────────────────────────────
  function _nowTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function _scrollToBottom() {
    const wrap = document.querySelector('.chat-wrapper');
    if (wrap) setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 60);
  }

  function _formatText(text) {
    return text.replace(/\n/g, '<br>').replace(/•/g, '&bull;');
  }

  function _showTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.classList.remove('hidden');
    _scrollToBottom();
  }

  function _hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.classList.add('hidden');
  }

  const _BOT_AVATAR_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 3c-3.31 0-6 2.69-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.31-2.69-6-6-6zm0 8.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z" fill="#fff"/>
  </svg>`;

  function _renderMessage({ role, text, time, cardHtml, isVoice }) {
    const listEl = document.getElementById('messages');
    if (!listEl) return;

    const isAI = role === 'ai';
    const voiceHtml = isVoice
      ? `<div class="voice-indicator">${[1,2,3,4,5].map(()=>'<div class="voice-bar"></div>').join('')}</div>`
      : '';

    const el = document.createElement('div');
    el.className = `message ${role}`;
    el.innerHTML = `
      ${isAI ? `<div class="msg-avatar">${_BOT_AVATAR_SVG}</div>` : ''}
      <div class="msg-content">
        ${text ? `<div class="msg-bubble ${isVoice ? 'voice-msg' : ''}">${voiceHtml}${_formatText(text)}</div>` : ''}
        ${cardHtml || ''}
        <span class="msg-time">${time || _nowTime()}</span>
      </div>`;

    listEl.appendChild(el);
    _scrollToBottom();
    return el;
  }

  // ── AI reply: text in chat, TTS only in call mode ───────────────
  function _aiReply(text, lang, delay = 850, cardHtml = null) {
    _showTyping();
    return new Promise(resolve => {
      typingTimer = setTimeout(() => {
        _hideTyping();
        const msg = { role: 'ai', text, time: _nowTime(), cardHtml };
        messages.push(msg);
        _renderMessage(msg);

        // Call mode → speak aloud, then fire callback
        if (_currentMode === 'call') {
          Voice.speak(text, lang, () => {
            if (_onSpokenCb) { const cb = _onSpokenCb; _onSpokenCb = null; cb(); }
            resolve();
          });
        } else {
          // Chat mode → no automatic TTS
          resolve();
        }
      }, delay);
    });
  }

  // ── Public: system message (from transport.js callbacks) ────────
  function addSystemMessage(text) {
    clearTimeout(typingTimer);
    _hideTyping();
    const msg = { role: 'ai', text, time: _nowTime() };
    messages.push(msg);
    _renderMessage(msg);
    // Speak in call mode
    if (_currentMode === 'call') {
      Voice.speak(text, LangDetect.detect(text) || I18n.getLang());
    }
  }

  // For call mode: add user message visually from call.js
  function addUserMessage(text) {
    const msg = { role: 'user', text, time: _nowTime(), isVoice: true };
    messages.push(msg);
    _renderMessage(msg);
  }

  // ── Inline transport card inside chat bubble ────────────────────
  function _buildTransportCard(origin, dest, estimate, lang, showMap = false, phone = null) {
    const labels = {
      fr: { title: 'Votre trajet', from: 'Départ', to: 'Arrivée', price: 'Prix', confirm: 'Confirmer', cancel: 'Annuler', client: 'Client' },
      ar: { title: 'رحلتك', from: 'الانطلاق', to: 'الوجهة', price: 'السعر', confirm: 'تأكيد', cancel: 'لا', client: 'العميل' },
      ha: { title: 'الرحلة ديالك', from: 'الانطلاق', to: 'الوصول', price: 'الثمن', confirm: 'واخا نعم', cancel: 'لا', client: 'العميل' },
    }[lang] || { title: 'Votre trajet', from: 'Départ', to: 'Arrivée', price: 'Prix', confirm: 'Confirmer', cancel: 'Annuler', client: 'Client' };

    return `
    <div class="msg-transport-card">
      <div class="card-header-row">
        <div class="card-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17H5a3 3 0 0 1-3-3l2-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2l2 8a3 3 0 0 1-3 3z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
        </div>
        <span class="card-title-text">${labels.title}</span>
      </div>
      <div class="msg-card-route">
        <div class="msg-card-row">
          <div class="route-dot origin-dot"></div>
          <div class="route-info">
            <span class="route-label">${labels.from}</span>
            <span class="route-place">${origin}</span>
          </div>
        </div>
        <div class="route-connector">
          <div class="connector-line"></div>
        </div>
        <div class="msg-card-row">
          <div class="route-dot dest-dot"></div>
          <div class="route-info">
            <span class="route-label">${labels.to}</span>
            <span class="route-place">${dest}</span>
          </div>
        </div>
      </div>
      ${showMap ? '<div class="route-map-wrap"><div id="route-map" class="route-map-container"></div></div>' : ''}
      ${phone ? `<div class="card-client-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
        ${labels.client} : +222 ${phone.slice(0,2)} ${phone.slice(2,4)} ${phone.slice(4,6)} ${phone.slice(6)}
      </div>` : ''}
      ${estimate.distance ? `<div class="card-meta-row">
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
          ${estimate.distance}
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${estimate.time}
        </span>
      </div>` : ''}
      <div class="card-price-row">
        <span class="card-price-label">${labels.price}</span>
        <span class="card-price-value">${estimate.price}</span>
      </div>
      <div class="card-confirm-btns">
        <button class="card-btn cancel" id="inline-cancel-btn">${labels.cancel}</button>
        <button class="card-btn confirm" id="inline-confirm-btn">${labels.confirm}</button>
      </div>
    </div>`;
  }

  // ── Cancel confirmation card ────────────────────────────────────
  function _buildCancelCard(active, lang) {
    const L = {
      fr: { title: 'Course à annuler', from: 'Départ', to: 'Arrivée', price: 'Prix estimé', status: 'Statut',
            yes: 'Oui, annuler', no: 'Non, garder',
            statusLabel: { pending: 'En attente', accepted: 'Assigné', refused: 'Refusé', cancelled: 'Annulé' } },
      ar: { title: 'إلغاء الرحلة', from: 'الانطلاق', to: 'الوجهة', price: 'السعر المقدر', status: 'الحالة',
            yes: 'نعم، إلغاء', no: 'لا، احتفظ',
            statusLabel: { pending: 'قيد الانتظار', accepted: 'مُعيَّن', refused: 'مرفوض', cancelled: 'ملغى' } },
      ha: { title: 'إلغاء الطلب', from: 'الانطلاق', to: 'الوصول', price: 'الثمن المقدر', status: 'الحالة',
            yes: 'ايه، إلغاء', no: 'لا، احتفظ',
            statusLabel: { pending: 'في الانتظار', accepted: 'معيَّن', refused: 'مرفوض', cancelled: 'ملغى' } },
    }[lang] || { title: 'Course à annuler', from: 'Départ', to: 'Arrivée', price: 'Prix estimé', status: 'Statut',
                  yes: 'Oui, annuler', no: 'Non, garder',
                  statusLabel: { pending: 'En attente', accepted: 'Assigné', refused: 'Refusé', cancelled: 'Annulé' } };
    const price = active.estimatedPrice || active.price || '—';
    const statusLbl = L.statusLabel[active.status] || active.status;
    return `
    <div class="msg-transport-card cancel-card">
      <div class="card-header-row">
        <div class="card-icon-wrap" style="background:linear-gradient(135deg,#DC2626,#EF4444)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
        </div>
        <span class="card-title-text">${L.title}</span>
      </div>
      <div class="msg-card-route">
        <div class="msg-card-row">
          <div class="route-dot origin-dot"></div>
          <div class="route-info"><span class="route-label">${L.from}</span><span class="route-place">${active.origin}</span></div>
        </div>
        <div class="route-connector"><div class="connector-line"></div></div>
        <div class="msg-card-row">
          <div class="route-dot dest-dot"></div>
          <div class="route-info"><span class="route-label">${L.to}</span><span class="route-place">${active.destination}</span></div>
        </div>
      </div>
      <div class="card-price-row">
        <span class="card-price-label">${L.price}</span>
        <span class="card-price-value">${price}</span>
      </div>
      <div class="card-status-badge status-${active.status}">
        <span>${L.status} : ${statusLbl}</span>
      </div>
      <div class="card-confirm-btns cancel-confirm-btns">
        <button class="card-btn cancel" data-action="cancel-no">${L.no}</button>
        <button class="card-btn confirm danger-btn" data-action="cancel-yes">${L.yes}</button>
      </div>
    </div>`;
  }

  // ── Status info card (read-only) ────────────────────────────────
  function _buildStatusCard(active, lang) {
    const L = {
      fr: { title: 'Votre course', from: 'Départ', to: 'Arrivée', price: 'Prix estimé', status: 'Statut',
            viewBtn: 'Voir mes demandes',
            statusLabel: { pending: 'En attente de chauffeur', accepted: 'Chauffeur assigné', refused: 'Aucun chauffeur dispo', cancelled: 'Annulée' } },
      ar: { title: 'رحلتك', from: 'الانطلاق', to: 'الوجهة', price: 'السعر المقدر', status: 'الحالة',
            viewBtn: 'عرض طلباتي',
            statusLabel: { pending: 'بانتظار سائق', accepted: 'سائق معيَّن', refused: 'لا سائق متاح', cancelled: 'ملغاة' } },
      ha: { title: 'الطلب ديالك', from: 'الانطلاق', to: 'الوصول', price: 'الثمن المقدر', status: 'الحالة',
            viewBtn: 'شوف الطلبات',
            statusLabel: { pending: 'في انتظار سائق', accepted: 'سائق معيَّن', refused: 'ما كاين سائق', cancelled: 'ملغى' } },
    }[lang] || { title: 'Votre course', from: 'Départ', to: 'Arrivée', price: 'Prix estimé', status: 'Statut',
                  viewBtn: 'Voir mes demandes',
                  statusLabel: { pending: 'En attente de chauffeur', accepted: 'Chauffeur assigné', refused: 'Aucun chauffeur dispo', cancelled: 'Annulée' } };
    const price = active.estimatedPrice || active.price || '—';
    const statusLbl = L.statusLabel[active.status] || active.status;
    const statusColor = { pending: '#F59E0B', accepted: '#10B981', refused: '#EF4444', cancelled: '#6B7280' }[active.status] || '#6B7280';
    return `
    <div class="msg-transport-card status-card">
      <div class="card-header-row">
        <div class="card-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17H5a3 3 0 0 1-3-3l2-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2l2 8a3 3 0 0 1-3 3z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
        </div>
        <span class="card-title-text">${L.title}</span>
      </div>
      <div class="msg-card-route">
        <div class="msg-card-row">
          <div class="route-dot origin-dot"></div>
          <div class="route-info"><span class="route-label">${L.from}</span><span class="route-place">${active.origin}</span></div>
        </div>
        <div class="route-connector"><div class="connector-line"></div></div>
        <div class="msg-card-row">
          <div class="route-dot dest-dot"></div>
          <div class="route-info"><span class="route-label">${L.to}</span><span class="route-place">${active.destination}</span></div>
        </div>
      </div>
      <div class="card-price-row">
        <span class="card-price-label">${L.price}</span>
        <span class="card-price-value">${price}</span>
      </div>
      <div class="card-status-badge" style="border-color:${statusColor}20;background:${statusColor}12">
        <span style="color:${statusColor};font-weight:700;">${L.status} : ${statusLbl}</span>
      </div>
      <div class="cancel-confirm-btns">
        <button class="card-btn" data-action="go-requests" style="color:#6C63FF;font-weight:700;display:flex;align-items:center;gap:5px;justify-content:center;width:100%">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17H5a3 3 0 0 1-3-3l2-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2l2 8a3 3 0 0 1-3 3z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>
          ${L.viewBtn}
        </button>
      </div>
    </div>`;
  }

  // Wire inline card buttons (event delegation, fires once)
  function _attachCardListeners() {
    const list = document.getElementById('messages');
    if (!list) return;
    list.addEventListener('click', (e) => {
      const lang = (typeof I18n !== 'undefined' ? I18n.getLang() : null) || 'fr';

      // ── Booking confirmation card ────────────────────────────────
      const confirmBtn = e.target.closest('#inline-confirm-btn');
      const cancelBtn  = e.target.closest('#inline-cancel-btn');
      if (confirmBtn) {
        confirmBtn.closest('.card-confirm-btns').innerHTML =
          `<span style="color:var(--success);font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:5px;padding:8px 0;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Confirmé</span>`;
        if (state === STATE.AWAITING_CONFIRM) _handleConfirm(lang);
      }
      if (cancelBtn) {
        cancelBtn.closest('.card-confirm-btns').innerHTML =
          `<span style="color:var(--danger);font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:5px;padding:8px 0;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg> Annulé</span>`;
        if (state === STATE.AWAITING_CONFIRM) _handleCancel(lang);
      }

      // ── Status card — navigate to requests page ──────────────────
      const goReqs = e.target.closest('[data-action="go-requests"]');
      if (goReqs && typeof App !== 'undefined') {
        App.navigateTo('requests');
        return;
      }

      // ── Cancel confirmation card ─────────────────────────────────
      const cancelYes = e.target.closest('[data-action="cancel-yes"]');
      const cancelNo  = e.target.closest('[data-action="cancel-no"]');
      if (cancelYes && state === STATE.AWAITING_CANCEL_CONF) {
        cancelYes.closest('.cancel-confirm-btns').innerHTML =
          `<span style="color:#EF4444;font-size:13px;font-weight:600;padding:6px 0;">Annulation en cours...</span>`;
        (async () => { await _doCancel(lang); })();
      }
      if (cancelNo && state === STATE.AWAITING_CANCEL_CONF) {
        cancelNo.closest('.cancel-confirm-btns').innerHTML =
          `<span style="color:#10B981;font-size:13px;font-weight:600;padding:6px 0;">✓ Course conservée</span>`;
        state = STATE.IDLE;
        pendingCancel = null;
        _aiReply(_t('ai.how.help', lang), lang, 300);
      }
    });
  }

  // ── Fuzzy location matching against mock DB (FR + AR) ──────────
  function _matchLocation(text) {
    const raw  = text.trim();
    const locs = MockData.LOCATIONS;
    const low  = raw.toLowerCase();
    // 1. Exact (case insensitive, also handles Arabic)
    const exact = locs.find(l => l.toLowerCase() === low || l === raw);
    if (exact) return exact;
    // 2. Input contains a known location name
    const contains = locs.find(l => low.includes(l.toLowerCase()) || raw.includes(l));
    if (contains) return contains;
    // 3. Known location name contains the input
    const within = locs.find(l =>
      (l.toLowerCase().includes(low) && low.length > 3) ||
      (l.includes(raw) && raw.length > 2)
    );
    if (within) return within;
    // 4. Accept raw text (allow addresses not in mock DB)
    return raw;
  }

  // ── Location suggestion from known Nouakchott zones ────────────
  function _suggestLocation(text) {
    const low  = text.toLowerCase().trim();
    const locs = MockData.LOCATIONS;
    // 1. starts with same letters
    for (const l of locs) {
      if (l.toLowerCase().startsWith(low.slice(0, 2))) return l;
    }
    // 2. share significant substring (>=3 chars)
    for (const l of locs) {
      const ll = l.toLowerCase();
      for (let i = 0; i <= low.length - 3; i++) {
        if (ll.includes(low.slice(i, i + 3))) return l;
      }
    }
    // 3. fallback: well-known central spot
    return 'Centre-ville';
  }

  // ── Validate a location text — 4-level chain ────────────────────
  // Level 0 : PoiDB local (aliases, noms populaires mauritaniens)
  // Level 1 : MockData.LOCATIONS (quartiers rapides)
  // Level 2 : Backend Flask /api/maps/geocode
  // Level 3 : Nominatim OpenStreetMap
  // Returns { found: bool, formatted: string, lat, lng, suggestion, source }
  async function _validateLocation(text, lang) {
    const raw = text.trim();
    const low = raw.toLowerCase();

    // ── 0. POI local database (lieux mauritaniens + aliases) ────────
    if (typeof PoiDB !== 'undefined') {
      const poi = PoiDB.search(raw);
      if (poi.found) {
        return { found: true, formatted: poi.canonical, lat: poi.lat, lng: poi.lng, suggestion: null, source: 'poi' };
      }
      // Garder la suggestion POI même si non trouvé pour la proposer plus tard
      if (!raw._poiSuggestion && poi.suggestion) raw._poiSuggestion = poi.suggestion;
    }

    // ── 1. Mock locations list (quartiers de base) ──────────────────
    const locs  = MockData.LOCATIONS;
    const exact = locs.find(l => l.toLowerCase() === low || l === raw);
    if (exact) return { found: true, formatted: exact, suggestion: null, source: 'mock' };
    const fuzzy = locs.find(l => low.includes(l.toLowerCase()) || l.toLowerCase().includes(low) || raw.includes(l));
    if (fuzzy) return { found: true, formatted: fuzzy, suggestion: null, source: 'mock' };

    // ── 2. Backend Flask /api/maps/geocode ──────────────────────────
    try {
      const ctrl = new AbortController();
      const tmo  = setTimeout(() => ctrl.abort(), 3000);
      const r    = await fetch(
        `http://localhost:5000/api/maps/geocode?q=${encodeURIComponent(raw + ' Nouakchott')}&lang=${lang}`,
        { signal: ctrl.signal }
      );
      clearTimeout(tmo);
      if (r.ok) {
        const d = await r.json();
        if (d.data && d.data.lat) {
          const name = (d.data.formatted_address || raw).split(',')[0].trim();
          return { found: true, formatted: name, lat: d.data.lat, lng: d.data.lng, suggestion: null, source: 'backend' };
        }
      }
    } catch (_) { /* backend offline */ }

    // ── 3. Nominatim OpenStreetMap — gratuit, sans clé ─────────────
    try {
      const nomLang = (lang === 'fr') ? 'fr' : 'ar';
      const ctrl    = new AbortController();
      const tmo     = setTimeout(() => ctrl.abort(), 4000);
      const q       = encodeURIComponent(raw + ' Nouakchott Mauritanie');
      const r       = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=3&countrycodes=mr&accept-language=${nomLang}`,
        { headers: { 'User-Agent': 'ChatIA/1.0' }, signal: ctrl.signal }
      );
      clearTimeout(tmo);
      const items = await r.json();
      if (Array.isArray(items) && items.length > 0) {
        const name = items[0].display_name.split(',')[0].trim();
        return { found: true, formatted: name, lat: parseFloat(items[0].lat), lng: parseFloat(items[0].lon), suggestion: null, source: 'nominatim' };
      }
    } catch (_) { /* nominatim offline */ }

    // ── 4. Non trouvé — suggestion via POI ou heuristique ──────────
    const suggestion = (typeof PoiDB !== 'undefined' ? PoiDB.suggest(raw) : null) || _suggestLocation(raw);
    return { found: false, formatted: raw, suggestion, source: null };
  }

  // ── Main processInput — called by Chat UI and Call mode ─────────
  // options: { mode: 'chat'|'call', onSpoken: callback }
  async function processInput(text, options = {}) {
    if (!text || !text.trim()) return;

    _currentMode = options.mode || 'chat';
    _onSpokenCb  = options.onSpoken || null;

    // Detect language from user's text (not UI language)
    const lang = LangDetect.detect(text);

    // Add user message to chat (call mode adds it separately before calling processInput)
    if (_currentMode === 'chat') {
      const userMsg = { role: 'user', text, time: _nowTime(), isVoice: options.isVoice || false };
      messages.push(userMsg);
      _renderMessage(userMsg);
    }

    const intent = _detectIntent(text);

    // Sync voice recognition language to detected language
    if (typeof Voice !== 'undefined') Voice.setActiveLang(lang);

    // ── Global intent override ─────────────────────────────────────
    // CANCEL_TRIP / STATUS / HELP / HISTORY / MAP always interrupt any
    // in-progress booking flow and are routed to the IDLE switch below.
    const _GLOBAL = ['CANCEL_TRIP', 'STATUS', 'HELP', 'HISTORY', 'MAP'];
    if (_GLOBAL.includes(intent) && state !== STATE.AWAITING_CANCEL_CONF) {
      if (state !== STATE.IDLE) {
        pendingOrigin = null; pendingDest = null; pendingEstimate = null;
        pendingGeoData = null; _modifyingPoint = null; pendingPhone = null;
        _originRetries = 0; _destRetries = 0;
        state = STATE.IDLE;
      }
      // Fall through to the switch statement (no return here)
    }

    // ── State-aware handlers ──────────────────────────────────────

    if (state === STATE.AWAITING_ORIGIN) {
      if (intent === 'CANCEL') { await _handleCancel(lang); return; }
      Maps.hideSuggestions();
      _showTyping();
      const locO = await _validateLocation(text.trim(), lang);
      _hideTyping();

      if (!locO.found && _originRetries < 2) {
        _originRetries++;
        const msg = locO.suggestion
          ? _fill(_t('ai.location.suggest', lang), { place: text.trim(), suggestion: locO.suggestion })
          : _fill(_t('ai.location.not.found', lang), { place: text.trim() });
        await _aiReply(msg, lang, 350);
        return;
      }
      _originRetries = 0;
      pendingOrigin = locO.found ? locO.formatted : (locO.suggestion || text.trim());

      if (_modifyingPoint === 'origin') {
        _modifyingPoint = null;
        state = STATE.AWAITING_CONFIRM;
        await _resolveAndShowCard(lang);
        return;
      }
      state = STATE.AWAITING_DEST;
      await _aiReply(_t('ai.ask.dest', lang), lang);
      return;
    }

    if (state === STATE.AWAITING_DEST) {
      if (intent === 'CANCEL') { await _handleCancel(lang); return; }
      Maps.hideSuggestions();
      _showTyping();
      const locD = await _validateLocation(text.trim(), lang);
      _hideTyping();

      if (!locD.found && _destRetries < 2) {
        _destRetries++;
        const msg = locD.suggestion
          ? _fill(_t('ai.location.suggest.dest', lang), { place: text.trim(), suggestion: locD.suggestion })
          : _fill(_t('ai.location.not.found.dest', lang), { place: text.trim() });
        await _aiReply(msg, lang, 350);
        return;
      }
      _destRetries = 0;
      pendingDest  = locD.found ? locD.formatted : (locD.suggestion || text.trim());

      if (_modifyingPoint === 'dest') {
        _modifyingPoint = null;
        state = STATE.AWAITING_CONFIRM;
        await _resolveAndShowCard(lang);
        return;
      }
      // Use logged-in user's phone, no prompt needed
      const authUser = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
      pendingPhone = authUser ? authUser.phone : null;
      state = STATE.AWAITING_CONFIRM;
      await _resolveAndShowCard(lang);
      return;
    }

    if (state === STATE.AWAITING_CONFIRM) {
      const trimmed = text.trim();
      if (trimmed === '1' || intent === 'CONFIRM') { await _handleConfirm(lang); return; }
      if (trimmed === '2' || intent === 'CANCEL')  { await _handleCancel(lang);  return; }
      if (trimmed === '3' || intent === 'MODIFY')  { await _handleModify(lang);  return; }
      await _aiReply(_t('ai.confirm.options', lang), lang, 350);
      return;
    }

    if (state === STATE.AWAITING_MODIFY_CHOICE) {
      const trimmed = text.trim();
      const isOrigin = trimmed === '1'
        || /\b(départ|origin|partir|démarr|démarrage)\b/i.test(text)
        || /انطلاق|الانطلاق|من وين|نقطة البداية/.test(text);
      const isDest = trimmed === '2'
        || /\b(arrivée|destination|arrive|destina)\b/i.test(text)
        || /وجهة|الوجهة|وصول|الوصول/.test(text);

      if (isOrigin) {
        _modifyingPoint = 'origin';
        state = STATE.AWAITING_ORIGIN;
        await _aiReply(_t('ai.modify.new.origin', lang), lang, 350);
        return;
      }
      if (isDest) {
        _modifyingPoint = 'dest';
        state = STATE.AWAITING_DEST;
        await _aiReply(_t('ai.modify.new.dest', lang), lang, 350);
        return;
      }
      await _aiReply(_t('ai.modify.choice', lang), lang, 350);
      return;
    }

    if (state === STATE.AWAITING_PHONE_CANCEL) {
      await _handlePhoneLookup(text.trim(), lang);
      return;
    }

    if (state === STATE.AWAITING_CANCEL_CONF) {
      if (intent === 'CONFIRM') { await _doCancel(lang); return; }
      if (intent === 'CANCEL')  {
        state = STATE.IDLE;
        pendingCancel = null;
        await _aiReply(_t('ai.how.help', lang), lang, 500);
        return;
      }
    }

    if (state === STATE.AWAITING_TRIP_ID) {
      await _handleTripIdLookup(text.trim(), lang);
      return;
    }

    // ── Intent routing from IDLE ──────────────────────────────────

    switch (intent) {
      case 'GREET':
        await _aiReply(_t('ai.welcome', lang), lang);
        break;

      case 'REQUEST_TRANSPORT': {
        const active = Transport.getActive();
        if (active && active.status === 'pending') {
          await _aiReply(_t('ai.status.pending', lang), lang);
          break;
        }
        state = STATE.AWAITING_ORIGIN;
        await _aiReply(_t('ai.ask.origin', lang), lang);
        break;
      }

      case 'CANCEL_TRIP': {
        const active = Transport.getActive();
        if (active && (active.status === 'pending' || active.status === 'accepted')) {
          pendingCancel = active;
          state = STATE.AWAITING_CANCEL_CONF;
          const introText = { fr: 'Votre course active :', ar: 'رحلتك النشطة :', ha: 'الطلب ديالك :' }[lang] || 'Votre course active :';
          await _aiReply(introText, lang, 600, _buildCancelCard(active, lang));
        } else {
          await _aiReply(_t('ai.no.active', lang), lang);
        }
        break;
      }

      case 'CANCEL':
        if (state !== STATE.IDLE) {
          await _handleCancel(lang);
        } else {
          await _aiReply(_t('ai.no.active', lang), lang);
        }
        break;

      case 'CONFIRM':
        await _aiReply(_t('ai.how.help', lang), lang, 400);
        break;

      case 'STATUS': {
        const active = Transport.getActive();
        if (!active) {
          await _aiReply(_t('ai.no.active', lang), lang);
        } else {
          const introText = { fr: 'Voici votre course :', ar: 'إليك رحلتك :', ha: 'هذا الطلب ديالك :' }[lang] || 'Voici votre course :';
          await _aiReply(introText, lang, 600, _buildStatusCard(active, lang));
        }
        break;
      }

      case 'HELP':
        await _aiReply(_t('ai.help', lang), lang);
        break;

      case 'HISTORY':
        await _aiReply({ fr:'Voici votre historique.', ar:'إليك سجل محادثاتك.', ha:'هذا السجل ديالك.' }[lang] || 'Historique', lang, 500);
        if (_currentMode === 'chat') App.navigateTo('history');
        break;

      case 'MAP': {
        const mapReply = _t('ai.map.intro', lang);
        await _aiReply(mapReply, lang, 400);
        if (_currentMode === 'chat') {
          App.navigateTo('map');
          // Si on était en cours de booking, pré-remplir les champs
          if (pendingOrigin || pendingDest) {
            setTimeout(() => MapView.setRoute(pendingOrigin || '', pendingDest || ''), 200);
          }
        }
        break;
      }

      default:
        await _aiReply(_t('ai.unknown', lang), lang);
        break;
    }
  }

  // ── Shared: resolve route via Maps API then show confirmation card ─
  async function _resolveAndShowCard(lang) {
    _showTyping();
    const resolveData = await Maps.resolve(pendingOrigin, pendingDest, lang);
    _hideTyping();

    if (resolveData && resolveData.destination) {
      pendingEstimate = {
        distance: resolveData.distance_text || `${parseFloat(resolveData.distance_km).toFixed(1)} km`,
        time:     resolveData.duration_text  || `${resolveData.duration_min} min`,
        price:    `${Math.round(resolveData.price)} MRU`,
        priceNum: resolveData.price,
      };
      pendingGeoData = resolveData;
    } else {
      pendingEstimate = MockData.getEstimate(pendingOrigin, pendingDest);
      pendingGeoData  = null;
    }

    const priceMsg = _fill(_t('ai.price.announce', lang), {
      from:  pendingOrigin,
      to:    pendingDest,
      price: pendingEstimate.price,
    });
    const cardHtml = _buildTransportCard(pendingOrigin, pendingDest, pendingEstimate, lang, !!pendingGeoData, pendingPhone);
    await _aiReply(priceMsg, lang, 400, cardHtml);

    if (pendingGeoData) {
      const og = pendingGeoData.origin;
      const dg = pendingGeoData.destination;
      setTimeout(() => Maps.initMap(
        'route-map',
        { lat: og.lat, lng: og.lng, formatted_address: og.formatted_address },
        { lat: dg.lat, lng: dg.lng, formatted_address: dg.formatted_address }
      ), 220);
    }
  }

  // ── Private flow handlers ───────────────────────────────────────

  async function _handleModify(lang) {
    state = STATE.AWAITING_MODIFY_CHOICE;
    Maps.destroyMap();
    await _aiReply(_t('ai.modify.choice', lang), lang, 400);
  }

  async function _handleConfirm(lang) {
    if (!pendingOrigin || !pendingDest) { state = STATE.IDLE; return; }
    state = STATE.IDLE;
    Maps.destroyMap();
    Maps.hideSuggestions();
    await _aiReply(_t('ai.confirmed', lang), lang, 500);
    await Transport.createRequest(pendingOrigin, pendingDest, pendingPhone);
    Notifications.toast(_t('toast.req.created', lang), 'info');
    pendingOrigin   = null;
    pendingDest     = null;
    pendingEstimate = null;
    pendingGeoData  = null;
    pendingPhone    = null;
    if (_currentMode === 'chat') App.navigateTo('requests');
  }

  async function _handleCancel(lang) {
    state           = STATE.IDLE;
    pendingOrigin   = null;
    pendingDest     = null;
    pendingEstimate = null;
    pendingPhone    = null;
    pendingCancel   = null;
    pendingGeoData  = null;
    _originRetries  = 0;
    _destRetries    = 0;
    Maps.hideSuggestions();
    Maps.destroyMap();
    await _aiReply(_t('ai.cancelled', lang), lang, 450);
  }

  async function _handlePhoneLookup(phone, lang) {
    const found = MockData.findRequestsByPhone(phone);
    if (found.length > 0) {
      pendingCancel = found[0];
      state = STATE.AWAITING_CANCEL_CONF;
      const msg = _fill(_t('ai.phone.found', lang), {
        from: pendingCancel.origin,
        to:   pendingCancel.destination,
      });
      await _aiReply(msg, lang);
    } else {
      // Try treating the input as a trip ID directly
      state = STATE.AWAITING_TRIP_ID;
      await _aiReply(_t('ai.phone.not.found', lang), lang);
    }
  }

  async function _handleTripIdLookup(tripId, lang) {
    const all = Transport.getAll();
    const req = all.find(r => r.id.toLowerCase() === tripId.toLowerCase()
      && (r.status === 'pending' || r.status === 'accepted'));
    if (req) {
      pendingCancel = req;
      state = STATE.AWAITING_CANCEL_CONF;
      const msg = _fill(_t('ai.phone.found', lang), { from: req.origin, to: req.destination });
      await _aiReply(msg, lang);
    } else {
      state = STATE.IDLE;
      await _aiReply(_t('ai.trip.id.not.found', lang), lang);
    }
  }

  async function _doCancel(lang) {
    if (!pendingCancel) { state = STATE.IDLE; return; }
    Transport.cancelRequest(pendingCancel.id);
    state = STATE.IDLE;
    pendingCancel = null;
    await _aiReply(_t('ai.cancel.confirmed', lang), lang);
  }

  // ── Quick Action Chips ──────────────────────────────────────────
  function handleChip(action) {
    const uiLang = I18n.getLang();
    const texts = {
      fr: { request: 'Je veux un transport', status: 'Voir mon statut', cancel: 'Annuler mon trajet', help: 'Aide' },
      ar: { request: 'أريد سيارة', status: 'حالة الطلب', cancel: 'إلغاء طلبي', help: 'مساعدة' },
      ha: { request: 'بغيت كار', status: 'حالة الطلب ديالي', cancel: 'إلغاء طلبي', help: 'مساعدة' },
    };
    const text = (texts[uiLang] || texts.fr)[action];
    if (text) processInput(text);
  }

  // ── Render History view ─────────────────────────────────────────
  function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;
    const history = MockData.getHistory();
    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="140" height="150" viewBox="0 0 140 150" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 6px 20px rgba(14,165,233,.10))">
            <!-- Large chat bubble -->
            <rect x="12" y="10" width="116" height="82" rx="18" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1.5"/>
            <!-- Bubble tail -->
            <path d="M30 92 L22 108 L46 92" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1.5" stroke-linejoin="round"/>
            <!-- Clock face inside bubble -->
            <circle cx="70" cy="50" r="28" fill="white" stroke="#F3F4F6" stroke-width="1.5"/>
            <!-- Clock tick marks -->
            <line x1="70" y1="26" x2="70" y2="30" stroke="#E5E7EB" stroke-width="2" stroke-linecap="round"/>
            <line x1="70" y1="70" x2="70" y2="74" stroke="#E5E7EB" stroke-width="2" stroke-linecap="round"/>
            <line x1="46" y1="50" x2="50" y2="50" stroke="#E5E7EB" stroke-width="2" stroke-linecap="round"/>
            <line x1="90" y1="50" x2="94" y2="50" stroke="#E5E7EB" stroke-width="2" stroke-linecap="round"/>
            <!-- Hour hand (sky blue) -->
            <line x1="70" y1="50" x2="70" y2="32" stroke="#0EA5E9" stroke-width="2.5" stroke-linecap="round"/>
            <!-- Minute hand (grey) -->
            <line x1="70" y1="50" x2="82" y2="57" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round"/>
            <!-- Center dot -->
            <circle cx="70" cy="50" r="3" fill="#0EA5E9"/>
            <!-- Small sparkles top-right of bubble -->
            <circle cx="116" cy="18" r="4" fill="#F59E0B" opacity="0.75"/>
            <circle cx="126" cy="30" r="2.5" fill="#0EA5E9" opacity="0.45"/>
            <circle cx="108" cy="12" r="2" fill="#0EA5E9" opacity="0.30"/>
            <!-- Second small bubble (representing AI) -->
            <rect x="72" y="116" width="60" height="26" rx="13" fill="rgba(14,165,233,.08)" stroke="rgba(14,165,233,.15)" stroke-width="1"/>
            <circle cx="86" cy="129" r="3.5" fill="rgba(14,165,233,.35)"/>
            <circle cx="98" cy="129" r="3.5" fill="rgba(14,165,233,.35)"/>
            <circle cx="110" cy="129" r="3.5" fill="rgba(14,165,233,.35)"/>
          </svg>
          <h3>${I18n.t('history.empty')}</h3>
          <p>${I18n.t('history.empty.sub')}</p>
        </div>`;
      return;
    }
    const sIcons = {
      accepted:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      refused:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
      cancelled: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
      pending:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    };
    const defaultIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;
    const lLabels = { fr:'FR', ar:'AR', ha:'HA' };
    container.innerHTML = history.map(conv => {
      const d = new Date(conv.date);
      const ds = d.toLocaleDateString([],{day:'2-digit',month:'short'}) + ' · ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      return `
      <div class="history-item" onclick="Chat.expandHistory('${conv.id}')">
        <div class="history-icon">${sIcons[conv.status] || defaultIcon}</div>
        <div class="history-body">
          <div class="history-meta">
            <span class="history-lang">${lLabels[conv.lang] || 'FR'}</span>
            <span class="history-date">${ds}</span>
          </div>
          <div class="history-summary">${conv.summary}</div>
          <div class="history-turns">${conv.turns} ${I18n.t('history.turns')}</div>
        </div>
      </div>`;
    }).join('');
  }

  function expandHistory(id) {
    const conv = MockData.getHistory().find(c => c.id === id);
    if (!conv) return;
    const bubbles = (conv.messages || []).map(m => {
      const s = m.role === 'ai'
        ? 'background:var(--surface);border:1px solid var(--border);color:var(--text);'
        : 'background:var(--primary);color:white;';
      const a = m.role === 'ai' ? 'flex-start' : 'flex-end';
      return `<div style="display:flex;justify-content:${a};margin-bottom:8px;">
        <div style="max-width:80%;padding:9px 13px;border-radius:16px;font-size:13px;${s}">${m.text}</div>
      </div>`;
    }).join('');
    Modal.show({
      title: conv.summary,
      body: `<div style="max-height:50vh;overflow-y:auto;padding:4px 0;">${bubbles}</div>`,
      actions: `<button class="modal-btn primary" style="flex:1" onclick="Modal.close()">${I18n.t('modal.close')}</button>`,
    });
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    // Welcome message
    setTimeout(() => {
      const lang = I18n.getLang();
      _aiReply(_t('ai.welcome', lang), lang, 500);
    }, 400);

    const sendBtn   = document.getElementById('send-btn');
    const inputEl   = document.getElementById('chat-input');
    const quickActs = document.getElementById('quick-actions');

    if (sendBtn)   sendBtn.addEventListener('click', _sendFromInput);
    if (inputEl)   inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendFromInput(); } });
    if (quickActs) quickActs.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) handleChip(c.dataset.action); });

    // Autocomplete Maps : suggestions pendant la saisie du lieu
    Maps.initSuggestions((selectedName) => {
      if (inputEl) {
        inputEl.value = '';
        processInput(selectedName, { mode: 'chat' });
      }
    });

    if (inputEl) {
      inputEl.addEventListener('input', () => {
        if (state === STATE.AWAITING_ORIGIN || state === STATE.AWAITING_DEST) {
          const lang = LangDetect.detect(inputEl.value) || I18n.getLang();
          Maps.triggerAutocomplete(inputEl.value, lang);
        } else {
          Maps.hideSuggestions();
        }
      });
      // Fermer suggestions quand on blur (délai pour permettre le clic)
      inputEl.addEventListener('blur', () => setTimeout(() => Maps.hideSuggestions(), 200));
    }

    _attachCardListeners();
  }

  function _sendFromInput() {
    const inputEl = document.getElementById('chat-input');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    processInput(text, { mode: 'chat' });
  }

  function resetState() {
    state            = STATE.IDLE;
    pendingOrigin    = null;
    pendingDest      = null;
    pendingEstimate  = null;
    pendingPhone     = null;
    pendingCancel    = null;
    pendingGeoData   = null;
    _modifyingPoint  = null;
    _originRetries   = 0;
    _destRetries     = 0;
    if (typeof Voice !== 'undefined') Voice.setActiveLang(null);
    _currentMode    = 'chat';
    _onSpokenCb     = null;
    Maps.hideSuggestions();
    Maps.destroyMap();
  }

  // Cancel any in-progress AI reply (called by Call.end() to stop ghost responses)
  function cancelPending() {
    clearTimeout(typingTimer);
    typingTimer  = null;
    _onSpokenCb  = null;
    _currentMode = 'chat';
    _hideTyping();
  }

  return {
    init,
    processInput,
    handleChip,
    addSystemMessage,
    addUserMessage,
    renderHistory,
    expandHistory,
    resetState,
    cancelPending,
  };
})();
