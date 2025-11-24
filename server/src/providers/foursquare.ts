// server/src/providers/foursquare.ts
import axios from 'axios';
import type { PlacesProvider } from './provider';
import type { ProviderPlace } from '../types';

const FOURSQUARE_API = 'https://places-api.foursquare.com/places/search';

// Map Foursquare categories to cuisine types
const CATEGORY_TO_CUISINE: Record<string, string[]> = {
    'bbq': ['bbq', 'barbecue'],
    'mediterranean': ['mediterranean', 'greek', 'turkish'],
    'middle eastern': ['middle eastern', 'lebanese', 'persian'],
    'mexican': ['mexican', 'taqueria'],
    'japanese': ['japanese', 'sushi', 'ramen'],
    'chinese': ['chinese', 'dim sum'],
    'korean': ['korean', 'korean bbq'],
    'italian': ['italian', 'pasta', 'pizza'],
    'american': ['american', 'burgers'],
    'seafood': ['seafood', 'fish'],
    'indian': ['indian', 'curry'],
    'thai': ['thai'],
    'vietnamese': ['vietnamese', 'pho'],
    'french': ['french', 'bistro'],
    'vegan': ['vegan', 'plant based'],
    'vegetarian': ['vegetarian']
};

function expandCuisines(cuisines: string[]): string {
    const expanded = new Set<string>();
    for (const c of cuisines) {
        const key = c.toLowerCase();
        const matches = CATEGORY_TO_CUISINE[key] || [key];
        matches.forEach(m => expanded.add(m));
    }
    return Array.from(expanded).join(',');
}

function extractCuisines(categories: any[]): string[] {
    if (!Array.isArray(categories)) return [];

    const cuisines = new Set<string>();
    for (const cat of categories) {
        if (cat.name) {
            const name = cat.name.toLowerCase();
            // Extract cuisine type from category name
            for (const [cuisine, keywords] of Object.entries(CATEGORY_TO_CUISINE)) {
                if (keywords.some(kw => name.includes(kw))) {
                    cuisines.add(cuisine);
                }
            }
            // Also add the category name itself if it looks like a cuisine
            if (!name.includes('restaurant') && !name.includes('food') && !name.includes('venue')) {
                cuisines.add(name.replace(/\s+restaurant$/i, '').trim());
            }
        }
    }
    return Array.from(cuisines);
}

function toPlace(result: any): ProviderPlace {
    const categories = result.categories || [];
    const location = result.geocodes?.main || result.location;

    return {
        provider: 'foursquare',
        providerId: result.fsq_id,
        name: result.name,
        address: result.location?.formatted_address ||
                 [result.location?.address, result.location?.locality, result.location?.region]
                    .filter(Boolean).join(', '),
        lat: location?.latitude,
        lng: location?.longitude,
        rating: result.rating ? result.rating / 2 : undefined, // Foursquare uses 0-10, normalize to 0-5
        cuisines: extractCuisines(categories),
        description: categories.slice(0, 3).map((c: any) => c.name).join(', ')
    };
}

export const FoursquareProvider: PlacesProvider = {
    async searchNearby({ lat, lng, miles, cuisines }) {
        const apiKey = process.env.FOURSQUARE_API_KEY;

        if (!apiKey) {
            console.warn('FOURSQUARE_API_KEY not set, skipping Foursquare provider');
            return [];
        }

        const radiusMeters = Math.min(Math.round(miles * 1609.34), 100000); // Foursquare max 100km

        const params: Record<string, any> = {
            ll: `${lat},${lng}`,
            radius: radiusMeters,
            categories: '13000', // Food category ID
            limit: 50,
            fields: 'fsq_id,name,location,geocodes,categories,rating,description'
        };

        // Add cuisine query if specified
        if (cuisines && cuisines.length > 0) {
            params.query = expandCuisines(cuisines);
        }

        try {
            const { data } = await axios.get(FOURSQUARE_API, {
                params,
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                    'X-Places-Api-Version': '2025-06-17'

                }
            });

            return (data.results || []).map(toPlace);
        } catch (error: any) {
            console.error('Foursquare API error:', error.response?.data || error.message);
            return [];
        }
    }
};



