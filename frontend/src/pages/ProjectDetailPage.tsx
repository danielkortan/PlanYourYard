import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, Trash2, Plus, X, Search, MapPin, Leaf,
  Satellite, Image as ImageIcon, Sun, Cloud, Moon, Ruler,
  Map as MapIcon, Layers, PenLine, Undo2, Check, ZoomIn, Save,
  RotateCw, Scissors, Clock, TrendingUp, Square,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import toast from 'react-hot-toast';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ── Types ──────────────────────────────────────────────────────────────────

interface PlantMarker {
  id: number;
  image_id: number;
  plant_id: string;
  plant_name: string;
  x_percent: number;
  y_percent: number;
  notes: string;
}

interface AerialMarker {
  id: number;
  project_id: number;
  plant_id: string;
  plant_name: string;
  lat: number;
  lng: number;
  notes: string;
  status: 'planted' | 'planned';
  year_planted: number | null;
  growth_rate: string;
  plant_type: string;
  max_height_ft: number | null;
}

interface ProjectImage {
  id: number;
  filename: string;
  original_name: string;
  created_at: string;
  markers: PlantMarker[];
}

interface YardShape {
  id: number;
  project_id: number;
  shape_type: string;
  label: string;
  coordinates: [number, number][];
  color: string;
  fill_color: string;
}

interface Project {
  id: number;
  name: string;
  address: string;
  description: string;
  lat: number | null;
  lng: number | null;
  zoom: number;
  property_border: string | null;
  created_at: string;
  images: ProjectImage[];
  aerialMarkers: AerialMarker[];
  shapes: YardShape[];
}

interface PlantResult {
  id: string;
  commonName: string;
  scientificName: string;
  type: string;
  sunRequirements: string[];
  height: { min: number; max: number };
  waterRequirements: string;
  bloomColor: string[];
  growthRate?: string;
}

type MapLayer = 'satellite' | 'street' | 'hybrid';
type MapMode  = 'place' | 'draw-border' | 'draw-shape';
type Tab      = 'aerial' | 'photos';
type AgeOffset = 0 | 1 | 5 | 10 | 30;

// ── Constants ──────────────────────────────────────────────────────────────

const MARKER_COLORS = [
  '#16a34a', '#2563eb', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#65a30d', '#ea580c', '#4f46e5',
];
const mkColor = (i: number) => MARKER_COLORS[i % MARKER_COLORS.length];

const TYPE_COLORS: Record<string, string> = {
  tree:        'bg-green-100 text-green-700',
  shrub:       'bg-teal-100 text-teal-700',
  perennial:   'bg-purple-100 text-purple-700',
  annual:      'bg-pink-100 text-pink-700',
  grass:       'bg-yellow-100 text-yellow-700',
  fern:        'bg-emerald-100 text-emerald-700',
  vine:        'bg-lime-100 text-lime-700',
  groundcover: 'bg-cyan-100 text-cyan-700',
};

const TILE_LAYERS: Record<MapLayer, { url: string; attribution: string; overlay?: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  street: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, © OpenStreetMap contributors',
    overlay: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
  },
};

const SHAPE_TYPES = [
  { key: 'house',      label: 'House',       color: '#334155', fill: '#cbd5e1' },
  { key: 'garage',     label: 'Garage',      color: '#374151', fill: '#d1d5db' },
  { key: 'patio',      label: 'Patio',       color: '#92400e', fill: '#fde68a' },
  { key: 'driveway',   label: 'Driveway',    color: '#44403c', fill: '#d6d3d1' },
  { key: 'path',       label: 'Path',        color: '#78716c', fill: '#e7e5e4' },
  { key: 'garden_bed', label: 'Garden Bed',  color: '#15803d', fill: '#bbf7d0' },
  { key: 'lawn',       label: 'Lawn',        color: '#16a34a', fill: '#dcfce7' },
  { key: 'pool',       label: 'Pool',        color: '#0369a1', fill: '#bae6fd' },
  { key: 'shed',       label: 'Shed',        color: '#7c2d12', fill: '#fed7aa' },
  { key: 'custom',     label: 'Custom',      color: '#6d28d9', fill: '#ede9fe' },
];

const GROWTH_FT_PER_YEAR: Record<string, number> = {
  slow: 0.5,
  medium: 1.25,
  fast: 2.5,
};

const CURRENT_YEAR = 2026;

// ── Helper components ──────────────────────────────────────────────────────

function SunBadge({ req }: { req: string }) {
  if (req === 'full-sun')   return <span className="flex items-center gap-0.5 text-yellow-600 text-xs font-medium"><Sun className="w-3 h-3" /> Full Sun</span>;
  if (req === 'part-shade') return <span className="flex items-center gap-0.5 text-orange-500 text-xs font-medium"><Cloud className="w-3 h-3" /> Part Shade</span>;
  return <span className="flex items-center gap-0.5 text-blue-500 text-xs font-medium"><Moon className="w-3 h-3" /> Full Shade</span>;
}

