const http = require('node:http');
const crypto = require('node:crypto');
const ROLES = ['super_admin', 'admin', 'employee', 'manufacturer', 'business_owner', 'merchant', 'supplier', 'seller', 'buyer'];
const ADMIN_ROLES = ['super_admin', 'admin'];
const VENDOR_ROLES = ['manufacturer', 'supplier', 'seller', 'business_owner', 'merchant'];
const SELF_REGISTER_ROLES = ['buyer', 'manufacturer', 'supplier', 'seller', 'business_owner', 'merchant'];
const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', employee: 'Employee', manufacturer: 'Manufacturer', business_owner: 'Business Owner', merchant: 'Merchant', supplier: 'Supplier', seller: 'Seller', buyer: 'Buyer' };

const uid = p => p + '-' + crypto.randomBytes(4).toString('hex');
const now = () => new Date().toISOString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdmin = u => !!u && ADMIN_ROLES.includes(u.role);
const isVendor = u => !!u && VENDOR_ROLES.includes(u.role);

function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
    return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
    const [salt, h] = String(stored).split(':');
    const a = crypto.scryptSync(pw, salt, 64), b = Buffer.from(h, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const locations = [
    { id: 'loc-1', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001', status: 'active' },
    { id: 'loc-2', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', status: 'active' },
    { id: 'loc-3', city: 'Surat', state: 'Gujarat', pincode: '395003', status: 'active' },
    { id: 'loc-4', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', status: 'active' },
    { id: 'loc-5', city: 'Delhi', state: 'Delhi', pincode: '110001', status: 'active' }
];

const businesses = [
    { id: 'biz-1', business_name: 'Bharat Heavy Machines Ltd.', category: 'Industrial Machinery', location_id: 'loc-1', phone: '+91 79 2589 1100', whatsapp: '919822233344', rating: 4.9, reviews: 58, verified: 1, gstin: '24AABCB1234F1Z8', status: 'active' },
    { id: 'biz-2', business_name: 'Metro Tech Electronics Pvt Ltd', category: 'Electrical & Electronics', location_id: 'loc-2', phone: '+91 80 4123 9988', whatsapp: '919833344455', rating: 4.7, reviews: 42, verified: 1, gstin: '29AADCM4567H1Z2', status: 'active' },
    { id: 'biz-3', business_name: 'Vardhman Premium Textiles', category: 'Textiles & Fabrics', location_id: 'loc-3', phone: '+91 261 2456 789', whatsapp: '919822299988', rating: 4.8, reviews: 89, verified: 1, gstin: '24AAACV8899K1Z5', status: 'active' }
];

const products = [
    { id: 'p1', business_id: 'biz-1', title: 'Automatic Packaging Machine', category: 'Machinery', wholesale_price: 185000, retail_price: 225000, moq: 1, stock: 15, img: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500', status: 'active' },
    { id: 'p2', business_id: 'biz-2', title: 'Industrial 150W LED High Bay Light', category: 'Lighting', wholesale_price: 1350, retail_price: 2499, moq: 20, stock: 500, img: 'https://images.unsplash.com/photo-1565814636199-ae8133055c1c?w=500', status: 'active' },
    { id: 'p3', business_id: 'biz-3', title: '100% Pure Organic Cotton Fabric', category: 'Fabric', wholesale_price: 195, retail_price: 380, moq: 100, stock: 5000, img: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=500', status: 'active' }
];

const enquiries = [];
const users = [];
const sessions = new Map(); // sid -> { uid, exp }

(function seedUsers() {
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || 'superadmin@businessconnect.in').toLowerCase();
    const superPw = process.env.SUPER_ADMIN_PASSWORD || 'Super@12345';
    const mk = (role, name, email, pw, extra = {}) => users.push({
        id: uid('usr'), name, email, phone: '', role, status: 'active', location_id: 'loc-4',
        business_id: null, password_hash: hashPw(pw), created_at: now(), ...extra
    });
    mk('super_admin', 'Super Admin', superEmail, superPw);
    console.log(`[seed] Super admin: ${superEmail} / ${process.env.SUPER_ADMIN_PASSWORD ? '(from env)' : superPw}`);
    if (process.env.DEMO_DATA === '0') return;
    const demo = 'Demo@12345';
    mk('admin', 'Demo Admin', 'admin@businessconnect.in', demo);
    mk('buyer', 'Demo Buyer', 'buyer@businessconnect.in', demo);
    mk('supplier', 'Bharat Heavy Supplier', 'supplier@businessconnect.in', demo, { business_id: 'biz-1', location_id: 'loc-1' });
    mk('merchant', 'Metro Tech Merchant', 'merchant@businessconnect.in', demo, { business_id: 'biz-2', location_id: 'loc-2' });
    mk('seller', 'Vardhman Seller', 'seller@businessconnect.in', demo, { business_id: 'biz-3', location_id: 'loc-3' });
    console.log(`[seed] Demo accounts (admin/buyer/supplier/merchant/seller @businessconnect.in) password: ${demo}`);
    console.log('[seed] Change these before going live (set DEMO_DATA=0 to skip demo users).');
})();
const fs = require('node:fs');
const path = require('node:path');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const categories = [];
const socialLinks = [];
const COLLECTIONS = { users, locations, businesses, products, enquiries, categories, socialLinks };

function loadData() {
    try {
        const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        for (const [k, arr] of Object.entries(COLLECTIONS)) if (Array.isArray(d[k])) arr.splice(0, arr.length, ...d[k]);
        sessions.clear();
        for (const [sid, s] of d.sessions || []) if (s.exp > Date.now()) sessions.set(sid, s);
        console.log(`[data] Loaded ${users.length} users from ${DATA_FILE}`);
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('[data] Could not read data file, starting with seed data:', e.message);
    }
}
let saveTimer = null;
function saveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    try {
        const out = { sessions: [...sessions.entries()] };
        for (const [k, arr] of Object.entries(COLLECTIONS)) out[k] = arr;
        const tmp = DATA_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
        fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.error('[data] Save failed:', e.message); }
}
const saveSoon = () => { if (!saveTimer) saveTimer = setTimeout(saveNow, 300); };
loadData();
process.on('SIGTERM', () => { saveNow(); process.exit(0); });
process.on('SIGINT', () => { saveNow(); process.exit(0); });
const bad =(msg, status = 400) => Object.assign(new Error(msg), { status });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s-]{7,18}$/;

const S = {
    location: {
        city: { req: 1, max: 60 }, state: { req: 1, max: 60 },
        pincode: { re: /^\d{6}$/ }, status: { vals: ['active', 'inactive'] }, country: { max: 80 }, district: { max: 80 }, locality: { max: 100 }, parent_id: { max: 80 }, level: { vals: ['country','state','district','city','locality','pincode'] }
    },
    user: {
        name: { req: 1, max: 80 }, email: { req: 1, max: 120, re: EMAIL_RE, lower: 1 },
        phone: { re: PHONE_RE }, role: { vals: ROLES },
        status: { vals: ['active', 'pending', 'blocked'] }, location_id: {}
    },
    business: {
        business_name: { req: 1, max: 100 }, category: { req: 1, max: 60 }, location_id: {},
        phone: { re: PHONE_RE }, whatsapp: { re: /^\d{10,15}$/ },
        gstin: { re: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, upper: 1 }
    },
    businessAdmin: {
        status: { vals: ['active', 'pending', 'blocked'] },
        verified: { t: 'n', min: 0, max: 1, int: 1 }
    },
    product: {
        title: { req: 1, max: 120 }, category: { max: 60 },
        wholesale_price: { t: 'n', req: 1, min: 0, max: 1e9 }, retail_price: { t: 'n', req: 1, min: 0, max: 1e9 },
        moq: { t: 'n', req: 1, min: 1, max: 1e7, int: 1 }, stock: { t: 'n', req: 1, min: 0, max: 1e9, int: 1 },
        img: { max: 500, url: 1 }, status: { vals: ['active', 'inactive'] }
    },
    enquiry: {
        buyer_name: { req: 1, max: 80 }, buyer_phone: { req: 1, re: PHONE_RE }, product_id: { req: 1 },
        quantity: { t: 'n', req: 1, min: 1, max: 1e8, int: 1 }, city: { max: 60 }, requirements: { max: 500 }
    }
};

function clean(schema, input, partial) {
    const out = {};
    for (const [k, r] of Object.entries(schema)) {
        if (!(k in input)) { if (!partial && r.req) throw bad(`${k.replace(/_/g, ' ')} is required`); continue; }
        let v = input[k];
        if (r.t === 'n') {
            if (v === '' || v === null || v === undefined) { if (r.req) throw bad(`${k.replace(/_/g, ' ')} is required`); continue; }
            v = Number(v);
            if (!Number.isFinite(v) || (r.int && !Number.isInteger(v)) || (r.min !== undefined && v < r.min) || (r.max !== undefined && v > r.max)) throw bad(`${k.replace(/_/g, ' ')} is invalid`);
            out[k] = v; continue;
        }
        v = String(v ?? '').trim();
        if (r.lower) v = v.toLowerCase();
        if (r.upper) v = v.toUpperCase();
        if (!v) { if (r.req) throw bad(`${k.replace(/_/g, ' ')} is required`); out[k] = ''; continue; }
        if ((r.max && v.length > r.max) || (r.vals && !r.vals.includes(v)) || (r.re && !r.re.test(v)) || (r.url && !/^https?:\/\//i.test(v)))
            throw bad(`${k.replace(/_/g, ' ')} is invalid`);
        out[k] = v;
    }
    return out;
}
const findLoc = id => locations.find(l => l.id === id);
const findCategory = id => categories.find(c => c.id === id);
const findBiz = id => businesses.find(b => b.id === id);
const cityOf = id => (findLoc(id) || {}).city || '';
const checkLocation = d => {
    if ('location_id' in d) { if (d.location_id && !findLoc(d.location_id)) throw bad('Unknown location'); if (!d.location_id) d.location_id = null; }
};

const outLoc = l => l;
const outUser = u => {
    const { password_hash, ...rest } = u;
    const l = findLoc(u.location_id), b = findBiz(u.business_id);
    return { ...rest, city: l ? `${l.city}, ${l.state}` : '', business_name: b ? b.business_name : '' };
};
const outBiz = b => { const l = findLoc(b.location_id); return { ...b, city: l ? `${l.city}, ${l.state}` : '' }; };
const outProd = p => { const b = findBiz(p.business_id); return { ...p, business_name: b ? b.business_name : '' }; };
const outEnq = e => {
    const p = products.find(x => x.id === e.product_id), b = findBiz(e.business_id);
    return { ...e, product_title: p ? p.title : '(deleted product)', business_name: b ? b.business_name : '' };
};

function canManageUser(actor, t) {
    if (actor.role === 'super_admin') return true;
    if (actor.role === 'admin') return !ADMIN_ROLES.includes(t.role);
    return false;
}
const canAssignRole = (actor, role) => actor.role === 'super_admin' ? ROLES.includes(role) : (actor.role === 'admin' && !ADMIN_ROLES.includes(role) && ROLES.includes(role));

function createBusiness(owner, d) {
    const b = {
        id: uid('biz'), business_name: d.business_name, category: d.category || 'General',
        location_id: owner.location_id || null, phone: owner.phone || '', whatsapp: '', rating: 0, reviews: 0,
        verified: 0, gstin: d.gstin || '', status: owner.status === 'active' ? 'active' : 'pending'
    };
    businesses.push(b);
    owner.business_id = b.id;
    return b;
}

function dropUserSessions(userId) { for (const [k, s] of sessions) if (s.uid === userId) sessions.delete(k); }

function syncBusinessWithUser(u) {
    const b = findBiz(u.business_id);
    if (!b) return;
    if (u.status === 'active' && b.status !== 'active') b.status = 'active';
    if (u.status === 'blocked') b.status = 'blocked';
    if (u.status === 'pending') b.status = 'pending';
}

const hits = new Map(); // simple in-memory rate limiter
function limited(key, max, windowMs) {
    const t = Date.now(), h = hits.get(key);
    if (!h || t - h.t > windowMs) { hits.set(key, { n: 1, t }); return false; }
    h.n++;
    return h.n > max;
  }
function readBody(req) {
    return new Promise((ok, no) => {
        let b = '', n = 0;
        req.on('data', c => { n += c.length; if (n > 100000) { no(bad('Payload too large', 413)); req.destroy(); return; } b += c; });
        req.on('end', () => {
            if (!b) return ok({});
            try { const j = JSON.parse(b); ok(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); } catch { no(bad('Invalid JSON')); }
        });
        req.on('error', no);
    });
}
const send = (res, status, type, body, headers = {}) => {
    res.writeHead(status, {
        'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin', ...headers
    });
    res.end(body);
};
const json = (res, status, obj, headers) => send(res, status, 'application/json', JSON.stringify(obj), headers);
const page = (res, body, status = 200) => send(res, status, 'text/html', body)
function getUser(req) {
    const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || '');
    if (!m) return null;
    const s = sessions.get(m[1]);
    if (!s || s.exp < Date.now()) { sessions.delete(m[1]); return null; }
    const u = users.find(x => x.id === s.uid);
    return u && u.status === 'active' ? u : null;
}
const need = u => { if (!u) throw bad('Please log in', 401); return u; };
const needAdmin = u => { need(u); if (!isAdmin(u)) throw bad('Admin access required', 403); return u; };
const needVendorOrAdmin = u => { need(u); if (!isAdmin(u) && !isVendor(u)) throw bad('Access denied', 403); return u; };
async function api(req, res, pathname, user) {
    const m = req.method;
    const parts = pathname.split('/').filter(Boolean); // ['api', resource, id]
    const r = parts[1], id = parts[2];
    // Behind a hosting proxy (Render, Railway, nginx...) set TRUST_PROXY=1 so each visitor gets their own IP for rate limits.
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = (process.env.TRUST_PROXY === '1' && fwd) || req.socket.remoteAddress || 'x';
    let b = {};
    if (m === 'POST' || m === 'PUT') {
        if (!/application\/json/i.test(req.headers['content-type'] || '')) throw bad('Content-Type must be application/json', 415);
        b = await readBody(req);
    }
    if (r === 'login' && m === 'POST') {
        const email = String(b.email || '').trim().toLowerCase();
        // per-IP and per-account limits, so one shared proxy IP can never lock out every user
        if (limited('login:' + ip, 60, 15 * 60 * 1000) || limited('loginem:' + email, 10, 15 * 60 * 1000)) throw bad('Too many attempts. Try again later.', 429);
        const u = users.find(x => x.email === email);
        if (!u || !checkPw(String(b.password || ''), u.password_hash)) throw bad('Invalid email or password', 401);
        if (u.status === 'pending') throw bad('Your account is awaiting admin approval', 403);
        if (u.status !== 'active') throw bad('Your account is blocked. Contact support.', 403);
        const sid = crypto.randomBytes(24).toString('hex');
        sessions.set(sid, { uid: u.id, exp: Date.now() + 24 * 3600 * 1000 });
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        return json(res, 200, { success: true, role: u.role }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}` });
    }
    if (r === 'logout' && m === 'POST') {
        const c = /sid=([a-f0-9]{48})/.exec(req.headers.cookie || '');
        if (c) sessions.delete(c[1]);
        return json(res, 200, { success: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }
    if (r === 'register' && m === 'POST') {
        if (limited('reg:' + ip, 10, 3600 * 1000)) throw bad('Too many registrations. Try later.', 429);
        const role = String(b.role || '');
        if (!SELF_REGISTER_ROLES.includes(role)) throw bad('Invalid role');
        const d = clean({ name: S.user.name, email: S.user.email, phone: S.user.phone, location_id: S.user.location_id }, b, false);
        checkLocation(d);
        const pw = String(b.password || '');
        if (pw.length < 8 || pw.length > 100) throw bad('Password must be 8-100 characters');
        if (users.some(x => x.email === d.email)) throw bad('Email already registered', 409);
        const u = { id: uid('usr'), ...d, role, status: role === 'buyer' ? 'active' : 'pending', business_id: null, password_hash: hashPw(pw), created_at: now() };
        if (VENDOR_ROLES.includes(role)) {
            const bd = clean({ business_name: S.business.business_name, category: S.business.category, gstin: S.business.gstin }, b, false);
            createBusiness(u, bd);
        }
        users.push(u);
        return json(res, 201, { success: true, pending: u.status === 'pending' });
    }
    if (r === 'me') {
        need(user);
        if (m === 'GET') return json(res, 200, outUser(user));
        if (m === 'PUT') {
            const d = clean({ name: S.user.name, phone: S.user.phone, location_id: S.user.location_id }, b, true);
            checkLocation(d);
            if (b.new_password) {
                if (!checkPw(String(b.current_password || ''), user.password_hash)) throw bad('Current password is incorrect');
                const np = String(b.new_password);
                if (np.length < 8 || np.length > 100) throw bad('New password must be 8-100 characters');
                user.password_hash = hashPw(np);
            }
            Object.assign(user, d);
            return json(res, 200, outUser(user));
        }
    }
    if (r === 'enquiries' && m === 'POST') {
        if (limited('enq:' + ip, 20, 3600 * 1000)) throw bad('Too many enquiries. Try later.', 429);
        const d = clean(S.enquiry, b, false);
        const p = products.find(x => x.id === d.product_id);
        const biz = p && findBiz(p.business_id);
        if (!p || p.status !== 'active' || !biz || biz.status !== 'active') throw bad('Product not available', 404);
        const e = {
            id: uid('enq'), ...d, business_id: p.business_id, buyer_user_id: user && user.role === 'buyer' ? user.id : null,
            city: d.city || 'India', status: 'new', created_at: now()
        };
        enquiries.push(e);
        return json(res, 201, { success: true, id: e.id });
    }
    // Category and subcategory management (admin-only)
    if (r === 'categories') {
        if (m === 'GET') return json(res, 200, (isAdmin(user) ? categories : categories.filter(c => c.status === 'active')));
        needAdmin(user);
        if (m === 'POST') {
            const name = String(b.name || '').trim().slice(0, 100);
            if (!name) throw bad('Category name is required');
            const parent_id = b.parent_id ? String(b.parent_id) : null;
            if (parent_id && !findCategory(parent_id)) throw bad('Parent category not found');
            const slug = String(b.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 120);
            if (categories.some(c => c.slug === slug)) throw bad('Category slug already exists', 409);
            const c = { id: uid('cat'), name, slug, description: String(b.description || '').slice(0, 1000), parent_id, image_url: String(b.image_url || '').slice(0, 500), status: ['active','inactive'].includes(b.status) ? b.status : 'active', created_at: now(), updated_at: now() };
            categories.push(c); return json(res, 201, c);
        }
        const c = findCategory(id); if (!c) throw bad('Category not found', 404);
        if (m === 'PUT') {
            const name = b.name === undefined ? c.name : String(b.name).trim().slice(0, 100);
            const parent_id = b.parent_id === undefined ? c.parent_id : (b.parent_id ? String(b.parent_id) : null);
            if (!name) throw bad('Category name is required');
            if (parent_id === c.id || (parent_id && !findCategory(parent_id))) throw bad('Invalid parent category');
            const slug = b.slug === undefined ? c.slug : String(b.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 120);
            if (categories.some(x => x.id !== c.id && x.slug === slug)) throw bad('Category slug already exists', 409);
            Object.assign(c, { name, slug, parent_id, description: b.description === undefined ? c.description : String(b.description).slice(0,1000), image_url: b.image_url === undefined ? c.image_url : String(b.image_url).slice(0,500), status: ['active','inactive'].includes(b.status) ? b.status : c.status, updated_at: now() });
            return json(res, 200, c);
        }
        if (m === 'DELETE') {
            if (categories.some(x => x.parent_id === c.id)) throw bad('Delete or move subcategories first', 409);
            if (products.some(p => p.category_id === c.id)) throw bad('Category is used by products; reassign products first', 409);
            categories.splice(categories.indexOf(c), 1); return json(res, 200, { success: true });
        }
    }
    // Social links are scoped to the logged-in user's business, or admin-managed by business_id.
    if (r === 'qr' && m === 'GET') {
        need(user);
        const target = String(new URL(req.url, 'http://localhost').searchParams.get('text') || '').slice(0, 1500);
        if (!target) throw bad('text query parameter is required');
        return json(res, 200, { success: true, qr_image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(target) });
    }
    if (r === 'social-links') {
        need(user);
        const own = x => isAdmin(user) || x.owner_user_id === user.id || (user.business_id && x.business_id === user.business_id);
        if (m === 'GET') return json(res, 200, socialLinks.filter(own));
        if (m === 'POST') {
            if (!isAdmin(user) && !user.business_id) throw bad('Create a business profile first', 403);
            const platform = String(b.platform || '').trim().toLowerCase();
            const allowed = ['whatsapp','instagram','facebook','youtube','linkedin','x','telegram','website','google_maps','email','other'];
            if (!allowed.includes(platform)) throw bad('Unsupported platform');
            const url = String(b.url || '').trim();
            if (platform === 'email' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) : !/^https:\/\//i.test(url) && platform !== 'whatsapp') throw bad('Enter a valid HTTPS URL (or valid email for Email)');
            const business_id = isAdmin(user) ? String(b.business_id || user.business_id || '') : user.business_id;
            if (business_id && !findBiz(business_id)) throw bad('Business not found');
            const item = { id: uid('soc'), owner_user_id: user.id, business_id: business_id || null, platform, label: String(b.label || platform).slice(0,80), url: platform === 'whatsapp' ? 'https://wa.me/' + url.replace(/\D/g,'') : url, created_at: now() };
            socialLinks.push(item); return json(res, 201, item);
        }
        const item = socialLinks.find(x => x.id === id); if (!item || !own(item)) throw bad('Social link not found', 404);
        if (m === 'PUT') {
            if (b.label !== undefined) item.label = String(b.label).slice(0,80);
            if (b.url !== undefined) { const url = String(b.url).trim(); if (!/^https:\/\//i.test(url) && item.platform !== 'email') throw bad('URL must use HTTPS'); item.url = url; }
            if (b.platform !== undefined) throw bad('Changing platform is not supported; create a new link');
            return json(res, 200, item);
        }
        if (m === 'DELETE') { socialLinks.splice(socialLinks.indexOf(item),1); return json(res,200,{success:true}); }
    }
    if (r === 'locations') {
        if (m === 'GET') return json(res, 200, (isAdmin(user) ? locations : locations.filter(l => l.status === 'active')).map(outLoc));
        needAdmin(user);
        if (m === 'POST') {
            const d = clean(S.location, b, false);
            if (locations.some(l => l.city.toLowerCase() === d.city.toLowerCase() && l.state.toLowerCase() === d.state.toLowerCase())) throw bad('Location already exists', 409);
            const l = { id: uid('loc'), status: 'active', pincode: '', ...d };
            locations.push(l);
            return json(res, 201, l);
        }
        const l = locations.find(x => x.id === id);
        if (!l) throw bad('Location not found', 404);
        if (m === 'PUT') {
            const d = clean(S.location, b, true);
            const city = (d.city ?? l.city).toLowerCase(), state = (d.state ?? l.state).toLowerCase();
            if (locations.some(x => x.id !== l.id && x.city.toLowerCase() === city && x.state.toLowerCase() === state)) throw bad('Location already exists', 409);
            Object.assign(l, d);
            return json(res, 200, l);
        }
        if (m === 'DELETE') {
            const n = users.filter(x => x.location_id === l.id).length + businesses.filter(x => x.location_id === l.id).length;
            if (n) throw bad(`Location is used by ${n} user/business record(s). Deactivate it instead.`, 409);
            locations.splice(locations.indexOf(l), 1);
            return json(res, 200, { success: true });
        }
    }
    if (r === 'users') {
        needAdmin(user);
        if (m === 'GET') return json(res, 200, users.map(outUser));
        if (m === 'POST') {
            const d = clean(S.user, b, false);
            if (!canAssignRole(user, d.role)) throw bad('You cannot create this role', 403);
            checkLocation(d);
            const pw = String(b.password || '');
            if (pw.length < 8 || pw.length > 100) throw bad('Password must be 8-100 characters');
            if (users.some(x => x.email === d.email)) throw bad('Email already registered', 409);
            const u = { id: uid('usr'), phone: '', status: 'active', location_id: null, ...d, business_id: null, password_hash: hashPw(pw), created_at: now() };
            if (VENDOR_ROLES.includes(u.role)) {
                const bd = clean({ business_name: S.business.business_name, category: S.business.category }, { business_name: b.business_name || u.name + ' Business', category: b.category || 'General' }, false);
                createBusiness(u, bd);
            }
            users.push(u);
            return json(res, 201, outUser(u));
        }
        const t = users.find(x => x.id === id);
        if (!t) throw bad('User not found', 404);
        if (!canManageUser(user, t)) throw bad('You cannot manage this user', 403);
        if (m === 'PUT') {
            const d = clean(S.user, b, true);
            checkLocation(d);
            if (d.email && users.some(x => x.id !== t.id && x.email === d.email)) throw bad('Email already registered', 409);
            if (d.role && d.role !== t.role) {
                if (t.id === user.id) throw bad('You cannot change your own role');
                if (!canAssignRole(user, d.role)) throw bad('You cannot assign this role', 403);
            }
            if (d.status && d.status !== 'active' && t.id === user.id) throw bad('You cannot deactivate yourself');
            const activeSupers = users.filter(x => x.role === 'super_admin' && x.status === 'active').length;
            if (t.role === 'super_admin' && activeSupers === 1 && ((d.role && d.role !== 'super_admin') || (d.status && d.status !== 'active'))) throw bad('Cannot demote or block the last active super admin');
            if (b.password) {
                const pw = String(b.password);
                if (pw.length < 8 || pw.length > 100) throw bad('Password must be 8-100 characters');
                t.password_hash = hashPw(pw);
            }
            Object.assign(t, d);
            if (VENDOR_ROLES.includes(t.role) && !t.business_id) createBusiness(t, { business_name: String(b.business_name || t.name + ' Business').slice(0, 100), category: String(b.category || 'General').slice(0, 60) });
            if (d.status) { syncBusinessWithUser(t); if (d.status !== 'active') dropUserSessions(t.id); }
            return json(res, 200, outUser(t));
        }
        if (m === 'DELETE') {
            if (t.id === user.id) throw bad('You cannot delete yourself');
            if (t.role === 'super_admin' && users.filter(x => x.role === 'super_admin').length === 1) throw bad('Cannot delete the last super admin');
            users.splice(users.indexOf(t), 1);
            dropUserSessions(t.id);
            if (t.business_id && !users.some(x => x.business_id === t.business_id)) {
                for (let i = products.length - 1; i >= 0; i--) if (products[i].business_id === t.business_id) products.splice(i, 1);
                const bi = businesses.findIndex(x => x.id === t.business_id);
                if (bi >= 0) businesses.splice(bi, 1);
            }
            return json(res, 200, { success: true });
        }
                              }
    if (r === 'businesses') {
        needVendorOrAdmin(user);
        if (m === 'GET') return json(res, 200, (isAdmin(user) ? businesses : businesses.filter(x => x.id === user.business_id)).map(outBiz));
        const t = findBiz(id);
        if (!t) throw bad('Business not found', 404);
        if (!isAdmin(user) && t.id !== user.business_id) throw bad('Not your business', 403);
        if (m === 'PUT') {
            const schema = isAdmin(user) ? { ...S.business, ...S.businessAdmin } : S.business;
            const d = clean(schema, b, true);
            checkLocation(d);
            Object.assign(t, d);
            return json(res, 200, outBiz(t));
        }
        if (m === 'DELETE') {
            needAdmin(user);
            for (let i = products.length - 1; i >= 0; i--) if (products[i].business_id === t.id) products.splice(i, 1);
            users.forEach(x => { if (x.business_id === t.id) x.business_id = null; });
            businesses.splice(businesses.indexOf(t), 1);
            return json(res, 200, { success: true });
        }
    }
    if (r === 'products') {
        needVendorOrAdmin(user);
        if (m === 'GET') return json(res, 200, (isAdmin(user) ? products : products.filter(x => x.business_id === user.business_id)).map(outProd));
        if (m === 'POST') {
            const d = clean(S.product, b, false);
            const bizId = isAdmin(user) ? String(b.business_id || '') : user.business_id;
            if (!bizId || !findBiz(bizId)) throw bad(isAdmin(user) ? 'Select a business' : 'You have no business profile');
            const p = { id: uid('p'), category: '', img: '', status: 'active', ...d, business_id: bizId };
            products.push(p);
            return json(res, 201, outProd(p));
        }
        const t = products.find(x => x.id === id);
        if (!t) throw bad('Product not found', 404);
        if (!isAdmin(user) && t.business_id !== user.business_id) throw bad('Not your product', 403);
        if (m === 'PUT') {
            const d = clean(S.product, b, true);
            if (isAdmin(user) && b.business_id) { if (!findBiz(b.business_id)) throw bad('Unknown business'); d.business_id = String(b.business_id); }
            Object.assign(t, d);
            return json(res, 200, outProd(t));
        }
        if (m === 'DELETE') { products.splice(products.indexOf(t), 1); return json(res, 200, { success: true }); }
    }
    if (r === 'enquiries') {
        need(user);
        const visible = e => isAdmin(user) || (isVendor(user) && e.business_id === user.business_id) || (user.role === 'buyer' && e.buyer_user_id === user.id);
        if (m === 'GET') return json(res, 200, enquiries.filter(visible).map(outEnq).reverse());
        const t = enquiries.find(x => x.id === id);
        if (!t || !visible(t)) throw bad('Enquiry not found', 404);
        if (m === 'PUT') {
            if (user.role === 'buyer') throw bad('Access denied', 403);
            const d = clean({ status: { req: 1, vals: ['new', 'contacted', 'closed'] } }, b, true);
            if (!isAdmin(user) && isVendor(user)) {
                if (b.supplier_quote !== undefined) { const q = Number(b.supplier_quote); if (!Number.isFinite(q) || q < 0 || q > 1e9) throw bad('Quotation price must be a valid non-negative amount'); t.supplier_quote = q; }
                if (b.supplier_message !== undefined) t.supplier_message = String(b.supplier_message).slice(0, 1000);
                if (b.delivery_days !== undefined) { const days = Number(b.delivery_days); if (!Number.isInteger(days) || days < 0 || days > 3650) throw bad('Delivery days must be between 0 and 3650'); t.delivery_days = days; }
                if (b.quote_valid_until !== undefined) { const date = String(b.quote_valid_until); if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Quote validity must use YYYY-MM-DD'); t.quote_valid_until = date; }
                if (b.supplier_quote !== undefined || b.supplier_message !== undefined || b.delivery_days !== undefined || b.quote_valid_until !== undefined) { t.quoted_at = now(); if (!d.status) d.status = 'contacted'; }
            }
            Object.assign(t, d);
            return json(res, 200, outEnq(t));
        }
        if (m === 'DELETE') { needAdmin(user); enquiries.splice(enquiries.indexOf(t), 1); return json(res, 200, { success: true }); }
    }

    // ── dashboard stats ──
    if (r === 'stats' && m === 'GET') {
        need(user);
        const c = (a, f) => a.filter(f).length, card = (label, value, icon) => ({ label, value, icon });
        if (isAdmin(user)) {
            return json(res, 200, {
                cards: [
                    card('Total users', users.length, 'fa-users'),
                    card('Pending approvals', c(users, x => x.status === 'pending') + c(businesses, x => x.status === 'pending' && !users.some(u => u.business_id === x.id)), 'fa-user-clock'),
                    card('Buyers', c(users, x => x.role === 'buyer'), 'fa-cart-shopping'),
                    card('Merchants', c(users, x => x.role === 'merchant'), 'fa-store'),
                    card('Suppliers', c(users, x => x.role === 'supplier'), 'fa-truck-field'),
                    card('Sellers', c(users, x => x.role === 'seller'), 'fa-tags'),
                    card('Admins', c(users, x => ADMIN_ROLES.includes(x.role)), 'fa-user-shield'),
                    card('Blocked users', c(users, x => x.status === 'blocked'), 'fa-ban'),
                    card('Locations', c(locations, x => x.status === 'active') + ' / ' + locations.length, 'fa-location-dot'),
                    card('Businesses', businesses.length, 'fa-building'),
                    card('Products (active)', c(products, x => x.status === 'active') + ' / ' + products.length, 'fa-box'),
                    card('New enquiries', c(enquiries, x => x.status === 'new'), 'fa-inbox')
                ]
            });
        }
        if (isVendor(user)) {
            const biz = findBiz(user.business_id), mine = products.filter(x => x.business_id === user.business_id), enq = enquiries.filter(x => x.business_id === user.business_id);
            return json(res, 200, {
                notice: biz && biz.status !== 'active' ? `Your business is ${biz.status}. Products are hidden from buyers until it is active.` : '',
                cards: [
                    card('My products', mine.length, 'fa-box'), card('Active products', c(mine, x => x.status === 'active'), 'fa-circle-check'),
                    card('Units in stock', mine.reduce((s, x) => s + x.stock, 0).toLocaleString('en-IN'), 'fa-warehouse'),
                    card('New enquiries', c(enq, x => x.status === 'new'), 'fa-inbox'), card('Total enquiries', enq.length, 'fa-list'),
                    card('Closed deals', c(enq, x => x.status === 'closed'), 'fa-handshake')
                ]
            });
        }
        const mine = enquiries.filter(x => x.buyer_user_id === user.id);
        return json(res, 200, { cards: [card('My enquiries', mine.length, 'fa-inbox'), card('Awaiting reply', c(mine, x => x.status === 'new'), 'fa-clock'), card('Contacted', c(mine, x => x.status === 'contacted'), 'fa-phone'), card('Closed', c(mine, x => x.status === 'closed'), 'fa-circle-check')] });
    }

    throw bad('Not found', 404);
        }
const RFQ_JS = `
document.addEventListener('click', async e => {
  const lo = e.target.closest('#logoutBtn');
  if (lo) { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); location.href = '/'; return; }
  const open = e.target.closest('[data-rfq]');
  const modal = document.getElementById('rfq');
  if (open && modal) { document.getElementById('rfqProduct').value = open.dataset.rfq; document.getElementById('rfqTitle').textContent = open.dataset.title || ''; document.getElementById('rfqMsg').textContent = ''; modal.classList.remove('hidden'); modal.classList.add('flex'); }
  if (modal && (e.target.id === 'rfq' || e.target.closest('#rfqClose'))) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
});
const rf = document.getElementById('rfqForm');
if (rf) rf.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(rf), msg = document.getElementById('rfqMsg');
  const body = Object.fromEntries(f.entries());
  const r = await fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  msg.className = 'text-xs mt-2 ' + (r.ok ? 'text-emerald-700' : 'text-red-600');
  msg.textContent = r.ok ? 'Request sent! Reference: ' + d.id : (d.error || 'Failed to send');
  if (r.ok) rf.reset();
});`;

function layout(title, content, user, opts = {}) {
    const rfq = opts.rfq ? `
    <div id="rfq" class="hidden fixed inset-0 bg-black/50 z-50 items-center justify-center p-4">
      <form id="rfqForm" class="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl text-xs space-y-2">
        <div class="flex justify-between items-center"><h3 class="font-bold text-sm">Request Quotation</h3><button type="button" id="rfqClose" class="text-slate-400 text-lg">&times;</button></div>
        <p id="rfqTitle" class="text-slate-500"></p>
        <input type="hidden" name="product_id" id="rfqProduct">
        <input name="buyer_name" required maxlength="80" placeholder="Your name" value="${esc(user ? user.name : '')}" class="w-full border rounded p-2">
        <input name="buyer_phone" required placeholder="Mobile number" value="${esc(user ? user.phone : '')}" class="w-full border rounded p-2">
        <input name="quantity" type="number" min="1" required placeholder="Quantity" class="w-full border rounded p-2">
        <input name="city" maxlength="60" placeholder="Your city" class="w-full border rounded p-2">
        <textarea name="requirements" maxlength="500" placeholder="Requirements (optional)" class="w-full border rounded p-2"></textarea>
        <button class="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700">Send Request</button>
        <p id="rfqMsg" class="text-xs mt-2"></p>
      </form>
    </div>` : '';
    const nav = user
        ? `<a href="/dashboard" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700">${esc(ROLE_LABEL[user.role])} Dashboard</a><button id="logoutBtn" class="hover:text-red-600">Logout</button>`
        : `<a href="/login" class="hover:text-emerald-700">Login</a><a href="/register" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700">Register</a>`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)} | Connect Business World</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      html.dark body{background:#0f172a!important;color:#f8fafc!important}
      html.dark .bg-white{background:#111827!important;color:#f8fafc!important}
      html.dark .bg-slate-50{background:#0f172a!important}
      html.dark .text-slate-900,html.dark .text-slate-800,html.dark .text-slate-700,html.dark .text-slate-600{color:#f8fafc!important}
      html.dark .text-slate-500,html.dark .text-slate-400{color:#cbd5e1!important}
      html.dark .border,html.dark .border-b,html.dark .border-t{border-color:#334155!important}
      html.dark input,html.dark textarea,html.dark select{background:#0f172a!important;color:#f8fafc!important;border-color:#475569!important}
      html.dark .bg-slate-100{background:#1e293b!important;color:#f8fafc!important}
    </style>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    </head><body class="bg-slate-50 text-slate-800 antialiased flex flex-col min-h-screen">
    <header class="bg-emerald-950 text-white py-2 px-4 text-xs border-b border-slate-800">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <span>🇮🇳 <b>Connect Business World</b> &bull; Unified B2B &amp; B2C Marketplace</span>
            <span class="hidden sm:inline">Toll-Free: 1800-200-9898 &bull; INR (₹)</span>
        </div>
    </header>
    <nav class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm px-4 py-3">
        <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <a href="/" class="flex items-center space-x-2">
                <span class="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-lg">CBW</span>
                <span class="text-xl font-extrabold text-slate-900">Connect<span class="text-emerald-600">Business World</span></span>
            </a>
            <div class="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
                <button id="themeToggle" type="button" class="border rounded-lg px-2 py-1" aria-label="Toggle light and dark mode">🌙 / ☀️</button>
                <a href="/" class="hover:text-emerald-700">Home</a>
                <a href="/directory" class="hover:text-emerald-700">Directory</a>
                <a href="/b2b" class="hover:text-emerald-700">B2B Wholesale</a>
                <a href="/marketplace" class="hover:text-emerald-700">Retail</a>
                ${nav}
            </div>
        </div>
    </nav>
    <main class="flex-1">${content}</main>
    <footer class="bg-emerald-950 text-slate-400 text-xs py-8 px-4 border-t border-slate-800 mt-12 text-center">
        <p>&copy; 2026 Connect Business World. Make in India 🇮🇳 &bull; GST &amp; MSME Compliant</p>
    </footer>
    <a href="https://wa.me/919811122233" target="_blank" rel="noopener" class="fixed bottom-5 right-5 bg-emerald-600 hover:bg-emerald-700 text-white w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-2xl z-30"><i class="fa-brands fa-whatsapp"></i></a>
    ${rfq}
    <script>
    (()=>{const saved=localStorage.getItem('cbw-theme');if(saved==='dark')document.documentElement.classList.add('dark');
    document.addEventListener('click',e=>{if(e.target.closest('#themeToggle')){document.documentElement.classList.toggle('dark');localStorage.setItem('cbw-theme',document.documentElement.classList.contains('dark')?'dark':'light');}});})();
    </script>
    <script>${RFQ_JS}</script>
    ${opts.script || ''}
    </body></html>`;
}

const activeLocIds = () => new Set(locations.filter(l => l.status === 'active').map(l => l.id));
const publicBusinesses = () => businesses.filter(b => b.status === 'active' && (!b.location_id || activeLocIds().has(b.location_id)));
const publicProducts = () => { const ids = new Set(publicBusinesses().map(b => b.id)); return products.filter(p => p.status === 'active' && ids.has(p.business_id)); };

const bizCard = b => `
    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div class="flex justify-between items-start mb-2 gap-2">
            <h3 class="font-bold text-sm text-slate-900">${esc(b.business_name)}</h3>
            ${b.verified ? '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">Verified</span>' : ''}
        </div>
        <p class="text-xs text-slate-500 mb-4">${esc(b.category)} &bull; ${esc(cityOf(b.location_id))}${b.gstin ? ' &bull; GST: ' + esc(b.gstin) : ''}${b.rating ? ' &bull; ⭐ ' + b.rating : ''}</p>
        <div class="flex space-x-2 text-xs">
            ${b.phone ? `<a href="tel:${esc(b.phone.replace(/\s/g, ''))}" class="flex-1 bg-slate-100 text-center py-2 rounded font-bold hover:bg-slate-200"><i class="fa-solid fa-phone mr-1"></i> Call</a>` : ''}
            ${b.whatsapp ? `<a href="https://wa.me/${esc(b.whatsapp)}" target="_blank" rel="noopener" class="flex-1 bg-emerald-600 text-white text-center py-2 rounded font-bold hover:bg-emerald-700"><i class="fa-brands fa-whatsapp mr-1"></i> WhatsApp</a>` : ''}
        </div>
    </div>`;

const prodCard = (p, mode) => {
    const biz = findBiz(p.business_id), price = mode === 'retail' ? p.retail_price : p.wholesale_price;
    return `
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between">
        <div>
            ${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.title)}" loading="lazy" class="w-full h-44 object-cover">` : '<div class="w-full h-44 bg-slate-100 flex items-center justify-center text-slate-300 text-4xl"><i class="fa-solid fa-box"></i></div>'}
            <div class="p-4">
                <span class="text-[10px] text-emerald-700 font-bold uppercase">${esc(biz ? biz.business_name : '')}</span>
                <h4 class="font-bold text-sm text-slate-900 mt-1">${esc(p.title)}</h4>
                <p class="text-emerald-700 font-extrabold text-base mt-2">₹${price.toLocaleString('en-IN')} <span class="text-xs text-slate-400 font-normal">${mode === 'retail' ? '' : '/ MOQ: ' + p.moq} &bull; Stock: ${p.stock}</span></p>
            </div>
        </div>
        <div class="p-4 pt-0"><button data-rfq="${esc(p.id)}" data-title="${esc(p.title)}" class="w-full bg-emerald-600 text-white py-2 rounded font-bold text-xs hover:bg-emerald-700">${mode === 'retail' ? 'Enquire to Buy' : 'Request Quotation (RFQ)'}</button></div>
    </div>`;
};

function homePage(user) {
    const pb = publicBusinesses(), pp = publicProducts();
    return layout('Home', `
        <section class="bg-gradient-to-r from-[#0a1128] to-blue-950 text-white py-14 px-4 text-center">
            <h1 class="text-3xl sm:text-4xl font-extrabold mb-3">Search. Connect. Trade in India.</h1>
            <p class="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto mb-6">${pb.length} listed businesses &bull; ${pp.length} products &bull; ${locations.filter(l => l.status === 'active').length} cities</p>
            <form action="/directory" class="max-w-xl mx-auto flex bg-white rounded-lg p-1.5 shadow-xl text-slate-800 text-xs">
                <input type="text" name="city" list="cities" placeholder="City" class="w-1/3 p-2 outline-none border-r border-slate-200">
                <datalist id="cities">${locations.filter(l => l.status === 'active').map(l => `<option value="${esc(l.city)}">`).join('')}</datalist>
                <input type="text" name="search" placeholder="Search machines, LED, fabrics..." class="flex-1 p-2 outline-none">
                <button class="bg-emerald-600 text-white px-5 py-2 font-bold rounded hover:bg-emerald-700">Search</button>
            </form>
        </section>
        <section class="max-w-6xl mx-auto px-4 py-10">
            <h2 class="text-xl font-bold mb-6 text-slate-900">Featured Manufacturers &amp; Suppliers</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">${pb.slice(0, 6).map(bizCard).join('') || '<p class="text-xs text-slate-500">No businesses listed yet.</p>'}</div>
            <h2 class="text-xl font-bold mb-6 text-slate-900">Trending B2B Wholesale Deals</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">${pp.slice(0, 6).map(p => prodCard(p, 'wholesale')).join('') || '<p class="text-xs text-slate-500">No products yet.</p>'}</div>
        </section>`, user, { rfq: true });
}

function directoryPage(user, q) {
    const city = (q.get('city') || '').toLowerCase(), s = (q.get('search') || '').toLowerCase();
    const list = publicBusinesses().filter(b => (!city || cityOf(b.location_id).toLowerCase().includes(city)) && (!s || b.business_name.toLowerCase().includes(s) || b.category.toLowerCase().includes(s)));
    return layout('Directory', `
        <div class="max-w-6xl mx-auto px-4 py-8">
            <h1 class="text-2xl font-bold mb-4">India Business Directory</h1>
            <form class="flex gap-2 mb-6 text-xs"><input name="city" value="${esc(q.get('city') || '')}" placeholder="City" class="border rounded p-2 w-40"><input name="search" value="${esc(q.get('search') || '')}" placeholder="Name or category" class="border rounded p-2 flex-1"><button class="bg-emerald-600 text-white px-4 rounded font-bold">Filter</button></form>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${list.map(bizCard).join('') || '<p class="text-xs text-slate-500">No results.</p>'}</div>
        </div>`, user);
}

function shopPage(user, mode) {
    return layout(mode === 'retail' ? 'Retail Marketplace' : 'B2B Wholesale', `
        <div class="max-w-6xl mx-auto px-4 py-8">
            <h1 class="text-2xl font-bold mb-6">${mode === 'retail' ? 'Retail Marketplace' : 'B2B Wholesale Portal'}</h1>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">${publicProducts().map(p => prodCard(p, mode)).join('') || '<p class="text-xs text-slate-500">No products yet.</p>'}</div>
        </div>`, user, { rfq: true });
}

function loginPage(user) {
    return layout('Login', `
        <div class="max-w-sm mx-auto px-4 py-12">
            <h1 class="text-2xl font-bold mb-4">Login</h1>
            <form id="lf" class="bg-white border rounded-xl p-5 space-y-3 text-xs shadow-sm">
                <input name="email" type="email" required placeholder="Email" class="w-full border rounded p-2">
                <input name="password" type="password" required placeholder="Password" class="w-full border rounded p-2">
                <button class="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700">Login</button>
                <p id="lm" class="text-red-600"></p>
                <p class="text-slate-500">New here? <a class="text-emerald-700 font-bold" href="/register">Create an account</a></p>
            </form>
        </div>`, user, {
        script: `<script>document.getElementById('lf').addEventListener('submit',async e=>{e.preventDefault();
        const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
        const d=await r.json().catch(()=>({}));if(r.ok)location.href='/dashboard';else document.getElementById('lm').textContent=d.error||'Login failed';});</script>`
    });
}

function registerPage(user) {
    return layout('Register', `
        <div class="max-w-md mx-auto px-4 py-12">
            <h1 class="text-2xl font-bold mb-4">Create account</h1>
            <form id="rf" class="bg-white border rounded-xl p-5 space-y-3 text-xs shadow-sm">
                <select name="role" id="rrole" class="w-full border rounded p-2">
                    <option value="buyer">Buyer</option><option value="manufacturer">Manufacturer</option><option value="supplier">Supplier</option><option value="seller">Seller</option><option value="business_owner">Business Owner</option><option value="merchant">Merchant</option>
                </select>
                <input name="name" required placeholder="Full name" class="w-full border rounded p-2">
                <input name="email" type="email" required placeholder="Email" class="w-full border rounded p-2">
                <input name="phone" placeholder="Mobile" class="w-full border rounded p-2">
                <select name="location_id" class="w-full border rounded p-2"><option value="">Select city</option>${locations.filter(l => l.status === 'active').map(l => `<option value="${esc(l.id)}">${esc(l.city)}, ${esc(l.state)}</option>`).join('')}</select>
                <input name="password" type="password" minlength="8" required placeholder="Password (min 8 chars)" class="w-full border rounded p-2">
                <div id="vf" class="hidden space-y-3">
                    <input name="business_name" placeholder="Business name" class="w-full border rounded p-2">
                    <input name="category" placeholder="Business category" class="w-full border rounded p-2">
                    <input name="gstin" placeholder="GSTIN (optional)" class="w-full border rounded p-2">
                    <p class="text-slate-500">Business accounts are activated after admin approval.</p>
                </div>
                <button class="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700">Register</button>
                <p id="rm" class="text-red-600"></p>
            </form>
        </div>`, user, {
        script: `<script>const role=document.getElementById('rrole'),vf=document.getElementById('vf');
        role.addEventListener('change',()=>vf.classList.toggle('hidden',role.value==='buyer'));
        document.getElementById('rf').addEventListener('submit',async e=>{e.preventDefault();const m=document.getElementById('rm');
        const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
        const d=await r.json().catch(()=>({}));
        if(r.ok){m.className='text-emerald-700';m.textContent=d.pending?'Registered! Wait for admin approval, then log in.':'Registered! Redirecting to login...';if(!d.pending)setTimeout(()=>location.href='/login',900);}
        else{m.className='text-red-600';m.textContent=d.error||'Registration failed';}});</script>`
    });
                    }
function clientApp() {
    const ADMINS = ['super_admin', 'admin'], VENDORS = ['manufacturer', 'business_owner', 'merchant', 'supplier', 'seller'];
    const RL = { super_admin: 'Super Admin', admin: 'Admin', employee: 'Employee', manufacturer: 'Manufacturer', business_owner: 'Business Owner', merchant: 'Merchant', supplier: 'Supplier', seller: 'Seller', buyer: 'Buyer' };
    const root = document.getElementById('app');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let me = null, view = 'overview', data = {}, filter = '', locs = [], bizs = [];
    const isAdm = () => ADMINS.includes(me.role), isVen = () => VENDORS.includes(me.role);

    async function api(method, path, body) {
        const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { location.href = '/login'; throw new Error('Please log in'); }
        if (!r.ok) throw new Error(d.error || 'Request failed');
        return d;
    }
    function toast(msg, err) {
        const t = document.createElement('div');
        t.className = 'fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg text-xs font-bold text-white shadow-lg ' + (err ? 'bg-red-600' : 'bg-emerald-600');
        t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
    }

    const menu = () => isAdm()
        ? [['overview', 'Overview', 'fa-gauge'], ['users', 'Users', 'fa-users'], ['locations', 'Locations', 'fa-location-dot'], ['categories', 'Categories', 'fa-layer-group'], ['businesses', 'Businesses', 'fa-building'], ['products', 'Products', 'fa-box'], ['enquiries', 'Enquiries', 'fa-inbox'], ['social-links', 'Social Links', 'fa-share-nodes'], ['profile', 'My Profile', 'fa-user']]
        : isVen()
            ? (me.role === 'supplier' ? [['overview', 'Supplier Overview', 'fa-gauge'], ['businesses', 'Company Profile', 'fa-building'], ['products', 'Product Catalogue & Stock', 'fa-boxes-stacked'], ['enquiries', 'Buyer Enquiries & Quotes', 'fa-file-invoice-dollar'], ['social-links', 'Social Links & QR', 'fa-share-nodes'], ['profile', 'Account Settings', 'fa-user']] : [['overview', 'Overview', 'fa-gauge'], ['businesses', 'My Business', 'fa-building'], ['products', 'My Products', 'fa-box'], ['enquiries', 'Enquiries', 'fa-inbox'], ['social-links', 'Social Links', 'fa-share-nodes'], ['profile', 'My Profile', 'fa-user']])
            : [['overview', 'Overview', 'fa-gauge'], ['enquiries', 'My Enquiries', 'fa-inbox'], ['profile', 'My Profile', 'fa-user']];

    const STATUS_OPTS = { users: ['active', 'pending', 'blocked'], businesses: ['active', 'pending', 'blocked'], locations: ['active', 'inactive'], products: ['active', 'inactive'], enquiries: ['new', 'contacted', 'closed'], categories: ['active','inactive'] };
    const so = k => STATUS_OPTS[k].map(v => [v, v[0].toUpperCase() + v.slice(1)]);
    const locOpts = () => [['', '— none —'], ...locs.map(l => [l.id, l.city + ', ' + l.state])];
    const roleOpts = () => (me.role === 'super_admin' ? Object.keys(RL) : ['merchant', 'supplier', 'seller', 'buyer']).map(r => [r, RL[r]]);

    const COLS = {
        categories: [['name','Name'],['slug','Slug'],['parent_id','Parent ID'],['status','Status']],
        'social-links': [['platform','Platform'],['label','Label'],['url','URL'],['business_id','Business']],
        users: [['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['status', 'Status'], ['city', 'Location'], ['business_name', 'Business']],
        locations: [['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'], ['status', 'Status']],
        businesses: [['business_name', 'Business'], ['category', 'Category'], ['city', 'Location'], ['gstin', 'GSTIN'], ['verified', 'Verified'], ['status', 'Status']],
        products: [['title', 'Product'], ['business_name', 'Business'], ['wholesale_price', 'Wholesale'], ['retail_price', 'Retail'], ['moq', 'MOQ'], ['stock', 'Stock'], ['status', 'Status']],
        enquiries: [['created_at', 'Date'], ['buyer_name', 'Buyer'], ['buyer_phone', 'Phone'], ['product_title', 'Product'], ['business_name', 'Business'], ['quantity', 'Qty'], ['supplier_quote', 'Your Quote (₹)'], ['delivery_days', 'Delivery Days'], ['status', 'Status']]
    };
    const FIELDS = {
        categories: row => [{ k: 'name', l: 'Category name', req: 1 }, { k: 'slug', l: 'Slug' }, { k: 'parent_id', l: 'Parent category ID (optional)' }, { k: 'description', l: 'Description' }, { k: 'image_url', l: 'Image URL' }, { k: 'status', l: 'Status', opts: so('categories') }],
        'social-links': row => [{ k: 'platform', l: 'Platform', opts: [['whatsapp','WhatsApp'],['instagram','Instagram'],['facebook','Facebook'],['youtube','YouTube'],['linkedin','LinkedIn'],['x','X'],['telegram','Telegram'],['website','Website'],['google_maps','Google Maps'],['email','Email'],['other','Other']], req: 1 }, { k: 'label', l: 'Label' }, { k: 'url', l: 'URL / WhatsApp digits', req: 1 }],
        users: row => [
            { k: 'name', l: 'Full name', req: 1 }, { k: 'email', l: 'Email', type: 'email', req: 1 }, { k: 'phone', l: 'Phone' },
            { k: 'role', l: 'Role', opts: roleOpts(), req: 1 }, { k: 'status', l: 'Status', opts: so('users') }, { k: 'location_id', l: 'Location', opts: locOpts() },
            { k: 'password', l: row ? 'New password (blank = keep)' : 'Password', type: 'password', req: !row },
            ...(row ? [] : [{ k: 'business_name', l: 'Business name (vendor roles)' }, { k: 'category', l: 'Business category (vendor roles)' }])
        ],
        locations: () => [{ k: 'city', l: 'City', req: 1 }, { k: 'state', l: 'State', req: 1 }, { k: 'pincode', l: 'Pincode (6 digits)' }, { k: 'status', l: 'Status', opts: so('locations') }],
        businesses: () => [
            { k: 'business_name', l: 'Business name', req: 1 }, { k: 'category', l: 'Category', req: 1 }, { k: 'location_id', l: 'Location', opts: locOpts() },
            { k: 'phone', l: 'Phone' }, { k: 'whatsapp', l: 'WhatsApp (digits, with 91)' }, { k: 'gstin', l: 'GSTIN' },
            ...(isAdm() ? [{ k: 'status', l: 'Status', opts: so('businesses') }, { k: 'verified', l: 'Verified', opts: [['0', 'No'], ['1', 'Yes']] }] : [])
        ],
        products: () => [
            ...(isAdm() ? [{ k: 'business_id', l: 'Business', opts: bizs.map(b => [b.id, b.business_name]), req: 1 }] : []),
            { k: 'title', l: 'Product title', req: 1 }, { k: 'category', l: 'Category' },
            { k: 'wholesale_price', l: 'Wholesale price (₹)', type: 'number', req: 1 }, { k: 'retail_price', l: 'Retail price (₹)', type: 'number', req: 1 },
            { k: 'moq', l: 'MOQ', type: 'number', req: 1 }, { k: 'stock', l: 'Stock', type: 'number', req: 1 },
            { k: 'img', l: 'Image URL (https://…)' }, { k: 'status', l: 'Status', opts: so('products') }
        ],
        enquiries: () => [{ k: 'supplier_quote', l: 'Your quotation price (₹)', type: 'number' }, { k: 'supplier_message', l: 'Message / quotation details' }, { k: 'delivery_days', l: 'Delivery time (days)', type: 'number' }, { k: 'quote_valid_until', l: 'Quote valid until (YYYY-MM-DD)' }, { k: 'status', l: 'Enquiry status', opts: so('enquiries') }]
    };

    const can = (k, act, r) => {
        if (k === 'users') { if (!isAdm()) return false; if (!r) return act === 'add'; if (me.role === 'admin' && ADMINS.includes(r.role)) return false; return act === 'delete' || act === 'status' ? r.id !== me.id : true; }
        if (k === 'locations' || k === 'categories') return isAdm();
        if (k === 'social-links') return true;
        if (k === 'businesses') return act === 'add' ? false : act === 'delete' ? isAdm() : act === 'status' ? isAdm() : true;
        if (k === 'products') return isAdm() || isVen();
        if (k === 'enquiries') return act === 'delete' ? isAdm() : act === 'add' ? false : (isAdm() || isVen());
        return false;
    };

    const badge = v => {
        const c = { active: 'emerald', closed: 'slate', contacted: 'blue', new: 'amber', pending: 'amber', blocked: 'red', inactive: 'slate' }[v] || 'slate';
        return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-${c}-100 text-${c}-800">${esc(v)}</span>`;
    };
    function cell(r, k) {
        const v = r[k];
        if (k === 'status') return badge(v);
        if (k === 'role') return esc(RL[v] || v);
        if (k === 'verified') return v ? '<i class="fa-solid fa-circle-check text-emerald-600"></i>' : '—';
        if (k === 'wholesale_price' || k === 'retail_price') return '₹' + Number(v).toLocaleString('en-IN');
        if (k === 'created_at') return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        return esc(v);
    }
    const btn = (cls, act, k, id, label, val) => `<button data-act="${act}" data-k="${k}" data-id="${esc(id)}" ${val !== undefined ? `data-val="${val}"` : ''} class="px-2 py-1 rounded text-[11px] font-bold ${cls}">${label}</button>`;
    function actions(k, r) {
        const a = [];
        if (can(k, 'edit', r) && FIELDS[k]) a.push(btn('bg-slate-100 hover:bg-slate-200', 'edit', k, r.id, k === 'enquiries' ? 'Update' : 'Edit'));
        if (can(k, 'status', r) || (k === 'products' && can(k, 'edit', r)) || (k === 'enquiries' && can(k, 'edit', r))) {
            const s = r.status;
            const nxt = { users: s === 'pending' ? ['active', 'Approve'] : s === 'active' ? ['blocked', 'Block'] : ['active', 'Activate'], businesses: s === 'pending' ? ['active', 'Approve'] : s === 'active' ? ['blocked', 'Block'] : ['active', 'Activate'], locations: s === 'active' ? ['inactive', 'Disable'] : ['active', 'Enable'], products: s === 'active' ? ['inactive', 'Disable'] : ['active', 'Enable'], enquiries: s === 'new' ? ['contacted', 'Contacted'] : s === 'contacted' ? ['closed', 'Close'] : ['new', 'Reopen'] }[k];
            if (nxt && !(k === 'businesses' && !isAdm())) a.push(btn('bg-emerald-50 text-emerald-700 hover:bg-blue-100', 'status', k, r.id, nxt[1], nxt[0]));
        }
        if (k === 'businesses' && isAdm()) a.push(btn('bg-emerald-50 text-emerald-700 hover:bg-emerald-100', 'verify', k, r.id, r.verified ? 'Unverify' : 'Verify', r.verified ? 0 : 1));
        if (can(k, 'delete', r)) a.push(btn('bg-red-50 text-red-700 hover:bg-red-100', 'delete', k, r.id, 'Delete'));
        return a.join(' ');
    }

    function shell() {
        root.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row gap-6">
        <aside class="md:w-56 shrink-0">
          <div class="bg-white border rounded-xl p-4 mb-3 text-xs"><div class="font-bold text-sm">${esc(me.name)}</div><div class="text-slate-500">${esc(RL[me.role])}</div><div class="text-slate-400 truncate">${esc(me.email)}</div></div>
          <nav class="bg-white border rounded-xl p-2 flex md:flex-col flex-wrap gap-1 text-xs font-bold">
            ${menu().map(([v, l, i]) => `<button data-view="${v}" class="nav text-left px-3 py-2 rounded-lg hover:bg-slate-100 ${v === view ? 'bg-emerald-600 text-white hover:bg-emerald-600' : ''}"><i class="fa-solid ${i} w-4 mr-1"></i>${l}</button>`).join('')}
            <button id="lo" class="text-left px-3 py-2 rounded-lg hover:bg-red-50 text-red-600"><i class="fa-solid fa-right-from-bracket w-4 mr-1"></i>Logout</button>
          </nav></aside>
        <section class="flex-1 min-w-0" id="panel"></section></div>`;
    }
    const panel = () => document.getElementById('panel');

    async function refs() {
        if (isAdm() || isVen()) locs = await api('GET', '/locations');
        else locs = await api('GET', '/locations');
        if (isAdm()) bizs = await api('GET', '/businesses');
    }

    async function show(v) {
        view = v; filter = ''; shell(); panel().innerHTML = '<p class="text-xs text-slate-500">Loading…</p>';
        try {
            await refs();
            if (v === 'overview') return await overview();
            if (v === 'profile') return profile();
            data[v] = await api('GET', '/' + v);
            renderList(v);
        } catch (e) { panel().innerHTML = `<p class="text-xs text-red-600">${esc(e.message)}</p>`; }
    }

    async function overview() {
        const s = await api('GET', '/stats');
        panel().innerHTML = `<h1 class="text-xl font-bold mb-4">${esc(me.role === 'supplier' ? 'Supplier Centre' : RL[me.role] + ' Dashboard')}</h1>
        ${me.role === 'supplier' ? '<p class="text-sm text-slate-500 mb-4">Manage your company profile, product catalogue, inventory, buyer enquiries, quotations and social links from one place.</p>' : ''}
        ${s.notice ? `<div class="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3">${esc(s.notice)}</div>` : ''}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${s.cards.map(c => `<div class="bg-white border rounded-xl p-4 shadow-sm"><i class="fa-solid ${c.icon} text-emerald-700 mb-2"></i><div class="text-2xl font-extrabold">${esc(c.value)}</div><div class="text-xs text-slate-500">${esc(c.label)}</div></div>`).join('')}</div>`;
    }

    function rowsHtml(k) {
        const f = filter.toLowerCase();
        const rows = (data[k] || []).filter(r => !f || JSON.stringify(r).toLowerCase().includes(f));
        if (!rows.length) return `<tr><td colspan="${COLS[k].length + 1}" class="p-4 text-slate-500">No records.</td></tr>`;
        return rows.map(r => `<tr class="border-t hover:bg-slate-50">${COLS[k].map(([c]) => `<td class="p-2 align-top">${cell(r, c)}</td>`).join('')}<td class="p-2 whitespace-nowrap space-x-1">${actions(k, r)}</td></tr>`).join('');
    }
    function renderList(k) {
        const titles = { users: 'Users', locations: 'Locations', categories: 'Categories & Subcategories', 'social-links': 'Social Media Links', businesses: isAdm() ? 'Businesses' : 'My Business', products: isAdm() ? 'Products' : 'My Products', enquiries: 'Enquiries' };
        panel().innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h1 class="text-xl font-bold">${titles[k]} <span class="text-xs text-slate-400 font-normal">(${(data[k] || []).length})</span></h1>
          <div class="flex gap-2"><input id="flt" placeholder="Search…" class="border rounded-lg px-3 py-1.5 text-xs">
          ${(can(k, 'add') || (k === 'products' && (isAdm() || isVen()))) ? `<button data-act="add" data-k="${k}" class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700"><i class="fa-solid fa-plus mr-1"></i>Add Product</button>` : ''}
        <div class="bg-white border rounded-xl overflow-x-auto shadow-sm"><table class="w-full text-xs"><thead class="bg-slate-50 text-left text-slate-500"><tr>${COLS[k].map(c => `<th class="p-2">${c[1]}</th>`).join('')}<th class="p-2">Actions</th></tr></thead><tbody id="tb">${rowsHtml(k)}</tbody></table></div>`;
        document.getElementById('flt').addEventListener('input', e => { filter = e.target.value; document.getElementById('tb').innerHTML = rowsHtml(k); });
    }

    function openForm(k, row) {
        const fields = FIELDS[k](row);
        const m = document.createElement('div');
        m.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
        m.innerHTML = `<form class="bg-white rounded-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl text-xs">
          <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-sm">${row ? 'Edit' : 'Add'} ${k.replace(/s$/, '')}</h3><button type="button" data-x class="text-slate-400 text-xl">&times;</button></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${fields.map(f => {
            const v = row ? (row[f.k] ?? '') : (f.k === 'status' ? (f.opts[0][0]) : '');
            const common = `name="${f.k}" ${f.req ? 'required' : ''} class="w-full border rounded p-2 mt-1"`;
            const inp = f.opts
                ? `<select ${common}>${f.opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`
                : `<input ${common} type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" min="0"' : ''} value="${f.type === 'password' ? '' : esc(v)}" autocomplete="off">`;
            return `<label class="block font-bold text-slate-600">${f.l}${f.req ? ' *' : ''}${inp}</label>`;
        }).join('')}</div>
          <p class="err text-red-600 mt-3"></p>
          <div class="flex justify-end gap-2 mt-4"><button type="button" data-x class="px-4 py-2 rounded-lg bg-slate-100 font-bold">Cancel</button><button class="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold">Save</button></div></form>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); });
        m.querySelector('form').addEventListener('submit', async e => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (row && body.password === '') delete body.password;
            try {
                await api(row ? 'PUT' : 'POST', '/' + k + (row ? '/' + row.id : ''), body);
                m.remove(); toast('Saved'); show(view);
            } catch (er) { m.querySelector('.err').textContent = er.message; }
        });
    }

    function profile() {
        panel().innerHTML = `<h1 class="text-xl font-bold mb-4">My Profile</h1>
        <form id="pf" class="bg-white border rounded-xl p-5 max-w-lg space-y-3 text-xs shadow-sm">
          <label class="block font-bold text-slate-600">Name<input name="name" value="${esc(me.name)}" required class="w-full border rounded p-2 mt-1"></label>
          <label class="block font-bold text-slate-600">Phone<input name="phone" value="${esc(me.phone)}" class="w-full border rounded p-2 mt-1"></label>
          <label class="block font-bold text-slate-600">Location<select name="location_id" class="w-full border rounded p-2 mt-1">${locOpts().map(([v, l]) => `<option value="${esc(v)}" ${v === (me.location_id || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <hr><p class="text-slate-500">Change password (optional)</p>
          <input name="current_password" type="password" placeholder="Current password" class="w-full border rounded p-2" autocomplete="current-password">
          <input name="new_password" type="password" placeholder="New password (min 8)" class="w-full border rounded p-2" autocomplete="new-password">
          <button class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold">Save</button> <span id="pm" class="text-red-600"></span></form>`;
        document.getElementById('pf').addEventListener('submit', async e => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.target).entries());
            if (!body.new_password) { delete body.new_password; delete body.current_password; }
            try { me = await api('PUT', '/me', body); toast('Profile updated'); show('profile'); } catch (er) { document.getElementById('pm').textContent = er.message; }
        });
    }

    root.addEventListener('click', async e => {
        const nav = e.target.closest('[data-view]');
        if (nav) return show(nav.dataset.view);
        if (e.target.closest('#lo')) { await api('POST', '/logout', {}); location.href = '/'; return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const { act, k, id, val } = b.dataset;
        try {
            if (act === 'add') return openForm(k, null);
            if (act === 'edit') return openForm(k, data[k].find(r => r.id === id));
            if (act === 'delete') { if (!confirm('Delete this record permanently?')) return; await api('DELETE', `/${k}/${id}`); toast('Deleted'); return show(view); }
            if (act === 'status') { await api('PUT', `/${k}/${id}`, { status: val }); toast('Status updated'); return show(view); }
            if (act === 'verify') { await api('PUT', `/${k}/${id}`, { verified: Number(val) }); toast('Updated'); return show(view); }
        } catch (er) { toast(er.message, true); }
    });

    (async () => {
        try { me = await api('GET', '/me'); } catch { return; }
        show('overview');
    })();
}

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url, 'http://localhost');
        const p = u.pathname, user = getUser(req);
        if (p.startsWith('/api/')) {
            const out = await api(req, res, p, user);
            if (req.method !== 'GET') saveSoon();
            return out;
        }
        if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Method not allowed');

        if (p === '/' || p === '/index.html') return page(res, homePage(user));
        if (p === '/directory') return page(res, directoryPage(user, u.searchParams));
        if (p === '/b2b') return page(res, shopPage(user, 'wholesale'));
        if (p === '/marketplace') return page(res, shopPage(user, 'retail'));
        if (p === '/login') return user ? redirect(res, '/dashboard') : page(res, loginPage(user));
        if (p === '/register') return user ? redirect(res, '/dashboard') : page(res, registerPage(user));
        if (p === '/dashboard' || p === '/seller') {
            if (!user) return redirect(res, '/login');
            return page(res, layout('Dashboard', '<div id="app"></div>', user, { script: `<script>(${clientApp.toString()})();</script>` }));
        }
        return redirect(res, '/');
    } catch (e) {
        const status = e.status || 500;
        if (status === 500) console.error(e);
        if (req.url.startsWith('/api/')) return json(res, status, { error: status === 500 ? 'Server error' : e.message });
        return send(res, status, 'text/plain', status === 500 ? 'Server error' : e.message);
    }
});
function redirect(res, to) { res.writeHead(302, { Location: to }); res.end(); }

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log('Business Connect live on port ' + PORT));
