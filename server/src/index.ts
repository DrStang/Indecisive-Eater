import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { GoogleProvider } from './providers/google.js';
import { YelpProvider } from './providers/yelp.js';
import { OSMProvider } from './providers/osm.js';
import { FoursquareProvider } from './providers/foursquare.js';
import type { PlacesProvider } from './providers/provider.js';
import { summarizePlace } from './openai.js';
import { requireAuth, signToken, optionalAuth } from './auth.js';
import bcryptjs from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
    filterByPreferences,
    weightByFavorites,
    getMLRecommendations,
    analyzeUserPatterns,
    getRecommendationReasons
} from './ml/recommender.js';

const bcrypt = (bcryptjs as any).default ?? bcryptjs;

const app = express();

const ORIGIN_WHITELIST = [
    'https://indecisive-eater.vercel.app',
    'http://localhost:3000',
];
const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(cors({
    origin(origin, cb) {
        if(!origin) return cb(null, false);
        const allowed = ORIGIN_WHITELIST.includes(origin) || VERCEL_PREVIEW_REGEX.test(origin);
        cb(null,allowed ? origin : false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
}));

app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const providerName = (process.env.PROVIDER || 'google') as 'google'|'yelp';
const primaryProvider: PlacesProvider = providerName === 'yelp' ? YelpProvider : GoogleProvider;


app.get('/api/health', async (_req, res) => {
    const started = Date.now();
    try {
        const [rows] = await pool.query('SELECT 1 AS ok');
        const dbMs = Date.now() - started;
        res.json({
            ok: true,
            time: new Date().toISOString(),
            provider: process.env.PROVIDER || 'google',
            db: { ok: rows && (rows as any)[0]?.ok === 1, latency_ms: dbMs },
        });
    } catch (err: any) {
        const dbMs = Date.now() - started;
        res.status(503).json({
            ok: false,
            time: new Date().toISOString(),
            provider: process.env.PROVIDER || 'google',
            db: { ok: false, latency_ms: dbMs, error: { message: err?.message } },
        });
    }
});
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
    const body = z.object({
        email: z.string().email(),
        password: z.string().min(6)
    }).safeParse(req.body);

    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const { email, password } = body.data;
    const hash = await bcrypt.hash(password, 10);

    try {
        const [r] = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)',
            [email, hash]
        );
        const id = (r as any).insertId as number;

        // Create default preferences
        await pool.query(
            'INSERT INTO user_preferences_v2 (user_id) VALUES (?)',
            [id]
        );

        // Create default smart lists
        await pool.query(
            `INSERT INTO user_lists (user_id, name, list_type, icon) VALUES
                                                                         (?, 'Want to Try', 'want_to_try', '🎯'),
                                                                         (?, 'Date Night', 'date_night', '💑'),
                                                                         (?, 'Quick Bites', 'quick_lunch', '⚡'),
                                                                         (?, 'Bucket List', 'bucket_list', '⭐')`,
            [id, id, id, id]
        );

        return res.json({ token: signToken(id) });
    } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already registered' });
        }
        return res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    const body = z.object({
        email: z.string().email(),
        password: z.string()
    }).safeParse(req.body);

    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const { email, password } = body.data;
    const [rows] = await pool.query(
        'SELECT id, password_hash FROM users WHERE email = ?',
        [email]
    );
    const row = (rows as any[])[0];

    if (!row) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    return res.json({ token: signToken(row.id) });
});
// Preferences
app.get('/api/preferences', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query(
        'SELECT * FROM user_preferences_v2 WHERE user_id = ?',
        [req.userId]
    );
    const prefs = (rows as any[])[0] || {};

    // Parse JSON fields
    prefs.preferred_cuisines = prefs.preferred_cuisines ? JSON.parse(prefs.preferred_cuisines) : [];
    prefs.dietary_restrictions = prefs.dietary_restrictions ? JSON.parse(prefs.dietary_restrictions) : [];
    prefs.preferred_vibes = prefs.preferred_vibes ? JSON.parse(prefs.preferred_vibes) : [];

    res.json(prefs);
});

