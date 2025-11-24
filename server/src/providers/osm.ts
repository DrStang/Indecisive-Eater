// server/src/providers/osm.ts
import axios from 'axios';
import type { PlacesProvider } from './provider';
import type { ProviderPlace } from '../types';

function buildQuery(lat: number, lng: number, radius: number, cuisines?: string[]) {
    const cuisineFilter = cuisines && cuisines.length
        ? `[cuisine~"${cuisines.map(c => c.replace(/"/g, '')).join('|')}",i]`
        : '';
    return `
[out:json][timeout:25];
(
  node[amenity=restaurant]${cuisineFilter}(around:${radius},${lat},${lng});
  way[amenity=restaurant]${cuisineFilter}(around:${radius},${lat},${lng});
  relation[amenity=restaurant]${cuisineFilter}(around:${radius},${lat},${lng});
);
out center tags 50;`;
}

export const OSMProvider: PlacesProvider = {
    async searchNearby({ lat, lng, miles, cuisines }) {
        const radius = Math.round(miles * 1609.34);
        const url = process.env.OSM_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
        const { data } = await axios.post(url, buildQuery(lat, lng, radius, cuisines), {
            headers: { 'Content-Type': 'text/plain' }
        });

        const elements = data?.elements || [];
        const list: ProviderPlace[] = elements.map((el: any) => {
            const id = `${el.type}/${el.id}`;
            const center = el.center || { lat: el.lat, lon: el.lon };
            const tags = el.tags || {};
            const addrInline = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
            const cuisinesCsv = (tags.cuisine || '').toLowerCase();
            return {
                provider: 'osm',
                providerId: id,
                name: tags.name || 'Unnamed restaurant',
                address: tags['addr:full'] || addrInline || undefined,
                lat: center?.lat,
                lng: center?.lon,
                rating: undefined,
                description: cuisinesCsv || undefined,
                cuisines: cuisinesCsv ? cuisinesCsv.split(';').map((s: string) => s.trim()) : []
            };
        });

        const seen = new Set<string>();
        return list.filter(p => (seen.has(p.providerId) ? false : (seen.add(p.providerId), true)));
    }
};
