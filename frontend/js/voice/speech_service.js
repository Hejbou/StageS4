/* ════════════════════════════════════════════
   speech_service.js — Encapsulation brute de l'API Web Speech Recognition
   ════════════════════════════════════════════
   Couche la plus basse de la dictée vocale du champ de saisie du chat :
   ne connaît RIEN du DOM ni de l'UI, seulement l'API navigateur
   SpeechRecognition / webkitSpeechRecognition et le choix de la locale.

   Totalement indépendant de frontend/js/voice.js (moteur d'enregistrement
   WhatsApp existant, utilisé par #mic-btn pour les messages vocaux) :
   aucun état ni élément DOM partagé, pour ne jamais interférer avec ce
   flux déjà en place.
   ════════════════════════════════════════════ */

const SpeechService = (() => {
  // Locales BCP-47 utilisées par l'API navigateur, une par langue gérée
  // par l'application (voir lang-detect.js / i18n.js) + l'anglais demandé
  // en plus pour la dictée.
  // La hassaniya (dialecte arabe mauritanien, code interne "ha") n'a pas
  // de code dédié dans les moteurs de reconnaissance vocale des
  // navigateurs : on utilise la locale arabe la plus proche disponible
  // (ar-MR), exactement comme le fait déjà frontend/js/voice.js.
  const LOCALES = {
    fr: 'fr-FR',
    ar: 'ar-SA',
    ha: 'ar-MR',
    en: 'en-US',
  };

  // True si le navigateur expose une API de reconnaissance vocale
  // (Chrome/Edge : SpeechRecognition ou son préfixe webkit). Firefox et
  // certains navigateurs ne l'exposent pas du tout — c'est ce cas que
  // voice.js (dossier) doit détecter pour afficher "navigateur non
  // compatible" au lieu de planter.
  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function localeFor(lang) {
    return LOCALES[lang] || LOCALES.fr;
  }

  // Crée une instance fraîche de reconnaissance, configurée pour de la
  // dictée courte (une phrase) avec résultats intermédiaires — pour que
  // l'utilisateur voie le texte se former en direct dans le champ.
  // Retourne null si l'API n'est pas disponible (jamais d'exception).
  function create(lang) {
    if (!isSupported()) return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang           = localeFor(lang);
    rec.continuous     = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    return rec;
  }

  return { isSupported, localeFor, create };
})();
