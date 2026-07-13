/* ════════════════════════════════════════════
   nlu.js — Natural Language Understanding : couche pluggable
   ════════════════════════════════════════════
   But : séparer "COMMENT on comprend un message" (le provider)
   de "QUOI faire une fois qu'on l'a compris" (chat.js).

   Par défaut : le provider "rules" — les mêmes heuristiques regex
   qu'avant (intentions par mots-clés, extraction de trajet par
   connecteurs de/à, من/إلى..., interprétation des réponses partielles
   pendant la précision), simplement déplacées derrière cette façade
   au lieu d'être appelées en dur depuis chat.js.

   Un provider "llm" (js/llm-provider.js, Gemini pour l'instant) est
   branché via ce même NLU.registerProvider(), enveloppé par
   NLU.withFallback() pour retomber sur "rules" au moindre souci — sans
   toucher à la logique de conversation dans chat.js : même contrat
   d'entrée/sortie, donc chat.js n'a rien à changer quel que soit le
   provider actif. On peut aussi imaginer un jour un provider "hybrid"
   qui n'appelle le LLM que lorsque "rules" n'est pas assez confiant
   (ex: intent === 'UNKNOWN', aucun trajet extrait, ou aucun repère/
   catégorie reconnu), pour garder la rapidité/gratuité du rule engine
   dans le cas courant.

   Contrat d'un provider — TOUJOURS asynchrone (Promise), même pour
   "rules" qui répond de façon synchrone en interne : un appel réseau
   (LLM) ne peut pas être synchrone, donc la façade et tous les
   providers exposent la même forme async, quel que soit le provider.
     async detectIntent(text, context)      -> string (une clé de INTENTS, ou 'UNKNOWN')
     async extractRoute(text, lang, context) -> { origin, dest } | null
     async interpretLocationAnswer(text, lang, context)
                                             -> { cleaned, typeHint } | {}
       (utilisé pendant la phase de précision — cleaned = texte nettoyé
        du lieu nommé, à valider par le moteur lui-même via PoiDB.search
        (voir chat.js::_handlePrecisionAnswer) ; typeHint = catégorie
        devinée sans instance précise, ex: "مسجد" dans "جنب المسجد" ;
        {} = rien compris. Le provider ne fait JAMAIS la recherche/
        validation de lieu lui-même — seulement une couche NLU (rules
        ou LLM) délivre un texte compris, jamais un lieu déjà validé.)
     async generateReply(situation, data, lang, context)
                                             -> { message } | null
       (formule LA phrase affichée à l'utilisateur pour la précision de
        lieu — situation: 'zone_detected'|'ask_landmarks'|'confirmed'|
        'giveup' ; data: { zone, place, landmarks: [{name, type}] } —
        des lieux déjà résolus par le moteur/la base réelle, jamais
        inventés par le provider. "rules" reproduit ici les gabarits de
        phrase historiques (fr/ar/ha) ; "llm" (llm-provider.js) demande
        au backend de formuler une phrase naturelle dans la langue
        détectée, à partir des MÊMES données — jamais d'autres lieux que
        ceux fournis.)
     async decideNext(text, context)
                                             -> { action, route, message }
       (gestion de dialogue pour les états IDLE / AWAITING_ORIGIN /
        AWAITING_DEST — voir chat.js::_dispatchViaDecide. "action" est
        choisie parmi un ensemble fixe que le moteur sait exécuter
        (GREET, REQUEST_TRANSPORT, CANCEL_TRIP, CANCEL, STATUS, HELP,
        HISTORY, MAP, CLARIFY, OFF_TOPIC) ; "route" est le texte brut
        d'un lieu mentionné, jamais validé par le provider ; "message"
        n'est rempli que pour GREET / REQUEST_TRANSPORT-sans-lieu /
        CLARIFY — pour toute autre action, le moteur garde ses propres
        gabarits/logique métier (annulation, statut, aide...), inchangés.
        "rules" reproduit exactement l'ancien detectIntent+extractRoute ;
        "llm" appelle le backend, qui ne renvoie jamais de prix, de lieu
        inventé ou de statut de réservation dans "message".)

   `context` (fourni par chat.js à chaque appel) donne au provider tout
   ce qu'il faudrait à un LLM pour interpréter une réponse courte ou
   partielle et éviter de reposer une question déjà répondue :
     {
       channel,         // "chat" | "voice" | "whatsapp" — indicatif seulement
       lang,            // langue détectée pour CE message
       state,           // état courant de la machine à états (STATE.*)
       pendingOrigin,   // origine déjà connue dans la réservation en cours (ou null)
       pendingDest,     // destination déjà connue (ou null)
       lastMessage,     // dernier message poussé dans l'historique ({ role, text, time })
       history,         // derniers messages { role, text } de la conversation (capé large ;
                        // un provider réseau tronque lui-même à la taille configurée)
       proposedPlaces,  // noms des repères déjà proposés pendant l'affinage en cours
     }
   Le provider "rules" n'utilise que (text, lang) et — pour
   interpretLocationAnswer — proposedPlaces (via l'exclusion déjà gérée
   côté chat.js) ; il ignore le reste de `context` volontairement. Le
   provider "llm" (llm-provider.js), lui, envoie tout ce contexte au
   backend (/api/nlu/analyze) pour interpréter une réponse courte ou
   partielle sans reposer une question déjà répondue — même signature,
   même logique de réservation inchangée côté chat.js.

   Un provider LLM ne renvoie JAMAIS ces 3 formes directement : il fait
   UN appel réseau par message (voir js/llm-provider.js), reçoit un
   contrat plus riche { intent, entities, route, locationAnswer,
   confidence, language, onTopic } depuis le backend, et ce sont les
   3 méthodes ci-dessus qui en extraient chacune leur part (avec un
   filtre de confiance : sous le seuil, la valeur est traitée comme
   absente). Ce contrat réseau ne concerne jamais le prix, les
   chauffeurs, les courses ou les coordonnées — voir llm-provider.js.
   ════════════════════════════════════════════ */

