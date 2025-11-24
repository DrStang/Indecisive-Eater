'use client';
import axios from 'axios';
import { useState, useEffect } from 'react';
import RestaurantCard from '../../components/RestaurantCard';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

interface List {
    id: number;
    name: string;
    description?: string;
    itemCount?: number;
}

interface ListItem {
    id: number;
    placeId: number;
    place: any;
}

export default function ListsPage() {
    const [lists, setLists] = useState<List[]>([]);
    const [selectedList, setSelectedList] = useState<List | null>(null);
    const [listItems, setListItems] = useState<ListItem[]>([]);
    const [pickedPlace, setPickedPlace] = useState<any>(null);

    // Create list form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [newListDesc, setNewListDesc] = useState('');

    // Add item form
    const [showAddForm, setShowAddForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadLists();
    }, []);

    async function loadLists() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('Please log in to use lists');
                return;
            }
            const { data } = await axios.get(`${API}/api/lists`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLists(data);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Failed to load lists');
        }
    }

    async function createList() {
        if (!newListName.trim()) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API}/api/lists`,
                { name: newListName, description: newListDesc },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNewListName('');
            setNewListDesc('');
            setShowCreateForm(false);
            loadLists();
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to create list');
        }
    }

    async function loadListItems(list: List) {
        setSelectedList(list);
        setPickedPlace(null);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`${API}/api/lists/${list.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setListItems(data.items || []);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Failed to load list items');
        }
    }

    async function searchPlaces() {
        if (!searchQuery.trim()) return;
        setLoading(true);
        try {
            // Search in favorites for now (you could add a dedicated search endpoint)
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`${API}/api/favorites`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Filter by search query
            const filtered = data.filter((fav: any) =>
                fav.place.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setSearchResults(filtered.map((f: any) => f.place));
        } catch (e: any) {
            alert('Search failed');
        } finally {
            setLoading(false);
        }
    }

    async function addToList(placeId: number) {
        if (!selectedList) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API}/api/lists/${selectedList.id}/items`,
                { placeId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setShowAddForm(false);
            setSearchQuery('');
            setSearchResults([]);
            loadListItems(selectedList);
            alert('Added to list!');
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to add to list');
        }
    }

    async function removeFromList(placeId: number) {
        if (!selectedList) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API}/api/lists/${selectedList.id}/items/${placeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            loadListItems(selectedList);
        } catch (e: any) {
            alert('Failed to remove from list');
        }
    }

    async function pickFromList() {
        if (!selectedList) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.post(
                `${API}/api/lists/${selectedList.id}/pick`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setPickedPlace(data.place);
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to pick from list');
        } finally {
            setLoading(false);
        }
    }

    if (error && !lists.length) {
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
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold">Smart Lists</h1>
                        <p className="text-sm text-slate-600 mt-1">
                            Create custom lists like "Want to Try", "Date Night", or "Bucket List"
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                    >
                        + New List
                    </button>
                </div>

                {/* Create List Form */}
                {showCreateForm && (
                    <div className="p-4 rounded-lg border bg-slate-50 space-y-3">
                        <input
                            type="text"
                            placeholder="List name (e.g., Date Night Spots)"
                            className="w-full rounded-lg border p-2"
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Description (optional)"
                            className="w-full rounded-lg border p-2"
                            value={newListDesc}
                            onChange={(e) => setNewListDesc(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={createList}
                                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium"
                            >
                                Create
                            </button>
                            <button
                                onClick={() => setShowCreateForm(false)}
                                className="px-4 py-2 rounded-lg border"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* Lists Grid */}
            <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {lists.map((list) => (
                    <button
                        key={list.id}
                        onClick={() => loadListItems(list)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                            selectedList?.id === list.id
                                ? 'border-indigo-600 bg-indigo-50'
                                : 'bg-white hover:border-indigo-300'
                        }`}
                    >
                        <h3 className="font-semibold text-lg">{list.name}</h3>
                        {list.description && (
                            <p className="text-sm text-slate-600 mt-1">{list.description}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                            {list.itemCount || 0} places
                        </p>
                    </button>
                ))}
            </section>

            {/* Selected List Details */}
            {selectedList && (
                <section className="space-y-4">
                    <div className="rounded-2xl border bg-white p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-bold">{selectedList.name}</h2>
                                {selectedList.description && (
                                    <p className="text-sm text-slate-600 mt-1">{selectedList.description}</p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={pickFromList}
                                    disabled={loading || listItems.length === 0}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    🎲 Pick Random
                                </button>
                                <button
                                    onClick={() => setShowAddForm(!showAddForm)}
                                    className="px-4 py-2 rounded-lg border font-medium hover:bg-slate-50"
                                >
                                    + Add Place
                                </button>
                            </div>
                        </div>

                        {/* Add Place Form */}
                        {showAddForm && (
                            <div className="p-4 rounded-lg border bg-slate-50 space-y-3 mb-4">
                                <p className="text-sm text-slate-600">
                                    Search from your favorites to add to this list
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Search favorites..."
                                        className="flex-1 rounded-lg border p-2"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    <button
                                        onClick={searchPlaces}
                                        disabled={loading}
                                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium"
                                    >
                                        Search
                                    </button>
                                </div>
                                {searchResults.length > 0 && (
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {searchResults.map((place) => (
                                            <div
                                                key={place.id}
                                                className="flex items-center justify-between p-3 bg-white rounded-lg border"
                                            >
                                                <div>
                                                    <p className="font-medium">{place.name}</p>
                                                    <p className="text-xs text-slate-600">{place.address}</p>
                                                </div>
                                                <button
                                                    onClick={() => addToList(place.id)}
                                                    className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-sm"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {listItems.length === 0 && (
                            <p className="text-center text-slate-500 py-8">
                                No places in this list yet. Add some from your favorites!
                            </p>
                        )}
                    </div>

                    {/* Picked Place */}
                    {pickedPlace && (
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold">🎉 Your Pick!</h3>
                            <RestaurantCard r={pickedPlace} />
                        </div>
                    )}

                    {/* List Items */}
                    {listItems.length > 0 && !pickedPlace && (
                        <div className="grid sm:grid-cols-2 gap-4">
                            {listItems.map((item) => (
                                <div key={item.id} className="relative">
                                    <RestaurantCard r={item.place} />
                                    <button
                                        onClick={() => removeFromList(item.placeId)}
                                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-600 text-white hover:bg-rose-700 flex items-center justify-center text-lg"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
