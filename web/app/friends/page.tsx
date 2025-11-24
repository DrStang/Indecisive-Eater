'use client';
import axios from 'axios';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface Friend {
    id: number;
    userId: number;
    friendId: number;
    status: 'pending' | 'accepted';
    createdAt: string;
    friend: {
        id: number;
        email: string;
    };
    user: {
        id: number;
        email: string;
    };
}

interface Activity {
    id: number;
    userId: number;
    action: string;
    placeName?: string;
    placeAddress?: string;
    createdAt: string;
    user: {
        email: string;
    };
}

export default function FriendsPage() {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [friendEmail, setFriendEmail] = useState('');
    const [activeTab, setActiveTab] = useState<'friends' | 'activity'>('friends');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadFriends();
        loadActivity();
    }, []);

    async function loadFriends() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('Please log in to use the friends feature');
                return;
            }
            const { data } = await axios.get(`${API}/api/friends`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Separate accepted friends from pending requests
            const accepted = data.filter((f: Friend) => f.status === 'accepted');
            const pending = data.filter((f: Friend) => f.status === 'pending');

            setFriends(accepted);
            setPendingRequests(pending);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Failed to load friends');
        }
    }

    async function loadActivity() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const { data } = await axios.get(`${API}/api/friends/activity`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setActivities(data);
        } catch (e: any) {
            console.error('Failed to load activity', e);
        }
    }

    async function sendFriendRequest() {
        if (!friendEmail.trim()) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API}/api/friends/request`,
                { friendEmail },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setFriendEmail('');
            alert('Friend request sent!');
            loadFriends();
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to send friend request');
        }
    }

    async function acceptFriend(friendshipId: number) {
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API}/api/friends/${friendshipId}/accept`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            alert('Friend request accepted!');
            loadFriends();
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to accept friend request');
        }
    }

    function formatTime(dateString: string) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    function getActivityIcon(action: string) {
        if (action.includes('favorite')) return '❤️';
        if (action.includes('visited')) return '✅';
        if (action.includes('rolled')) return '🎲';
        if (action.includes('list')) return '📝';
        return '📍';
    }

    if (error && !friends.length) {
        return (
            <div className="rounded-2xl border bg-white p-6">
                <p className="text-rose-600">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <section className="rounded-2xl border bg-white p-6">
                <h1 className="text-2xl font-bold mb-1">Friends</h1>
                <p className="text-sm text-slate-600">
                    Connect with friends and see what they're eating
                </p>
            </section>

            {/* Add Friend */}
            <section className="rounded-2xl border bg-white p-6">
                <h2 className="text-lg font-semibold mb-3">Add a Friend</h2>
                <div className="flex gap-2">
                    <input
                        type="email"
                        placeholder="Friend's email address"
                        className="flex-1 rounded-lg border p-2"
                        value={friendEmail}
                        onChange={(e) => setFriendEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendFriendRequest()}
                    />
                    <button
                        onClick={sendFriendRequest}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                    >
                        Send Request
                    </button>
                </div>
            </section>

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
                <section className="rounded-2xl border bg-white p-6">
                    <h2 className="text-lg font-semibold mb-3">
                        Pending Requests ({pendingRequests.length})
                    </h2>
                    <div className="space-y-2">
                        {pendingRequests.map((req) => (
                            <div
                                key={req.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-slate-50"
                            >
                                <div>
                                    <p className="font-medium">{req.user.email}</p>
                                    <p className="text-xs text-slate-600">
                                        Sent {formatTime(req.createdAt)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => acceptFriend(req.id)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                                >
                                    Accept
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b">
                <button
                    onClick={() => setActiveTab('friends')}
                    className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                        activeTab === 'friends'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                >
                    My Friends ({friends.length})
                </button>
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                        activeTab === 'activity'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                >
                    Activity Feed
                </button>
            </div>

            {/* Friends List */}
            {activeTab === 'friends' && (
                <section className="space-y-3">
                    {friends.length === 0 ? (
                        <div className="rounded-2xl border bg-white p-12 text-center">
                            <p className="text-slate-500 mb-4">No friends yet</p>
                            <p className="text-sm text-slate-400">
                                Add friends to see their restaurant activity and share recommendations
                            </p>
                        </div>
                    ) : (
                        friends.map((friend) => (
                            <div
                                key={friend.id}
                                className="rounded-xl border bg-white p-4 flex items-center justify-between hover:border-indigo-200 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                                        {friend.friend.email.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-medium">{friend.friend.email}</p>
                                        <p className="text-xs text-slate-600">
                                            Friends since {formatTime(friend.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-emerald-600 text-sm font-medium">✓ Friends</span>
                            </div>
                        ))
                    )}
                </section>
            )}

            {/* Activity Feed */}
            {activeTab === 'activity' && (
                <section className="space-y-3">
                    {activities.length === 0 ? (
                        <div className="rounded-2xl border bg-white p-12 text-center">
                            <p className="text-slate-500 mb-4">No activity yet</p>
                            <p className="text-sm text-slate-400">
                                Friend activity will appear here when they favorite places or roll for restaurants
                            </p>
                        </div>
                    ) : (
                        activities.map((activity) => (
                            <div
                                key={activity.id}
                                className="rounded-xl border bg-white p-4 hover:border-indigo-200 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="text-2xl">{getActivityIcon(activity.action)}</div>
                                    <div className="flex-1">
                                        <p className="text-sm">
                                            <span className="font-medium">{activity.user.email}</span>
                                            {' '}
                                            <span className="text-slate-600">{activity.action}</span>
                                        </p>
                                        {activity.placeName && (
                                            <p className="text-sm font-semibold text-indigo-600 mt-1">
                                                {activity.placeName}
                                            </p>
                                        )}
                                        {activity.placeAddress && (
                                            <p className="text-xs text-slate-500">{activity.placeAddress}</p>
                                        )}
                                        <p className="text-xs text-slate-400 mt-1">
                                            {formatTime(activity.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </section>
            )}
        </div>
    );
}
