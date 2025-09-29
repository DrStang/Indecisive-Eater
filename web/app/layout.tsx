// web/app/layout.tsx
import Link from 'next/link';
import './globals.css';
import AuthIndicator from '../components/AuthIndicator'; // <-- add


export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
        <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link href="/" className="text-xl font-bold">Indecisive Eater</Link>
                <nav className="flex items-center gap-4 text-sm">
                    <Link href="/" className="hover:underline">Home</Link>
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
