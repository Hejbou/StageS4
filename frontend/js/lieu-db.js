/* ════════════════════════════════════════════
   lieu-db.js — Lieux du chat IA, nouvelle hiérarchie
   (Ville -> Wilaya -> Moughataa -> Lieu)

   Source des données : GET /api/lieux/ (table `lieux`, gérée depuis la
   page admin "Base des lieux") — module volontairement SÉPARÉ de
   poi-db.js/PoiDB : celui-ci reste inchangé pour l'autocomplétion de la
   carte (maps.js), qui continue de lire l'ancienne table `locations`.
   LieuDB est la SEULE source utilisée par le moteur de conversation
   (chat.js) pour comprendre/rechercher un lieu — jamais la carte, jamais
   une source externe (voir contrat search() ci-dessous).

   Chaque lieu, tel qu'exposé ici (`poi`) :
     id          — identifiant entier (table `lieux`)
     name        — nom canonique français (nameFr en base)
     nameAr      — nom arabe
     nameHa      — premier nom hassaniya (affichage, compat PoiDB)
     namesHa     — tableau complet des noms hassaniya (recherche)
     type        — quartier | marche | hopital | clinique | mosquee |
                    ecole | universite | carrefour | station | admin |
                    hotel | autre (LIEU_TYPES, voir models/lieu.py)
     quartier    — nom de la Moughataa (même rôle que l'ancien champ
                    "quartier" : regroupement des lieux proches)
     wilayaName / moughataaName — hiérarchie administrative
     lat / lng   — coordonnées GPS (WGS84)
   ════════════════════════════════════════════ */

