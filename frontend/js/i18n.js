/* ════════════════════════════════════════════
   js/i18n.js — Internationalisation
   Lit les traductions depuis :
     translations/fr.js  → window.LANG_FR
     translations/ar.js  → window.LANG_AR
     translations/ha.js  → window.LANG_HA
   Ces fichiers doivent être chargés AVANT i18n.js
   dans index.html via des balises <script>.

   API publique :
     I18n.t(key)               → chaîne traduite
     I18n.setLang('fr'|'ar'|'ha') → change la langue
     I18n.getLang()            → langue courante
     I18n.applyTranslations()  → rafraîchit le DOM
   ════════════════════════════════════════════ */

const I18n = (() => {
  let currentLang = 'fr';

  // ── Sources : chaque entrée pointe vers le global injecté par son fichier ──
  const sources = {
    fr: () => window.LANG_FR || {},
    ar: () => window.LANG_AR || {},
    ha: () => window.LANG_HA || {},
  };

  // Cache aplati : langue cible + fallback français
  let _cache = {};

  function _buildCache(lang) {
    const base    = sources['fr'] ? sources['fr']() : {};
    const overlay = sources[lang] ? sources[lang]() : {};
    // Fusion : les clés de la langue cible écrasent le français
    _cache = Object.assign({}, base, overlay);
  }

  // ── Lecture d'une clé ────────────────────────
  function t(key) {
    return (_cache[key] !== undefined) ? _cache[key] : key;
  }

  // ── Changement de langue ──────────────────────
  function setLang(lang) {
    if (!sources[lang]) return;
    currentLang = lang;

    const htmlEl = document.getElementById('html-root');
    if (lang === 'ar' || lang === 'ha') {
      htmlEl.setAttribute('dir', 'rtl');
      htmlEl.setAttribute('lang', lang === 'ar' ? 'ar' : 'ar-MR');
    } else {
      htmlEl.setAttribute('dir', 'ltr');
      htmlEl.setAttribute('lang', 'fr');
    }

    _buildCache(lang);
    applyTranslations();
  }

  function getLang() { return currentLang; }

  // ── Traduction du DOM ─────────────────────────
  // Table id → clé  (tous les textes statiques de l'interface)
  const DOM_MAP = {
    'lbl-subtitle':       'lbl.subtitle',
    'lbl-requests-title': 'lbl.requests.title',
    'lbl-history-title':  'lbl.history.title',
    'lbl-clear':          'lbl.clear',
    'lbl-voice-cancel':   'lbl.voice.cancel',
    'lbl-notif-title':    'lbl.notif.title',
    'lbl-mark-read':      'lbl.mark.read',
    'lbl-no-notif':       'lbl.no.notif',
    'lbl-no-notif-sub':   'lbl.no.notif.sub',
    'nav-lbl-chat':       'nav.chat',
    'nav-lbl-requests':   'nav.requests',
    'nav-lbl-map':        'nav.map',
    'nav-lbl-history':    'nav.history',
    'chip-request':       'chip.request',
    'chip-status':        'chip.status',
    'chip-cancel':        'chip.cancel',
    'chip-help':          'chip.help',
    'req-bar-btn':        'req.bar.view',
    'voice-status':       'voice.listening',
    'call-btn-label':     'call.btn.start',
    'call-btn-end-label': 'call.btn.end',
    'call-status-text':   'call.status.idle',
    'vrb-status':         'mic.recording',
    'mv-mode-origin':        'mv.mode.origin',
    'mv-mode-dest':          'mv.mode.dest',
    'mv-price-label-text':   'mv.price.label',
    'mv-book-lbl':           'mv.book',
    'mv-cancel-route-lbl':   'mv.cancel.route',

    // ── User settings modal ───────────────────────
    'settings-lbl-title':       'settings.title',
    'settings-lbl-edit-name':   'settings.edit.name',
    'settings-save-btn':        'settings.save',
    'settings-lbl-lang':        'settings.lang',
    'settings-lbl-since-label': 'settings.since',
    'settings-lbl-trips-label': 'settings.trips',
    'settings-lbl-logout':      'settings.logout',
  };

  function applyTranslations() {
    for (const [id, key] of Object.entries(DOM_MAP)) {
      const el = document.getElementById(id);
      if (el) el.textContent = t(key);
    }
    const input = document.getElementById('chat-input');
    if (input) input.placeholder = t('input.placeholder');

    const mvOrig = document.getElementById('mv-origin-input');
    if (mvOrig) mvOrig.placeholder = t('mv.origin.placeholder');
    const mvDest = document.getElementById('mv-dest-input');
    if (mvDest) mvDest.placeholder = t('mv.dest.placeholder');

    const settingsInput = document.getElementById('settings-name-input');
    if (settingsInput) settingsInput.placeholder = t('settings.name.placeholder');
  }

  // ── Initialisation ────────────────────────────
  _buildCache('fr');   // cache français par défaut

  return { t, setLang, getLang, applyTranslations };
})();
