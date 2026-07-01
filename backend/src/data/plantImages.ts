import axios from 'axios';

interface CachedImage {
  imageUrl: string | null;
  attribution: string | null;
  fetchedAt: number;
}

const cache = new Map<string, CachedImage>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function getPlantImage(scientificName: string): Promise<{ imageUrl: string | null; attribution: string | null }> {
  const cached = cache.get(scientificName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { imageUrl: cached.imageUrl, attribution: cached.attribution };
  }

  try {
    const response = await axios.get('https://api.inaturalist.org/v1/taxa', {
      params: { q: scientificName, rank: 'species', per_page: 1 },
      timeout: 8000,
    });
    const taxon = response.data?.results?.[0];
    const photo = taxon?.default_photo;
    const result = {
      imageUrl: photo?.medium_url ?? null,
      attribution: photo?.attribution ?? null,
    };
    cache.set(scientificName, { ...result, fetchedAt: Date.now() });
    return result;
  } catch {
    const result = { imageUrl: null, attribution: null };
    cache.set(scientificName, { ...result, fetchedAt: Date.now() });
    return result;
  }
}