const LieuDB = (() => {

  const POIS = [];

  // ── Normalisation / score — inspirés de poi-db.js (volontairement
  // dupliqués, pour ne jamais toucher à ce fichier), avec CORRECTIF :
  // la plage de suppression des diacritiques arabes de poi-db.js
  // (`[ؐ-ًؚ-ٰٟ]`) chevauche par erreur tout le bloc des lettres de base
  // arabes (ؐ-ً couvre aussi ء-ي, l'alphabet entier),
  // ce qui viderait n'importe quel texte arabe normal en chaîne vide.
  // Plages corrigées ci-dessous : uniquement les marques diacritiques
  // réelles (ؐ-ؚ, ً-ٟ, ٰ), jamais les lettres. ─
  function _norm(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/[ؐ-ًؚ-ٰٟ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/\b(le |la |les |l'|du |de |des |au |aux |à |un |une )\b/gi, ' ')
      .replace(/['"''\-_\/\\.,;:!?()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _score(a, b) {
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const triA = new Set(), triB = new Set();
    for (let i = 0; i < a.length - 2; i++) triA.add(a.slice(i, i + 3));
    for (let i = 0; i < b.length - 2; i++) triB.add(b.slice(i, i + 3));
    let common = 0;
    triA.forEach(t => { if (triB.has(t)) common++; });
    const total = Math.max(triA.size + triB.size - common, 1);
    return (2 * common) / total;
  }

  // ── Mots-clés de type (FR/AR) — quatre entrées distinctes pour
  // hopital/clinique et ecole/universite, car LIEU_TYPES les sépare
  // (contrairement à l'ancien LOCATION_TYPES) : ne pas fusionner.
  const TYPE_KEYWORDS = {
    hopital:    /مستشفى|h[ôo]pital/i,
    clinique:   /عيادة|clinique/i,
    mosquee:    /مسجد|جامع|mosqu[ée]e?/i,
    ecole:      /مدرسة|[ée]cole/i,
    universite: /جامعة|universit[ée]/i,
    marche:     /سوق|march[ée]/i,
    station:    /محطة|station[- ]?(service|essence)?/i,
    carrefour:  /كارفور|دوار|carrefour|rond[- ]?point/i,
    hotel:      /فندق|h[ôo]tel/i,
    admin:      /بلدية|رئاسة|mairie|préfecture|prefecture/i,
  };

  function _detectTypeKeyword(text) {
    for (const [type, re] of Object.entries(TYPE_KEYWORDS)) {
      if (re.test(text)) return type;
    }
    return null;
  }

  // ── Recherche principale ─────────────────────────────────────────
  // Retourne l'une de trois formes :
  //   { status:'found',     found:true,  poi, canonical, lat, lng, match }
  //   { status:'ambiguous', found:false, ambiguous:true, candidates, reason }
  //   { status:'unknown',   found:false, suggestion }
  // match : 'exact' | 'alias' | 'type' | 'fuzzy'
  // reason (ambiguous) : 'type' | 'fuzzy'
  const CANDIDATE_CAP = 5;
  const FUZZY_ACCEPT_THRESHOLD = 0.55;
  const FUZZY_SUGGEST_THRESHOLD = 0.25;
  const FUZZY_TIE_MARGIN = 0.1;

  function search(text) {
    if (!text || !text.trim()) return { status: 'unknown', found: false, suggestion: null };
    const raw = text.trim();
    const q = _norm(raw);
    if (!q) return { status: 'unknown', found: false, suggestion: null };

    // 1. Exact sur le nom canonique, le nom arabe, ou n'importe quel nom hassaniya
    for (const poi of POIS) {
      if (_norm(poi.name) === q || _norm(poi.nameAr) === q) {
        return { status: 'found', found: true, ambiguous: false, poi, canonical: poi.name, lat: poi.lat, lng: poi.lng, match: 'exact' };
      }
      for (const ha of poi.namesHa) {
        if (_norm(ha) === q) {
          return { status: 'found', found: true, ambiguous: false, poi, canonical: poi.name, lat: poi.lat, lng: poi.lng, match: 'exact' };
        }
      }
    }

    // 2. Mot-clé de type ("carrefour", "hôpital"...) -> tous les lieux de ce type
    const typeHit = _detectTypeKeyword(raw);
    if (typeHit) {
      const ofType = POIS.filter(p => p.type === typeHit);
      if (ofType.length === 1) {
        const poi = ofType[0];
        return { status: 'found', found: true, ambiguous: false, poi, canonical: poi.name, lat: poi.lat, lng: poi.lng, match: 'type' };
      }
      if (ofType.length > 1) {
        return {
          status: 'ambiguous', found: false, ambiguous: true, reason: 'type',
          candidates: ofType.slice(0, CANDIDATE_CAP).map(poi => ({ poi, canonical: poi.name })),
        };
      }
      // 0 lieu de ce type -> continue vers le score flou ci-dessous
    }

    // 3. Score flou sur nom / nom arabe / tous les noms hassaniya
    const scored = POIS.map(poi => {
      const candidates = [poi.name, poi.nameAr, ...poi.namesHa].filter(Boolean).map(_norm);
      let top = 0;
      for (const c of candidates) top = Math.max(top, _score(q, c));
      return { poi, score: top };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= FUZZY_ACCEPT_THRESHOLD) {
      const tied = scored.filter(s => (best.score - s.score) < FUZZY_TIE_MARGIN);
      if (tied.length > 1) {
        return {
          status: 'ambiguous', found: false, ambiguous: true, reason: 'fuzzy',
          candidates: tied.slice(0, CANDIDATE_CAP).map(s => ({ poi: s.poi, canonical: s.poi.name })),
        };
      }
      return { status: 'found', found: true, ambiguous: false, poi: best.poi, canonical: best.poi.name, lat: best.poi.lat, lng: best.poi.lng, match: 'fuzzy' };
    }

    const suggestion = best && best.score >= FUZZY_SUGGEST_THRESHOLD ? best.poi.name : null;
    return { status: 'unknown', found: false, suggestion, poi: best ? best.poi : null };
  }

  function suggest(text) {
    const result = search(text);
    return result.suggestion || (result.found ? result.canonical : null);
  }

  function _localName(poi, lang) {
    return (lang === 'ar' ? poi.nameAr : lang === 'ha' ? poi.nameHa : poi.name) || poi.name;
  }

  // ── Toutes les correspondances — autocomplétion éventuelle ───────
  function searchAll(text, lang = 'fr', limit = 8) {
    if (!text || !text.trim()) return [];
    const q = _norm(text);
    if (!q) return [];

    const scored = [];
    for (const poi of POIS) {
      const candidates = [poi.name, poi.nameAr, ...poi.namesHa].filter(Boolean).map(_norm);
      let top = 0;
      for (const c of candidates) {
        if (!c) continue;
        if (c === q) { top = 1; break; }
        if (c.includes(q) || q.includes(c)) { top = Math.max(top, 0.9); continue; }
        top = Math.max(top, _score(q, c));
      }
      if (top >= 0.3) scored.push({ poi, score: top });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ poi }) => ({
      name: _localName(poi, lang),
      secondary_text: poi.quartier || '',
      lat: poi.lat, lng: poi.lng,
    }));
  }

  // ── Lieux de repère proches d'une moughataa (hors quartiers eux-mêmes) ─
  function nearbyLandmarks(quartierName, opts = {}) {
    const { exclude = [], limit = 3, type = null } = opts;
    let pool = quartierName
      ? POIS.filter(p => p.type !== 'quartier' && p.quartier === quartierName && !exclude.includes(p.id))
      : [];
    if (type) pool = pool.filter(p => p.type === type);
    const result = [...pool];

    if (result.length < limit) {
      if (type) {
        for (const p of POIS) {
          if (result.length >= limit) break;
          if (p.type !== type || exclude.includes(p.id) || result.includes(p)) continue;
          result.push(p);
        }
      } else {
        const seenTypes = new Set(result.map(p => p.type));
        for (const p of POIS) {
          if (result.length >= limit) break;
          if (p.type === 'quartier' || exclude.includes(p.id) || result.includes(p)) continue;
          if (seenTypes.has(p.type)) continue;
          result.push(p);
          seenTypes.add(p.type);
        }
      }
    }
    return result.slice(0, limit);
  }

  function getById(id) {
    return POIS.find(p => p.id === id) || null;
  }

  function getByType(type) {
    return POIS.filter(p => p.type === type);
  }

  // ── Recherche de proximité — vraie distance GPS ──────────────────
  function nearbyByRadius(lat, lng, opts = {}) {
    const { exclude = [], limit = 3, type = null, radiusM = null } = opts;
    if (typeof lat !== 'number' || typeof lng !== 'number') return [];

    const pool = POIS.filter(p =>
      p.type !== 'quartier' &&
      !exclude.includes(p.id) &&
      (!type || p.type === type) &&
      typeof p.lat === 'number' && typeof p.lng === 'number'
    );

    function within(radius) {
      return pool
        .map(p => ({ p, d: Geo.haversineM(lat, lng, p.lat, p.lng) }))
        .filter(x => x.d <= radius)
        .sort((a, b) => a.d - b.d);
    }

    let found = radiusM ? within(radiusM) : [];
    if (!radiusM) {
      for (const r of [200, 350, 500]) {
        found = within(r);
        if (found.length >= limit) break;
      }
    }
    return found.slice(0, limit).map(x => x.p);
  }

  // ── Chargement depuis l'API (lieux gérés depuis "Base des lieux") ─
  // Pas de repli statique (contrairement à PoiDB) : un échec réseau ou
  // une base vide laisse simplement POIS vide, ce qui fait déjà retomber
  // toute recherche sur le chemin "lieu introuvable" existant.
  async function _loadFromApi() {
    try {
      const ctrl = new AbortController();
      const tmo  = setTimeout(() => ctrl.abort(), 4000);
      const r    = await fetch('/api/lieux/', { signal: ctrl.signal });
      clearTimeout(tmo);
      if (!r.ok) return;
      const body = await r.json();
      const fetched = Array.isArray(body.data) ? body.data : [];
      POIS.length = 0;
      fetched.forEach(l => POIS.push({
        id: l.id, name: l.nameFr, nameAr: l.nameAr,
        nameHa: (l.namesHa && l.namesHa[0]) || '', namesHa: l.namesHa || [],
        type: l.type, quartier: l.moughataaName,
        wilayaName: l.wilayaName, moughataaName: l.moughataaName,
        lat: Number(l.lat), lng: Number(l.lng),
      }));
    } catch (_) { /* backend hors ligne — POIS reste vide */ }
  }
  _loadFromApi();

  return { search, suggest, searchAll, getById, getByType, nearbyLandmarks, nearbyByRadius, POIS };

})();
