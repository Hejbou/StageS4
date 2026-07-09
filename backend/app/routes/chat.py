from datetime import datetime
from flask import Blueprint, request
from ..extensions import db
from ..models import ChatSession, ChatMessage
from ..utils import ok, created, error, not_found

chat_bp = Blueprint("chat", __name__)


@chat_bp.post("/sessions")
def create_session():
    data = request.get_json(silent=True) or {}
    lang = data.get("language", "fr")
    if lang not in ("fr", "ar", "ha"):
        lang = "fr"

    session = ChatSession(language=lang)
    db.session.add(session)
    db.session.commit()
    return created(session.to_dict())


@chat_bp.get("/sessions")
def list_sessions():
    sessions = (
        ChatSession.query
        .order_by(ChatSession.started_at.desc())
        .limit(50)
        .all()
    )
    return ok([s.to_dict() for s in sessions])


@chat_bp.post("/sessions/<int:session_id>/messages")
def add_message(session_id):
    session = ChatSession.query.get(session_id)
    if not session:
        return not_found("Session introuvable")

    data    = request.get_json(silent=True) or {}
    sender  = data.get("sender", "user")
    content = data.get("content", "").strip()

    if not content:
        return error("content est obligatoire")
    if sender not in ("user", "ai"):
        return error("sender doit être 'user' ou 'ai'")

    msg = ChatMessage(session_id=session_id, sender=sender, content=content)
    db.session.add(msg)

    if sender == "user" and not session.summary:
        session.summary = content[:80]

    db.session.commit()
    return created(msg.to_dict())


@chat_bp.get("/sessions/<int:session_id>/messages")
def get_messages(session_id):
    session = ChatSession.query.get(session_id)
    if not session:
        return not_found()
    msgs = session.messages.order_by(ChatMessage.created_at.asc()).all()
    return ok([m.to_dict() for m in msgs])


@chat_bp.put("/sessions/<int:session_id>/end")
def end_session(session_id):
    session = ChatSession.query.get(session_id)
    if not session:
        return not_found()
    session.ended_at = datetime.utcnow()
    db.session.commit()
    return ok(session.to_dict())
