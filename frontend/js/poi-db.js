/* ════════════════════════════════════════════
   poi-db.js — Lieux du chat IA (Nouakchott)

   Source des données : GET /api/locations/ (table `locations`, gérée
   depuis le dashboard admin) — POIS[] ci-dessous n'est qu'un repli
   statique utilisé le temps que la requête réponde, ou si le backend
   est injoignable (hors-ligne). Dès que le fetch aboutit, son contenu
   est remplacé en place par les lieux de la base — ajouter un lieu
   depuis l'admin le rend donc utilisable par le chat sans toucher au
   code, dès le prochain chargement de page.

   search() / nearbyLandmarks() / nearbyByRadius() n'ont aucune idée
   d'où viennent les données : même contrat, que POIS contienne le
   repli statique ou les lieux chargés depuis l'API.

   Chaque POI :
     id        — identifiant unique (slug en repli statique, entier en base)
     name      — nom canonique français (affiché à l'utilisateur)
     nameAr    — nom arabe officiel
     nameHa    — nom en hassania (dialecte mauritanien)
     type      — quartier | marche | hopital | mosquee | ecole | carrefour |
                  station | admin | hotel | autre
     quartier  — quartier de Nouakchott (zone parente)
     lat / lng — coordonnées GPS (WGS84)
     aliases   — tableau de noms populaires / locaux / abréviations
                 (FR + AR + HA, minuscules)
   ════════════════════════════════════════════ */

