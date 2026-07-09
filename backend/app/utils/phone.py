import re

# Numéro mauritanien : 8 chiffres, commence par 2, 3 ou 4
# 2x = Mauritel / Moov Africa
# 3x = Mattel
# 4x = Chinguitel
_PATTERN = re.compile(r"^[234]\d{7}$")


def validate_phone(phone: str) -> bool:
    """Retourne True si le numéro est un numéro mauritanien valide."""
    if not isinstance(phone, str):
        return False
    clean = phone.strip().replace(" ", "").replace("-", "")
    return bool(_PATTERN.match(clean))


def normalize_phone(phone: str) -> str:
    """Nettoie le numéro (supprime espaces/tirets). Lève ValueError si invalide."""
    clean = str(phone).strip().replace(" ", "").replace("-", "")
    if not _PATTERN.match(clean):
        raise ValueError(
            f"Numéro invalide : '{phone}'. "
            "Un numéro mauritanien doit avoir 8 chiffres et commencer par 2, 3 ou 4."
        )
    return clean


def operator_name(phone: str) -> str:
    """Retourne le nom de l'opérateur selon le premier chiffre."""
    first = str(phone)[0] if phone else ""
    return {"2": "Mauritel / Moov Africa", "3": "Mattel", "4": "Chinguitel"}.get(first, "Inconnu")
