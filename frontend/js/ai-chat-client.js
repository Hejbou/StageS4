/* ════════════════════════════════════════════
   ai-chat-client.js — Client HTTP pour la nouvelle API IA (OpenAI)
   ════════════════════════════════════════════
   Isole tout ce qui touche à POST /api/chat/ai : l'appel réseau (avec
   timeout), le suivi de connexion (indicateur "IA connectée" / "Mode hors
   ligne" injecté dans l'en-tête) et l'identifiant de conversation.

   chat.js s'en sert UNIQUEMENT pour les messages libres/génériques (voir
   AI_ELIGIBLE_INTENTS dans chat.js) — jamais pour la réservation, le
   suivi, l'annulation ou la confirmation, qui restent entièrement gérés
   par le moteur de règles existant, disponible ou non.

   Fichier 100% nouveau : ne remplace ni ne modifie aucun script existant.
   Chargé après notifications.js (réutilisé pour la notification discrète
   de repli) et avant chat.js (qui l'appelle) — voir index.html.
   ════════════════════════════════════════════ */

const AIChatClient = (() => {
  // ── Configuration ──────────────────────────────────────────────
  const ENDPOINT   = 'http://localhost:5000/api/chat/ai';
  const HEALTH_URL = 'http://localhost:5000/api/health';
  const TIMEOUT_MS = 10000;             // au-delà, on considère l'IA indisponible
  const HEALTH_CHECK_INTERVAL_MS = 30000; // vérif passive périodique (indicateur header)

  // Un seul identifiant de conversation par session d'onglet — repart de
  // zéro à chaque rechargement, cohérent avec resetState() dans chat.js
  // (pas de persistance long terme voulue ici, voir conversation_memory.py
  // côté backend qui est lui-même en mémoire process).
  let _conversationId = null;
  let _isOnline = null;      // null = pas encore vérifié ; true/false ensuite
  let _healthTimer  = null;

  function _newConversationId() {
    return 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function getConversationId() {
    if (!_conversationId) _conversationId = _newConversationId();
    return _conversationId;
  }

  // Repart sur une conversation IA neuve (ex: après resetState() dans chat.js).
  function resetConversation() {
    _conversationId = _newConversationId();
  }

  // ── Indicateur de connexion "● IA connectée" / "● Mode hors ligne" ──
  // Injecté par JS à côté du sous-titre de l'en-tête (#lbl-subtitle) :
  // aucune modification d'index.html ni des fichiers CSS existants —
  // seulement des styles inline sur cet élément, pour ne toucher à aucune
  // règle de design déjà en place.
  function _ensureIndicatorEl() {
    let el = document.getElementById('ai-status-indicator');
    if (el) return el;
    const subtitle = document.getElementById('lbl-subtitle');
    if (!subtitle || !subtitle.parentElement) return null;

    el = document.createElement('span');
    el.id = 'ai-status-indicator';
    el.style.cssText =
      'display:inline-flex;align-items:center;gap:4px;margin-top:2px;' +
      'font-size:10.5px;font-weight:600;line-height:1;';
    subtitle.parentElement.appendChild(el);
    return el;
  }

  function _t(key, lang) {
    // Réutilise le système de traduction déjà en place (translations/*.js)
    // sans dupliquer de texte en dur ici — voir _t() dans chat.js.
    const src = { fr: window.LANG_FR || {}, ar: window.LANG_AR || {}, ha: window.LANG_HA || {} };
    const d = src[lang] || {};
    const fb = src.fr || {};
    return d[key] !== undefined ? d[key] : (fb[key] !== undefined ? fb[key] : key);
  }

  function _setIndicator(online) {
    const el = _ensureIndicatorEl();
    if (!el) return;
    const lang  = (typeof I18n !== 'undefined') ? I18n.getLang() : 'fr';
    const label = online ? _t('ai.status.online', lang) : _t('ai.status.offline', lang);
    // Couleurs déjà utilisées ailleurs dans l'app (var(--success) pour "ok",
    // gris neutre pour "hors ligne") — aucune nouvelle couleur introduite.
    const dotColor = online ? '#059669' : '#94A3B8';
    el.innerHTML =
      `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};"></span>` +
      `<span>${label}</span>`;
  }

  // ── Vérification passive de disponibilité du backend IA ─────────
  // S'appuie sur /api/health (route déjà existante, aucun effet de bord)
  // uniquement pour tenir l'indicateur à jour, y compris avant que
  // l'utilisateur n'envoie son premier message.
  async function checkConnection() {
    try {
      const ctrl = new AbortController();
      const tmo  = setTimeout(() => ctrl.abort(), 4000);
      const res  = await fetch(HEALTH_URL, { signal: ctrl.signal });
      clearTimeout(tmo);
      _isOnline = res.ok;
    } catch (_) {
      _isOnline = false;
    }
    _setIndicator(_isOnline);
    return _isOnline;
  }

  function startHealthMonitor() {
    checkConnection();
    if (_healthTimer) clearInterval(_healthTimer);
    _healthTimer = setInterval(checkConnection, HEALTH_CHECK_INTERVAL_MS);
  }

  function isOnline() {
    return _isOnline !== false; // optimiste tant qu'aucun échec n'a été observé
  }

  // ── Appel principal : POST /api/chat/ai ──────────────────────────
  // Ne lève JAMAIS d'exception : retourne toujours { ok, data } ou
  // { ok:false, reason }, pour que chat.js n'ait qu'à tester `.ok` avant
  // de basculer sur le moteur de règles — jamais d'erreur technique
  // remontée jusqu'à l'utilisateur (voir _tryAIReply dans chat.js).
  async function sendMessage(message, language) {
    const ctrl = new AbortController();
    const tmo  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          language,
          conversation_id: getConversationId(),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tmo);

      if (!res.ok) {
        _isOnline = false;
        _setIndicator(false);
        return { ok: false, reason: 'http_' + res.status };
      }

      const data = await res.json();
      if (!data || data.success !== true || typeof data.response !== 'string') {
        _isOnline = false;
        _setIndicator(false);
        return { ok: false, reason: 'invalid_response' };
      }

      _isOnline = true;
      _setIndicator(true);
      return { ok: true, data };
    } catch (_exc) {
      // Timeout (AbortError) ou réseau indisponible — traité de la même
      // façon : on repasse la main au moteur de règles sans jamais exposer
      // le détail technique de l'échec à l'utilisateur.
      clearTimeout(tmo);
      _isOnline = false;
      _setIndicator(false);
      return { ok: false, reason: 'network' };
    }
  }

  return {
    sendMessage,
    checkConnection,
    startHealthMonitor,
    isOnline,
    getConversationId,
    resetConversation,
  };
})();
