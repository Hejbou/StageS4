/* ════════════════════════════════════════════
   js/lang-detect.js — Automatic language detection
   Detects: French (fr) | Arabic (ar) | Hassania (ha)
   from raw user input text.
   Used by chat.js to reply in the customer's language,
   independently of the UI language setting.
   ════════════════════════════════════════════ */

const LangDetect = (() => {

  // Arabic Unicode block (covers MSA + dialects)
  const ARABIC_RE = /[؀-ۿݐ-ݿ]/g;

  // Hassania (Mauritanian Arabic dialect) markers
  // Words specific to Hassania that don't appear in MSA
  const HASSANIA_MARKERS = /(بغيت|واخا|كار|سايق|دابا|ديالك|ديال|مزيان|شحال|منين|فين|شوف|خلي|جاي|كنبحث|عافاك|ما كاين|ارجع|عاود|نبحث|لقينا|مشي|روح|وصل|تعين|تلغى|كنسمعك|خلصنا|لباس|بغيتي|نعمل|كنقدر|مكاش|الطريق ديالك|ما عندي|كارتة|تيفرغ|الكار|الخامسة|كنشوف|مانيش|عندك|ماشي|السوق ديال|وين غادي|نروح)/;

  /**
   * Detect the language of a text string.
   * Returns 'fr' | 'ar' | 'ha' — never null.
   */
  function detect(text) {
    if (!text || !text.trim()) return 'fr';

    const clean = text.replace(/\s+/g, '');
    if (!clean.length) return 'fr';

    const arabicChars = (text.match(ARABIC_RE) || []).length;
    const ratio = arabicChars / clean.length;

    if (ratio >= 0.28) {
      return HASSANIA_MARKERS.test(text) ? 'ha' : 'ar';
    }
    return 'fr';
  }

  /**
   * Get translated string directly by language code,
   * bypassing the UI language set in I18n.
   * Falls back to French if key not found.
   */
  function tLang(key, lang) {
    const sources = {
      fr: window.LANG_FR || {},
      ar: window.LANG_AR || {},
      ha: window.LANG_HA || {},
    };
    const primary  = sources[lang]   || {};
    const fallback = sources['fr']   || {};
    return primary[key] !== undefined ? primary[key]
         : fallback[key] !== undefined ? fallback[key]
         : key;
  }

  return { detect, tLang };
})();
