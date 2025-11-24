'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import RestaurantCard from '../../components/RestaurantCard';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

export default function FavoritesPage() {
    const [items, setItems] = useState<any[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    async function load() {
        setErr(null);
        try {
            if (!token) {
                setErr('Please log in to view favorites.');
                setItems([]);
                return;
            }
            const { data } = await axios.get(`${API}/api/favorites`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setItems(data || []);
        } catch (e: any) {
            setErr(e?.message || 'Failed to load favorites');
        }
    }

    async function removeFav(placeId: number) {
        if (!token) return;
        await axios.delete(`${API}/api/favorites/${placeId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        setItems((arr) => arr.filter((x) => x.id !== placeId));
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Your Favorites</h2>
            {err && <p className="text-rose-600 text-sm">{err}</p>}
            {!err && items.length === 0 && <p className="text-sm text-slate-600">No favorites yet.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
                {items.map((r) => (
                    <RestaurantCard
                        key={r.id}
                        r={r}
                        onFav={() => removeFav(r.id)} // reuse button to “remove” here
                    />
                ))}
            </div>
        </div>
    );
}