const PoiDB = (() => {

  // ── Normalisation du texte pour la comparaison ─────────────────
  function _norm(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      // Supprimer les diacritiques arabes (tashkeel)
      .replace(/[ؐ-ًؚ-ٰٟ]/g, '')
      // Normaliser les variantes d'alef
      .replace(/[أإآ]/g, 'ا')
      // Normaliser teh marbuta → heh
      .replace(/ة/g, 'ه')
      // Supprimer les articles français courants
      .replace(/\b(le |la |les |l'|du |de |des |au |aux |à |un |une )\b/gi, ' ')
      // Supprimer la ponctuation
      .replace(/['"''\-_\/\\.,;:!?()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Calcul du score de ressemblance entre deux chaînes normalisées ─
  function _score(a, b) {
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;
    // Compter les trigrammes communs
    const triA = new Set(), triB = new Set();
    for (let i = 0; i < a.length - 2; i++) triA.add(a.slice(i, i + 3));
    for (let i = 0; i < b.length - 2; i++) triB.add(b.slice(i, i + 3));
    let common = 0;
    triA.forEach(t => { if (triB.has(t)) common++; });
    const total = Math.max(triA.size + triB.size - common, 1);
    return (2 * common) / total;
  }

  // ══════════════════════════════════════════════════════════════
  //  BASE DE DONNÉES DES LIEUX — NOUAKCHOTT
  //  Ajouter de nouveaux lieux ici sans toucher à la logique
  // ══════════════════════════════════════════════════════════════
  const POIS = [

    // ── QUARTIERS ──────────────────────────────────────────────
    {
      id: 'ksar', name: 'Ksar', nameAr: 'الكار', nameHa: 'الكار',
      type: 'quartier', quartier: 'Ksar', lat: 18.0762, lng: -15.9582,
      aliases: ['ksar', 'القصر', 'الكار', 'car', 'le ksar', 'quartier ksar'],
    },
    {
      id: 'tevragh_zeina', name: 'Tevragh Zeina', nameAr: 'تيفرغ زين', nameHa: 'تيفرغ زين',
      type: 'quartier', quartier: 'Tevragh Zeina', lat: 18.0890, lng: -15.9680,
      aliases: ['tevragh zeina', 'tevragh', 'tzvzeina', 'tv zeina', 'تيفرغ', 'تيفرغ زين', 'تفرغ زين', 'tifrig'],
    },
    {
      id: 'sebkha', name: 'Sebkha', nameAr: 'السبخة', nameHa: 'السبخة',
      type: 'quartier', quartier: 'Sebkha', lat: 18.0600, lng: -15.9740,
      aliases: ['sebkha', 'sébkha', 'السبخه', 'السبخة'],
    },
    {
      id: 'arafat', name: 'Arafat', nameAr: 'أرفات', nameHa: 'أرفات',
      type: 'quartier', quartier: 'Arafat', lat: 18.0420, lng: -16.0200,
      aliases: ['arafat', 'عرفات', 'أرفات', 'arfat'],
    },
    {
      id: 'el_mina', name: 'El Mina', nameAr: 'المينة', nameHa: 'المينة',
      type: 'quartier', quartier: 'El Mina', lat: 18.0820, lng: -15.9950,
      aliases: ['el mina', 'elmina', 'mina', 'المين', 'المينه', 'المينة'],
    },
    {
      id: 'dar_naim', name: 'Dar Naim', nameAr: 'دار النعيم', nameHa: 'دار النعيم',
      type: 'quartier', quartier: 'Dar Naim', lat: 18.1100, lng: -15.9700,
      aliases: ['dar naim', 'darnaim', 'دار نعيم', 'دار النعيم'],
    },
    {
      id: 'toujounine', name: 'Toujounine', nameAr: 'تجكجه', nameHa: 'تجكجه',
      type: 'quartier', quartier: 'Toujounine', lat: 18.0350, lng: -16.0400,
      aliases: ['toujounine', 'tujunin', 'تجكجه', 'تجكجة'],
    },
    {
      id: 'riyad', name: 'Riyad', nameAr: 'الرياض', nameHa: 'الرياض',
      type: 'quartier', quartier: 'Riyad', lat: 18.0870, lng: -15.9570,
      aliases: ['riyad', 'riyadh', 'الرياض', 'رياض'],
    },
    {
      id: 'cinquieme', name: 'Cinquième', nameAr: 'الخامسة', nameHa: 'الخامسة',
      type: 'quartier', quartier: 'Cinquième', lat: 18.0650, lng: -15.9820,
      aliases: ['cinquième', 'cinquieme', '5eme', '5ème', 'الخامسة', 'الخامسه', 'خامسة'],
    },
    {
      id: 'socogim', name: 'Socogim', nameAr: 'سوكوجيم', nameHa: 'سوكوجيم',
      type: 'quartier', quartier: 'Tevragh Zeina', lat: 18.0780, lng: -15.9630,
      aliases: ['socogim', 'soco', 'سوكوجيم', 'سوكو'],
    },
    {
      id: 'pk10', name: 'PK 10', nameAr: 'بي كا 10', nameHa: 'PK 10',
      type: 'quartier', quartier: 'PK 10', lat: 18.0540, lng: -15.9550,
      aliases: ['pk10', 'pk 10', 'pk-10', 'بكا 10', 'بي كا'],
    },
    {
      id: 'centre_ville', name: 'Centre-ville', nameAr: 'وسط المدينة', nameHa: 'وسط المدينة',
      type: 'quartier', quartier: 'Ksar', lat: 18.0800, lng: -15.9700,
      aliases: ['centre ville', 'centre-ville', 'centre', 'centreville', 'وسط المدينه', 'وسط المدينة', 'وسط', 'المركز'],
    },
    {
      id: 'teyarett', name: 'Teyarett', nameAr: 'تيارت', nameHa: 'تيارت',
      type: 'quartier', quartier: 'Teyarett', lat: 18.0910, lng: -15.9600,
      aliases: ['teyarett', 'teyaret', 'tayarett', 'تيارت'],
    },

    // ── MARCHÉS ────────────────────────────────────────────────
    {
      id: 'marche_capitale', name: 'Marché Capitale', nameAr: 'سوق الكابيتال', nameHa: 'السوق',
      type: 'marche', quartier: 'Tevragh Zeina', lat: 18.0798, lng: -15.9650,
      aliases: [
        'marché capitale', 'marche capitale', 'capitale', 'souk capitale',
        'سوق الكابيتال', 'كابيتال', 'السوق الكبير', 'السوق',
      ],
    },
    {
      id: 'marche_cinquieme', name: 'Marché de la Cinquième', nameAr: 'سوق الخامسة', nameHa: 'سوق الخامسة',
      type: 'marche', quartier: 'Cinquième', lat: 18.0660, lng: -15.9810,
      aliases: ['marché cinquième', 'marche 5', 'sوق الخامسة', 'سوق خامسة'],
    },
    {
      id: 'marche_riyad', name: 'Marché de Riyad', nameAr: 'سوق الرياض', nameHa: 'سوق الرياض',
      type: 'marche', quartier: 'Riyad', lat: 18.0875, lng: -15.9560,
      aliases: ['marché riyad', 'سوق الرياض', 'سوق رياض'],
    },
    {
      id: 'marche_arafat', name: 'Marché d\'Arafat', nameAr: 'سوق أرفات', nameHa: 'سوق أرفات',
      type: 'marche', quartier: 'Arafat', lat: 18.0430, lng: -16.0190,
      aliases: ['marché arafat', 'سوق أرفات', 'سوق عرفات'],
    },

    // ── HÔPITAUX & CLINIQUES ────────────────────────────────────
    {
      id: 'chn', name: 'CHN (Hôpital National)', nameAr: 'المستشفى الوطني', nameHa: 'المستشفى',
      type: 'hopital', quartier: 'Ksar', lat: 18.0759, lng: -15.9638,
      aliases: [
        'chn', 'hôpital national', 'hopital national', 'centre hospitalier', 'hôpital',
        'المستشفى الوطني', 'المستشفى', 'المصحة الوطنية', 'مستشفى وطني',
      ],
    },
    {
      id: 'hopital_amitie', name: 'Hôpital de l\'Amitié', nameAr: 'مستشفى الصداقة', nameHa: 'مستشفى الصداقة',
      type: 'hopital', quartier: 'Tevragh Zeina', lat: 18.0870, lng: -15.9600,
      aliases: ['hôpital amitié', 'hopital amitie', 'amitié', 'مستشفى الصداقه', 'مستشفى الصداقة', 'الصداقة'],
    },
    {
      id: 'centre_mere_enfant', name: 'Centre Mère-Enfant', nameAr: 'مركز الأم والطفل', nameHa: 'مركز الأم والطفل',
      type: 'hopital', quartier: 'Tevragh Zeina', lat: 18.0860, lng: -15.9610,
      aliases: ['centre mère enfant', 'mère enfant', 'cme', 'مركز الام والطفل', 'مركز الأم'],
    },
    {
      id: 'polyclinique', name: 'Polyclinique', nameAr: 'البولي كلينيك', nameHa: 'البولي كلينيك',
      type: 'hopital', quartier: 'Tevragh Zeina', lat: 18.0880, lng: -15.9670,
      aliases: ['polyclinique', 'poly clinique', 'البوليكلينيك', 'البولي كلينيك', 'بولي'],
    },

    // ── MOSQUÉES ────────────────────────────────────────────────
    {
      id: 'grande_mosquee', name: 'Grande Mosquée de Nouakchott', nameAr: 'الجامع الكبير', nameHa: 'الجامع الكبير',
      type: 'mosquee', quartier: 'Ksar', lat: 18.0777, lng: -15.9618,
      aliases: [
        'grande mosquée', 'grande mosquee', 'mosquée principale',
        'الجامع الكبير', 'المسجد الكبير', 'جامع كبير',
      ],
    },
    {
      id: 'mosquee_saudiyya', name: 'Mosquée Saoudienne', nameAr: 'مسجد السعودية', nameHa: 'مسجد السعودية',
      type: 'mosquee', quartier: 'Tevragh Zeina', lat: 18.0890, lng: -15.9640,
      aliases: ['mosquée saoudienne', 'mosquée saudiyya', 'saudiyya', 'مسجد السعوديه', 'مسجد السعودية', 'السعودية'],
    },
    {
      id: 'mosquee_bilal', name: 'Mosquée Bilal', nameAr: 'مسجد بلال', nameHa: 'مسجد بلال',
      type: 'mosquee', quartier: 'Ksar', lat: 18.0745, lng: -15.9600,
      aliases: ['mosquée bilal', 'bilal', 'مسجد بلال', 'بلال'],
    },

    // ── ÉCOLES & UNIVERSITÉS ────────────────────────────────────
    {
      id: 'universite', name: 'Université de Nouakchott', nameAr: 'جامعة نواكشوط', nameHa: 'الجامعة',
      type: 'ecole', quartier: 'Tevragh Zeina', lat: 18.0875, lng: -15.9737,
      aliases: [
        'université', 'universite', 'fac', 'campus', 'univ',
        'جامعة نواكشوط', 'الجامعة', 'الجامعه', 'جامعه',
      ],
    },
    {
      id: 'isg', name: 'ISG (Institut Supérieur de Gestion)', nameAr: 'المعهد العالي للتسيير', nameHa: 'ISG',
      type: 'ecole', quartier: 'Tevragh Zeina', lat: 18.0860, lng: -15.9720,
      aliases: ['isg', 'institut supérieur', 'institut gestion', 'المعهد العالي', 'معهد التسيير'],
    },
    {
      id: 'lycee_technique', name: 'Lycée Technique', nameAr: 'الثانوية التقنية', nameHa: 'الثانوية التقنية',
      type: 'ecole', quartier: 'Ksar', lat: 18.0740, lng: -15.9620,
      aliases: ['lycée technique', 'lycee technique', 'technique', 'الثانوية التقنيه', 'الثانوية التقنية'],
    },

    // ── CARREFOURS & POINTS DE REPÈRE ──────────────────────────
    {
      id: 'carrefour_madrid', name: 'Carrefour Madrid', nameAr: 'كارفور مدريد', nameHa: 'كارفور مدريد',
      type: 'carrefour', quartier: 'Tevragh Zeina', lat: 18.0850, lng: -15.9650,
      aliases: ['carrefour madrid', 'madrid', 'rondpoint madrid', 'rond-point madrid', 'كارفور مدريد', 'مدريد'],
    },
    {
      id: 'carrefour_chinguetti', name: 'Carrefour Chinguetti', nameAr: 'كارفور شنقيط', nameHa: 'كارفور شنقيط',
      type: 'carrefour', quartier: 'Ksar', lat: 18.0780, lng: -15.9730,
      aliases: ['carrefour chinguetti', 'chinguetti', 'شنقيط', 'كارفور شنقيط'],
    },
    {
      id: 'carrefour_km5', name: 'Carrefour KM5', nameAr: 'كارفور كيلومتر 5', nameHa: 'كيلو 5',
      type: 'carrefour', quartier: 'Sebkha', lat: 18.0580, lng: -15.9760,
      aliases: ['km5', 'km 5', 'kilo 5', 'kilomètre 5', 'كيلومتر 5', 'كيلو 5', 'كيلو'],
    },
    {
      id: 'stade', name: 'Stade de Nouakchott', nameAr: 'ملعب نواكشوط', nameHa: 'الملعب',
      type: 'carrefour', quartier: 'Tevragh Zeina', lat: 18.0850, lng: -15.9550,
      aliases: ['stade', 'stade olympique', 'stade nouakchott', 'ملعب', 'الملعب', 'ملعب نواكشوط'],
    },

    // ── AÉROPORT & TRANSPORT ────────────────────────────────────
    {
      id: 'aeroport', name: 'Aéroport Oumtounsy', nameAr: 'مطار أم تونسي', nameHa: 'المطار',
      type: 'autre', quartier: 'Dar Naim', lat: 18.0985, lng: -15.9494,
      aliases: [
        'aéroport', 'aeroport', 'airport', 'oumtounsy', 'umtounsy',
        'مطار', 'المطار', 'مطار نواكشوط', 'مطار أم تونسي',
      ],
    },
    {
      id: 'gare_routiere', name: 'Gare Routière', nameAr: 'محطة الحافلات', nameHa: 'المحطة',
      type: 'autre', quartier: 'Ksar', lat: 18.0720, lng: -15.9600,
      aliases: ['gare routière', 'gare routiere', 'gare', 'محطة الحافلات', 'المحطة', 'محطة'],
    },

    // ── ADMINISTRATION ──────────────────────────────────────────
    {
      id: 'presidence', name: 'Présidence de la République', nameAr: 'رئاسة الجمهورية', nameHa: 'الرئاسة',
      type: 'admin', quartier: 'Tevragh Zeina', lat: 18.0875, lng: -15.9597,
      aliases: ['présidence', 'presidence', 'palais présidentiel', 'رئاسة', 'الرئاسة', 'قصر الرئاسة'],
    },
    {
      id: 'mairie', name: 'Mairie de Nouakchott', nameAr: 'بلدية نواكشوط', nameHa: 'البلدية',
      type: 'admin', quartier: 'Ksar', lat: 18.0762, lng: -15.9632,
      aliases: ['mairie', 'municipalité', 'بلدية', 'البلدية', 'بلدية نواكشوط'],
    },

    // ── HÔTELS CONNUS ───────────────────────────────────────────
    {
      id: 'hotel_marhaba', name: 'Hôtel Marhaba', nameAr: 'فندق مرحبا', nameHa: 'فندق مرحبا',
      type: 'hotel', quartier: 'Tevragh Zeina', lat: 18.0870, lng: -15.9660,
      aliases: ['marhaba', 'hôtel marhaba', 'hotel marhaba', 'فندق مرحبا', 'مرحبا'],
    },
    {
      id: 'hotel_monotel', name: 'Hôtel Monotel', nameAr: 'فندق مونوتيل', nameHa: 'مونوتيل',
      type: 'hotel', quartier: 'Tevragh Zeina', lat: 18.0860, lng: -15.9650,
      aliases: ['monotel', 'hôtel monotel', 'فندق مونوتيل', 'مونوتيل'],
    },

    // ── STATIONS-SERVICE ────────────────────────────────────────
    {
      id: 'station_somelec', name: 'Station SOMELEC', nameAr: 'محطة سوميلك', nameHa: 'سوميلك',
      type: 'station', quartier: 'Ksar', lat: 18.0755, lng: -15.9655,
      aliases: ['somelec', 'station somelec', 'محطة سوميلك', 'سوميلك'],
    },
    {
      id: 'station_elkarazi', name: 'Station El Karazi', nameAr: 'محطة الكرازي', nameHa: 'الكرازي',
      type: 'station', quartier: 'Ksar', lat: 18.0740, lng: -15.9640,
      aliases: ['el karazi', 'karazi', 'station karazi', 'محطة الكرازي', 'الكرازي'],
    },

    // ── ÉPICERIES & COMMERCES CONNUS ────────────────────────────
    {
      id: 'epicerie_wilayat', name: 'Épicerie Al Wilayat', nameAr: 'بقالة الولايات', nameHa: 'الولايات',
      type: 'autre', quartier: 'Tevragh Zeina', lat: 18.0880, lng: -15.9680,
      aliases: ['al wilayat', 'wilayat', 'épicerie wilayat', 'بقالة الولايات', 'الولايات', 'ولايات'],
    },
    {
      id: 'supermarche_geant', name: 'Supermarché Géant', nameAr: 'سوبرماركت جيان', nameHa: 'جيان',
      type: 'autre', quartier: 'Tevragh Zeina', lat: 18.0890, lng: -15.9700,
      aliases: ['géant', 'geant', 'supermarché géant', 'سوبرماركت جيان', 'جيان'],
    },
  ];

  // ── Recherche dans la base de données locale ─────────────────
  // Retourne { found, poi, canonical, lat, lng, match }
  // match: 'exact' | 'alias' | 'fuzzy' | null
  function search(text) {
    if (!text || !text.trim()) return { found: false };
    const q = _norm(text);
    if (!q) return { found: false };

    let bestPoi   = null;
    let bestScore = 0;
    let bestMatch = null;

    for (const poi of POIS) {
      // 1. Exact sur le nom canonique ou nom arabe
      if (_norm(poi.name) === q || _norm(poi.nameAr) === q || _norm(poi.nameHa) === q) {
        return { found: true, poi, canonical: poi.name, lat: poi.lat, lng: poi.lng, match: 'exact' };
      }

      // 2. Exact sur un alias
      const aliasExact = poi.aliases.some(a => _norm(a) === q);
      if (aliasExact) {
        return { found: true, poi, canonical: poi.name, lat: poi.lat, lng: poi.lng, match: 'alias' };
      }

      // 3. Score flou sur tous les noms + aliases
      const candidates = [poi.name, poi.nameAr, poi.nameHa, ...poi.aliases].map(_norm);
      let   topScore   = 0;
      for (const c of candidates) {
        const s = _score(q, c);
        if (s > topScore) topScore = s;
      }

      if (topScore > bestScore) {
        bestScore = topScore;
        bestPoi   = poi;
        bestMatch = 'fuzzy';
      }
    }

    // Seuil minimum pour accepter un résultat flou
    if (bestScore >= 0.55 && bestPoi) {
      return { found: true, poi: bestPoi, canonical: bestPoi.name, lat: bestPoi.lat, lng: bestPoi.lng, match: bestMatch };
    }

    // Suggestion (meilleur candidat même en dessous du seuil)
    const suggestion = bestScore >= 0.25 && bestPoi ? bestPoi.name : null;
    return { found: false, suggestion, poi: bestPoi };
  }

  // ── Recherche de la meilleure suggestion ────────────────────
  function suggest(text) {
    const result = search(text);
    return result.suggestion || (result.found ? result.canonical : null);
  }

  function _localName(poi, lang) {
    return (lang === 'ar' ? poi.nameAr : lang === 'ha' ? poi.nameHa : poi.name) || poi.name;
  }

  // ── Toutes les correspondances, façon moteur de recherche ────────
  // Contrairement à search() (qui ne renvoie que LE meilleur candidat,
  // pour la résolution d'un lieu), searchAll() liste tous les lieux dont
  // le nom/alias (FR/AR/HA) correspond aux caractères saisis, pour
  // l'autocomplétion pendant la frappe. Résultat prêt à afficher :
  // { name, secondary_text, lat, lng } (même forme que l'autocomplete
  // backend, voir maps.js/_renderSuggestions).
  function searchAll(text, lang = 'fr', limit = 8) {
    if (!text || !text.trim()) return [];
    const q = _norm(text);
    if (!q) return [];

    const scored = [];
    for (const poi of POIS) {
      if (poi.type === 'quartier' && !poi.quartier) continue; // repère mal formé, ignorer
      const candidates = [poi.name, poi.nameAr, poi.nameHa, ...(poi.aliases || [])].map(_norm);
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

  // ── Lieux de repère proches d'un quartier (hors quartiers eux-mêmes) ─
  // Utilisé par la localisation intelligente pour proposer des points
  // de repère (cliniques, mosquées, écoles, stations, commerces...)
  // quand seul un quartier a été donné. `exclude` évite de reproposer
  // un lieu déjà suggéré lors d'un tour précédent.
  // `type` (optionnel) : si l'utilisateur a nommé une catégorie sans
  // préciser laquelle ("جنب المسجد" = à côté de LA mosquée, sans dire
  // laquelle), on restreint/oriente les suggestions vers ce type plutôt
  // que de proposer des types variés au hasard.
  function nearbyLandmarks(quartierName, opts = {}) {
    const { exclude = [], limit = 3, type = null } = opts;
    let pool = quartierName
      ? POIS.filter(p => p.type !== 'quartier' && p.quartier === quartierName && !exclude.includes(p.id))
      : [];
    if (type) pool = pool.filter(p => p.type === type);
    const result = [...pool];

    if (result.length < limit) {
      if (type) {
        // Un type précis a été deviné : mieux vaut élargir à toute la
        // ville pour ce même type que de changer de sujet.
        for (const p of POIS) {
          if (result.length >= limit) break;
          if (p.type !== type || exclude.includes(p.id) || result.includes(p)) continue;
          result.push(p);
        }
      } else {
        // Pas de type deviné : compléter avec des repères variés (types
        // différents) de toute la ville.
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

  // ── Obtenir un POI par son id ────────────────────────────────
  function getById(id) {
    return POIS.find(p => p.id === id) || null;
  }

  // ── Lister les lieux par type ────────────────────────────────
  function getByType(type) {
    return POIS.filter(p => p.type === type);
  }

  // ── Recherche de proximité — repères réels dans un rayon donné ───
  // Contrairement à nearbyLandmarks (qui regroupe par le champ texte
  // "quartier"), ceci calcule la vraie distance GPS. Sans rayon explicite,
  // élargit progressivement 200m → 350m → 500m jusqu'à `limit` résultats
  // (couvre la fourchette 100-500m demandée pour la phase de précision).
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

  // ── Chargement depuis l'API (lieux gérés depuis le dashboard admin) ─
  // Remplace le contenu de POIS EN PLACE (même référence de tableau, pour
  // que tout code ayant déjà lu PoiDB.POIS voie la mise à jour) dès que
  // le fetch aboutit. En cas d'échec (backend hors ligne, réseau...), le
  // repli statique déjà présent dans POIS reste utilisé tel quel.
  async function _loadFromApi() {
    try {
      const ctrl = new AbortController();
      const tmo  = setTimeout(() => ctrl.abort(), 4000);
      const r    = await fetch('/api/locations/', { signal: ctrl.signal });
      clearTimeout(tmo);
      if (!r.ok) return;
      const body = await r.json();
      const fetched = Array.isArray(body.data) ? body.data : [];
      if (!fetched.length) return;
      POIS.length = 0;
      fetched.forEach(loc => POIS.push({
        id: loc.id, name: loc.name, nameAr: loc.nameAr, nameHa: loc.nameHa,
        type: loc.type, quartier: loc.quartier,
        lat: Number(loc.lat), lng: Number(loc.lng),
        aliases: loc.aliases || [],
      }));
    } catch (_) { /* backend hors ligne — on garde le repli statique */ }
  }
  _loadFromApi();

  // ── Accès public à la liste complète (pour extensions futures) ─
  return { search, suggest, searchAll, getById, getByType, nearbyLandmarks, nearbyByRadius, POIS };

})();
