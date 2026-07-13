"""
conversation_memory.py — Historique de conversation en mémoire pour le LLM.

But : constituer la liste de messages [{role, content}, ...] à transmettre
au LLM comme contexte, en bornant sa taille (voir LlmSettings.history_size,
même principe que `messages.slice(-6)` côté frontend/js/chat.js).

Implémentation en mémoire process (dict Python), suffisante pour cette
étape de préparation d'architecture. Une future version pourra la
remplacer par un stockage partagé (Redis, table SQL liée à ChatSession)
sans changer l'interface publique de cette classe.
"""


class ConversationMemory:
    """Historique de messages, indexé par identifiant de session.

    Un identifiant de session correspond typiquement à ChatSession.id
    (voir backend/app/models/chat.py), mais cette classe reste agnostique
    du modèle SQL pour pouvoir être testée/utilisée indépendamment.
    """

    def __init__(self, max_history=6):
        # max_history : nombre de messages (hors 'system') conservés,
        # aligné sur LlmSettings.history_size par défaut.
        self.max_history = max_history
        self._sessions = {}  # session_id -> list[{"role": ..., "content": ...}]

    def add_message(self, session_id, role, content):
        """Ajoute un message à l'historique d'une session.

        `role` : 'system' | 'user' | 'assistant' (convention OpenAI).
        """
        history = self._sessions.setdefault(session_id, [])
        history.append({"role": role, "content": content})

    def get_history(self, session_id, include_system=True):
        """Retourne les messages de la session à transmettre au LLM, bornés
        à `max_history` messages non-système (le(s) message(s) 'system'
        sont toujours conservés en tête, sans compter dans la borne).

        `include_system` : si False, exclut totalement les messages 'system'
        du résultat (utile si le prompt système est géré séparément).
        """
        history = self._sessions.get(session_id, [])

        if not include_system:
            return [m for m in history if m["role"] != "system"][-self.max_history:]

        system_msgs = [m for m in history if m["role"] == "system"]
        other_msgs  = [m for m in history if m["role"] != "system"]
        return system_msgs + other_msgs[-self.max_history:]

    def clear(self, session_id):
        """Efface l'historique d'une session (ex: fin de conversation, voir
        chat_bp.end_session dans routes/chat.py).
        """
        self._sessions.pop(session_id, None)
