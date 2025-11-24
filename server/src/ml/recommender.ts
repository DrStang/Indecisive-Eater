// server/src/ml/recommender.ts
import { pool } from '../db.js';

interface Place {
    provider: string;
    providerId: string;
    name: string;
    cuisines?: string[];
    price_level?: number;
    rating?: number;
    lat?: number;
    lng?: number;
    _weight?: number;
}

interface FilterOptions {
    price_min?: number;
    price_max?: number;
    vibes?: string[];
    dietary_restrictions?: string[];
    open_now?: boolean;
}

// Apply preference-based filtering
export function filterByPreferences(places: Place[], filters: FilterOptions): Place[] {
    return places.filter(p => {
        // Price filter
        if (filters.price_min && p.price_level && p.price_level < filters.price_min) {
            return false;
        }
        if (filters.price_max && p.price_level && p.price_level > filters.price_max) {
            return false;
        }

        // Dietary restrictions
        if (filters.dietary_restrictions && filters.dietary_restrictions.length > 0) {
            // This would need dietary_options from the place data
            // For now, we'll skip places we can't verify
        }

        // Vibes
        if (filters.vibes && filters.vibes.length > 0) {
            // This would need vibe data from the place
            // Implementation would check if place has any of the requested vibes
        }

        return true;
    });
}

// Weight places by user's favorites
export async function weightByFavorites(userId: number, places: Place[]): Promise<Place[]> {
    // Get user's favorited cuisines
    const [favorites] = await pool.query(
        `SELECT p.cuisine_csv, p.price_level, p.rating
         FROM favorites f
         JOIN places p ON p.id = f.place_id
         WHERE f.user_id = ?`,
        [userId]
    );

    if ((favorites as any[]).length === 0) {
        return places.map(p => ({ ...p, _weight: 1 }));
    }

    // Build preference profile
    const cuisinePreferences = new Map<string, number>();
    let avgPrice = 0;
    let priceCount = 0;

    for (const fav of favorites as any[]) {
        if (fav.cuisine_csv) {
            const cuisines = fav.cuisine_csv.split(',');
            for (const c of cuisines) {
                cuisinePreferences.set(c, (cuisinePreferences.get(c) || 0) + 1);
            }
        }
        if (fav.price_level) {
            avgPrice += fav.price_level;
            priceCount++;
        }
    }

    avgPrice = priceCount > 0 ? avgPrice / priceCount : 2;

    // Apply weights
    return places.map(p => {
        let weight = 1.0;

        // Cuisine match bonus
        if (p.cuisines) {
            for (const c of p.cuisines) {
                const pref = cuisinePreferences.get(c) || 0;
                weight += pref * 0.5;
            }
        }

        // Price similarity bonus
        if (p.price_level) {
            const priceDiff = Math.abs(p.price_level - avgPrice);
            weight += Math.max(0, 1 - priceDiff * 0.3);
        }

        // Rating bonus
        if (p.rating) {
            weight += (p.rating - 3.5) * 0.2;
        }

        return { ...p, _weight: weight };
    });
}

// ML-based recommendations
export async function getMLRecommendations(
    userId: number,
    places: Place[],
    context: { lat: number; lng: number; time_of_day: string }
): Promise<Place[]> {
    // Get user's interaction history
    const [interactions] = await pool.query(
        `SELECT features, interaction_type, label
         FROM ml_interactions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId]
    );

    if ((interactions as any[]).length === 0) {
        return places;
    }

    // Simple collaborative filtering based on patterns
    const positiveFeatures = (interactions as any[])
        .filter((i: any) => i.label === 'positive')
        .map((i: any) => JSON.parse(i.features));

    const negativeFeatures = (interactions as any[])
        .filter((i: any) => i.label === 'negative')
        .map((i: any) => JSON.parse(i.features));

    // Calculate similarity scores
    return places.map(p => {
        let score = p._weight || 1;

        // Compare with positive interactions
        for (const pos of positiveFeatures) {
            const similarity = calculateFeatureSimilarity(
                extractFeatures(p, context),
                pos
            );
            score += similarity * 0.3;
        }

        // Penalize for negative interactions
        for (const neg of negativeFeatures) {
            const similarity = calculateFeatureSimilarity(
                extractFeatures(p, context),
                neg
            );
            score -= similarity * 0.2;
        }

        return { ...p, _weight: score };
    });
}

// Analyze user patterns over time
export async function analyzeUserPatterns(userId: number): Promise<void> {
    // Get recent decisions
    const [decisions] = await pool.query(
        `SELECT time_of_day, day_of_week, filters_applied
         FROM decision_history_v2
         WHERE user_id = ? AND action = 'selected'
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId]
    );

    if ((decisions as any[]).length === 0) return;

    // Group by pattern (e.g., "friday_dinner", "weekend_brunch")
    const patterns = new Map<string, any>();

    for (const d of decisions as any[]) {
        const patternKey = `${d.day_of_week}_${d.time_of_day}`;

        if (!patterns.has(patternKey)) {
            patterns.set(patternKey, {
                time_of_day: d.time_of_day,
                day_of_week: d.day_of_week,
                cuisines: new Map<string, number>(),
                prices: [],
                count: 0,
            });
        }

        const pattern = patterns.get(patternKey)!;
        pattern.count++;

        try {
            const filters = JSON.parse(d.filters_applied || '{}');
            if (filters.cuisines) {
                for (const c of filters.cuisines) {
                    pattern.cuisines.set(c, (pattern.cuisines.get(c) || 0) + 1);
                }
            }
            if (filters.price_min || filters.price_max) {
                pattern.prices.push({ min: filters.price_min, max: filters.price_max });
            }
        } catch (e) {
            // Skip invalid JSON
        }
    }

    // Save patterns
    for (const [patternKey, data] of patterns) {
        if (data.count < 3) continue; // Need at least 3 occurrences

        const topCuisines = (Array.from(data.cuisines.entries()) as [string, number][])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([c]) => c);

        const avgPriceMin = data.prices.length > 0
            ? data.prices.reduce((sum: number, p: any) => sum + (p.min || 1), 0) / data.prices.length
            : 1;
        const avgPriceMax = data.prices.length > 0
            ? data.prices.reduce((sum: number, p: any) => sum + (p.max || 4), 0) / data.prices.length
            : 4;

        const confidence = Math.min(data.count / 10, 1.0);

        await pool.query(
            `INSERT INTO user_patterns 
             (user_id, pattern_type, time_of_day, day_of_week, preferred_cuisines, 
              preferred_price_range, frequency, confidence, last_occurred)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE
             preferred_cuisines = VALUES(preferred_cuisines),
             preferred_price_range = VALUES(preferred_price_range),
             frequency = frequency + 1,
             confidence = VALUES(confidence),
             last_occurred = CURRENT_TIMESTAMP`,
            [
                userId,
                patternKey,
                data.time_of_day,
                data.day_of_week,
                JSON.stringify(topCuisines),
                JSON.stringify([avgPriceMin, avgPriceMax]),
                data.count,
                confidence
            ]
        );
    }
}

