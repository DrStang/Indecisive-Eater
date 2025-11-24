// server/src/providers/google.ts
import axios from 'axios';
import type { PlacesProvider } from './provider';
import type { ProviderPlace } from '../types';

const NEARBY = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const TEXT = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

// Synonym/expansion map → boosts recall for cuisine queries
const CUISINE_SYNONYMS: Record<string, string[]> = {
    bbq: ['bbq', 'barbecue', 'korean bbq', 'smokehouse'],
    mediterranean: ['mediterranean', 'greek', 'turkish', 'lebanese'],
    'middle eastern': ['middle eastern', 'lebanese', 'turkish', 'persian', 'iranian'],
    mexican: ['mexican', 'taqueria', 'tacos'],
    japanese: ['japanese', 'sushi', 'ramen', 'izakaya'],
    chinese: ['chinese', 'szechuan', 'sichuan', 'cantonese', 'dim sum'],
    korean: ['korean', 'korean bbq'],
    italian: ['italian', 'pasta', 'trattoria'],
    american: ['american', 'burgers', 'diner'],
    seafood: ['seafood', 'fish', 'oyster'],
    pizza: ['pizza', 'pizzeria'],
    indian: ['indian', 'curry', 'tandoori'],
    thai: ['thai'],
    vegan: ['vegan', 'plant based']
};

function expandCuisines(cuisines: string[]): string[] {
    const out = new Set<string>();
    for (const c of cuisines) {
        const key = c.toLowerCase();
        (CUISINE_SYNONYMS[key] || [key]).forEach(v => out.add(v));
    }
    return Array.from(out);
}

function toPlace(r: any): ProviderPlace {
    return {
        provider: 'google',
        providerId: r.place_id,
        name: r.name,
        address: r.formatted_address || r.vicinity,
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
        rating: r.rating,
        description: Array.isArray(r.types) ? r.types.slice(0, 3).join(', ') : undefined,
        cuisines: Array.isArray(r.types)
            ? r.types
                .filter((t: string) => !['restaurant','point_of_interest','establishment','food'].includes(t))
                .map((t: string) => t.toLowerCase())
            : []
    };
}

function dedupe(list: ProviderPlace[]) {
    const map = new Map<string, ProviderPlace>();
    for (const p of list) map.set(p.providerId, p);
    return Array.from(map.values());
}

export const GoogleProvider: PlacesProvider = {
    async searchNearby({ lat, lng, miles, cuisines }) {
        const key = process.env.GOOGLE_PLACES_API_KEY!;
        const radius = Math.round(miles * 1609.34);

        // No cuisines → generic Nearby
        if (!cuisines || cuisines.length === 0) {
            const { data } = await axios.get(NEARBY, {
                params: { key, location: `${lat},${lng}`, radius, type: 'restaurant' }
            });
            return (data.results || []).map(toPlace);
        }

        // With cuisines → Text Search per expanded phrase (higher recall)
        const phrases = expandCuisines(cuisines).slice(0, 6); // cap to avoid quota spikes
        const all: ProviderPlace[] = [];

        for (const phrase of phrases) {
            const { data } = await axios.get(TEXT, {
                params: { key, query: `${phrase} restaurant`, location: `${lat},${lng}`, radius }
            });
            all.push(...((data.results || []).map(toPlace)));
        }

        // Fallback: keyworded Nearby if Text Search found nothing
        if (all.length === 0) {
            const { data } = await axios.get(NEARBY, {
                params: { key, location: `${lat},${lng}`, radius, type: 'restaurant', keyword: phrases.join(' ') }
            });
            return (data.results || []).map(toPlace);
        }

        return dedupe(all);
    }
};
