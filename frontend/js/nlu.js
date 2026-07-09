/* ════════════════════════════════════════════
   nlu.js — Natural Language Understanding : couche pluggable
   ════════════════════════════════════════════
   But : séparer "COMMENT on comprend un message" (le provider)
   de "QUOI faire une fois qu'on l'a compris" (chat.js).

   Aujourd'hui : un seul provider, "rules" — les mêmes heuristiques
   regex qu'avant (intentions par mots-clés, extraction de trajet par
   connecteurs de/à, من/إلى..., interprétation des réponses partielles
   pendant la précision), simplement déplacées derrière cette façade
   au lieu d'être appelées en dur depuis chat.js.

   Demain : un provider "llm" pourra être branché ici (NLU.registerProvider)
   sans toucher à la logique de conversation dans chat.js — même contrat
   d'entrée/sortie, donc chat.js n'a rien à changer. On peut aussi
   imaginer un provider "hybrid" qui n'appelle le LLM que lorsque le
   provider "rules" n'est pas assez confiant (ex: intent === 'UNKNOWN',
   aucun trajet extrait, ou aucun repère/catégorie reconnu), pour garder
   la rapidité/gratuité du rule engine dans le cas courant.

   Contrat d'un provider :
     detectIntent(text, context)            -> string (une clé de INTENTS, ou 'UNKNOWN')
     extractRoute(text, lang, context)       -> { origin, dest } | null
     interpretLocationAnswer(text, lang, context)
                                             -> { poi } | { typeHint } | {}
       (utilisé pendant la phase de précision — poi = repère précis
        identifié ; typeHint = catégorie devinée sans instance précise,
        ex: "مسجد" dans "جنب المسجد" ; {} = rien compris)

   `context` (fourni par chat.js à chaque appel) donne au provider tout
   ce qu'il faudrait à un LLM pour interpréter une réponse courte ou
   partielle et éviter de reposer une question déjà répondue :
     {
       lang,            // langue détectée pour CE message
       state,           // état courant de la machine à états (STATE.*)
       pendingOrigin,   // origine déjà connue dans la réservation en cours (ou null)
       pendingDest,     // destination déjà connue (ou null)
       lastMessage,     // dernier message poussé dans l'historique ({ role, text, time })
       history,         // derniers messages { role, text } de la conversation
       proposedPlaces,  // noms des repères déjà proposés pendant l'affinage en cours
     }
   Le provider "rules" actuel n'utilise que (text, lang) et — pour
   interpretLocationAnswer — proposedPlaces (via l'exclusion déjà gérée
   côté chat.js) ; il ignore le reste de `context` volontairement — mais
   le contrat existe déjà pour qu'un futur provider LLM puisse s'en
   servir sans changer la signature ni la logique de réservation.
   ════════════════════════════════════════════ */

const NLU = (() => {
  let _provider = null;

  // ── Enregistrement du provider actif ─────────────────────────────
  function registerProvider(provider) {
    const required = ['detectIntent', 'extractRoute', 'interpretLocationAnswer'];
    if (!provider || required.some(fn => typeof provider[fn] !== 'function')) {
      throw new Error('NLU provider invalide : ' + required.join(', ') + ' sont requis.');
    }
    _provider = provider;
  }

  function getProvider() {
    return _provider;
  }

  // ── Appels façade — délèguent au provider actif ──────────────────
  function _require() {
    if (!_provider) throw new Error('NLU: aucun provider enregistré (appeler NLU.registerProvider() au chargement).');
  }

  function detectIntent(text, context = {}) {
    _require();
    return _provider.detectIntent(text, context);
  }

  function extractRoute(text, lang, context = {}) {
    _require();
    return _provider.extractRoute(text, lang, context);
  }

  function interpretLocationAnswer(text, lang, context = {}) {
    _require();
    return _provider.interpretLocationAnswer(text, lang, context);
  }

  return { registerProvider, getProvider, detectIntent, extractRoute, interpretLocationAnswer };
})();
