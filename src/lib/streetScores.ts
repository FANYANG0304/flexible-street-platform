import { supabase } from './supabase';

export interface StreetAIData {
  featureId:  number;
  streetName: string; // used to fix "Unnamed Street" display
  aiScore:    number; // 0-100 sensory score
  keywords:   string[];
  lat?:       number;
  lng?:       number;
}

/**
 * Loads all AI-analysed street sensory data into a Map<featureId, StreetAIData>.
 * Called once on mount in MapPage. Falls back to empty Map on error.
 */
export async function loadStreetAICache(): Promise<Map<number, StreetAIData>> {
  const cache = new Map<number, StreetAIData>();
  try {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('street_ai_scores')
        .select('feature_id, street_name, ai_score, keywords, lat, lng')
        .range(from, from + PAGE - 1);

      if (error) { console.warn('street_ai_scores fetch:', error.message); break; }
      for (const row of data ?? []) {
        cache.set(row.feature_id, {
          featureId:  row.feature_id,
          streetName: row.street_name ?? '',
          aiScore:    row.ai_score    ?? 0,
          keywords:   row.keywords    ?? [],
          lat:        row.lat         ?? undefined,
          lng:        row.lng         ?? undefined,
        });
      }
      if ((data?.length ?? 0) < PAGE) break;
      from += PAGE;
    }
    console.log(`✅ Loaded ${cache.size} AI street records`);
  } catch (e) {
    console.warn('loadStreetAICache error:', e);
  }
  return cache;
}