app.put('/api/preferences', requireAuth, async (req: any, res) => {
    const schema = z.object({
        max_miles: z.number().min(0.1).max(50).optional(),
        default_lat: z.number().optional(),
        default_lng: z.number().optional(),
        preferred_cuisines: z.array(z.string()).optional(),
        dietary_restrictions: z.array(z.string()).optional(),
        price_min: z.number().min(1).max(4).optional(),
        price_max: z.number().min(1).max(4).optional(),
        preferred_vibes: z.array(z.string()).optional(),
        filter_open_now: z.boolean().optional(),
        filter_reservations: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const data = parsed.data;
    const updates: string[] = [];
    const values: any[] = [];

    if (data.max_miles !== undefined) {
        updates.push('max_miles = ?');
        values.push(data.max_miles);
    }
    if (data.default_lat !== undefined) {
        updates.push('default_lat = ?');
        values.push(data.default_lat);
    }
    if (data.default_lng !== undefined) {
        updates.push('default_lng = ?');
        values.push(data.default_lng);
    }
    if (data.preferred_cuisines !== undefined) {
        updates.push('preferred_cuisines = ?');
        values.push(JSON.stringify(data.preferred_cuisines));
    }
    if (data.dietary_restrictions !== undefined) {
        updates.push('dietary_restrictions = ?');
        values.push(JSON.stringify(data.dietary_restrictions));
    }
    if (data.price_min !== undefined) {
        updates.push('price_min = ?');
        values.push(data.price_min);
    }
    if (data.price_max !== undefined) {
        updates.push('price_max = ?');
        values.push(data.price_max);
    }
    if (data.preferred_vibes !== undefined) {
        updates.push('preferred_vibes = ?');
        values.push(JSON.stringify(data.preferred_vibes));
    }
    if (data.filter_open_now !== undefined) {
        updates.push('filter_open_now = ?');
        values.push(data.filter_open_now);
    }
    if (data.filter_reservations !== undefined) {
        updates.push('filter_reservations = ?');
        values.push(data.filter_reservations);
    }

    if (updates.length > 0) {
        values.push(req.userId);
        await pool.query(
            `UPDATE user_preferences_v2 SET ${updates.join(', ')} WHERE user_id = ?`,
            values
        );
    }

    res.json({ ok: true });
});

// Pick + persist for logged-in users
app.post('/api/pick', optionalAuth, async (req: any, res) => {
    const schema = z.object({
        lat: z.number(),
        lng: z.number(),
        miles: z.number().min(0.5).max(50),
        cuisines: z.array(z.string()).optional(),
        price_min: z.number().min(1).max(4).optional(),
        price_max: z.number().min(1).max(4).optional(),
        vibes: z.array(z.string()).optional(),
        dietary_restrictions: z.array(z.string()).optional(),
        open_now: z.boolean().optional(),
        excludeProviderIds: z.array(z.string()).optional(),
        sessionId: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { lat, lng, miles, cuisines, price_min, price_max, vibes, dietary_restrictions, open_now, excludeProviderIds, sessionId } = parsed.data;

    // Get user preferences if logged in
    let userPrefs: any = null;
    if (req.userId) {
        const [rows] = await pool.query(
            'SELECT * FROM user_preferences_v2 WHERE user_id = ?',
            [req.userId]
        );
        userPrefs = (rows as any[])[0];
        if (userPrefs) {
            userPrefs.preferred_cuisines = userPrefs.preferred_cuisines ? JSON.parse(userPrefs.preferred_cuisines) : [];
            userPrefs.dietary_restrictions = userPrefs.dietary_restrictions ? JSON.parse(userPrefs.dietary_restrictions) : [];
            userPrefs.preferred_vibes = userPrefs.preferred_vibes ? JSON.parse(userPrefs.preferred_vibes) : [];
        }
    }

    // Check cache first
    const cacheKey = crypto.createHash('md5').update(
        JSON.stringify({ lat, lng, miles, cuisines, price_min, price_max, vibes })
    ).digest('hex');

    const [cacheRows] = await pool.query(
        'SELECT * FROM location_cache WHERE cache_key = ? AND expires_at > NOW()',
        [cacheKey]
    );

    let places: any[] = [];

    if ((cacheRows as any[]).length > 0) {
        const cached = (cacheRows as any[])[0];
        places = JSON.parse(cached.provider_results);
    } else {
        // Fetch from multiple providers in parallel for better coverage
        const searchParams = {
            lat,
            lng,
            miles,
            cuisines: cuisines?.map(c => c.toLowerCase())
        };

        const [googleResults, foursquareResults] = await Promise.all([
            primaryProvider.searchNearby(searchParams),
            FoursquareProvider.searchNearby(searchParams)
        ]);

        // Merge results from both providers
        places = [...googleResults, ...foursquareResults];

        // Deduplicate by name and location (places that are very close to each other with same name)
        const deduped = new Map<string, any>();
        for (const p of places) {
            const key = `${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.round((p.lat || 0) * 1000)}_${Math.round((p.lng || 0) * 1000)}`;
            if (!deduped.has(key)) {
                deduped.set(key, p);
            }
        }
        places = Array.from(deduped.values());

        // OSM fallback only if no results from Google or Foursquare
        if (places.length === 0 && process.env.OSM_FALLBACK !== '0') {
            places = await OSMProvider.searchNearby(searchParams);
        }
        const sanitizedPlaces = places.map(p => ({
            provider: p.provider,
            providerId: p.providerId,
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
            rating: p.rating,
            price_level: p.price_level,
            cuisines: p.cuisines,
            description: p.description,
            _weight: p._weight
        }))
        // Cache results (use ON DUPLICATE KEY UPDATE to handle race conditions)
        await pool.query(
            `INSERT INTO location_cache (cache_key, user_id, lat, lng, radius, filters, provider_results, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
                 ON DUPLICATE KEY UPDATE
                                      provider_results = VALUES(provider_results),
                                      expires_at = VALUES(expires_at)`,
            [
                cacheKey,
                req.userId || null,
                lat,
                lng,
                miles,
                JSON.stringify({ cuisines, price_min, price_max, vibes }),
                JSON.stringify(sanitizedPlaces)
            ]
        );
    }

    // Apply filters
    places = filterByPreferences(places, {
        price_min: price_min || userPrefs?.price_min || 1,
        price_max: price_max || userPrefs?.price_max || 4,
        vibes: vibes || userPrefs?.preferred_vibes || [],
        dietary_restrictions: dietary_restrictions || userPrefs?.dietary_restrictions || [],
        open_now: open_now || userPrefs?.filter_open_now || false,
    });

    // Exclude session exclusions ("not right now")
    if (sessionId) {
        const [excluded] = await pool.query(
            'SELECT provider_id FROM session_exclusions WHERE session_id = ? AND expires_at > NOW()',
            [sessionId]
        );
        const excludedIds = (excluded as any[]).map(e => e.provider_id);
        places = places.filter(p => !excludedIds.includes(p.providerId));
    }

    // Exclude explicitly passed IDs
    if (excludeProviderIds) {
        places = places.filter(p => !excludeProviderIds.includes(p.providerId));
    }

    // Exclude user dislikes
    if (req.userId) {
        const [dislikes] = await pool.query(
            'SELECT provider_id FROM dislikes WHERE user_id = ?',
            [req.userId]
        );
        const dislikedIds = (dislikes as any[]).map(d => d.provider_id);
        places = places.filter(p => !dislikedIds.includes(p.providerId));
    }

    if (places.length === 0) {
        return res.json({ primary: null, backups: [], reason: 'No restaurants found matching your criteria' });
    }

    // Weight by favorites and ML predictions
    if (req.userId) {
        places = await weightByFavorites(req.userId, places);
        places = await getMLRecommendations(req.userId, places, { lat, lng, time_of_day: getTimeOfDay() });
    }

    // Shuffle weighted
    places = places.sort((a, b) => (b._weight || 1) - (a._weight || 1) + (Math.random() - 0.5) * 0.3);

    const [primary, b1, b2] = [places[0], places[1], places[2]];

    // Upsert places and enrich
    async function upsertAndEnrich(p?: any) {
        if (!p) return null;

        const desc = await summarizePlace(p.name, p.description);
        const [r] = await pool.query(
            `INSERT INTO places (provider, provider_id, name, address, lat, lng, rating, price_level, cuisine_csv, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                                      name = VALUES(name), address = VALUES(address), lat = VALUES(lat), lng = VALUES(lng),
                                      rating = VALUES(rating), price_level = VALUES(price_level), cuisine_csv = VALUES(cuisine_csv), description = VALUES(description)`,
            [
                p.provider,
                p.providerId,
                p.name,
                p.address || null,
                p.lat || null,
                p.lng || null,
                p.rating || null,
                p.price_level || null,
                (p.cuisines || []).join(','),
                desc || null
            ]
        );

        let placeId = (r as any).insertId;
        if (!placeId) {
            const [existing] = await pool.query(
                'SELECT id FROM places WHERE provider = ? AND provider_id = ?',
                [p.provider, p.providerId]
            );
            placeId = (existing as any[])[0]?.id;
        }

        // Get recommendation reasons
        const reasons = req.userId ? await getRecommendationReasons(req.userId, p, userPrefs) : [];

        return { ...p, description: desc, placeId, reasons };
    }

    const [P, B1, B2] = await Promise.all([
        upsertAndEnrich(primary),
        upsertAndEnrich(b1),
        upsertAndEnrich(b2)
    ]);

    // Log decision history
    if (req.userId && P?.placeId) {
        await pool.query(
            `INSERT INTO decision_history_v2
             (user_id, session_id, place_id, provider, provider_id, action, search_lat, search_lng, search_radius,
              filters_applied, time_of_day, day_of_week, suggestion_reason)
             VALUES (?, ?, ?, ?, ?, 'shown', ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.userId,
                sessionId || null,
                P.placeId,
                P.provider,
                P.providerId,
                lat,
                lng,
                miles,
                JSON.stringify({ cuisines, price_min, price_max, vibes }),
                getTimeOfDay(),
                getDayOfWeek(),
                JSON.stringify(P.reasons)
            ]
        );

        // Log ML interaction
        await pool.query(
            `INSERT INTO ml_interactions (user_id, place_id, features, interaction_type)
             VALUES (?, ?, ?, 'shown')`,
            [
                req.userId,
                P.placeId,
                JSON.stringify({
                    cuisines: P.cuisines || [],
                    price: P.price_level || 2,
                    rating: P.rating || 0,
                    distance: calculateDistance(lat, lng, P.lat, P.lng),
                    time_of_day: getTimeOfDay(),
                    day_of_week: getDayOfWeek()
                })
            ]
        );
    }

    res.json({ primary: P, backups: [B1, B2].filter(Boolean) });
});
app.post('/api/session/exclude', optionalAuth, async (req: any, res) => {
    const schema = z.object({
        sessionId: z.string(),
        provider: z.string(),
        providerId: z.string(),
        placeId: z.number().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { sessionId, provider, providerId, placeId } = parsed.data;

    await pool.query(
        `INSERT INTO session_exclusions (session_id, user_id, place_id, provider, provider_id)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, req.userId || null, placeId || null, provider, providerId]
    );

    res.json({ ok: true });
});

app.get('/api/session/:sessionId/exclusions', async (req, res) => {
    const { sessionId } = req.params;

    const [rows] = await pool.query(
        'SELECT provider, provider_id FROM session_exclusions WHERE session_id = ? AND expires_at > NOW()',
        [sessionId]
    );

    res.json(rows);
});

// Favorites & dislikes
// ============================================================================
// FAVORITES (ENHANCED)
// ============================================================================
app.post('/api/favorites/:placeId', requireAuth, async (req: any, res) => {
    const placeId = Number(req.params.placeId);

    await pool.query(
        'INSERT IGNORE INTO favorites (user_id, place_id) VALUES (?, ?)',
        [req.userId, placeId]
    );

    // Log interaction for ML
    await pool.query(
        `INSERT INTO ml_interactions (user_id, place_id, features, interaction_type, label)
         VALUES (?, ?, '{}', 'favorited', 'positive')`,
        [req.userId, placeId]
    );

    // Create friend activity
    await pool.query(
        `INSERT INTO friend_activities (user_id, activity_type, place_id)
         VALUES (?, 'favorited', ?)`,
        [req.userId, placeId]
    );

    res.json({ ok: true });
});

app.delete('/api/favorites/:placeId', requireAuth, async (req: any, res) => {
    const placeId = Number(req.params.placeId);

    await pool.query(
        'DELETE FROM favorites WHERE user_id = ? AND place_id = ?',
        [req.userId, placeId]
    );

    res.json({ ok: true });
});

app.get('/api/favorites', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query(
        `SELECT p.*, f.created_at as favorited_at
         FROM favorites f
                  JOIN places p ON p.id = f.place_id
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC`,
        [req.userId]
    );

    res.json(rows);
});
app.post('/api/dislikes', requireAuth, async (req: any, res) => {
    const schema = z.object({
        provider: z.string(),
        providerId: z.string(),
        placeId: z.number().optional(),
        reason: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { provider, providerId, placeId, reason } = parsed.data;

    await pool.query(
        'INSERT IGNORE INTO dislikes (user_id, provider, provider_id) VALUES (?, ?, ?)',
        [req.userId, provider, providerId]
    );

    // Log interaction for ML
    if (placeId) {
        await pool.query(
            `INSERT INTO ml_interactions (user_id, place_id, features, interaction_type, label)
             VALUES (?, ?, '{}', 'disliked', 'negative')`,
            [req.userId, placeId]
        );
    }

    res.json({ ok: true });
});
// ============================================================================
// SMART LISTS
// ============================================================================
app.get('/api/lists', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query(
        `SELECT l.*, COUNT(li.id) as item_count
         FROM user_lists l
                  LEFT JOIN list_items li ON li.list_id = l.id
         WHERE l.user_id = ?
         GROUP BY l.id
         ORDER BY l.sort_order, l.created_at`,
        [req.userId]
    );

    res.json(rows);
});

app.post('/api/lists', requireAuth, async (req: any, res) => {
    const schema = z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        list_type: z.enum(['want_to_try', 'favorites', 'date_night', 'quick_lunch', 'bucket_list', 'custom']),
        icon: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { name, description, list_type, icon } = parsed.data;

    const [result] = await pool.query(
        `INSERT INTO user_lists (user_id, name, description, list_type, icon)
         VALUES (?, ?, ?, ?, ?)`,
        [req.userId, name, description || null, list_type, icon || '📝']
    );

    res.json({ id: (result as any).insertId, ok: true });
});

app.get('/api/lists/:listId', requireAuth, async (req: any, res) => {
    const listId = Number(req.params.listId);

    // Verify ownership
    const [listRows] = await pool.query(
        'SELECT * FROM user_lists WHERE id = ? AND user_id = ?',
        [listId, req.userId]
    );

    if ((listRows as any[]).length === 0) {
        return res.status(404).json({ error: 'List not found' });
    }

    const list = (listRows as any[])[0];

    // Get items
    const [items] = await pool.query(
        `SELECT li.*, p.*
         FROM list_items li
                  JOIN places p ON p.id = li.place_id
         WHERE li.list_id = ?
         ORDER BY li.priority DESC, li.added_at DESC`,
        [listId]
    );

    res.json({ ...list, items });
});

app.post('/api/lists/:listId/items', requireAuth, async (req: any, res) => {
    const listId = Number(req.params.listId);
    const schema = z.object({
        placeId: z.number(),
        notes: z.string().optional(),
        priority: z.number().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Verify ownership
    const [listRows] = await pool.query(
        'SELECT * FROM user_lists WHERE id = ? AND user_id = ?',
        [listId, req.userId]
    );

    if ((listRows as any[]).length === 0) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { placeId, notes, priority } = parsed.data;

    await pool.query(
        `INSERT INTO list_items (list_id, place_id, notes, priority)
         VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE notes = VALUES(notes), priority = VALUES(priority)`,
        [listId, placeId, notes || null, priority || 0]
    );

    // Create friend activity
    await pool.query(
        `INSERT INTO friend_activities (user_id, activity_type, place_id, list_id)
         VALUES (?, 'added_to_list', ?, ?)`,
        [req.userId, placeId, listId]
    );

    res.json({ ok: true });
});

app.delete('/api/lists/:listId/items/:placeId', requireAuth, async (req: any, res) => {
    const listId = Number(req.params.listId);
    const placeId = Number(req.params.placeId);

    // Verify ownership
    const [listRows] = await pool.query(
        'SELECT * FROM user_lists WHERE id = ? AND user_id = ?',
        [listId, req.userId]
    );

    if ((listRows as any[]).length === 0) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    await pool.query(
        'DELETE FROM list_items WHERE list_id = ? AND place_id = ?',
        [listId, placeId]
    );

    res.json({ ok: true });
});

// Pick random from list
app.post('/api/lists/:listId/pick', requireAuth, async (req: any, res) => {
    const listId = Number(req.params.listId);

    // Verify ownership
    const [listRows] = await pool.query(
        'SELECT * FROM user_lists WHERE id = ? AND user_id = ?',
        [listId, req.userId]
    );

    if ((listRows as any[]).length === 0) {
        return res.status(404).json({ error: 'List not found' });
    }

    const [items] = await pool.query(
        `SELECT p.*
         FROM list_items li
                  JOIN places p ON p.id = li.place_id
         WHERE li.list_id = ?
         ORDER BY RAND()
             LIMIT 1`,
        [listId]
    );

    if ((items as any[]).length === 0) {
        return res.json({ pick: null, message: 'List is empty' });
    }

    res.json({ pick: (items as any[])[0] });
});

// ============================================================================
// ENHANCED GROUP DECISION ROOMS WITH SWIPE MECHANIC
// ============================================================================
app.post('/api/rooms', optionalAuth, async (req: any, res) => {
    const schema = z.object({
        name: z.string().optional(),
        lat: z.number(),
        lng: z.number(),
        radius: z.number().min(0.5).max(50).optional(),
        filters: z.object({
            cuisines: z.array(z.string()).optional(),
            price: z.array(z.number()).optional(),
            vibes: z.array(z.string()).optional(),
        }).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { name, lat, lng, radius, filters } = parsed.data;
    const slug = crypto.randomBytes(6).toString('hex');

    // Fetch initial candidates from multiple providers
    const searchParams = {
        lat,
        lng,
        miles: radius || 5,
        cuisines: filters?.cuisines?.map(c => c.toLowerCase())
    };

    const [googleResults, foursquareResults] = await Promise.all([
        primaryProvider.searchNearby(searchParams),
        FoursquareProvider.searchNearby(searchParams)
    ]);

    // Merge and deduplicate results
    const allPlaces = [...googleResults, ...foursquareResults];
    const deduped = new Map<string, any>();
    for (const p of allPlaces) {
        const key = `${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.round((p.lat || 0) * 1000)}_${Math.round((p.lng || 0) * 1000)}`;
        if (!deduped.has(key)) {
            deduped.set(key, p);
        }
    }
    const places = Array.from(deduped.values());

    const [result] = await pool.query(
        `INSERT INTO decision_rooms_v2 (slug, creator_id, name, lat, lng, radius, filters, candidates)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            slug,
            req.userId || null,
            name || 'Group Decision',
            lat,
            lng,
            radius || 5,
            JSON.stringify(filters || {}),
            JSON.stringify(places.slice(0, 20))
        ]
    );

    res.json({ slug, roomId: (result as any).insertId });
});

app.get('/api/rooms/:slug', async (req, res) => {
    const { slug } = req.params;

    const [rows] = await pool.query(
        'SELECT * FROM decision_rooms_v2 WHERE slug = ?',
        [slug]
    );

    if ((rows as any[]).length === 0) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const room = (rows as any[])[0];
    room.filters = JSON.parse(room.filters);
    room.candidates = JSON.parse(room.candidates);

    // Get participants
    const [participants] = await pool.query(
        'SELECT id, nickname, last_active FROM room_participants WHERE room_id = ?',
        [room.id]
    );

    // Get swipe counts per candidate
    const [swipes] = await pool.query(
        `SELECT place_id, swipe, COUNT(*) as count
         FROM room_swipes
         WHERE room_id = ?
         GROUP BY place_id, swipe`,
        [room.id]
    );

    res.json({ room, participants, swipes });
});

app.post('/api/rooms/:slug/join', optionalAuth, async (req: any, res) => {
    const { slug } = req.params;
    const schema = z.object({
        nickname: z.string().min(1).max(100),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { nickname } = parsed.data;

    const [rooms] = await pool.query(
        'SELECT id FROM decision_rooms_v2 WHERE slug = ?',
        [slug]
    );

    if ((rooms as any[]).length === 0) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const roomId = (rooms as any[])[0].id;
    const sessionToken = crypto.randomBytes(16).toString('hex');

    const [result] = await pool.query(
        `INSERT INTO room_participants (room_id, user_id, nickname, session_token)
         VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), last_active = CURRENT_TIMESTAMP`,
        [roomId, req.userId || null, nickname, sessionToken]
    );

    res.json({ participantId: (result as any).insertId, sessionToken });
});

app.post('/api/rooms/:slug/swipe', async (req, res) => {
    const { slug } = req.params;
    const schema = z.object({
        sessionToken: z.string(),
        placeId: z.number(),
        swipe: z.enum(['like', 'dislike', 'super_like', 'veto']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { sessionToken, placeId, swipe } = parsed.data;

    // Get room and participant
    const [rooms] = await pool.query(
        'SELECT id FROM decision_rooms_v2 WHERE slug = ?',
        [slug]
    );

    if ((rooms as any[]).length === 0) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const roomId = (rooms as any[])[0].id;

    const [participants] = await pool.query(
        'SELECT id FROM room_participants WHERE room_id = ? AND session_token = ?',
        [roomId, sessionToken]
    );

    if ((participants as any[]).length === 0) {
        return res.status(403).json({ error: 'Invalid session' });
    }

    const participantId = (participants as any[])[0].id;

    // Record swipe
    await pool.query(
        `INSERT INTO room_swipes (room_id, participant_id, place_id, swipe)
         VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE swipe = VALUES(swipe)`,
        [roomId, participantId, placeId, swipe]
    );

    // Check for consensus
    const [swipes] = await pool.query(
        `SELECT swipe, COUNT(*) as count
         FROM room_swipes
         WHERE room_id = ? AND place_id = ?
         GROUP BY swipe`,
        [roomId, placeId]
    );

    const [totalParticipants] = await pool.query(
        'SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?',
        [roomId]
    );

    const total = (totalParticipants as any[])[0].count;
    const likes = (swipes as any[]).find(s => s.swipe === 'like' || s.swipe === 'super_like')?.count || 0;
    const vetoes = (swipes as any[]).find(s => s.swipe === 'veto')?.count || 0;

    let consensus = null;
    if (vetoes > 0) {
        consensus = 'vetoed';
    } else if (likes === total) {
        consensus = 'unanimous';
        // Mark as winner
        await pool.query(
            'UPDATE decision_rooms_v2 SET status = ?, winner_place_id = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['decided', placeId, roomId]
        );
    } else if (likes >= Math.ceil(total * 0.67)) {
        consensus = 'majority';
    }

    res.json({ ok: true, consensus });
});

// ============================================================================
// FRIENDS & SOCIAL
// ============================================================================
app.post('/api/friends/request', requireAuth, async (req: any, res) => {
    const schema = z.object({
        friendEmail: z.string().email(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { friendEmail } = parsed.data;

    const [users] = await pool.query(
        'SELECT id FROM users WHERE email = ?',
        [friendEmail]
    );

    if ((users as any[]).length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }

    const friendId = (users as any[])[0].id;

    if (friendId === req.userId) {
        return res.status(400).json({ error: 'Cannot add yourself' });
    }

    await pool.query(
        `INSERT INTO friendships (user_id, friend_id)
         VALUES (?, ?)`,
        [req.userId, friendId]
    );

    res.json({ ok: true });
});

app.post('/api/friends/:friendshipId/accept', requireAuth, async (req: any, res) => {
    const friendshipId = Number(req.params.friendshipId);

    await pool.query(
        `UPDATE friendships
         SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
         WHERE id = ? AND friend_id = ? AND status = 'pending'`,
        [friendshipId, req.userId]
    );

    res.json({ ok: true });
});

app.get('/api/friends', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query(
        `SELECT f.id, f.status, u.id as friend_id, u.email as friend_email
         FROM friendships f
                  JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = ? AND f.status = 'accepted'
         UNION
         SELECT f.id, f.status, u.id as friend_id, u.email as friend_email
         FROM friendships f
                  JOIN users u ON u.id = f.user_id
         WHERE f.friend_id = ? AND f.status = 'accepted'`,
        [req.userId, req.userId]
    );

    res.json(rows);
});

app.get('/api/friends/activity', requireAuth, async (req: any, res) => {
    // Get friend IDs
    const [friends] = await pool.query(
        `SELECT f.friend_id as id FROM friendships f WHERE f.user_id = ? AND f.status = 'accepted'
         UNION
         SELECT f.user_id as id FROM friendships f WHERE f.friend_id = ? AND f.status = 'accepted'`,
        [req.userId, req.userId]
    );

    if ((friends as any[]).length === 0) {
        return res.json([]);
    }

    const friendIds = (friends as any[]).map(f => f.id);

    const [activities] = await pool.query(
        `SELECT fa.*, u.email as user_email, p.name as place_name, p.address as place_address
         FROM friend_activities fa
                  JOIN users u ON u.id = fa.user_id
                  JOIN places p ON p.id = fa.place_id
         WHERE fa.user_id IN (?) AND fa.visibility IN ('public', 'friends')
         ORDER BY fa.created_at DESC
             LIMIT 50`,
        [friendIds]
    );

    res.json(activities);
});

// ============================================================================
// ML PATTERNS & RECOMMENDATIONS
// ============================================================================
app.get('/api/ml/patterns', requireAuth, async (req: any, res) => {
    // Analyze and update patterns
    await analyzeUserPatterns(req.userId);

    const [patterns] = await pool.query(
        'SELECT * FROM user_patterns WHERE user_id = ? ORDER BY confidence DESC, frequency DESC',
        [req.userId]
    );

    res.json(patterns);
});

app.get('/api/ml/recommendations', requireAuth, async (req: any, res) => {
    const schema = z.object({
        lat: z.string().transform(Number),
        lng: z.string().transform(Number),
        limit: z.string().transform(Number).optional(),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { lat, lng, limit } = parsed.data;

    // Get nearby places from multiple providers
    const searchParams = { lat, lng, miles: 5 };

    const [googleResults, foursquareResults] = await Promise.all([
        primaryProvider.searchNearby(searchParams),
        FoursquareProvider.searchNearby(searchParams)
    ]);

    // Merge and deduplicate
    const allPlaces = [...googleResults, ...foursquareResults];
    const deduped = new Map<string, any>();
    for (const p of allPlaces) {
        const key = `${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.round((p.lat || 0) * 1000)}_${Math.round((p.lng || 0) * 1000)}`;
        if (!deduped.has(key)) {
            deduped.set(key, p);
        }
    }
    const places = Array.from(deduped.values());

    // Get ML-weighted recommendations
    const recommendations = await getMLRecommendations(req.userId, places, { lat, lng, time_of_day: getTimeOfDay() });

    res.json(recommendations.slice(0, limit || 10));
});


// History
app.get('/api/choices', requireAuth, async (req: any, res) => {
    const [rows] = await pool.query(
        `SELECT dh.*, p.name, p.address, p.rating
         FROM decision_history_v2 dh
                  LEFT JOIN places p ON p.id = dh.place_id
         WHERE dh.user_id = ?
         ORDER BY dh.created_at DESC
             LIMIT 50`,
        [req.userId]
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 22) return 'dinner';
    return 'late_night';
}

function getDayOfWeek(): string {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

app.listen(process.env.PORT || 3001, () => {
    console.log(`Enhanced API up on ${process.env.PORT || 3001}`);
});
