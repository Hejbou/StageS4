"""Adaptateur OpenRouter — même signature que tous les adaptateurs de
llm_providers/ (voir __init__.py::get_adapter). N'importe rien de métier :
reçoit un prompt système + un prompt utilisateur déjà construits par
routes/nlu.py, renvoie le JSON brut renvoyé par le modèle.

OpenRouter expose une API compatible OpenAI (chat completions) devant de
nombreux modèles ; le nom de modèle attendu est le nom qualifié OpenRouter
(ex: "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct:free").
"""
import json
import requests

from .errors import LlmTimeoutError, LlmQuotaError, LlmApiError, LlmInvalidResponseError

_API_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_MODEL = "openai/gpt-4o-mini"


def complete(*, system_prompt: str, user_prompt: str, api_key: str,
             model: str | None = None, temperature: float = 0.3,
             max_tokens: int = 512, timeout: int = 8) -> dict:
    """Appelle OpenRouter en mode JSON strict et renvoie le dict déjà parsé.

    Lève LlmTimeoutError / LlmQuotaError / LlmApiError / LlmInvalidResponseError
    plutôt que de laisser fuir l'exception réseau brute — c'est ce que
    routes/nlu.py attend pour décider du repli vers "rules".
    """
    if not api_key:
        raise LlmApiError("Clé API OpenRouter manquante")

    payload = {
        "model": model or _DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(_API_URL, headers=headers, json=payload, timeout=timeout)
    except requests.exceptions.Timeout:
        raise LlmTimeoutError(f"OpenRouter n'a pas répondu en {timeout}s")
    except requests.exceptions.RequestException as e:
        raise LlmApiError(f"Erreur réseau OpenRouter : {e}")

    if resp.status_code == 429:
        raise LlmQuotaError("Quota OpenRouter dépassé")
    if resp.status_code == 402:
        raise LlmQuotaError("Crédits OpenRouter insuffisants")
    if not resp.ok:
        raise LlmApiError(f"OpenRouter a répondu {resp.status_code} : {resp.text[:200]}")

    try:
        body = resp.json()
        text = body["choices"][0]["message"]["content"]
        return json.loads(text)
    except (KeyError, IndexError, ValueError, json.JSONDecodeError) as e:
        raise LlmInvalidResponseError(f"Réponse OpenRouter inexploitable : {e}")
