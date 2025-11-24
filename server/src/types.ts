export type ProviderName = 'google' | 'yelp' | 'osm' | 'foursquare';


export interface ProviderPlace {
    provider: ProviderName;
    providerId: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    rating?: number;
    cuisines?: string[];
    description?: string;
}