/* ════════════════════════════════════════════
   chat.js — ONE AI Engine (Chat + Call)
   • Auto-detects language from user input
   • Replies in the customer's detected language
   • Chat mode: text only, no auto-TTS
   • Call mode: voice only, full TTS with onEnd loop
   State machine:
     IDLE → AWAITING_ORIGIN → AWAITING_DEST
          → AWAITING_CONFIRM → [request created]
     IDLE → CANCEL_TRIP (active trip) → AWAITING_CANCEL_CONF
          → [cancelled]
   ════════════════════════════════════════════ */

const Chat = (() => {

  // ── State machine ───────────────────────────────────────────────
  const STATE = {
    IDLE:                  'IDLE',
    AWAITING_ORIGIN:       'AWAITING_ORIGIN',
    AWAITING_ORIGIN_PRECISION: 'AWAITING_ORIGIN_PRECISION',
    AWAITING_DEST:         'AWAITING_DEST',
    AWAITING_DEST_PRECISION: 'AWAITING_DEST_PRECISION',
    AWAITING_ORIGIN_MATCH_CONFIRM: 'AWAITING_ORIGIN_MATCH_CONFIRM',
    AWAITING_DEST_MATCH_CONFIRM:   'AWAITING_DEST_MATCH_CONFIRM',
    AWAITING_CONFIRM:      'AWAITING_CONFIRM',
    AWAITING_MODIFY_CHOICE:'AWAITING_MODIFY_CHOICE',
    AWAITING_CANCEL_CONF:  'AWAITING_CANCEL_CONF',
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
  let _precisionZone   = null;   // { quartier, label } — vague zone being refined into a precise point
  let _precisionCount  = 0;      // nombre de questions de précision déjà posées
  let _precisionMax    = 3;      // borne tirée au début du flux (3 à 5)
  let _precisionExcluded = [];   // ids des repères déjà proposés (évite les répétitions)
  let _precisionTarget = null;   // 'origin' | 'dest' — quel point est en cours d'affinage
  let _autoDest        = null;   // destination extraite en même temps que l'origine dans un même message ("de X à Y") — validée automatiquement une fois l'origine résolue
  let _matchCandidate  = null;   // { target, place, lang, returnState } — correspondance approximative en attente de confirmation oui/non
  let _lastLang        = 'fr';   // dernière langue détectée dans un message utilisateur (pas la langue de l'interface) — utilisée par les clics sur les cartes (confirmer/annuler), qui n'ont pas de texte à eux-mêmes détecter
  let _aiOfflineNotified = false; // évite de re-notifier à chaque message tant que l'IA reste indisponible (voir _tryAIReply)
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
    const lang = LangDetect.detect(text, _lastLang);
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
      Voice.speak(text, LangDetect.detect(text, _lastLang) || I18n.getLang());
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
      // Langue de la conversation détectée (pas le sélecteur FR/AR/HA de
      // l'en-tête) : un clic sur "Confirmer" après une conversation en
      // arabe doit répondre en arabe, même si le sélecteur d'interface
      // est resté sur FR par défaut.
      const lang = _lastLang || 'fr';

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

  // ── Extraction d'un trajet complet depuis une seule phrase libre ─
  // "Je veux aller de Ksar à Tevragh Zeina", "من الكار إلى الجامعة"...
  // Évite de forcer l'utilisateur à retaper l'origine puis la destination
  // séparément quand il les a déjà données dans le même message.
  // Ne couvre que l'ordre "origine puis destination" (le plus courant) ;
  // ne remplace pas la validation/précision qui suit (juste l'extraction).
  // NB: pas de \b devant "à"/"à partir de" — en JS, \b se définit par
  // rapport aux caractères \w (ASCII), et "à" (accentué) n'en est pas un ;
  // \b y échoue silencieusement. On utilise (?:^|\s) à la place.
  const _ROUTE_PATTERNS = {
    fr: /(?:^|\s)(?:de|depuis|à partir de)\s+(.+?)\s+(?:à|vers|jusqu'à|jusqu’à|pour)\s+(.+)/i,
    ar: /من\s+(.+?)\s+(?:إلى|الى|إلي|الي|لـ)\s+(.+)/,
    ha: /من\s+(.+?)\s+(?:لـ|إلى|الى)\s+(.+)/,
  };
  // Même chose mais destination annoncée avant l'origine ("à Y depuis X").
  // Groupes inversés (dest, origin) — voir _extractRoute.
  const _ROUTE_PATTERNS_REVERSE = {
    fr: /(?:^|\s)(?:à|vers|jusqu'à|jusqu’à)\s+(.+?)\s+(?:depuis|de)\s+(.+)/i,
    ar: /(?:إلى|الى|إلي|الي)\s+(.+?)\s+من\s+(.+)/,
    ha: /(?:إلى|الى|لـ)\s+(.+?)\s+من\s+(.+)/,
  };

  function _cleanExtracted(text) {
    return text
      .replace(/\b(s'il vous pla[iî]t|svp|stp|merci|please)\b/gi, '')
      .replace(/(من فضلك|رجاء|لو سمحت|عفوا|شكرا)/g, '')
      .replace(/[?？!.,؟]+$/g, '')
      .trim();
  }

  // Retourne { origin, dest } si un trajet complet est reconnu, sinon null.
  // Essaie d'abord l'ordre "origine puis destination" (le plus courant),
  // puis l'ordre inversé "destination puis origine".
  function _extractRoute(text, lang) {
    const order = [lang, 'fr', 'ar', 'ha'];
    for (const l of order) {
      const re = _ROUTE_PATTERNS[l];
      if (!re) continue;
      const m = text.match(re);
      if (m && m[1] && m[2]) {
        const origin = _cleanExtracted(m[1]);
        const dest   = _cleanExtracted(m[2]);
        if (origin && dest) return { origin, dest };
      }
    }
    for (const l of order) {
      const re = _ROUTE_PATTERNS_REVERSE[l];
      if (!re) continue;
      const m = text.match(re);
      if (m && m[1] && m[2]) {
        const dest   = _cleanExtracted(m[1]);
        const origin = _cleanExtracted(m[2]);
        if (origin && dest) return { origin, dest };
      }
    }
    return null;
  }

  // ── Provider NLU actif : le moteur à règles ci-dessus (voir nlu.js) ─
  // Le contrat NLU accepte un `context` (état de la conversation) pour
  // qu'un futur provider (LLM) puisse l'exploiter ; le provider "rules"
  // actuel n'en a besoin que pour interpretLocationAnswer (repères déjà
  // proposés, pour ne jamais reproposer le même) et ignore le reste.
  if (typeof NLU !== 'undefined') {
    NLU.registerProvider({
      detectIntent:          (text, _context) => _detectIntent(text),
      extractRoute:          (text, lang, _context) => _extractRoute(text, lang),
      interpretLocationAnswer: (text, lang, _context) => _interpretLocationAnswer(text, lang, _context),
    });
  }

  // Contexte de conversation transmis à NLU à chaque appel — permet à un
  // provider plus riche qu'un moteur à règles (typiquement un LLM) de
  // savoir ce qui est déjà connu, et donc de ne jamais redemander une
  // info déjà donnée. Rassemble exactement ce qu'un futur provider LLM
  // devra recevoir : dernier message, historique, état du trajet en
  // cours, lieux déjà proposés pendant l'affinage, langue détectée.
  function _buildNluContext(lang) {
    return {
      lang,
      state,
      pendingOrigin,
      pendingDest,
      lastMessage: messages.length ? messages[messages.length - 1] : null,
      history: messages.slice(-6),
      proposedPlaces: _precisionExcluded.map(id => {
        const p = PoiDB.getById(id);
        return p ? _poiName(p, lang) : id;
      }),
    };
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
        return {
          found: true, formatted: poi.canonical, lat: poi.lat, lng: poi.lng, suggestion: null, source: 'poi',
          type: poi.poi.type, quartier: poi.poi.quartier,
          nameAr: poi.poi.nameAr, nameHa: poi.poi.nameHa,
          matchType: poi.match, // 'exact' | 'alias' | 'fuzzy' — voir _isApproximateMatch
        };
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
      // NB: la route Flask attend le paramètre "address", pas "q".
      const r    = await fetch(
        `http://localhost:5000/api/maps/geocode?address=${encodeURIComponent(raw + ' Nouakchott')}&lang=${lang}`,
        { signal: ctrl.signal }
      );
      clearTimeout(tmo);
      if (r.ok) {
        const d = await r.json();
        if (d.data && d.data.lat) {
          const name = (d.data.formatted_address || raw).split(',')[0].trim();
          // Le fallback backend (sans clé Google Maps) ne connaît que les
          // 18 zones de Nouakchott en entier — jamais un point précis.
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
        const top  = items[0];
        const name = top.display_name.split(',')[0].trim();
        return {
          found: true, formatted: name, lat: parseFloat(top.lat), lng: parseFloat(top.lon), suggestion: null, source: 'nominatim',
          nomClass: top.class, nomType: top.type,
        };
      }
    } catch (_) { /* nominatim offline */ }

    // ── 4. Non trouvé — suggestion via POI ou heuristique ──────────
    const suggestion = (typeof PoiDB !== 'undefined' ? PoiDB.suggest(raw) : null) || _suggestLocation(raw);
    return { found: false, formatted: raw, suggestion, source: null };
  }

  // ── Localisation intelligente ────────────────────────────────────
  // Un "quartier" (ex: Sebkha, Arafat...) ou une entrée générique de la
  // liste mock est trop large pour situer un client (>1km). On refuse de
  // le valider comme point de départ et on affine avec des repères
  // (clinique, mosquée, école, station, commerce) jusqu'à obtenir un
  // point précis, quitte à poser jusqu'à 3-5 questions courtes.
  function _isVagueLocation(loc) {
    if (loc.source === 'poi') return loc.type === 'quartier';
    if (loc.source === 'mock') return true;
    // Fallback backend (sans clé Google Maps) : ne résout que les 18 zones
    // de Nouakchott en entier, jamais un point précis — toujours vague.
    if (loc.source === 'backend') return true;
    // Nominatim classe ses résultats : class="place"/"boundary" couvre les
    // zones administratives (quartier, ville, région...) — vague. Tout le
    // reste (amenity, shop, tourism, building nommé...) est un point précis.
    if (loc.source === 'nominatim') return loc.nomClass === 'place' || loc.nomClass === 'boundary';
    return false;
  }

  // ── Confirmation obligatoire des correspondances approximatives ─────
  // Une correspondance n'est "sûre" que si elle vient d'un nom ou alias
  // EXACT du catalogue. Tout le reste — score flou (trigrammes) sur PoiDB,
  // ou résolution externe via Nominatim (recherche plein texte, jamais
  // garantie de correspondre exactement à ce que l'utilisateur a tapé) —
  // est une supposition qui doit être confirmée avant d'être enregistrée
  // comme départ ou destination. ('mock'/'backend' passent déjà toujours
  // par _isVagueLocation ci-dessus, donc n'atteignent jamais ce point.)
  function _isApproximateMatch(loc) {
    if (loc.source === 'poi') return loc.matchType === 'fuzzy';
    if (loc.source === 'nominatim') return true;
    return false;
  }

  function _poiName(poi, lang) {
    return (lang === 'ar' ? poi.nameAr : lang === 'ha' ? poi.nameHa : poi.name) || poi.name;
  }

  function _landmarksList(landmarks, lang) {
    return landmarks.map(p => `• ${_poiName(p, lang)}`).join('\n');
  }

  // Recherche de proximité réelle (100-500m) quand on connaît les
  // coordonnées de la zone en cours d'affinage. Si rien n'est catalogué
  // dans ce rayon (zone périphérique, ex: Toujounine, loin de tout repère
  // connu), on ne renvoie jamais une liste vide : repli sur le
  // regroupement par nom de quartier (élargi à toute la ville si besoin,
  // comme avant l'ajout de la recherche par proximité).
  function _nextLandmarks(lang, typeHint) {
    const hasCoords = _precisionZone
      && typeof _precisionZone.lat === 'number' && typeof _precisionZone.lng === 'number';

    let landmarks = hasCoords
      ? PoiDB.nearbyByRadius(_precisionZone.lat, _precisionZone.lng, { exclude: _precisionExcluded, limit: 3, type: typeHint || null })
      : [];

    if (!landmarks.length) {
      landmarks = PoiDB.nearbyLandmarks(_precisionZone ? _precisionZone.quartier : null, { exclude: _precisionExcluded, limit: 3, type: typeHint || null });
    }

    landmarks.forEach(p => _precisionExcluded.push(p.id));
    return landmarks;
  }

  // ── Compréhension des réponses partielles pendant la précision ──────
  // "عند العيادة" (à la clinique), "قريب من السوق" (près du marché),
  // "جنب المسجد" (à côté de la mosquée)... l'utilisateur nomme souvent
  // une CATÉGORIE ou une relation de proximité plutôt qu'un nom précis.
  // On isole le nom du repère (en retirant la préposition) pour la
  // recherche, et si aucun repère précis n'est trouvé mais qu'une
  // catégorie est reconnaissable, on s'en sert pour orienter la
  // suggestion suivante au lieu de rester générique.
  const _RELATIONAL_WORDS = [
    // AR / HA — les expressions composées d'abord (évite un découpage partiel)
    'قريب من', 'قرب', 'عند', 'جنب', 'بجانب', 'حداني', 'حدا', 'أمام', 'قدام', 'خلف', 'وراء',
    // FR
    "à côté de", 'près de', 'en face de', 'devant', 'derrière', 'chez',
  ];

  function _stripRelational(text) {
    let out = text;
    for (const w of _RELATIONAL_WORDS) out = out.replace(new RegExp(w, 'gi'), ' ');
    return out.replace(/\s+/g, ' ').trim();
  }

  // Catégorie de lieu nommée sans précision de l'instance exacte.
  const _TYPE_HINTS = {
    hopital:   /عيادة|مستشفى|hôpital|hopital|clinique/i,
    mosquee:   /مسجد|جامع|mosqu[ée]e?/i,
    ecole:     /مدرسة|جامعة|[ée]cole|universit[ée]/i,
    marche:    /سوق|march[ée]/i,
    station:   /محطة|station[- ]?(service|essence)?/i,
    carrefour: /كارفور|دوار|carrefour|rond[- ]?point/i,
    hotel:     /فندق|h[ôo]tel/i,
    admin:     /بلدية|رئاسة|mairie|préfecture|prefecture/i,
  };

  function _detectTypeHint(text) {
    for (const [type, re] of Object.entries(_TYPE_HINTS)) {
      if (re.test(text)) return type;
    }
    return null;
  }

  // Retourne { poi } si un repère précis a été identifié, { typeHint } si
  // seule une catégorie a été devinée, ou {} si rien n'a été compris.
  function _interpretLocationAnswer(text, lang, _context) {
    const cleaned = _stripRelational(text);
    const match = PoiDB.search(cleaned);
    if (match.found && match.poi && match.poi.type !== 'quartier') return { poi: match.poi, cleaned, matchType: match.match };

    // Repli : le texte brut (au cas où la préposition faisait partie d'un alias).
    if (cleaned !== text) {
      const rawMatch = PoiDB.search(text);
      if (rawMatch.found && rawMatch.poi && rawMatch.poi.type !== 'quartier') return { poi: rawMatch.poi, cleaned: text, matchType: rawMatch.match };
    }

    return { typeHint: _detectTypeHint(text), cleaned };
  }

  // target: 'origin' | 'dest' — la même logique d'affinage sert aux deux points.
  async function _startPrecisionFlow(loc, lang, target) {
    // Le nom du quartier doit lui aussi s'afficher dans la langue détectée
    // (loc.formatted est toujours le nom canonique français depuis PoiDB).
    const zoneLabel = (lang === 'ar' ? loc.nameAr : lang === 'ha' ? loc.nameHa : loc.formatted) || loc.formatted;

    // lat/lng présents pour les sources 'poi' | 'backend' | 'nominatim' —
    // absents pour 'mock' ou un texte jamais résolu ; _nextLandmarks se
    // rabat alors sur le regroupement par quartier (voir plus haut).
    _precisionZone     = {
      quartier: loc.quartier || null, label: zoneLabel,
      lat: typeof loc.lat === 'number' ? loc.lat : null,
      lng: typeof loc.lng === 'number' ? loc.lng : null,
    };
    _precisionCount    = 1;
    _precisionMax      = 3 + Math.floor(Math.random() * 3); // entre 3 et 5
    _precisionExcluded = [];
    _precisionTarget   = target;
    state = target === 'dest' ? STATE.AWAITING_DEST_PRECISION : STATE.AWAITING_ORIGIN_PRECISION;

    const landmarks = _nextLandmarks(lang);
    const msg = landmarks.length
      ? _fill(_t('ai.precision.intro', lang), { zone: zoneLabel, list: _landmarksList(landmarks, lang) })
      : _fill(_t('ai.precision.intro.nolist', lang), { zone: zoneLabel });
    await _aiReply(msg, lang, 400);
  }

  async function _handlePrecisionAnswer(text, lang, skipMatchConfirm = false) {
    _showTyping();
    const interpreted = NLU.interpretLocationAnswer(text, lang, _buildNluContext(lang));
    _hideTyping();

    // Réponse précise : un repère identifié (pas un simple quartier) ─────
    if (interpreted.poi) {
      const place = _poiName(interpreted.poi, lang);

      if (!skipMatchConfirm && interpreted.matchType === 'fuzzy') {
        const returnState = _precisionTarget === 'dest' ? STATE.AWAITING_DEST_PRECISION : STATE.AWAITING_ORIGIN_PRECISION;
        await _askMatchConfirm(_precisionTarget, place, lang, returnState);
        return;
      }

      const confirmMsg = _fill(_t('ai.precision.confirmed', lang), { place });
      await _aiReply(confirmMsg, lang, 350);
      await _finalizePrecisePlace(_precisionTarget, place, lang);
      return;
    }

    _precisionCount++;

    if (_precisionCount > _precisionMax) {
      // Limite atteinte : on retient le dernier repère proposé comme
      // position approximative plutôt que de boucler indéfiniment.
      const fallbackId = _precisionExcluded[0];
      const fallback    = fallbackId ? PoiDB.getById(fallbackId) : null;
      const place = fallback ? _poiName(fallback, lang) : (_precisionZone ? _precisionZone.label : text.trim());
      const giveupMsg = _fill(_t('ai.precision.giveup', lang), { place });
      await _aiReply(giveupMsg, lang, 400);
      await _finalizePrecisePlace(_precisionTarget, place, lang);
      return;
    }

    // Une catégorie a été devinée ("مسجد", "hôpital"...) sans lieu précis :
    // on oriente la prochaine suggestion vers ce type plutôt que de
    // proposer des types au hasard.
    const landmarks = _nextLandmarks(lang, interpreted.typeHint);
    const msg = landmarks.length
      ? _fill(_t('ai.precision.ask.landmarks', lang), { list: _landmarksList(landmarks, lang) })
      : _t('ai.precision.not.matched', lang);
    await _aiReply(msg, lang, 350);
  }

  function _resetPrecision() {
    _precisionZone     = null;
    _precisionCount    = 0;
    _precisionExcluded = [];
    _precisionTarget   = null;
  }

  // Point de sortie commun à l'origine ET la destination, une fois le point
  // confirmé précis (dès le départ, ou après affinage — d'où target passé
  // explicitement plutôt que lu depuis _precisionTarget, qui n'est déjà
  // plus renseigné quand le lieu était précis dès le premier message).
  // Redirige vers la suite normale du flux (comme avant l'ajout de la
  // précision), en tenant compte de _modifyingPoint pour le flux de modif.
  async function _finalizePrecisePlace(target, place, lang) {
    _resetPrecision();

    if (target === 'dest') {
      pendingDest = place;
      if (_modifyingPoint === 'dest') {
        _modifyingPoint = null;
        state = STATE.AWAITING_CONFIRM;
        await _resolveAndShowCard(lang);
        return;
      }
      const authUser = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
      pendingPhone = authUser ? authUser.phone : null;
      state = STATE.AWAITING_CONFIRM;
      await _resolveAndShowCard(lang);
      return;
    }

    // target === 'origin'
    pendingOrigin = place;
    if (_modifyingPoint === 'origin') {
      _modifyingPoint = null;
      state = STATE.AWAITING_CONFIRM;
      await _resolveAndShowCard(lang);
      return;
    }
    // Une destination avait déjà été donnée dans le même message que
    // l'origine ("de X à Y") : on la valide directement au lieu de
    // reposer la question — elle peut elle-même déclencher sa précision.
    if (_autoDest) {
      const destText = _autoDest;
      _autoDest = null;
      await _handleDestText(destText, lang);
      return;
    }
    state = STATE.AWAITING_DEST;
    await _aiReply(_t('ai.ask.dest', lang), lang);
  }

  // ── Confirmation obligatoire des correspondances approximatives ─────
  // Déclenchée quand une correspondance n'est PAS un nom/alias exact du
  // catalogue (score flou PoiDB, ou résolution Nominatim) : on ne
  // l'enregistre jamais comme départ/destination sans que l'utilisateur
  // confirme explicitement — voir _isApproximateMatch.
  async function _askMatchConfirm(target, place, lang, returnState) {
    _matchCandidate = { target, place, lang, returnState };
    state = target === 'dest' ? STATE.AWAITING_DEST_MATCH_CONFIRM : STATE.AWAITING_ORIGIN_MATCH_CONFIRM;
    await _aiReply(_fill(_t('ai.match.confirm', lang), { place }), lang, 300);
  }

  async function _handleMatchConfirmAnswer(text, lang, intent) {
    const candidate = _matchCandidate;
    _matchCandidate = null;
    if (!candidate) return; // garde-fou : ne devrait jamais arriver

    const trimmed = text.trim();
    const isPrecisionReturn = candidate.returnState === STATE.AWAITING_ORIGIN_PRECISION
      || candidate.returnState === STATE.AWAITING_DEST_PRECISION;

    // Oui -> on enregistre enfin le lieu proposé.
    if (trimmed === '1' || intent === 'CONFIRM') {
      if (isPrecisionReturn) {
        const confirmMsg = _fill(_t('ai.precision.confirmed', lang), { place: candidate.place });
        await _aiReply(confirmMsg, lang, 300);
      }
      await _finalizePrecisePlace(candidate.target, candidate.place, lang);
      return;
    }

    // Non -> on ne l'enregistre jamais ; on relance la question adaptée
    // selon d'où venait la proposition (1ère saisie ou précision en cours).
    if (trimmed === '2' || intent === 'CANCEL') {
      state = candidate.returnState;
      if (isPrecisionReturn) {
        const landmarks = _nextLandmarks(lang);
        const msg = landmarks.length
          ? _fill(_t('ai.precision.ask.landmarks', lang), { list: _landmarksList(landmarks, lang) })
          : _t('ai.precision.not.matched', lang);
        await _aiReply(msg, lang, 300);
      } else {
        await _aiReply(_t('ai.match.declined', lang), lang, 300);
      }
      return;
    }

    // Ni oui ni non : l'utilisateur a retapé/corrigé le lieu directement —
    // on retraite ce nouveau texte à sa place plutôt que de rester bloqué.
    state = candidate.returnState;
    if (isPrecisionReturn) {
      await _handlePrecisionAnswer(text, lang);
    } else if (candidate.target === 'dest') {
      await _handleDestText(text, lang);
    } else {
      await _handleOriginText(text, lang);
    }
  }

  // ── Traitement du texte d'origine — partagé entre l'état AWAITING_ORIGIN
  // et l'extraction combinée depuis REQUEST_TRANSPORT ("de X à Y" en un
  // seul message). Ne suppose pas que `state` vaut déjà AWAITING_ORIGIN.
  // `skipMatchConfirm` : vrai quand le texte vient d'un clic explicite sur
  // une suggestion d'autocomplétion — un choix délibéré dans une liste
  // réelle n'est jamais une "supposition" à reconfirmer (voir maps.js).
  async function _handleOriginText(text, lang, skipMatchConfirm = false) {
    // Si le texte contient lui-même un trajet complet ("de X à Y"), on
    // isole l'origine et on mémorise la destination pour plus tard — sauf
    // en flux de modification (_modifyingPoint), où la destination existe
    // déjà et ne doit pas être écrasée après coup.
    const route = NLU.extractRoute(text, lang, _buildNluContext(lang));
    const originText = route ? route.origin : text;
    if (route && !_autoDest && !_modifyingPoint) _autoDest = route.dest;

    Maps.hideSuggestions();
    _showTyping();
    const locO = await _validateLocation(originText, lang);
    _hideTyping();

    if (!locO.found && _originRetries < 2) {
      _originRetries++;
      const msg = locO.suggestion
        ? _fill(_t('ai.location.suggest', lang), { place: originText, suggestion: locO.suggestion })
        : _fill(_t('ai.location.not.found', lang), { place: originText });
      await _aiReply(msg, lang, 350);
      return;
    }
    _originRetries = 0;

    // ── Localisation intelligente : un simple quartier n'est pas assez précis.
    // Un texte jamais résolu (même après les 2 relances) n'est pas plus
    // fiable qu'un quartier vague — on affine dans les deux cas plutôt
    // que d'accepter tel quel.
    if (!locO.found || _isVagueLocation(locO)) {
      const zoneLoc = locO.found ? locO : { found: true, formatted: locO.suggestion || originText, quartier: null };
      await _startPrecisionFlow(zoneLoc, lang, 'origin');
      return;
    }

    if (!skipMatchConfirm && _isApproximateMatch(locO)) {
      await _askMatchConfirm('origin', locO.formatted, lang, STATE.AWAITING_ORIGIN);
      return;
    }

    await _finalizePrecisePlace('origin', locO.formatted, lang);
  }

  // ── Traitement du texte de destination — partagé entre l'état
  // AWAITING_DEST et l'enchaînement automatique depuis _autoDest.
  async function _handleDestText(text, lang, skipMatchConfirm = false) {
    Maps.hideSuggestions();
    _showTyping();
    const locD = await _validateLocation(text, lang);
    _hideTyping();

    if (!locD.found && _destRetries < 2) {
      _destRetries++;
      const msg = locD.suggestion
        ? _fill(_t('ai.location.suggest.dest', lang), { place: text, suggestion: locD.suggestion })
        : _fill(_t('ai.location.not.found.dest', lang), { place: text });
      await _aiReply(msg, lang, 350);
      return;
    }
    _destRetries = 0;

    // ── Localisation intelligente : idem pour la destination (voir la
    // même logique côté origine juste au-dessus) ─────────────────────
    if (!locD.found || _isVagueLocation(locD)) {
      const zoneLoc = locD.found ? locD : { found: true, formatted: locD.suggestion || text, quartier: null };
      await _startPrecisionFlow(zoneLoc, lang, 'dest');
      return;
    }

    if (!skipMatchConfirm && _isApproximateMatch(locD)) {
      await _askMatchConfirm('dest', locD.formatted, lang, STATE.AWAITING_DEST);
      return;
    }

    await _finalizePrecisePlace('dest', locD.formatted, lang);
  }

  // ── Intégration OpenAI (app/ai/ + routes/ai_chat.py côté backend) ──
  // Utilisée UNIQUEMENT pour les messages "libres" (salutations, aide
  // générale, questions hors métier) — jamais pour la réservation, le
  // suivi, l'annulation ou la confirmation, qui continuent d'être gérés
  // en dur par la machine à états ci-dessus, que l'IA soit disponible ou
  // non (voir AI_ELIGIBLE_INTENTS dans processInput ci-dessous).
  function _setSendEnabled(enabled) {
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  // Tente une réponse via OpenAI pour un message hors métier. Retourne
  // `true` si l'IA a répondu (message déjà affiché) — le code appelant ne
  // doit alors rien faire de plus. Retourne `false` si l'IA est
  // indisponible (timeout, réseau, erreur serveur) : le code appelant
  // doit alors continuer normalement vers le moteur de règles, exactement
  // comme si cette tentative n'avait jamais eu lieu (repli silencieux,
  // seule une petite notification discrète prévient l'utilisateur).
  async function _tryAIReply(text, lang) {
    _setSendEnabled(false);
    _showTyping();

    const result = await AIChatClient.sendMessage(text, lang);

    _setSendEnabled(true);

    if (!result.ok) {
      _hideTyping();
      if (!_aiOfflineNotified) {
        _aiOfflineNotified = true;
        Notifications.toast(_t('ai.fallback.notice', lang), 'warning', 3000);
      }
      return false;
    }

    _aiOfflineNotified = false;
    // delay=0 : l'attente réseau réelle a déjà servi de "temps de réflexion" ;
    // _aiReply gère l'affichage (bulle, avatar, heure) exactement comme pour
    // le moteur de règles, donc aucun changement visuel/design.
    await _aiReply(result.data.response, lang, 0);
    return true;
  }

  // ── Main processInput — called by Chat UI and Call mode ─────────
  // options: { mode: 'chat'|'call', onSpoken: callback }
  async function processInput(text, options = {}) {
    if (!text || !text.trim()) return;

    _currentMode = options.mode || 'chat';
    _onSpokenCb  = options.onSpoken || null;

    // Detect language from user's text (not UI language). Falls back to
    // the conversation's last established language when this message has
    // no real linguistic signal either way (e.g. a bare Latin place name
    // like "teyarett" mid-Arabic conversation) — see lang-detect.js.
    const lang = LangDetect.detect(text, _lastLang);
    _lastLang  = lang;

    // Add user message to chat (call mode adds it separately before calling processInput)
    if (_currentMode === 'chat') {
      const userMsg = { role: 'user', text, time: _nowTime(), isVoice: options.isVoice || false };
      messages.push(userMsg);
      _renderMessage(userMsg);
    }

    const intent = NLU.detectIntent(text, _buildNluContext(lang));

    // Sync voice recognition language to detected language
    if (typeof Voice !== 'undefined') Voice.setActiveLang(lang);

    // ── Repli vers OpenAI pour les messages hors métier ──────────────
    // Toute intention métier (réservation, annulation, suivi, confirmation,
    // modification, historique, carte) et tout message reçu au milieu d'un
    // flux en cours (state !== IDLE) continue d'être traitée exclusivement
    // par le moteur de règles ci-dessous — l'IA n'est jamais sollicitée
    // dans ces cas, qu'elle soit disponible ou non (voir consigne :
    // "OpenAI ne doit pas remplacer cette logique"). Seuls les messages
    // "libres" (salutation, demande d'aide générale, question hors métier
    // ou non reconnue) passent par OpenAI en premier ; en cas d'échec, le
    // code continue normalement vers le switch(intent) plus bas, comme si
    // cet essai n'avait pas eu lieu.
    const AI_ELIGIBLE_INTENTS = ['GREET', 'HELP', 'UNKNOWN'];
    const aiEligible = _currentMode === 'chat'
      && state === STATE.IDLE
      && AI_ELIGIBLE_INTENTS.includes(intent)
      && typeof AIChatClient !== 'undefined';

    if (aiEligible) {
      const handledByAI = await _tryAIReply(text, lang);
      if (handledByAI) return;
      // Sinon : repli silencieux, on continue vers le moteur de règles.
    }

    // ── Global intent override ─────────────────────────────────────
    // CANCEL_TRIP / STATUS / HELP / HISTORY / MAP always interrupt any
    // in-progress booking flow and are routed to the IDLE switch below.
    const _GLOBAL = ['CANCEL_TRIP', 'STATUS', 'HELP', 'HISTORY', 'MAP'];
    if (_GLOBAL.includes(intent) && state !== STATE.AWAITING_CANCEL_CONF) {
      if (state !== STATE.IDLE) {
        pendingOrigin = null; pendingDest = null; pendingEstimate = null;
        pendingGeoData = null; _modifyingPoint = null; pendingPhone = null;
        _originRetries = 0; _destRetries = 0;
        _resetPrecision();
        _autoDest = null;
        _matchCandidate = null;
        state = STATE.IDLE;
      }
      // Fall through to the switch statement (no return here)
    }

    // ── State-aware handlers ──────────────────────────────────────

    if (state === STATE.AWAITING_ORIGIN) {
      if (intent === 'CANCEL') { await _handleCancel(lang); return; }
      await _handleOriginText(text.trim(), lang, !!options.explicitSelection);
      return;
    }

    if (state === STATE.AWAITING_ORIGIN_PRECISION || state === STATE.AWAITING_DEST_PRECISION) {
      if (intent === 'CANCEL') { await _handleCancel(lang); return; }
      await _handlePrecisionAnswer(text.trim(), lang, !!options.explicitSelection);
      return;
    }

    if (state === STATE.AWAITING_ORIGIN_MATCH_CONFIRM || state === STATE.AWAITING_DEST_MATCH_CONFIRM) {
      await _handleMatchConfirmAnswer(text.trim(), lang, intent);
      return;
    }

    if (state === STATE.AWAITING_DEST) {
      if (intent === 'CANCEL') { await _handleCancel(lang); return; }
      await _handleDestText(text.trim(), lang, !!options.explicitSelection);
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

    if (state === STATE.AWAITING_CANCEL_CONF) {
      if (intent === 'CONFIRM') { await _doCancel(lang); return; }
      if (intent === 'CANCEL')  {
        state = STATE.IDLE;
        pendingCancel = null;
        await _aiReply(_t('ai.how.help', lang), lang, 500);
        return;
      }
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
        // Le message donne peut-être déjà les deux lieux en une phrase
        // ("Je veux aller de Ksar à Tevragh Zeina") — on essaie de les
        // extraire directement au lieu de reposer la question de l'origine.
        const route = NLU.extractRoute(text, lang, _buildNluContext(lang));
        if (route) {
          _autoDest = route.dest;
          await _handleOriginText(route.origin, lang);
        } else {
          state = STATE.AWAITING_ORIGIN;
          await _aiReply(_t('ai.ask.origin', lang), lang);
        }
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
    _resetPrecision();
    _autoDest       = null;
    Maps.hideSuggestions();
    Maps.destroyMap();
    await _aiReply(_t('ai.cancelled', lang), lang, 450);
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
        // explicitSelection: un choix délibéré dans une vraie liste de
        // suggestions n'est jamais une "supposition" à reconfirmer.
        processInput(selectedName, { mode: 'chat', explicitSelection: true });
      }
    });

    if (inputEl) {
      inputEl.addEventListener('input', () => {
        // Aussi actif pendant la phase de précision (l'utilisateur y tape
        // le nom d'un repère) — pas seulement sur la 1ère saisie du lieu.
        if (state === STATE.AWAITING_ORIGIN || state === STATE.AWAITING_DEST
            || state === STATE.AWAITING_ORIGIN_PRECISION || state === STATE.AWAITING_DEST_PRECISION) {
          const lang = LangDetect.detect(inputEl.value, _lastLang) || I18n.getLang();
          Maps.triggerAutocomplete(inputEl.value, lang);
        } else {
          Maps.hideSuggestions();
        }
      });
      // Fermer suggestions quand on blur (délai pour permettre le clic)
      inputEl.addEventListener('blur', () => setTimeout(() => Maps.hideSuggestions(), 200));
    }

    _attachCardListeners();

    // Démarre le suivi de connexion IA (met à jour l'indicateur "IA
    // connectée" / "Mode hors ligne" dans l'en-tête) — n'affecte en rien
    // le reste de l'init si AIChatClient n'est pas chargé.
    if (typeof AIChatClient !== 'undefined') AIChatClient.startHealthMonitor();
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
    _resetPrecision();
    _autoDest        = null;
    if (typeof Voice !== 'undefined') Voice.setActiveLang(null);
    _currentMode    = 'chat';
    _onSpokenCb     = null;
    Maps.hideSuggestions();
    Maps.destroyMap();
    // Nouvelle conversation IA (historique côté backend repart de zéro,
    // voir ConversationMemory) — cohérent avec la remise à zéro de state.
    if (typeof AIChatClient !== 'undefined') AIChatClient.resetConversation();
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
