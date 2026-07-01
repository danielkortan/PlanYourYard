import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Upload, Eye, TreePine, X, RefreshCw,
  Sparkles, Info, Search, ArrowRight,
  Leaf, Camera, Plus, Folder, MapPin,
  Maximize2, Download, Sun,
} from 'lucide-react';
import { Plant } from '../types';
import PlantImage from '../components/PlantImage';

interface PlantRecommendation {
  plantId: string;
  commonName: string;
  scientificName: string;
  type: string;
  height: { min: number; max: number };
  spread: { min: number; max: number };
  sunRequirements: string[];
  soilType: string[];
  waterRequirements: string;
  bloomTime: string[];
  bloomColor: string[];
  wildlifeValue: { pollinators: boolean; birds: boolean; butterflies: boolean; deer: string; mammals: boolean };
  whyItWorks: string;
  whenToBuy: string;
  howToPlant: string;
  care: string;
  location: string;
}

interface StructuredAnalysis {
  siteAssessment: string;
  landscapeOpportunities: string;
  currentPlants: string;
  recommendations: PlantRecommendation[];
  designConcept: {
    title: string;
    description: string;
    steps: string[];
  };
}

interface AerialMarker {
  id: number;
  plant_id: string;
  plant_name: string;
  lat: number;
  lng: number;
  notes: string;
  status: string;
  year_planted: number | null;
  growth_rate: string | null;
  plant_type: string | null;
  max_height_ft: number | null;
}

const GROWTH_STAGES = [
  { value: '1year', label: '1 Year', desc: 'First growing season' },
  { value: '3year', label: '3 Years', desc: 'Establishing' },
  { value: '5year', label: '5 Years', desc: 'Maturing' },
  { value: '10year', label: '10 Years', desc: 'Well established' },
  { value: 'mature', label: 'Mature', desc: 'Full size' },
];

const YARD_STYLES = [
  { label: 'Woodland / Naturalized', desc: 'Layered native trees & shade groundcovers' },
  { label: 'Pollinator Garden', desc: 'Nectar & host plants for bees and butterflies' },
  { label: 'Wildlife Habitat', desc: 'Berries, cover & food for birds and wildlife' },
  { label: 'Fruit / Vegetable', desc: 'Space for food growing alongside native plantings' },
  { label: 'Low Maintenance', desc: 'Minimal upkeep, drought tolerant' },
  { label: 'Formal / Manicured', desc: 'Clean lines, structured plantings' },
  { label: 'Cottage Garden', desc: 'Informal, colorful, densely planted' },
  { label: 'Privacy Screening', desc: 'Dense screening from view or noise' },
];

const TWEAK_OPTIONS = [
  'More trees',
  'More shrubs',
  'More shade-tolerant plants',
  'More sun-loving plants',
  'More pollinator-friendly plants',
  'Lower maintenance options',
  'More color / blooms',
  'Fewer, simpler recommendations',
];

