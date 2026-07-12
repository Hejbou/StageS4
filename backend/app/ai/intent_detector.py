"""
intent_detector.py — Détection d'intention à partir d'un message utilisateur.

Port Python des patterns INTENTS de frontend/js/chat.js, pour que le futur
provider LLM (ou un moteur hybride règles+LLM, voir la doc dans
frontend/js/nlu.js) reste compatible avec les mêmes noms d'intention côté
backend et frontend — aucune renégociation de contrat nécessaire lors du
branchement.

L'ordre de test des intentions est important : CANCEL_TRIP et STATUS sont
vérifiés avant REQUEST_TRANSPORT pour éviter les faux positifs (ex:
"annuler mon trajet" contient "trajet", un mot-clé de REQUEST_TRANSPORT).
"""
import re

# Patterns par intention et par langue — mêmes regex que INTENTS dans
# frontend/js/chat.js (fr/ar/ha), portées telles quelles en Python.
INTENT_PATTERNS = {
    "CANCEL_TRIP": {
        "fr": re.compile(
            r"\b(annuler (mon|ma|le|la)? ?(trajet|course|demande|voyage|trip)|"
            r"supprimer (ma|mon)? ?(course|trajet|demande))\b",
            re.IGNORECASE,
        ),
        "ar": re.compile(r"(إلغاء (الطلب|الرحلة|الحجز)|ألغِ الطلب|إلغاء طلبي|أريد إلغاء|إلغاء طلب)"),
        "ha": re.compile(r"(إلغاء الطلب|إلغاء الكار|بغيت تلغي|إلغاء طلبي)"),
    },
    "STATUS": {
        "fr": re.compile(
            r"\b(statut|état|où en est|suivi|tracking|voir mon statut|ma course|mon trajet en cours)\b",
            re.IGNORECASE,
        ),
        "ar": re.compile(r"(حالة الطلب|الحالة|وضع الطلب|متابعة|حالة طلبي|ما حالة|أين السائق)"),
        "ha": re.compile(r"(حالة الطلب|شحال الطلب|سايق|فين السايق|شحال الطلب ديالي)"),
    },
    "GREET": {
        "fr": re.compile(r"\b(bonjour|salut|hello|bonsoir|coucou|salam|ça va)\b", re.IGNORECASE),
        "ar": re.compile(r"(مرحب|أهلاً|أهل|سلام|صباح|مساء|هلا)"),
        "ha": re.compile(r"(أهلاً بيك|واخا|لباس|مرحب|هلا)"),
    },
    "CONFIRM": {
        "fr": re.compile(
            r"\b(oui|confirmer|confirme|ok|d'accord|accepter|yes|c'est bon|parfait|allons|valider|valide)\b",
            re.IGNORECASE,
        ),
        "ar": re.compile(r"(نعم|تأكيد|موافق|صحيح|تمام|طيب|أكد|وافق|ايه)"),
        "ha": re.compile(r"(نعم|واخا|صح|تمام|طيب|أكد|وافق)"),
    },
    "CANCEL": {
        "fr": re.compile(r"\b(non|stop|arrêter|refus|quitter|pas|rien)\b", re.IGNORECASE),
        "ar": re.compile(r"(لا|وقف|توقف|ما أريد)"),
        "ha": re.compile(r"(لا|وقف|ما|بلا)"),
    },
    "MODIFY": {
        "fr": re.compile(
            r"\b(modifier|modifie|changer|corriger|éditer|changer le point|modifier le point)\b",
            re.IGNORECASE,
        ),
        "ar": re.compile(r"(تعديل|تغيير|تصحيح|عدل|غير الموقع)"),
        "ha": re.compile(r"(تعديل|تغيير|تبديل|عدل|بدل)"),
    },
    "REQUEST_TRANSPORT": {
        "fr": re.compile(
            r"\b(transport|taxi|voiture|aller|emmène|conduire|partir|réserver|commande|besoin|"
            r"veux|cherche|prendre|pars|depuis|de .+ (à|vers|pour))\b",
            re.IGNORECASE,
        ),
        "ar": re.compile(r"(سيارة|تاكسي|أريد سيارة|أحتاج سيارة|نقل|موصلة|توصيل|أوصلني|خذني|أريد الذهاب|انطلاقاً)"),
        "ha": re.compile(r"(كار|بغيت كار|نقل|سيارة|توصيلة|خذني|وصلني)"),
    },
    "HELP": {
        "fr": re.compile(r"\b(aide|help|comment|quoi|que peux|fonctionner|utiliser|faire)\b", re.IGNORECASE),
        "ar": re.compile(r"(مساعدة|كيف|ماذا|ممكن|ما هو)"),
        "ha": re.compile(r"(مساعدة|كيفاش|شنو|نقدر)"),
    },
    "HISTORY": {
        "fr": re.compile(r"\b(historique|passé|dernier|précédent|conversation)\b", re.IGNORECASE),
        "ar": re.compile(r"(سجل|تاريخ|سابق|محادثة)"),
        "ha": re.compile(r"(سجل|سابق|محادثة)"),
    },
    "MAP": {
        "fr": re.compile(
            r"\b(carte|maps?|itinéraire|plan|chemin|navigation|gps|localisation|trajet sur la carte|voir la carte)\b",
            re.IGNORECASE,
        ),
        "ar": re.compile(r"(خريطة|خارطة|مسار|اتجاه|GPS|جي بي إس|خريطة المسار)"),
        "ha": re.compile(r"(كارتة|خريطة|مسار|طريق)"),
    },
}

# Ordre de repli des langues quand l'intention n'est pas trouvée dans la
# langue détectée du message — même stratégie que `order` dans _detectIntent
# (frontend/js/chat.js) : langue courante d'abord, puis les autres.
_LANG_ORDER = ("fr", "ar", "ha")


class IntentDetector:
    """Détecteur d'intention par mots-clés, sans dépendance externe.

    Utilise les mêmes noms d'intention que INTENTS dans frontend/js/chat.js
    (CANCEL_TRIP, STATUS, GREET, CONFIRM, CANCEL, MODIFY, REQUEST_TRANSPORT,
    HELP, HISTORY, MAP) plus 'UNKNOWN' si rien ne correspond.
    """

    def detect_intent(self, text, lang="fr"):
        """Retourne le nom de l'intention détectée (ex: 'GREET') ou 'UNKNOWN'
        si aucun pattern ne correspond dans aucune langue.

        `lang` : langue déjà détectée du message (voir LanguageDetector) —
        testée en priorité avant les autres langues supportées.
        """
        if not text:
            return "UNKNOWN"

        order = [lang] + [l for l in _LANG_ORDER if l != lang]
        for intent, patterns in INTENT_PATTERNS.items():
            for l in order:
                pattern = patterns.get(l)
                if pattern and pattern.search(text):
                    return intent
        return "UNKNOWN"
