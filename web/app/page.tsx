'use client';
import axios from 'axios';
import { useMemo, useState, useEffect } from 'react';
import RestaurantCard from '../components/RestaurantCard';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const CUISINES = [
    'thai', 'italian', 'mexican', 'japanese', 'chinese',
    'indian', 'american', 'mediterranean', 'middle eastern',
    'korean', 'vegan', 'bbq', 'seafood', 'pizza'
];

type GeoErr = GeolocationPositionError & { code: number };

export default function Home() {
    const [miles, setMiles] = useState(5);
    const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
    const [addr, setAddr] = useState('');
    const [primary, setPrimary] = useState<any>(null);
    const [backups, setBackups] = useState<any[]>([]);
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [groupLink, setGroupLink] = useState<string | null>(null);

    const picksReady = useMemo(() => !!primary || backups.length > 0, [primary, backups]);

    function geoMessage(e: Partial<GeoErr>) {
        switch (e.code) {
            case 1: return 'Location permission denied. Allow it, or enter an address/ZIP below.';
            case 2: return 'Location unavailable. Try again, or enter an address/ZIP below.';
            case 3: return 'Location request timed out. Try again, or enter an address/ZIP below.';
            default: return 'Could not get your location. Use the address/ZIP fallback below.';
        }
    }
    function toggleCuisine(c: string) {
        setSelectedCuisines((arr) =>
            arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]
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

            const cuisinesArr = selectedCuisines; // ← multi-select array
            const { data } = await axios.post(
                `${API}/api/pick`,
                {
                    lat: loc.lat,
                    lng: loc.lng,
                    miles: Number(miles),
                    cuisines: cuisinesArr
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

    function authHeaderIfAny() {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-4">
                <h2 className="text-xl font-semibold">Find me a place to eat 🎲</h2>
                <p className="text-xs text-slate-500 mt-1">
                    Tip: Geolocation requires HTTPS (or http://localhost). If blocked, enter an address/ZIP.
                </p>

                <div className="mt-4 grid gap-3">
                    <div className="grid sm:grid-cols-4 gap-3">
                        <label className="block text-sm">Miles
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
                        <label className="block text-sm">Address or ZIP (fallback)
                            <input
                                placeholder="e.g., 10001 or 1600 Amphitheatre Pkwy"
                                className="mt-1 w-full rounded-lg border p-2"
                                value={addr}
                                onChange={(e) => setAddr(e.target.value)}
                            />
                        </label>
                        <div className="sm:col-span-2 flex items-end gap-2">
                            <button
                                onClick={doPick}
                                disabled={loading}
                                className="w-full rounded-lg bg-indigo-600 text-white py-2 font-medium disabled:opacity-60"
                            >
                                {loading ? 'Rolling…' : 'Roll the dice'}
                            </button>
                            {picksReady && (
                                <button
                                    onClick={doPick}
                                    disabled={loading}
                                    className="rounded-lg border px-3 py-2 font-medium disabled:opacity-60"
                                >
                                    Re-roll
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Cuisine radios */}
                    <div className="rounded-xl border p-3">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">Cuisine preferences</div>
                            <button
                                type="button"
                                className="text-xs underline"
                                onClick={clearCuisines}
                                disabled={selectedCuisines.length === 0}
                            >
                                No preference
                            </button>
                        </div>

                        <div className="mt-3 grid sm:grid-cols-3 gap-2">
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

                        {selectedCuisines.length > 0 && (
                            <p className="mt-2 text-xs text-slate-500">
                                Selected: {selectedCuisines.join(', ')}
                            </p>
                        )}
                    </div>

                </div>

                {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            </section>

            {primary && (
                <section className="space-y-4">
                    <h3 className="text-lg font-semibold">Primary Pick</h3>
                    <RestaurantCard r={primary} onFav={() => favorite(primary.placeId)} onDislike={() => dislike(primary)} />
                </section>
            )}

            {!!backups.length && (
                <section className="space-y-4">
                    <h3 className="text-lg font-semibold">Backups</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {backups.map((b, i) => (
                            <RestaurantCard key={i} r={b} onFav={() => favorite(b.placeId)} onDislike={() => dislike(b)} />
                        ))}
                    </div>
                </section>
            )}

            {picksReady && (
                <section className="rounded-2xl border bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">Share with friends and vote</div>
                        <button
                            onClick={startGroupVote}
                            className="rounded-lg bg-slate-900 text-white px-3 py-2"
                        >
                            Start group vote
                        </button>
                    </div>
                    {groupLink && (
                        <div className="mt-3 text-sm">
                            Share this link:{" "}
                            <a className="underline" href={groupLink} target="_blank" rel="noreferrer">
                                {groupLink}
                            </a>
                            <button
                                type="button"
                                className="rounded-lg border px-2 py-1 text-xs"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(groupLink);
                                        alert('Link copied!');
                                    } catch {
                                        alert('Could not copy; select and copy manually.');
                                    }
                                }}
                            >
                                Copy
                            </button>
                        </div>
                    )}
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
