'use client';
import { useMemo, useState, useEffect } from 'react';

export default function AuthIndicator() {
    const [signedIn, setSignedIn] = useState(false);

    useEffect(() => {
        const sync = () => setSignedIn(!!localStorage.getItem('token'));
        sync();
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    if (!signedIn) return <span className="text-xs text-slate-500">Guest</span>;

    return (
        <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-xs text-emerald-700">Signed in</span>
            <button
                className="text-xs underline"
                onClick={() => { localStorage.removeItem('token'); location.reload(); }}
            >
                Log out
            </button>
        </div>
    );
}
