"""
app.ai — Module d'intelligence artificielle (texte) de ChatIA.

Ce package regroupe les briques qui serviront, une fois branchées, à
compléter le moteur de règles actuel (frontend/js/nlu.js, frontend/js/chat.js)
par un vrai LLM (OpenAI) côté serveur :

    - openai_service.py       : appel HTTP à l'API OpenAI (Chat Completions)
    - prompts.py               : construction des prompts système par langue
    - conversation_memory.py   : historique de conversation en mémoire
    - language_detector.py     : détection de langue (fr / ar / ha)
    - intent_detector.py       : détection d'intention (mêmes intentions
                                  que INTENTS dans frontend/js/chat.js)

Statut : préparation d'architecture uniquement. Rien ici n'est encore
importé par app/__init__.py ni par les routes existantes — le chatbot
actuel (moteur "rules") continue de fonctionner sans aucun changement.
"""

from .openai_service import OpenAIService, OpenAIServiceError
from .conversation_memory import ConversationMemory
from .language_detector import LanguageDetector
from .intent_detector import IntentDetector

__all__ = [
    "OpenAIService",
    "OpenAIServiceError",
    "ConversationMemory",
    "LanguageDetector",
    "IntentDetector",
]
