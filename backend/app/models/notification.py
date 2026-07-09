from datetime import datetime
from ..extensions import db


class Notification(db.Model):
    __tablename__ = "notifications"

    id          = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_phone  = db.Column(db.String(8), db.ForeignKey("users.phone"), nullable=False)
    title       = db.Column(db.String(200), nullable=False)
    message     = db.Column(db.Text, nullable=False)
    type        = db.Column(
        db.Enum("info", "success", "warning", "danger"),
        nullable=False, default="info"
    )
    icon        = db.Column(db.String(10), nullable=True)    # emoji
    is_read     = db.Column(db.Boolean, nullable=False, default=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", back_populates="notifications")

    def to_dict(self):
        return {
            "id":         self.id,
            "title":      self.title,
            "message":    self.message,
            "type":       self.type,
            "icon":       self.icon,
            "is_read":    self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