const NLU = (() => {
  let _provider = null;

  // ── Enregistrement du provider actif ─────────────────────────────
  function registerProvider(provider) {
    const required = ['detectIntent', 'extractRoute', 'interpretLocationAnswer', 'generateReply', 'decideNext'];
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

  async function detectIntent(text, context = {}) {
    _require();
    return _provider.detectIntent(text, context);
  }

  async function extractRoute(text, lang, context = {}) {
    _require();
    return _provider.extractRoute(text, lang, context);
  }

  async function interpretLocationAnswer(text, lang, context = {}) {
    _require();
    return _provider.interpretLocationAnswer(text, lang, context);
  }

  async function generateReply(situation, data, lang, context = {}) {
    _require();
    return _provider.generateReply(situation, data, lang, context);
  }

  async function decideNext(text, context = {}) {
    _require();
    return _provider.decideNext(text, context);
  }

  // ── Repli automatique ────────────────────────────────────────────
  // Enveloppe un provider "riche" (LLM) avec un filet de sécurité : toute
  // erreur (réseau, timeout, réponse invalide) sur l'une des 3 méthodes
  // retombe silencieusement sur `fallback` (toujours "rules" en pratique)
  // pour CE seul appel — jamais visible par l'utilisateur, jamais une
  // exception qui remonte jusqu'à chat.js. C'est le seul endroit qui
  // connaît la notion de "repli" ; changer de fournisseur LLM ne touche
  // jamais ce mécanisme.
  function withFallback(primary, fallback) {
    async function _safe(method, args) {
      try {
        const result = await primary[method](...args);
        console.debug('[NLU] ' + method + ' répondu par le provider principal (LLM)');
        return result;
      } catch (e) {
        console.warn('[NLU] repli vers le provider de secours pour ' + method + ' :', e && e.message);
        return fallback[method](...args);
      }
    }
    return {
      detectIntent:            (...a) => _safe('detectIntent', a),
      extractRoute:            (...a) => _safe('extractRoute', a),
      interpretLocationAnswer: (...a) => _safe('interpretLocationAnswer', a),
      generateReply:           (...a) => _safe('generateReply', a),
      decideNext:              (...a) => _safe('decideNext', a),
    };
  }

  return { registerProvider, getProvider, detectIntent, extractRoute, interpretLocationAnswer, generateReply, decideNext, withFallback };
})();
