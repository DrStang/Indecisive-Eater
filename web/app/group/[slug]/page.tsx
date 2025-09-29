'use client';

import axios from 'axios';
import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

type GroupData = {
    group: {
        id: number;
        slug: string;
        primary_name: string;
        primary_address: string;
        primary_rating: number | null;
        primary_id: number;
        b1_name?: string | null;
        b1_id?: number | null;
        b2_name?: string | null;
        b2_id?: number | null;
    };
    votes: { choice: 'primary' | 'b1' | 'b2'; c: number }[];
};

export default function GroupVotePage() {
    const { slug } = useParams<{ slug: string }>();
    const [data, setData] = useState<GroupData | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const counts = useMemo(() => {
        const m = { primary: 0, b1: 0, b2: 0 } as Record<'primary'|'b1'|'b2', number>;
        (data?.votes || []).forEach(v => (m[v.choice] = Number(v.c) || 0));
        return m;
    }, [data]);

    const leader: null | 'primary' | 'b1' | 'b2' = useMemo(() => {
        const entries = Object.entries(counts) as Array<['primary'|'b1'|'b2', number]>;
        const max = Math.max(...entries.map(([, c]) => c), 0);
        const leaders = entries.filter(([, c]) => c === max).map(([k]) => k);
        return max > 0 && leaders.length === 1 ? leaders[0] : null;
    }, [counts]);

    async function load() {
        setErr(null);
        try {
            const { data } = await axios.get(`${API}/api/group/${slug}`);
            setData(data);
        } catch (e: any) {
            setErr(e?.response?.data?.error || e?.message || 'Failed to load group');
        }
    }

    useEffect(() => {
        load(); // initial
        const id = setInterval(load, 3000); // auto-refresh every 3s
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    async function vote(choice: 'primary' | 'b1' | 'b2') {
        if (!data) return;
        setBusy(true);
        try {
            const key = `group_voter_token_${slug}`;
            const existing = localStorage.getItem(key) || undefined;
            const { data: res } = await axios.post(`${API}/api/group/${slug}/vote`, {
                choice,
                voterToken: existing,
            });
            if (res?.voterToken) localStorage.setItem(key, res.voterToken);
            await load();
        } catch (e: any) {
            alert(e?.response?.data?.error || e?.message || 'Vote failed');
        } finally {
            setBusy(false);
        }
    }

    if (err) return <p className="text-rose-600">{err}</p>;
    if (!data) return <p>Loading…</p>;

    const g = data.group;

    function WinnerBadge({ show }: { show: boolean }) {
        return show ? (
            <span className="ml-2 inline-block rounded-full bg-emerald-600 text-white text-xs px-2 py-0.5">
        Winner so far
      </span>
        ) : null;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Group Vote</h2>
            <div className="rounded-2xl border bg-white p-4">
                <div className="mb-3">
                    <div className="font-medium">
                        Primary
                        <WinnerBadge show={leader === 'primary'} />
                    </div>
                    <div>{g.primary_name}</div>
                    <div className="text-slate-500 text-sm">{g.primary_address}</div>
                    <button
                        className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-60"
                        onClick={() => vote('primary')}
                        disabled={busy}
                    >
                        Vote Primary ({counts.primary})
                    </button>
                </div>

                {g.b1_name && (
                    <div className="mb-3 border-t pt-3">
                        <div className="font-medium">
                            Backup 1
                            <WinnerBadge show={leader === 'b1'} />
                        </div>
                        <div>{g.b1_name}</div>
                        <button
                            className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-60"
                            onClick={() => vote('b1')}
                            disabled={busy}
                        >
                            Vote Backup 1 ({counts.b1})
                        </button>
                    </div>
                )}

                {g.b2_name && (
                    <div className="border-t pt-3">
                        <div className="font-medium">
                            Backup 2
                            <WinnerBadge show={leader === 'b2'} />
                        </div>
                        <div>{g.b2_name}</div>
                        <button
                            className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-60"
                            onClick={() => vote('b2')}
                            disabled={busy}
                        >
                            Vote Backup 2 ({counts.b2})
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
