import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Sun, Upload, Trash2, Plus, Search, Info, X, Download,
  ImageIcon, Navigation, Eye, TreePine,
  RotateCw, Camera, Sparkles, MapPin, RefreshCw,
  Layers, Compass, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Grid3x3,
} from 'lucide-react';
import { YardZone, PlacedPlant, UploadedImage, SunPathData, Plant } from '../types';

// Fix Leaflet default icon issue with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const ZONE_COLORS = {
  lawn: '#4ade80',
  bed: '#86efac',
  patio: '#d1d5db',
  structure: '#9ca3af',
  water: '#7dd3fc',
};

const PLANT_TYPE_COLORS: Record<string, string> = {
  tree: '#15803d',
  shrub: '#16a34a',
  perennial: '#84cc16',
  annual: '#facc15',
  grass: '#a3e635',
  fern: '#4ade80',
  vine: '#86efac',
  groundcover: '#bbf7d0',
};

const ZONE_TYPES = ['lawn', 'bed', 'patio', 'structure', 'water'] as const;

// ─── Leaflet Components ───────────────────────────────────────────────────────

function SunPathLayer({ sunData, visible }: { sunData: SunPathData | null; visible: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!sunData || !visible) return;
    const { lat, lng } = sunData.location;
    const layers: L.Layer[] = [];

    const drawPath = (path: Array<{ azimuth: number; altitude: number; hour: number }>, color: string, weight: number) => {
      if (path.length < 2) return;
      const points = path
        .filter(p => p.altitude > 0)
        .map(p => {
          const dist = Math.max(0.001, (90 - p.altitude) / 90 * 0.005);
          const rad = (p.azimuth - 180) * Math.PI / 180;
          const latOff = dist * Math.cos(rad);
          const lngOff = dist * Math.sin(rad) / Math.cos(lat * Math.PI / 180);
          return L.latLng(lat + latOff, lng + lngOff);
        });

      if (points.length > 1) {
        const pl = L.polyline(points, { color, weight, opacity: 0.8, dashArray: weight < 3 ? '5,5' : undefined });
        pl.addTo(map);
        layers.push(pl);
      }
    };

    drawPath(sunData.seasonalPaths.summer, '#f59e0b', 3);
    drawPath(sunData.seasonalPaths.equinox, '#84cc16', 2);
    drawPath(sunData.seasonalPaths.winter, '#60a5fa', 3);

    const compassPoints = [
      { lat: lat + 0.004, lng, label: 'N' },
      { lat: lat - 0.004, lng, label: 'S' },
      { lat, lng: lng + 0.004, label: 'E' },
      { lat, lng: lng - 0.004, label: 'W' },
    ];
    compassPoints.forEach(({ lat: la, lng: lo, label }) => {
      const m = L.marker([la, lo], {
        icon: L.divIcon({
          html: `<div class="bg-white/90 text-gray-700 font-bold text-xs px-1.5 py-0.5 rounded border border-gray-300">${label}</div>`,
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(map);
      layers.push(m);
    });

    return () => {
      layers.forEach(l => l.remove());
    };
  }, [sunData, visible, map]);

  return null;
}

function MapCenterControl({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 17);
  }, [center, map]);
  return null;
}

function DrawingLayer({
  active,
  zoneColor,
  onComplete,
}: {
  active: boolean;
  zoneColor: string;
  onComplete: (coords: [number, number][]) => void;
}) {
  const map = useMap();
  const pointsRef = useRef<[number, number][]>([]);
  const tempLayersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!active) return;
    map.getContainer().style.cursor = 'crosshair';

    const onClick = (e: L.LeafletMouseEvent) => {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      pointsRef.current.push(pt);
      const dot = L.circleMarker(e.latlng, { radius: 5, color: zoneColor, fillColor: zoneColor, fillOpacity: 1 });
      dot.addTo(map);
      tempLayersRef.current.push(dot);
      if (pointsRef.current.length > 1) {
        const lastTwo = pointsRef.current.slice(-2);
        const line = L.polyline(lastTwo, { color: zoneColor, weight: 2, dashArray: '5,5' });
        line.addTo(map);
        tempLayersRef.current.push(line);
      }
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      if (pointsRef.current.length >= 3) onComplete([...pointsRef.current]);
      pointsRef.current = [];
      tempLayersRef.current.forEach(l => l.remove());
      tempLayersRef.current = [];
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.doubleClickZoom.disable();

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = '';
      pointsRef.current = [];
      tempLayersRef.current.forEach(l => l.remove());
      tempLayersRef.current = [];
    };
  }, [active, map, zoneColor, onComplete]);

  return null;
}

// SVG inverse-mask clip overlay: darkens everything outside the property polygon
function PropertyClipOverlay({ polygon, active }: { polygon: [number, number][]; active: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!active || polygon.length < 3) return;

    const mapContainer = map.getContainer();
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';

    const defs = document.createElementNS(ns, 'defs');
    const mask = document.createElementNS(ns, 'mask');
    mask.setAttribute('id', 'prop-clip-mask');

    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '-5000');
    bg.setAttribute('y', '-5000');
    bg.setAttribute('width', '10000');
    bg.setAttribute('height', '10000');
    bg.setAttribute('fill', 'white');

    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('fill', 'black');

    mask.appendChild(bg);
    mask.appendChild(poly);
    defs.appendChild(mask);
    svg.appendChild(defs);

    const overlay = document.createElementNS(ns, 'rect');
    overlay.setAttribute('x', '-5000');
    overlay.setAttribute('y', '-5000');
    overlay.setAttribute('width', '10000');
    overlay.setAttribute('height', '10000');
    overlay.setAttribute('fill', 'rgba(10,15,30,0.82)');
    overlay.setAttribute('mask', 'url(#prop-clip-mask)');
    svg.appendChild(overlay);

    div.appendChild(svg);
    mapContainer.appendChild(div);

    const updatePoints = () => {
      const pts = polygon.map(([lat, lng]) => {
        const p = map.latLngToContainerPoint(L.latLng(lat, lng));
        return `${p.x},${p.y}`;
      });
      poly.setAttribute('points', pts.join(' '));
    };

    updatePoints();
    map.on('move zoom resize viewreset', updatePoints);

    return () => {
      map.off('move zoom resize viewreset', updatePoints);
      div.remove();
    };
  }, [map, polygon, active]);

  return null;
}

