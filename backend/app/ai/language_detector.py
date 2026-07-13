"""
language_detector.py — Détection automatique de la langue d'un message.

Port Python de la logique de frontend/js/lang-detect.js, pour permettre au
futur backend LLM de détecter la langue indépendamment du JavaScript (ex: un
message arrivant par un autre canal que le chat web, ou une vérification
côté serveur avant d'appeler OpenAIService).

Langues gérées : français (fr), arabe standard (ar), hassaniya — le
dialecte arabe mauritanien (ha). Ne dépend d'aucune bibliothèque externe :
mêmes heuristiques regex que le moteur "rules" actuel, pour rester cohérent
avec le comportement déjà validé côté frontend.
"""
import re

# Bloc Unicode arabe (couvre l'arabe standard + les dialectes).
_ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿ]")

# Marqueurs spécifiques à la hassaniya, absents de l'arabe standard —
# recopiés depuis HASSANIA_MARKERS dans frontend/js/lang-detect.js.
_HASSANIA_MARKERS = re.compile(
    "بغيت|واخا|كار|سايق|دابا|ديالك|ديال|مزيان|شحال|منين|فين|شوف|خلي|جاي|"
    "كنبحث|عافاك|ما كاين|ارجع|عاود|نبحث|لقينا|مشي|روح|وصل|تعين|تلغى|"
    "كنسمعك|خلصنا|لباس|بغيتي|نعمل|كنقدر|مكاش|ما عندي|كارتة|تيفرغ|الكار|"
    "الخامسة|كنشوف|مانيش|عندك|ماشي|وين غادي|نروح"
)

# Mots-outils français courants — sert à distinguer "du vrai français" d'un
# simple nom propre en alphabet latin (ex: un nom de quartier transcrit).
_FRENCH_MARKERS = re.compile(
    r"\b(je|tu|il|elle|nous|vous|ils|elles|le|la|les|de|du|des|un|une|et|ou|"
    r"mais|donc|veux|voudrais|suis|vais|aller|bonjour|salut|bonsoir|merci|oui|"
    r"non|avec|pour|dans|sur|depuis|vers|où|quel|quelle|combien|besoin|"
    r"cherche|prendre|partir|c'est|s'il)\b",
    re.IGNORECASE,
)


class LanguageDetector:
    """Détecteur de langue basé sur des heuristiques (regex), sans appel
    réseau ni dépendance externe — mêmes règles que LangDetect.detect() côté
    frontend, pour que backend et frontend restent cohérents.
    """

    def detect(self, text, fallback_lang="fr"):
        """Détecte la langue d'un texte. Retourne 'fr', 'ar' ou 'ha' —
        jamais None.

        `fallback_lang` : langue déjà établie dans la conversation (ex:
        dernier message utilisateur). Un texte sans caractères arabes ET
        sans mot français reconnaissable (typiquement un nom de lieu
        transcrit en alphabet latin) n'est pas considéré comme du vrai
        français : on reste alors sur `fallback_lang` plutôt que de
        basculer sur 'fr' par défaut.
        """
        if not text or not text.strip():
            return fallback_lang or "fr"

        clean = re.sub(r"\s+", "", text)
        if not clean:
            return fallback_lang or "fr"

        arabic_chars = len(_ARABIC_RE.findall(text))
        ratio = arabic_chars / len(clean)

        if ratio >= 0.28:
            return "ha" if _HASSANIA_MARKERS.search(text) else "ar"

        if fallback_lang and fallback_lang != "fr" and not _FRENCH_MARKERS.search(text):
            return fallback_lang

        return "fr"
