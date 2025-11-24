import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { GoogleProvider } from './providers/google.js';
import { YelpProvider } from './providers/yelp.js';
import { OSMProvider } from './providers/osm.js';
import type { PlacesProvider } from './providers/provider.js';
import { summarizePlace } from './openai.js';
import { requireAuth, signToken } from './auth.js';
import bcryptjs from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const bcrypt = (bcryptjs as any).default ?? bcryptjs;

const app = express();
app.use(cors());
app.use(express.json());

const providerName = (process.env.PROVIDER || 'google') as 'google'|'yelp';
const primaryProvider: PlacesProvider = providerName === 'yelp' ? YelpProvider : GoogleProvider;


app.get('/api/health', (_req, res) => res.json({ ok: true }));
function optionalUserId(req: any): number | null {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return null;
        const payload: any = require('jsonwebtoken').verify(token, process.env.JWT_SECRET!);
        return Number(payload.sub) || null;
    } catch { return null; }
}

// Auth
app.post('/api/auth/register', async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const { email, password } = body.data;
    const hash = await bcrypt.hash(password, 10);
    try {
        const [r] = await pool.query('INSERT INTO users (email, password_hash) VALUES (:email, :hash)', { email, hash });
        const id = (r as any).insertId as number;
        await pool.query('INSERT INTO preferences (user_id, max_miles, cuisine_csv) VALUES (:id, 5.00, NULL)', { id });
        return res.json({ token: signToken(id) });
    } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
        return res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const { email, password } = body.data;
    const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE email = :email', { email });
    const row = (rows as any[])[0];
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    return res.json({ token: signToken(row.id) });
});

