/* ════════════════════════════════════════════
   app.js — Main Controller
   Bootstraps all modules, manages navigation,
   language switching, hold-mic wiring, call button.
   ════════════════════════════════════════════ */

const App = (() => {
  let currentView = 'chat';

  // ── Navigation ──────────────────────────────────────────────────
  function navigateTo(viewId) {
    if (currentView === viewId) return;
    currentView = viewId;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    if (viewId === 'requests') Transport.renderRequests();
    if (viewId === 'history')  Chat.renderHistory();
    if (viewId === 'map')      MapView.show();

    Notifications.closePanel();
  }

  // ── Language switching ────────────────────────────────────────────
  function setLanguage(lang) {
    I18n.setLang(lang);

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    if (currentView === 'requests') Transport.renderRequests();
    if (currentView === 'history')  Chat.renderHistory();

    const input = document.getElementById('chat-input');
    if (input) input.placeholder = I18n.t('input.placeholder');

    // Update call button label
    const callLabel = document.getElementById('call-btn-label');
    if (callLabel) callLabel.textContent = I18n.t('call.btn.start');

    Notifications.toast(
      { fr: 'Langue : Français', ar: 'اللغة: العربية', ha: 'اللغة: الحسانية' }[lang],
      'info', 2000
    );
  }

  // ── Clear history ─────────────────────────────────────────────────
  function clearHistory() {
    Modal.confirm({
      title: { fr: 'Effacer l\'historique', ar: 'مسح السجل', ha: 'حذف السجل' }[I18n.getLang()],
      body: `<p style="color:var(--text-2);font-size:14px;">${
        { fr: 'Cette action est irréversible.', ar: 'لا يمكن التراجع عن هذا.', ha: 'هذا ما يرجعش.' }[I18n.getLang()]
      }</p>`,
      confirmLabel: I18n.t('lbl.clear'),
      confirmClass: 'danger',
      onConfirm: () => {
        MockData.saveHistory([]);
        Chat.renderHistory();
        Notifications.toast(
          { fr: 'Historique effacé', ar: 'تم مسح السجل', ha: 'السجل تحذف' }[I18n.getLang()],
          'info'
        );
      }
    });
  }

  // ── Mic button: point d'entrée unique de la dictée vocale ────────
  // Réutilise VoiceInputService (frontend/js/voice/) : clic → démarre la
  // reconnaissance vocale → texte inséré dans #chat-input, éditable →
  // aucun envoi automatique. Remplace l'ancien déclenchement du flux
  // d'enregistrement façon WhatsApp (Voice.startRecording) depuis CE
  // bouton — un seul bouton ne peut déclencher qu'un seul comportement.
  // L'API Voice elle-même (TTS, STT brut, startRecording/...) n'est ni
  // modifiée ni supprimée : elle continue de fonctionner exactement comme
  // avant pour le mode Appel (voir call.js), qui ne passe pas par ce bouton.
  function _wireMic() {
    const micBtn   = document.getElementById('mic-btn');
    const stopBtn  = document.getElementById('vrb-stop-btn');
    const sendBtn  = document.getElementById('vrb-send-btn');
    const cancelBtn= document.getElementById('vrb-cancel-btn');

    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (typeof VoiceInputService === 'undefined') return; // dépendance absente : aucune erreur, bouton inactif
        if (VoiceInputService.isListening()) {
          VoiceInputService.cancelListening();
        } else {
          VoiceInputService.startListening();
        }
      });
    }

    // Barre d'enregistrement WhatsApp historique : conservée intacte (rien
    // supprimé) même si elle n'est plus déclenchable depuis #mic-btn.
    if (stopBtn)   stopBtn.addEventListener('click',   () => Voice.stopRecording());
    if (sendBtn)   sendBtn.addEventListener('click',   () => Voice.sendRecording());
    if (cancelBtn) cancelBtn.addEventListener('click', () => Voice.cancelRecording());
  }

  // ── Bootstrap ─────────────────────────────────────────────────────
  function init() {
    I18n.applyTranslations();
    Notifications.init();
    Transport.init();
    Chat.init();
    Call.init();
    MapView.init();

    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });

    // Language switcher
    document.getElementById('lang-switcher').addEventListener('click', (e) => {
      const btn = e.target.closest('.lang-btn');
      if (btn) setLanguage(btn.dataset.lang);
    });

    // Call AI button
    const callBtn = document.getElementById('call-btn');
    if (callBtn) {
      callBtn.addEventListener('click', () => {
        if (callBtn.classList.contains('active')) {
          Call.end();
        } else {
          Call.start();
        }
      });
    }

    // Mic tap-to-record (WhatsApp style)
    _wireMic();

    // Clear history
    const clearBtn = document.getElementById('clear-history-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearHistory);

    // Active request bar
    const reqBarBtn = document.getElementById('req-bar-btn');
    if (reqBarBtn) reqBarBtn.addEventListener('click', () => navigateTo('requests'));

    // Modal backdrop
    document.getElementById('modal-backdrop').addEventListener('click', () => Modal.close());

    console.info('ChatBot initialized. Ready.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { navigateTo, setLanguage };
})();
