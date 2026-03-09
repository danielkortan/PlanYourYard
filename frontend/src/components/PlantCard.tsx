import { Plant } from '../types';
import {
  Sun, Droplets, TreePine, Bird, Bug, Gauge,
  ArrowRight, Sprout, Flower2
} from 'lucide-react';

interface PlantCardProps {
  plant: Plant;
  onClick: (plant: Plant) => void;
  compact?: boolean;
}

const typeColors: Record<string, string> = {
  tree: 'bg-forest-100 text-forest-800',
  shrub: 'bg-earth-100 text-earth-800',
  perennial: 'bg-pink-100 text-pink-800',
  annual: 'bg-orange-100 text-orange-800',
  grass: 'bg-yellow-100 text-yellow-800',
  fern: 'bg-teal-100 text-teal-800',
  vine: 'bg-purple-100 text-purple-800',
  groundcover: 'bg-lime-100 text-lime-800',
};

const sunLabels: Record<string, { label: string; color: string }> = {
  'full-sun': { label: 'Full Sun', color: 'text-yellow-600' },
  'part-shade': { label: 'Part Shade', color: 'text-orange-500' },
  'full-shade': { label: 'Full Shade', color: 'text-blue-600' },
};

const waterLabels: Record<string, string> = {
  dry: 'Drought Tolerant',
  medium: 'Medium Water',
  wet: 'Wet/Moist',
  adaptable: 'Adaptable',
};

const growthColors: Record<string, string> = {
  slow: 'text-blue-600',
  medium: 'text-green-600',
  fast: 'text-orange-600',
};

export default function PlantCard({ plant, onClick, compact = false }: PlantCardProps) {
  const typeColor = typeColors[plant.type] || 'bg-gray-100 text-gray-800';

  if (compact) {
    return (
      <button
        onClick={() => onClick(plant)}
        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-forest-300 hover:bg-forest-50 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm text-gray-900">{plant.commonName}</p>
            <p className="text-xs text-gray-500 italic">{plant.scientificName}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-forest-600 transition-colors" />
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => onClick(plant)}
      className="card p-4 text-left hover:border-forest-300 hover:shadow-md transition-all group w-full animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-forest-700 transition-colors leading-tight">
            {plant.commonName}
          </h3>
          <p className="text-xs text-gray-500 italic mt-0.5">{plant.scientificName}</p>
        </div>
        <span className={`badge ml-2 shrink-0 ${typeColor}`}>
          {plant.type}
        </span>
      </div>

      {/* Description snippet */}
      <p className="text-xs text-gray-600 line-clamp-2 mb-3 leading-relaxed">
        {plant.description}
      </p>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Gauge className="w-3.5 h-3.5 text-gray-400" />
          <span>{plant.height.min}–{plant.height.max} ft tall</span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${growthColors[plant.growthRate]}`}>
          <Sprout className="w-3.5 h-3.5" />
          <span className="capitalize">{plant.growthRate} grower</span>
        </div>
      </div>

      {/* Sun & water */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {plant.sunRequirements.map(sun => {
          const sl = sunLabels[sun];
          return sl ? (
            <span key={sun} className={`flex items-center gap-1 text-xs font-medium ${sl.color}`}>
              <Sun className="w-3 h-3" />
              {sl.label}
            </span>
          ) : null;
        })}
        <span className="flex items-center gap-1 text-xs text-sky-600 font-medium">
          <Droplets className="w-3 h-3" />
          {waterLabels[plant.waterRequirements] || plant.waterRequirements}
        </span>
      </div>

      {/* Wildlife */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        {plant.wildlifeValue.pollinators && (
          <div className="flex items-center gap-1 text-xs text-amber-600" title="Pollinator friendly">
            <Bug className="w-3 h-3" />
            <span>Pollinators</span>
          </div>
        )}
        {plant.wildlifeValue.birds && (
          <div className="flex items-center gap-1 text-xs text-sky-600" title="Birds">
            <Bird className="w-3 h-3" />
            <span>Birds</span>
          </div>
        )}
        {plant.wildlifeValue.butterflies && (
          <div className="flex items-center gap-1 text-xs text-purple-600" title="Butterflies">
            <Flower2 className="w-3 h-3" />
            <span>Butterflies</span>
          </div>
        )}
        {plant.wildlifeValue.deer === 'resistant' && (
          <span className="ml-auto text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">
            Deer Resistant
          </span>
        )}
      </div>

      {/* Bloom colors */}
      {plant.bloomColor.length > 0 && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">Blooms:</span>
          <div className="flex gap-1 flex-wrap">
            {plant.bloomTime.slice(0, 3).map(m => (
              <span key={m} className="text-xs bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded">
                {m}
              </span>
            ))}
            {plant.bloomTime.length > 3 && (
              <span className="text-xs text-gray-400">+{plant.bloomTime.length - 3}</span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
