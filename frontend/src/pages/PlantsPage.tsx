import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, X, TreePine, RefreshCw, ExternalLink } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plant, PlantSearchFilters } from '../types';
import PlantCard from '../components/PlantCard';
import PlantDetailModal from '../components/PlantDetailModal';

const plantTypes = [
  { value: '', label: 'All Types' },
  { value: 'tree', label: 'Trees' },
  { value: 'shrub', label: 'Shrubs' },
  { value: 'perennial', label: 'Perennials' },
  { value: 'grass', label: 'Grasses' },
  { value: 'fern', label: 'Ferns' },
  { value: 'vine', label: 'Vines' },
  { value: 'groundcover', label: 'Groundcovers' },
];

const sunOptions = [
  { value: '', label: 'Any Light' },
  { value: 'full-sun', label: 'Full Sun (6+ hrs)' },
  { value: 'part-shade', label: 'Part Shade (3–6 hrs)' },
  { value: 'full-shade', label: 'Full Shade (<3 hrs)' },
];

const waterOptions = [
  { value: '', label: 'Any Water' },
  { value: 'dry', label: 'Drought Tolerant' },
  { value: 'medium', label: 'Medium Water' },
  { value: 'wet', label: 'Wet / Moist' },
  { value: 'adaptable', label: 'Adaptable' },
];

const nativeRegions = [
  { value: '', label: 'Any Region' },
  { value: 'Virginia', label: 'Virginia' },
  { value: 'Mid-Atlantic', label: 'Mid-Atlantic' },
  { value: 'Northeast', label: 'Northeast' },
  { value: 'Southeast', label: 'Southeast' },
  { value: 'Midwest', label: 'Midwest' },
  { value: 'Eastern North America', label: 'Eastern North America' },
];

export default function PlantsPage() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<PlantSearchFilters>({
    q: '',
    type: '',
    sun: '',
    water: '',
    native: '',
  });
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const fetchPlants = useCallback(async (f: PlantSearchFilters, p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: LIMIT };
      if (f.q) params.q = f.q;
      if (f.type) params.type = f.type;
      if (f.sun) params.sun = f.sun;
      if (f.water) params.water = f.water;
      if (f.native) params.native = f.native;

      const res = await axios.get('/api/plants/search', { params });
      setPlants(res.data.results);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load plants. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlants(filters, page);
  }, [filters, page, fetchPlants]);

  const handleSearchChange = (q: string) => {
    setFilters(f => ({ ...f, q }));
    setPage(1);
  };

  const handleFilterChange = (key: keyof PlantSearchFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ q: '', type: '', sun: '', water: '', native: '' });
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  const handleVisualizeClick = (plant: Plant) => {
    navigate('/visualize', { state: { plant } });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <TreePine className="w-8 h-8 text-forest-600" />
          Native Plant Library
        </h1>
        <p className="text-gray-500">
          Browse native plants from curated sources including{' '}
          <a
            href="https://novanatives.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-forest-600 hover:underline inline-flex items-center gap-1"
          >
            Nova Natives <ExternalLink className="w-3 h-3" />
          </a>
          {' '}and the{' '}
          <a
            href="https://plants.usda.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-forest-600 hover:underline inline-flex items-center gap-1"
          >
            USDA Plants Database <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>

      {/* Search & Filter bar */}
      <div className="card p-4 mb-6">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, family, feature..."
              value={filters.q || ''}
              onChange={e => handleSearchChange(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary gap-2 ${showFilters ? 'bg-forest-50 border-forest-300 text-forest-700' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-forest-500 rounded-full" />
            )}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn-secondary text-red-500 hover:text-red-600 hover:border-red-300">
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 animate-fade-in">
            <div>
              <label className="label">Plant Type</label>
              <select
                value={filters.type || ''}
                onChange={e => handleFilterChange('type', e.target.value)}
                className="select"
              >
                {plantTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sun Requirements</label>
              <select
                value={filters.sun || ''}
                onChange={e => handleFilterChange('sun', e.target.value)}
                className="select"
              >
                {sunOptions.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Water Needs</label>
              <select
                value={filters.water || ''}
                onChange={e => handleFilterChange('water', e.target.value)}
                className="select"
              >
                {waterOptions.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Native Region</label>
              <select
                value={filters.native || ''}
                onChange={e => handleFilterChange('native', e.target.value)}
                className="select"
              >
                {nativeRegions.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {loading ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
            </span>
          ) : (
            `${total} plant${total !== 1 ? 's' : ''} found`
          )}
        </p>
        {total > LIMIT && (
          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-secondary py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-gray-500">Page {page} of {Math.ceil(total / LIMIT)}</span>
            <button
              disabled={page >= Math.ceil(total / LIMIT)}
              onClick={() => setPage(p => p + 1)}
              className="btn-secondary py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Plant grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2 w-3/4" />
              <div className="h-3 bg-gray-200 rounded mb-3 w-1/2" />
              <div className="h-16 bg-gray-100 rounded mb-3" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : plants.length === 0 ? (
        <div className="card p-12 text-center">
          <TreePine className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 mb-2">No plants found</h3>
          <p className="text-gray-500 text-sm mb-4">Try adjusting your search or filters</p>
          <button onClick={clearFilters} className="btn-outline mx-auto">
            <X className="w-4 h-4" />
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plants.map(plant => (
            <PlantCard
              key={plant.id}
              plant={plant}
              onClick={setSelectedPlant}
            />
          ))}
        </div>
      )}

      {/* Plant detail modal */}
      <PlantDetailModal
        plant={selectedPlant}
        onClose={() => setSelectedPlant(null)}
        onSelectForVisualizer={handleVisualizeClick}
      />
    </div>
  );
}
