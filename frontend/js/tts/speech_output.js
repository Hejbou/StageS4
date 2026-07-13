/* ════════════════════════════════════════════
   speech_output.js — SpeechOutputService : lecture vocale des réponses
   ════════════════════════════════════════════
   Lit à voix haute le texte des réponses du chatbot en mode Chat, via
   l'API navigateur SpeechSynthesis uniquement (TTSEngine, ce dossier).

   Totalement indépendant de Voice.speak (frontend/js/voice.js), qui gère
   déjà le TTS du mode Appel (call.js) avec sa propre logique de reprise
   automatique (onSpoken) : aucun état partagé, pour ne jamais interférer
   avec ce flux déjà en place. tts_controller.js n'active d'ailleurs jamais
   ce service pendant que le mode Appel est actif (voir _isCallActive()).
   ════════════════════════════════════════════ */

class SpeechOutputService {
  constructor() {
    this._synth     = window.speechSynthesis || null;
    this._utterance  = null;
    this._lang       = null;   // langue forcée par setLanguage(), sinon auto-détectée à chaque appel
    this._voiceURI   = null;   // voix forcée par setVoice()
    this._speaking   = false;
    this._paused     = false;
  }

  // Nettoyage minimal du texte avant lecture (balises HTML éventuelles,
  // emojis, placeholders non remplis) — implémentation indépendante de
  // _cleanForTTS (frontend/js/voice.js) pour que ce module reste
  // autonome, comme demandé.
  _cleanText(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/\{[^}]+\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Lit `text` à voix haute. `language` optionnel ('fr'|'ar'|'ha') :
  // si absent, utilise la langue fixée par setLanguage(), sinon détecte
  // automatiquement la langue de la réponse via LangDetect (même module
  // que le reste du projet pour ce besoin — voir lang-detect.js).
  // `handlers` optionnel : { onStart, onEnd, onError(reason) }. Ne lève
  // jamais d'exception ; retourne false si rien n'a pu être lu.
  speak(text, language, handlers) {
    const h = handlers || {};
    const cleanText = this._cleanText(text);

    if (!TTSEngine.isSupported()) {
      if (h.onError) h.onError('unsupported');
      return false;
    }
    if (!cleanText) {
      if (h.onEnd) h.onEnd();
      return false;
    }

    const lang = language || this._lang
      || (typeof LangDetect !== 'undefined' ? LangDetect.detect(cleanText, 'fr') : 'fr');

    this.stop(); // une seule lecture à la fois

    const utterance  = new SpeechSynthesisUtterance(cleanText);
    utterance.lang   = TTSEngine.localesFor(lang)[0];
    utterance.rate   = (lang === 'ar' || lang === 'ha') ? 0.88 : 0.95;
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this._speaking = true;
      this._paused   = false;
      if (h.onStart) h.onStart();
    };
    utterance.onend = () => {
      this._speaking  = false;
      this._paused    = false;
      this._utterance = null;
      if (h.onEnd) h.onEnd();
    };
    utterance.onerror = (e) => {
      this._speaking  = false;
      this._paused    = false;
      this._utterance = null;
      // 'canceled'/'interrupted' surviennent à chaque stop() volontaire ou
      // quand une nouvelle lecture démarre par-dessus (voir this.stop() ci-
      // dessus) — jamais une vraie erreur à signaler à l'utilisateur.
      const reason = (e && e.error) || 'unknown';
      if (reason === 'canceled' || reason === 'interrupted') {
        if (h.onEnd) h.onEnd();
      } else if (h.onError) {
        h.onError(reason);
      }
    };

    const applyVoiceAndSpeak = () => {
      const voice = TTSEngine.pickVoice(lang, this._voiceURI);
      if (voice) {
        utterance.voice = voice;
      } else if (!TTSEngine.listVoices().length && h.onError) {
        // Aucune voix installée du tout : on tente quand même la lecture
        // (certains navigateurs disposent d'une voix système par défaut
        // non listée par getVoices()) mais on prévient l'appelant que le
        // choix automatique de voix n'a pas pu être fait.
        h.onError('no-voice');
      }
      this._utterance = utterance;
      this._synth.speak(utterance);
    };

    if (TTSEngine.listVoices().length > 0) {
      applyVoiceAndSpeak();
    } else {
      TTSEngine.whenVoicesReady(applyVoiceAndSpeak);
    }
    return true;
  }

  stop() {
    if (!this._synth) return;
    try { this._synth.cancel(); } catch (_) { /* déjà arrêtée */ }
    this._speaking  = false;
    this._paused    = false;
    this._utterance = null;
  }

  pause() {
    if (!this._synth || !this._speaking || this._paused) return;
    try { this._synth.pause(); this._paused = true; } catch (_) { /* non supporté par ce navigateur */ }
  }

  resume() {
    if (!this._synth || !this._paused) return;
    try { this._synth.resume(); this._paused = false; } catch (_) { /* non supporté par ce navigateur */ }
  }

  isSpeaking() {
    return this._speaking;
  }

  isPaused() {
    return this._paused;
  }

  // Langue par défaut utilisée quand speak() est appelé sans 2e argument.
  setLanguage(language) {
    this._lang = language || null;
  }

  // Voix explicitement choisie — prioritaire sur la détection automatique
  // par langue tant qu'elle correspond encore à une voix installée (voir
  // TTSEngine.pickVoice). Accepte soit un objet SpeechSynthesisVoice, soit
  // directement un voiceURI (string).
  setVoice(voice) {
    this._voiceURI = (voice && typeof voice === 'object') ? voice.voiceURI : (voice || null);
  }
}

// Instance partagée, exposée globalement — point d'entrée unique de la
// lecture vocale des réponses (voir tts_controller.js pour l'UI qui s'en sert).
const SpeechOutput = new SpeechOutputService();
