'use client';

type Props = {
    r: any;
    onFav?: () => void;
    onDislike?: () => void;
    onNotNow?: () => void;
};

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

function mapsDirectionsUrl(r: any) {
    const dest =
        (r.lat != null && r.lng != null)
            ? `${r.lat},${r.lng}`
            : encodeURIComponent(`${r.name} ${r.address || ''}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function staticMapUrl(r: any) {
    if (!GMAPS_KEY) return null;
    const center =
        (r.lat != null && r.lng != null)
            ? `${r.lat},${r.lng}`
            : `${r.name} ${r.address || ''}`;
    const marker = `color:red|${center}`;
    const params = new URLSearchParams({
        key: GMAPS_KEY,
        center,
        zoom: '15',
        size: '600x300',
        scale: '2',
        maptype: 'roadmap',
        markers: marker
    });
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export default function RestaurantCard({ r, onFav, onDislike, onNotNow }: Props) {
    const mapUrl = staticMapUrl(r);

    return (
        <div className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            {/* Header with title and rating */}
            <div className="grid grid-cols-[1fr,auto] gap-4 items-start mb-3">
                <div>
                    <h3 className="text-lg font-semibold leading-tight">{r.name}</h3>
                    {r.address && (
                        <p className="text-sm text-slate-600 mt-0.5">{r.address}</p>
                    )}
                </div>

                {/* Rating badge */}
                {typeof r.rating === 'number' && (
                    <div className="min-w-[64px] text-right">
                        <div className="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white text-lg font-semibold px-3 py-1">
                            {r.rating.toFixed(1)}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">rating</div>
                    </div>
                )}
            </div>

            {/* Cuisines and price */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {r.cuisines && r.cuisines.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {r.cuisines.slice(0, 3).map((c: string, i: number) => (
                            <span
                                key={i}
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium"
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                )}

                {r.price_level && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                        {'$'.repeat(r.price_level)}
                    </span>
                )}
            </div>

            {/* Description */}
            {r.description && (
                <p className="text-sm text-slate-700 mb-3 line-clamp-2">
                    {r.description}
                </p>
            )}

            {/* Recommendation reasons */}
            {r.reasons && r.reasons.length > 0 && (
                <div className="mb-3 p-3 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                    <div className="text-xs font-semibold text-indigo-900 mb-1 flex items-center gap-1">
                        <span>✨</span>
                        <span>Why this place:</span>
                    </div>
                    <ul className="text-xs text-indigo-800 space-y-0.5">
                        {r.reasons.map((reason: string, i: number) => (
                            <li key={i} className="flex items-start gap-1">
                                <span className="text-indigo-400 mt-0.5">•</span>
                                <span>{reason}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Static map thumbnail */}
            {mapUrl && (
                <a
                    href={mapsDirectionsUrl(r)}
                    target="_blank"
                    rel="noreferrer"
                    className="block mb-3"
                    aria-label={`Open directions to ${r.name} in Google Maps`}
                >
                    <img
                        src={mapUrl}
                        alt={`Map of ${r.name}`}
                        className="w-full h-36 object-cover rounded-xl border hover:opacity-90 transition-opacity"
                        loading="lazy"
                    />
                </a>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
                <a
                    href={mapsDirectionsUrl(r)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg border text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                    📍 Open in Maps
                </a>

                {onFav && (
                    <button
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium transition-colors"
                        onClick={onFav}
                    >
                        ❤️ Favorite
                    </button>
                )}

                {onNotNow && (
                    <button
                        className="px-3 py-1.5 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 text-sm font-medium transition-colors"
                        onClick={onNotNow}
                    >
                        ⏰ Not Now
                    </button>
                )}

                {onDislike && (
                    <button
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-sm font-medium transition-colors"
                        onClick={onDislike}
                    >
                        ❌ Dislike
                    </button>
                )}
            </div>
        </div>
    );
}

