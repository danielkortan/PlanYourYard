import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Trash2, Plus, X, Search, MapPin, Leaf } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PlantMarker {
  id: number;
  image_id: number;
  plant_id: string;
  plant_name: string;
  x_percent: number;
  y_percent: number;
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
  created_at: string;
  images: ProjectImage[];
}

interface PlantOption {
  id: string;
  commonName: string;
  scientificName: string;
  type: string;
}

const MARKER_COLORS = [
  '#16a34a', '#2563eb', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#65a30d', '#ea580c', '#4f46e5',
];

function markerColor(index: number) {
  return MARKER_COLORS[index % MARKER_COLORS.length];
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageId, setActiveImageId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Plant marker placement state
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null);
  const [plantSearch, setPlantSearch] = useState('');
  const [plantOptions, setPlantOptions] = useState<PlantOption[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<PlantOption | null>(null);
  const [markerNotes, setMarkerNotes] = useState('');
  const [placingMarker, setPlacingMarker] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    axios.get(`/api/projects/${id}`)
      .then(res => {
        setProject(res.data);
        if (res.data.images.length > 0) setActiveImageId(res.data.images[0].id);
      })
      .catch(() => toast.error('Project not found'))
      .finally(() => setLoading(false));
  }, [id]);

  // Search plants
  useEffect(() => {
    if (!plantSearch.trim()) { setPlantOptions([]); return; }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      axios.get('/api/plants/search', { params: { q: plantSearch, limit: 8 } })
        .then(res => setPlantOptions(res.data.plants || []))
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [plantSearch]);

  const activeImage = project?.images.find(img => img.id === activeImageId) ?? null;

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('image', file);
        const res = await axios.post(`/api/projects/${id}/images`, formData);
        const newImage: ProjectImage = { ...res.data, markers: [] };
        setProject(prev => prev ? { ...prev, images: [...prev.images, newImage] } : prev);
        setActiveImageId(newImage.id);
      }
      toast.success('Image uploaded!');
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    if (!confirm('Delete this image and all its plant markers?')) return;
    try {
      await axios.delete(`/api/projects/${id}/images/${imageId}`);
      setProject(prev => {
        if (!prev) return prev;
        const updated = prev.images.filter(img => img.id !== imageId);
        return { ...prev, images: updated };
      });
      if (activeImageId === imageId) {
        const remaining = project!.images.filter(img => img.id !== imageId);
        setActiveImageId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
      toast.success('Image deleted');
    } catch {
      toast.error('Failed to delete image');
    }
  };

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingClick({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    setSelectedPlant(null);
    setPlantSearch('');
    setMarkerNotes('');
    setPlantOptions([]);
  }, []);

  const handlePlaceMarker = async () => {
    if (!pendingClick || !selectedPlant || !activeImageId) return;
    setPlacingMarker(true);
    try {
      const res = await axios.post(`/api/projects/${id}/images/${activeImageId}/markers`, {
        plant_id: selectedPlant.id,
        plant_name: selectedPlant.commonName,
        x_percent: pendingClick.x,
        y_percent: pendingClick.y,
        notes: markerNotes,
      });
      setProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.map(img =>
            img.id === activeImageId
              ? { ...img, markers: [...img.markers, res.data] }
              : img
          ),
        };
      });
      setPendingClick(null);
      setSelectedPlant(null);
      setPlantSearch('');
      toast.success(`${selectedPlant.commonName} placed!`);
    } catch {
      toast.error('Failed to place marker');
    } finally {
      setPlacingMarker(false);
    }
  };

  const handleDeleteMarker = async (imageId: number, markerId: number) => {
    try {
      await axios.delete(`/api/projects/${id}/images/${imageId}/markers/${markerId}`);
      setProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          images: prev.images.map(img =>
            img.id === imageId
              ? { ...img, markers: img.markers.filter(m => m.id !== markerId) }
              : img
          ),
        };
      });
    } catch {
      toast.error('Failed to remove marker');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>;
  if (!project) return <div className="flex items-center justify-center py-20 text-gray-500">Project not found.</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Back + title */}
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

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: image viewer */}
        <div className="flex-1 min-w-0">
          {/* Upload button */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading…' : 'Upload Image'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleUpload(e.target.files)}
            />
            {activeImage && (
              <span className="text-xs text-gray-400">
                Click on the image below to place a plant marker
              </span>
            )}
          </div>

          {/* Image thumbnails */}
          {project.images.length > 0 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {project.images.map(img => (
                <div key={img.id} className="relative shrink-0 group">
                  <button
                    onClick={() => setActiveImageId(img.id)}
                    className={`w-20 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      img.id === activeImageId ? 'border-forest-500' : 'border-gray-200 hover:border-forest-300'
                    }`}
                  >
                    <img src={`/uploads/${img.filename}`} alt={img.original_name} className="w-full h-full object-cover" />
                  </button>
                  <div className="absolute -top-1.5 -right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-forest-600 text-white text-xs rounded-full px-1.5 py-0.5">
                      {img.markers.length}
                    </span>
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main image with markers */}
          {activeImage ? (
            <div
              ref={imageContainerRef}
              onClick={handleImageClick}
              className="relative rounded-xl overflow-hidden border border-gray-200 cursor-crosshair bg-gray-50"
              style={{ maxHeight: '600px' }}
            >
              <img
                src={`/uploads/${activeImage.filename}`}
                alt={activeImage.original_name}
                className="w-full h-auto block pointer-events-none select-none"
                style={{ maxHeight: '600px', objectFit: 'contain' }}
                draggable={false}
              />

              {/* Existing markers */}
              {activeImage.markers.map((marker, idx) => (
                <div
                  key={marker.id}
                  style={{ left: `${marker.x_percent}%`, top: `${marker.y_percent}%`, position: 'absolute' }}
                  className="transform -translate-x-1/2 -translate-y-full group z-10"
                  onClick={e => e.stopPropagation()}
                >
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: markerColor(idx) }}
                    title={`${marker.plant_name}${marker.notes ? ` — ${marker.notes}` : ''}`}
                  >
                    <Leaf className="w-3 h-3 text-white" />
                  </div>
                  {/* Marker tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-20">
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                      <div className="font-medium">{marker.plant_name}</div>
                      {marker.notes && <div className="text-gray-400 text-xs">{marker.notes}</div>}
                      <button
                        onClick={() => handleDeleteMarker(activeImage.id, marker.id)}
                        className="mt-1 text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                    <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                  </div>
                </div>
              ))}

              {/* Pending click position indicator */}
              {pendingClick && (
                <div
                  style={{ left: `${pendingClick.x}%`, top: `${pendingClick.y}%`, position: 'absolute' }}
                  className="transform -translate-x-1/2 -translate-y-1/2 z-20"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="w-5 h-5 rounded-full bg-yellow-400 border-2 border-white shadow-lg animate-pulse" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <Upload className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Upload your first image</p>
              <p className="text-gray-400 text-sm mt-1">Add yard photos to start mapping plants</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 bg-forest-600 hover:bg-forest-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Upload Image
              </button>
            </div>
          )}
        </div>

        {/* Right: Plant picker + markers list */}
        <div className="lg:w-72 xl:w-80 shrink-0">
          {/* Plant marker placer */}
          {pendingClick && (
            <div className="bg-white border border-forest-300 rounded-xl p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-forest-600" /> Place Plant Marker
                </h3>
                <button onClick={() => setPendingClick(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Plant search */}
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={plantSearch}
                  onChange={e => { setPlantSearch(e.target.value); setSelectedPlant(null); }}
                  placeholder="Search plants…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  autoFocus
                />
              </div>

              {/* Search results */}
              {plantOptions.length > 0 && !selectedPlant && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-3 max-h-48 overflow-y-auto">
                  {plantOptions.map(plant => (
                    <button
                      key={plant.id}
                      onClick={() => { setSelectedPlant(plant); setPlantSearch(plant.commonName); setPlantOptions([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-forest-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="text-sm font-medium text-gray-800">{plant.commonName}</div>
                      <div className="text-xs text-gray-400 italic">{plant.scientificName}</div>
                    </button>
                  ))}
                </div>
              )}
              {searchLoading && <div className="text-xs text-gray-400 mb-3">Searching…</div>}

              {selectedPlant && (
                <div className="bg-forest-50 rounded-lg px-3 py-2 mb-3 text-sm">
                  <div className="font-medium text-forest-800">{selectedPlant.commonName}</div>
                  <div className="text-forest-600 text-xs italic">{selectedPlant.scientificName}</div>
                </div>
              )}

              <textarea
                value={markerNotes}
                onChange={e => setMarkerNotes(e.target.value)}
                placeholder="Notes (optional)…"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none mb-3"
              />

              <button
                onClick={handlePlaceMarker}
                disabled={!selectedPlant || placingMarker}
                className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {placingMarker ? 'Placing…' : 'Place Marker'}
              </button>
            </div>
          )}

          {/* Markers list for active image */}
          {activeImage && activeImage.markers.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                <Leaf className="w-4 h-4 text-forest-600" />
                Plants on this image ({activeImage.markers.length})
              </h3>
              <div className="space-y-2">
                {activeImage.markers.map((marker, idx) => (
                  <div key={marker.id} className="flex items-start gap-2.5">
                    <div
                      className="w-4 h-4 rounded-full mt-0.5 shrink-0 border border-white shadow-sm"
                      style={{ backgroundColor: markerColor(idx) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{marker.plant_name}</div>
                      {marker.notes && <div className="text-xs text-gray-400 truncate">{marker.notes}</div>}
                    </div>
                    <button
                      onClick={() => handleDeleteMarker(activeImage.id, marker.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image comparison info */}
          {project.images.length > 1 && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
              <strong>Comparing layouts:</strong> You have {project.images.length} images for this project.
              Click a thumbnail above to switch between mockups.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
