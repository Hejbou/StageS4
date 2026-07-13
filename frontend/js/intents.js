/* ════════════════════════════════════════════
   intents.js — Source unique des intentions du chat
   ════════════════════════════════════════════
   Liste plate des intentions reconnues par le moteur ("UNKNOWN" n'y
   figure pas : c'est toujours la valeur de repli implicite quand rien
   ne correspond, jamais une intention "détectée").

   Cette page (chat.js) définit le détail par intention (regex par
   langue, dans INTENTS) ; ce fichier n'existe que pour la LISTE DES
   NOMS, lue aussi par le backend (backend/app/utils/intents.py, qui
   parse ce fichier tel quel — voir ce module) pour valider la réponse
   d'un provider LLM. Ajouter une intention ici + dans INTENTS (chat.js)
   suffit : le backend ne peut plus être en retard, il relit ce fichier
   à chaque démarrage — aucune synchronisation manuelle côté serveur.
   ════════════════════════════════════════════ */
const KNOWN_INTENTS = [
  'CANCEL_TRIP', 'STATUS', 'GREET', 'CONFIRM', 'CANCEL',
  'MODIFY', 'REQUEST_TRANSPORT', 'HELP', 'HISTORY', 'MAP',
];