function MarkdownResult({ text }: { text: string }) {
  const sections = text.split('\n\n').filter(s => s.trim());

  return (
    <div className="prose-ai space-y-3">
      {sections.map((section, i) => {
        const trimmed = section.trim();
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          return <h2 key={i}>{trimmed.replace(/^#+\s/, '')}</h2>;
        }
        if (trimmed.startsWith('### ')) {
          return <h3 key={i}>{trimmed.replace(/^###\s/, '')}</h3>;
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.includes('\n')) {
          return <h3 key={i}>{trimmed.replace(/\*\*/g, '')}</h3>;
        }
        if (trimmed.includes('\n- ') || trimmed.startsWith('- ')) {
          const items = trimmed.split('\n').filter(l => l.startsWith('- '));
          return (
            <ul key={i}>
              {items.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: item.replace(/^- /, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </ul>
          );
        }
        if (/^\d+\./.test(trimmed)) {
          const items = trimmed.split('\n').filter(l => /^\d+\./.test(l));
          return (
            <ol key={i} className="list-decimal list-inside text-gray-700 space-y-1">
              {items.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: item.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </ol>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') }} />;
      })}
    </div>
  );
}

function StructuredAnalysisView({ data }: { data: StructuredAnalysis }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Site Assessment</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{data.siteAssessment}</p>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Landscape Opportunities</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{data.landscapeOpportunities}</p>
      </section>
      {data.currentPlants && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Existing Plants Identified</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{data.currentPlants}</p>
        </section>
      )}
      {data.recommendations?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <TreePine className="w-4 h-4 text-forest-600" />
            Recommended Plants to Purchase
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.recommendations.map((r, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <PlantImage plantId={r.plantId} commonName={r.commonName} className="w-full h-32 object-cover" />
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{r.commonName}</p>
                      <p className="text-xs text-gray-500 italic">{r.scientificName}</p>
                    </div>
                    <span className="text-xs bg-forest-100 text-forest-700 px-2 py-0.5 rounded-full shrink-0">{r.type}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {r.height.min}-{r.height.max} ft tall
                    </span>
                    <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {r.spread.min}-{r.spread.max} ft wide
                    </span>
                    <span className="text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      {r.sunRequirements.join(' / ')}
                    </span>
                    <span className="text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      {r.waterRequirements} water
                    </span>
                    {r.wildlifeValue?.pollinators && (
                      <span className="text-[11px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">pollinators</span>
                    )}
                    {r.wildlifeValue?.birds && (
                      <span className="text-[11px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">birds</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{r.whyItWorks}</p>
                  <ul className="text-xs text-gray-700 space-y-1">
                    <li><span className="font-medium text-gray-900">Buy/plant timing: </span>{r.whenToBuy}</li>
                    <li><span className="font-medium text-gray-900">How to plant: </span>{r.howToPlant}</li>
                    <li><span className="font-medium text-gray-900">Care: </span>{r.care}</li>
                    <li><span className="font-medium text-gray-900">Location: </span>{r.location}</li>
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {data.designConcept && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Design Concept: {data.designConcept.title}</h3>
          <p className="text-sm text-gray-700 leading-relaxed mb-2">{data.designConcept.description}</p>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
            {data.designConcept.steps?.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </section>
      )}
    </div>
  );
}

function looksLikeUnparsedJson(text: string): boolean {
  return text.trim().startsWith('{');
}

function ResultBody({
  mode,
  result,
  structured,
  onRetry,
}: {
  mode: 'analyze' | 'visualize' | 'landscape';
  result: string;
  structured: StructuredAnalysis | null;
  onRetry: () => void;
}) {
  if (structured) {
    return <StructuredAnalysisView data={structured} />;
  }
  if (mode === 'analyze' && looksLikeUnparsedJson(result)) {
    return (
      <div className="text-sm text-gray-600">
        <p className="mb-3">The AI response couldn't be formatted properly this time. Please try again.</p>
        <button onClick={onRetry} className="btn-outline text-sm">
          <RefreshCw className="w-4 h-4" />
          Retry Analysis
        </button>
      </div>
    );
  }
  return <MarkdownResult text={result} />;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReportHtml(opts: {
  title: string;
  imageDataUrl?: string | null;
  structured?: StructuredAnalysis | null;
  rawText?: string | null;
  isDemo?: boolean;
}): string {
  const { title, imageDataUrl, structured, rawText, isDemo } = opts;
  let bodyHtml = '';

  if (structured) {
    bodyHtml += `<h2>Site Assessment</h2><p>${escapeHtml(structured.siteAssessment)}</p>`;
    bodyHtml += `<h2>Landscape Opportunities</h2><p>${escapeHtml(structured.landscapeOpportunities)}</p>`;
    if (structured.currentPlants) {
      bodyHtml += `<h2>Existing Plants Identified</h2><p>${escapeHtml(structured.currentPlants)}</p>`;
    }
    if (structured.recommendations?.length) {
      bodyHtml += `<h2>Recommended Plants to Purchase</h2>`;
      structured.recommendations.forEach(r => {
        bodyHtml += `
          <div class="plant">
            <h3>${escapeHtml(r.commonName)} <em>(${escapeHtml(r.scientificName)})</em> &mdash; ${escapeHtml(r.type)}</h3>
            <p>${r.height.min}-${r.height.max} ft tall &middot; ${r.spread.min}-${r.spread.max} ft wide &middot; ${escapeHtml(r.sunRequirements.join(' / '))} &middot; ${escapeHtml(r.waterRequirements)} water</p>
            <p>${escapeHtml(r.whyItWorks)}</p>
            <ul>
              <li><strong>Buy/plant timing:</strong> ${escapeHtml(r.whenToBuy)}</li>
              <li><strong>How to plant:</strong> ${escapeHtml(r.howToPlant)}</li>
              <li><strong>Care:</strong> ${escapeHtml(r.care)}</li>
              <li><strong>Location:</strong> ${escapeHtml(r.location)}</li>
            </ul>
          </div>`;
      });
    }
    if (structured.designConcept) {
      bodyHtml += `<h2>Design Concept: ${escapeHtml(structured.designConcept.title)}</h2><p>${escapeHtml(structured.designConcept.description)}</p><ol>${(structured.designConcept.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
    }
  } else if (rawText && !rawText.trim().startsWith('{')) {
    bodyHtml += `<div class="raw">${escapeHtml(rawText).replace(/\n/g, '<br/>')}</div>`;
  } else if (rawText) {
    bodyHtml += `<p><em>This response couldn't be formatted properly. Please re-analyze and try exporting again.</em></p>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #1f2937; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.15rem; margin-top: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: .25rem; }
  h3 { font-size: 1rem; margin-bottom: .25rem; }
  .plant { margin-bottom: 1.25rem; padding: .75rem 1rem; border: 1px solid #e5e7eb; border-radius: .5rem; page-break-inside: avoid; }
  img.hero { max-width: 100%; border-radius: .5rem; margin-bottom: 1rem; }
  ul, ol { margin: .25rem 0 .5rem 1.25rem; }
  .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: .75rem; padding: .15rem .5rem; border-radius: 999px; margin-left: .5rem; }
</style></head><body>
<h1>${escapeHtml(title)}${isDemo ? '<span class="badge">Demo Mode</span>' : ''}</h1>
${imageDataUrl ? `<img class="hero" src="${imageDataUrl}" />` : ''}
${bodyHtml}
</body></html>`;
}

export default function VisualizePage() {
  const location = useLocation();
  const preselectedPlant = location.state?.plant as Plant | undefined;
  const projectId = location.state?.projectId as number | undefined;
  const projectName = location.state?.projectName as string | undefined;
  const projectAddress = location.state?.projectAddress as string | undefined;

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(preselectedPlant || null);
  const [plantSearch, setPlantSearch] = useState(preselectedPlant?.commonName || '');
  const [plantResults, setPlantResults] = useState<Plant[]>([]);
  const [showPlantSearch, setShowPlantSearch] = useState(!preselectedPlant);
  const [growthStage, setGrowthStage] = useState('5year');
  const [location2, setLocation2] = useState(projectAddress || '');
  const [locationMode, setLocationMode] = useState<'general' | 'address'>('general');
  const [geocoding, setGeocoding] = useState(false);
  const [sunExposure, setSunExposure] = useState<{ classification: string; hoursOfSun: number; label: string } | null>(null);
  const [mode, setMode] = useState<'analyze' | 'visualize' | 'landscape'>(
    projectId ? 'landscape' : 'analyze'
  );
  const [yardStyles, setYardStyles] = useState<string[]>([]);
  const [showTweaks, setShowTweaks] = useState(false);
  const [selectedTweaks, setSelectedTweaks] = useState<string[]>([]);
  const [customTweak, setCustomTweak] = useState('');

  // Project context
  const [existingPlants, setExistingPlants] = useState<AerialMarker[]>([]);
  const [futurePlants, setFuturePlants] = useState<Plant[]>([]);
  const [futureSearch, setFutureSearch] = useState('');
  const [futureResults, setFutureResults] = useState<Plant[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [structured, setStructured] = useState<StructuredAnalysis | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const futureSearchTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!projectId) return;
    setLoadingProject(true);
    axios.get(`/api/projects/${projectId}`)
      .then(res => setExistingPlants(res.data.aerialMarkers || []))
      .catch(() => toast.error('Could not load project plants'))
      .finally(() => setLoadingProject(false));
  }, [projectId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    setStructured(null);
    toast.success('Image ready for analysis!');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const searchPlants = async (q: string) => {
    if (!q.trim() || q.length < 2) { setPlantResults([]); return; }
    try {
      const res = await axios.get('/api/plants/search', { params: { q, limit: 6 } });
      setPlantResults(res.data.results);
    } catch { /* ignore */ }
  };

  const handlePlantSearchChange = (val: string) => {
    setPlantSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchPlants(val), 300);
  };

  const handleFutureSearchChange = (val: string) => {
    setFutureSearch(val);
    clearTimeout(futureSearchTimeout.current);
    futureSearchTimeout.current = setTimeout(async () => {
      if (!val.trim() || val.length < 2) { setFutureResults([]); return; }
      try {
        const res = await axios.get('/api/plants/search', { params: { q: val, limit: 6 } });
        setFutureResults(res.data.results);
      } catch { /* ignore */ }
    }, 300);
  };

  const selectPlant = (plant: Plant) => {
    setSelectedPlant(plant);
    setPlantSearch(plant.commonName);
    setPlantResults([]);
    setShowPlantSearch(false);
  };

  const clearPlant = () => {
    setSelectedPlant(null);
    setPlantSearch('');
    setPlantResults([]);
    setShowPlantSearch(true);
  };

  const addFuturePlant = (plant: Plant) => {
    if (!futurePlants.find(p => p.id === plant.id)) {
      setFuturePlants(prev => [...prev, plant]);
    }
    setFutureSearch('');
    setFutureResults([]);
  };

  const removeFuturePlant = (id: string) => {
    setFuturePlants(prev => prev.filter(p => p.id !== id));
  };

  const toggleYardStyle = (label: string) => {
    setYardStyles(prev => prev.includes(label) ? prev.filter(v => v !== label) : [...prev, label]);
  };

  const toggleTweak = (label: string) => {
    setSelectedTweaks(prev => prev.includes(label) ? prev.filter(v => v !== label) : [...prev, label]);
  };

  const lookupSunExposure = async () => {
    if (!location2.trim()) {
      toast.error('Enter an address first');
      return;
    }
    setGeocoding(true);
    setSunExposure(null);
    try {
      const geo = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: location2, format: 'json', limit: 1 },
        headers: { 'Accept-Language': 'en-US' },
      });
      if (!geo.data || geo.data.length === 0) {
        toast.error('Could not find that address');
        return;
      }
      const { lat, lon, display_name } = geo.data[0];
      const sun = await axios.get('/api/sunpath/calculate', { params: { lat, lng: lon } });
      const { classification, hoursOfSun } = sun.data.sunExposure;
      setSunExposure({ classification, hoursOfSun, label: display_name });
      toast.success('Sun exposure calculated from address!');
    } catch {
      toast.error('Could not calculate sun exposure for that address');
    } finally {
      setGeocoding(false);
    }
  };

  const runAnalysis = async (adjustments?: string) => {
    setLoading(true);
    setResult(null);
    setStructured(null);

    try {
      if (mode === 'landscape') {
        const currentYear = new Date().getFullYear();
        const allPlants = [
          ...existingPlants.map(m => ({
            commonName: m.plant_name,
            scientificName: '',
            yearPlanted: m.year_planted || currentYear - 3,
            heightPlanted: 1,
            currentEstimatedHeight: m.max_height_ft
              ? Math.min(m.max_height_ft, (m.year_planted ? currentYear - m.year_planted : 3) * 0.75 + 1)
              : 4,
            currentEstimatedSpread: 3,
            growthRate: m.growth_rate || 'medium',
            type: m.plant_type || 'shrub',
            zoneName: 'Existing',
          })),
          ...futurePlants.map(p => ({
            commonName: p.commonName,
            scientificName: p.scientificName,
            yearPlanted: currentYear,
            heightPlanted: 0.5,
            currentEstimatedHeight: 0.5,
            currentEstimatedSpread: 0.5,
            growthRate: p.growthRate,
            type: p.type,
            zoneName: 'Planned',
          })),
        ];

        if (allPlants.length === 0) {
          toast.error('Add existing or future plants first');
          setLoading(false);
          return;
        }

        const res = await axios.post('/api/ai/streetview', {
          plants: allPlants,
          address: location2 || projectAddress || '',
          viewType: 'street',
        });
        const text = res.data.visualization || '';
        setResult(text);
        setIsDemo(res.data.demo || false);
        if (res.data.demo) {
          toast('Running in demo mode. Add ANTHROPIC_API_KEY for real AI analysis.', { icon: '⚠️', duration: 5000 });
        } else {
          toast.success('AI landscape view ready!');
        }
        return;
      }

      if (!uploadedFile) {
        toast.error('Please upload an image first');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('image', uploadedFile);
      formData.append('task', mode);
      if (selectedPlant) {
        formData.append('plantName', selectedPlant.commonName);
        formData.append('plantScientific', selectedPlant.scientificName);
        formData.append('height', selectedPlant.height.max.toString());
        formData.append('spread', selectedPlant.spread.max.toString());
      }
      if (location2) formData.append('location', location2);
      if (locationMode === 'address' && sunExposure) {
        formData.append('sunClassification', sunExposure.classification);
        formData.append('sunHoursOfSun', String(sunExposure.hoursOfSun));
      }
      if (mode === 'analyze' && yardStyles.length > 0) {
        formData.append('yardStyles', yardStyles.join(', '));
      }
      if (mode === 'analyze' && adjustments) {
        formData.append('adjustments', adjustments);
      }
      if (mode === 'visualize') formData.append('growthStage', growthStage);

      const endpoint = mode === 'analyze' ? '/api/ai/analyze' : '/api/ai/visualize';
      const res = await axios.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const text = res.data.analysis || res.data.visualization || '';
      setResult(text);
      setStructured(res.data.structured || null);
      setIsDemo(res.data.demo || false);

      if (res.data.demo) {
        toast('Running in demo mode. Add ANTHROPIC_API_KEY for real AI analysis.', { icon: '⚠️', duration: 5000 });
      } else {
        toast.success('AI analysis complete!');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Analysis failed';
      toast.error(msg);
      if (err.response?.data?.analysis || err.response?.data?.visualization) {
        setResult(err.response.data.analysis || err.response.data.visualization);
        setStructured(err.response.data.structured || null);
        setIsDemo(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const refineAnalysis = () => {
    const parts = [...selectedTweaks];
    if (customTweak.trim()) parts.push(customTweak.trim());
    if (parts.length === 0) {
      toast.error('Select or type at least one adjustment');
      return;
    }
    runAnalysis(parts.join('; '));
  };

  const analyzeButtonLabel = () => {
    if (loading) return 'Analyzing with AI...';
    if (mode === 'analyze') return 'Analyze My Yard';
    if (mode === 'visualize') return 'Visualize Plant Growth';
    return 'Generate Landscape View';
  };

  const analyzeButtonDisabled = mode === 'landscape'
    ? loading || (existingPlants.length === 0 && futurePlants.length === 0)
    : loading || !uploadedFile;

  const resultTitle = mode === 'analyze'
    ? 'Yard Analysis'
    : mode === 'landscape'
    ? 'Landscape View'
    : `Growth Visualization: ${GROWTH_STAGES.find(s => s.value === growthStage)?.label}`;

  const exportPDF = () => {
    if (!result && !structured) return;
    const html = buildReportHtml({
      title: resultTitle,
      imageDataUrl: mode !== 'landscape' ? imagePreview : null,
      structured,
      rawText: result,
      isDemo,
    });
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Please allow popups to export as PDF');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Eye className="w-8 h-8 text-purple-600" />
          AI Yard Visualizer
        </h1>
        <p className="text-gray-500 max-w-2xl">
          Upload a photo of your yard or house exterior and use AI to analyze your landscape,
          visualize how native plants will look as they grow, and get personalized planting recommendations.
        </p>
      </div>

      {/* Project context banner */}
      {projectId && (
        <div className="mb-6 bg-forest-50 border border-forest-200 rounded-xl p-4 flex items-start gap-3">
          <Folder className="w-5 h-5 text-forest-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-forest-800 truncate">{projectName}</p>
            {projectAddress && (
              <p className="text-xs text-forest-600 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />{projectAddress}
              </p>
            )}
            <p className="text-xs text-forest-500 mt-1">
              {loadingProject
                ? 'Loading project plants…'
                : `${existingPlants.length} documented plant${existingPlants.length !== 1 ? 's' : ''} in this project`}
            </p>
          </div>
        </div>
      )}

      {/* Top row: Mode | Upload Photo | Property Location — one line on desktop */}
      <div className="grid md:grid-cols-3 gap-4 mb-5">
        {/* Mode selector */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Analysis Mode</h2>
          <div className={`grid gap-2 ${projectId ? 'grid-cols-1' : 'grid-cols-1'}`}>
            {projectId && (
              <button
                onClick={() => setMode('landscape')}
                className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                  mode === 'landscape'
                    ? 'border-forest-500 bg-forest-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye className={`w-4 h-4 shrink-0 ${mode === 'landscape' ? 'text-forest-600' : 'text-gray-400'}`} />
                  <p className={`text-sm font-medium ${mode === 'landscape' ? 'text-forest-700' : 'text-gray-700'}`}>
                    Landscape View
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Visualize existing + future plants together</p>
              </button>
            )}
            <button
              onClick={() => setMode('analyze')}
              className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                mode === 'analyze'
                  ? 'border-forest-500 bg-forest-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Search className={`w-4 h-4 shrink-0 ${mode === 'analyze' ? 'text-forest-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${mode === 'analyze' ? 'text-forest-700' : 'text-gray-700'}`}>
                  Yard Analysis
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Assess site & recommend plants</p>
            </button>
            <button
              onClick={() => setMode('visualize')}
              className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                mode === 'visualize'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className={`w-4 h-4 shrink-0 ${mode === 'visualize' ? 'text-purple-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${mode === 'visualize' ? 'text-purple-700' : 'text-gray-700'}`}>
                  Growth Visualizer
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">See plant growth over time</p>
            </button>
          </div>
        </div>

        {/* Upload Photo (photo modes) / placeholder (landscape mode) */}
        {mode !== 'landscape' ? (
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-gray-400" />
              Upload Photo
            </h2>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-forest-400 bg-forest-50'
                  : imagePreview
                  ? 'border-forest-300 bg-forest-50/50'
                  : 'border-gray-300 hover:border-forest-400 hover:bg-gray-50'
              }`}
            >
              <input {...getInputProps()} />
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Uploaded yard"
                    className="w-full h-24 object-cover rounded-lg mb-2"
                  />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setImagePreview(null);
                      setUploadedFile(null);
                      setResult(null);
                      setStructured(null);
                    }}
                    className="absolute top-2 right-2 bg-white/90 text-gray-700 rounded-full p-1 hover:bg-white shadow"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-xs text-forest-600 font-medium truncate">{uploadedFile?.name}</p>
                  <p className="text-xs text-gray-400">Click to change image</p>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1.5" />
                  <p className="text-sm font-medium text-gray-700">
                    {isDragActive ? 'Drop image here' : 'Drag & drop or click'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP up to 20MB</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-4 flex flex-col justify-center">
            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Folder className="w-4 h-4 text-forest-500" />
              Landscape View Mode
            </h2>
            <p className="text-xs text-gray-500">
              No photo needed — AI generates a description from the existing and planned plants listed below.
            </p>
          </div>
        )}

        {/* Property Location */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">
              Property Location <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex gap-1 text-xs shrink-0">
              <button
                onClick={() => { setLocationMode('general'); setSunExposure(null); }}
                className={`px-2 py-1 rounded-full transition-colors ${
                  locationMode === 'general' ? 'bg-forest-100 text-forest-700 font-medium' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                General area
              </button>
              <button
                onClick={() => setLocationMode('address')}
                className={`px-2 py-1 rounded-full transition-colors ${
                  locationMode === 'address' ? 'bg-forest-100 text-forest-700 font-medium' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Specific address
              </button>
            </div>
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={location2}
              onChange={e => { setLocation2(e.target.value); setSunExposure(null); }}
              placeholder={locationMode === 'address' ? '123 Main St, Arlington, VA 22201' : 'e.g., Northern Virginia, Zone 7'}
              className="input pl-10 text-sm"
            />
          </div>
          {locationMode === 'address' ? (
            <div className="mt-2">
              <button
                onClick={lookupSunExposure}
                disabled={geocoding || !location2.trim()}
                className="btn-outline text-xs w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {geocoding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sun className="w-3.5 h-3.5" />}
                {geocoding ? 'Calculating sun exposure...' : 'Calculate Sun Exposure'}
              </button>
              {sunExposure && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-amber-800 flex items-start gap-1.5">
                  <Sun className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {sunExposure.classification === 'full-sun' ? 'Full Sun' : sunExposure.classification === 'part-shade' ? 'Part Shade' : 'Full Shade'}
                      {' '}· ~{sunExposure.hoursOfSun} hrs direct sun today
                    </p>
                    <p className="text-amber-600 truncate">{sunExposure.label}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Measures actual solar exposure so AI won't misjudge sun/shade from the photo alone</p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Helps AI tailor recommendations to your climate</p>
          )}
        </div>
      </div>

      {/* Yard Style (Yard Analysis mode only) */}
      {mode === 'analyze' && (
        <div className="card p-4 mb-5">
          <h2 className="font-semibold text-gray-900 mb-1">
            Yard Style <span className="text-gray-400 font-normal text-sm">(optional, select any that apply)</span>
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Tell the AI what kind of yard you're going for — it'll prioritize recommendations and the design concept accordingly.
          </p>
          <div className="flex flex-wrap gap-2">
            {YARD_STYLES.map(s => (
              <button
                key={s.label}
                onClick={() => toggleYardStyle(s.label)}
                title={s.desc}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                  yardStyles.includes(s.label)
                    ? 'border-forest-500 bg-forest-50 text-forest-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5 mb-5">
        {/* Landscape mode: existing + future plants */}
        {mode === 'landscape' && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* existing */}
            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <TreePine className="w-4 h-4 text-forest-600" />
                Existing Plants
                <span className="ml-auto text-xs text-gray-400 font-normal">from project</span>
              </h2>
              {existingPlants.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No plants documented in this project yet. Add plants via the Designer view.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {existingPlants.map(m => (
                    <li key={m.id} className="flex items-center gap-2 text-sm text-gray-700 bg-forest-50 rounded-lg px-3 py-1.5">
                      <TreePine className="w-3.5 h-3.5 text-forest-500 shrink-0" />
                      <span className="flex-1 truncate">{m.plant_name}</span>
                      {m.year_planted && (
                        <span className="text-xs text-gray-400 shrink-0">planted {m.year_planted}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* future */}
            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                Future / Planned Plants
              </h2>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={futureSearch}
                  onChange={e => handleFutureSearchChange(e.target.value)}
                  placeholder="Search plants to add…"
                  className="input pl-10 text-sm"
                />
                {futureResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 mt-1 overflow-hidden">
                    {futureResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addFuturePlant(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0 flex items-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.commonName}</p>
                          <p className="text-xs text-gray-500 italic">{p.scientificName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {futurePlants.length === 0 ? (
                <p className="text-xs text-gray-400">Search above to add plants you're considering planting.</p>
              ) : (
                <ul className="space-y-1.5">
                  {futurePlants.map(p => (
                    <li key={p.id} className="flex items-center gap-2 text-sm text-gray-700 bg-purple-50 rounded-lg px-3 py-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="flex-1 truncate">{p.commonName}</span>
                      <button onClick={() => removeFuturePlant(p.id)} className="text-gray-300 hover:text-red-400 ml-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Plant selection + growth stage (visualize mode) */}
        {mode === 'visualize' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <TreePine className="w-4 h-4 text-forest-600" />
                Select Plant to Visualize
              </h2>

              {selectedPlant ? (
                <div className="flex items-center justify-between p-3 bg-forest-50 rounded-xl border border-forest-200">
                  <div>
                    <p className="font-medium text-forest-800 text-sm">{selectedPlant.commonName}</p>
                    <p className="text-xs text-forest-600 italic">{selectedPlant.scientificName}</p>
                    <p className="text-xs text-forest-600 mt-0.5">
                      {selectedPlant.height.min}–{selectedPlant.height.max} ft · {selectedPlant.spread.min}–{selectedPlant.spread.max} ft wide
                    </p>
                  </div>
                  <button onClick={clearPlant} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={plantSearch}
                    onChange={e => handlePlantSearchChange(e.target.value)}
                    placeholder="Search plants..."
                    className="input pl-10 text-sm"
                    onFocus={() => setShowPlantSearch(true)}
                  />
                  {plantResults.length > 0 && showPlantSearch && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 mt-1 overflow-hidden">
                      {plantResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectPlant(p)}
                          className="w-full text-left px-3 py-2.5 hover:bg-forest-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-900">{p.commonName}</p>
                          <p className="text-xs text-gray-500 italic">{p.scientificName}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className="label text-xs">Browse Plants</label>
                <Link to="/plants" className="flex items-center gap-2 text-sm text-forest-600 hover:text-forest-800">
                  <Leaf className="w-4 h-4" />
                  Open Plant Library
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Growth Stage</h2>
              <div className="space-y-2">
                {GROWTH_STAGES.map(stage => (
                  <label
                    key={stage.value}
                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border-2 transition-colors ${
                      growthStage === stage.value
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="growthStage"
                      value={stage.value}
                      checked={growthStage === stage.value}
                      onChange={e => setGrowthStage(e.target.value)}
                      className="text-purple-600"
                    />
                    <div>
                      <p className={`text-sm font-medium ${growthStage === stage.value ? 'text-purple-700' : 'text-gray-700'}`}>
                        {stage.label}
                      </p>
                      <p className="text-xs text-gray-500">{stage.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Analyze button */}
        <button
          onClick={() => runAnalysis()}
          disabled={analyzeButtonDisabled}
          className="w-full bg-gradient-to-r from-forest-600 to-forest-700 hover:from-forest-700 hover:to-forest-800 disabled:from-gray-300 disabled:to-gray-300 text-white font-semibold px-6 py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-sm disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Analyzing with AI...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              {analyzeButtonLabel()}
            </>
          )}
        </button>

        {/* API key notice — only shown when backend returns demo mode */}
        {isDemo && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-medium mb-1">AI Features Require API Key</p>
              <p>Add your <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> to{' '}
              <code className="bg-amber-100 px-1 rounded">backend/.env</code> for real AI analysis.
              Without it, demo responses are shown.</p>
            </div>
          </div>
        )}
      </div>

      {/* Results — full width block */}
      {result ? (
        <div className="card p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                mode === 'visualize' ? 'bg-purple-100' : 'bg-forest-100'
              }`}>
                {mode === 'visualize' ? (
                  <Sparkles className="w-4 h-4 text-purple-600" />
                ) : (
                  <Eye className="w-4 h-4 text-forest-600" />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{resultTitle}</h2>
                {selectedPlant && mode === 'visualize' && (
                  <p className="text-xs text-gray-500">{selectedPlant.commonName} · {selectedPlant.scientificName}</p>
                )}
                {mode === 'landscape' && (
                  <p className="text-xs text-gray-500">
                    {existingPlants.length} existing · {futurePlants.length} planned
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isDemo && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  Demo Mode
                </span>
              )}
              <button onClick={() => setExpanded(true)} className="btn-outline text-sm" title="Expand to full page">
                <Maximize2 className="w-4 h-4" />
                Expand
              </button>
              <button onClick={exportPDF} className="btn-outline text-sm" title="Export as PDF">
                <Download className="w-4 h-4" />
                Export PDF
              </button>
              <button onClick={() => { setResult(null); setStructured(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {imagePreview && mode !== 'landscape' && (
            <div className="mb-4">
              <img
                src={imagePreview}
                alt="Analyzed yard"
                className="w-full max-h-64 object-cover rounded-xl border border-gray-200"
              />
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4">
            <ResultBody mode={mode} result={result} structured={structured} onRetry={() => runAnalysis()} />
          </div>

          <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => runAnalysis()} className="btn-outline text-sm">
              <RefreshCw className="w-4 h-4" />
              Re-analyze
            </button>
            {mode === 'analyze' && (
              <Link to="/plants" className="btn-secondary text-sm">
                <TreePine className="w-4 h-4" />
                Browse Plants
              </Link>
            )}
            {mode === 'analyze' && (
              <button onClick={() => setMode('visualize')} className="btn-secondary text-sm">
                <Sparkles className="w-4 h-4" />
                Try Visualizer
              </button>
            )}
          </div>

          {mode === 'analyze' && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowTweaks(v => !v)}
                className="text-sm text-forest-600 hover:text-forest-800 flex items-center gap-1.5 font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Not quite right? Tweak & re-analyze
              </button>
              {showTweaks && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {TWEAK_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        onClick={() => toggleTweak(opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                          selectedTweaks.includes(opt)
                            ? 'border-forest-500 bg-forest-50 text-forest-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={customTweak}
                    onChange={e => setCustomTweak(e.target.value)}
                    placeholder="Or describe your own adjustment…"
                    className="input text-sm"
                  />
                  <button
                    onClick={refineAnalysis}
                    disabled={loading || (selectedTweaks.length === 0 && !customTweak.trim())}
                    className="btn-outline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-4 h-4" />
                    Apply & Re-analyze
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center flex flex-col items-center justify-center min-h-[400px]">
          {mode === 'landscape' ? (
            <>
              <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mb-4">
                <Eye className="w-8 h-8 text-forest-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Landscape View</h3>
              <p className="text-gray-500 text-sm mb-2">
                AI will describe how your yard looks today with existing plants, and how it will evolve once planned plants are added.
              </p>
              <p className="text-gray-400 text-xs">
                {existingPlants.length} existing · {futurePlants.length} planned — click Generate when ready.
              </p>
            </>
          ) : uploadedFile ? (
            <>
              <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-forest-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Analyze!</h3>
              <p className="text-gray-500 text-sm mb-4">
                {mode === 'analyze'
                  ? "Click 'Analyze My Yard' to get AI landscape assessment and plant recommendations."
                  : selectedPlant
                  ? `Click 'Visualize Plant Growth' to see how ${selectedPlant.commonName} will look in your yard.`
                  : "Select a plant and click 'Visualize Plant Growth' to see how it will look in your yard."}
              </p>
              <img
                src={imagePreview!}
                alt="Your yard"
                className="w-full max-w-sm max-h-48 object-cover rounded-xl border border-gray-200"
              />
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-forest-100 to-purple-100 rounded-2xl flex items-center justify-center mb-4">
                <Eye className="w-10 h-10 text-forest-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">AI Yard Visualizer</h3>
              <p className="text-gray-500 max-w-md mb-6">
                Upload a photo of your house exterior or yard, then use AI to analyze
                your landscape or visualize how specific plants will look as they grow over time.
              </p>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm text-left">
                {[
                  { icon: Search, title: 'Yard Analysis', desc: 'Get sun/shade assessment & plant recommendations' },
                  { icon: Sparkles, title: 'Growth Visualizer', desc: 'See how plants look at 1, 3, 5, 10+ years' },
                  { icon: TreePine, title: 'Plant Matching', desc: 'AI suggests plants suited to your conditions' },
                  { icon: Camera, title: 'Any Photo', desc: 'Use house exterior, yard, or aerial photos' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <item.icon className="w-5 h-5 text-forest-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Expanded full-page view */}
      {expanded && result && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{resultTitle}</h2>
                {isDemo && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    Demo Mode
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportPDF} className="btn-outline text-sm">
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
                <button onClick={() => setExpanded(false)} className="btn-outline text-sm">
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
            </div>

            {imagePreview && mode !== 'landscape' && (
              <img
                src={imagePreview}
                alt="Analyzed yard"
                className="w-full max-h-96 object-cover rounded-xl border border-gray-200 mb-6"
              />
            )}

            <div className="bg-gray-50 rounded-xl p-6">
              <ResultBody mode={mode} result={result} structured={structured} onRetry={() => runAnalysis()} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
