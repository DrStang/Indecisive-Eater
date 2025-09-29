import axios from 'axios';
import type { PlacesProvider } from './provider';
import type { ProviderPlace } from '../types';


export const YelpProvider: PlacesProvider = {
    async searchNearby({ lat, lng, miles, cuisines }) {
        const radiusMeters = Math.min(Math.round(miles * 1609.34), 40000); // Yelp max 40km
        const headers = { Authorization: `Bearer ${process.env.YELP_API_KEY}` };
        const params: Record<string, any> = {
            latitude: lat,
            longitude: lng,
            radius: radiusMeters,
            categories: 'restaurants',
            limit: 50
        };
        if (cuisines?.length) params.term = cuisines.join(' ');
        const { data } = await axios.get('https://api.yelp.com/v3/businesses/search', { headers, params });
        return (data.businesses || []).map((b: any): ProviderPlace => ({
            provider: 'yelp',
            providerId: b.id,
            name: b.name,
            address: b.location?.display_address?.join(', '),
            lat: b.coordinates?.latitude,
            lng: b.coordinates?.longitude,
            rating: b.rating,
            description: (b.categories || []).map((c: any) => c.title).slice(0, 3).join(', ').toLowerCase(),
            cuisines: (b.categories || []).map((c: any) => c.alias.toLowerCase())
        }));
    }
};