import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Upload, Trash2, Plus, X, Search, MapPin, Leaf,
  Satellite, Image as ImageIcon, Sun, Cloud, Moon, Ruler,
  Map as MapIcon, Layers, PenLine, Undo2, Check, ZoomIn, Save
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
}

interface ProjectImage {
  id: number;
  filename: string;
  original_name: string;
  created_at: string;
  markers: PlantMarker[];
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
}

type MapLayer = 'satellite' | 'street' | 'hybrid';
type MapMode  = 'place' | 'draw-border';
type Tab      = 'aerial' | 'photos';

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
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, © OpenStreetMap contributors',
    // World_Reference_Overlay = transparent labels/roads/boundaries designed for satellite base
    overlay: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
  },
};

// ── Helper components ──────────────────────────────────────────────────────

function SunBadge({ req }: { req: string }) {
  if (req === 'full-sun')   return <span className="flex items-center gap-0.5 text-yellow-600 text-xs font-medium"><Sun className="w-3 h-3" /> Full Sun</span>;
  if (req === 'part-shade') return <span className="flex items-center gap-0.5 text-orange-500 text-xs font-medium"><Cloud className="w-3 h-3" /> Part Shade</span>;
  return <span className="flex items-center gap-0.5 text-blue-500 text-xs font-medium"><Moon className="w-3 h-3" /> Full Shade</span>;
}

function leafIcon(idx: number) {
  return L.divIcon({
    html: `<div style="background:${mkColor(idx)};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
    </div>`,
    className: '', iconSize: [24, 24], iconAnchor: [12, 12],
  });
}

function dotIcon(color: string, size = 10) {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.5);"></div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

// Captures the Leaflet map instance into a ref
function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map]);
  return null;
}

