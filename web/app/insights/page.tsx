'use client';
import axios from 'axios';
import { useState, useEffect } from 'react';
import RestaurantCard from '../../components/RestaurantCard';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface Pattern {
    cuisinePreferences: { [key: string]: number };
    pricePreferences: { [key: number]: number };
    avgRating: number;
    totalChoices: number;
    favoriteCount: number;
    topCuisines: string[];
    preferredPriceLevel: number;
}

interface Recommendation {
    place: any;
    score: number;
    reasons: string[];
}

export default function InsightsPage() {
    const [patterns, setPatterns] = useState<Pattern | null>(null);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

    useEffect(() => {
        loadPatterns();
        getUserLocation();
    }, []);

    useEffect(() => {
        if (coords) {
            loadRecommendations();
        }
    }, [coords]);

    async function getUserLocation() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Try to get saved location from preferences
            const { data } = await axios.get(`${API}/api/preferences`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (data.default_lat && data.default_lng) {
                setCoords({ lat: data.default_lat, lng: data.default_lng });
                return;
            }

            // Fallback to browser geolocation
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setCoords({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        });
                    },
                    (error) => {
                        console.error('Geolocation error:', error);
                    }
                );
            }
        } catch (e: any) {
            console.error('Failed to get user location', e);
        }
    }

    async function loadPatterns() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('Please log in to see your insights');
                return;
            }
            setLoading(true);
            const { data } = await axios.get(`${API}/api/ml/patterns`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPatterns(data);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Failed to load patterns');
        } finally {
            setLoading(false);
        }
    }

    async function loadRecommendations() {
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
                setRecommendations(data);
            } else {
                console.error('Invalid recommendations data:', data);
                setRecommendations([]);
            }
        } catch (e: any) {
            console.error('Failed to load recommendations', e);
            setRecommendations([]);
        }
    }

    if (error && !patterns) {
        return (
            <div className="rounded-2xl border bg-white p-6">
                <p className="text-rose-600">{error}</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="rounded-2xl border bg-white p-12 text-center">
                <p className="text-slate-500">Loading your insights...</p>
            </div>
        );
    }

    if (!patterns || patterns.totalChoices === 0) {
        return (
            <div className="rounded-2xl border bg-white p-12 text-center">
                <h2 className="text-xl font-bold mb-2">No Data Yet</h2>
                <p className="text-slate-600 mb-4">
                    Start rolling for restaurants to see your personalized insights!
                </p>
                <a
                    href="/"
                    className="inline-block px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                >
                    Roll the Dice
                </a>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <section className="rounded-2xl border bg-white p-6">
                <h1 className="text-2xl font-bold mb-1">ML Insights</h1>
                <p className="text-sm text-slate-600">
                    Discover your eating patterns and personalized recommendations
                </p>
            </section>

            {/* Overview Stats */}
            <section className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
                    <div className="text-3xl font-bold text-indigo-600">{patterns.totalChoices}</div>
                    <div className="text-sm text-slate-600 mt-1">Total Rolls</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 p-6">
                    <div className="text-3xl font-bold text-emerald-600">{patterns.favoriteCount}</div>
                    <div className="text-sm text-slate-600 mt-1">Favorites</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 p-6">
                    <div className="text-3xl font-bold text-amber-600">
                        {patterns.avgRating ? patterns.avgRating.toFixed(1) : 'N/A'}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">Avg Rating</div>
                </div>
            </section>

            {/* Cuisine Preferences */}
            <section className="rounded-2xl border bg-white p-6">
                <h2 className="text-lg font-semibold mb-4">Your Cuisine Preferences</h2>
                {patterns.topCuisines && patterns.topCuisines.length > 0 ? (
                    <div className="space-y-3">
                        {patterns.topCuisines.map((cuisine, idx) => {
                            const count = patterns.cuisinePreferences[cuisine] || 0;
                            const percentage = (count / patterns.totalChoices) * 100;
                            return (
                                <div key={cuisine}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium capitalize">{cuisine}</span>
                                        <span className="text-sm text-slate-600">
                                            {count} times ({percentage.toFixed(0)}%)
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                        <div
                                            className="bg-gradient-to-r from-indigo-600 to-purple-600 h-2 rounded-full transition-all"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-slate-500 text-center py-4">
                        No cuisine data yet. Keep rolling!
                    </p>
                )}
            </section>

            {/* Price Preferences */}
            <section className="rounded-2xl border bg-white p-6">
                <h2 className="text-lg font-semibold mb-4">Price Preferences</h2>
                <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((level) => {
                        const count = patterns.pricePreferences[level] || 0;
                        const percentage = patterns.totalChoices > 0
                            ? (count / patterns.totalChoices) * 100
                            : 0;
                        const isPreferred = patterns.preferredPriceLevel === level;

                        return (
                            <div
                                key={level}
                                className={`p-4 rounded-lg border text-center ${
                                    isPreferred ? 'border-indigo-600 bg-indigo-50' : 'bg-slate-50'
                                }`}
                            >
                                <div className="text-2xl mb-1">{'$'.repeat(level)}</div>
                                <div className="text-sm font-medium text-slate-600">{count} times</div>
                                <div className="text-xs text-slate-500">{percentage.toFixed(0)}%</div>
                                {isPreferred && (
                                    <div className="text-xs text-indigo-600 font-semibold mt-1">
                                        Preferred
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ML Recommendations */}
            {recommendations.length > 0 && (
                <section className="space-y-4">
                    <div className="rounded-2xl border bg-white p-6">
                        <h2 className="text-lg font-semibold mb-2">
                            🤖 Personalized Recommendations
                        </h2>
                        <p className="text-sm text-slate-600 mb-4">
                            Based on your patterns, we think you'll love these places
                        </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        {recommendations.map((rec, idx) => (
                            <div key={idx} className="relative">
                                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center text-sm font-bold z-10">
                                    {rec.score}
                                </div>
                                <RestaurantCard
                                    r={{
                                        ...rec.place,
                                        reasons: rec.reasons
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Tips */}
            <section className="rounded-xl border bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
                <h3 className="font-semibold text-indigo-900 mb-2">💡 Pro Tips</h3>
                <ul className="text-sm text-indigo-800 space-y-1">
                    <li>• The more you use Indecisive Eater, the better your recommendations get</li>
                    <li>• Favorite places you love to help us learn your preferences</li>
                    <li>• Use the dislike button to avoid places you don't want to see again</li>
                    <li>• Your data is private and only used to improve your experience</li>
                </ul>
            </section>
        </div>
    );
}
