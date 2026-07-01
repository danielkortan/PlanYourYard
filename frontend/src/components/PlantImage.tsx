import { useEffect, useState } from 'react';
import axios from 'axios';
import { Leaf, TreePine } from 'lucide-react';

const imageCache = new Map<string, { imageUrl: string | null; attribution: string | null }>();

// Best-effort synchronous lookup for already-fetched images (e.g. for PDF export)
export function getCachedPlantImageUrl(plantId: string): string | null {
  return imageCache.get(plantId)?.imageUrl ?? null;
}

interface PlantImageProps {
  plantId: string;
  commonName: string;
  className?: string;
  showAttribution?: boolean;
}

export default function PlantImage({ plantId, commonName, className, showAttribution }: PlantImageProps) {
  const cached = imageCache.get(plantId);
  const [image, setImage] = useState(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    const existing = imageCache.get(plantId);
    if (existing) {
      setImage(existing);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    axios.get(`/api/plants/${plantId}/image`)
      .then(res => {
        if (cancelled) return;
        const result = { imageUrl: res.data?.imageUrl ?? null, attribution: res.data?.attribution ?? null };
        imageCache.set(plantId, result);
        setImage(result);
      })
      .catch(() => {
        if (cancelled) return;
        const result = { imageUrl: null, attribution: null };
        imageCache.set(plantId, result);
        setImage(result);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [plantId]);

  const base = className || 'w-full h-32 object-cover rounded-lg';

  if (loading) {
    return <div className={`${base} bg-gray-100 animate-pulse flex items-center justify-center`}><Leaf className="w-6 h-6 text-gray-300" /></div>;
  }
  if (!image?.imageUrl) {
    return <div className={`${base} bg-forest-50 flex items-center justify-center`}><TreePine className="w-6 h-6 text-forest-300" /></div>;
  }
  return (
    <div>
      <img src={image.imageUrl} alt={commonName} className={base} />
      {showAttribution && image.attribution && (
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{image.attribution}</p>
      )}
    </div>
  );
}
