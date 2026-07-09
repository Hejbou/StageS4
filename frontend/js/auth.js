/* ════════════════════════════════════════════
   auth.js — Authentication
   Mode 1 : Backend API  (Flask /api/auth/*)
   Mode 2 : localStorage (fallback si backend hors ligne)
   ════════════════════════════════════════════ */

const Auth = (() => {

  const API          = '/api/auth';
  const SESSION_KEY  = 'chatia_session';
  const TOKEN_KEY    = 'chatia_token';
  const LS_USERS_KEY = 'chatia_users';        // fallback localStorage users

  // ── Helpers ─────────────────────────────────────────────────────
  function _hash(s) { return btoa(unescape(encodeURIComponent(s))); }

  function validatePhone(p) {
    return /^[234]\d{7}$/.test((p || '').trim().replace(/[\s\-]/g, ''));
  }
  function validatePassword(p) { return p && p.length >= 4; }

  function _getToken()      { return localStorage.getItem(TOKEN_KEY) || null; }
  function _setToken(t)     { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
  function getToken()       { return _getToken(); }

  function _saveSession(u)  { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
  function _clearSession()  { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(TOKEN_KEY); }

  // ── Local-only fallback helpers ──────────────────────────────────
  function _getLsUsers()    { return JSON.parse(localStorage.getItem(LS_USERS_KEY) || '[]'); }
  function _saveLsUsers(u)  { localStorage.setItem(LS_USERS_KEY, JSON.stringify(u)); }

  function _seedAdmin() {
    const users = _getLsUsers();
    const existing = users.find(u => u.role === 'admin');
    if (!existing) {
      users.unshift({
        id: 'admin-001', phone: '20000000',
        password: _hash('admin123'), role: 'admin',
        name: 'admin', createdAt: Date.now(),
      });
      _saveLsUsers(users);
    } else if (existing.name !== 'admin') {
      // Migrate old name to "admin"
      existing.name = 'admin';
      _saveLsUsers(users);
    }
  }
  _seedAdmin();

  // ── API request helper ───────────────────────────────────────────
  async function _apiPost(path, body) {
    const resp = await fetch(API + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await resp.json();
    return { status: resp.status, data };
  }

  // ── REGISTER ─────────────────────────────────────────────────────
  async function register(phone, password, name) {
    const p = (phone || '').trim().replace(/[\s\-]/g, '');
    if (!validatePhone(p))        return { ok: false, error: 'phone_invalid' };
    if (!validatePassword(password)) return { ok: false, error: 'password_short' };

    // Try backend
    try {
      const { status, data } = await _apiPost('/register', {
        phone: p, password, name: name || ('User ' + p.slice(-4)), language: 'fr',
      });
      if (status === 201 && data.data) {
        const user = {
          id: data.data.user.phone, phone: data.data.user.phone,
          name: data.data.user.name, role: data.data.user.role,
        };
        _setToken(data.data.access_token);
        _saveSession(user);
        return { ok: true, user };
      }
      if (status === 409) return { ok: false, error: 'phone_exists' };
      return { ok: false, error: data.error || 'register_failed' };
    } catch (_) { /* backend offline → fallback */ }

    // localStorage fallback
    const users = _getLsUsers();
    if (users.find(u => u.phone === p)) return { ok: false, error: 'phone_exists' };
    const user = {
      id: 'u-' + Date.now(), phone: p,
      password: _hash(password), role: 'user',
      name: name || ('User ' + p.slice(-4)), createdAt: Date.now(),
    };
    users.push(user);
    _saveLsUsers(users);
    const session = { id: user.id, phone: user.phone, name: user.name, role: user.role };
    _saveSession(session);
    return { ok: true, user: session };
  }

  // ── LOGIN BY IDENTIFIER (phone or name) ──────────────────────────
  async function loginByIdentifier(identifier, password) {
    const id = (identifier || '').trim();
    if (!id) return { ok: false, error: 'identifier_empty' };

    // If it looks like a phone number → direct login
    if (validatePhone(id)) return login(id, password);

    // Try backend name lookup
    try {
      const { status, data } = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: id }),
      }).then(async r => ({ status: r.status, data: await r.json() }));
      if (status === 200 && data.data && data.data.phone) {
        return login(data.data.phone, password);
      }
    } catch (_) { /* backend offline → fallback */ }

    // localStorage fallback: find by name (case-insensitive)
    const lsUsers = _getLsUsers();
    const byName = lsUsers.find(u => u.name && u.name.toLowerCase() === id.toLowerCase());
    if (byName) return login(byName.phone, password);

    // "admin" keyword → find any admin role user
    if (id.toLowerCase() === 'admin') {
      const adminUser = lsUsers.find(u => u.role === 'admin');
      if (adminUser) return login(adminUser.phone, password);
    }

    return { ok: false, error: 'user_not_found' };
  }

  // ── LOGIN ─────────────────────────────────────────────────────────
  async function login(phone, password) {
    const p = (phone || '').trim().replace(/[\s\-]/g, '');
    if (!validatePhone(p)) return { ok: false, error: 'phone_invalid' };

    // Try backend
    try {
      const { status, data } = await _apiPost('/login', { phone: p, password });
      if (status === 200 && data.data) {
        const user = {
          id: data.data.user.phone, phone: data.data.user.phone,
          name: data.data.user.name, role: data.data.user.role,
          language: data.data.user.language,
        };
        _setToken(data.data.access_token);
        _saveSession(user);
        return { ok: true, user };
      }
      if (status === 401) {
        const msg = (data && data.error) ? data.error.toLowerCase() : '';
        if (msg.includes('désactivé') || msg.includes('bloqué') || msg.includes('desactive')) {
          return { ok: false, error: 'account_blocked' };
        }
        return { ok: false, error: 'invalid_credentials' };
      }
      return { ok: false, error: data.error || 'login_failed' };
    } catch (_) { /* backend offline → fallback */ }

    // localStorage fallback
    const users = _getLsUsers();
    const found = users.find(u => u.phone === p && u.password === _hash(password));
    if (!found) return { ok: false, error: 'invalid_credentials' };
    const session = { id: found.id, phone: found.phone, name: found.name, role: found.role };
    _saveSession(session);
    return { ok: true, user: session };
  }

  // ── LOGOUT ───────────────────────────────────────────────────────
  function logout() {
    _clearSession();
    window.location.href = 'login.html';
  }

  // ── SESSION GETTERS ──────────────────────────────────────────────
  function getUser() {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  }
  function isLoggedIn() { return !!getUser(); }
  function isAdmin()    { const u = getUser(); return u && u.role === 'admin'; }

  // ── ADMIN : user list (localStorage fallback — backend has /api/admin/users) ─
  function getAllUsers() {
    return _getLsUsers().map(u => ({
      id: u.id, phone: u.phone, name: u.name, role: u.role, createdAt: u.createdAt,
    }));
  }

  function deleteUser(id) {
    const curr = getUser();
    if (curr && (curr.id === id || curr.phone === id)) return false;
    const users = _getLsUsers().filter(u => u.id !== id && u.phone !== id);
    _saveLsUsers(users);
    return true;
  }

  // ── AI SETTINGS (localStorage — read by chat.js) ─────────────────
  function updateAISetting(key, value) {
    localStorage.setItem('chatia_ai_' + key, JSON.stringify(value));
  }
  function getAISetting(key, fallback) {
    const v = localStorage.getItem('chatia_ai_' + key);
    return v !== null ? JSON.parse(v) : fallback;
  }

  // ── AUTH GUARDS ───────────────────────────────────────────────────
  function requireLogin() {
    if (!isLoggedIn()) { window.location.href = 'login.html'; return false; }
    return true;
  }
  function requireAdmin() {
    if (!isAdmin()) {
      window.location.href = isLoggedIn() ? 'index.html' : 'login.html';
      return false;
    }
    return true;
  }

  // ── API CALL HELPER for other modules ────────────────────────────
  function authFetch(url, options = {}) {
    const token = _getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { ...options, headers });
  }

  return {
    register, login, loginByIdentifier, logout,
    getUser, isLoggedIn, isAdmin,
    getAllUsers, deleteUser,
    updateAISetting, getAISetting,
    validatePhone, validatePassword,
    requireLogin, requireAdmin,
    getToken, authFetch,
  };
})();
