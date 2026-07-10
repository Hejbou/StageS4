/* ════════════════════════════════════════════
   voice.js — Speech Recognition & Synthesis
   WhatsApp-style recording:
     tap mic → recording bar appears (timer + waveform)
     tap stop → processing → preview (send / cancel)
     send → transcript forwarded to AI
   ════════════════════════════════════════════ */

const Voice = (() => {
  let recognition  = null;
  let synthesis    = window.speechSynthesis || null;
  let isListening  = false;
  let onResultCb   = null;
  let onErrorCb    = null;
  let _activeLang  = null; // override UI lang for STT (set by chat when language detected)

  // Recording state
  let _isRecording      = false;
  let _recCancelled     = false;
  let _pendingTranscript= null;
  let _recordSendCb     = null;
  let _recTimer         = null;
  let _recSeconds       = 0;

  // Voice locales
  const LANG_LOCALES = {
    fr: ['fr-FR', 'fr-BE', 'fr-CA', 'fr'],
    ar: ['ar-SA', 'ar-EG', 'ar-MA', 'ar-DZ', 'ar'],
    ha: ['ar-MR', 'ar-MA', 'ar-SA', 'ar'],
  };
  const LANG_MAP = { fr: 'fr-FR', ar: 'ar-SA', ha: 'ar-MR' };

  // Demo phrases (fallback when mic unavailable) — include realistic Nouakchott locations
  const SIM_PHRASES = {
    fr: [
      'Je veux un transport',
      'Je pars du Marché Capitale, je vais à Tevragh Zeina',
      'Emmène-moi de Ksar à la Cinquième',
      'Je veux aller à Arafat depuis Sebkha',
      'Transport de l\'Université vers le Centre-ville',
      'Je voudrais aller à El Mina',
      'Confirmer la demande',
      'Quel est le statut de ma demande ?',
    ],
    ar: [
      'أريد سيارة',
      'أريد الذهاب من الكار إلى الجامعة',
      'انطلاقاً من الخامسة إلى تفرغ زينة',
      'أحتاج توصيلة من المطار إلى وسط المدينة',
      'من الكار إلى أرفات من فضلك',
      'ما حالة طلبي؟',
      'تأكيد',
      'إلغاء الطلب',
    ],
    ha: [
      'بغيت كار',
      'بغيت نروح من الخامسة للسوق',
      'كار من الكار لتيفرغ زين',
      'روح معايا من الجامعة للمطار',
      'شحال الطلب ديالي؟',
      'واخا أكد',
      'إلغاء',
    ],
  };

  function _getSpeechLang() {
    const lang = _activeLang || I18n.getLang();
    return LANG_MAP[lang] || 'fr-FR';
  }

  // Allow chat.js to override the STT language based on detected conversation language
  function setActiveLang(lang) {
    _activeLang = (lang && LANG_MAP[lang]) ? lang : null;
  }

  // ── Check if an overlay (call / rec bar) is active ────────────
  function _isOverlayActive() {
    const callOv = document.getElementById('call-overlay');
    const recBar = document.getElementById('voice-rec-bar');
    return (callOv && !callOv.classList.contains('hidden')) ||
           (recBar && !recBar.classList.contains('hidden'));
  }

  // ── STT overlay (regular mic button, not WhatsApp mode) ────────
  function _showSttOverlay() {
    if (_isOverlayActive()) return;
    const overlay = document.getElementById('voice-overlay');
    const micBtn  = document.getElementById('mic-btn');
    if (overlay) { overlay.classList.remove('hidden'); overlay.classList.add('show'); }
    if (micBtn)  micBtn.classList.add('active');
    _setStatusText(I18n.t('voice.listening'));
    _clearTranscript();
  }

  function _hideSttOverlay() {
    const overlay = document.getElementById('voice-overlay');
    const micBtn  = document.getElementById('mic-btn');
    if (overlay) { overlay.classList.remove('show'); setTimeout(() => overlay.classList.add('hidden'), 250); }
    if (micBtn)  micBtn.classList.remove('active');
  }

  function _setStatusText(text) {
    const el = document.getElementById('voice-status');
    if (el) el.textContent = text;
  }
  function _clearTranscript() {
    const el = document.getElementById('voice-transcript');
    if (el) el.textContent = '';
  }
  function _updateTranscript(text) {
    const el = document.getElementById('voice-transcript');
    if (el) el.textContent = `"${text}"`;
  }

  // ── WhatsApp Recording Bar ─────────────────────────────────────
  function _showRecBar(state) {
    const bar    = document.getElementById('voice-rec-bar');
    const inpBar = document.getElementById('chat-input-bar');
    if (bar)    { bar.classList.remove('hidden'); bar.dataset.state = state; }
    if (inpBar) inpBar.classList.add('vrb-hidden');
    _updateRecBarUI(state);
  }

  function _hideRecBar() {
    const bar    = document.getElementById('voice-rec-bar');
    const inpBar = document.getElementById('chat-input-bar');
    if (bar)    { bar.classList.add('hidden'); bar.dataset.state = ''; }
    if (inpBar) inpBar.classList.remove('vrb-hidden');
  }

  function _updateRecBarUI(state) {
    const waveEl    = document.getElementById('vrb-waveform');
    const statusEl  = document.getElementById('vrb-status');
    const stopBtn   = document.getElementById('vrb-stop-btn');
    const sendBtn   = document.getElementById('vrb-send-btn');

    if (state === 'recording') {
      if (waveEl)   waveEl.classList.add('animating');
      if (statusEl) statusEl.textContent = I18n.t('mic.recording');
      if (stopBtn)  { stopBtn.classList.remove('hidden'); stopBtn.title = I18n.t('mic.stop'); }
      if (sendBtn)  sendBtn.classList.add('hidden');
    } else if (state === 'processing') {
      if (waveEl)   waveEl.classList.remove('animating');
      if (statusEl) statusEl.textContent = I18n.t('mic.processing');
      if (stopBtn)  stopBtn.classList.add('hidden');
      if (sendBtn)  sendBtn.classList.add('hidden');
    } else if (state === 'preview') {
      if (waveEl)   waveEl.classList.remove('animating');
      if (statusEl) statusEl.textContent = I18n.t('mic.preview');
      if (stopBtn)  stopBtn.classList.add('hidden');
      if (sendBtn)  { sendBtn.classList.remove('hidden'); sendBtn.title = I18n.t('mic.send'); }
    }
  }

  // ── Recording timer ────────────────────────────────────────────
  function _startRecTimer() {
    _recSeconds = 0;
    _updateTimerDisplay();
    _recTimer = setInterval(() => {
      _recSeconds++;
      _updateTimerDisplay();
    }, 1000);
  }

  function _stopRecTimer() {
    clearInterval(_recTimer);
    _recTimer = null;
  }

  function _updateTimerDisplay() {
    const el = document.getElementById('vrb-timer');
    if (!el) return;
    const m = String(Math.floor(_recSeconds / 60)).padStart(2, '0');
    const s = String(_recSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  // ── STT engine initialization ──────────────────────────────────
  function _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.maxAlternatives= 1;
    rec.lang           = _getSpeechLang();

    rec.onstart = () => {
      isListening = true;
      if (!_isOverlayActive()) _showSttOverlay();
    };

    rec.onresult = (e) => {
      const results    = Array.from(e.results);
      const transcript = results.map(r => r[0].transcript).join('');
      const isFinal    = results.some(r => r.isFinal);
      _updateTranscript(transcript);
      if (isFinal) {
        _hideSttOverlay();
        isListening = false;
        if (onResultCb) onResultCb(transcript.trim());
      }
    };

    rec.onerror = (e) => {
      _hideSttOverlay();
      isListening = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        Notifications.toast(I18n.t('voice.error'), 'warning');
        _runSimulation();
      } else if (onErrorCb) {
        onErrorCb(e.error);
      }
    };

    rec.onend = () => {
      isListening = false;
      if (!_isOverlayActive()) _hideSttOverlay();
    };

    return rec;
  }

  // ── Simulation fallback ─────────────────────────────────────────
  function _runSimulation(simLang) {
    const lang    = simLang || I18n.getLang();
    const phrases = SIM_PHRASES[lang] || SIM_PHRASES.fr;
    const phrase  = phrases[Math.floor(Math.random() * phrases.length)];

    if (!_isOverlayActive()) _showSttOverlay();
    _setStatusText(I18n.t('voice.listening'));
    isListening = true;

    let i = 0;
    const interval = setInterval(() => {
      _updateTranscript(phrase.slice(0, i));
      i++;
      if (i > phrase.length) {
        clearInterval(interval);
        _setStatusText(I18n.t('voice.processing'));
        setTimeout(() => {
          if (!_isOverlayActive()) _hideSttOverlay();
          isListening = false;
          if (onResultCb) onResultCb(phrase);
        }, 500);
      }
    }, 35);
  }

  // ── Low-level startListening / stopListening ────────────────────
  function startListening(onResult, onError) {
    if (isListening) return;
    onResultCb = onResult;
    onErrorCb  = onError || null;

    recognition = _initRecognition();
    if (recognition) {
      try {
        recognition.lang = _getSpeechLang();
        recognition.start();
      } catch {
        _runSimulation();
      }
    } else {
      _runSimulation();
    }
  }

  function stopListening() {
    if (recognition && isListening) { try { recognition.stop(); } catch {} }
    _hideSttOverlay();
    isListening = false;
  }

  // ── Text-to-Speech ──────────────────────────────────────────────
  function _cleanForTTS(text) {
    return text
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[✅❌🎉😔👋🚗📍📋🕐⭐💰📏⏱🏁]/g, '')
      .replace(/"/g, '')            // remove {place} quotes from suggestion msgs
      .replace(/\{[^}]+\}/g, '')    // remove unfilled placeholders
      .replace(/\n•/g, '،')
      .replace(/•/g, '،')
      .replace(/\n/g, '، ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function speak(text, lang, onEnd) {
    if (!synthesis) { if (onEnd) onEnd(); return; }
    synthesis.cancel();
    const langCode  = lang || I18n.getLang();
    const cleanText = _cleanForTTS(text);
    if (!cleanText) { if (onEnd) onEnd(); return; }

    const utterance   = new SpeechSynthesisUtterance(cleanText);
    utterance.rate    = (langCode === 'ar' || langCode === 'ha') ? 0.88 : 0.95;
    utterance.pitch   = 1.0;
    utterance.volume  = 1.0;
    utterance.onend   = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    const locales = LANG_LOCALES[langCode] || LANG_LOCALES.fr;
    utterance.lang = locales[0];

    function _trySpeak() {
      const voices = synthesis.getVoices();
      let chosen = null;
      for (const loc of locales) { chosen = voices.find(v => v.lang === loc); if (chosen) break; }
      if (!chosen) { const pfx = locales[0].split('-')[0]; chosen = voices.find(v => v.lang.startsWith(pfx)); }
      if (chosen) utterance.voice = chosen;
      synthesis.speak(utterance);
    }

    if (synthesis.getVoices().length > 0) {
      _trySpeak();
    } else {
      synthesis.onvoiceschanged = () => { synthesis.onvoiceschanged = null; _trySpeak(); };
    }
  }

  function stopSpeaking() {
    if (synthesis) synthesis.cancel();
  }

  // ══════════════════════════════════════════════════════════════
  //  WhatsApp-style Recording (tap-to-start, tap-to-stop, preview)
  // ══════════════════════════════════════════════════════════════

  // PUBLIC: start recording (called when mic button is tapped)
  function startRecording(onSend) {
    if (_isRecording || isListening) return;
    _isRecording    = true;
    _recCancelled   = false;
    _recordSendCb   = onSend;
    _pendingTranscript = null;

    _showRecBar('recording');
    _startRecTimer();

    // Wire STT result → pending transcript
    startListening(
      (text) => {
        if (_recCancelled) return;
        _pendingTranscript = text || '';
        _stopRecTimer();
        if (_isRecording) _showRecBar('preview');
      },
      () => {
        if (_recCancelled) return;
        // On error: show preview with whatever we have (simulation may still deliver)
        _stopRecTimer();
        if (_isRecording) _showRecBar('preview');
      }
    );
  }

  // PUBLIC: stop recording (called by stop button in rec bar)
  function stopRecording() {
    if (!_isRecording) return;
    _stopRecTimer();

    if (recognition && isListening) {
      // STT running — stop it, result comes via callback → preview
      _showRecBar('processing');
      try { recognition.stop(); } catch {}
    } else if (!_pendingTranscript) {
      // Simulation still running — show processing, wait for callback
      _showRecBar('processing');
    } else {
      // Already have transcript (STT auto-stopped)
      _showRecBar('preview');
    }
  }

  // PUBLIC: cancel recording, discard transcript
  function cancelRecording() {
    _recCancelled = true;
    _isRecording  = false;
    _pendingTranscript = null;
    _recordSendCb = null;
    _stopRecTimer();
    onResultCb = null; // prevent pending simulation callback
    if (recognition && isListening) { try { recognition.stop(); } catch {} }
    isListening = false;
    _hideRecBar();
  }

  // PUBLIC: send the pending transcript to AI
  function sendRecording() {
    const cb   = _recordSendCb;
    const text = _pendingTranscript;
    _isRecording  = false;
    _recCancelled = false;
    _pendingTranscript = null;
    _recordSendCb = null;
    _hideRecBar();
    if (cb && text && text.trim()) cb(text.trim());
  }

  // Wire cancel button in legacy STT overlay
  document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('voice-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      stopListening();
      cancelRecording();
    });
  });

  return {
    startListening,
    stopListening,
    startRecording,
    stopRecording,
    cancelRecording,
    sendRecording,
    speak,
    stopSpeaking,
    setActiveLang,
    isRecording:  () => _isRecording,
  };
})();
