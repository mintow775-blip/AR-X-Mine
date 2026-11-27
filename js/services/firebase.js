// Firebase client layer (ES module): real Auth + Realtime Database. Security is enforced by database.rules.json and Netlify Functions, never by this file.
const FB = window.ARX_FIREBASE, V = FB.sdkVersion, G = `https://www.gstatic.com/firebasejs/${V}/`;
const done = ok => window.__arxResolve && window.__arxResolve(ok);
const bad = !FB.config.databaseURL || /REPLACE/.test(FB.config.databaseURL);
function banner(msg) { document.addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fff;padding:8px 12px;font:14px system-ui;text-align:center'; d.textContent = msg; document.body.prepend(d); }); }
if (bad) { banner('Backend not configured: set databaseURL in js/config/firebase-config.js'); window.ARX_BACKEND = null; done(false); }
else {
  const [{ initializeApp }, A, R] = await Promise.all([import(G + 'firebase-app.js'), import(G + 'firebase-auth.js'), import(G + 'firebase-database.js')]);
  const app = initializeApp(FB.config), auth = A.getAuth(app), db = R.getDatabase(app);
  if (FB.enableAnalytics && FB.config.measurementId) import(G + 'firebase-analytics.js').then(m => m.getAnalytics(app)).catch(() => {});
  const now = () => Date.now(), rd = async p => (await R.get(R.ref(db, p))).val(), up = o => R.update(R.ref(db), o);
  const list = o => Object.entries(o || {}).map(([id, v]) => ({ id, ...v }));
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const token = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error('Login required'));
  const adminMails = (FB.adminEmails || []).map(x => String(x).toLowerCase());
  const isAdminMail = u => !!u && !!u.email && adminMails.includes(u.email.toLowerCase());   // admin email: no OTP / verification needed
  async function api(path, { method = 'GET', body, headers = {}, raw } = {}) {
    const r = await fetch('/api/' + path, { method, body: raw ? body : (body && JSON.stringify(body)), headers: { Authorization: 'Bearer ' + await token(), ...(raw ? {} : body ? { 'content-type': 'application/json' } : {}), ...headers } });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')')); return j;
  }
  // First sign-in for accounts that have no profile yet (e.g. created in the Firebase console): create it so roles/UI work.
  async function ensureProfile(u, p) {
    if (p && p.username) return p;
    let un = String(u.email || 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'user';
    un = un.padEnd(3, '0') + Math.random().toString(36).slice(2, 6);
    try { await up({ [`usernames/${un}`]: u.uid, [`users/${u.uid}/username`]: un, [`users/${u.uid}/email`]: u.email, [`users/${u.uid}/createdAt`]: now(), [`users/${u.uid}/displayName`]: u.displayName || un, [`publicProfiles/${u.uid}`]: { username: un, displayName: u.displayName || un } }); } catch (e) { console.warn('ensureProfile', e); }
    return { ...(p || {}), username: un, displayName: (p && p.displayName) || u.displayName || un, createdAt: now() };
  }
  let adminSynced = false;
  async function hydrate(u) {
    if (!u) { localStorage.removeItem('arxmine_user'); if (window.authService) authService.currentUser = null; return null; }
    let p = (await rd('users/' + u.uid).catch(() => null)) || {};
    p = await ensureProfile(u, p);
    const amail = (adminMails.includes((u.email || '').toLowerCase()));
    let role = ['admin', 'developer'].includes(p.role) ? p.role : 'user';
    if (isAdminMail(u)) { role = 'admin'; if (p.role !== 'admin' && !adminSynced) { adminSynced = true; api('bootstrap-admin', { method: 'POST' }).catch(() => {}); } }
    const o = { id: u.uid, uid: u.uid, username: p.username, displayName: p.displayName || p.username, email: u.email, avatar: p.avatar || (window.CONFIG && CONFIG.images && CONFIG.images.defaultAvatar) || '', minecraftUsername: p.minecraftUsername || '', role, isDeveloper: role !== 'user', developerStatus: p.developerStatus || 'none', emailVerified: true, needsVerify: false, joinedAt: new Date(p.createdAt || now()).toISOString(), suspended: !!p.suspended };
    localStorage.setItem('arxmine_user', JSON.stringify(o)); if (window.authService) authService.currentUser = o; return o;
  }
  const B = window.ARX_BACKEND = {
    auth, db, api, token, hydrate, read: rd, list, RT: R, adminMails,
    async register({ email, password, username, displayName, minecraftUsername }) {
      const un = String(username || '').toLowerCase(); if (!/^[a-z0-9_]{3,20}$/.test(un)) throw new Error('Username: 3-20 chars, a-z 0-9 _');
      if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters');
      const c = await A.createUserWithEmailAndPassword(auth, email, password), uid = c.user.uid;
      try { await up({ [`usernames/${un}`]: uid, [`users/${uid}/username`]: un, [`users/${uid}/email`]: email, [`users/${uid}/createdAt`]: now(), [`users/${uid}/displayName`]: displayName || un, [`users/${uid}/minecraftUsername`]: minecraftUsername || '', [`publicProfiles/${uid}`]: { username: un, displayName: displayName || un, minecraftUsername: minecraftUsername || '' } }); }
      catch (e) { await c.user.delete().catch(() => {}); throw new Error('Username already taken or invalid'); }
      return hydrate(c.user);
    },
    async login(email, password) {
      let c;
      try { c = await A.signInWithEmailAndPassword(auth, email, password); }
      catch (e) {
        // Owner admin email: the server creates/repairs that account (password from the ADMIN_PASSWORD env var), then we sign in again.
        if (adminMails.includes(String(email).toLowerCase()) && /invalid-credential|user-not-found|wrong-password|invalid-login/.test(String(e.code))) {
          const r = await fetch('/api/admin-setup', { method: 'POST' }).catch(() => null);
          if (r && r.ok) c = await A.signInWithEmailAndPassword(auth, email, password); else throw e;
        } else throw e;
      } const u = await hydrate(c.user); if (u.suspended) { await A.signOut(auth); await hydrate(null); throw new Error('Account suspended'); } return u; },
    logout: async () => { await A.signOut(auth); localStorage.removeItem('arxmine_user'); },
    sendReset: e => A.sendPasswordResetEmail(auth, e), applyReset: (code, pw) => A.confirmPasswordReset(auth, code, pw), applyCode: c => A.applyActionCode(auth, c),
    // (no email/OTP verification step)
    async changePassword(oldPw, newPw) { const u = auth.currentUser; await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, oldPw)); return A.updatePassword(u, newPw); },
    async updateProfile({ displayName, minecraftUsername, avatar, bio }) {
      const u = auth.currentUser, o = {};
      if (displayName != null) { o[`users/${u.uid}/displayName`] = displayName; o[`publicProfiles/${u.uid}/displayName`] = displayName; }
      if (minecraftUsername != null) { o[`users/${u.uid}/minecraftUsername`] = minecraftUsername; o[`publicProfiles/${u.uid}/minecraftUsername`] = minecraftUsername; }
      if (avatar != null) { o[`users/${u.uid}/avatar`] = avatar; o[`publicProfiles/${u.uid}/avatar`] = avatar; }
      if (bio != null) o[`users/${u.uid}/bio`] = bio;
      await up(o); return hydrate(u);
    },
    applyDeveloper: d => R.set(R.ref(db, 'developerApplications/' + auth.currentUser.uid), { name: d.name, pitch: d.pitch, links: d.links || '', status: 'pending', createdAt: now() }),
    myApplication: async () => rd('developerApplications/' + auth.currentUser.uid),
    // ---- site content managed from the admin panel: brand, banners, social links ----
    brand: async () => (await rd('site/brand')) || {}, saveBrand: o => R.set(R.ref(db, 'site/brand'), o),
    async banners({ all = false } = {}) { return list(await rd('site/banners')).filter(x => all || x.enabled !== false).sort(byOrder); },
    saveBanner: (id, d) => R.set(R.ref(db, 'site/banners/' + id), d), deleteBanner: id => R.remove(R.ref(db, 'site/banners/' + id)),
    async socials({ all = false } = {}) { return list(await rd('site/socials')).filter(x => all || x.enabled !== false).sort(byOrder); },
    saveSocial: (id, d) => R.set(R.ref(db, 'site/socials/' + id), d), deleteSocial: id => R.remove(R.ref(db, 'site/socials/' + id)),
    // ---- dynamic catalog ----
    async catalog({ all = false } = {}) { const [c, p] = await Promise.all([rd('catalog/categories'), rd('catalog/platforms')]); const f = a => list(a).filter(x => all || x.enabled).sort(byOrder); return { categories: f(c), platforms: f(p) }; },
    saveCatalog: (kind, id, data) => R.set(R.ref(db, `catalog/${kind}/${id}`), data), deleteCatalog: (kind, id) => R.remove(R.ref(db, `catalog/${kind}/${id}`)),
    async mcVersions(edition = 'java') {
      if (edition === 'java') try { const r = await fetch('/api/mc-versions'); if (r.ok) return (await r.json()).versions.map(v => v.id); } catch (e) {}
      return list(await rd('catalog/mcVersions')).filter(v => v.enabled && (v.edition === edition || v.edition === 'both')).sort(byOrder).map(v => v.id);
    },
    // ---- projects ----
    saveProject: async p => {
      const u = auth.currentUser, id = p.id || R.push(R.ref(db, 'projects')).key, old = p.id ? await rd('projects/' + id) : null;
      const me = JSON.parse(localStorage.getItem('arxmine_user') || '{}');
      const d = { ...p, ownerUid: old?.ownerUid || u.uid, ownerName: old?.ownerName || me.username || '', status: 'pending', createdAt: old?.createdAt || now(), updatedAt: now() }; delete d.id;
      for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
      await R.set(R.ref(db, 'projects/' + id), d); return id;
    },
    deleteProject: async id => { await R.remove(R.ref(db, 'projectsPublic/' + id)).catch(() => {}); await R.remove(R.ref(db, 'projects/' + id)); },
    myProjects: async () => list(await rd('projects')),
    async myOwn() { const q = R.query(R.ref(db, 'projects'), R.orderByChild('ownerUid'), R.equalTo(auth.currentUser.uid)); return list((await R.get(q)).val()); },
    async approve(id, yes) {
      const p = await rd('projects/' + id); if (!p) return;
      if (yes) { await up({ [`projectsPublic/${id}`]: { ...p, status: 'approved', downloads: (await rd(`projectsPublic/${id}/downloads`)) || 0, approvedAt: now() }, [`projects/${id}/status`]: 'approved' }); await api('sync-project', { method: 'POST', body: { projectId: id } }).catch(() => {}); }
      else await up({ [`projectsPublic/${id}`]: null, [`projects/${id}/status`]: 'rejected' });
    },
    listPublic: async () => list(await rd('projectsPublic')), getPublic: async id => { const p = await rd('projectsPublic/' + id); return p && { id, ...p }; },
    sync: pid => api('sync-project', { method: 'POST', body: { projectId: pid } }).catch(() => {}),
    async saveVersion(pid, vid, v) { await R.set(R.ref(db, `projectVersions/${pid}/${vid}`), { version: v.version, changelog: v.changelog || '', mc: Object.fromEntries(v.mc.map(x => [x, true])), platforms: Object.fromEntries(v.platforms.map(x => [x, true])), createdAt: now() }); await B.sync(pid); },
    versions: async pid => list(await rd('projectVersions/' + pid)).sort((a, b) => b.createdAt - a.createdAt), files: async (pid, vid) => list(await rd(`projectFiles/${pid}/${vid}`)),
    // ---- files (Backblaze B2 through Netlify Functions) ----
    async uploadFile(file, { projectId, versionId, onProgress = () => {} }) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['jar', 'zip', 'mcpack', 'mcaddon', 'mcworld', 'mctemplate', 'mrpack', '7z'].includes(ext)) throw new Error('File type not allowed'); if (file.size > 20 * 1024 * 1024 || !file.size) throw new Error('File must be under 20 MB');
      const id = crypto.randomUUID(), size = 3 * 1024 * 1024, n = Math.ceil(file.size / size);
      for (let i = 0; i < n; i++) { await api('upload-chunk', { method: 'POST', raw: true, body: file.slice(i * size, (i + 1) * size), headers: { 'x-upload-id': id, 'x-chunk-index': String(i), 'content-type': 'application/octet-stream' } }); onProgress((i + 1) / n * 0.8); }
      await api('upload-finalize-background', { method: 'POST', body: { uploadId: id, chunks: n, projectId, versionId, filename: file.name } }).catch(() => {});
      const path = `uploads/${auth.currentUser.uid}/${id}`; for (let t = 0; t < 90; t++) { await new Promise(r => setTimeout(r, 2000)); const s = await rd(path); onProgress(0.8 + Math.min(t / 90, 1) * 0.2); if (s?.state === 'done') return s; if (s?.state === 'error') throw new Error(s.message || 'Upload failed'); }
      throw new Error('Upload timed out. Check the version\'s files before retrying.');
    },
    async download(p, v, a) { const j = await api(`download?p=${encodeURIComponent(p)}&v=${encodeURIComponent(v)}&a=${encodeURIComponent(a)}`); window.projectService && projectService.invalidate(); location.href = j.url; return j; },
    deleteFile: (projectId, versionId, assetKey) => api('file-delete', { method: 'POST', body: { projectId, versionId, assetKey } }),
    adminUser: (action, uid, role) => api('admin-user', { method: 'POST', body: { action, uid, role } }),
    // ---- community ----
    async saveReview(pid, { stars, text }) { const me = JSON.parse(localStorage.getItem('arxmine_user') || '{}'); await R.set(R.ref(db, `reviews/${pid}/${auth.currentUser.uid}`), { stars: Number(stars), text, userName: me.username || '', createdAt: now() }); await B.sync(pid); },
    async deleteReview(pid, uid) { await R.remove(R.ref(db, `reviews/${pid}/${uid}`)); await B.sync(pid); }, reviews: async pid => list(await rd('reviews/' + pid)).sort((a, b) => b.createdAt - a.createdAt),
    vote: (pid, ruid, helpful) => R.set(R.ref(db, `reviewVotes/${pid}/${ruid}/${auth.currentUser.uid}`), !!helpful), votes: async pid => (await rd('reviewVotes/' + pid)) || {},
    report: (type, target, reason) => R.push(R.ref(db, 'reports'), { type, target, reason, by: auth.currentUser.uid, createdAt: now(), status: 'open' }),
    reports: async () => list(await rd('reports')).sort((a, b) => b.createdAt - a.createdAt), resolveReport: id => R.remove(R.ref(db, 'reports/' + id)),
    comment: (pid, text) => { const me = JSON.parse(localStorage.getItem('arxmine_user') || '{}'); return R.push(R.ref(db, 'comments/' + pid), { uid: auth.currentUser.uid, userName: me.username || '', text, createdAt: now() }); },
    comments: async pid => list(await rd('comments/' + pid)).sort((a, b) => b.createdAt - a.createdAt), deleteComment: (pid, cid) => R.remove(R.ref(db, `comments/${pid}/${cid}`)),
    isFavorite: async pid => !!(await rd(`users/${auth.currentUser.uid}/favorites/${pid}`)),
    async toggleFavorite(pid) { const p = `users/${auth.currentUser.uid}/favorites/${pid}`, on = !(await rd(p)); on ? await R.set(R.ref(db, p), true) : await R.remove(R.ref(db, p)); return on; },
    async toggleFollow(cid) { const p = `users/${auth.currentUser.uid}/following/${cid}`, on = !(await rd(p)); on ? await R.set(R.ref(db, p), true) : await R.remove(R.ref(db, p)); return on; },
    myMeta: async () => (await rd('users/' + auth.currentUser.uid)) || {},
    publicProfile: async uid => rd('publicProfiles/' + uid),
    markNotifications: async ids => { const o = {}; ids.forEach(i => o[`users/${auth.currentUser.uid}/notifications/${i}/read`] = true); await up(o); },
    removeNotification: id => R.remove(R.ref(db, `users/${auth.currentUser.uid}/notifications/${id}`))
  };
  window.ARX_BACKEND = B;
  let first = true;
  A.onAuthStateChanged(auth, async u => {
    try { await hydrate(u); } catch (e) { console.error(e); }
    if (first) { first = false; done(true); } else if (window.Utils && Utils.updateNavbarUser) Utils.updateNavbarUser();
  });
}
