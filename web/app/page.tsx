'use client';
import axios from 'axios';
import { useMemo, useState, useEffect } from 'react';
import RestaurantCard from '../components/RestaurantCard';
import SwipeableCard from '../components/SwipeableCard';
import { v4 as uuidv4 } from 'uuid';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const CUISINES = [
    'thai', 'italian', 'mexican', 'japanese', 'chinese',
    'indian', 'american', 'mediterranean', 'middle eastern',
    'korean', 'vegan', 'bbq', 'seafood', 'pizza', 'vietnamese',
    'french', 'greek', 'spanish'
];

const VIBES = [
    { id: 'quick_bite', label: 'Quick Bite', icon: '⚡' },
    { id: 'date_night', label: 'Date Night', icon: '💑' },
    { id: 'family_friendly', label: 'Family Friendly', icon: '👨‍👩‍👧' },
    { id: 'late_night', label: 'Late Night', icon: '🌙' },
    { id: 'casual', label: 'Casual', icon: '👕' },
    { id: 'upscale', label: 'Upscale', icon: '🎩' },
];

const DIETARY_RESTRICTIONS = [
    'vegetarian',
    'vegan',
    'gluten_free',
    'halal',
    'kosher',
    'dairy_free',
    'nut_free',
];
type GeoErr = GeolocationPositionError & { code: number };