function aerialMarkerIcon(idx: number, status: 'planted' | 'planned', scale = 1) {
  const color = mkColor(idx);
  const size = Math.round(Math.max(20, Math.min(48, 28 * scale)));
  const iconSvg = `<svg width="${Math.round(size * 0.46)}" height="${Math.round(size * 0.46)}" viewBox="0 0 24 24" fill="none" stroke="${status === 'planted' ? 'white' : color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`;
  if (status === 'planted') {
    return L.divIcon({
      html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">${iconSvg}</div>`,
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
  } else {
    return L.divIcon({
      html: `<div style="background:${color}33;width:${size}px;height:${size}px;border-radius:50%;border:2.5px dashed ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,.2);">${iconSvg}</div>`,
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
  }
}

function dotIcon(color: string, size = 10) {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.5);"></div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

function polygonCentroid(coords: [number, number][]): [number, number] {
  const lat = coords.reduce((s, p) => s + p[0], 0) / coords.length;
  const lng = coords.reduce((s, p) => s + p[1], 0) / coords.length;
  return [lat, lng];
}

function shapeLabelIcon(label: string, color: string) {
  return L.divIcon({
    html: `<div style="background:${color};color:white;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;">${label}</div>`,
    className: '',
    iconAnchor: [0, 8] as [number, number],
  });
}

function ZoomWatcher({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  const map = useMap();
  useEffect(() => { onZoomChange(map.getZoom()); }, []); // fire once on mount with initial zoom
  useMapEvents({ zoomend(e) { onZoomChange(e.target.getZoom()); } });
  return null;
}

// Estimates plant height at a given year offset from now
function estimateHeight(marker: AerialMarker, yearOffset: number): number {
  if (!marker.year_planted) return 0;
  const age = (CURRENT_YEAR + yearOffset) - marker.year_planted;
  if (age <= 0) return 0;
  const rate = GROWTH_FT_PER_YEAR[marker.growth_rate] ?? 1.25;
  const maxH = marker.max_height_ft || 40;
  return Math.round(Math.min(maxH, age * rate) * 10) / 10;
}

// Scale for marker icon size relative to mature size (0.3–1.3)
function markerAgeScale(marker: AerialMarker, yearOffset: number): number {
  const est = estimateHeight(marker, yearOffset);
  const maxH = marker.max_height_ft || 30;
  return 0.35 + 0.95 * Math.min(1, est / Math.max(1, maxH));
}

// Captures the Leaflet map instance into a ref and notifies parent
function MapRefCapture({
  mapRef,
  onMount,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  onMount?: (map: L.Map) => void;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onMount?.(map);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Compass rose — the red arrow always points true north regardless of rotation
function CompassRose({ rotation }: { rotation: number }) {
  const arrowAngle = -rotation;
  return (
    <div
      className="w-14 h-14 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 flex items-center justify-center"
      title={`Map rotated ${rotation}° — north is ${rotation === 0 ? 'up' : `${rotation}° clockwise from up`}`}
    >
      <svg viewBox="0 0 56 56" className="w-12 h-12">
        <g transform={`rotate(${arrowAngle}, 28, 28)`}>
          <polygon points="28,6 24,28 28,24 32,28" fill="#ef4444" />
          <polygon points="28,50 24,28 28,32 32,28" fill="#9ca3af" />
          <circle cx="28" cy="28" r="3" fill="#1f2937" />
          <text x="28" y="17" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="bold" fill="white">N</text>
        </g>
        {[0, 90, 180, 270].map(a => (
          <line key={a} x1="28" y1="1" x2="28" y2="5" stroke="#d1d5db" strokeWidth="1.5" transform={`rotate(${a}, 28, 28)`} />
        ))}
      </svg>
    </div>
  );
}

// Handles clicks for plant placement, border drawing, or shape drawing
function MapClickHandler({
  mode, onPlace, onBorder, onShape,
}: { mode: MapMode; onPlace: (lat: number, lng: number) => void; onBorder: (lat: number, lng: number) => void; onShape: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (mode === 'draw-border') onBorder(e.latlng.lat, e.latlng.lng);
      else if (mode === 'draw-shape') onShape(e.latlng.lat, e.latlng.lng);
      else onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Shared plant picker ─────────────────────────────────────────────────────

interface PlantPickerProps {
  onPlace: (plant: PlantResult, notes: string, status?: 'planted' | 'planned', yearPlanted?: number | null) => Promise<void>;
  onCancel: () => void;
  showPlantingDetails?: boolean;
}

function inatToPlantResult(taxon: any): PlantResult {
  return {
    id: `inat-${taxon.id}`,
    commonName: taxon.preferred_common_name || taxon.english_common_name || taxon.name,
    scientificName: taxon.name,
    type: 'tree',
    sunRequirements: [],
    height: { min: 0, max: 0 },
    waterRequirements: '',
    bloomColor: [],
  };
}

function PlantPicker({ onPlace, onCancel, showPlantingDetails }: PlantPickerProps) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<PlantResult[]>([]);
  const [inatResults, setInatResults] = useState<PlantResult[]>([]);
  const [selected, setSelected]   = useState<PlantResult | null>(null);
  const [notes, setNotes]         = useState('');
  const [plantStatus, setPlantStatus] = useState<'planted' | 'planned'>('planted');
  const [yearPlanted, setYearPlanted] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [placing, setPlacing]     = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState('tree');

  useEffect(() => {
    if (!query.trim()) { setResults([]); setInatResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const local = await axios.get('/api/plants/search', { params: { q: query, limit: 10 } });
        const localList: PlantResult[] = local.data.results || [];
        setResults(localList);
        if (localList.length < 4) {
          try {
            const inat = await axios.get('/api/plants/inaturalist/search', { params: { q: query } });
            const taxa: any[] = inat.data.results || [];
            const localIds = new Set(localList.map(p => p.scientificName.toLowerCase()));
            const extra = taxa
              .filter(t => t.preferred_common_name || t.english_common_name)
              .filter(t => !localIds.has(t.name.toLowerCase()))
              .slice(0, 8)
              .map(inatToPlantResult);
            setInatResults(extra);
          } catch { /* iNat unavailable */ }
        } else {
          setInatResults([]);
        }
      } catch { /* local search failed */ }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handlePlace = async () => {
    if (!selected) return;
    setPlacing(true);
    try { await onPlace(selected, notes, showPlantingDetails ? plantStatus : undefined, showPlantingDetails ? yearPlanted : undefined); }
    finally { setPlacing(false); }
  };

  const selectCustom = () => {
    if (!manualName.trim()) return;
    const plant: PlantResult = {
      id: `custom-${Date.now()}`,
      commonName: manualName.trim(),
      scientificName: '',
      type: manualType as any,
      sunRequirements: [],
      height: { min: 0, max: 0 },
      waterRequirements: '',
      bloomColor: [],
    };
    setSelected(plant);
    setQuery(plant.commonName);
    setShowManual(false);
    setResults([]);
    setInatResults([]);
  };

  const allResults = [...results, ...inatResults];
  const showNoResults = query.trim() && !searching && allResults.length === 0 && !selected;

  return (
    <div className="bg-white border border-forest-300 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-forest-600" /> Place Plant Marker
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="relative mb-3">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text" value={query} autoFocus
          onChange={e => { setQuery(e.target.value); setSelected(null); setShowManual(false); }}
          placeholder="Search plants… (e.g. rose, boxwood, oak)"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
      </div>

      {searching && <p className="text-xs text-gray-400 mb-2">Searching…</p>}

      {allResults.length > 0 && !selected && (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-3 max-h-64 overflow-y-auto divide-y divide-gray-100">
          {results.map(plant => (
            <button key={plant.id} onClick={() => { setSelected(plant); setQuery(plant.commonName); setResults([]); setInatResults([]); }}
              className="w-full text-left px-3 py-2.5 hover:bg-forest-50 transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-900">{plant.commonName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[plant.type] || 'bg-gray-100 text-gray-600'}`}>{plant.type}</span>
              </div>
              {plant.scientificName && <div className="text-xs text-gray-400 italic mb-1">{plant.scientificName}</div>}
              <div className="flex flex-wrap gap-3">
                {plant.sunRequirements.slice(0, 2).map(s => <SunBadge key={s} req={s} />)}
                {plant.height.max > 0 && <span className="flex items-center gap-0.5 text-xs text-gray-500"><Ruler className="w-3 h-3" />up to {plant.height.max} ft</span>}
                {plant.waterRequirements && <span className="text-xs text-blue-500">💧 {plant.waterRequirements}</span>}
              </div>
            </button>
          ))}
          {inatResults.length > 0 && (
            <>
              <div className="px-3 py-1.5 bg-gray-50 text-xs text-gray-400 font-medium sticky top-0">More results (iNaturalist)</div>
              {inatResults.map(plant => (
                <button key={plant.id} onClick={() => { setSelected(plant); setQuery(plant.commonName); setResults([]); setInatResults([]); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-forest-50 transition-colors">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900">{plant.commonName}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">iNat</span>
                  </div>
                  {plant.scientificName && <div className="text-xs text-gray-400 italic">{plant.scientificName}</div>}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {showNoResults && !showManual && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-2">No plants found for "{query}".</p>
          <button onClick={() => { setShowManual(true); setManualName(query); }}
            className="text-xs text-forest-600 hover:text-forest-800 font-medium flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add "{query}" as a custom plant
          </button>
        </div>
      )}

      {showManual && (
        <div className="border border-dashed border-forest-300 rounded-lg p-3 mb-3 bg-forest-50/50">
          <p className="text-xs font-medium text-forest-800 mb-2">Custom plant entry</p>
          <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
            placeholder="Plant name"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-forest-500" />
          <select value={manualType} onChange={e => setManualType(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-forest-500">
            {['tree','shrub','perennial','annual','grass','fern','vine','groundcover'].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={selectCustom} disabled={!manualName.trim()}
              className="flex-1 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-medium transition-colors">
              Use This Plant
            </button>
            <button onClick={() => setShowManual(false)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:text-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {allResults.length > 0 && !selected && !showManual && (
        <button onClick={() => { setShowManual(true); setManualName(query); }}
          className="text-xs text-gray-400 hover:text-forest-600 mb-3 block transition-colors">
          Can't find it? Add a custom plant
        </button>
      )}

      {selected && (
        <div className="bg-forest-50 border border-forest-200 rounded-lg p-3 mb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-forest-800 text-sm">{selected.commonName}</div>
              {selected.scientificName && <div className="text-xs text-forest-600 italic">{selected.scientificName}</div>}
              <div className="flex gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[selected.type] || 'bg-gray-100 text-gray-600'}`}>{selected.type}</span>
                {selected.sunRequirements.slice(0, 1).map(s => <SunBadge key={s} req={s} />)}
                {selected.height.max > 0 && <span className="text-xs text-gray-500 flex items-center gap-0.5"><Ruler className="w-3 h-3" />{selected.height.max} ft max</span>}
              </div>
            </div>
            <button onClick={() => { setSelected(null); setQuery(''); }} className="text-gray-400 hover:text-gray-600 mt-0.5"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      {/* Planting details (for aerial markers only) */}
      {showPlantingDetails && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-700 mb-2">Planting Status</p>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setPlantStatus('planted')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                plantStatus === 'planted' ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-200 hover:border-forest-400'
              }`}>
              🌱 Planted
            </button>
            <button type="button" onClick={() => setPlantStatus('planned')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                plantStatus === 'planned' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
              }`}>
              📋 Planned
            </button>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Year {plantStatus === 'planted' ? 'planted' : 'to plant'}:</label>
            <input
              type="number"
              value={yearPlanted || ''}
              onChange={e => setYearPlanted(e.target.value ? parseInt(e.target.value) : null)}
              placeholder={String(CURRENT_YEAR)}
              min={1900} max={2100}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </div>
      )}

      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)…" rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none mb-3" />

      <button onClick={handlePlace} disabled={!selected || placing}
        className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
        {placing ? 'Placing…' : 'Place Marker'}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [project, setProject]   = useState<Project | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('aerial');

  // Aerial map state
  const [mapLayer, setMapLayer]           = useState<MapLayer>('satellite');
  const [mapMode, setMapMode]             = useState<MapMode>('place');
  const [pendingAerialClick, setPendingAerialClick] = useState<{ lat: number; lng: number } | null>(null);
  const [borderPoints, setBorderPoints]   = useState<[number, number][]>([]);
  const [savedBorder, setSavedBorder]     = useState<[number, number][] | null>(null);
  const [savingBorder, setSavingBorder]   = useState(false);
  const [savingZoom, setSavingZoom]       = useState(false);
  const mapRef        = useRef<L.Map | null>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  // Clip view state
  const [clipMode, setClipMode]   = useState(false);
  const [rotation, setRotation]   = useState(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // Zoom tracking (for auto satellite→street switch)
  const [currentZoom, setCurrentZoom] = useState(0);

  // Yard shape drawing
  const [shapePoints, setShapePoints]       = useState<[number, number][]>([]);
  const [newShapeType, setNewShapeType]     = useState('house');
  const [newShapeLabel, setNewShapeLabel]   = useState('House');
  const [savingShape, setSavingShape]       = useState(false);

  // Age timeline
  const [ageOffset, setAgeOffset] = useState<AgeOffset>(0);

  // Photo tab state
  const [activeImageId, setActiveImageId] = useState<number | null>(null);
  const [uploading, setUploading]         = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);
  const imageContainerRef                 = useRef<HTMLDivElement>(null);
  const [pendingPhotoClick, setPendingPhotoClick] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    axios.get(`/api/projects/${id}`)
      .then(res => {
        const p: Project = res.data;
        setProject(p);
        if (!p.lat || !p.lng) setTab('photos');
        if (p.images.length > 0) setActiveImageId(p.images[0].id);
        if (p.property_border) {
          try {
            setSavedBorder(JSON.parse(p.property_border));
            setClipMode(true);
          } catch {}
        }
        // If navigated with ?step=draw-border, auto-start border drawing
        if (searchParams.get('step') === 'draw-border' && p.lat && p.lng) {
          setMapMode('draw-border');
          setTab('aerial');
        }
      })
      .catch(() => { toast.error('Project not found'); navigate('/projects'); })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply / remove CSS clip-path on every map move/zoom while clip mode is on
  useEffect(() => {
    const wrapper = mapWrapperRef.current;
    if (!mapInstance || !wrapper || !savedBorder || savedBorder.length < 3 || !clipMode) {
      if (wrapper) wrapper.style.clipPath = '';
      return;
    }

    const update = () => {
      if (!mapWrapperRef.current) return;
      const pts = savedBorder.map(([lat, lng]) => {
        const p = mapInstance.latLngToContainerPoint(L.latLng(lat, lng));
        return `${p.x}px ${p.y}px`;
      });
      mapWrapperRef.current.style.clipPath = `polygon(${pts.join(', ')})`;
    };

    update();
    mapInstance.on('move zoom resize viewreset moveend zoomend', update);
    return () => {
      mapInstance.off('move zoom resize viewreset moveend zoomend', update);
      if (mapWrapperRef.current) mapWrapperRef.current.style.clipPath = '';
    };
  }, [mapInstance, savedBorder, clipMode]);

  // When the map first becomes available and clip mode is on, fit to property bounds
  useEffect(() => {
    if (!mapInstance || !savedBorder || savedBorder.length < 3) return;
    const bounds = L.latLngBounds(savedBorder.map(([lat, lng]) => L.latLng(lat, lng)));
    mapInstance.fitBounds(bounds, { padding: [60, 60] });
  }, [mapInstance]); // only on first map mount

  const activeImage = project?.images.find(img => img.id === activeImageId) ?? null;

  // ── Map layer/mode helpers ──────────────────────────────────────────────

  const startDrawingBorder = () => {
    setPendingAerialClick(null);
    setBorderPoints([]);
    setClipMode(false);
    setRotation(0);
    setMapMode('draw-border');
  };

  const undoBorderPoint = () => setBorderPoints(pts => pts.slice(0, -1));

  const cancelDrawing = () => { setMapMode('place'); setBorderPoints([]); };

  const finishBorder = async () => {
    if (borderPoints.length < 3) { toast.error('Need at least 3 points to form a border'); return; }
    setSavingBorder(true);
    try {
      const p = project!;
      const res = await axios.put(`/api/projects/${id}`, {
        name: p.name, address: p.address, lat: p.lat, lng: p.lng,
        zoom: p.zoom, description: p.description,
        property_border: JSON.stringify(borderPoints),
      });
      setSavedBorder(borderPoints);
      setProject(prev => prev ? { ...prev, property_border: res.data.property_border } : prev);
      setMapMode('place');
      setBorderPoints([]);
      setClipMode(true);
      setRotation(0);
      if (mapRef.current) {
        const bounds = L.latLngBounds(borderPoints.map(([lat, lng]) => L.latLng(lat, lng)));
        mapRef.current.fitBounds(bounds, { padding: [60, 60] });
      }
      toast.success('Property border saved! Clip view enabled.');
    } catch { toast.error('Failed to save border'); }
    finally { setSavingBorder(false); }
  };

  const clearBorder = async () => {
    if (!confirm('Remove the saved property border?')) return;
    try {
      const p = project!;
      await axios.put(`/api/projects/${id}`, {
        name: p.name, address: p.address, lat: p.lat, lng: p.lng,
        zoom: p.zoom, description: p.description, property_border: null,
      });
      setSavedBorder(null);
      setClipMode(false);
      setRotation(0);
      setProject(prev => prev ? { ...prev, property_border: null } : prev);
      toast.success('Border cleared');
    } catch { toast.error('Failed to clear border'); }
  };

  const saveCurrentZoom = async () => {
    if (!mapRef.current || !project) return;
    const zoom = mapRef.current.getZoom();
    setSavingZoom(true);
    try {
      const p = project;
      await axios.put(`/api/projects/${id}`, {
        name: p.name, address: p.address, lat: p.lat, lng: p.lng,
        zoom, description: p.description, property_border: p.property_border,
      });
      setProject(prev => prev ? { ...prev, zoom } : prev);
      toast.success(`Default zoom set to ${zoom}`);
    } catch { toast.error('Failed to save zoom'); }
    finally { setSavingZoom(false); }
  };

  // ── Aerial marker handlers ──────────────────────────────────────────────

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setPendingAerialClick({ lat, lng });
  }, []);

  const handleBorderClick = useCallback((lat: number, lng: number) => {
    setBorderPoints(pts => [...pts, [lat, lng]]);
  }, []);

  const handleShapeClick = useCallback((lat: number, lng: number) => {
    setShapePoints(pts => [...pts, [lat, lng]]);
  }, []);

  const startDrawingShape = (type: string) => {
    const t = SHAPE_TYPES.find(s => s.key === type) || SHAPE_TYPES[0];
    setNewShapeType(type);
    setNewShapeLabel(t.label);
    setShapePoints([]);
    setPendingAerialClick(null);
    setMapMode('draw-shape');
  };

  const finishShape = async () => {
    if (shapePoints.length < 3) { toast.error('Need at least 3 points'); return; }
    setSavingShape(true);
    const t = SHAPE_TYPES.find(s => s.key === newShapeType) || SHAPE_TYPES[0];
    try {
      const res = await axios.post(`/api/projects/${id}/shapes`, {
        shape_type: newShapeType,
        label: newShapeLabel || t.label,
        coordinates: JSON.stringify(shapePoints),
        color: t.color,
        fill_color: t.fill,
      });
      setProject(prev => prev ? { ...prev, shapes: [...prev.shapes, res.data] } : prev);
      setMapMode('place');
      setShapePoints([]);
      toast.success(`${res.data.label} added to map!`);
    } catch { toast.error('Failed to save area'); }
    finally { setSavingShape(false); }
  };

  const cancelShapeDrawing = () => { setMapMode('place'); setShapePoints([]); };

  const handleDeleteShape = async (shapeId: number) => {
    try {
      await axios.delete(`/api/projects/${id}/shapes/${shapeId}`);
      setProject(prev => prev ? { ...prev, shapes: prev.shapes.filter(s => s.id !== shapeId) } : prev);
    } catch { toast.error('Failed to remove area'); }
  };

  const handlePlaceAerialMarker = async (plant: PlantResult, notes: string, status?: 'planted' | 'planned', yearPlanted?: number | null) => {
    if (!pendingAerialClick) return;
    const res = await axios.post(`/api/projects/${id}/aerial-markers`, {
      plant_id: plant.id, plant_name: plant.commonName,
      lat: pendingAerialClick.lat, lng: pendingAerialClick.lng, notes,
      status: status || 'planted',
      year_planted: yearPlanted || null,
      growth_rate: plant.growthRate || 'medium',
      plant_type: plant.type || 'tree',
      max_height_ft: plant.height?.max || null,
    });
    setProject(prev => prev ? { ...prev, aerialMarkers: [...prev.aerialMarkers, res.data] } : prev);
    setPendingAerialClick(null);
    toast.success(`${plant.commonName} placed on map!`);
  };

  const handleDeleteAerialMarker = async (markerId: number) => {
    try {
      await axios.delete(`/api/projects/${id}/aerial-markers/${markerId}`);
      setProject(prev => prev ? { ...prev, aerialMarkers: prev.aerialMarkers.filter(m => m.id !== markerId) } : prev);
    } catch { toast.error('Failed to remove marker'); }
  };

  const handleToggleMarkerStatus = async (marker: AerialMarker) => {
    const newStatus = marker.status === 'planted' ? 'planned' : 'planted';
    try {
      const res = await axios.patch(`/api/projects/${id}/aerial-markers/${marker.id}`, { status: newStatus });
      setProject(prev => prev ? {
        ...prev,
        aerialMarkers: prev.aerialMarkers.map(m => m.id === marker.id ? res.data : m),
      } : prev);
    } catch { toast.error('Failed to update marker'); }
  };

  // ── Photo handlers ──────────────────────────────────────────────────────

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('image', file);
        const res = await axios.post(`/api/projects/${id}/images`, fd);
        const newImg: ProjectImage = { ...res.data, markers: [] };
        setProject(prev => prev ? { ...prev, images: [...prev.images, newImg] } : prev);
        setActiveImageId(newImg.id);
      }
      toast.success('Image uploaded!');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDeleteImage = async (imgId: number) => {
    if (!confirm('Delete this image and all its plant markers?')) return;
    try {
      await axios.delete(`/api/projects/${id}/images/${imgId}`);
      setProject(prev => prev ? { ...prev, images: prev.images.filter(i => i.id !== imgId) } : prev);
      if (activeImageId === imgId) {
        const remaining = project!.images.filter(i => i.id !== imgId);
        setActiveImageId(remaining.length ? remaining[remaining.length - 1].id : null);
      }
      toast.success('Image deleted');
    } catch { toast.error('Failed to delete image'); }
  };

  const handlePhotoImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    setPendingPhotoClick({ x, y });
  }, []);

  const handlePlacePhotoMarker = async (plant: PlantResult, notes: string) => {
    if (!pendingPhotoClick || !activeImageId) return;
    const res = await axios.post(`/api/projects/${id}/images/${activeImageId}/markers`, {
      plant_id: plant.id, plant_name: plant.commonName,
      x_percent: pendingPhotoClick.x, y_percent: pendingPhotoClick.y, notes,
    });
    setProject(prev => prev ? {
      ...prev,
      images: prev.images.map(img => img.id === activeImageId ? { ...img, markers: [...img.markers, res.data] } : img),
    } : prev);
    setPendingPhotoClick(null);
    toast.success(`${plant.commonName} placed!`);
  };

  const handleDeletePhotoMarker = async (imgId: number, markerId: number) => {
    try {
      await axios.delete(`/api/projects/${id}/images/${imgId}/markers/${markerId}`);
      setProject(prev => prev ? {
        ...prev,
        images: prev.images.map(img => img.id === imgId ? { ...img, markers: img.markers.filter(m => m.id !== markerId) } : img),
      } : prev);
    } catch { toast.error('Failed to remove marker'); }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>;
  if (!project) return null;

  const hasAerial       = !!(project.lat && project.lng);
  const tileConfig      = TILE_LAYERS[mapLayer];
  const isDrawingBorder = mapMode === 'draw-border';
  const isDrawingShape  = mapMode === 'draw-shape';
  const isDrawing       = isDrawingBorder || isDrawingShape;

  // Auto-switch to street map when satellite/hybrid tiles become too blurry at high zoom
  const autoSwitchedToStreet = (mapLayer === 'satellite' || mapLayer === 'hybrid') && currentZoom >= 20;
  const effectiveTileConfig  = autoSwitchedToStreet ? TILE_LAYERS.street : tileConfig;

  // Map height: maximize in clip mode to fill available viewport
  const mapHeight = clipMode ? 'calc(100vh - 220px)' : 680;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={() => navigate('/projects')} className="mt-1 text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          {project.address && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />{project.address}
            </div>
          )}
          {project.description && <p className="text-sm text-gray-400 mt-1">{project.description}</p>}
        </div>
        {/* Step indicator when drawing border for the first time */}
        {isDrawingBorder && !savedBorder && (
          <div className="bg-forest-50 border border-forest-200 rounded-xl px-4 py-2 text-sm text-forest-700">
            <span className="font-medium">Step 2 of 2</span> — Draw your property border
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6 w-fit gap-1">
        {hasAerial && (
          <button onClick={() => setTab('aerial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'aerial' ? 'bg-white shadow text-forest-800' : 'text-gray-500 hover:text-gray-700'}`}>
            <Satellite className="w-4 h-4" /> {clipMode ? 'Property View' : 'Aerial Map'}
          </button>
        )}
        <button onClick={() => setTab('photos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'photos' ? 'bg-white shadow text-forest-800' : 'text-gray-500 hover:text-gray-700'}`}>
          <ImageIcon className="w-4 h-4" /> Photo Mockups
          {project.images.length > 0 && (
            <span className="bg-forest-100 text-forest-700 text-xs px-1.5 py-0.5 rounded-full">{project.images.length}</span>
          )}
        </button>
      </div>

      {/* ── AERIAL TAB ─────────────────────────────────────────────────── */}
      {tab === 'aerial' && hasAerial && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {isDrawingShape ? (
                <>
                  {(() => { const t = SHAPE_TYPES.find(s => s.key === newShapeType) || SHAPE_TYPES[0]; return (
                    <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border"
                      style={{ background: t.fill, borderColor: t.color, color: t.color }}>
                      <Square className="w-3 h-3" /> {newShapeLabel || t.label}
                    </span>
                  ); })()}
                  <span className="text-xs text-gray-500">
                    {shapePoints.length === 0 ? 'Click to add corners…' : `${shapePoints.length} point${shapePoints.length !== 1 ? 's' : ''} — keep clicking`}
                  </span>
                  <button onClick={() => setShapePoints(pts => pts.slice(0, -1))} disabled={shapePoints.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-400 rounded-lg text-xs font-medium text-gray-600 disabled:opacity-40 transition-colors">
                    <Undo2 className="w-3.5 h-3.5" /> Undo
                  </button>
                  <button onClick={finishShape} disabled={shapePoints.length < 3 || savingShape}
                    className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors">
                    <Check className="w-3.5 h-3.5" /> {savingShape ? 'Saving…' : 'Finish Area'}
                  </button>
                  <button onClick={cancelShapeDrawing}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 hover:border-red-400 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 transition-colors">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </>
              ) : !isDrawingBorder ? (
                <>
                  <button onClick={startDrawingBorder}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-forest-400 rounded-lg text-xs font-medium text-gray-700 transition-colors">
                    <PenLine className="w-3.5 h-3.5 text-forest-600" />
                    {savedBorder ? 'Redraw Border' : 'Draw Property Border'}
                  </button>
                  {savedBorder && (
                    <button onClick={clearBorder}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-red-400 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 transition-colors">
                      <X className="w-3.5 h-3.5" /> Clear Border
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-forest-700 bg-forest-50 border border-forest-200 px-3 py-1.5 rounded-lg">
                    {borderPoints.length === 0 ? 'Click on the map to add border points…' : `${borderPoints.length} point${borderPoints.length !== 1 ? 's' : ''} — keep clicking`}
                  </span>
                  <button onClick={undoBorderPoint} disabled={borderPoints.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-400 rounded-lg text-xs font-medium text-gray-600 disabled:opacity-40 transition-colors">
                    <Undo2 className="w-3.5 h-3.5" /> Undo
                  </button>
                  <button onClick={finishBorder} disabled={borderPoints.length < 3 || savingBorder}
                    className="flex items-center gap-1 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors">
                    <Check className="w-3.5 h-3.5" /> {savingBorder ? 'Saving…' : 'Finish Border'}
                  </button>
                  <button onClick={cancelDrawing}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 hover:border-red-400 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 transition-colors">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </>
              )}

              <div className="h-6 w-px bg-gray-200" />
              <button onClick={saveCurrentZoom} disabled={savingZoom}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-400 rounded-lg text-xs font-medium text-gray-600 transition-colors"
                title="Save current zoom as default">
                <Save className="w-3.5 h-3.5" />
                {savingZoom ? 'Saving…' : 'Save Zoom'}
              </button>

              <span className="text-xs text-gray-400 ml-auto">
                {isDrawing ? (
                  <span className="text-forest-600 font-medium flex items-center gap-1">
                    <PenLine className="w-3.5 h-3.5" /> Drawing border
                  </span>
                ) : pendingAerialClick ? (
                  <span className="text-forest-700 font-medium">Location pinned — pick a plant →</span>
                ) : (
                  <span className="flex items-center gap-1"><ZoomIn className="w-3.5 h-3.5" /> Click map to place plant</span>
                )}
              </span>
            </div>

            {/* Map outer container */}
            <div
              className={`relative ${isDrawing ? 'ring-2 ring-forest-400 rounded-xl' : ''} ${!clipMode ? 'rounded-xl overflow-hidden border border-gray-200' : ''}`}
              style={{
                height: mapHeight,
                minHeight: clipMode ? 400 : undefined,
                ...(clipMode ? {
                  borderRadius: '12px',
                  overflow: 'hidden',
                } : {}),
              }}
            >
              {/* Map wrapper — receives CSS clip-path + rotation in clip mode */}
              <div
                ref={mapWrapperRef}
                className="w-full h-full"
                style={{
                  transform: clipMode ? `rotate(${rotation}deg)` : 'none',
                  transformOrigin: 'center',
                  transition: 'transform 0.2s ease',
                  willChange: clipMode ? 'transform, clip-path' : 'auto',
                }}
              >
                {/* Layer toggle */}
                <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-1.5 border border-gray-200">
                  <button onClick={() => setMapLayer('satellite')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${mapLayer === 'satellite' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <Satellite className="w-3.5 h-3.5" /> Satellite
                  </button>
                  <button onClick={() => setMapLayer('street')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${mapLayer === 'street' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <MapIcon className="w-3.5 h-3.5" /> Map
                  </button>
                  <button onClick={() => setMapLayer('hybrid')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${mapLayer === 'hybrid' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <Layers className="w-3.5 h-3.5" /> Hybrid
                  </button>
                </div>

                <MapContainer
                  key={project.id}
                  center={[project.lat!, project.lng!]}
                  zoom={project.zoom || 19}
                  maxZoom={22}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                >
                  <TileLayer
                    key={mapLayer}
                    url={effectiveTileConfig.url}
                    attribution={effectiveTileConfig.attribution}
                    maxNativeZoom={20}
                    maxZoom={22}
                  />
                  {mapLayer === 'hybrid' && !autoSwitchedToStreet && tileConfig.overlay && (
                    <TileLayer url={tileConfig.overlay} attribution="" maxNativeZoom={20} maxZoom={22} opacity={1} />
                  )}

                  <ZoomWatcher onZoomChange={setCurrentZoom} />
                  <MapRefCapture mapRef={mapRef} onMount={setMapInstance} />
                  <MapClickHandler mode={mapMode} onPlace={handleMapClick} onBorder={handleBorderClick} onShape={handleShapeClick} />

                  {/* Yard shapes */}
                  {project.shapes.map(s => (
                    <Polygon
                      key={s.id}
                      positions={s.coordinates}
                      pathOptions={{ color: s.color, fillColor: s.fill_color, fillOpacity: 0.4, weight: 2 }}
                    />
                  ))}
                  {project.shapes.map(s => s.coordinates.length >= 3 && (
                    <Marker
                      key={`label-${s.id}`}
                      position={polygonCentroid(s.coordinates)}
                      icon={shapeLabelIcon(s.label, s.color)}
                    />
                  ))}

                  {/* Property border — always visible so it stays clear at any zoom */}
                  {savedBorder && savedBorder.length >= 3 && !isDrawingBorder && (
                    <Polygon
                      positions={savedBorder}
                      pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: clipMode ? 0 : 0.08, weight: 2.5, dashArray: '6 4' }}
                    />
                  )}

                  {/* In-progress border drawing */}
                  {isDrawingBorder && borderPoints.length >= 2 && (
                    <Polyline positions={borderPoints} pathOptions={{ color: '#16a34a', weight: 2.5, dashArray: '6 4' }} />
                  )}
                  {isDrawingBorder && borderPoints.map((pt, i) => (
                    <Marker key={i} position={pt} icon={dotIcon(i === 0 ? '#16a34a' : '#22c55e', i === 0 ? 12 : 8)} />
                  ))}

                  {/* In-progress shape drawing */}
                  {isDrawingShape && shapePoints.length >= 2 && (
                    <Polyline positions={shapePoints} pathOptions={{ color: SHAPE_TYPES.find(s => s.key === newShapeType)?.color ?? '#6d28d9', weight: 2.5, dashArray: '5 4' }} />
                  )}
                  {isDrawingShape && shapePoints.map((pt, i) => (
                    <Marker key={i} position={pt} icon={dotIcon(SHAPE_TYPES.find(s => s.key === newShapeType)?.color ?? '#6d28d9', i === 0 ? 12 : 8)} />
                  ))}

                  {pendingAerialClick && (
                    <Marker position={[pendingAerialClick.lat, pendingAerialClick.lng]}
                      icon={L.divIcon({
                        html: '<div style="width:18px;height:18px;background:#facc15;border-radius:50%;border:2px solid white;box-shadow:0 0 0 3px rgba(250,204,21,0.4)"></div>',
                        className: '', iconSize: [18, 18], iconAnchor: [9, 9],
                      })} />
                  )}

                  {project.aerialMarkers.map((m, idx) => (
                    <Marker
                      key={`${m.id}-${ageOffset}`}
                      position={[m.lat, m.lng]}
                      icon={aerialMarkerIcon(idx, m.status || 'planted', markerAgeScale(m, ageOffset))}
                    />
                  ))}
                </MapContainer>

                {/* Auto-switched layer indicator */}
                {autoSwitchedToStreet && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full shadow pointer-events-none">
                    Street map · satellite unavailable at this zoom
                  </div>
                )}
              </div>

              {/* Clip mode overlays (outside the rotating wrapper) */}

              {/* Compass — always points north */}
              {clipMode && (
                <div className="absolute top-4 right-4 z-[1001] pointer-events-none">
                  <CompassRose rotation={rotation} />
                </div>
              )}

              {/* Rotation controls */}
              {clipMode && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-3 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 px-4 py-2.5">
                  <RotateCw className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type="range"
                    min={0} max={359} value={rotation}
                    onChange={e => setRotation(parseInt(e.target.value))}
                    className="w-36 accent-forest-600"
                  />
                  <span className="text-xs font-mono text-gray-600 w-9 text-right">{rotation}°</span>
                  <div className="w-px h-5 bg-gray-200" />
                  {[
                    { deg: 0, label: 'N↑' },
                    { deg: 90, label: 'E↑' },
                    { deg: 180, label: 'S↑' },
                    { deg: 270, label: 'W↑' },
                  ].map(({ deg, label }) => (
                    <button
                      key={deg}
                      onClick={() => setRotation(deg)}
                      className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${rotation === deg ? 'bg-forest-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="lg:w-72 xl:w-80 shrink-0 space-y-4">
            {pendingAerialClick && !isDrawing ? (
              <PlantPicker onPlace={handlePlaceAerialMarker} onCancel={() => setPendingAerialClick(null)} showPlantingDetails />
            ) : isDrawingBorder ? (
              <div className="bg-forest-50 border border-forest-200 rounded-xl p-4 text-sm text-forest-700">
                <p className="font-medium mb-2 flex items-center gap-2">
                  <PenLine className="w-4 h-4" /> Drawing Property Border
                </p>
                <ol className="space-y-1.5 text-forest-600 text-xs list-decimal list-inside">
                  <li>Click around the edge of your property</li>
                  <li>Add at least 3 points to form a polygon</li>
                  <li>Use <strong>Undo</strong> to remove the last point</li>
                  <li>Click <strong>Finish Border</strong> when done</li>
                </ol>
                <p className="text-xs text-forest-500 mt-2">{borderPoints.length} point{borderPoints.length !== 1 ? 's' : ''} added</p>
              </div>
            ) : isDrawingShape ? (
              (() => { const t = SHAPE_TYPES.find(s => s.key === newShapeType) || SHAPE_TYPES[0]; return (
                <div className="rounded-xl p-4 text-sm border" style={{ background: t.fill + '55', borderColor: t.color }}>
                  <p className="font-medium mb-3 flex items-center gap-2" style={{ color: t.color }}>
                    <Square className="w-4 h-4" /> Drawing {t.label}
                  </p>
                  <div className="mb-3">
                    <label className="text-xs mb-1 block font-medium" style={{ color: t.color }}>Label</label>
                    <input
                      type="text"
                      value={newShapeLabel}
                      onChange={e => setNewShapeLabel(e.target.value)}
                      className="w-full px-2.5 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 bg-white"
                      style={{ borderColor: t.color + '66' }}
                      placeholder={t.label}
                    />
                  </div>
                  <ol className="space-y-1.5 text-xs list-decimal list-inside" style={{ color: t.color }}>
                    <li>Click to trace the corners of the area</li>
                    <li>At least 3 points needed</li>
                    <li>Use <strong>Undo</strong> to remove the last point</li>
                    <li>Click <strong>Finish Area</strong> when done</li>
                  </ol>
                  <p className="text-xs mt-2 opacity-70" style={{ color: t.color }}>{shapePoints.length} point{shapePoints.length !== 1 ? 's' : ''} added</p>
                </div>
              ); })()
            ) : (
              <div className="bg-forest-50 border border-forest-200 rounded-xl p-4 text-sm text-forest-700">
                <p className="font-medium mb-2">Property Workspace</p>
                <ul className="space-y-1.5 text-forest-600 text-xs">
                  <li>🌿 <strong>Mark plants:</strong> click the map, search a plant</li>
                  <li>🗺 <strong>Layers:</strong> use the toggle on the map left</li>
                  <li>📐 <strong>Border:</strong> draw your property outline</li>
                  <li>🔍 <strong>Zoom:</strong> scroll to zoom; Save Zoom to keep it</li>
                </ul>
              </div>
            )}

            {/* Age Timeline Panel */}
            {project.aerialMarkers.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  Age Timeline
                </h3>
                <div className="flex gap-1 mb-3 flex-wrap">
                  {([0, 1, 5, 10, 30] as AgeOffset[]).map(yr => (
                    <button
                      key={yr}
                      onClick={() => setAgeOffset(yr)}
                      className={`flex-1 min-w-[40px] py-1 rounded-lg text-xs font-medium transition-colors ${
                        ageOffset === yr ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {yr === 0 ? 'Now' : `+${yr}yr`}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {project.aerialMarkers.map((m, idx) => {
                    const est = estimateHeight(m, ageOffset);
                    const futureYear = CURRENT_YEAR + ageOffset;
                    const notPlantedYet = m.year_planted && futureYear < m.year_planted;
                    return (
                      <div key={m.id} className="flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0 border border-white shadow-sm"
                          style={{ backgroundColor: mkColor(idx), opacity: m.status === 'planned' ? 0.5 : 1 }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate">{m.plant_name}</div>
                          {notPlantedYet ? (
                            <div className="text-xs text-gray-400">Not planted until {m.year_planted}</div>
                          ) : est > 0 ? (
                            <div className="text-xs text-blue-600 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              ~{est} ft tall
                              {m.year_planted && <span className="text-gray-400">· age {futureYear - m.year_planted}yr</span>}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">No year data</div>
                          )}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          m.status === 'planted' ? 'bg-forest-100 text-forest-700' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {m.status === 'planted' ? '🌱' : '📋'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {ageOffset > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Showing estimated sizes in {CURRENT_YEAR + ageOffset}
                  </p>
                )}
              </div>
            )}

            {/* Aerial markers list */}
            {project.aerialMarkers.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-forest-600" />
                  Mapped Plants ({project.aerialMarkers.length})
                </h3>
                <div className="space-y-2">
                  {project.aerialMarkers.map((m, idx) => (
                    <div key={m.id} className="flex items-start gap-2.5 group">
                      <div className="w-4 h-4 rounded-full mt-0.5 shrink-0 border border-white shadow-sm"
                        style={{ backgroundColor: mkColor(idx), opacity: m.status === 'planned' ? 0.5 : 1 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{m.plant_name}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {/* Status toggle button */}
                          <button
                            onClick={() => handleToggleMarkerStatus(m)}
                            className={`text-xs px-1.5 py-0.5 rounded-full font-medium border transition-colors ${
                              m.status === 'planted'
                                ? 'bg-forest-50 text-forest-700 border-forest-200 hover:bg-forest-100'
                                : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                            }`}
                            title="Click to toggle planted/planned"
                          >
                            {m.status === 'planted' ? '🌱 Planted' : '📋 Planned'}
                          </button>
                          {m.year_planted && (
                            <span className="text-xs text-gray-400">{m.year_planted}</span>
                          )}
                        </div>
                        {m.notes && <div className="text-xs text-gray-400 truncate">{m.notes}</div>}
                      </div>
                      <button onClick={() => handleDeleteAerialMarker(m.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Yard Areas */}
            {!isDrawing && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                  <Square className="w-4 h-4 text-gray-500" />
                  Yard Areas {project.shapes.length > 0 && `(${project.shapes.length})`}
                </h3>
                {project.shapes.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {project.shapes.map(s => {
                      const t = SHAPE_TYPES.find(st => st.key === s.shape_type) || SHAPE_TYPES[SHAPE_TYPES.length - 1];
                      return (
                        <div key={s.id} className="flex items-center gap-2 group">
                          <span className="w-3.5 h-3.5 rounded-sm shrink-0 border"
                            style={{ background: s.fill_color, borderColor: s.color }} />
                          <span className="text-sm text-gray-800 flex-1 truncate">{s.label}</span>
                          <span className="text-xs text-gray-400 shrink-0">{t.label}</span>
                          <button onClick={() => handleDeleteShape(s.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-500 mb-2 font-medium">Draw a new area:</p>
                <div className="grid grid-cols-2 gap-1">
                  {SHAPE_TYPES.map(s => (
                    <button key={s.key} onClick={() => startDrawingShape(s.key)}
                      className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs text-left transition-colors">
                      <span className="w-3 h-3 rounded-sm shrink-0 border"
                        style={{ background: s.fill, borderColor: s.color }} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PHOTOS TAB ─────────────────────────────────────────────────── */}
      {tab === 'photos' && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Upload Photo'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => handleUpload(e.target.files)} />
              {activeImage && <span className="text-xs text-gray-400">Click the photo to place a plant marker</span>}
            </div>

            {project.images.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {project.images.map(img => (
                  <div key={img.id} className="relative shrink-0 group">
                    <button onClick={() => { setActiveImageId(img.id); setPendingPhotoClick(null); }}
                      className={`w-20 h-16 rounded-lg overflow-hidden border-2 transition-colors ${img.id === activeImageId ? 'border-forest-500' : 'border-gray-200 hover:border-forest-300'}`}>
                      <img src={`/uploads/${img.filename}`} alt={img.original_name} className="w-full h-full object-cover" />
                    </button>
                    <div className="absolute -top-1.5 -right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="bg-forest-600 text-white text-xs rounded-full px-1.5 py-0.5">{img.markers.length}</span>
                      <button onClick={() => handleDeleteImage(img.id)} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeImage ? (
              <div ref={imageContainerRef} onClick={handlePhotoImageClick}
                className="relative rounded-xl overflow-hidden border border-gray-200 cursor-crosshair bg-gray-50" style={{ maxHeight: 600 }}>
                <img src={`/uploads/${activeImage.filename}`} alt={activeImage.original_name}
                  className="w-full h-auto block pointer-events-none select-none"
                  style={{ maxHeight: 600, objectFit: 'contain' }} draggable={false} />
                {activeImage.markers.map((m, idx) => (
                  <div key={m.id} style={{ left: `${m.x_percent}%`, top: `${m.y_percent}%`, position: 'absolute' }}
                    className="transform -translate-x-1/2 -translate-y-full group z-10" onClick={e => e.stopPropagation()}>
                    <div className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer"
                      style={{ backgroundColor: mkColor(idx) }}
                      title={`${m.plant_name}${m.notes ? ` — ${m.notes}` : ''}`}>
                      <Leaf className="w-3 h-3 text-white" />
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-20">
                      <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                        <div className="font-medium">{m.plant_name}</div>
                        {m.notes && <div className="text-gray-400 text-xs">{m.notes}</div>}
                        <button onClick={() => handleDeletePhotoMarker(activeImage.id, m.id)}
                          className="mt-1 text-red-400 hover:text-red-300 flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>
                      <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                    </div>
                  </div>
                ))}
                {pendingPhotoClick && (
                  <div style={{ left: `${pendingPhotoClick.x}%`, top: `${pendingPhotoClick.y}%`, position: 'absolute' }}
                    className="transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <div className="w-5 h-5 rounded-full bg-yellow-400 border-2 border-white shadow-lg animate-pulse" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <Upload className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">Upload your first photo</p>
                <p className="text-gray-400 text-sm mt-1">Add yard or garden photos to map plants onto them</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="mt-4 bg-forest-600 hover:bg-forest-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                  Upload Photo
                </button>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="lg:w-72 xl:w-80 shrink-0 space-y-4">
            {pendingPhotoClick ? (
              <PlantPicker onPlace={handlePlacePhotoMarker} onCancel={() => setPendingPhotoClick(null)} />
            ) : (
              activeImage && activeImage.markers.length === 0 && (
                <div className="bg-forest-50 border border-forest-200 rounded-xl p-4 text-sm text-forest-700">
                  <p className="font-medium mb-1">How to place plants</p>
                  <ol className="list-decimal list-inside space-y-1 text-forest-600">
                    <li>Click any spot on the photo</li>
                    <li>Search and select a plant</li>
                    <li>Optionally add notes, then click Place Marker</li>
                  </ol>
                </div>
              )
            )}
            {activeImage && activeImage.markers.length > 0 && !pendingPhotoClick && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-forest-600" />
                  Plants on this photo ({activeImage.markers.length})
                </h3>
                <div className="space-y-2">
                  {activeImage.markers.map((m, idx) => (
                    <div key={m.id} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 rounded-full mt-0.5 shrink-0 border border-white shadow-sm" style={{ backgroundColor: mkColor(idx) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{m.plant_name}</div>
                        {m.notes && <div className="text-xs text-gray-400 truncate">{m.notes}</div>}
                      </div>
                      <button onClick={() => handleDeletePhotoMarker(activeImage.id, m.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {project.images.length > 1 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                <strong>Comparing layouts:</strong> {project.images.length} photos. Click a thumbnail to switch.
              </div>
            )}
          </div>
        </div>
      )}

      {!hasAerial && project.images.length === 0 && tab === 'photos' && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No aerial coordinates saved for this project.{' '}
          <button onClick={() => navigate('/projects')} className="text-forest-600 hover:underline">
            Re-create the project with an address search to enable the aerial map.
          </button>
        </div>
      )}
    </div>
  );
}
