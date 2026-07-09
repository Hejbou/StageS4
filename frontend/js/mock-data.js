/* ════════════════════════════════════════════
   mock-data.js — Simulated data (replaces API)
   ════════════════════════════════════════════ */

const MockData = (() => {

  const DRIVERS = [
    { id: 'd1', name: 'Mohamed Ould Ahmed', avatar: '👨', plate: 'NKT-2847', car: 'Toyota Corolla Blanc', rating: 4.8, phone: '+222 36 xx xx xx', eta: '3 min' },
    { id: 'd2', name: 'Sidi Ould Brahim', avatar: '🧔', plate: 'NKT-1123', car: 'Hyundai Accent Gris', rating: 4.6, phone: '+222 22 xx xx xx', eta: '5 min' },
    { id: 'd3', name: 'Abdallah Ould Salem', avatar: '👴', plate: 'NKT-3394', car: 'Kia Rio Bleu', rating: 4.9, phone: '+222 46 xx xx xx', eta: '2 min' },
    { id: 'd4', name: 'Moussa Ould Cheikh', avatar: '👦', plate: 'NKT-5521', car: 'Renault Logan Rouge', rating: 4.7, phone: '+222 20 xx xx xx', eta: '7 min' },
  ];

  const LOCATIONS = [
    // Quartiers en français
    'Marché Capitale', 'Cinquième', 'Tevragh Zeina', 'Ksar', 'Sebkha',
    'Arafat', 'El Mina', 'Dar Naim', 'Toujounine', 'Riyad',
    'Université de Nouakchott', 'Aéroport Oumtounsy', 'CHN', 'Centre-ville',
    'Avenue Gamal Abdel Nasser', 'PK 10', 'Carrefour Madrid', 'Socogim',
    // Noms arabes / hassania (dictés par voix)
    'الكار', 'الخامسة', 'تيفرغ زين', 'القصر', 'السبخة',
    'أرفات', 'المينة', 'دار النعيم', 'تجكجة', 'الرياض',
    'الجامعة', 'المطار', 'المستشفى الوطني', 'وسط المدينة',
    'الكار', 'السوق', 'المركز',
  ];

  const HISTORY_CONVERSATIONS = [
    {
      id: 'conv_001',
      date: '2026-06-15T14:23:00',
      lang: 'fr',
      summary: 'Transport du Marché Capitale vers Tevragh Zeina',
      status: 'accepted',
      turns: 8,
      messages: [
        { role: 'ai',   text: 'Bonjour ! Comment puis-je vous aider ?' },
        { role: 'user', text: 'Je veux un transport' },
        { role: 'ai',   text: 'Depuis quel endroit souhaitez-vous partir ?' },
        { role: 'user', text: 'Marché Capitale' },
        { role: 'ai',   text: 'Merci. Quelle est votre destination ?' },
        { role: 'user', text: 'Tevragh Zeina' },
        { role: 'ai',   text: 'Voici le récapitulatif. Souhaitez-vous confirmer ?' },
        { role: 'user', text: 'Confirmer' },
      ]
    },
    {
      id: 'conv_002',
      date: '2026-06-14T09:10:00',
      lang: 'ar',
      summary: 'طلب نقل من الكار إلى الجامعة',
      status: 'accepted',
      turns: 7,
      messages: [
        { role: 'ai',   text: 'مرحباً! كيف يمكنني مساعدتك؟' },
        { role: 'user', text: 'أريد سيارة' },
        { role: 'ai',   text: 'من أين تريد الانطلاق؟' },
        { role: 'user', text: 'الكار' },
        { role: 'ai',   text: 'إلى أين تريد الذهاب؟' },
        { role: 'user', text: 'الجامعة' },
        { role: 'user', text: 'تأكيد' },
      ]
    },
    {
      id: 'conv_003',
      date: '2026-06-13T16:45:00',
      lang: 'ha',
      summary: 'بغيت كار من الخامسة للسوق',
      status: 'refused',
      turns: 6,
      messages: [
        { role: 'ai',   text: 'أهلاً! بغيتي شنو؟' },
        { role: 'user', text: 'بغيت كار' },
        { role: 'ai',   text: 'منين بغيتي تمشي؟' },
        { role: 'user', text: 'الخامسة' },
        { role: 'ai',   text: 'فين بغيتي تروح؟' },
        { role: 'user', text: 'السوق' },
      ]
    },
    {
      id: 'conv_004',
      date: '2026-06-12T11:30:00',
      lang: 'fr',
      summary: 'Demande annulée — Cinquième vers Arafat',
      status: 'cancelled',
      turns: 5,
      messages: [
        { role: 'ai',   text: 'Bonjour ! Comment puis-je vous aider ?' },
        { role: 'user', text: 'Transport vers Arafat' },
        { role: 'ai',   text: 'Depuis quel endroit ?' },
        { role: 'user', text: 'Cinquième' },
        { role: 'user', text: 'Annuler' },
      ]
    },
  ];

  const NOTIFICATION_TEMPLATES = [
    { type: 'success', icon: '✅', titleKey: 'Driver Found', msgKey: 'Your driver is on the way!' },
    { type: 'warning', icon: '🕐', titleKey: 'Request Pending', msgKey: 'Searching for a driver...' },
    { type: 'danger',  icon: '❌', titleKey: 'No Driver', msgKey: 'No driver available right now.' },
    { type: 'info',    icon: '📍', titleKey: 'Driver Arrived', msgKey: 'Your driver is waiting.' },
  ];

  function getRandomDriver() {
    return DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
  }

  function getRandomLocation() {
    return LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  }

  // ── Pricing system ─────────────────────────────────────────────
  // Deterministic hash so same pair always yields same price (no surprises)
  function _hash(str) {
    let h = 7;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function getEstimate(origin, destination) {
    const seed    = _hash((origin + destination).toLowerCase());
    const dist    = 1.5 + (seed % 75) / 10;             // 1.5 – 9.0 km
    const time    = Math.round(dist * 3.8 + 3);           // minutes
    const tranches = Math.floor(dist / 4);
    const price   = 100 + tranches * 50;                  // 100 MRU + 50/4km
    return {
      distance: `${dist.toFixed(1)} km`,
      time:     `${time} min`,
      price:    `${price} MRU`,
      priceNum: price,
    };
  }

  function findRequestsByPhone(phone) {
    const requests = getRequests();
    const clean = phone.replace(/\s/g, '');
    return requests.filter(r => r.phone && r.phone.replace(/\s/g, '') === clean
      && (r.status === 'pending' || r.status === 'accepted'));
  }

  function generateRequestId() {
    return 'REQ-' + Date.now().toString(36).toUpperCase();
  }

  function getHistory() {
    const stored = localStorage.getItem('naqlabot_history');
    if (stored) {
      try { return JSON.parse(stored); } catch { return HISTORY_CONVERSATIONS; }
    }
    return HISTORY_CONVERSATIONS;
  }

  function saveHistory(history) {
    localStorage.setItem('naqlabot_history', JSON.stringify(history));
  }

  function getRequests() {
    const stored = localStorage.getItem('naqlabot_requests');
    if (stored) {
      try { return JSON.parse(stored); } catch { return []; }
    }
    return [];
  }

  function saveRequests(requests) {
    localStorage.setItem('naqlabot_requests', JSON.stringify(requests));
  }

  // Simulate driver search result (80% chance of finding a driver)
  function simulateDriverSearch() {
    return new Promise((resolve) => {
      const delay = 3000 + Math.random() * 2000;
      setTimeout(() => {
        const found = Math.random() < 0.80;
        resolve({ found, driver: found ? getRandomDriver() : null });
      }, delay);
    });
  }

  return {
    DRIVERS,
    LOCATIONS,
    getRandomDriver,
    getRandomLocation,
    getEstimate,
    findRequestsByPhone,
    generateRequestId,
    getHistory,
    saveHistory,
    getRequests,
    saveRequests,
    simulateDriverSearch,
    NOTIFICATION_TEMPLATES,
  };
})();
