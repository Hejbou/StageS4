"""
prompts.py — Construction des prompts système envoyés au LLM, par langue.

Centralise le texte destiné au LLM pour que la personnalité et les règles
métier du bot (contexte transport en Mauritanie, langues gérées, mode
strict transport) restent définies à un seul endroit, plutôt que dispersées
dans chaque route qui appellera OpenAIService.
"""

# Langues supportées — doit rester aligné avec SUPPORTED_LANGUAGES
# (backend/app/models/llm_settings.py) et frontend/js/lang-detect.js.
SUPPORTED_LANGUAGES = ("fr", "ar", "ha")

# Rôle de base du bot, par langue (fr = français, ar = arabe standard,
# ha = hassaniya, le dialecte arabe mauritanien — voir lang-detect.js).
_BASE_ROLE = {
    "fr": (
        "Tu es l'assistant virtuel de ChatIA, un centre d'appel intelligent "
        "pour les services de transport en Mauritanie. Tu aides les clients "
        "à réserver un trajet, suivre une course en cours, ou l'annuler."
    ),
    "ar": (
        "أنت المساعد الافتراضي لتطبيق ChatIA، مركز اتصال ذكي لخدمات النقل في "
        "موريتانيا. مهمتك مساعدة العملاء على حجز رحلة، متابعة رحلة جارية، أو إلغائها."
    ),
    "ha": (
        "أنت المساعد الافتراضي ديال ChatIA، مركز نداء ذكي لخدمات النقل في "
        "موريتانيا. خدمتك تعاون الزبائن يحجزو تريج، يتابعو الكار ديالهم، ولا يلغيوه."
    ),
}

# Ajouté au prompt quand LlmSettings.strict_transport_mode est activé
# (voir backend/app/models/llm_settings.py).
_STRICT_SUFFIX = {
    "fr": " Réponds uniquement aux questions liées au transport et à la réservation.",
    "ar": " أجب فقط عن الأسئلة المتعلقة بالنقل والحجز.",
    "ha": " جاوب غير على الأسئلة يلي عندها علاقة بالنقل والحجز.",
}


def build_system_prompt(language="fr", strict_transport_mode=True, extra_instructions=None):
    """Construit le prompt système complet pour une langue et un mode donnés.

    `language` : 'fr' | 'ar' | 'ha' — retombe sur 'fr' si valeur inconnue.
    `strict_transport_mode` : ajoute une consigne limitant le bot au sujet
        transport (reflète LlmSettings.strict_transport_mode).
    `extra_instructions` (optionnel) : texte additionnel injecté à la fin,
        ex. le contenu libre de LlmSettings.system_prompt défini par l'admin.
    """
    lang = language if language in SUPPORTED_LANGUAGES else "fr"
    prompt = _BASE_ROLE[lang]

    if strict_transport_mode:
        prompt += _STRICT_SUFFIX[lang]

    if extra_instructions:
        prompt += f"\n\n{extra_instructions}"

    return prompt
