/* ════════════════════════════════════════════
   voice-conversation.js — Conversation vocale complète (bout en bout)
   ════════════════════════════════════════════
   Relie entre eux, SANS RIEN RÉÉCRIRE, les modules déjà existants :

     🎤 STT   → frontend/js/voice/ (Prompt 3 — VoiceInputService, inchangé)
     💬 Envoi → Chat.processInput (chat.js — moteur de règles + repli IA,
                inchangé, voir AI_ELIGIBLE_INTENTS : la réservation, le
                suivi, l'annulation... restent TOUJOURS gérés en dur,
                qu'OpenAI soit disponible ou non)
     🧠 IA    → AIChatClient / ConversationMemory / backend (inchangés)
     🔊 TTS   → frontend/js/tts/ (Prompt 4 — SpeechOutputService, inchangé)

   Ce fichier n'ajoute qu'UNE seule chose : l'enchaînement automatique
   entre ces briques quand l'utilisateur utilise le micro, via :
    - un évènement DOM générique déjà émis par voice/voice.js
      ('chatia:voice-final-transcript') — aucune modification du bouton
      micro ni de son câblage dans app.js ;
    - TTSController.speakNextReply(), déjà exposé par tts_controller.js
      pour lire automatiquement LA PROCHAINE réponse IA sans dupliquer sa
      logique de bouton/état.

   Ne s'active jamais en mode Appel (call.js a déjà sa propre boucle vocale
   complète, totalement séparée) — voir _isCallActive().
   ════════════════════════════════════════════ */

