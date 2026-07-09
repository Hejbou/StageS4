/* ════════════════════════════════════════════
   translations/fr.js — Traductions Françaises
   ════════════════════════════════════════════ */

window.LANG_FR = {
  // ── Application ──────────────────────────────
  'app.subtitle': 'Assistant IA · مساعد ذكي',

  // ── Navigation ───────────────────────────────
  'nav.chat':     'Chat IA',
  'nav.requests': 'Demandes',
  'nav.map':      'Carte',
  'nav.history':  'Historique',

  // ── Labels généraux ──────────────────────────
  'lbl.subtitle':        'Assistant IA · مساعد ذكي',
  'lbl.requests.title':  'Mes Demandes',
  'lbl.history.title':   'Historique',
  'lbl.clear':           'Effacer',
  'lbl.voice.cancel':    'Annuler',
  'lbl.notif.title':     'Notifications',
  'lbl.mark.read':       'Tout marquer lu',
  'lbl.no.notif':        'Aucune notification',

  // ── Chips ────────────────────────────────────
  'chip.request': 'Demander transport',
  'chip.status':  'Mon statut',
  'chip.cancel':  'Annuler',
  'chip.help':    'Aide',

  // ── Saisie ───────────────────────────────────
  'input.placeholder': 'Écrivez votre message...',

  // ── Voix ─────────────────────────────────────
  'voice.listening':   'J\'écoute...',
  'voice.processing':  'Traitement en cours...',
  'voice.error':       'Microphone non disponible. Utilisez le texte.',

  // ── Barre de demande active ───────────────────
  'req.bar.pending':  'Demande en cours...',
  'req.bar.accepted': 'Chauffeur assigné',
  'req.bar.refused':  'Aucun chauffeur disponible',
  'req.bar.view':     'Voir',

  // ── Statuts ───────────────────────────────────
  'req.status.pending':   'En attente',
  'req.status.accepted':  'Accepté',
  'req.status.refused':   'Refusé',
  'req.status.cancelled': 'Annulé',

  // ── Champs ────────────────────────────────────
  'req.from':         'Départ',
  'req.to':           'Destination',
  'req.driver':       'Chauffeur',
  'req.cancel':       'Annuler',
  'req.back.to.chat': 'Retour au chat',
  'req.none':         'Aucune demande',
  'req.none.sub':     'Vos demandes de transport apparaîtront ici',
  'req.new':          'Nouvelle demande',

  // ── Chronologie ──────────────────────────────
  'timeline.created':   'Créée',
  'timeline.searching': 'Recherche',
  'timeline.assigned':  'Assigné',
  'timeline.done':      'Terminé',

  // ── Historique ────────────────────────────────
  'history.empty':     'Historique vide',
  'history.empty.sub': 'Vos conversations apparaîtront ici',
  'history.turns':     'messages',

  // ── Modale ───────────────────────────────────
  'modal.confirm.title': 'Confirmer la demande',
  'modal.confirm.btn':   'Confirmer',
  'modal.cancel.title':  'Annuler la demande',
  'modal.cancel.sub':    'Êtes-vous sûr de vouloir annuler cette demande ?',
  'modal.cancel.btn':    'Oui, annuler',
  'modal.keep':          'Non, garder',
  'modal.close':         'Fermer',
  'modal.estimate':      'Estimation',
  'modal.price':         'Prix estimé',
  'modal.distance':      'Distance',
  'modal.time':          'Durée estimée',

  // ── Toasts ───────────────────────────────────
  'toast.req.created':   'Demande envoyée ! Recherche d\'un chauffeur...',
  'toast.req.accepted':  'Chauffeur trouvé ! Il est en route.',
  'toast.req.refused':   'Aucun chauffeur disponible pour le moment.',
  'toast.req.cancelled': 'Demande annulée avec succès.',

  // ── Messages IA ──────────────────────────────
  'ai.welcome':
    'Bonjour ! Je suis ChatIA, votre assistant transport intelligent. Comment puis-je vous aider aujourd\'hui ?',
  'ai.how.help':
    'Comment puis-je vous aider ?',
  'ai.ask.origin':
    'Parfait ! Depuis quel endroit souhaitez-vous partir ?',
  'ai.ask.dest':
    'Merci. Quelle est votre destination ?',
  'ai.confirming':
    'Voici le récapitulatif de votre demande. Souhaitez-vous confirmer ?',
  'ai.confirmed':
    'Votre demande a bien été envoyée ! Je recherche un chauffeur disponible près de vous...',
  'ai.cancelled':
    'Demande annulée. N\'hésitez pas à faire appel à moi si vous avez besoin d\'autre chose.',
  'ai.no.active':
    'Vous n\'avez aucune demande active en ce moment. Dites-moi si vous souhaitez réserver un transport.',
  'ai.status.pending':
    'Votre demande est en cours de traitement. Un chauffeur sera assigné dans quelques instants.',
  'ai.status.accepted':
    'Super nouvelle ! Un chauffeur a été assigné et il arrive bientôt à votre position.',
  'ai.status.refused':
    'Malheureusement, aucun chauffeur n\'est disponible en ce moment. Veuillez réessayer dans quelques minutes.',
  'ai.help':
    'Voici ce que je peux faire pour vous :\n• Réserver un transport\n• Vérifier le statut de votre demande\n• Annuler une demande en cours\n• Consulter l\'historique de vos trajets',
  'ai.unknown':
    'Je n\'ai pas bien compris votre demande. Vous pouvez dire par exemple : "Je veux un transport", ou utilisez les boutons ci-dessous.',
  'ai.driver.found':
    'Excellent ! Un chauffeur a été trouvé et est en route vers vous. Vous pouvez suivre votre demande dans l\'onglet Demandes.',
  'ai.no.driver':
    'Désolé, aucun chauffeur n\'est disponible en ce moment. Veuillez réessayer dans quelques minutes.',

  // ── Notifications ─────────────────────────────
  'notif.welcome.title':  'Bienvenue sur ChatIA',
  'notif.welcome.msg':    'Votre assistant transport IA est prêt à vous aider.',
  'notif.driver.title':   'Chauffeur assigné',
  'notif.driver.msg':     'Votre chauffeur arrive dans 4 min.',
  'notif.delay.title':    'Légère attente',
  'notif.delay.msg':      'Trafic dense sur votre itinéraire.',
  'lbl.no.notif.sub':     'Vous êtes à jour',

  // ── Mode Appel ────────────────────────────────
  'call.btn.start':      'Appeler',
  'call.btn.end':        'Raccrocher',
  'call.status.idle':    'En attente...',
  'call.status.listen':  'J\'écoute...',
  'call.status.think':   'Réflexion...',
  'call.status.speak':   'En train de répondre...',
  'call.speak.hint':     'Parlez maintenant...',

  'ai.call.greeting':
    'Bonjour, bienvenue dans le service de transport. Comment puis-je vous aider ?',
  'ai.call.ended':
    'L\'appel est terminé. Merci d\'avoir contacté ChatIA Transport.',

  // ── Validation des lieux ─────────────────────────────────────────
  'ai.location.not.found':
    'Je n\'ai pas trouvé "{place}" sur la carte de Nouakchott. Pouvez-vous préciser le nom du quartier ?',
  'ai.location.suggest':
    'Je n\'ai pas trouvé "{place}". Voulez-vous dire "{suggestion}" ? Ou précisez le nom du quartier.',
  'ai.location.not.found.dest':
    'Destination "{place}" introuvable sur la carte. Quel est le quartier exact de votre destination ?',
  'ai.location.suggest.dest':
    'Je n\'ai pas trouvé la destination "{place}". Voulez-vous dire "{suggestion}" ? Ou précisez le quartier.',

  // ── Téléphone client (identification de la course) ───────────────
  'ai.ask.phone.trip':
    'Parfait ! Quel est votre numéro de téléphone mauritanien (8 chiffres) pour identifier votre demande ?',
  'ai.phone.invalid':
    'Numéro invalide. Entrez un numéro mauritanien valide (8 chiffres commençant par 2, 3 ou 4 — ex : 22123456).',

  // ── Annulation directe ───────────────────────
  'ai.cancel.ask':
    'Votre course : de {from} vers {to}. Confirmer l\'annulation ? Répondez oui pour annuler ou non pour garder.',

  // ── Statut détaillé ──────────────────────────
  'ai.status.detail':
    'Votre course : {from} → {to}\nPrix estimé : {price}\nStatut : {status}',

  // ── Annulation par téléphone (legacy) ────────
  'ai.ask.phone':
    'Bien sûr. Veuillez me donner votre numéro de téléphone pour retrouver votre trajet.',
  'ai.phone.found':
    'J\'ai trouvé votre trajet : de {from} vers {to}. Souhaitez-vous annuler ce trajet ?',
  'ai.phone.not.found':
    'Aucun trajet actif trouvé pour ce numéro. Avez-vous l\'identifiant de votre demande ?',
  'ai.ask.trip.id':
    'Donnez-moi l\'identifiant de votre demande (ex : REQ-ABC123).',
  'ai.trip.id.not.found':
    'Aucune demande trouvée avec cet identifiant. Vérifiez et réessayez.',
  'ai.cancel.confirmed':
    'Votre trajet a été annulé avec succès. Y a-t-il autre chose que je puisse faire pour vous ?',

  // ── Prix & confirmation ───────────────────────
  'ai.price.announce':
    'Votre trajet de {from} à {to} est estimé à {price}.\nRépondez : 1 pour confirmer · 2 pour annuler · 3 pour modifier un point.',
  'ai.confirm.options':
    'Tapez 1 pour confirmer, 2 pour annuler, ou 3 pour modifier le point de départ ou d\'arrivée.',
  'ai.modify.choice':
    'Quel point souhaitez-vous modifier ?\n• 1 — Point de départ\n• 2 — Destination',
  'ai.modify.new.origin':
    'Quel est le nouveau point de départ ?',
  'ai.modify.new.dest':
    'Quelle est la nouvelle destination ?',

  // ── Microphone / Enregistrement ───────────────
  'mic.tap':        'Appuyer pour parler',
  'mic.recording':  'Enregistrement...',
  'mic.stop':       'Arrêter',
  'mic.preview':    'Message prêt',
  'mic.send':       'Envoyer',
  'mic.cancel':     'Annuler',
  'mic.processing': 'Traitement...',

  // ── Vue Carte ────────────────────────────────
  'mv.origin.placeholder': 'Point de départ...',
  'mv.dest.placeholder':   'Destination...',
  'mv.mode.origin':        '📍 Départ',
  'mv.mode.dest':          '🏁 Arrivée',
  'mv.price.label':        'Prix estimé',
  'mv.book':               '🚗 Lancer la course',
  'mv.cancel.route':       'Annuler',
  'mv.formula':            '100 MRU + 50 MRU / 4 km',
  'mv.loading':            'Calcul en cours...',

  'ai.map.intro':
    'Voici la carte ! Entrez votre départ et destination (ou touchez la carte), le prix s\'affiche automatiquement — 100 MRU de base + 50 MRU par 4 km.',

  // ── Paramètres utilisateur ───────────────────
  'settings.title':            'Mon compte',
  'settings.edit.name':        'Modifier le nom',
  'settings.save':             'Enregistrer',
  'settings.lang':             'Langue préférée',
  'settings.since':            'Membre depuis',
  'settings.trips':            'Courses effectuées',
  'settings.logout':           'Se déconnecter',
  'settings.name.placeholder': 'Votre prénom',

  // ── Erreurs ───────────────────────────────────
  'error.generic':   'Une erreur est survenue. Veuillez réessayer.',
  'error.no.mic':    'Microphone non disponible ou refusé.',
  'error.no.voice':  'Synthèse vocale non disponible sur ce navigateur.',
};
