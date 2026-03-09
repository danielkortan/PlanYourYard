import { Plant } from '../types';
import {
  X, Sun, Droplets, TreePine, Bird, Bug, Flower2, Gauge,
  MapPin, Thermometer, Calendar, Sprout, Star, ExternalLink,
  CheckCircle2, AlertCircle, Leaf
} from 'lucide-react';

interface PlantDetailModalProps {
  plant: Plant | null;
  onClose: () => void;
  onSelectForVisualizer?: (plant: Plant) => void;
}

const sunColors: Record<string, string> = {
  'full-sun': 'bg-yellow-100 text-yellow-800',
  'part-shade': 'bg-orange-100 text-orange-800',
  'full-shade': 'bg-blue-100 text-blue-800',
};

const waterColors: Record<string, string> = {
  dry: 'bg-amber-100 text-amber-800',
  medium: 'bg-cyan-100 text-cyan-800',
  wet: 'bg-blue-100 text-blue-800',
  adaptable: 'bg-teal-100 text-teal-800',
};

const deerColors: Record<string, string> = {
  resistant: 'bg-green-100 text-green-800',
  occasionally: 'bg-yellow-100 text-yellow-800',
  frequently: 'bg-red-100 text-red-800',
};

const growthColors: Record<string, string> = {
  slow: 'bg-blue-100 text-blue-800',
  medium: 'bg-green-100 text-green-800',
  fast: 'bg-orange-100 text-orange-800',
};