const VoiceConversation = (() => {
  let _busy           = false; // anti double-envoi / double-lecture sur des transcriptions rapprochées
  let _genPhaseTimer  = null;
  let _busyFallback   = null;

  // Textes des indicateurs de phase, auto-contenus comme les autres
  // modules "voix" du projet (voir voice_ui.js, tts_controller.js) plutôt
  // que d'ajouter des clés dans translations/*.js.
  const PHASES = {
    analyse:    { fr: '🧠 Analyse...',                  ar: '🧠 تحليل...',                ha: '🧠 تحليل...' },
    generation: { fr: '🤖 Génération de la réponse...',  ar: '🤖 توليد الرد...',           ha: '🤖 كنجهز الرد...' },
    lecture:    { fr: '🔊 Lecture...',                   ar: '🔊 قراءة...',                ha: '🔊 كنقرا...' },
  };

  function _uiLang() {
    return (typeof I18n !== 'undefined' && I18n.getLang) ? I18n.getLang() : 'fr';
  }

  // Logs de développement uniquement — jamais en production, jamais de
  // contenu sensible (pas de clé API : le frontend n'y a de toute façon
  // jamais accès, voir backend/app/config.py).
  const _DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function _log(...args) {
    if (_DEV) console.debug('[VoiceConversation]', ...args);
  }

  function _isCallActive() {
    const overlay = document.getElementById('call-overlay');
    return !!(overlay && !overlay.classList.contains('hidden'));
  }

  // ── Petit indicateur de phase flottant, ancré à la barre de saisie —
  // même emplacement que la pastille "Écoute en cours..." de voice_ui.js,
  // mais affiché seulement APRÈS elle (jamais en même temps, voir
  // _handleFinalTranscript : l'écoute est déjà terminée à ce stade).
  let _pill = null;

  function _injectStyles() {
    if (document.getElementById('vconv-styles')) return;
    const style = document.createElement('style');
    style.id = 'vconv-styles';
    style.textContent = `
      .vconv-status {
        position: absolute; bottom: calc(100% + 8px); left: 8px;
        font-size: 11.5px; font-weight: 600; color: var(--text-2, #45443F);
        background: var(--surface, #fff); padding: 5px 12px; border-radius: 12px;
        box-shadow: 0 1px 2px rgba(28,28,26,.06), 0 6px 18px rgba(28,28,26,.08);
        white-space: nowrap; pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function _ensurePill() {
    if (_pill) return _pill;
    const bar = document.getElementById('chat-input-bar');
    if (!bar) return null;
    _injectStyles();
    if (getComputedStyle(bar).position === 'static') bar.style.position = 'relative';
    _pill = document.createElement('span');
    _pill.id = 'vconv-status';
    _pill.className = 'vconv-status';
    _pill.style.display = 'none';
    bar.appendChild(_pill);
    return _pill;
  }

  function _showPhase(key) {
    const pill = _ensurePill();
    if (!pill) return;
    const set = PHASES[key] || PHASES.analyse;
    pill.textContent = set[_uiLang()] || set.fr;
    pill.style.display = '';
  }

  function _hidePhase() {
    if (_pill) _pill.style.display = 'none';
  }

  function _notify(text, type) {
    try {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast(text, type || 'info', 2500);
      }
    } catch (_) { /* jamais bloquant */ }
  }

  function _busyNoticeText() {
    return {
      fr: 'Patientez, la réponse précédente est en cours...',
      ar: 'يرجى الانتظار، لا يزال الرد السابق قيد المعالجة...',
      ha: 'صبر شوية، الرد السابق مازال كيتجهز...',
    }[_uiLang()] || 'Patientez...';
  }

  function _finish() {
    clearTimeout(_genPhaseTimer);
    clearTimeout(_busyFallback);
    _hidePhase();
    _busy = false;
  }

  // Filet de sécurité ultime : si le navigateur ne renvoie jamais aucun
  // évènement de synthèse vocale (cas de certains environnements sans
  // moteur TTS installé), on force l'arrêt côté SpeechOutputService pour
  // ne jamais laisser une lecture "fantôme" bloquer une prochaine lecture.
  function _forceFinish() {
    try { if (typeof SpeechOutput !== 'undefined') SpeechOutput.stop(); } catch (_) { /* jamais bloquant */ }
    _finish();
  }

  // ── Point d'entrée : une transcription finale vient d'arriver ────
  async function _handleFinalTranscript(text) {
    if (_isCallActive()) return; // le mode Appel gère déjà sa propre boucle vocale
    if (!text) return;

    if (_busy) {
      _log('transcription ignorée : conversation vocale déjà en cours', text);
      _notify(_busyNoticeText(), 'info');
      return;
    }
    _busy = true;
    _log('transcription reçue →', text);

    // Étape 3 (déjà faite par voice/voice.js : le texte est affiché dans le
    // champ de saisie) — on le vide maintenant qu'on l'envoie, comme le
    // ferait un envoi manuel classique (_sendFromInput dans chat.js).
    const input = document.getElementById('chat-input');
    if (input) input.value = '';

    _showPhase('analyse');
    _genPhaseTimer = setTimeout(() => _showPhase('generation'), 450);

    const ttsReady = typeof TTSEngine !== 'undefined' && TTSEngine.isSupported()
      && typeof TTSController !== 'undefined' && typeof TTSController.speakNextReply === 'function';

    if (ttsReady) {
      // Étape 7 : armé maintenant, consommé automatiquement par le tout
      // prochain message IA rendu par _aiReply (chat.js), quel que soit le
      // chemin emprunté (moteur de règles ou repli OpenAI) — voir
      // tts_controller.js:speakNextReply.
      TTSController.speakNextReply({
        onStart: () => { clearTimeout(_genPhaseTimer); _showPhase('lecture'); _log('lecture démarrée'); },
        onEnd:   () => { _log('lecture terminée'); _finish(); },
        onError: (reason) => { _log('lecture impossible :', reason); _finish(); },
      });
    }

    try {
      // Étapes 4-5-6 : envoi automatique + attente + affichage — entièrement
      // délégués à Chat.processInput, qui décide lui-même (comme pour un
      // message tapé) si l'intention est métier (moteur de règles,
      // toujours prioritaire) ou libre (repli OpenAI). Rien de nouveau ici.
      await Chat.processInput(text, { mode: 'chat', isVoice: true });
    } catch (err) {
      // Chat.processInput ne lève normalement jamais — filet de sécurité
      // pour ne jamais casser le chat même en cas d'imprévu.
      _log('erreur inattendue pendant processInput', err && err.message);
    }

    clearTimeout(_genPhaseTimer);

    if (!ttsReady) {
      // Pas de synthèse vocale disponible sur ce navigateur : la réponse
      // reste affichée normalement dans le chat, simplement sans lecture
      // automatique — aucune erreur, le chat continue de fonctionner.
      _finish();
    } else {
      // Filet de sécurité : si pour une raison quelconque la lecture n'a
      // jamais démarré (réponse vide, message IA jamais rendu...), on ne
      // reste pas bloqué sur l'indicateur de phase indéfiniment.
      _busyFallback = setTimeout(_forceFinish, 6000);
    }
  }

  function mount() {
    document.addEventListener('chatia:voice-final-transcript', (e) => {
      _handleFinalTranscript((e && e.detail && e.detail.text) || '');
    });
  }

  return { mount };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chat === 'undefined') return; // dépendance absente : aucune erreur
  VoiceConversation.mount();
});
