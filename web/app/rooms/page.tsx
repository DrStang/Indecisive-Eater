'use client';
import axios from 'axios';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface Room {
    id: number;
    slug: string;
    createdAt: string;
    expiresAt: string;
    candidates: any[];
    participants: number;
    status: 'active' | 'expired';
}

export default function RoomsPage() {
    const router = useRouter();
    const [myRooms, setMyRooms] = useState<Room[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [numCandidates, setNumCandidates] = useState(5);
    const [loading, setLoading] = useState(false);
    const [joinSlug, setJoinSlug] = useState('');

    // Filters for room creation
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [miles, setMiles] = useState(5);
    const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);

    const CUISINES = [
        'thai', 'italian', 'mexican', 'japanese', 'chinese',
        'indian', 'american', 'mediterranean', 'korean', 'vietnamese'
    ];

    useEffect(() => {
        // Try to get user's location
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setLat(pos.coords.latitude);
                    setLng(pos.coords.longitude);
                },
                (err) => console.error('Location error:', err)
            );
        }
    }, []);

    async function createRoom() {
        if (!lat || !lng) {
            alert('Location is required to create a room');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.post(
                `${API}/api/rooms`,
                {
                    lat,
                    lng,
                    miles: Number(miles),
                    cuisines: selectedCuisines,
                    numCandidates: Number(numCandidates)
                },
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );

            // Navigate to the room
            router.push(`/rooms/${data.slug}`);
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to create room');
        } finally {
            setLoading(false);
        }
    }

    function joinRoom() {
        if (!joinSlug.trim()) return;
        router.push(`/rooms/${joinSlug.trim()}`);
    }

    function toggleCuisine(c: string) {
        setSelectedCuisines((arr) =>
            arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <section className="rounded-2xl border bg-white p-6">
                <h1 className="text-2xl font-bold mb-1">Voting Rooms</h1>
                <p className="text-sm text-slate-600">
                    Create a room and invite friends to swipe and vote together
                </p>
            </section>

            {/* Join Room */}
            <section className="rounded-2xl border bg-white p-6">
                <h2 className="text-lg font-semibold mb-3">Join a Room</h2>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Enter room code (e.g., abc123)"
                        className="flex-1 rounded-lg border p-2"
                        value={joinSlug}
                        onChange={(e) => setJoinSlug(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                    />
                    <button
                        onClick={joinRoom}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                    >
                        Join Room
                    </button>
                </div>
            </section>

            {/* Create Room */}
            <section className="rounded-2xl border bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Create a New Room</h2>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                    >
                        {showCreateForm ? 'Cancel' : '+ New Room'}
                    </button>
                </div>

                {showCreateForm && (
                    <div className="space-y-4 p-4 rounded-lg border bg-slate-50">
                        {/* Location status */}
                        {lat && lng ? (
                            <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                                ✓ Location detected ({lat.toFixed(4)}, {lng.toFixed(4)})
                            </div>
                        ) : (
                            <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm">
                                Waiting for location permission...
                            </div>
                        )}

                        {/* Number of candidates */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Number of restaurants to vote on
                            </label>
                            <input
                                type="number"
                                min={3}
                                max={10}
                                value={numCandidates}
                                onChange={(e) => setNumCandidates(Number(e.target.value))}
                                className="w-full rounded-lg border p-2"
                            />
                        </div>

                        {/* Miles */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Search radius (miles)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                step={0.5}
                                value={miles}
                                onChange={(e) => setMiles(Number(e.target.value))}
                                className="w-full rounded-lg border p-2"
                            />
                        </div>

                        {/* Cuisines */}
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Cuisine preferences (optional)
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

                        {/* Create button */}
                        <button
                            onClick={createRoom}
                            disabled={loading || !lat || !lng}
                            className="w-full py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Room'}
                        </button>
                    </div>
                )}
            </section>

            {/* How it works */}
            <section className="rounded-xl border bg-gradient-to-br from-purple-50 to-pink-50 p-6">
                <h3 className="font-semibold text-purple-900 mb-3">How Voting Rooms Work</h3>
                <ol className="text-sm text-purple-800 space-y-2">
                    <li className="flex items-start gap-2">
                        <span className="font-bold">1.</span>
                        <span>Create a room with your preferred filters</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="font-bold">2.</span>
                        <span>Share the room code with your friends</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="font-bold">3.</span>
                        <span>Everyone swipes left (no) or right (yes) on each restaurant</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="font-bold">4.</span>
                        <span>See real-time results and find the places everyone loves!</span>
                    </li>
                </ol>
            </section>
        </div>
    );
}
