'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

type Row = {
    id: number;
    created_at: string;
    primary_name: string;
    primary_address: string;
    primary_rating: number | null;
    b1_name?: string | null;
    b2_name?: string | null;
};

export default function HistoryPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    async function load() {
        setErr(null);
        try {
            if (!token) {
                setErr('Please log in to view history.');
                setRows([]);
                return;
            }
            const { data } = await axios.get(`${API}/api/choices`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setRows(data || []);
        } catch (e: any) {
            setErr(e?.message || 'Failed to load history');
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">History</h2>
            {err && <p className="text-rose-600 text-sm">{err}</p>}
            {!err && rows.length === 0 && <p className="text-sm text-slate-600">No history yet.</p>}
            <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                    <tr>
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Primary</th>
                        <th className="text-left p-3">Backup 1</th>
                        <th className="text-left p-3">Backup 2</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((r) => (
                        <tr key={r.id} className="border-t">
                            <td className="p-3">{new Date(r.created_at).toLocaleString()}</td>
                            <td className="p-3">
                                <div className="font-medium">{r.primary_name}</div>
                                <div className="text-slate-500">{r.primary_address}</div>
                            </td>
                            <td className="p-3">{r.b1_name || <span className="text-slate-400">—</span>}</td>
                            <td className="p-3">{r.b2_name || <span className="text-slate-400">—</span>}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