// Renders plant markers as real-world-scale circles on the map
function PlantMarkersLayer({
  zones,
  visible,
}: {
  zones: YardZone[];
  visible: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return;
    const layers: L.Layer[] = [];
    const currentYear = new Date().getFullYear();

    zones.forEach(zone => {
      zone.plants.forEach(plant => {
        const age = plant.yearPlanted ? currentYear - plant.yearPlanted : 3;
        // Rough spread estimate: 1ft radius per year of growth, capped based on type
        const spreadFt = Math.min(age * 1.5, 25);
        const spreadM = spreadFt * 0.3048;

        const color = PLANT_TYPE_COLORS['shrub']; // default

        const circle = L.circle(plant.position, {
          radius: spreadM / 2,
          color,
          fillColor: color,
          fillOpacity: 0.35,
          weight: 1.5,
        });

        const heightDisplay = plant.yearPlanted
          ? `~${Math.round((plant.heightPlanted || 1) + age * 0.75)} ft est.`
          : 'height unknown';

        circle.bindTooltip(
          `<strong>${plant.commonName}</strong><br/>${heightDisplay}<br/>Planted: ${plant.yearPlanted || 'unknown'}`,
          { permanent: false, direction: 'top' }
        );

        circle.addTo(map);
        layers.push(circle);

        // Small dot at exact position
        const dot = L.circleMarker(plant.position, {
          radius: 4,
          color: '#1f2937',
          fillColor: color,
          fillOpacity: 1,
          weight: 1,
        });
        dot.addTo(map);
        layers.push(dot);
      });
    });

    return () => {
      layers.forEach(l => l.remove());
    };
  }, [map, zones, visible]);

  return null;
}

function GridOverlayLayer({ visible, gridSizeFt }: { visible: boolean; gridSizeFt: number }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return;

    const mapContainer = map.getContainer();
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:400;';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';

    div.appendChild(svg);
    mapContainer.appendChild(div);

    const drawGrid = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const bounds = map.getBounds();
      const gridMeters = gridSizeFt * 0.3048;
      const centerLat = bounds.getCenter().lat;

      const degPerMeterLat = 1 / 111111;
      const degPerMeterLng = 1 / (111111 * Math.cos(centerLat * Math.PI / 180));

      const gridDegLat = gridMeters * degPerMeterLat;
      const gridDegLng = gridMeters * degPerMeterLng;

      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const startLat = Math.floor(south / gridDegLat) * gridDegLat;
      const startLng = Math.floor(west / gridDegLng) * gridDegLng;

      for (let lat = startLat; lat <= north + gridDegLat; lat += gridDegLat) {
        const p1 = map.latLngToContainerPoint(L.latLng(lat, west));
        const p2 = map.latLngToContainerPoint(L.latLng(lat, east));
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(p1.x - 20));
        line.setAttribute('y1', String(p1.y));
        line.setAttribute('x2', String(p2.x + 20));
        line.setAttribute('y2', String(p2.y));
        line.setAttribute('stroke', 'rgba(255,255,255,0.4)');
        line.setAttribute('stroke-width', '0.75');
        svg.appendChild(line);
      }

      for (let lng = startLng; lng <= east + gridDegLng; lng += gridDegLng) {
        const p1 = map.latLngToContainerPoint(L.latLng(north, lng));
        const p2 = map.latLngToContainerPoint(L.latLng(south, lng));
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(p1.x));
        line.setAttribute('y1', String(p1.y - 20));
        line.setAttribute('x2', String(p2.x));
        line.setAttribute('y2', String(p2.y + 20));
        line.setAttribute('stroke', 'rgba(255,255,255,0.4)');
        line.setAttribute('stroke-width', '0.75');
        svg.appendChild(line);
      }
    };

    drawGrid();
    map.on('move zoom resize viewreset', drawGrid);

    return () => {
      map.off('move zoom resize viewreset', drawGrid);
      div.remove();
    };
  }, [visible, map, gridSizeFt]);

  return null;
}

// ─── UI Components ────────────────────────────────────────────────────────────

function CompassRose({ mapRotation }: { mapRotation: number }) {
  const arrowAngle = -mapRotation;
  return (
    <div
      className="w-14 h-14 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 flex items-center justify-center"
      title={`Map rotated ${mapRotation}°. North is ${mapRotation === 0 ? 'up' : `${mapRotation}° clockwise from up`}.`}
    >
      <svg viewBox="0 0 56 56" className="w-12 h-12">
        <g transform={`rotate(${arrowAngle}, 28, 28)`}>
          <polygon points="28,6 24,28 28,24 32,28" fill="#ef4444" />
          <polygon points="28,50 24,28 28,32 32,28" fill="#9ca3af" />
          <circle cx="28" cy="28" r="3" fill="#1f2937" />
          <text x="28" y="17" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="bold" fill="white">N</text>
        </g>
        {[0, 90, 180, 270].map(angle => (
          <line
            key={angle}
            x1="28" y1="1" x2="28" y2="5"
            stroke="#d1d5db" strokeWidth="1.5"
            transform={`rotate(${angle}, 28, 28)`}
          />
        ))}
      </svg>
    </div>
  );
}

