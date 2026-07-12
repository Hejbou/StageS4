"""
/api/voice — Jeton éphémère pour la connexion WebRTC directe du navigateur
vers l'API Realtime d'OpenAI (mode vocal in-app, voir frontend/js/realtime-voice.js).

Le backend est le SEUL endroit qui connaît la vraie OPENAI_API_KEY : il
l'utilise pour demander à OpenAI une session éphémère de courte durée, et ne
renvoie au navigateur que ce jeton temporaire — jamais la clé réelle. Le
navigateur s'en sert ensuite pour négocier directement l'offre SDP WebRTC
avec OpenAI (audio full-duplex, sans repasser par ce backend).
"""
import requests
from flask import Blueprint, current_app
from ..utils import ok, error

realtime_bp = Blueprint("realtime", __name__)

OPENAI_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"


@realtime_bp.post("/ephemeral-token")
def create_ephemeral_token():
    api_key = current_app.config.get("OPENAI_API_KEY")
    if not api_key:
        return error("OPENAI_API_KEY non configurée côté serveur", 503)

    payload = {
        "model": current_app.config["OPENAI_REALTIME_MODEL"],
        "voice": current_app.config["OPENAI_REALTIME_VOICE"],
    }

    try:
        resp = requests.post(
            OPENAI_SESSIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
            },
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        return error(f"Échec de création de session OpenAI Realtime : {exc}", 502)

    session       = resp.json()
    client_secret = (session.get("client_secret") or {}).get("value")
    if not client_secret:
        return error("Réponse OpenAI inattendue (client_secret manquant)", 502)

    return ok({
        "clientSecret": client_secret,
        "model":        payload["model"],
        "expiresAt":    (session.get("client_secret") or {}).get("expires_at"),
    })
