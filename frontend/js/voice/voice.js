/* ════════════════════════════════════════════
   voice.js (frontend/js/voice/) — VoiceService : dictée vocale du champ
   de saisie du chat
   ════════════════════════════════════════════
   But : convertir la voix en texte et le déposer dans #chat-input,
   éditable avant envoi — JAMAIS d'envoi automatique du message.

   Point d'entrée : le bouton micro déjà présent dans le projet (#mic-btn),
   câblé depuis app.js (_wireMic) — voir voice_ui.js, qui réutilise ce
   même bouton pour l'animation d'écoute au lieu d'en créer un second.

   L'API historique de frontend/js/voice.js à la racine (TTS, STT brut
   Voice.startListening, flux d'enregistrement Voice.startRecording...)
   n'est ni modifiée ni supprimée : elle continue de fonctionner comme
   avant pour le mode Appel (call.js), qui ne passe pas par #mic-btn.

   N'appelle aucune route Flask ni OpenAI : reconnaissance 100% locale,
   gérée par le navigateur via l'API Web Speech (speech_service.js).
   ════════════════════════════════════════════ */

class VoiceService {
  constructor() {
    this._recognition = null;
    this._listening    = false;
    this._cancelled    = false;
  }

  isListening() {
    return this._listening;
  }

  // Démarre l'écoute. Ne lève JAMAIS d'exception : toute erreur
  // (permission refusée, micro indisponible, navigateur non compatible)
  // est capturée et signalée via VoiceUI.showError, jamais remontée à
  // l'appelant ni affichée comme erreur technique brute.
  startListening() {
    if (this._listening) return;

    if (typeof SpeechService === 'undefined' || !SpeechService.isSupported()) {
      VoiceUI.showError('unsupported');
      return;
    }

    // Langue actuellement sélectionnée dans l'application si connue
    // (voir I18n.getLang() — fr/ar/ha), sinon repli sur la langue du
    // navigateur (fr/ar/en), et français par défaut en dernier recours.
    const lang = this._resolveLang();

    let rec;
    try {
      rec = SpeechService.create(lang);
    } catch (_) {
      rec = null;
    }
    if (!rec) {
      VoiceUI.showError('unsupported');
      return;
    }

    this._recognition = rec;
    this._cancelled    = false;

    rec.onstart = () => {
      this._listening = true;
      VoiceUI.showListening();
    };

    rec.onresult = (e) => {
      if (this._cancelled) return;
      const results    = Array.from(e.results);
      const transcript = results.map(r => r[0].transcript).join('');
      const isFinal    = results.some(r => r.isFinal);
      this._fillInput(transcript);
      if (isFinal) {
        this.stopListening();
        // Évènement générique, consommé par un module d'orchestration
        // optionnel (voir frontend/js/voice-conversation.js) pour enchaîner
        // automatiquement sur l'envoi du message — ce fichier ne connaît
        // rien de ce qui écoute cet évènement ni de ce qui en est fait,
        // exactement comme pour VoiceUI ci-dessus. Aucun changement de
        // comportement pour un appelant qui ne l'écoute pas : le texte
        // reste simplement déposé dans le champ de saisie, éditable.
        document.dispatchEvent(new CustomEvent('chatia:voice-final-transcript', {
          detail: { text: transcript.trim() },
        }));
      }
    };

    rec.onerror = (e) => {
      this._listening = false;
      VoiceUI.hideListening();
      if (this._cancelled) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        VoiceUI.showError('denied');
      } else if (e.error === 'audio-capture') {
        VoiceUI.showError('unavailable');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        // Erreur générique (network, etc.) — message discret, jamais le
        // détail technique brut de l'événement navigateur.
        VoiceUI.showError('unavailable');
      }
    };

    rec.onend = () => {
      this._listening = false;
      VoiceUI.hideListening();
    };

    try {
      rec.start();
    } catch (_) {
      // Certains navigateurs lèvent si start() est appelé deux fois trop
      // vite, ou si le device audio n'est pas accessible.
      this._listening = false;
      VoiceUI.showError('unavailable');
    }
  }

  // Arrête proprement l'écoute ; le dernier résultat reçu reste dans le
  // champ de saisie tel quel (l'utilisateur peut encore le corriger).
  stopListening() {
    if (!this._recognition) return;
    try { this._recognition.stop(); } catch (_) { /* déjà arrêtée */ }
    this._listening = false;
    VoiceUI.hideListening();
  }

  // Annule l'écoute : ignore tout résultat qui arriverait encore après
  // l'appel (protégé par _cancelled dans onresult/onerror ci-dessus).
  cancelListening() {
    this._cancelled = true;
    if (this._recognition) {
      try {
        if (this._recognition.abort) this._recognition.abort();
        else this._recognition.stop();
      } catch (_) { /* déjà arrêtée */ }
    }
    this._listening = false;
    VoiceUI.hideListening();
  }

  // Langue de reconnaissance : celle déjà sélectionnée dans l'app
  // (fr/ar/ha) si connue, sinon déduite de la langue du navigateur parmi
  // fr/ar/en, français par défaut sinon.
  _resolveLang() {
    const uiLang = (typeof I18n !== 'undefined' && I18n.getLang) ? I18n.getLang() : null;
    if (uiLang === 'fr' || uiLang === 'ar' || uiLang === 'ha') return uiLang;

    const nav = ((navigator.language || navigator.userLanguage || 'fr') + '').toLowerCase();
    if (nav.startsWith('ar')) return 'ar';
    if (nav.startsWith('en')) return 'en';
    return 'fr';
  }

  // Dépose le texte reconnu dans le champ de saisie du chat — ne l'envoie
  // JAMAIS automatiquement. Déclenche un vrai évènement 'input' pour
  // rester compatible avec l'autocomplétion de lieux déjà branchée sur
  // #chat-input dans chat.js (Maps.triggerAutocomplete), sans quoi elle
  // ne se déclencherait pas puisque définir `.value` en JS ne déclenche
  // pas nativement l'évènement 'input'.
  _fillInput(text) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Instance partagée, exposée globalement pour que app.js puisse la câbler
// sur le bouton micro déjà présent (#mic-btn) — voir app.js: _wireMic().
// Point d'entrée UNIQUE : aucun second bouton n'est créé ici.
const VoiceInputService = new VoiceService();

document.addEventListener('DOMContentLoaded', () => {
  // Prépare uniquement l'UI (animation sur #mic-btn + pastille de statut),
  // sans câbler de clic ici : app.js le fait directement sur #mic-btn pour
  // rester le point d'entrée unique du microphone.
  if (typeof VoiceUI === 'undefined') return; // dépendance absente : aucune erreur
  VoiceUI.mount();
});
