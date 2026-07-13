from datetime import datetime
from ..extensions import db


class ChatSession(db.Model):
    __tablename__ = "chat_sessions"

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    client_phone = db.Column(db.String(8), db.ForeignKey("users.phone"), nullable=True)
    language     = db.Column(db.Enum("fr", "ar", "ha"), nullable=False, default="fr")
    summary      = db.Column(db.String(255), nullable=True)
    status       = db.Column(db.Enum("active", "closed"), nullable=False, default="active")
    started_at   = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    ended_at     = db.Column(db.DateTime, nullable=True)

    messages = db.relationship(
        "ChatMessage", back_populates="session",
        lazy="dynamic", cascade="all, delete-orphan"
    )
    client = db.relationship("User", foreign_keys=[client_phone], back_populates="chat_sessions")

    def to_dict(self):
        return {
            "id":        self.id,
            "title":     self.summary or "Nouvelle conversation",
            "language":  self.language,
            "status":    self.status,
            "createdAt": self.started_at.isoformat() if self.started_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "endedAt":   self.ended_at.isoformat()   if self.ended_at   else None,
            "turns":     self.messages.count(),
        }


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(db.Integer, db.ForeignKey("chat_sessions.id"), nullable=False)
    sender     = db.Column(db.Enum("user", "ai"), nullable=False)
    content    = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    session = db.relationship("ChatSession", back_populates="messages")

    def to_dict(self):
        return {
            "id":         self.id,
            "session_id": self.session_id,
            "sender":     self.sender,
            "content":    self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
