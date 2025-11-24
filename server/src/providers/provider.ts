import type { ProviderPlace } from '../types';


export interface PlacesProvider {
    searchNearby(opts: {
        lat: number;
        lng: number;
        miles: number;
        cuisines?: string[]; // lowercase
    }): Promise<ProviderPlace[]>;
}