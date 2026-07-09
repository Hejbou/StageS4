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

  // Mots-outils français courants — sert à distinguer "du vrai français"
  // d'un simple nom propre en alphabet latin (ex: un nom de quartier
  // transcrit "teyarett") qui n'a aucun signal linguistique réel.
  const FRENCH_MARKERS = /\b(je|tu|il|elle|nous|vous|ils|elles|le|la|les|de|du|des|un|une|et|ou|mais|donc|veux|voudrais|suis|vais|aller|bonjour|salut|bonsoir|merci|oui|non|avec|pour|dans|sur|depuis|vers|où|quel|quelle|combien|besoin|cherche|prendre|partir|c'est|s'il)\b/i;

  /**
   * Detect the language of a text string.
   * `fallbackLang` (optionnel) : langue déjà établie dans la conversation
   * (ex: dernier message utilisateur). Un texte sans caractères arabes ET
   * sans mot français reconnaissable (typiquement un nom de lieu transcrit
   * en alphabet latin, "teyarett", "riyad"...) n'est pas du vrai français —
   * dans ce cas on reste sur `fallbackLang` plutôt que de basculer sur
   * 'fr' par défaut, pour ne pas faire répondre en français au milieu
   * d'une conversation en arabe/hassaniya à cause d'un simple nom propre.
   * Un texte contenant un vrai mot français continue de basculer en 'fr'
   * normalement (changement de langue volontaire toujours respecté).
   * Returns 'fr' | 'ar' | 'ha' — never null.
   */
  function detect(text, fallbackLang) {
    if (!text || !text.trim()) return fallbackLang || 'fr';

    const clean = text.replace(/\s+/g, '');
    if (!clean.length) return fallbackLang || 'fr';

    const arabicChars = (text.match(ARABIC_RE) || []).length;
    const ratio = arabicChars / clean.length;

    if (ratio >= 0.28) {
      return HASSANIA_MARKERS.test(text) ? 'ha' : 'ar';
    }
    if (fallbackLang && fallbackLang !== 'fr' && !FRENCH_MARKERS.test(text)) {
      return fallbackLang;
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
