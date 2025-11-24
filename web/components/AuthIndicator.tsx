'use client';
import { useEffect, useState } from 'react';

export default function AuthIndicator() {
    const [signedIn, setSignedIn] = useState(false);

    useEffect(() => {
        const read = () => setSignedIn(!!localStorage.getItem('token'));
        read();
        const onAuth = () => read();
        window.addEventListener('auth-change', onAuth);
        window.addEventListener('storage', onAuth); // other tabs
        return () => {
            window.removeEventListener('auth-change', onAuth);
            window.removeEventListener('storage', onAuth);
        };
    }, []);

    if (!signedIn) return <span className="text-xs text-slate-500">Guest</span>;

    return (
        <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            <span className="text-xs text-emerald-700">Signed in</span>
            <button
                className="text-xs underline"
                onClick={() => {
                    localStorage.removeItem('token');
                    window.dispatchEvent(new Event('auth-change')); // << notify header
                }}
            >
                Log out
            </button>
        </div>
    );
}