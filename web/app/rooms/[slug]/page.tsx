'use client';
import axios from 'axios';
import { useState, useEffect, use } from 'react';
import SwipeableCard from '../../../components/SwipeableCard';
import RestaurantCard from '../../../components/RestaurantCard';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface RoomData {
    room: {
        slug: string;
        expiresAt: string;
    };
    candidates: any[];
    results: {
        placeId: number;
        yesCount: number;
        noCount: number;
        place: any;
    }[];
}

export default function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
    const resolvedParams = use(params);
    const slug = resolvedParams.slug;

    const [roomData, setRoomData] = useState<RoomData | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [joined, setJoined] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadRoom();
        const interval = setInterval(loadRoom, 5000); // Refresh every 5s
        return () => clearInterval(interval);
    }, [slug]);

    async function loadRoom() {
        try {
            const { data } = await axios.get(`${API}/api/rooms/${slug}`);
            setRoomData(data);
            setLoading(false);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Room not found');
            setLoading(false);
        }
    }

    async function joinRoom() {
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API}/api/rooms/${slug}/join`,
                {},
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            setJoined(true);
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to join room');
        }
    }

    async function swipe(placeId: number, vote: 'yes' | 'no') {
        try {
            await axios.post(`${API}/api/rooms/${slug}/swipe`, {
                placeId,
                vote
            });

            // Move to next candidate
            if (roomData && currentIndex < roomData.candidates.length - 1) {
                setCurrentIndex(currentIndex + 1);
            } else {
                // All done, show results
                setShowResults(true);
            }
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to record vote');
        }
    }

    if (loading) {
        return (
            <div className="rounded-2xl border bg-white p-12 text-center">
                <p className="text-slate-500">Loading room...</p>
            </div>
        );
    }

    if (error || !roomData) {
        return (
            <div className="rounded-2xl border bg-white p-6">
                <p className="text-rose-600">{error || 'Room not found'}</p>
                <a href="/rooms" className="text-sm text-indigo-600 underline mt-2 inline-block">
                    Back to Rooms
                </a>
            </div>
        );
    }

    const currentCandidate = roomData.candidates[currentIndex];
    const progress = ((currentIndex + 1) / roomData.candidates.length) * 100;

    return (
        <div className="space-y-6">
            {/* Room Header */}
            <section className="rounded-2xl border bg-white p-6">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h1 className="text-2xl font-bold">Voting Room</h1>
                        <p className="text-sm text-slate-600 mt-1">
                            Room Code: <span className="font-mono font-bold">{slug}</span>
                        </p>
                    </div>
                    <button
                        onClick={() => setShowResults(!showResults)}
                        className="px-4 py-2 rounded-lg border font-medium hover:bg-slate-50"
                    >
                        {showResults ? '← Back to Voting' : 'View Results'}
                    </button>
                </div>

                {/* Share button */}
                <button
                    onClick={() => {
                        const url = window.location.href;
                        navigator.clipboard.writeText(url);
                        alert('Room link copied to clipboard!');
                    }}
                    className="text-sm text-indigo-600 hover:underline"
                >
                    📋 Copy room link
                </button>
            </section>

            {/* Join prompt */}
            {!joined && !showResults && (
                <section className="rounded-2xl border bg-gradient-to-br from-indigo-50 to-purple-50 p-6 text-center">
                    <h2 className="text-xl font-bold mb-2">Join the Vote!</h2>
                    <p className="text-sm text-slate-600 mb-4">
                        Swipe through {roomData.candidates.length} restaurants and help choose where to eat
                    </p>
                    <button
                        onClick={joinRoom}
                        className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                    >
                        Start Voting
                    </button>
                </section>
            )}

            {/* Voting Interface */}
            {joined && !showResults && currentCandidate && (
                <section className="space-y-4">
                    {/* Progress */}
                    <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                            <span className="font-medium">
                                {currentIndex + 1} of {roomData.candidates.length}
                            </span>
                            <span className="text-slate-600">{progress.toFixed(0)}% complete</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 h-2 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    {/* Swipeable Card */}
                    <SwipeableCard
                        restaurant={currentCandidate}
                        onSwipeLeft={() => swipe(currentCandidate.id, 'no')}
                        onSwipeRight={() => swipe(currentCandidate.id, 'yes')}
                        onSwipeDown={() => swipe(currentCandidate.id, 'no')}
                    />

                    {/* Manual buttons */}
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => swipe(currentCandidate.id, 'no')}
                            className="px-6 py-3 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700"
                        >
                            👎 No
                        </button>
                        <button
                            onClick={() => swipe(currentCandidate.id, 'yes')}
                            className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                        >
                            👍 Yes
                        </button>
                    </div>
                </section>
            )}

            {/* All done message */}
            {joined && !showResults && !currentCandidate && (
                <section className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-teal-50 p-12 text-center">
                    <div className="text-5xl mb-4">🎉</div>
                    <h2 className="text-2xl font-bold mb-2">All Done!</h2>
                    <p className="text-slate-600 mb-4">
                        You've voted on all restaurants. Check out the results!
                    </p>
                    <button
                        onClick={() => setShowResults(true)}
                        className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                    >
                        View Results
                    </button>
                </section>
            )}

            {/* Results */}
            {showResults && roomData.results && (
                <section className="space-y-4">
                    <div className="rounded-2xl border bg-white p-6">
                        <h2 className="text-xl font-bold mb-2">Results</h2>
                        <p className="text-sm text-slate-600">
                            Ranked by yes votes
                        </p>
                    </div>

                    {roomData.results.length === 0 ? (
                        <div className="rounded-2xl border bg-white p-12 text-center">
                            <p className="text-slate-500">No votes yet. Start voting to see results!</p>
                        </div>
                    ) : (
                        roomData.results.map((result, idx) => (
                            <div key={result.placeId} className="relative">
                                <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-bold text-lg z-10">
                                    #{idx + 1}
                                </div>
                                <div className="rounded-xl border bg-white p-4">
                                    <div className="mb-3 flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">👍</span>
                                            <span className="font-bold text-emerald-600">{result.yesCount}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">👎</span>
                                            <span className="font-bold text-rose-600">{result.noCount}</span>
                                        </div>
                                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                                            <div
                                                className="bg-emerald-600 h-2 rounded-full"
                                                style={{
                                                    width: `${
                                                        (result.yesCount / (result.yesCount + result.noCount)) * 100
                                                    }%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <RestaurantCard r={result.place} />
                                </div>
                            </div>
                        ))
                    )}
                </section>
            )}
        </div>
    );
}
