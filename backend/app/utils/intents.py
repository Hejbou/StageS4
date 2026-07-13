"""Source unique des intentions connues — lue directement depuis
frontend/js/intents.js (voir ce fichier) plutôt que dupliquée à la main
ici. Un intent ajouté côté chat.js ne peut donc plus être oublié côté
backend : ce module relit le même fichier à chaque démarrage du process.

Le fichier JS est volontairement un format minimal et prévisible
(`const KNOWN_INTENTS = [...]`) — pas besoin d'exécuter du JS pour
l'extraire, une expression régulière + json.loads suffit et reste
beaucoup plus simple qu'ajouter un outil de build au projet.
"""
import json
import os
import re

_INTENTS_JS_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "frontend", "js", "intents.js"
))


def _load_known_intents() -> tuple[str, ...]:
    with open(_INTENTS_JS_PATH, encoding="utf-8") as f:
        content = f.read()
    match = re.search(r"KNOWN_INTENTS\s*=\s*(\[[^\]]*\])", content, re.DOTALL)
    if not match:
        raise RuntimeError(f"Impossible de lire KNOWN_INTENTS depuis {_INTENTS_JS_PATH}")
    # JS autorise une virgule finale avant "]", pas JSON — on la retire.
    array_literal = re.sub(r",\s*\]", "]", match.group(1))
    names = json.loads(array_literal.replace("'", '"'))
    # "UNKNOWN" n'est jamais listé dans intents.js (ce n'est pas une
    # intention "détectée") mais reste une valeur de repli valide ici.
    return tuple(names) + ("UNKNOWN",)


KNOWN_INTENTS = _load_known_intents()
