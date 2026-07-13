/* ════════════════════════════════════════════
   tts_controller.js — UI de la lecture vocale des réponses
   ════════════════════════════════════════════
   Ajoute, SANS modifier chat.js ni index.html :
    - un petit bouton discret "🔊 Lire" à côté de chaque réponse du
      chatbot (observé dynamiquement via MutationObserver sur #messages,
      exactement comme ai-chat-client.js injecte son indicateur de
      connexion sans toucher au code existant) ;
    - un bouton global dans l'en-tête pour activer/désactiver la lecture
      automatique des réponses (état persisté en localStorage).

   Ne s'active JAMAIS pendant le mode Appel (#call-overlay visible) :
   ce mode a déjà sa propre lecture vocale complète (Voice.speak, voir
   frontend/js/voice.js + call.js) — aucun risque de double lecture.

   Dégradation silencieuse totale si SpeechSynthesis est indisponible :
   mount() ne fait alors rien, aucune erreur JS, le chat continue de
   fonctionner normalement (voir _mounted/isSupported ci-dessous).
   ════════════════════════════════════════════ */

const TTSController = (() => {
  const STORAGE_KEY = 'chatia_tts_autoread';

  let _mounted   = false;
  let _activeBtn = null; // bouton actuellement en lecture (un seul à la fois)

  // ── Lecture forcée de la toute prochaine réponse IA ───────────────
  // Utilisé par frontend/js/voice-conversation.js (conversation vocale
  // complète) pour lire automatiquement la réponse qui suit un message
  // envoyé par la voix, indépendamment du réglage global ci-dessous
  // (l'utilisateur peut très bien avoir la lecture auto désactivée en
  // temps normal, mais s'attendre à entendre la réponse quand il vient
  // de PARLER). Un seul indicateur consommé par le tout prochain message
  // IA rendu, avec expiration de sécurité pour ne jamais rester "armé"
  // indéfiniment si, pour une raison quelconque, aucun message ne suit.
  let _forceNextRead    = false;
  let _forceHandlers    = null;
  let _forceExpireTimer = null;

  // Textes propres à ce module, volontairement autonomes plutôt que
  // d'ajouter de nouvelles clés dans translations/*.js — même choix que
  // voice_ui.js (Prompt 3) pour garder toute la fonctionnalité "voix"
  // auto-contenue dans son propre dossier.
  const LABELS = {
    read:           { fr: 'Lire', ar: 'استماع', ha: 'سمع' },
    stop:           { fr: 'Stop', ar: 'إيقاف', ha: 'وقف' },
    toggleTitleOn:  { fr: 'Désactiver la lecture automatique', ar: 'إيقاف القراءة التلقائية', ha: 'وقف القراءة التلقائية' },
    toggleTitleOff: { fr: 'Activer la lecture automatique',   ar: 'تفعيل القراءة التلقائية',  ha: 'شغل القراءة التلقائية' },
    autoOn:         { fr: 'Lecture automatique activée',   ar: 'تم تفعيل القراءة التلقائية', ha: 'تفعيل القراءة التلقائية' },
    autoOff:        { fr: 'Lecture automatique désactivée', ar: 'تم إيقاف القراءة التلقائية', ha: 'إيقاف القراءة التلقائية' },
    errNoVoice:     { fr: 'Aucune voix installée pour cette langue, voix par défaut utilisée.',
                       ar: 'لا يوجد صوت لهذه اللغة، تم استعمال الصوت الافتراضي.',
                       ha: 'ما كاين صوت لهاذ اللغة، تنستعملو الصوت الافتراضي.' },
    errGeneric:     { fr: 'Lecture vocale interrompue.', ar: 'تعذرت القراءة الصوتية.', ha: 'ما نجمتش نقرا بالصوت.' },
  };

  function _uiLang() {
    return (typeof I18n !== 'undefined' && I18n.getLang) ? I18n.getLang() : 'fr';
  }

  function _label(key) {
    const set = LABELS[key] || LABELS.read;
    return set[_uiLang()] || set.fr;
  }

  function _notify(text, type) {
    try {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast(text, type || 'info', 3000);
      }
    } catch (_) { /* jamais bloquant */ }
  }

  // ── Persistance du réglage "lecture automatique" ─────────────────
  function _autoReadEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }

  function _setAutoRead(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (_) { /* état non persistant, sans conséquence */ }
  }

  // ── Mode Appel : cette UI ne s'active jamais par-dessus lui ──────
  function _isCallActive() {
    const overlay = document.getElementById('call-overlay');
    return !!(overlay && !overlay.classList.contains('hidden'));
  }

  // ── Styles injectés une seule fois, scoppés sous .tts-* ──────────
  // Aucune modification d'un fichier .css existant — même approche que
  // voice_ui.js (Prompt 3).
  function _injectStyles() {
    if (document.getElementById('tts-styles')) return;
    const style = document.createElement('style');
    style.id = 'tts-styles';
    style.textContent = `
      .tts-speak-btn {
        display: inline-flex; align-items: center; gap: 4px;
        margin-top: 6px; padding: 3px 9px;
        font-size: 11px; font-weight: 600; font-family: var(--font, inherit);
        color: var(--text-3, #78776F);
        background: var(--surface-2, #F4F4F2);
        border: 1px solid var(--border, #ECEBE7);
        border-radius: var(--r-full, 9999px);
        cursor: pointer;
        transition: all 150ms ease;
      }
      .tts-speak-btn:hover { background: var(--surface-3, #ECECE9); color: var(--text, #1C1C1A); }
      .tts-speak-btn.tts-playing {
        color: var(--accent, #1C1C1A);
        background: var(--accent-l, #F2F2F0);
        border-color: var(--accent-100, #E7E7E3);
      }
      .tts-speak-btn .tts-icon { font-size: 12px; line-height: 1; }
      .tts-toggle-btn.tts-on { color: var(--success, #059669); background: var(--success-l, #ECFDF5); }
    `;
    document.head.appendChild(style);
  }

  // ── Bouton "🔊 Lire" par message IA ───────────────────────────────
  function _buildButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tts-speak-btn';
    btn.innerHTML = `<span class="tts-icon">🔊</span><span class="tts-label">${_label('read')}</span>`;
    btn.setAttribute('aria-label', _label('read'));
    return btn;
  }

  function _setPlaying(btn) {
    btn.classList.add('tts-playing');
    btn.querySelector('.tts-icon').textContent = '⏸';
    btn.querySelector('.tts-label').textContent = _label('stop');
  }

  function _setIdle(btn) {
    btn.classList.remove('tts-playing');
    const icon = btn.querySelector('.tts-icon');
    const label = btn.querySelector('.tts-label');
    if (icon) icon.textContent = '🔊';
    if (label) label.textContent = _label('read');
  }

  // `extra` (optionnel) : handlers { onStart, onEnd, onError } d'un appelant
  // externe (voir speakNextReply ci-dessous) — chaînés après la mise à jour
  // normale du bouton, jamais à sa place, pour que l'état visuel du bouton
  // reste toujours cohérent avec ce qui est réellement en train d'être lu.
  function _startReading(btn, text, extra) {
    // Une seule lecture à la fois : réinitialise visuellement le bouton
    // précédemment actif (SpeechOutput.speak() interrompt déjà la lecture
    // en cours côté moteur — voir speech_output.js, this.stop() interne).
    if (_activeBtn && _activeBtn !== btn) _setIdle(_activeBtn);

    const lang = (typeof LangDetect !== 'undefined') ? LangDetect.detect(text, _uiLang()) : _uiLang();
    _activeBtn = btn;
    _setPlaying(btn);

    SpeechOutput.speak(text, lang, {
      onStart: () => { if (extra && extra.onStart) extra.onStart(); },
      onEnd: () => {
        if (_activeBtn === btn) _activeBtn = null;
        _setIdle(btn);
        if (extra && extra.onEnd) extra.onEnd();
      },
      onError: (reason) => {
        if (_activeBtn === btn) _activeBtn = null;
        _setIdle(btn);
        if (reason === 'no-voice') _notify(_label('errNoVoice'), 'info');
        else if (reason !== 'unsupported') _notify(_label('errGeneric'), 'warning');
        if (extra && extra.onError) extra.onError(reason);
      },
    });
  }

  // Arme la lecture automatique de la toute prochaine réponse IA rendue,
  // quel que soit le réglage global de lecture auto. `handlers` optionnel :
  // { onStart, onEnd, onError } — utile à l'appelant (voice-conversation.js)
  // pour piloter son propre indicateur de phase ("🔊 Lecture...").
  function speakNextReply(handlers) {
    _forceNextRead = true;
    _forceHandlers = handlers || null;
    clearTimeout(_forceExpireTimer);
    // Filet de sécurité : si aucun message IA n'est jamais rendu après cet
    // appel (texte vide, flux interrompu...), on ne reste pas "armé" pour
    // un message sans rapport bien plus tard dans la conversation.
    _forceExpireTimer = setTimeout(() => {
      _forceNextRead = false;
      _forceHandlers = null;
    }, 20000);
  }

  function _wireButton(btn, text) {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('tts-playing')) {
        SpeechOutput.stop();
        _setIdle(btn);
        if (_activeBtn === btn) _activeBtn = null;
      } else {
        _startReading(btn, text);
      }
    });
  }

  // Ajoute le bouton de lecture à un message IA nouvellement rendu par
  // chat.js (_renderMessage). Ignore silencieusement les messages sans
  // texte (carte seule) ou tout élément déjà câblé.
  function _wireMessage(node) {
    if (_isCallActive()) return;
    if (node.querySelector('.tts-speak-btn')) return;

    const bubble  = node.querySelector('.msg-bubble');
    const content = node.querySelector('.msg-content');
    if (!bubble || !content) return;

    const text = bubble.textContent.trim();
    if (!text) return;

    const btn = _buildButton();
    content.appendChild(btn);
    _wireButton(btn, text);

    if (_forceNextRead) {
      const extra = _forceHandlers;
      _forceNextRead = false;
      _forceHandlers = null;
      clearTimeout(_forceExpireTimer);
      _startReading(btn, text, extra);
    } else if (_autoReadEnabled()) {
      _startReading(btn, text);
    }
  }

  function _observeMessages() {
    const list = document.getElementById('messages');
    if (!list) return;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('message') && node.classList.contains('ai')) {
            _wireMessage(node);
          }
        });
      });
    });
    observer.observe(list, { childList: true });
  }

  // ── Bouton global "lecture automatique on/off" dans l'en-tête ────
  // Injecté dans .header-right, juste avant le bouton notifications —
  // même technique non-invasive que ai-chat-client.js (_ensureIndicatorEl) :
  // aucune modification d'index.html.
  function _renderToggle(btn) {
    const on = _autoReadEnabled();
    btn.classList.toggle('tts-on', on);
    const title = _label(on ? 'toggleTitleOn' : 'toggleTitleOff');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = `<span class="tts-toggle-icon">${on ? '🔊' : '🔇'}</span>`;
  }

  function _mountGlobalToggle() {
    if (document.getElementById('tts-autoread-btn')) return;
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'tts-autoread-btn';
    btn.className = 'icon-btn tts-toggle-btn';
    _renderToggle(btn);

    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) headerRight.insertBefore(btn, notifBtn);
    else headerRight.appendChild(btn);

    btn.addEventListener('click', () => {
      const next = !_autoReadEnabled();
      _setAutoRead(next);
      _renderToggle(btn);
      _notify(_label(next ? 'autoOn' : 'autoOff'), 'success');
      if (!next) {
        SpeechOutput.stop();
        if (_activeBtn) { _setIdle(_activeBtn); _activeBtn = null; }
      }
    });
  }

  // ── Point d'entrée ─────────────────────────────────────────────
  function mount() {
    if (_mounted) return;
    if (!TTSEngine.isSupported()) return; // dégradation silencieuse totale, aucune erreur JS
    _mounted = true;
    _injectStyles();
    _mountGlobalToggle();
    _observeMessages();
  }

  return { mount, speakNextReply };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof TTSEngine === 'undefined' || typeof SpeechOutput === 'undefined') return; // dépendances absentes : aucune erreur
  TTSController.mount();
});
