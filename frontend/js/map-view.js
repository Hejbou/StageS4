/* ════════════════════════════════════════════
   map-view.js — Vue Carte Interactive
   • Tap sur carte → départ puis arrivée
   • Reverse geocode via Nominatim (gratuit, sans clé)
   • Calcul prix : 100 MRU + 50 MRU / 4 km
   • Bouton Lancer + Annuler
   ════════════════════════════════════════════ */

const MapView = (() => {

  let _map       = null;
  let _oMarker   = null;
  let _dMarker   = null;
  let _routeLine = null;
  let _originGeo = null;
  let _destGeo   = null;
  let _mode      = 'origin'; // 'origin' | 'dest'

  // ── Formule prix ────────────────────────────────────────────────
  function _price(km) {
    return 100 + Math.floor(km / 4) * 50;
  }

  // ── Haversine ────────────────────────────────────────────────────
  function _hav(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Reverse geocode (Nominatim, gratuit) ────────────────────────
  async function _revGeocode(lat, lng) {
    try {
      const lang = I18n.getLang() === 'ar' ? 'ar' : 'fr';
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}`,
        { headers: { 'Accept-Language': lang } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d && d.address) {
          const a = d.address;
          // Retourne quartier + ville ou display_name raccourci
          const part = a.suburb || a.neighbourhood || a.road || a.county || a.city || '';
          const city = a.city || a.town || a.village || '';
          return [part, city].filter(Boolean).join(', ') || d.display_name.split(',').slice(0, 2).join(',').trim();
        }
      }
    } catch {}
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  // ── Forward geocode : backend → Nominatim fallback ──────────────
  async function _geocode(text, isOrigin) {
    const lang = I18n.getLang();

    // 1. Backend
    try {
      const r = await fetch(
        `http://localhost:5000/api/maps/geocode?address=${encodeURIComponent(text)}&lang=${lang}`
      );
      if (r.ok) {
        const d = await r.json();
        const g = d.data;
        if (g && g.lat) {
          if (isOrigin) _placeOrigin(g.lat, g.lng, g.formatted_address || text);
          else          _placeDest(g.lat,   g.lng, g.formatted_address || text);
          return;
        }
      }
    } catch {}

    // 2. Nominatim (gratuit, sans clé)
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text + ', Mauritanie')}&format=json&limit=1&countrycodes=mr&accept-language=${lang}`
      );
      if (r.ok) {
        const results = await r.json();
        if (results && results[0]) {
          const lat  = parseFloat(results[0].lat);
          const lng  = parseFloat(results[0].lon);
          const addr = results[0].display_name.split(',').slice(0, 2).join(',').trim();
          if (isOrigin) _placeOrigin(lat, lng, addr || text);
          else          _placeDest(lat,  lng, addr || text);
          return;
        }
      }
    } catch {}

    // 3. Fallback visible : Nouakchott centre ± léger offset
    const base = { lat: 18.0735, lng: -15.9582 };
    const seed = text.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const lat  = base.lat + ((seed % 40 - 20) / 1000);
    const lng  = base.lng + ((seed % 30 - 15) / 1000);
    if (isOrigin) _placeOrigin(lat, lng, text);
    else          _placeDest(lat,  lng, text);
  }

  // ── Init carte Leaflet ───────────────────────────────────────────
  function _initMap() {
    if (_map || !window.L) return;
    const el = document.getElementById('mv-map');
    if (!el || !el.offsetParent) return;   // pas encore visible

    _map = L.map('mv-map', {
      center: [18.0735, -15.9582],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://openstreetmap.org">OSM</a>',
    }).addTo(_map);

    L.control.zoom({ position: 'bottomright' }).addTo(_map);

    // Tap sur carte → reverse geocode + placer marker
    _map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      _fadeHint();
      const address = await _revGeocode(lat, lng);
      if (_mode === 'origin') {
        _placeOrigin(lat, lng, address);
        _setMode('dest');
      } else {
        _placeDest(lat, lng, address);
      }
    });

    _updateHint();
  }

  // ── Placer marqueurs ─────────────────────────────────────────────

  function _placeOrigin(lat, lng, address) {
    if (!_map) return;
    if (_oMarker) _map.removeLayer(_oMarker);

    _oMarker = L.circleMarker([lat, lng], {
      radius: 11, weight: 3,
      color: '#0369A1', fillColor: '#0EA5E9', fillOpacity: 1,
    }).addTo(_map)
      .bindTooltip(address || 'Départ', { permanent: false, direction: 'top', className: 'mv-tooltip-origin' });

    _originGeo = { lat, lng, formatted_address: address, name: address };
    const inp = document.getElementById('mv-origin-input');
    if (inp) inp.value = address || '';
    _updateRoute();
  }

  function _placeDest(lat, lng, address) {
    if (!_map) return;
    if (_dMarker) _map.removeLayer(_dMarker);

    _dMarker = L.circleMarker([lat, lng], {
      radius: 11, weight: 3,
      color: '#B45309', fillColor: '#F59E0B', fillOpacity: 1,
    }).addTo(_map)
      .bindTooltip(address || 'Arrivée', { permanent: false, direction: 'top', className: 'mv-tooltip-dest' });

    _destGeo = { lat, lng, formatted_address: address, name: address };
    const inp = document.getElementById('mv-dest-input');
    if (inp) inp.value = address || '';
    _updateRoute();
  }

  // ── Calcul route + prix ──────────────────────────────────────────

  async function _updateRoute() {
    if (!_originGeo || !_destGeo || !_map) { _hidePricePanel(); return; }

    if (_routeLine) _map.removeLayer(_routeLine);
    _routeLine = L.polyline(
      [[_originGeo.lat, _originGeo.lng], [_destGeo.lat, _destGeo.lng]],
      { color: '#0EA5E9', weight: 3.5, dashArray: '9 6', opacity: 0.85 }
    ).addTo(_map);

    _map.fitBounds(
      L.latLngBounds([[_originGeo.lat, _originGeo.lng], [_destGeo.lat, _destGeo.lng]]),
      { padding: [80, 60], maxZoom: 15 }
    );

    _showPricePanel({ loading: true });

    // Backend
    try {
      const params = new URLSearchParams({
        origin_lat: _originGeo.lat, origin_lng: _originGeo.lng,
        dest_lat:   _destGeo.lat,   dest_lng:   _destGeo.lng,
        lang:       I18n.getLang(),
      });
      const r = await fetch(`http://localhost:5000/api/maps/distance?${params}`);
      if (r.ok) {
        const info = (await r.json()).data;
        const km   = parseFloat(info.distance_km);
        _showPricePanel({
          distance: info.distance_text || `${km.toFixed(1)} km`,
          duration: info.duration_text || `${info.duration_min} min`,
          price:    _price(km),
        });
        return;
      }
    } catch {}

    // Fallback haversine × 1.35
    const km  = _hav(_originGeo.lat, _originGeo.lng, _destGeo.lat, _destGeo.lng) * 1.35;
    const min = Math.round(km / 30 * 60);
    _showPricePanel({
      distance: `~${km.toFixed(1)} km`,
      duration: `~${min} min`,
      price:    _price(km),
    });
  }

  // ── Panneau prix ─────────────────────────────────────────────────

  function _showPricePanel({ loading, distance, duration, price }) {
    const panel      = document.getElementById('mv-price-panel');
    const distEl     = document.getElementById('mv-distance');
    const durEl      = document.getElementById('mv-duration');
    const priceEl    = document.getElementById('mv-price');
    const bookBtn    = document.getElementById('mv-book-btn');
    const cancelBtn  = document.getElementById('mv-cancel-route-btn');
    if (!panel) return;

    panel.classList.remove('hidden');

    if (loading) {
      if (distEl)    distEl.textContent  = '…';
      if (durEl)     durEl.textContent   = '…';
      if (priceEl)   priceEl.textContent = '…';
      if (bookBtn)   bookBtn.disabled    = true;
      if (cancelBtn) cancelBtn.disabled  = true;
      return;
    }

    if (distEl)    distEl.textContent  = distance || '';
    if (durEl)     durEl.textContent   = duration || '';
    if (priceEl)   priceEl.textContent = `${price} MRU`;
    if (bookBtn)   bookBtn.disabled    = false;
    if (cancelBtn) cancelBtn.disabled  = false;
    if (panel)     panel.dataset.price = price;
  }

  function _hidePricePanel() {
    document.getElementById('mv-price-panel')?.classList.add('hidden');
  }

  // ── Annuler le trajet ────────────────────────────────────────────

  function _cancelRoute() {
    if (_oMarker  && _map) { _map.removeLayer(_oMarker);  _oMarker  = null; }
    if (_dMarker  && _map) { _map.removeLayer(_dMarker);  _dMarker  = null; }
    if (_routeLine && _map) { _map.removeLayer(_routeLine); _routeLine = null; }
    _originGeo = null;
    _destGeo   = null;
    _hidePricePanel();
    _setMode('origin');
    const oi = document.getElementById('mv-origin-input');
    const di = document.getElementById('mv-dest-input');
    if (oi) oi.value = '';
    if (di) di.value = '';
    _updateHint();
  }

  // ── Mode sélecteur ───────────────────────────────────────────────

  function _setMode(mode) {
    _mode = mode;
    const ob = document.getElementById('mv-mode-origin');
    const db = document.getElementById('mv-mode-dest');
    if (ob) {
      ob.classList.toggle('active',      mode === 'origin');
      ob.classList.toggle('origin-mode', mode === 'origin');
    }
    if (db) {
      db.classList.toggle('active',    mode === 'dest');
      db.classList.toggle('dest-mode', mode === 'dest');
    }
    _updateHint();
  }

  function _updateHint() {
    const hint = document.getElementById('mv-map-hint');
    if (!hint) return;
    const lang = I18n.getLang();
    const msgs = {
      origin: { fr: 'Appuyez sur la carte pour placer le départ',  ar: 'انقر على الخريطة لتحديد نقطة الانطلاق', ha: 'اضغط على الكارتة لتحديد الانطلاق' },
      dest:   { fr: 'Appuyez sur la carte pour placer l\'arrivée', ar: 'انقر على الخريطة لتحديد الوجهة',        ha: 'اضغط على الكارتة لتحديد الوصول'  },
    };
    hint.textContent = msgs[_mode]?.[lang] || msgs[_mode]?.fr || '';
  }

  function _fadeHint() {
    const hint = document.getElementById('mv-map-hint');
    if (!hint) return;
    hint.classList.add('fade-out');
    setTimeout(() => hint.classList.remove('fade-out'), 1400);
  }

  // ── Autocomplete inputs ──────────────────────────────────────────

  function _wireInput(inputId, suggestId, onSelect) {
    const inp  = document.getElementById(inputId);
    const sugg = document.getElementById(suggestId);
    if (!inp || !sugg) return;

    let timer = null;
    inp.addEventListener('input', () => {
      clearTimeout(timer);
      const q = inp.value.trim();
      if (q.length < 2) { sugg.classList.add('hidden'); return; }
      timer = setTimeout(async () => {
        const items = await Maps.autocomplete(q, I18n.getLang());
        if (!items || !items.length) { sugg.classList.add('hidden'); return; }
        sugg.innerHTML = items.map(item => {
          const main = typeof item === 'string' ? item : (item.name || item.description || '');
          const sub  = typeof item === 'object' ? (item.secondary_text || item.commune || '') : '';
          return `<div class="mv-suggest-item" data-val="${_esc(main)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" stroke-width="2.2" stroke-linecap="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <div>
              <div class="mv-suggest-main">${_esc(main)}</div>
              ${sub ? `<div class="mv-suggest-sub">${_esc(sub)}</div>` : ''}
            </div>
          </div>`;
        }).join('');
        sugg.classList.remove('hidden');
      }, 280);
    });

    sugg.addEventListener('click', (e) => {
      const item = e.target.closest('.mv-suggest-item');
      if (!item) return;
      const val = item.dataset.val;
      inp.value = val;
      sugg.innerHTML = ''; sugg.classList.add('hidden');
      onSelect(val);
    });

    inp.addEventListener('blur',    () => setTimeout(() => sugg.classList.add('hidden'), 220));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sugg.classList.add('hidden'); onSelect(inp.value.trim()); }
    });
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Réserver ─────────────────────────────────────────────────────

  function _book() {
    if (!_originGeo || !_destGeo) {
      const msg = { fr: 'Définissez d\'abord le départ et la destination.', ar: 'حدد الانطلاق والوجهة أولاً.', ha: 'حدد الانطلاق والوصول أولاً.' };
      Notifications.toast(msg[I18n.getLang()] || msg.fr, 'warning', 3000);
      return;
    }
    const origin = document.getElementById('mv-origin-input')?.value || _originGeo.formatted_address || 'Départ';
    const dest   = document.getElementById('mv-dest-input')?.value   || _destGeo.formatted_address   || 'Arrivée';
    const price  = document.getElementById('mv-price-panel')?.dataset.price;

    Transport.createRequest(origin, dest);
    _cancelRoute();   // reset markers après réservation
    App.navigateTo('requests');

    const toast = { fr: `Course lancée ! Prix : ${price || '?'} MRU`, ar: `تم إطلاق الرحلة ! السعر : ${price || '?'} أوقية`, ha: `الكار انطلق ! الثمن : ${price || '?'} أوقية` };
    Notifications.toast(toast[I18n.getLang()] || toast.fr, 'success', 3500);
  }

  // ── Prefill depuis Chat / Call ────────────────────────────────────

  function setRoute(originText, destText) {
    const oi = document.getElementById('mv-origin-input');
    const di = document.getElementById('mv-dest-input');
    if (oi) oi.value = originText || '';
    if (di) di.value = destText   || '';
    if (originText) _geocode(originText, true);
    if (destText)   _geocode(destText,   false);
  }

  // ── Vue visible ──────────────────────────────────────────────────

  function show() {
    // Délai pour laisser le DOM se rendre après display:flex
    setTimeout(() => {
      _initMap();
      if (_map) {
        _map.invalidateSize();
        setTimeout(() => _map && _map.invalidateSize(), 250);
      }
      _updateHint();
    }, 150);
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    document.getElementById('mv-mode-origin')?.addEventListener('click', () => _setMode('origin'));
    document.getElementById('mv-mode-dest')?.addEventListener('click',   () => _setMode('dest'));

    document.getElementById('mv-swap-btn')?.addEventListener('click', () => {
      const oi = document.getElementById('mv-origin-input');
      const di = document.getElementById('mv-dest-input');
      if (!oi || !di) return;
      [oi.value, di.value]     = [di.value, oi.value];
      [_originGeo, _destGeo]   = [_destGeo, _originGeo];
      if (_oMarker && _dMarker) {
        const oLL = _oMarker.getLatLng();
        const dLL = _dMarker.getLatLng();
        _oMarker.setLatLng(dLL);
        _dMarker.setLatLng(oLL);
      }
      _updateRoute();
    });

    _wireInput('mv-origin-input', 'mv-origin-suggest', (v) => _geocode(v, true));
    _wireInput('mv-dest-input',   'mv-dest-suggest',   (v) => _geocode(v, false));

    document.getElementById('mv-origin-clear')?.addEventListener('click', () => {
      const inp = document.getElementById('mv-origin-input');
      if (inp) inp.value = '';
      if (_oMarker && _map) { _map.removeLayer(_oMarker); _oMarker = null; }
      _originGeo = null;
      _hidePricePanel();
    });
    document.getElementById('mv-dest-clear')?.addEventListener('click', () => {
      const inp = document.getElementById('mv-dest-input');
      if (inp) inp.value = '';
      if (_dMarker && _map) { _map.removeLayer(_dMarker); _dMarker = null; }
      _destGeo = null;
      _hidePricePanel();
    });

    document.getElementById('mv-cancel-route-btn')?.addEventListener('click', _cancelRoute);
    document.getElementById('mv-book-btn')?.addEventListener('click', _book);
  }

  return { init, show, setRoute };
})();
