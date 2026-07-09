import math
from datetime import datetime
from flask import current_app


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance à vol d'oiseau entre deux points GPS (en km)."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def calculate_price(
    distance_km: float,
    now: datetime | None = None,
) -> float:
    """
    Tarification MRU (Ouguiya mauritanien) :
        100 MRU de base + 50 MRU par tranche de 4 km complète.
        Course < 4 km → 100 MRU (minimum garanti).
    """
    tranches = math.floor(distance_km / 4)
    return float(100 + tranches * 50)

