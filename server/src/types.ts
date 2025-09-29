export type ProviderName = 'google' | 'yelp' | 'osm';


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