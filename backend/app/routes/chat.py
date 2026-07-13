"""
/api/chat/sessions — Historique des conversations, lié au compte utilisateur.

Persistance pure : ce module ne fait AUCUNE logique métier (pas de NLU, pas
de calcul de prix, pas de réservation) — il ne fait qu'enregistrer les
messages que le moteur client (chat.js) a déjà produits, et permettre de
lister/rouvrir/supprimer les conversations passées. Le flux de réservation
et la logique IA restent entièrement gérés côté frontend, inchangés.

Chaque session est rattachée au numéro de téléphone de l'utilisateur connecté
(JWT) — un utilisateur ne peut jamais lister, lire, écrire ou supprimer une
conversation qui ne lui appartient pas.
"""
from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import ChatSession, ChatMessage
from ..utils import ok, created, error, not_found

chat_bp = Blueprint("chat", __name__)


def _get_own_session(session_id):
    """Récupère la session si elle appartient à l'utilisateur connecté,
    sinon None — jamais d'accès croisé entre comptes."""
    phone = get_jwt_identity()
    return ChatSession.query.filter_by(id=session_id, client_phone=phone).first()


@chat_bp.post("/sessions")
@jwt_required()
def create_session():
    data = request.get_json(silent=True) or {}
    lang = data.get("language", "fr")
    if lang not in ("fr", "ar", "ha"):
        lang = "fr"

    session = ChatSession(client_phone=get_jwt_identity(), language=lang)
    db.session.add(session)
    db.session.commit()
    return created(session.to_dict())


@chat_bp.get("/sessions")
@jwt_required()
def list_sessions():
    phone = get_jwt_identity()
    sessions = (
        ChatSession.query
        .filter_by(client_phone=phone)
        .order_by(ChatSession.updated_at.desc())
        .limit(100)
        .all()
    )
    return ok([s.to_dict() for s in sessions])


@chat_bp.post("/sessions/<int:session_id>/messages")
@jwt_required()
def add_message(session_id):
    session = _get_own_session(session_id)
    if not session:
        return not_found("Session introuvable")

    data    = request.get_json(silent=True) or {}
    sender  = data.get("sender", "user")
    content = (data.get("content") or "").strip()

    if not content:
        return error("content est obligatoire")
    if sender not in ("user", "ai"):
        return error("sender doit être 'user' ou 'ai'")

    msg = ChatMessage(session_id=session_id, sender=sender, content=content)
    db.session.add(msg)

    if sender == "user" and not session.summary:
        session.summary = content[:80]
    session.updated_at = datetime.utcnow()

    db.session.commit()
    return created(msg.to_dict())


@chat_bp.get("/sessions/<int:session_id>/messages")
@jwt_required()
def get_messages(session_id):
    session = _get_own_session(session_id)
    if not session:
        return not_found("Session introuvable")
    msgs = session.messages.order_by(ChatMessage.created_at.asc()).all()
    return ok([m.to_dict() for m in msgs])


@chat_bp.put("/sessions/<int:session_id>/end")
@jwt_required()
def end_session(session_id):
    session = _get_own_session(session_id)
    if not session:
        return not_found("Session introuvable")
    session.ended_at = datetime.utcnow()
    session.status = "closed"
    db.session.commit()
    return ok(session.to_dict())


@chat_bp.delete("/sessions/<int:session_id>")
@jwt_required()
def delete_session(session_id):
    session = _get_own_session(session_id)
    if not session:
        return not_found("Session introuvable")
    db.session.delete(session)  # cascade="all, delete-orphan" supprime aussi les messages
    db.session.commit()
    return ok(None, "Conversation supprimée")
