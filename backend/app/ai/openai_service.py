"""
openai_service.py — Client HTTP pour l'API OpenAI (Chat Completions).

Isole tout appel réseau vers OpenAI derrière une seule classe, pour que le
reste du module app/ai/ (et, plus tard, les routes Flask) n'ait jamais à
connaître l'URL de l'API ni le format exact de la requête/réponse HTTP.

Suit le même principe que routes/realtime.py (déjà en prod pour le mode
vocal) : on utilise `requests` directement plutôt que le SDK officiel
`openai`, pour ne pas ajouter de nouvelle dépendance au projet.

Ce service n'est PAS encore appelé par le chatbot actuel : il est prêt à
l'emploi pour la prochaine étape de l'intégration LLM.
"""
import requests


class OpenAIServiceError(Exception):
    """Levée quand l'appel à l'API OpenAI échoue (réseau, HTTP, réponse invalide)."""


class OpenAIService:
    """Client minimal pour l'endpoint Chat Completions d'OpenAI.

    Les paramètres par défaut (modèle, température, max_tokens, timeout)
    peuvent être fournis explicitement, ou lus depuis la config Flask via
    `OpenAIService.from_app(app)` (voir config.py pour les clés utilisées).
    """

    CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"

    def __init__(self, api_key=None, model=None, temperature=None,
                 max_tokens=None, timeout=None, app_config=None):
        cfg = app_config or {}
        self.api_key     = api_key or cfg.get("OPENAI_API_KEY", "")
        self.model       = model or cfg.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")
        self.temperature = temperature if temperature is not None else cfg.get("OPENAI_TEMPERATURE", 0.3)
        self.max_tokens  = max_tokens or cfg.get("OPENAI_MAX_TOKENS", 512)
        self.timeout     = timeout or cfg.get("OPENAI_TIMEOUT", 15)

    @classmethod
    def from_app(cls, app):
        """Construit une instance à partir de la config d'une app Flask
        (`app.config`), pour rester cohérent avec le reste du backend
        (ex: current_app.config["OPENAI_API_KEY"] dans routes/realtime.py).
        """
        return cls(app_config=app.config)

    def is_configured(self):
        """True si une clé API est disponible — permet de vérifier avant
        d'appeler `send_message` et de renvoyer une erreur propre côté route.
        """
        return bool(self.api_key)

    def _request_completion(self, messages, overrides):
        """Effectue l'appel HTTP brut à l'API Chat Completions et retourne le
        JSON de la réponse. Factorisée hors de send_message/send_chat pour
        que la gestion d'erreurs (timeout, réseau, JSON invalide) ne soit
        écrite qu'à un seul endroit.

        Lève OpenAIServiceError pour toute condition d'échec :
        clé API absente, timeout, erreur réseau/HTTP, ou JSON illisible.
        """
        if not self.is_configured():
            raise OpenAIServiceError("OPENAI_API_KEY non configurée côté serveur")

        payload = {
            "model":       overrides.get("model", self.model),
            "messages":    messages,
            "temperature": overrides.get("temperature", self.temperature),
            "max_tokens":  overrides.get("max_tokens", self.max_tokens),
        }

        try:
            resp = requests.post(
                self.CHAT_COMPLETIONS_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type":  "application/json",
                },
                json=payload,
                timeout=self.timeout,
            )
            resp.raise_for_status()
        except requests.Timeout as exc:
            # Cas distingué du reste des erreurs réseau : le délai
            # (self.timeout, voir config.py: OPENAI_TIMEOUT) a été dépassé
            # sans réponse d'OpenAI.
            raise OpenAIServiceError(
                f"Délai dépassé en attendant la réponse d'OpenAI (timeout={self.timeout}s)"
            ) from exc
        except requests.RequestException as exc:
            # Regroupe les erreurs réseau (connexion impossible, DNS...) et
            # les erreurs HTTP renvoyées par OpenAI (401 clé invalide, 429
            # quota dépassé, 5xx côté OpenAI...) — raise_for_status() lève
            # une HTTPError, sous-classe de RequestException, dans ce cas.
            raise OpenAIServiceError(f"Échec de l'appel à l'API OpenAI : {exc}") from exc

        try:
            return resp.json()
        except ValueError as exc:
            raise OpenAIServiceError("Réponse OpenAI illisible (JSON invalide)") from exc

    def send_message(self, messages, **overrides):
        """Envoie une conversation à l'API Chat Completions et retourne le
        texte de la réponse du modèle.

        `messages` : liste au format OpenAI, ex.
            [{"role": "system", "content": "..."},
             {"role": "user", "content": "..."}]
        `overrides` : permet de surcharger model/temperature/max_tokens pour
        un appel ponctuel sans recréer d'instance (ex: température plus
        basse pour une intention précise).

        Lève OpenAIServiceError si la clé API est absente, si l'appel réseau
        échoue, ou si la réponse ne contient pas le format attendu.
        """
        data = self._request_completion(messages, overrides)
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, AttributeError) as exc:
            raise OpenAIServiceError("Réponse OpenAI inattendue (format inconnu)") from exc

    def send_chat(self, messages, **overrides):
        """Comme `send_message`, mais retourne aussi les métriques d'usage
        (prompt_tokens / completion_tokens) renvoyées par OpenAI — utilisé
        par la route POST /api/chat/ai (routes/ai_chat.py) pour les inclure
        dans sa réponse JSON.

        Retourne {"content": str, "usage": {"prompt_tokens": int|None,
        "completion_tokens": int|None}}.
        """
        data = self._request_completion(messages, overrides)
        try:
            content = data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, AttributeError) as exc:
            raise OpenAIServiceError("Réponse OpenAI inattendue (format inconnu)") from exc

        usage = data.get("usage") or {}
        return {
            "content": content,
            "usage": {
                "prompt_tokens":     usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
            },
        }