export default function EnhancedHome() {
    // Session management
    const [sessionId] = useState(() => {
        if (typeof window !== 'undefined') {
            let sid = sessionStorage.getItem('sessionId');
            if (!sid) {
                sid = uuidv4();
                sessionStorage.setItem('sessionId', sid);
            }
            return sid;
        }
        return uuidv4();
    });
    // Filter states
    const [miles, setMiles] = useState(5);
    const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
    const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
    const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
    const [priceRange, setPriceRange] = useState<[number, number]>([1, 4]);
    const [openNow, setOpenNow] = useState(false);
    const [addr, setAddr] = useState('');

    // View mode
    const [viewMode, setViewMode] = useState<'cards' | 'swipe'>('cards');

    // Results
    const [primary, setPrimary] = useState<any>(null);
    const [backups, setBackups] = useState<any[]>([]);
    const [allCandidates, setAllCandidates] = useState<any[]>([]);
    const [currentSwipeIndex, setCurrentSwipeIndex] = useState(0);

    // UI states
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    // History tracking
    const [recentlyShown, setRecentlyShown] = useState<string[]>([]);

    const [groupLink, setGroupLink] = useState<string | null>(null);

    // ML Recommendations
    const [mlRecommendations, setMlRecommendations] = useState<any[]>([]);
    const [showMlRecs, setShowMlRecs] = useState(false);

    const picksReady = useMemo(() => !!primary || backups.length > 0, [primary, backups]);

    function geoMessage(e: Partial<GeoErr>) {
        switch (e.code) {
            case 1: return 'Location permission denied. Allow it, or enter an address/ZIP below.';
            case 2: return 'Location unavailable. Try again, or enter an address/ZIP below.';
            case 3: return 'Location request timed out. Try again, or enter an address/ZIP below.';
            default: return 'Could not get your location. Use the address/ZIP fallback below.';
        }
    }
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            loadPreferences();
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && coords) {
            loadMLRecommendations();
        }
    }, [coords]);

    async function loadPreferences() {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`${API}/api/preferences`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setMiles(data.max_miles || 5);
            setSelectedCuisines(data.preferred_cuisines || []);
            setSelectedVibes(data.preferred_vibes || []);
            setSelectedDietary(data.dietary_restrictions || []);
            setPriceRange([data.price_min || 1, data.price_max || 4]);
            setOpenNow(data.filter_open_now || false);

            if (data.default_lat && data.default_lng) {
                setCoords({ lat: data.default_lat, lng: data.default_lng });
            }
        } catch (e) {
            console.error('Failed to load preferences', e);
        }
    }

    async function loadMLRecommendations() {
        try {
            const token = localStorage.getItem('token');
            if (!token || !coords) return;

            const { data } = await axios.get(`${API}/api/ml/recommendations`, {
                params: {
                    lat: coords.lat.toString(),
                    lng: coords.lng.toString(),
                    limit: '10'
                },
                headers: { Authorization: `Bearer ${token}` }
            });

            // Validate the response data
            if (Array.isArray(data)) {
                setMlRecommendations(data);
            } else {
                console.error('Invalid ML recommendations data:', data);
                setMlRecommendations([]);
            }
        } catch (e) {
            console.error('Failed to load ML recommendations', e);
            setMlRecommendations([]);
        }
    }

    async function savePreferences() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            await axios.put(
                `${API}/api/preferences`,
                {
                    max_miles: miles,
                    preferred_cuisines: selectedCuisines,
                    preferred_vibes: selectedVibes,
                    dietary_restrictions: selectedDietary,
                    price_min: priceRange[0],
                    price_max: priceRange[1],
                    filter_open_now: openNow,
                    default_lat: coords?.lat,
                    default_lng: coords?.lng,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            alert('Preferences saved!');
        } catch (e: any) {
            alert(e?.message || 'Failed to save preferences');
        }
    }
    function toggleCuisine(c: string) {
        setSelectedCuisines((arr) =>
            arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]
        );
    }
    function toggleVibe(v: string) {
        setSelectedVibes((arr) =>
            arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
        );
    }

    function toggleDietary(d: string) {
        setSelectedDietary((arr) =>
            arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]
        );
    }
    function clearCuisines() {
        setSelectedCuisines([]);
    }
    async function locate() {
        return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
            if (!('geolocation' in navigator)) return reject(new Error('Geolocation unsupported'));
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
                (e) => reject(e),
                { enableHighAccuracy: true, timeout: 8000 }
            );
        });
    }

    async function geocodeAddress(q: string) {
        if (!q || !GMAPS_KEY) return null;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${GMAPS_KEY}`;
        const { data } = await axios.get(url);
        const c = data?.results?.[0]?.geometry?.location;
        if (c && typeof c.lat === 'number' && typeof c.lng === 'number') return { lat: c.lat, lng: c.lng };
        return null;
    }

    async function doPick() {
        setLoading(true);
        setError(null);
        setGroupLink(null);
        try {
            let loc = coords;
            if (!loc) {
                try {
                    // Geolocation works on https:// or http://localhost only.
                    loc = await locate();
                } catch (e: any) {
                    // Fallback: try address/ZIP if provided
                    if (addr) {
                        const g = await geocodeAddress(addr);
                        if (!g) throw new Error('Could not geocode that address/ZIP.');
                        loc = g;
                    } else {
                        throw new Error(geoMessage(e));
                    }
                }
            }
            setCoords(loc);
            const excludeIds = recentlyShown.slice(-10); // Exclude last 10 shown

            const { data } = await axios.post(
                `${API}/api/pick`,
                {
                    lat: loc.lat,
                    lng: loc.lng,
                    miles: Number(miles),
                    cuisines: selectedCuisines,
                    vibes: selectedVibes,
                    dietary_restrictions: selectedDietary,
                    price_min: priceRange[0],
                    price_max: priceRange[1],
                    open_now: openNow,
                    excludeProviderIds: excludeIds,
                    sessionId,
                },
                { headers: authHeaderIfAny() }
            );


            setPrimary(data.primary);
            setBackups(data.backups || []);
        } catch (e: any) {
            const msg = e?.response?.status === 404
                ? `API 404 at ${API}/api/pick. Check NEXT_PUBLIC_API_BASE and that the server is running.`
                : e?.message || 'Something went wrong.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    async function favorite(placeId: number) {
        const token = localStorage.getItem('token');
        if (!token) return alert('Create an account / log in to save favorites.');
        await axios.post(`${API}/api/favorites/${placeId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
        alert('Saved!');
    }

    async function dislike(r: any) {
        const token = localStorage.getItem('token');
        if (!token) return alert('Log in to set dislikes.');
        await axios.post(
            `${API}/api/dislikes`,
            { provider: r.provider, providerId: r.providerId },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        alert('Noted! I will avoid this next time.');
    }
    async function notRightNow(r: any) {
        await axios.post(`${API}/api/session/exclude`, {
            sessionId,
            provider: r.provider,
            providerId: r.providerId,
            placeId: r.placeId,
        });

        // Re-roll
        doPick();
    }
    function authHeaderIfAny() {
        if (typeof window === 'undefined') return {};
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
    async function startGroupVote() {
        if (!primary) return;
        try {
            const body = {
                primaryPlaceId: primary.placeId,
                backup1PlaceId: backups[0]?.placeId || null,
                backup2PlaceId: backups[1]?.placeId || null,
            };
            const { data } = await axios.post(`${API}/api/group`, body, {
                headers: authHeaderIfAny(),
            });
            const slug = data?.slug;
            if (slug) {
                const link = `${location.origin}/group/${slug}`;
                setGroupLink(link);
            }
        } catch (e: any) {
            alert(e?.message || 'Could not start group vote');
        }
    }

    return (
        <div className="space-y-6">
            {/* Main Search Section */}
            <section className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Find me a place to eat 🎲</h2>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-50"
                    >
                        {showFilters ? 'Hide' : 'Show'} Filters
                    </button>
                </div>

                <p className="text-xs text-slate-500 mt-1">
                    Tip: Geolocation requires HTTPS (or http://localhost). If blocked, enter an address/ZIP.
                </p>

                {/* Basic Controls */}
                <div className="mt-4 grid gap-3">
                    <div className="grid sm:grid-cols-4 gap-3">
                        <label className="block text-sm">
                            Miles
                            <input
                                type="number"
                                className="mt-1 w-full rounded-lg border p-2"
                                min={0.5}
                                max={50}
                                step={0.5}
                                value={miles}
                                onChange={(e) => setMiles(Number(e.target.value))}
                            />
                        </label>
                        <label className="block text-sm col-span-2">
                            Address or ZIP (fallback)
                            <input
                                placeholder="e.g., 10001 or 1600 Amphitheatre Pkwy"
                                className="mt-1 w-full rounded-lg border p-2"
                                value={addr}
                                onChange={(e) => setAddr(e.target.value)}
                            />
                        </label>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={doPick}
                                disabled={loading}
                                className="w-full rounded-lg bg-indigo-600 text-white py-2 font-medium disabled:opacity-60"
                            >
                                {loading ? 'Rolling…' : 'Roll the dice'}
                            </button>
                        </div>
                    </div>

                    {picksReady && (
                        <div className="flex gap-2">
                            <button
                                onClick={doPick}
                                disabled={loading}
                                className="rounded-lg border px-4 py-2 font-medium disabled:opacity-60"
                            >
                                Re-roll
                            </button>
                            <button
                                onClick={() => setViewMode(viewMode === 'cards' ? 'swipe' : 'cards')}
                                className="rounded-lg border px-4 py-2"
                            >
                                {viewMode === 'cards' ? '👆 Switch to Swipe Mode' : '📋 Switch to Cards'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Advanced Filters */}
                {showFilters && (
                    <div className="mt-4 space-y-4 p-4 rounded-xl border bg-slate-50">
                        {/* Cuisines */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-medium">Cuisine preferences</div>
                                <button
                                    type="button"
                                    className="text-xs underline"
                                    onClick={() => setSelectedCuisines([])}
                                >
                                    Clear all
                                </button>
                            </div>
                            <div className="grid sm:grid-cols-4 gap-2">
                                {CUISINES.map((c) => (
                                    <label key={c} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selectedCuisines.includes(c)}
                                            onChange={() => toggleCuisine(c)}
                                        />
                                        {c.charAt(0).toUpperCase() + c.slice(1)}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Vibes */}
                        <div>
                            <div className="text-sm font-medium mb-2">Vibe / Occasion</div>
                            <div className="grid sm:grid-cols-3 gap-2">
                                {VIBES.map((v) => (
                                    <button
                                        key={v.id}
                                        onClick={() => toggleVibe(v.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                            selectedVibes.includes(v.id)
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <span>{v.icon}</span>
                                        <span>{v.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Dietary Restrictions */}
                        <div>
                            <div className="text-sm font-medium mb-2">Dietary Restrictions</div>
                            <div className="grid sm:grid-cols-4 gap-2">
                                {DIETARY_RESTRICTIONS.map((d) => (
                                    <label key={d} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selectedDietary.includes(d)}
                                            onChange={() => toggleDietary(d)}
                                        />
                                        {d.replace('_', ' ').charAt(0).toUpperCase() + d.replace('_', ' ').slice(1)}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Price Range */}
                        <div>
                            <div className="text-sm font-medium mb-2">
                                Price Range: {'$'.repeat(priceRange[0])} - {'$'.repeat(priceRange[1])}
                            </div>
                            <div className="flex gap-4">
                                <label className="flex-1">
                                    Min
                                    <input
                                        type="range"
                                        min={1}
                                        max={4}
                                        value={priceRange[0]}
                                        onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                                        className="w-full"
                                    />
                                </label>
                                <label className="flex-1">
                                    Max
                                    <input
                                        type="range"
                                        min={1}
                                        max={4}
                                        value={priceRange[1]}
                                        onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                                        className="w-full"
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Open Now */}
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={openNow}
                                onChange={(e) => setOpenNow(e.target.checked)}
                            />
                            <span className="text-sm">Only show places open now</span>
                        </label>

                        {/* Save Preferences */}
                        <button
                            onClick={savePreferences}
                            className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm"
                        >
                            Save These Preferences
                        </button>
                    </div>
                )}

                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            </section>

            {/* Results in Card Mode */}
            {viewMode === 'cards' && primary && (
                <>
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Primary Pick</h3>
                            {primary.reasons && primary.reasons.length > 0 && (
                                <div className="text-sm text-slate-600">
                                    Why: {primary.reasons.join(', ')}
                                </div>
                            )}
                        </div>
                        <RestaurantCard
                            r={primary}
                            onFav={() => favorite(primary.placeId)}
                            onDislike={() => dislike(primary)}
                            onNotNow={() => notRightNow(primary)}
                        />
                    </section>

                    {!!backups.length && (
                        <section className="space-y-4">
                            <h3 className="text-lg font-semibold">Backups</h3>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {backups.map((b, i) => (
                                    <RestaurantCard
                                        key={i}
                                        r={b}
                                        onFav={() => favorite(b.placeId)}
                                        onDislike={() => dislike(b)}
                                        onNotNow={() => notRightNow(b)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            {/* Results in Swipe Mode */}
            {viewMode === 'swipe' && primary && (
                <section>
                    <h3 className="text-lg font-semibold mb-4">Swipe to Decide</h3>
                    <SwipeableCard
                        restaurant={primary}
                        onSwipeLeft={() => {
                            notRightNow(primary);
                        }}
                        onSwipeRight={() => {
                            favorite(primary.placeId);
                        }}
                        onSwipeDown={() => {
                            dislike(primary);
                        }}
                    />
                </section>
            )}

            {/* ML Recommendations */}
            {mlRecommendations.length > 0 && (
                <section className="space-y-4">
                    <div className="rounded-2xl border bg-gradient-to-br from-purple-50 to-pink-50 p-6">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h3 className="text-lg font-semibold text-purple-900">
                                    🤖 Personalized for You
                                </h3>
                                <p className="text-sm text-purple-700 mt-1">
                                    Based on your taste patterns
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMlRecs(!showMlRecs)}
                                className="px-3 py-1.5 rounded-lg bg-white border border-purple-200 text-sm font-medium hover:bg-purple-50"
                            >
                                {showMlRecs ? 'Hide' : 'Show'} ({mlRecommendations.length})
                            </button>
                        </div>
                        {showMlRecs && (
                            <div className="mt-4 grid sm:grid-cols-2 gap-4">
                                {mlRecommendations.slice(0, 4).map((rec: any, idx: number) => (
                                    <div key={idx} className="relative">
                                        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white flex items-center justify-center text-sm font-bold z-10">
                                            {rec.score}
                                        </div>
                                        <RestaurantCard
                                            r={{
                                                ...rec.place,
                                                reasons: rec.reasons
                                            }}
                                            onFav={() => favorite(rec.place.id)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                        <a
                            href="/insights"
                            className="mt-3 inline-block text-sm text-purple-700 hover:underline"
                        >
                            View all insights →
                        </a>
                    </div>
                </section>
            )}

            <AuthBox />
        </div>
    );
}

function AuthBox() {
    // render the same thing on server & first client render
    const [mounted, setMounted] = useState(false);
    const [signedIn, setSignedIn] = useState(false);
    const [mode, setMode] = useState<'login' | 'register'>('register');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // after mount, check localStorage and re-render
    useEffect(() => {
        setSignedIn(!!localStorage.getItem('token'));
        setMounted(true);
    }, []);

    async function submit() {
        const url = `${API}/api/auth/${mode}`;
        const { data } = await axios.post(url, { email, password });
        localStorage.setItem('token', data.token);
        window.dispatchEvent(new Event('auth-change')); // << add this line
        setSignedIn(true);
        alert('Signed in!');
    }

    // While mounting, render the *logged-out* shell so SSR and first client render match
    if (!mounted || !signedIn) {
        return (
            <section className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Optional Account</h3>
                    <button
                        className="text-sm underline"
                        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                    >
                        {mode === 'login' ? 'Need an account?' : 'Have an account? Log in'}
                    </button>
                </div>
                <div className="mt-3 grid sm:grid-cols-3 gap-3">
                    <input
                        placeholder="you@email.com"
                        className="rounded-lg border p-2"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        placeholder="password"
                        type="password"
                        className="rounded-lg border p-2"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <button onClick={submit} className="rounded-lg bg-slate-900 text-white font-medium">
                        {mode === 'login' ? 'Log in' : 'Create account'}
                    </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    Save favorites and blacklist places you don’t want to see again.
                </p>
            </section>
        );
    }

    // Signed-in view (only after mount)
    return (
        <section className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Account</h3>
                <span className="text-sm text-emerald-700">Signed in</span>
            </div>
            <button
                className="mt-3 rounded-lg border px-3 py-2 text-sm"
                onClick={() => { localStorage.removeItem('token'); location.reload(); }}
            >
                Log out
            </button>
            <p className="mt-2 text-xs text-slate-500">Your rolls will be saved to History.</p>
        </section>
    );
}

