/* ════════════════════════════════════════════
   call.js — Call Mode (voice conversation loop)
   Uses the SAME AI engine as Chat (Chat.processInput)
   with mode:'call' so TTS fires and onSpoken loops.
   Natural phone call feel:
     - Short single-sentence greeting → wait silently
     - Listen → process → speak → natural pause → listen
     - end() instantly kills ALL speech and AI processing
   ════════════════════════════════════════════ */

const Call = (() => {
  let _active      = false;
  let _timer       = null;
  let _seconds     = 0;
  let _uiLang      = 'fr';
  let _listenTimer = null; // for natural pause before listening

  // Greetings: ONE short sentence per language
  const GREETINGS = {
    fr: 'Bonjour, bienvenue dans le service de transport. Comment puis-je vous aider ?',
    ar: 'مرحباً، أهلاً بك في خدمة النقل. كيف يمكنني مساعدتك؟',
    ha: 'أهلاً بيك في خدمة الكار. بغيتي شنو؟',
  };

  // ── Translation helper (UI strings only) ──────────────────────
  function _t(key) {
    const src = { fr: window.LANG_FR||{}, ar: window.LANG_AR||{}, ha: window.LANG_HA||{} };
    const d = src[_uiLang] || {};
    const fb = src.fr || {};
    return d[key] !== undefined ? d[key] : (fb[key] !== undefined ? fb[key] : key);
  }

  // ── Duration timer ────────────────────────────────────────────
  function _startTimer() {
    _seconds = 0;
    _timer = setInterval(() => {
      _seconds++;
      const el = document.getElementById('call-duration');
      if (el) {
        const m = String(Math.floor(_seconds / 60)).padStart(2, '0');
        const s = String(_seconds % 60).padStart(2, '0');
        el.textContent = `${m}:${s}`;
      }
    }, 1000);
  }

  function _stopTimer() {
    clearInterval(_timer);
    _timer = null;
  }

  // ── Status display ────────────────────────────────────────────
  function _setStatus(key) {
    const el = document.getElementById('call-status-text');
    if (el) el.textContent = _t(key);
  }

  // ── Show/hide overlay ─────────────────────────────────────────
  function _showOverlay() {
    const overlay = document.getElementById('call-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      requestAnimationFrame(() => overlay.classList.add('visible'));
    }
  }

  function _hideOverlay() {
    const overlay = document.getElementById('call-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.classList.add('hidden'), 350);
    }
  }

  // ── Add transcript line in call overlay ───────────────────────
  function _addTranscriptLine(text, role) {
    const area = document.getElementById('call-transcript');
    if (!area) return;
    const div = document.createElement('div');
    div.className = `call-transcript-line ${role}`;
    div.textContent = text;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  }

  // ── Avatar visual state ───────────────────────────────────────
  function _setVisual(state) {
    const avatar = document.getElementById('call-avatar');
    if (!avatar) return;
    avatar.className = 'call-avatar-ring ' + state;
    _setStatus({
      listening: 'call.status.listen',
      thinking:  'call.status.think',
      speaking:  'call.status.speak',
      idle:      'call.status.idle',
    }[state] || 'call.status.idle');
  }

  // ── Main listen cycle — natural phone call timing ─────────────
  function _listenCycle() {
    if (!_active) return;
    _setVisual('listening');

    Voice.startListening(
      (text) => {
        if (!_active) return;

        // Empty or very short → retry silently without restarting speech
        if (!text || !text.trim() || text.trim().length < 2) {
          _listenTimer = setTimeout(() => { if (_active) _listenCycle(); }, 400);
          return;
        }

        _addTranscriptLine(text, 'user');
        Chat.addUserMessage(text);
        _setVisual('thinking');

        Chat.processInput(text, {
          mode: 'call',
          onSpoken: () => {
            if (!_active) return;
            _setVisual('listening');
            // Natural pause after AI finishes speaking (feel like a real call)
            _listenTimer = setTimeout(() => {
              if (_active) _listenCycle();
            }, 700);
          },
        });
      },
      () => {
        // Mic error / timeout → retry with brief delay
        if (_active) {
          _listenTimer = setTimeout(() => _listenCycle(), 600);
        }
      }
    );
  }

  // ── Public: start call ────────────────────────────────────────
  function start() {
    if (_active) return;
    _active = true;
    _uiLang = I18n.getLang();

    _showOverlay();
    _startTimer();
    _setVisual('speaking');

    const area = document.getElementById('call-transcript');
    if (area) area.innerHTML = '';

    const greetText = GREETINGS[_uiLang] || GREETINGS.fr;
    _addTranscriptLine(greetText, 'ai');
    Chat.addSystemMessage(greetText);

    // Speak greeting → wait 900ms naturally → start listening
    Voice.speak(greetText, _uiLang, () => {
      if (!_active) return;
      _listenTimer = setTimeout(() => {
        if (_active) _listenCycle();
      }, 900);
    });

    const callBtn = document.getElementById('call-btn');
    if (callBtn) callBtn.classList.add('active');
  }

  // ── Public: end call — instantly kills everything ─────────────
  function end() {
    if (!_active) return;
    _active = false;

    // Kill ALL pending audio and AI immediately
    Voice.stopSpeaking();
    Voice.stopListening();
    Chat.cancelPending();
    clearTimeout(_listenTimer);
    _listenTimer = null;

    _stopTimer();
    _hideOverlay();

    const callBtn = document.getElementById('call-btn');
    if (callBtn) callBtn.classList.remove('active');
  }

  // ── Public: init ──────────────────────────────────────────────
  function init() {
    const endBtn = document.getElementById('end-call-btn');
    if (endBtn) endBtn.addEventListener('click', end);
  }

  return { init, start, end };
})();
