from datetime import datetime
from ..extensions import db

# Langues gérées par le chat — sert de garde-fou de validation, pas d'enum
# strict, pour rester simple si une langue s'ajoute un jour.
SUPPORTED_LANGUAGES = ("fr", "ar", "ha")


class LlmSettings(db.Model):
    """Configuration du futur provider LLM (voir nlu.js côté frontend).

    Table singleton : une seule ligne (id=1), lue/écrite uniquement par le
    dashboard admin pour l'instant — aucun provider LLM ne consomme encore
    ces valeurs. Préparée à l'avance pour que le branchement du LLM n'ait
    qu'à lire cette table, sans nouvelle migration ni changement d'API.
    """
    __tablename__ = "llm_settings"

    id       = db.Column(db.Integer, primary_key=True)

    # "rules" = moteur actuel (aucun appel externe). Chaîne libre (pas un
    # Enum SQL) pour ajouter un fournisseur sans migration de schéma.
    provider = db.Column(db.String(40), nullable=False, default="rules")
    model_name = db.Column(db.String(120), nullable=True)

    # Ne jamais renvoyer cette valeur telle quelle via l'API — voir
    # to_dict(). Un futur provider LLM la lira côté serveur uniquement.
    api_key = db.Column(db.String(255), nullable=True)

    # Tâche d'extraction structurée, pas de génération créative : température
    # basse pour un résultat stable, et max_tokens réduit puisque la réponse
    # attendue (voir le schéma JSON dans routes/nlu.py) tient en ~100 tokens.
    temperature = db.Column(db.Numeric(3, 2), nullable=False, default=0.2)
    max_tokens  = db.Column(db.Integer, nullable=False, default=300)
    system_prompt = db.Column(db.Text, nullable=True)

    # Liste de codes langue (sous-ensemble de SUPPORTED_LANGUAGES).
    enabled_languages = db.Column(db.JSON, nullable=False, default=lambda: list(SUPPORTED_LANGUAGES))

    # Nombre de derniers messages transmis au LLM comme historique — reflète
    # la borne déjà utilisée par le moteur actuel (chat.js: messages.slice(-6)).
    history_size = db.Column(db.Integer, nullable=False, default=6)

    # Si vrai, le LLM ne doit répondre qu'aux sujets liés au transport /
    # à la réservation (voir le rôle du LLM défini pour l'intégration).
    strict_transport_mode = db.Column(db.Boolean, nullable=False, default=True)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "provider":       self.provider,
            "modelName":      self.model_name,
            "apiKeySet":      bool(self.api_key),
            "temperature":    float(self.temperature),
            "maxTokens":      self.max_tokens,
            "systemPrompt":   self.system_prompt or "",
            "enabledLanguages": self.enabled_languages or list(SUPPORTED_LANGUAGES),
            "historySize":    self.history_size,
            "strictTransportMode": self.strict_transport_mode,
            "updatedAt":      self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<LlmSettings provider={self.provider} model={self.model_name}>"

    @classmethod
    def get_current(cls) -> "LlmSettings":
        """Récupère l'unique ligne de config (id=1), la crée avec les
        valeurs par défaut du modèle si elle n'existe pas encore. Seul
        point d'accès partagé par /api/admin/llm-settings et /api/nlu/*."""
        settings = cls.query.get(1)
        if not settings:
            settings = cls(id=1)
            db.session.add(settings)
            db.session.commit()
        return settings
