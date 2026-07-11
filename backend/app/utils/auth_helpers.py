from flask_jwt_extended import get_jwt_identity
from ..models import User
from .responses import forbidden


def require_admin():
    """Vérifie que l'utilisateur JWT courant est un admin actif.

    Retourne (user, None) si OK, ou (None, réponse_403) sinon — à utiliser
    juste après @jwt_required() dans toute route réservée aux admins :
        user, err = require_admin()
        if err: return err
    """
    phone = get_jwt_identity()
    user  = User.query.get(phone)
    if not user or user.role != "admin":
        return None, forbidden("Accès réservé aux administrateurs")
    return user, None