// Handles clicks for either plant placement or border drawing
function MapClickHandler({
  mode, onPlace, onBorder,
}: { mode: MapMode; onPlace: (lat: number, lng: number) => void; onBorder: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { mode === 'draw-border' ? onBorder(e.latlng.lat, e.latlng.lng) : onPlace(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// ── Shared plant picker ─────────────────────────────────────────────────────

interface PlantPickerProps {
  onPlace: (plant: PlantResult, notes: string) => Promise<void>;
  onCancel: () => void;
}

// iNaturalist result mapped to PlantResult shape
function inatToPlantResult(taxon: any): PlantResult {
  return {
    id: `inat-${taxon.id}`,
    commonName: taxon.preferred_common_name || taxon.english_common_name || taxon.name,
    scientificName: taxon.name,
    type: 'tree',           // iNat doesn't provide type — default
    sunRequirements: [],
    height: { min: 0, max: 0 },
    waterRequirements: '',
    bloomColor: [],
  };
}

function PlantPicker({ onPlace, onCancel }: PlantPickerProps) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<PlantResult[]>([]);
  const [inatResults, setInatResults] = useState<PlantResult[]>([]);
  const [selected, setSelected]   = useState<PlantResult | null>(null);
  const [notes, setNotes]         = useState('');
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
        // If fewer than 4 local results, also query iNaturalist for broader matches
        if (localList.length < 4) {
          try {
            const inat = await axios.get('/api/plants/inaturalist/search', { params: { q: query } });
            const taxa: any[] = inat.data.results || [];
            // Exclude any that already appear in local results
            const localIds = new Set(localList.map(p => p.scientificName.toLowerCase()));
            const extra = taxa
              .filter(t => t.preferred_common_name || t.english_common_name)
              .filter(t => !localIds.has(t.name.toLowerCase()))
              .slice(0, 8)
              .map(inatToPlantResult);
            setInatResults(extra);
          } catch { /* iNat unavailable — silently skip */ }
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
    try { await onPlace(selected, notes); }
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

      {/* Manual entry form */}
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

      {/* Always-visible "add custom" link when there are results but plant not found */}
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
  const mapRef = useRef<L.Map | null>(null);

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
          try { setSavedBorder(JSON.parse(p.property_border)); } catch {}
        }
      })
      .catch(() => { toast.error('Project not found'); navigate('/projects'); })
      .finally(() => setLoading(false));
  }, [id]);

  const activeImage = project?.images.find(img => img.id === activeImageId) ?? null;

  // ── Map layer/mode helpers ──────────────────────────────────────────────

  const startDrawingBorder = () => {
    setPendingAerialClick(null);
    setBorderPoints([]);
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
      toast.success('Property border saved!');
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

  const handlePlaceAerialMarker = async (plant: PlantResult, notes: string) => {
    if (!pendingAerialClick) return;
    const res = await axios.post(`/api/projects/${id}/aerial-markers`, {
      plant_id: plant.id, plant_name: plant.commonName,
      lat: pendingAerialClick.lat, lng: pendingAerialClick.lng, notes,
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

  const hasAerial   = !!(project.lat && project.lng);
  const tileConfig  = TILE_LAYERS[mapLayer];
  const isDrawing   = mapMode === 'draw-border';

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
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6 w-fit gap-1">
        {hasAerial && (
          <button onClick={() => setTab('aerial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'aerial' ? 'bg-white shadow text-forest-800' : 'text-gray-500 hover:text-gray-700'}`}>
            <Satellite className="w-4 h-4" /> Aerial Map
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

            {/* Compact toolbar: border tools + save zoom only (layer toggle moved onto map) */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {!isDrawing ? (
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
                    <Check className="w-3.5 h-3.5" /> {savingBorder ? 'Saving…' : 'Finish'}
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
                title="Save current zoom as default for this project">
                <Save className="w-3.5 h-3.5" />
                {savingZoom ? 'Saving…' : 'Save Zoom'}
              </button>

              {/* Status hint */}
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

            {/* Map — with layer toggle overlaid on left side */}
            <div className={`relative rounded-xl overflow-hidden border border-gray-200 ${isDrawing ? 'ring-2 ring-forest-400' : ''}`} style={{ height: 720 }}>

              {/* Layer toggle — vertical pill buttons overlaid on map left */}
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
                {/* Base tile layer */}
                <TileLayer
                  key={mapLayer}
                  url={tileConfig.url}
                  attribution={tileConfig.attribution}
                  maxNativeZoom={20}
                  maxZoom={22}
                />
                {/* Hybrid overlay: transparent labels/roads/boundaries on top of imagery */}
                {mapLayer === 'hybrid' && tileConfig.overlay && (
                  <TileLayer
                    url={tileConfig.overlay}
                    attribution=""
                    maxNativeZoom={20}
                    maxZoom={22}
                    opacity={1}
                  />
                )}

                <MapRefCapture mapRef={mapRef} />
                <MapClickHandler mode={mapMode} onPlace={handleMapClick} onBorder={handleBorderClick} />

                {/* Saved property border */}
                {savedBorder && savedBorder.length >= 3 && !isDrawing && (
                  <Polygon
                    positions={savedBorder}
                    pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.1, weight: 2.5, dashArray: '6 4' }}
                  />
                )}

                {/* In-progress border drawing */}
                {isDrawing && borderPoints.length >= 2 && (
                  <Polyline positions={borderPoints} pathOptions={{ color: '#16a34a', weight: 2.5, dashArray: '6 4' }} />
                )}
                {isDrawing && borderPoints.map((pt, i) => (
                  <Marker key={i} position={pt} icon={dotIcon(i === 0 ? '#16a34a' : '#22c55e', i === 0 ? 12 : 8)} />
                ))}

                {/* Pending plant-placement click */}
                {pendingAerialClick && (
                  <Marker position={[pendingAerialClick.lat, pendingAerialClick.lng]}
                    icon={L.divIcon({
                      html: '<div style="width:18px;height:18px;background:#facc15;border-radius:50%;border:2px solid white;box-shadow:0 0 0 3px rgba(250,204,21,0.4)"></div>',
                      className: '', iconSize: [18, 18], iconAnchor: [9, 9],
                    })} />
                )}

                {/* Placed aerial plant markers */}
                {project.aerialMarkers.map((m, idx) => (
                  <Marker key={m.id} position={[m.lat, m.lng]} icon={leafIcon(idx)} />
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Right panel */}
          <div className="lg:w-72 xl:w-80 shrink-0 space-y-4">
            {pendingAerialClick && !isDrawing ? (
              <PlantPicker onPlace={handlePlaceAerialMarker} onCancel={() => setPendingAerialClick(null)} />
            ) : (
              <div className="bg-forest-50 border border-forest-200 rounded-xl p-4 text-sm text-forest-700">
                <p className="font-medium mb-2">Aerial Map</p>
                <ul className="space-y-1.5 text-forest-600 text-xs">
                  <li>🌿 <strong>Place plants:</strong> click the map, search a plant</li>
                  <li>🗺 <strong>Layers:</strong> use the toggle on the map left</li>
                  <li>📐 <strong>Border:</strong> draw your property outline</li>
                  <li>🔍 <strong>Zoom:</strong> scroll to zoom; Save Zoom to keep it</li>
                </ul>
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
                    <div key={m.id} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 rounded-full mt-0.5 shrink-0 border border-white shadow-sm" style={{ backgroundColor: mkColor(idx) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{m.plant_name}</div>
                        {m.notes && <div className="text-xs text-gray-400 truncate">{m.notes}</div>}
                      </div>
                      <button onClick={() => handleDeleteAerialMarker(m.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
