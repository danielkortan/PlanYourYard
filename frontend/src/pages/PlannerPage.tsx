import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, Marker, Popup, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Map, Sun, Upload, Trash2, Plus, Layers, Compass,
  Search, Info, X, ChevronDown, ChevronUp, Download,
  ImageIcon, TreePine, Calendar
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

const ZONE_TYPES = ['lawn', 'bed', 'patio', 'structure', 'water'] as const;

function SunPathLayer({ sunData }: { sunData: SunPathData | null }) {
  const map = useMap();

  useEffect(() => {
    if (!sunData) return;
    const { lat, lng } = sunData.location;
    const center = L.latLng(lat, lng);
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

    // Add N/S/E/W labels
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
  }, [sunData, map]);

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
  zoneType,
  zoneColor,
  onComplete,
}: {
  active: boolean;
  zoneType: string;
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
      if (pointsRef.current.length >= 3) {
        onComplete([...pointsRef.current]);
      }
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
  }, [active, map, zoneType, zoneColor, onComplete]);

  return null;
}

export default function PlannerPage() {
  const [center, setCenter] = useState<[number, number]>([38.8977, -77.0365]);
  const [address, setAddress] = useState('');
  const [houseOrientation, setHouseOrientation] = useState(0);
  const [sunData, setSunData] = useState<SunPathData | null>(null);
  const [sunDate, setSunDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadingSun, setLoadingSun] = useState(false);
  const [showSunPath, setShowSunPath] = useState(false);
  const [mapLayer, setMapLayer] = useState<'satellite' | 'street'>('satellite');

  const [zones, setZones] = useState<YardZone[]>([]);
  const [drawingZone, setDrawingZone] = useState(false);
  const [newZoneType, setNewZoneType] = useState<typeof ZONE_TYPES[number]>('bed');
  const [newZoneName, setNewZoneName] = useState('New Bed');
  const [selectedZone, setSelectedZone] = useState<YardZone | null>(null);

  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [showImageLayer, setShowImageLayer] = useState(false);

  const [sidebarTab, setSidebarTab] = useState<'zones' | 'sun' | 'images'>('zones');
  const [geocoding, setGeocoding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        params: {
          lat: center[0],
          lng: center[1],
          date: sunDate,
          houseOrientation,
        },
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
    toast.success(`Zone "${zone.name}" added! Double-click to finish drawing.`);
  }, [zones.length, newZoneType, newZoneName]);

  const deleteZone = (id: string) => {
    setZones(z => z.filter(z2 => z2.id !== id));
    if (selectedZone?.id === id) setSelectedZone(null);
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
        toast.success(`Image "${file.name}" uploaded. It's overlaid on your map!`);
      };
      reader.readAsDataURL(file);
    });
  };

  const exportProject = () => {
    const project = {
      center,
      address,
      houseOrientation,
      zones,
      uploadedImages: uploadedImages.map(i => ({ ...i, dataUrl: '[base64 omitted]' })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yard-plan.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Project exported!');
  };

  const sunClassColor = {
    'full-sun': 'text-yellow-600 bg-yellow-50',
    'part-shade': 'text-orange-600 bg-orange-50',
    'full-shade': 'text-blue-600 bg-blue-50',
  };

  return (
    <div className="h-[calc(100vh-64px)] flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
        {/* Address Bar */}
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
            <button
              onClick={geocodeAddress}
              disabled={geocoding || !address.trim()}
              className="btn-primary px-3 py-2"
              title="Search location"
            >
              {geocoding ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['zones', 'sun', 'images'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                sidebarTab === tab
                  ? 'text-forest-700 border-b-2 border-forest-600 bg-forest-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'zones' ? 'Zones' : tab === 'sun' ? 'Sun Path' : 'Images'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {/* ZONES TAB */}
          {sidebarTab === 'zones' && (
            <div className="p-4 space-y-4">
              {/* Layer toggle */}
              <div>
                <label className="label">Map Layer</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMapLayer('satellite')}
                    className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                      mapLayer === 'satellite' ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Satellite
                  </button>
                  <button
                    onClick={() => setMapLayer('street')}
                    className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                      mapLayer === 'street' ? 'bg-forest-600 text-white border-forest-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Street Map
                  </button>
                </div>
              </div>

              {/* Draw zone */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <h3 className="font-medium text-sm text-gray-900">Add Planting Zone</h3>
                <div>
                  <label className="label text-xs">Zone Type</label>
                  <select
                    value={newZoneType}
                    onChange={e => setNewZoneType(e.target.value as typeof ZONE_TYPES[number])}
                    className="select text-sm"
                  >
                    {ZONE_TYPES.map(t => (
                      <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Zone Name</label>
                  <input
                    type="text"
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                    placeholder="e.g., Front Bed"
                    className="input text-sm"
                  />
                </div>
                {drawingZone ? (
                  <div className="space-y-2">
                    <div className="bg-forest-50 border border-forest-200 rounded-lg p-2 text-xs text-forest-700">
                      Click to add points. <strong>Double-click</strong> to finish.
                    </div>
                    <button
                      onClick={() => setDrawingZone(false)}
                      className="w-full btn-secondary text-sm justify-center text-red-500 hover:text-red-600"
                    >
                      <X className="w-4 h-4" /> Cancel Drawing
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDrawingZone(true)}
                    className="w-full btn-primary text-sm justify-center"
                  >
                    <Plus className="w-4 h-4" /> Draw Zone on Map
                  </button>
                )}
              </div>

              {/* Zone list */}
              {zones.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm text-gray-900 mb-2">Your Zones ({zones.length})</h3>
                  <div className="space-y-2">
                    {zones.map(zone => (
                      <div
                        key={zone.id}
                        className="flex items-center justify-between p-2 rounded-lg border border-gray-200 hover:border-forest-300 cursor-pointer text-sm"
                        onClick={() => setSelectedZone(selectedZone?.id === zone.id ? null : zone)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-sm border border-gray-300"
                            style={{ backgroundColor: zone.color }}
                          />
                          <span className="font-medium text-gray-900 truncate">{zone.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 capitalize">{zone.type}</span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteZone(zone.id); }}
                            className="p-1 hover:text-red-500 text-gray-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Export */}
              {zones.length > 0 && (
                <button onClick={exportProject} className="w-full btn-secondary text-sm justify-center">
                  <Download className="w-4 h-4" />
                  Export Plan
                </button>
              )}
            </div>
          )}

          {/* SUN PATH TAB */}
          {sidebarTab === 'sun' && (
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  Calculate the sun's path over your property to identify full sun, part shade, and shade areas.
                </p>
              </div>

              <div>
                <label className="label">House Front Faces</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { dir: 'N', deg: 0 },
                    { dir: 'NE', deg: 45 },
                    { dir: 'E', deg: 90 },
                    { dir: 'SE', deg: 135 },
                    { dir: 'S', deg: 180 },
                    { dir: 'SW', deg: 225 },
                    { dir: 'W', deg: 270 },
                    { dir: 'NW', deg: 315 },
                  ].map(({ dir, deg }) => (
                    <button
                      key={dir}
                      onClick={() => setHouseOrientation(deg)}
                      className={`py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                        houseOrientation === deg
                          ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Calculate For Date</label>
                <input
                  type="date"
                  value={sunDate}
                  onChange={e => setSunDate(e.target.value)}
                  className="input text-sm"
                />
              </div>

              <button
                onClick={fetchSunPath}
                disabled={loadingSun}
                className="w-full btn-primary justify-center"
              >
                {loadingSun ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Calculating...</>
                ) : (
                  <><Sun className="w-4 h-4" /> Calculate Sun Path</>
                )}
              </button>

              {sunData && (
                <div className="space-y-3 animate-fade-in">
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
                        <div className="text-amber-900">
                          {new Date(sunData.sunTimes.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <div className="text-orange-600 font-medium">Sunset</div>
                        <div className="text-orange-900">
                          {new Date(sunData.sunTimes.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-0.5 bg-amber-500 rounded" />
                      <span>Summer solstice path</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-0.5 bg-lime-500 rounded" />
                      <span>Equinox path</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-0.5 bg-blue-400 rounded" />
                      <span>Winter solstice path</span>
                    </div>
                  </div>

                  <button
                    onClick={() => { setSunData(null); setShowSunPath(false); }}
                    className="w-full btn-secondary text-sm justify-center"
                  >
                    <X className="w-4 h-4" /> Clear Sun Path
                  </button>
                </div>
              )}
            </div>
          )}

          {/* IMAGES TAB */}
          {sidebarTab === 'images' && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">
                Upload aerial photos, Google Maps screenshots, or yard photos to use as a map overlay.
              </p>

              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-forest-400 cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Upload Images</p>
                <p className="text-xs text-gray-500 mt-1">Aerial, front, back, or side yard photos</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-700">
                <p className="font-medium mb-1">Tip: Get Google Maps Aerial</p>
                <ol className="list-decimal list-inside space-y-0.5 text-sky-600">
                  <li>Go to Google Maps</li>
                  <li>Switch to Satellite view</li>
                  <li>Navigate to your property</li>
                  <li>Take a screenshot</li>
                  <li>Upload the image here</li>
                </ol>
              </div>

              {uploadedImages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900">Uploaded Images</h3>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showImageLayer}
                        onChange={e => setShowImageLayer(e.target.checked)}
                        className="rounded"
                      />
                      Show on map
                    </label>
                  </div>
                  <div className="space-y-2">
                    {uploadedImages.map(img => (
                      <div key={img.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-sm">
                        <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate text-xs text-gray-700 flex-1">{img.name}</span>
                        <button
                          onClick={() => setUploadedImages(imgs => imgs.filter(i => i.id !== img.id))}
                          className="text-gray-400 hover:text-red-500"
                        >
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
            <Info className="w-3.5 h-3.5" /> Map Tips
          </p>
          <ul className="text-xs text-forest-600 space-y-0.5">
            <li>• Use Satellite layer for best aerial view</li>
            <li>• Draw zones by clicking on map</li>
            <li>• Double-click to finish drawing a zone</li>
          </ul>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={17}
          className="w-full h-full"
          zoomControl={true}
        >
          <MapCenterControl center={center} />

          {/* Tile layers */}
          {mapLayer === 'satellite' ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
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
            <ImageOverlay
              key={img.id}
              url={img.dataUrl}
              bounds={img.bounds as [[number, number], [number, number]]}
              opacity={0.7}
            />
          ))}

          {/* Zone polygons */}
          {zones.map(zone => (
            <Polygon
              key={zone.id}
              positions={zone.coordinates as [number, number][]}
              pathOptions={{
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: 0.3,
                weight: 2,
              }}
              eventHandlers={{
                click: () => setSelectedZone(selectedZone?.id === zone.id ? null : zone),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{zone.name}</p>
                  <p className="text-gray-500 capitalize">{zone.type}</p>
                  <p className="text-gray-500">Sun: {zone.sunExposure}</p>
                </div>
              </Popup>
            </Polygon>
          ))}

          {/* Drawing layer */}
          <DrawingLayer
            active={drawingZone}
            zoneType={newZoneType}
            zoneColor={ZONE_COLORS[newZoneType]}
            onComplete={handleZoneDrawComplete}
          />

          {/* Sun path layer */}
          {showSunPath && sunData && <SunPathLayer sunData={sunData} />}
        </MapContainer>

        {/* Map overlay info */}
        {drawingZone && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-forest-700 text-white px-4 py-2 rounded-xl text-sm shadow-lg z-[1000] flex items-center gap-2">
            <div className="w-2 h-2 bg-forest-300 rounded-full animate-pulse" />
            Click to add points — Double-click to finish zone
          </div>
        )}

        {/* Zone info popup */}
        {selectedZone && (
          <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-4 w-64 z-[1000] animate-fade-in">
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
                <span>Sun Exposure</span>
                <span className="capitalize font-medium">{selectedZone.sunExposure}</span>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <select
                  value={selectedZone.sunExposure}
                  onChange={e => {
                    const val = e.target.value as YardZone['sunExposure'];
                    setZones(z => z.map(z2 => z2.id === selectedZone.id ? { ...z2, sunExposure: val } : z2));
                    setSelectedZone(s => s ? { ...s, sunExposure: val } : s);
                  }}
                  className="select text-xs"
                >
                  <option value="unknown">Unknown</option>
                  <option value="full-sun">Full Sun (6+ hrs)</option>
                  <option value="part-shade">Part Shade (3–6 hrs)</option>
                  <option value="full-shade">Full Shade (&lt;3 hrs)</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => deleteZone(selectedZone.id)}
              className="w-full mt-3 text-xs text-red-500 hover:text-red-600 flex items-center justify-center gap-1 py-1.5 border border-red-100 hover:border-red-200 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Zone
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