// Get recommendation reasons
export async function getRecommendationReasons(
    userId: number,
    place: Place,
    userPrefs: any
): Promise<string[]> {
    const reasons: string[] = [];

    // Check if matches preferred cuisines
    if (userPrefs?.preferred_cuisines && place.cuisines) {
        const prefs = JSON.parse(userPrefs.preferred_cuisines || '[]');
        const matches = place.cuisines.filter(c => prefs.includes(c));
        if (matches.length > 0) {
            reasons.push(`Matches your ${matches.join(', ')} preference`);
        }
    }

    // Check if highly rated
    if (place.rating && place.rating >= 4.3) {
        reasons.push('Highly rated');
    }

    // Check if similar to favorites
    const [favorites] = await pool.query(
        `SELECT p.id, p.cuisine_csv
         FROM favorites f
         JOIN places p ON p.id = f.place_id
         WHERE f.user_id = ?
         LIMIT 10`,
        [userId]
    );

    if ((favorites as any[]).length > 0 && place.cuisines) {
        for (const fav of favorites as any[]) {
            if (!fav.cuisine_csv) continue;
            const favCuisines = fav.cuisine_csv.split(',');
            const overlap = place.cuisines.filter(c => favCuisines.includes(c));
            if (overlap.length > 0) {
                reasons.push('Similar to your favorites');
                break;
            }
        }
    }

    // Check if matches pattern
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
    const hour = new Date().getHours();
    const timeOfDay = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 22 ? 'dinner' : 'late_night';
    const patternKey = `${dayOfWeek}_${timeOfDay}`;

    const [patterns] = await pool.query(
        `SELECT preferred_cuisines
         FROM user_patterns
         WHERE user_id = ? AND pattern_type = ?
         LIMIT 1`,
        [userId, patternKey]
    );

    if ((patterns as any[]).length > 0 && place.cuisines) {
        const pattern = (patterns as any[])[0];
        const patternCuisines = JSON.parse(pattern.preferred_cuisines || '[]');
        const matches = place.cuisines.filter(c => patternCuisines.includes(c));
        if (matches.length > 0) {
            reasons.push(`Matches your usual ${timeOfDay} choice`);
        }
    }

    return reasons;
}

// Helper functions
function extractFeatures(place: Place, context: { lat: number; lng: number; time_of_day: string }): any {
    return {
        cuisines: place.cuisines || [],
        price: place.price_level || 2,
        rating: place.rating || 0,
        time_of_day: context.time_of_day,
    };
}

function calculateFeatureSimilarity(features1: any, features2: any): number {
    let similarity = 0;
    let count = 0;

    // Cuisine overlap
    if (features1.cuisines && features2.cuisines) {
        const overlap = features1.cuisines.filter((c: string) =>
            features2.cuisines.includes(c)
        ).length;
        similarity += overlap / Math.max(features1.cuisines.length, features2.cuisines.length, 1);
        count++;
    }

    // Price similarity
    if (features1.price && features2.price) {
        similarity += 1 - Math.abs(features1.price - features2.price) / 3;
        count++;
    }

    // Time of day match
    if (features1.time_of_day && features2.time_of_day) {
        similarity += features1.time_of_day === features2.time_of_day ? 1 : 0;
        count++;
    }

    return count > 0 ? similarity / count : 0;
}