// Preferences
app.put('/api/preferences', requireAuth, async (req: any, res) => {
    const body = z.object({ max_miles: z.number().min(0.1).max(50), cuisines: z.array(z.string().min(2)).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const { max_miles, cuisines } = body.data;
    await pool.query(
        'INSERT INTO preferences (user_id, max_miles, cuisine_csv) VALUES (:uid, :m, :c) ON DUPLICATE KEY UPDATE max_miles=:m, cuisine_csv=:c',
        { uid: req.userId, m: max_miles, c: cuisines?.join(',') || null }
    );
    res.json({ ok: true });
});

// Pick + persist for logged-in users
app.post('/api/pick', async (req: any, res) => {
    const schema = z.object({ lat: z.number(), lng: z.number(), miles: z.number().min(0.5).max(50), cuisines: z.array(z.string()).optional(), excludeProviderIds: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { lat, lng, miles, cuisines, excludeProviderIds } = parsed.data;

    let places = await primaryProvider.searchNearby({ lat, lng, miles, cuisines: cuisines?.map(c => c.toLowerCase()) });

    if (places.length === 0 && process.env.OSM_FALLBACK !== '0') {
        const osm = await OSMProvider.searchNearby({ lat, lng, miles, cuisines: cuisines?.map(c => c.toLowerCase()) });
        places = osm;
    }    const filtered = places.filter(p => !excludeProviderIds?.includes(p.providerId));
    if (filtered.length === 0) return res.json({ primary: null, backups: [] });

    const shuffled = filtered.sort(() => Math.random() - 0.5);
    const [primary, b1, b2] = [shuffled[0], shuffled[1], shuffled[2]];


    async function upsertAndEnrich(p?: any) {
        if (!p) return null as any;
        const desc = await summarizePlace(p.name, p.description);
        const [r] = await pool.query(
            'INSERT INTO places (provider, provider_id, name, address, lat, lng, rating, cuisine_csv, description) VALUES (:pr, :pid, :n, :a, :lat, :lng, :rat, :c, :d) ON DUPLICATE KEY UPDATE name=:n, address=:a, lat=:lat, lng=:lng, rating=:rat, cuisine_csv=:c, description=:d',
            { pr: p.provider, pid: p.providerId, n: p.name, a: p.address || null, lat: p.lat || null, lng: p.lng || null, rat: p.rating || null, c: (p.cuisines || []).join(','), d: desc || null }
        );
        const placeId = (r as any).insertId || (await pool.query('SELECT id FROM places WHERE provider=:pr AND provider_id=:pid', { pr: p.provider, pid: p.providerId }).then((x: any) => x[0][0]?.id));
        return { ...p, description: desc, placeId };
    }
    const [P, B1, B2] = await Promise.all([upsertAndEnrich(primary), upsertAndEnrich(b1), upsertAndEnrich(b2)]);

    const uid = optionalUserId(req);
    if (uid && P?.placeId) {
        await pool.query('INSERT INTO choices (user_id, primary_place_id, backup1_place_id, backup2_place_id, lat, lng, miles, cuisines_csv) VALUES (:u,:p,:b1,:b2,:lat,:lng,:m,:c)',
            { u: uid, p: P.placeId, b1: B1?.placeId || null, b2: B2?.placeId || null, lat, lng, m: miles, c: (cuisines || []).join(',') || null });
    }

    res.json({ primary: P, backups: [B1, B2].filter(Boolean) });
});

// Favorites & dislikes
app.post('/api/favorites/:placeId', requireAuth, async (req: any, res) => {
    const placeId = Number(req.params.placeId);
    await pool.query('INSERT IGNORE INTO favorites (user_id, place_id) VALUES (:u, :p)', { u: req.userId, p: placeId });
    res.json({ ok: true });
});
app.delete('/api/favorites/:placeId', requireAuth, async (req: any, res) => {
    const placeId = Number(req.params.placeId);
    await pool.query('DELETE FROM favorites WHERE user_id=:u AND place_id=:p', { u: req.userId, p: placeId });
    res.json({ ok: true });
});
app.get('/api/favorites', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query('SELECT p.* FROM favorites f JOIN places p ON p.id = f.place_id WHERE f.user_id=:u ORDER BY f.created_at DESC', { u: req.userId });
    res.json(rows);
});
app.post('/api/dislikes', requireAuth, async (req: any, res) => {
    const body = z.object({
        provider: z.enum(['google','yelp','osm']),
        providerId: z.string()
    }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const { provider, providerId } = body.data;
    await pool.query('INSERT IGNORE INTO dislikes (user_id, provider, provider_id) VALUES (:u, :pr, :pid)', { u: req.userId, pr: provider, pid: providerId });
    res.json({ ok: true });
});

// History
app.get('/api/choices', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query(
        `SELECT c.id, c.created_at,
                p.name AS primary_name, p.address AS primary_address, p.rating AS primary_rating,
                b1.name AS b1_name, b2.name AS b2_name
         FROM choices c
                  JOIN places p  ON p.id = c.primary_place_id
                  LEFT JOIN places b1 ON b1.id = c.backup1_place_id
                  LEFT JOIN places b2 ON b2.id = c.backup2_place_id
         WHERE c.user_id=:u
         ORDER BY c.created_at DESC
             LIMIT 50`,
        { u: req.userId }
    );
    res.json(rows);
});

// Group create/fetch/vote
app.post('/api/group', async (req: any, res) => {
    const body = z.object({ primaryPlaceId: z.number(), backup1PlaceId: z.number().nullable().optional(), backup2PlaceId: z.number().nullable().optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const { primaryPlaceId, backup1PlaceId, backup2PlaceId } = body.data;
    const slug = crypto.randomBytes(8).toString('hex');
    const uid = optionalUserId(req);
    await pool.query('INSERT INTO groups (slug, creator_user_id, primary_place_id, backup1_place_id, backup2_place_id) VALUES (:slug,:u,:p,:b1,:b2)',
        { slug, u: uid, p: primaryPlaceId, b1: backup1PlaceId || null, b2: backup2PlaceId || null });
    res.json({ slug });
});
app.get('/api/group/:slug', async (req, res) => {
    const slug = String(req.params.slug);
    const [rows] = await pool.query(
        `SELECT g.id, g.slug,
                p.name  AS primary_name, p.address AS primary_address, p.rating AS primary_rating, p.id AS primary_id,
                b1.name AS b1_name, b1.id AS b1_id,
                b2.name AS b2_name, b2.id AS b2_id
         FROM groups g
                  JOIN places p  ON p.id = g.primary_place_id
                  LEFT JOIN places b1 ON b1.id = g.backup1_place_id
                  LEFT JOIN places b2 ON b2.id = g.backup2_place_id
         WHERE g.slug=:slug
             LIMIT 1`,
        { slug }
    );
    const g = (rows as any[])[0];
    if (!g) return res.status(404).json({ error: 'not found' });
    const [votes] = await pool.query('SELECT choice, COUNT(*) as c FROM group_votes WHERE group_id=:gid GROUP BY choice', { gid: g.id });
    res.json({ group: g, votes });
});
app.post('/api/group/:slug/vote', async (req: any, res) => {
    const body = z.object({ choice: z.enum(['primary','b1','b2']), voterToken: z.string().min(8).max(64).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const slug = String(req.params.slug);
    const token = body.data.voterToken || crypto.randomBytes(12).toString('hex');
    const [rows] = await pool.query('SELECT id FROM groups WHERE slug=:slug LIMIT 1', { slug });
    const g = (rows as any[])[0];
    if (!g) return res.status(404).json({ error: 'not found' });
    await pool.query('INSERT IGNORE INTO group_votes (group_id, choice, voter_token) VALUES (:gid,:ch,:vt)', { gid: g.id, ch: body.data.choice, vt: token });
    res.json({ ok: true, voterToken: token });
});


app.listen(process.env.PORT || 3001, () => { console.log(`API up on ${process.env.PORT || 3001}`); });

