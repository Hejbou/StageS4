from flask import jsonify


def ok(data=None, message="", status=200):
    return jsonify({"success": True,  "data": data,    "message": message}), status


def created(data=None, message="Créé avec succès"):
    return jsonify({"success": True,  "data": data,    "message": message}), 201


def error(message="Erreur", status=400, details=None):
    body = {"success": False, "error": message}
    if details:
        body["details"] = details
    return jsonify(body), status


def not_found(message="Ressource introuvable"):
    return error(message, 404)


def forbidden(message="Accès refusé"):
    return error(message, 403)


def unauthorized(message="Authentification requise"):
    return error(message, 401)