interface AddPlantModalProps {
  zoneId: string;
  zoneName: string;
  onClose: () => void;
  onAdd: (zoneId: string, plant: PlacedPlant) => void;
  defaultPosition: [number, number];
}

function AddPlantModal({ zoneId, zoneName, onClose, onAdd, defaultPosition }: AddPlantModalProps) {
  const [plantSearch, setPlantSearch] = useState('');
  const [plantResults, setPlantResults] = useState<Plant[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [yearPlanted, setYearPlanted] = useState(new Date().getFullYear());
  const [heightPlanted, setHeightPlanted] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const searchPlants = async (q: string) => {
    if (!q.trim() || q.length < 2) { setPlantResults([]); return; }
    try {
      const res = await axios.get('/api/plants/search', { params: { q, limit: 6 } });
      setPlantResults(res.data.results || []);
    } catch { /* backend may be offline */ }
  };

  const handleSearchChange = (val: string) => {
    setPlantSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchPlants(val), 300);
  };

  const handleAdd = () => {
    if (!selectedPlant) { toast.error('Select a plant first'); return; }
    const placed: PlacedPlant = {
      id: crypto.randomUUID(),
      plantId: selectedPlant.id,
      commonName: selectedPlant.commonName,
      scientificName: selectedPlant.scientificName,
      position: defaultPosition,
      yearPlanted,
      heightPlanted,
      plantedDate: `${yearPlanted}-01-01`,
      notes,
    };
    onAdd(zoneId, placed);
    toast.success(`${selectedPlant.commonName} added to ${zoneName}!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Add Plant to Zone</h2>
            <p className="text-xs text-gray-500 mt-0.5">Zone: {zoneName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Plant search */}
          <div>
            <label className="label">Plant</label>
            {selectedPlant ? (
              <div className="flex items-start justify-between p-3 bg-forest-50 rounded-xl border border-forest-200">
                <div>
                  <p className="font-medium text-forest-800 text-sm">{selectedPlant.commonName}</p>
                  <p className="text-xs text-forest-600 italic">{selectedPlant.scientificName}</p>
                  <p className="text-xs text-forest-600 mt-0.5">
                    Mature: {selectedPlant.height.min}–{selectedPlant.height.max} ft tall · {selectedPlant.spread.min}–{selectedPlant.spread.max} ft wide
                  </p>
                </div>
                <button onClick={() => { setSelectedPlant(null); setPlantSearch(''); }} className="text-gray-400 hover:text-gray-600 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={plantSearch}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search plants by name..."
                  className="input pl-10 text-sm"
                  autoFocus
                />
                {plantResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 mt-1 max-h-48 overflow-y-auto">
                    {plantResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPlant(p); setPlantSearch(p.commonName); setPlantResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-forest-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900">{p.commonName}</p>
                        <p className="text-xs text-gray-500 italic">{p.scientificName}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Year & height planted */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Year Planted</label>
              <input
                type="number"
                value={yearPlanted}
                onChange={e => setYearPlanted(parseInt(e.target.value) || new Date().getFullYear())}
                min={1900}
                max={new Date().getFullYear() + 5}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label">Height at Planting (ft)</label>
              <input
                type="number"
                value={heightPlanted}
                onChange={e => setHeightPlanted(parseFloat(e.target.value) || 1)}
                min={0.1}
                max={100}
                step={0.5}
                className="input text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Planting notes, source nursery, etc."
              className="input text-sm resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm justify-center">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={!selectedPlant} className="flex-1 btn-primary text-sm justify-center disabled:opacity-50">
            <TreePine className="w-4 h-4" />
            Add Plant
          </button>
        </div>
      </div>
    </div>
  );
}

interface StreetViewPanelProps {
  zones: YardZone[];
  address: string;
  viewType: 'aerial' | 'street';
  onClose: () => void;
}

function StreetViewPanel({ zones, address, viewType, onClose }: StreetViewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const currentYear = new Date().getFullYear();

  const allPlants = zones.flatMap(zone =>
    zone.plants.map(p => {
      const age = p.yearPlanted ? currentYear - p.yearPlanted : 3;
      const growthPerYear = 0.75; // ft/yr rough default
      const estimated = (p.heightPlanted || 1) + age * growthPerYear;
      return {
        commonName: p.commonName,
        scientificName: p.scientificName,
        yearPlanted: p.yearPlanted || currentYear - 3,
        heightPlanted: p.heightPlanted || 1,
        currentEstimatedHeight: Math.round(estimated * 10) / 10,
        currentEstimatedSpread: Math.round(estimated * 0.8 * 10) / 10,
        growthRate: 'medium',
        type: 'shrub',
        zoneName: zone.name,
      };
    })
  );

  const generate = async () => {
    if (allPlants.length === 0) {
      toast.error('Add plants to your zones first');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/ai/streetview', {
        plants: allPlants,
        address,
        viewType,
      });
      const text = res.data.visualization || '';
      setResult(text);
      setIsDemo(res.data.demo || false);
      if (res.data.demo) {
        toast('Running in demo mode — add ANTHROPIC_API_KEY for real AI.', { icon: '⚠️', duration: 4000 });
      }
    } catch (err: any) {
      const fallback = err.response?.data?.visualization;
      if (fallback) {
        setResult(fallback);
        setIsDemo(true);
      } else {
        toast.error(err.response?.data?.error || 'AI generation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate();
  }, []);

  const sections = (result || '').split('\n\n').filter(s => s.trim());

  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-white border-l border-gray-200 shadow-2xl z-[1001] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-2">
          {viewType === 'street' ? (
            <Eye className="w-4 h-4 text-purple-600" />
          ) : (
            <Camera className="w-4 h-4 text-blue-600" />
          )}
          <span className="font-semibold text-sm text-gray-900">
            {viewType === 'street' ? 'Street View' : 'Aerial View'} — AI Visualization
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
            <p className="text-sm font-medium">AI is visualizing your landscape…</p>
            <p className="text-xs text-center">Analyzing {allPlants.length} plant{allPlants.length !== 1 ? 's' : ''} across {zones.filter(z => z.plants.length > 0).length} zone{zones.filter(z => z.plants.length > 0).length !== 1 ? 's' : ''}</p>
          </div>
        ) : result ? (
          <div className="space-y-3">
            {isDemo && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Demo mode — add ANTHROPIC_API_KEY for real AI
              </div>
            )}
            <div className="prose-ai space-y-2 text-sm">
              {sections.map((section, i) => {
                const t = section.trim();
                if (t.startsWith('## ') || t.startsWith('# ')) return <h2 key={i} className="font-bold text-gray-900 text-sm mt-3 mb-1">{t.replace(/^#+\s/, '')}</h2>;
                if (t.startsWith('### ')) return <h3 key={i} className="font-semibold text-gray-800 text-xs mt-2 mb-1">{t.replace(/^###\s/, '')}</h3>;
                if (t.startsWith('**') && t.endsWith('**')) return <h3 key={i} className="font-semibold text-gray-800 text-xs mt-2">{t.replace(/\*\*/g, '')}</h3>;
                if (t.startsWith('- ') || t.includes('\n- ')) {
                  const items = t.split('\n').filter(l => l.startsWith('- '));
                  return <ul key={i} className="list-disc list-inside space-y-0.5 text-xs text-gray-700">{items.map((item, j) => <li key={j} dangerouslySetInnerHTML={{ __html: item.replace(/^- /, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />)}</ul>;
                }
                return <p key={i} className="text-xs text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') }} />;
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <Sparkles className="w-8 h-8" />
            <p className="text-sm text-center">No result yet. Add plants to zones then generate.</p>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-100 space-y-2">
        <div className="text-xs text-gray-400 text-center">{allPlants.length} plant{allPlants.length !== 1 ? 's' : ''} · estimated heights based on age</div>
        <button onClick={generate} disabled={loading} className="w-full btn-secondary text-xs justify-center">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Regenerate
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [center, setCenter] = useState<[number, number]>([38.8977, -77.0365]);
  const [address, setAddress] = useState('');
  const [houseOrientation, setHouseOrientation] = useState(0);
  const [sunData, setSunData] = useState<SunPathData | null>(null);
  const [sunDate, setSunDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadingSun, setLoadingSun] = useState(false);
  const [showSunPath, setShowSunPath] = useState(false);
  const [mapLayer, setMapLayer] = useState<'satellite' | 'street'>('satellite');

  // Property border + clip
  const [propertyBorder, setPropertyBorder] = useState<[number, number][] | null>(null);
  const [drawingBorder, setDrawingBorder] = useState(false);
  const [clipMode, setClipMode] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const [showRotationControl, setShowRotationControl] = useState(false);

  // Zones
  const [zones, setZones] = useState<YardZone[]>([]);
  const [drawingZone, setDrawingZone] = useState(false);
  const [newZoneType, setNewZoneType] = useState<typeof ZONE_TYPES[number]>('bed');
  const [newZoneName, setNewZoneName] = useState('New Bed');
  const [selectedZone, setSelectedZone] = useState<YardZone | null>(null);

  // Plants
  const [addPlantModal, setAddPlantModal] = useState<{ zoneId: string; zoneName: string } | null>(null);
  const [showPlantMarkers, setShowPlantMarkers] = useState(true);

  // View mode
  const [viewMode, setViewMode] = useState<'aerial' | 'street' | null>(null);

  // Images
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [showImageLayer, setShowImageLayer] = useState(false);

  // Grid overlay
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState<1 | 3 | 5 | 10>(5);

  const [sidebarTab, setSidebarTab] = useState<'zones' | 'sun' | 'images' | 'plants'>('zones');
  const [geocoding, setGeocoding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  const geocodeAddress = async () => {
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: address, format: 'json', limit: 1 },
        headers: { 'Accept-Language': 'en-US' },
      });
      if (res.data.length > 0) {
        const { lat, lon } = res.data[0];
        setCenter([parseFloat(lat), parseFloat(lon)]);
        toast.success(`Location found: ${res.data[0].display_name.split(',').slice(0, 2).join(', ')}`);
      } else {
        toast.error('Address not found. Try adding a city or zip code.');
      }
    } catch {
      toast.error('Geocoding failed. Check your internet connection.');
    } finally {
      setGeocoding(false);
    }
  };

  const fetchSunPath = async () => {
    setLoadingSun(true);
    try {
      const res = await axios.get('/api/sunpath/calculate', {
        params: { lat: center[0], lng: center[1], date: sunDate, houseOrientation },
      });
      setSunData(res.data);
      setShowSunPath(true);
      toast.success('Sun path calculated!');
    } catch {
      toast.error('Failed to calculate sun path. Is the backend running?');
    } finally {
      setLoadingSun(false);
    }
  };

  const handleZoneDrawComplete = useCallback((coords: [number, number][]) => {
    const zone: YardZone = {
      id: crypto.randomUUID(),
      name: newZoneName || `Zone ${zones.length + 1}`,
      type: newZoneType,
      sunExposure: 'unknown',
      coordinates: coords,
      color: ZONE_COLORS[newZoneType],
      plants: [],
      notes: '',
    };
    setZones(z => [...z, zone]);
    setDrawingZone(false);
    toast.success(`Zone "${zone.name}" added!`);
  }, [zones.length, newZoneType, newZoneName]);

  const handleBorderDrawComplete = useCallback((coords: [number, number][]) => {
    setPropertyBorder(coords);
    setDrawingBorder(false);
    setClipMode(true);
    toast.success('Property border set! Clip view enabled — rotate to explore.');
  }, []);

  const deleteZone = (id: string) => {
    setZones(z => z.filter(z2 => z2.id !== id));
    if (selectedZone?.id === id) setSelectedZone(null);
  };

  const addPlantToZone = (zoneId: string, plant: PlacedPlant) => {
    setZones(z => z.map(zone =>
      zone.id === zoneId ? { ...zone, plants: [...zone.plants, plant] } : zone
    ));
    if (selectedZone?.id === zoneId) {
      setSelectedZone(s => s ? { ...s, plants: [...s.plants, plant] } : s);
    }
  };

  const removePlantFromZone = (zoneId: string, plantId: string) => {
    setZones(z => z.map(zone =>
      zone.id === zoneId ? { ...zone, plants: zone.plants.filter(p => p.id !== plantId) } : zone
    ));
    if (selectedZone?.id === zoneId) {
      setSelectedZone(s => s ? { ...s, plants: s.plants.filter(p => p.id !== plantId) } : s);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img: UploadedImage = {
          id: crypto.randomUUID(),
          name: file.name,
          dataUrl: ev.target?.result as string,
          type: 'aerial',
          bounds: [
            [center[0] - 0.002, center[1] - 0.003],
            [center[0] + 0.002, center[1] + 0.003],
          ],
        };
        setUploadedImages(imgs => [...imgs, img]);
        setShowImageLayer(true);
        toast.success(`Image "${file.name}" uploaded!`);
      };
      reader.readAsDataURL(file);
    });
  };

  const exportProject = () => {
    const project = {
      center, address, houseOrientation, zones, propertyBorder,
      uploadedImages: uploadedImages.map(i => ({ ...i, dataUrl: '[base64 omitted]' })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'yard-plan.json'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Project exported!');
  };

  const totalPlants = zones.reduce((sum, z) => sum + z.plants.length, 0);

  const sunClassColor = {
    'full-sun': 'text-yellow-600 bg-yellow-50',
    'part-shade': 'text-orange-600 bg-orange-50',
    'full-shade': 'text-blue-600 bg-blue-50',
  };

  return (
    <div className="h-[calc(100vh-64px)] flex overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
        {/* Address */}
        <div className="p-4 border-b border-gray-100">
          <label className="label">Property Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && geocodeAddress()}
              placeholder="123 Main St, Anytown VA"
              className="input text-sm"
            />
            <button onClick={geocodeAddress} disabled={geocoding || !address.trim()} className="btn-primary px-3 py-2" title="Search location">
              {geocoding ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Property Border Banner */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Property Border
            </span>
            {propertyBorder && (
              <button
                onClick={() => { setPropertyBorder(null); setClipMode(false); }}
                className="text-xs text-red-400 hover:text-red-500"
              >
                Clear
              </button>
            )}
          </div>

          {propertyBorder ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-green-700 font-medium">✓ Border drawn ({propertyBorder.length} points)</span>
                <button
                  onClick={() => setClipMode(v => !v)}
                  className={`flex items-center gap-1 text-xs font-medium transition-colors ${clipMode ? 'text-forest-700' : 'text-gray-400'}`}
                  title="Toggle clip view"
                >
                  {clipMode ? <ToggleRight className="w-5 h-5 text-forest-600" /> : <ToggleLeft className="w-5 h-5" />}
                  Clip View
                </button>
              </div>

              {clipMode && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1"><RotateCw className="w-3 h-3" /> Rotate View</span>
                    <span className="font-mono font-medium">{mapRotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={mapRotation}
                    onChange={e => setMapRotation(parseInt(e.target.value))}
                    className="w-full accent-forest-600"
                  />
                  <div className="flex gap-1">
                    {[0, 90, 180, 270].map(deg => (
                      <button
                        key={deg}
                        onClick={() => setMapRotation(deg)}
                        className={`flex-1 text-xs py-1 rounded border font-medium transition-colors ${mapRotation === deg ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {deg === 0 ? 'N↑' : deg === 90 ? 'E↑' : deg === 180 ? 'S↑' : 'W↑'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : drawingBorder ? (
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                Click to add points. <strong>Double-click</strong> to close border.
              </div>
              <button onClick={() => setDrawingBorder(false)} className="w-full btn-secondary text-xs justify-center text-red-500">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDrawingBorder(true)}
              className="w-full btn-secondary text-xs justify-center"
            >
              <Plus className="w-3.5 h-3.5" /> Draw Property Border
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['zones', 'plants', 'sun', 'images'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors relative ${
                sidebarTab === tab ? 'text-forest-700 border-b-2 border-forest-600 bg-forest-50' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'zones' ? 'Zones' : tab === 'plants' ? 'Plants' : tab === 'sun' ? 'Sun' : 'Images'}
              {tab === 'plants' && totalPlants > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-forest-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {totalPlants > 9 ? '9+' : totalPlants}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── ZONES TAB ── */}
          {sidebarTab === 'zones' && (
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Map Layer</label>
                <div className="flex gap-2">
                  <button onClick={() => setMapLayer('satellite')} className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${mapLayer === 'satellite' ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Satellite</button>
                  <button onClick={() => setMapLayer('street')} className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${mapLayer === 'street' ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Street Map</button>
                </div>
              </div>

              {/* Grid overlay */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label flex items-center gap-1.5 mb-0">
                    <Grid3x3 className="w-3.5 h-3.5" /> Grid Overlay
                  </label>
                  <button
                    onClick={() => setShowGrid(v => !v)}
                    className={`flex items-center gap-1 text-xs font-medium transition-colors ${showGrid ? 'text-forest-700' : 'text-gray-400'}`}
                    title="Toggle grid overlay"
                  >
                    {showGrid ? <ToggleRight className="w-5 h-5 text-forest-600" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
                {showGrid && (
                  <div className="flex gap-1.5">
                    {([1, 3, 5, 10] as const).map(ft => (
                      <button
                        key={ft}
                        onClick={() => setGridSize(ft)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${gridSize === ft ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {ft}ft
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <h3 className="font-medium text-sm text-gray-900">Add Planting Zone</h3>
                <div>
                  <label className="label text-xs">Zone Type</label>
                  <select value={newZoneType} onChange={e => setNewZoneType(e.target.value as typeof ZONE_TYPES[number])} className="select text-sm">
                    {ZONE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Zone Name</label>
                  <input type="text" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="e.g., Front Bed" className="input text-sm" />
                </div>
                {drawingZone ? (
                  <div className="space-y-2">
                    <div className="bg-forest-50 border border-forest-200 rounded-lg p-2 text-xs text-forest-700">
                      Click to add points. <strong>Double-click</strong> to finish.
                    </div>
                    <button onClick={() => setDrawingZone(false)} className="w-full btn-secondary text-sm justify-center text-red-500 hover:text-red-600">
                      <X className="w-4 h-4" /> Cancel Drawing
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDrawingZone(true)} className="w-full btn-primary text-sm justify-center">
                    <Plus className="w-4 h-4" /> Draw Zone on Map
                  </button>
                )}
              </div>

              {zones.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm text-gray-900 mb-2">Your Zones ({zones.length})</h3>
                  <div className="space-y-2">
                    {zones.map(zone => (
                      <div
                        key={zone.id}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-sm transition-colors ${selectedZone?.id === zone.id ? 'border-forest-400 bg-forest-50' : 'border-gray-200 hover:border-forest-300'}`}
                        onClick={() => setSelectedZone(selectedZone?.id === zone.id ? null : zone)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm border border-gray-300" style={{ backgroundColor: zone.color }} />
                          <span className="font-medium text-gray-900 truncate">{zone.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">{zone.plants.length > 0 ? `${zone.plants.length}🌿` : zone.type}</span>
                          <button onClick={e => { e.stopPropagation(); deleteZone(zone.id); }} className="p-1 hover:text-red-500 text-gray-400 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {zones.length > 0 && (
                <button onClick={exportProject} className="w-full btn-secondary text-sm justify-center">
                  <Download className="w-4 h-4" /> Export Plan
                </button>
              )}
            </div>
          )}

          {/* ── PLANTS TAB ── */}
          {sidebarTab === 'plants' && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">
                Add plants to your zones. Track year planted and starting height to visualize growth over time.
              </p>

              {/* View mode toggle */}
              <div>
                <label className="label">Landscape View</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setViewMode(viewMode === 'aerial' ? null : 'aerial')}
                    className={`flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg border font-medium transition-colors ${viewMode === 'aerial' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <Camera className="w-3.5 h-3.5" /> Aerial AI
                  </button>
                  <button
                    onClick={() => setViewMode(viewMode === 'street' ? null : 'street')}
                    className={`flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg border font-medium transition-colors ${viewMode === 'street' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Street AI
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">AI visualizes plants at their estimated current heights</p>
              </div>

              {/* Show plant markers toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={showPlantMarkers} onChange={e => setShowPlantMarkers(e.target.checked)} className="rounded accent-forest-600" />
                <span className="text-gray-700">Show plant markers on map</span>
              </label>

              {/* Zones with plants */}
              {zones.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">
                  Draw zones first, then add plants to them.
                </div>
              ) : (
                zones.map(zone => (
                  <div key={zone.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: zone.color }} />
                        <span className="text-xs font-semibold text-gray-800">{zone.name}</span>
                        <span className="text-xs text-gray-400">{zone.plants.length} plant{zone.plants.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button
                        onClick={() => setAddPlantModal({ zoneId: zone.id, zoneName: zone.name })}
                        className="text-xs text-forest-600 hover:text-forest-800 flex items-center gap-0.5 font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                    {zone.plants.length > 0 && (
                      <div className="divide-y divide-gray-100">
                        {zone.plants.map(plant => {
                          const currentYear = new Date().getFullYear();
                          const age = plant.yearPlanted ? currentYear - plant.yearPlanted : null;
                          const estHeight = age !== null && plant.heightPlanted
                            ? Math.round((plant.heightPlanted + age * 0.75) * 10) / 10
                            : null;
                          return (
                            <div key={plant.id} className="flex items-center justify-between px-3 py-2">
                              <div>
                                <p className="text-xs font-medium text-gray-900">{plant.commonName}</p>
                                <p className="text-xs text-gray-400 italic">{plant.scientificName}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Planted {plant.yearPlanted || '?'} at {plant.heightPlanted || '?'}ft
                                  {estHeight ? ` → ~${estHeight}ft now` : ''}
                                </p>
                              </div>
                              <button
                                onClick={() => removePlantFromZone(zone.id, plant.id)}
                                className="text-gray-300 hover:text-red-400 ml-2"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── SUN PATH TAB ── */}
          {sidebarTab === 'sun' && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">
                Calculate the sun's path over your property to identify full sun, part shade, and shade areas.
              </p>

              <div>
                <label className="label">House Front Faces</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[{ dir: 'N', deg: 0 }, { dir: 'NE', deg: 45 }, { dir: 'E', deg: 90 }, { dir: 'SE', deg: 135 },
                    { dir: 'S', deg: 180 }, { dir: 'SW', deg: 225 }, { dir: 'W', deg: 270 }, { dir: 'NW', deg: 315 }].map(({ dir, deg }) => (
                    <button
                      key={dir}
                      onClick={() => setHouseOrientation(deg)}
                      className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${houseOrientation === deg ? 'bg-yellow-500 text-white border-yellow-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Calculate For Date</label>
                <input type="date" value={sunDate} onChange={e => setSunDate(e.target.value)} className="input text-sm" />
              </div>

              <button onClick={fetchSunPath} disabled={loadingSun} className="w-full btn-primary justify-center">
                {loadingSun
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Calculating...</>
                  : <><Sun className="w-4 h-4" /> Calculate Sun Path</>}
              </button>

              {sunData && (
                <div className="space-y-3 animate-fade-in">
                  {/* Sun path toggle */}
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs font-medium text-gray-700">Show Sun Path on Map</span>
                    <button
                      onClick={() => setShowSunPath(v => !v)}
                      className={`flex items-center gap-1 text-xs font-medium transition-colors ${showSunPath ? 'text-yellow-600' : 'text-gray-400'}`}
                    >
                      {showSunPath ? <ToggleRight className="w-6 h-6 text-yellow-500" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>

                  <div className={`p-3 rounded-xl text-sm font-medium ${sunClassColor[sunData.sunExposure.classification]}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Sun className="w-4 h-4" />
                      <span className="capitalize">{sunData.sunExposure.classification.replace('-', ' ')}</span>
                    </div>
                    <p className="text-xs opacity-80">~{sunData.sunExposure.hoursOfSun} hours of direct sun today</p>
                  </div>

                  {sunData.sunTimes.sunrise && sunData.sunTimes.sunset && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-amber-50 rounded-lg p-2">
                        <div className="text-amber-600 font-medium">Sunrise</div>
                        <div className="text-amber-900">{new Date(sunData.sunTimes.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <div className="text-orange-600 font-medium">Sunset</div>
                        <div className="text-orange-900">{new Date(sunData.sunTimes.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 space-y-1">
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-amber-500 rounded" /><span>Summer solstice path</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-lime-500 rounded" /><span>Equinox path</span></div>
                    <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-blue-400 rounded" /><span>Winter solstice path</span></div>
                  </div>

                  <button onClick={() => { setSunData(null); setShowSunPath(false); }} className="w-full btn-secondary text-sm justify-center">
                    <X className="w-4 h-4" /> Clear Sun Path
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── IMAGES TAB ── */}
          {sidebarTab === 'images' && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">Upload aerial photos or yard photos to overlay on the map.</p>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-forest-400 cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Upload Images</p>
                <p className="text-xs text-gray-500 mt-1">Aerial, front, back, or side yard photos</p>
                <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
              </div>

              {uploadedImages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900">Uploaded Images</h3>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={showImageLayer} onChange={e => setShowImageLayer(e.target.checked)} className="rounded" />
                      Show on map
                    </label>
                  </div>
                  <div className="space-y-2">
                    {uploadedImages.map(img => (
                      <div key={img.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-sm">
                        <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate text-xs text-gray-700 flex-1">{img.name}</span>
                        <button onClick={() => setUploadedImages(imgs => imgs.filter(i => i.id !== img.id))} className="text-gray-400 hover:text-red-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="p-3 border-t border-gray-100 bg-forest-50">
          <p className="text-xs text-forest-700 font-medium mb-1 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> Tips
          </p>
          <ul className="text-xs text-forest-600 space-y-0.5">
            <li>• Draw property border → enables clip view + rotation</li>
            <li>• Add plants to zones → view AI street/aerial simulation</li>
            <li>• Double-click to finish drawing any polygon</li>
          </ul>
        </div>
      </div>

      {/* ── Map Area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Rotatable map wrapper */}
        <div
          ref={mapWrapperRef}
          className="w-full h-full"
          style={{
            transform: clipMode ? `rotate(${mapRotation}deg)` : 'none',
            transformOrigin: 'center',
            transition: 'transform 0.25s ease',
          }}
        >
          <MapContainer center={center} zoom={17} className="w-full h-full" zoomControl>
            <MapCenterControl center={center} />

            {mapLayer === 'satellite' ? (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
                maxZoom={19}
              />
            ) : (
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={19}
              />
            )}

            {/* Image overlays */}
            {showImageLayer && uploadedImages.map(img => img.bounds && (
              <ImageOverlay key={img.id} url={img.dataUrl} bounds={img.bounds as [[number, number], [number, number]]} opacity={0.7} />
            ))}

            {/* Property border polygon */}
            {propertyBorder && propertyBorder.length >= 3 && (
              <Polygon
                positions={propertyBorder as [number, number][]}
                pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.05, weight: 2.5, dashArray: '8,4' }}
              />
            )}

            {/* Zone polygons */}
            {zones.map(zone => (
              <Polygon
                key={zone.id}
                positions={zone.coordinates as [number, number][]}
                pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.3, weight: 2 }}
                eventHandlers={{ click: () => setSelectedZone(selectedZone?.id === zone.id ? null : zone) }}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{zone.name}</p>
                    <p className="text-gray-500 capitalize">{zone.type} · {zone.plants.length} plant{zone.plants.length !== 1 ? 's' : ''}</p>
                  </div>
                </Popup>
              </Polygon>
            ))}

            {/* Drawing layers */}
            <DrawingLayer active={drawingZone} zoneColor={ZONE_COLORS[newZoneType]} onComplete={handleZoneDrawComplete} />
            <DrawingLayer active={drawingBorder} zoneColor="#f59e0b" onComplete={handleBorderDrawComplete} />

            {/* Grid overlay */}
            <GridOverlayLayer visible={showGrid} gridSizeFt={gridSize} />

            {/* Sun path */}
            <SunPathLayer sunData={sunData} visible={showSunPath} />

            {/* Plant markers (aerial view) */}
            <PlantMarkersLayer zones={zones} visible={showPlantMarkers && sidebarTab === 'plants'} />

            {/* Property clip overlay */}
            {clipMode && propertyBorder && propertyBorder.length >= 3 && (
              <PropertyClipOverlay polygon={propertyBorder} active={true} />
            )}
          </MapContainer>
        </div>

        {/* ── Map overlays (outside rotated div) ── */}

        {/* Compass (always visible when clip mode or border exists) */}
        {(clipMode || propertyBorder) && (
          <div className="absolute top-4 right-4 z-[1001]">
            <CompassRose mapRotation={clipMode ? mapRotation : 0} />
          </div>
        )}

        {/* Drawing in-progress indicator */}
        {(drawingZone || drawingBorder) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] bg-forest-700 text-white px-4 py-2 rounded-xl text-sm shadow-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-forest-300 rounded-full animate-pulse" />
            {drawingBorder ? 'Click to add border points — Double-click to finish' : 'Click to add zone points — Double-click to finish'}
          </div>
        )}

        {/* Zone info panel */}
        {selectedZone && (
          <div className={`absolute bottom-4 z-[1001] bg-white rounded-xl shadow-lg p-4 w-72 animate-fade-in ${viewMode ? 'left-4' : 'left-4'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{selectedZone.name}</h3>
              <button onClick={() => setSelectedZone(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Type</span>
                <span className="capitalize font-medium">{selectedZone.type}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Plants</span>
                <span className="font-medium">{selectedZone.plants.length}</span>
              </div>
              <div className="pt-1">
                <select
                  value={selectedZone.sunExposure}
                  onChange={e => {
                    const val = e.target.value as YardZone['sunExposure'];
                    setZones(z => z.map(z2 => z2.id === selectedZone.id ? { ...z2, sunExposure: val } : z2));
                    setSelectedZone(s => s ? { ...s, sunExposure: val } : s);
                  }}
                  className="select text-xs"
                >
                  <option value="unknown">Sun: Unknown</option>
                  <option value="full-sun">Full Sun (6+ hrs)</option>
                  <option value="part-shade">Part Shade (3–6 hrs)</option>
                  <option value="full-shade">Full Shade (&lt;3 hrs)</option>
                </select>
              </div>

              {/* Plants in zone */}
              {selectedZone.plants.length > 0 && (
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-700 mb-1">Plants in zone:</p>
                  <div className="space-y-1">
                    {selectedZone.plants.slice(0, 3).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">{p.commonName}</span>
                        <span className="text-gray-400">{p.yearPlanted ? `planted ${p.yearPlanted}` : ''}</span>
                      </div>
                    ))}
                    {selectedZone.plants.length > 3 && (
                      <p className="text-xs text-gray-400">+{selectedZone.plants.length - 3} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setAddPlantModal({ zoneId: selectedZone.id, zoneName: selectedZone.name })}
                className="flex-1 text-xs text-forest-600 hover:text-forest-800 flex items-center justify-center gap-1 py-1.5 border border-forest-200 hover:border-forest-300 rounded-lg transition-colors font-medium"
              >
                <Plus className="w-3 h-3" /> Add Plant
              </button>
              <button
                onClick={() => deleteZone(selectedZone.id)}
                className="flex-1 text-xs text-red-500 hover:text-red-600 flex items-center justify-center gap-1 py-1.5 border border-red-100 hover:border-red-200 rounded-lg transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete Zone
              </button>
            </div>
          </div>
        )}

        {/* AI Street/Aerial View Panel */}
        {viewMode && (
          <StreetViewPanel
            zones={zones}
            address={address}
            viewType={viewMode}
            onClose={() => setViewMode(null)}
          />
        )}
      </div>

      {/* Add Plant Modal */}
      {addPlantModal && (
        <AddPlantModal
          zoneId={addPlantModal.zoneId}
          zoneName={addPlantModal.zoneName}
          onClose={() => setAddPlantModal(null)}
          onAdd={addPlantToZone}
          defaultPosition={center}
        />
      )}
    </div>
  );
}
