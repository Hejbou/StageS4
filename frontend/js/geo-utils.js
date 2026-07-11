/* ════════════════════════════════════════════
   geo-utils.js — Calculs géographiques partagés
   (évite d'avoir la même formule de Haversine dupliquée
   dans poi-db.js et map-view.js)
   ════════════════════════════════════════════ */

const Geo = (() => {
  // ── Distance à vol d'oiseau (Haversine) ─────────────────────────
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // rayon moyen de la Terre, km
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    return haversineKm(lat1, lng1, lat2, lng2) * 1000;
  }

  return { haversineKm, haversineM };
})();
