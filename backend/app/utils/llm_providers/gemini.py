"""Adaptateur Google Gemini — même signature que tous les adaptateurs de
llm_providers/ (voir __init__.py::get_adapter). N'importe rien de métier :
reçoit un prompt système + un prompt utilisateur déjà construits par
routes/nlu.py, renvoie le JSON brut renvoyé par le modèle.
"""
import json
import requests

from .errors import LlmTimeoutError, LlmQuotaError, LlmApiError, LlmInvalidResponseError

_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_DEFAULT_MODEL = "gemini-2.0-flash"


def complete(*, system_prompt: str, user_prompt: str, api_key: str,
             model: str | None = None, temperature: float = 0.3,
             max_tokens: int = 512, timeout: int = 8) -> dict:
    """Appelle Gemini en mode JSON strict et renvoie le dict déjà parsé.

    Lève LlmTimeoutError / LlmQuotaError / LlmApiError / LlmInvalidResponseError
    plutôt que de laisser fuir l'exception réseau brute — c'est ce que
    routes/nlu.py attend pour décider du repli vers "rules".
    """
    if not api_key:
        raise LlmApiError("Clé API Gemini manquante")

    url = f"{_API_BASE}/{model or _DEFAULT_MODEL}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(
            url,
            params={"key": api_key},
            json=payload,
            timeout=timeout,
        )
    except requests.exceptions.Timeout:
        raise LlmTimeoutError(f"Gemini n'a pas répondu en {timeout}s")
    except requests.exceptions.RequestException as e:
        raise LlmApiError(f"Erreur réseau Gemini : {e}")

    if resp.status_code == 429:
        raise LlmQuotaError("Quota Gemini dépassé")
    if not resp.ok:
        raise LlmApiError(f"Gemini a répondu {resp.status_code} : {resp.text[:200]}")

    try:
        body = resp.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, ValueError, json.JSONDecodeError) as e:
        raise LlmInvalidResponseError(f"Réponse Gemini inexploitable : {e}")
