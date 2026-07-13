"""Exceptions communes à tous les adaptateurs LLM.

Chaque adaptateur (gemini.py, groq.py, ...) doit lever l'une de ces
exceptions plutôt que laisser fuir l'exception brute du SDK/HTTP — c'est
ce qui permet à routes/nlu.py de traiter n'importe quel fournisseur de la
même façon pour décider du repli automatique vers "rules".
"""


class LlmProviderError(Exception):
    """Base commune — jamais levée directement."""


class LlmTimeoutError(LlmProviderError):
    """Le fournisseur n'a pas répondu dans le délai imparti."""


class LlmQuotaError(LlmProviderError):
    """Quota dépassé / rate limit (HTTP 429 ou équivalent fournisseur)."""


class LlmApiError(LlmProviderError):
    """Erreur HTTP ou réseau générique côté fournisseur."""


class LlmInvalidResponseError(LlmProviderError):
    """Réponse reçue mais pas exploitable (JSON absent/malformé)."""
