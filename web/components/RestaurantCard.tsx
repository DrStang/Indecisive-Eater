'use client';

type Props = {
    r: any;
    onFav?: () => void;
    onDislike?: () => void;
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

export default function RestaurantCard({ r, onFav, onDislike }: Props) {
    const mapUrl = staticMapUrl(r);

    return (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
            {/* 2-col: content left, rating right (fixed min width) */}
            <div className="grid grid-cols-[1fr,auto] gap-4 items-start">
                <div>
                    <h3 className="text-lg font-semibold leading-tight">{r.name}</h3>
                    {r.address && (
                        <p className="text-sm text-slate-600 mt-0.5">{r.address}</p>
                    )}
                    {r.description && (
                        <p className="mt-2 text-sm">{r.description}</p>
                    )}

                    {/* Static map thumbnail for stable layout */}
                    {mapUrl && (
                        <a
                            href={mapsDirectionsUrl(r)}
                            target="_blank"
                            rel="noreferrer"
                            className="block mt-3"
                            aria-label={`Open directions to ${r.name} in Google Maps`}
                        >
                            <img
                                src={mapUrl}
                                alt={`Map of ${r.name}`}
                                className="w-full h-36 object-cover rounded-xl border"
                                loading="lazy"
                            />
                        </a>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        <a
                            href={mapsDirectionsUrl(r)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg border text-slate-700 hover:bg-slate-50"
                        >
                            Open in Maps
                        </a>
                        {onFav && (
                            <button
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white"
                                onClick={onFav}
                            >
                                Favorite
                            </button>
                        )}
                        {onDislike && (
                            <button
                                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white"
                                onClick={onDislike}
                            >
                                Dislike
                            </button>
                        )}
                    </div>
                </div>

                {/* Rating column stays aligned */}
                <div className="min-w-[64px] text-right">
                    {typeof r.rating === 'number' && (
                        <div>
                            <div className="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white text-lg font-semibold px-3 py-1">
                                {r.rating.toFixed(1)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">rating</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
