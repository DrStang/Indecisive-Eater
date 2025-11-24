// web/app/layout.tsx
'use client';
import Link from 'next/link';
import './globals.css';
import AuthIndicator from '../components/AuthIndicator'; // <-- add
import { useEffect } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    // Register service worker for PWA
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then((registration) => {
                    console.log('Service Worker registered:', registration);
                })
                .catch((error) => {
                    console.error('Service Worker registration failed:', error);
                });
        }
    }, []);

    return (
        <html lang="en">
        <head>
            <link rel="manifest" href="/manifest.json" />
            <meta name="theme-color" content="#4f46e5" />
            <meta name="description" content="Never be indecisive about where to eat again!" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link href="/" className="text-xl font-bold">Indecisive Eater</Link>
                <nav className="flex items-center gap-4 text-sm">
                    <Link href="/" className="hover:underline">Home</Link>
                    <Link href="/lists" className="hover:underline">Lists</Link>
                    <Link href="/rooms" className="hover:underline">Rooms</Link>
                    <Link href="/friends" className="hover:underline">Friends</Link>
                    <Link href="/insights" className="hover:underline">Insights</Link>
                    <Link href="/favorites" className="hover:underline">Favorites</Link>
                    <Link href="/history" className="hover:underline">History</Link>
                </nav>
                <AuthIndicator />
            </div>
        </header>
        <main className="max-w-4xl mx-auto p-4">{children}</main>
        </body>
        </html>
    );
}
