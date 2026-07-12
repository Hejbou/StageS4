/* ════════════════════════════════════════════
   voice_ui.js — Interface de la dictée vocale, sur le bouton micro existant
   ════════════════════════════════════════════
   Réutilise le bouton micro déjà présent dans le projet (#mic-btn, dans
   #chat-input-bar) comme point d'entrée UNIQUE de la dictée — n'ajoute
   AUCUN second bouton. Fournit uniquement : l'animation pendant l'écoute
   (classe ajoutée sur #mic-btn), un statut flottant "Écoute en cours...",
   et les messages d'erreur (refusé / indisponible / navigateur non
   compatible).

   Aucune modification d'index.html ni des fichiers CSS existants — le
   nécessaire (animation, pastille) est injecté dynamiquement ici, préfixé
   "vui-" pour ne jamais entrer en collision avec les styles déjà en place
   de #mic-btn (classe .active de l'ancien flux d'enregistrement, voir
   frontend/js/voice.js, non touchée).
   ════════════════════════════════════════════ */

const VoiceUI = (() => {
  let _btn      = null;
  let _statusEl = null;
  let _mounted  = false;

  // Textes propres à ce module (dictée), volontairement autonomes plutôt
  // que d'ajouter de nouvelles clés dans translations/*.js — garde toute
  // la fonctionnalité "voix" auto-contenue dans ce dossier, comme demandé.
  const MESSAGES = {
    listening: {
      fr: 'Écoute en cours...', ar: 'جارٍ الاستماع...', ha: 'كنسمعك دابا...', en: 'Listening...',
    },
    denied: {
      fr: 'Microphone refusé. Autorisez-le dans les paramètres du navigateur.',
      ar: 'تم رفض إذن الميكروفون. فعّله من إعدادات المتصفح.',
      ha: 'رفضتي إذن الميكروفون. فعّلو من إعدادات المتصفح.',
      en: 'Microphone access denied. Allow it in your browser settings.',
    },
    unavailable: {
      fr: 'Microphone indisponible.', ar: 'الميكروفون غير متاح.', ha: 'الميكروفون ما كاينش.', en: 'Microphone unavailable.',
    },
    unsupported: {
      fr: 'Reconnaissance vocale non prise en charge par ce navigateur.',
      ar: 'التعرف على الصوت غير مدعوم في هذا المتصفح.',
      ha: 'هذا المتصفح ما يدعمش التعرف على الصوت.',
      en: 'Speech recognition is not supported in this browser.',
    },
  };

  function _lang() {
    return (typeof I18n !== 'undefined' && I18n.getLang) ? I18n.getLang() : 'fr';
  }

  function _msg(key) {
    const lang = _lang();
    const set  = MESSAGES[key] || MESSAGES.unavailable;
    return set[lang] || set.fr;
  }

  // Feuille de style minimale injectée une seule fois, scoppée sous
  // .vui-* : ne modifie aucun fichier .css existant. `.vui-listening` ne
  // fait qu'AJOUTER un fond/animation par-dessus le style déjà en place
  // de #mic-btn — aucune règle existante n'est redéfinie ni retirée.
  function _injectStyles() {
    if (document.getElementById('vui-styles')) return;
    const style = document.createElement('style');
    style.id = 'vui-styles';
    style.textContent = `
      #mic-btn.vui-listening {
        color: #DC2626; background: rgba(220, 38, 38, .12);
        animation: vui-pulse 1.1s ease-in-out infinite;
      }
      @keyframes vui-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(220, 38, 38, .35); }
        70%  { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0); }
        100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
      }
      .vui-status {
        position: absolute; bottom: calc(100% + 8px); left: 8px;
        font-size: 11.5px; font-weight: 600; color: #DC2626;
        background: var(--surface, #fff); padding: 5px 12px; border-radius: 12px;
        box-shadow: 0 1px 2px rgba(28,28,26,.06), 0 6px 18px rgba(28,28,26,.08);
        white-space: nowrap; pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  // Prépare l'UI de dictée SANS créer de nouveau bouton : réutilise
  // #mic-btn déjà présent dans le HTML pour l'animation d'écoute, et
  // ajoute seulement la pastille de statut flottante. Retourne le bouton
  // réutilisé, ou null si introuvable (ne lève jamais d'exception).
  function mount() {
    if (_mounted) return _btn;
    const bar    = document.getElementById('chat-input-bar');
    const micBtn = document.getElementById('mic-btn');
    if (!bar || !micBtn) return null;

    _injectStyles();

    // Contexte de positionnement pour la pastille de statut (voir
    // .vui-status ci-dessus, position:absolute) — n'affecte pas la mise en
    // page existante : #chat-input-bar est déjà positionné normalement
    // dans le flux (static), lui donner "relative" sans décalage ne
    // déplace rien, ça ne fait que servir d'ancre à notre pastille.
    if (getComputedStyle(bar).position === 'static') bar.style.position = 'relative';

    _btn = micBtn; // le SEUL bouton micro du projet — aucun autre créé

    _statusEl = document.createElement('span');
    _statusEl.id = 'dictate-status';
    _statusEl.className = 'vui-status';
    _statusEl.style.display = 'none';
    bar.appendChild(_statusEl);

    _mounted = true;
    return _btn;
  }

  function showListening() {
    if (_btn) _btn.classList.add('vui-listening');
    if (_statusEl) { _statusEl.textContent = _msg('listening'); _statusEl.style.display = ''; }
  }

  function hideListening() {
    if (_btn) _btn.classList.remove('vui-listening');
    if (_statusEl) { _statusEl.style.display = 'none'; _statusEl.textContent = ''; }
  }

  // Affiche une erreur de façon discrète (toast si Notifications est
  // disponible, repli sur le statut sinon) — ne lève jamais, même si
  // Notifications est absent ou change de forme.
  function showError(kind) {
    hideListening();
    const text = _msg(kind);
    try {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast(text, 'warning', 3500);
        return;
      }
    } catch (_) { /* repli silencieux ci-dessous */ }

    if (_statusEl) {
      _statusEl.textContent = text;
      _statusEl.style.display = '';
      setTimeout(() => { if (_statusEl) _statusEl.style.display = 'none'; }, 3500);
    }
  }

  return { mount, showListening, hideListening, showError };
})();
