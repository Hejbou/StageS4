/* ════════════════════════════════════════════
   maps.js — Intégration Google Maps (via backend)
   • Autocomplete : appel backend /api/maps/autocomplete
   • Résolution   : appel backend /api/maps/resolve
   • Carte        : Leaflet.js (OpenStreetMap) — aucune clé API en frontend
   ════════════════════════════════════════════ */

const Maps = (() => {
  const API = 'http://localhost:5000/api/maps';

  let _map          = null;
  let _markers      = null;
  let _debounce     = null;
  let _onSelectCb   = null;

  // ── Appels backend ───────────────────────────────────────────────

  async function autocomplete(query, lang = 'fr') {
    if (!query || query.trim().length < 2) return [];
    try {
      const r = await fetch(`${API}/autocomplete?q=${encodeURIComponent(query.trim())}&lang=${lang}`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d.data) ? d.data : [];
    } catch { return []; }
  }

  /**
   * Résout origine + destination via le backend Maps.
   * Retourne null si le backend est inaccessible (fallback → MockData).
   *
   * Réponse d.data :
   *   { origin: {lat, lng, formatted_address},
   *     destination: {lat, lng, formatted_address},
   *     distance_km, duration_min, distance_text, duration_text,
   *     price, currency }
   */
  async function resolve(originText, destText, lang = 'fr') {
    try {
      const r = await fetch(`${API}/resolve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_text:      originText,
          destination_text: destText,
          lang,
        }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d.data || null;
    } catch { return null; }
  }

  // ── Carte Leaflet ────────────────────────────────────────────────

  /**
   * Initialise une carte Leaflet dans le div #containerId
   * et affiche l'itinéraire origine → destination.
   * originGeo / destGeo : { lat, lng, formatted_address? }
   */
  function initMap(containerId, originGeo, destGeo) {
    if (!window.L) return;
    const el = document.getElementById(containerId);
    if (!el) return;

    // Détruire l'ancienne instance si elle existe
    if (_map) { _map.remove(); _map = null; _markers = null; }

    const oLat = parseFloat(originGeo.lat);
    const oLng = parseFloat(originGeo.lng);
    const dLat = parseFloat(destGeo.lat);
    const dLng = parseFloat(destGeo.lng);

    _map = L.map(containerId, {
      center:             [(oLat + dLat) / 2, (oLng + dLng) / 2],
      zoom:               13,
      zoomControl:        false,
      attributionControl: false,
      scrollWheelZoom:    false,
      doubleClickZoom:    false,
      dragging:           true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(_map);

    _markers = L.layerGroup().addTo(_map);

    // Point de départ — sky blue
    L.circleMarker([oLat, oLng], {
      radius: 9, weight: 2.5,
      color: '#0369A1', fillColor: '#0EA5E9', fillOpacity: 1,
    }).addTo(_markers)
      .bindTooltip(originGeo.formatted_address || 'Départ', { permanent: false, direction: 'top' });

    // Destination — gold
    L.circleMarker([dLat, dLng], {
      radius: 9, weight: 2.5,
      color: '#B45309', fillColor: '#F59E0B', fillOpacity: 1,
    }).addTo(_markers)
      .bindTooltip(destGeo.formatted_address || 'Arrivée', { permanent: false, direction: 'top' });

    // Ligne pointillée entre les deux — sky blue
    L.polyline([[oLat, oLng], [dLat, dLng]], {
      color: '#0EA5E9', weight: 3, dashArray: '8 6', opacity: 0.75,
    }).addTo(_markers);

    // Centrer la vue sur les deux points
    _map.fitBounds(
      L.latLngBounds([[oLat, oLng], [dLat, dLng]]),
      { padding: [24, 24], maxZoom: 15 }
    );
  }

  function destroyMap() {
    if (_map) { _map.remove(); _map = null; _markers = null; }
  }

  // ── Panneau de suggestions ───────────────────────────────────────

  function initSuggestions(onSelectCb) {
    _onSelectCb = onSelectCb;
    const panel = document.getElementById('suggestions-panel');
    if (!panel) return;
    panel.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (item && _onSelectCb) {
        _onSelectCb(item.dataset.value);
        hideSuggestions();
      }
    });
  }

  function triggerAutocomplete(query, lang = 'fr') {
    clearTimeout(_debounce);
    if (!query || query.trim().length < 2) { hideSuggestions(); return; }
    _debounce = setTimeout(async () => {
      const results = await autocomplete(query.trim(), lang);
      _renderSuggestions(results);
    }, 280);
  }

  function _renderSuggestions(items) {
    const panel = document.getElementById('suggestions-panel');
    if (!panel) return;
    if (!items || items.length === 0) { hideSuggestions(); return; }

    panel.innerHTML = items.map(item => {
      const main = typeof item === 'string' ? item
                 : (item.name || item.description || item.main_text || '');
      const sub  = typeof item === 'object'
                 ? (item.secondary_text || item.commune || item.formatted_address || '')
                 : '';
      return `
        <div class="suggestion-item" data-value="${_esc(main)}" role="option">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="#0EA5E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <div class="suggestion-texts">
            <span class="suggestion-main">${_esc(main)}</span>
            ${sub ? `<span class="suggestion-sub">${_esc(sub)}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    panel.classList.remove('hidden');
  }

  function hideSuggestions() {
    clearTimeout(_debounce);
    const panel = document.getElementById('suggestions-panel');
    if (panel) { panel.innerHTML = ''; panel.classList.add('hidden'); }
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    autocomplete,
    resolve,
    initMap,
    destroyMap,
    initSuggestions,
    triggerAutocomplete,
    hideSuggestions,
  };
})();
