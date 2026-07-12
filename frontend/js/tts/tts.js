/* ════════════════════════════════════════════
   tts.js — Encapsulation brute de l'API Web Speech Synthesis
   ════════════════════════════════════════════
   Couche la plus basse de la lecture vocale des réponses du chatbot :
   ne connaît RIEN du DOM ni de l'UI, seulement l'API navigateur
   SpeechSynthesis et le choix de la voix/locale.

   Totalement indépendant de frontend/js/voice.js (TTS du mode Appel,
   utilisé par call.js) et de frontend/js/voice/ (dictée vocale du champ
   de saisie, Prompt 3) : aucun état ni élément DOM partagé, pour ne
   jamais interférer avec ces flux déjà en place.
   ════════════════════════════════════════════ */

const TTSEngine = (() => {
  // Locales BCP-47 essayées dans l'ordre pour chaque langue gérée par
  // l'application (voir lang-detect.js). La hassaniya (dialecte arabe
  // mauritanien, code interne "ha") n'a pas de voix dédiée dans les
  // moteurs de synthèse des navigateurs : repli sur la voix arabe la plus
  // proche disponible, exactement comme le fait déjà frontend/js/voice.js
  // pour le mode Appel (flux totalement séparé de celui-ci).
  const LOCALES = {
    fr: ['fr-FR', 'fr-BE', 'fr-CA', 'fr'],
    ar: ['ar-SA', 'ar-EG', 'ar-MA', 'ar-DZ', 'ar'],
    ha: ['ar-MR', 'ar-MA', 'ar-SA', 'ar'],
  };

  // True si le navigateur expose l'API SpeechSynthesis (Chrome, Edge,
  // Firefox...). Certains navigateurs/webviews ne l'exposent pas du
  // tout — c'est ce cas que speech_output.js doit détecter pour se
  // désactiver proprement au lieu de planter.
  function isSupported() {
    return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  }

  function localesFor(lang) {
    return LOCALES[lang] || LOCALES.fr;
  }

  // Liste des voix actuellement chargées par le navigateur — peut être
  // vide tant que l'évènement 'voiceschanged' n'a pas encore été émis
  // (comportement asynchrone connu de Chrome/Edge au premier appel).
  function listVoices() {
    if (!isSupported()) return [];
    try { return window.speechSynthesis.getVoices() || []; } catch (_) { return []; }
  }

  // Attend que la liste des voix soit chargée puis appelle `cb` avec
  // cette liste. Ne bloque jamais indéfiniment : un timeout de secours
  // déclenche `cb` avec ce qui est disponible (liste vide y compris)
  // plutôt que de laisser l'appelant en attente.
  function whenVoicesReady(cb) {
    if (!isSupported()) { cb([]); return; }
    const existing = listVoices();
    if (existing.length > 0) { cb(existing); return; }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.onvoiceschanged = null;
      cb(listVoices());
    };
    window.speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 1000);
  }

  // Choisit la meilleure voix disponible pour une langue donnée :
  //  1. la voix explicitement demandée (voiceURI), si elle existe encore
  //  2. la première locale de LOCALES[lang] qui correspond exactement
  //  3. une voix dont la locale commence par le préfixe de langue (ex: "ar-*")
  //  4. null — le navigateur utilisera alors sa voix par défaut
  function pickVoice(lang, voiceURI) {
    const voices = listVoices();
    if (!voices.length) return null;

    if (voiceURI) {
      const explicit = voices.find(v => v.voiceURI === voiceURI);
      if (explicit) return explicit;
    }

    const locales = localesFor(lang);
    for (const loc of locales) {
      const exact = voices.find(v => v.lang === loc);
      if (exact) return exact;
    }

    const prefix = (locales[0] || 'fr').split('-')[0];
    const partial = voices.find(v => (v.lang || '').toLowerCase().startsWith(prefix));
    return partial || null;
  }

  return { isSupported, localesFor, listVoices, whenVoicesReady, pickVoice };
})();