export default function PlantDetailModal({ plant, onClose, onSelectForVisualizer }: PlantDetailModalProps) {
  if (!plant) return null;

  const novaUrl = `https://novanatives.com/?s=${encodeURIComponent(plant.scientificName)}`;
  const usda = `https://plants.usda.gov/home/basicSearchResults?symbol=&keywordsearch=${encodeURIComponent(plant.scientificName)}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-forest-700 to-forest-900 text-white p-6 rounded-t-2xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="pr-8">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full capitalize">{plant.type}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${growthColors[plant.growthRate]}`}>
                {plant.growthRate} grower
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-1">{plant.commonName}</h2>
            <p className="text-forest-200 italic text-sm">{plant.scientificName}</p>
            <p className="text-forest-300 text-xs mt-1">Family: {plant.family}</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Description */}
          <p className="text-gray-700 leading-relaxed">{plant.description}</p>

          {/* Quick stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Gauge className="w-5 h-5 text-forest-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{plant.height.min}–{plant.height.max}</div>
              <div className="text-xs text-gray-500">Feet tall</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <TreePine className="w-5 h-5 text-forest-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">{plant.spread.min}–{plant.spread.max}</div>
              <div className="text-xs text-gray-500">Feet wide</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Thermometer className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900">Z{plant.hardinessZone.min}–{plant.hardinessZone.max}</div>
              <div className="text-xs text-gray-500">Hardy zones</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Sprout className="w-5 h-5 text-earth-600 mx-auto mb-1" />
              <div className="text-lg font-bold text-gray-900 capitalize">{plant.growthRate}</div>
              <div className="text-xs text-gray-500">Growth rate</div>
            </div>
          </div>

          {/* Requirements */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Sun className="w-4 h-4 text-yellow-500" /> Growing Requirements
            </h3>
            <div className="flex flex-wrap gap-2">
              {plant.sunRequirements.map(sun => (
                <span key={sun} className={`badge ${sunColors[sun] || 'bg-gray-100 text-gray-700'}`}>
                  <Sun className="w-3 h-3 mr-1" />
                  {sun === 'full-sun' ? 'Full Sun' : sun === 'part-shade' ? 'Part Shade' : 'Full Shade'}
                </span>
              ))}
              <span className={`badge ${waterColors[plant.waterRequirements] || 'bg-gray-100 text-gray-700'}`}>
                <Droplets className="w-3 h-3 mr-1" />
                {plant.waterRequirements === 'dry' ? 'Drought Tolerant' :
                 plant.waterRequirements === 'medium' ? 'Medium Water' :
                 plant.waterRequirements === 'wet' ? 'Wet/Moist' : 'Adaptable'}
              </span>
              <span className="badge bg-earth-100 text-earth-800">
                Soil: {plant.soilType.slice(0, 2).join(', ')}
              </span>
            </div>
          </div>

          {/* Bloom info */}
          {plant.bloomTime.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Flower2 className="w-4 h-4 text-pink-500" /> Bloom
              </h3>
              <div className="flex flex-wrap gap-2">
                {plant.bloomTime.map(m => (
                  <span key={m} className="badge bg-pink-50 text-pink-700">{m}</span>
                ))}
                {plant.bloomColor.map(c => (
                  <span key={c} className="badge bg-purple-50 text-purple-700 capitalize">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Fall color */}
          {plant.fallColor.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Leaf className="w-4 h-4 text-orange-500" /> Fall / Winter Interest
              </h3>
              <div className="flex flex-wrap gap-2">
                {plant.fallColor.map(c => (
                  <span key={c} className="badge bg-orange-50 text-orange-700 capitalize">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Wildlife Value */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Bird className="w-4 h-4 text-sky-500" /> Wildlife Value
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${plant.wildlifeValue.pollinators ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-400'}`}>
                <Bug className="w-4 h-4" />
                <span>{plant.wildlifeValue.pollinators ? 'Pollinator Friendly' : 'Not for Pollinators'}</span>
              </div>
              <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${plant.wildlifeValue.birds ? 'bg-sky-50 text-sky-800' : 'bg-gray-50 text-gray-400'}`}>
                <Bird className="w-4 h-4" />
                <span>{plant.wildlifeValue.birds ? 'Bird Friendly' : 'Limited for Birds'}</span>
              </div>
              <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${plant.wildlifeValue.butterflies ? 'bg-purple-50 text-purple-800' : 'bg-gray-50 text-gray-400'}`}>
                <Flower2 className="w-4 h-4" />
                <span>{plant.wildlifeValue.butterflies ? 'Butterfly Host' : 'Limited for Butterflies'}</span>
              </div>
            </div>
            <div className="mt-2">
              <span className={`badge ${deerColors[plant.wildlifeValue.deer]}`}>
                {plant.wildlifeValue.deer === 'resistant' ? '✓ Deer Resistant' :
                 plant.wildlifeValue.deer === 'occasionally' ? '~ Occasionally Browsed' :
                 '✗ Frequently Browsed by Deer'}
              </span>
            </div>
          </div>

          {/* Features */}
          {plant.features.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" /> Key Features
              </h3>
              <div className="flex flex-wrap gap-2">
                {plant.features.map(f => (
                  <span key={f} className="badge bg-forest-50 text-forest-700">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Landscape Uses */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-forest-500" /> Landscape Uses
            </h3>
            <div className="flex flex-wrap gap-2">
              {plant.landscapeUses.map(use => (
                <span key={use} className="badge bg-gray-100 text-gray-700">{use}</span>
              ))}
            </div>
          </div>

          {/* Native Range */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-earth-500" /> Native Range
            </h3>
            <div className="flex flex-wrap gap-2">
              {plant.nativeRange.map(r => (
                <span key={r} className="badge bg-earth-50 text-earth-700">{r}</span>
              ))}
            </div>
          </div>

          {/* Care Tips */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500" /> Care Tips
            </h3>
            <p className="text-sm text-gray-700 bg-blue-50 rounded-xl p-3 leading-relaxed">
              {plant.careTips}
            </p>
          </div>

          {/* External Links */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">More Information</h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={novaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-800 underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Nova Natives
              </a>
              <a
                href={usda}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-800 underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                USDA Plants Database
              </a>
              <a
                href={`https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(plant.scientificName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-800 underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                iNaturalist
              </a>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            {onSelectForVisualizer && (
              <button
                onClick={() => { onSelectForVisualizer(plant); onClose(); }}
                className="btn-primary flex-1 justify-center"
              >
                <Flower2 className="w-4 h-4" />
                Visualize in My Yard
              </button>
            )}
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
