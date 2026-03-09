import { useState, useRef, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Upload, Image as ImageIcon, Eye, TreePine, X, RefreshCw,
  Sparkles, Info, ChevronDown, ChevronUp, Search, ArrowRight,
  Leaf, Camera, ZoomIn
} from 'lucide-react';
import { Plant } from '../types';

const GROWTH_STAGES = [
  { value: '1year', label: '1 Year', desc: 'First growing season' },
  { value: '3year', label: '3 Years', desc: 'Establishing' },
  { value: '5year', label: '5 Years', desc: 'Maturing' },
  { value: '10year', label: '10 Years', desc: 'Well established' },
  { value: 'mature', label: 'Mature', desc: 'Full size' },
];

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*)/gm, '<h3>$1</h3>')
    .replace(/^## (.*)/gm, '<h2>$1</h2>')
    .replace(/^# (.*)/gm, '<h2>$1</h2>')
    .replace(/^\d+\. (.*)/gm, '<li>$1</li>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '')
    .trim();
}

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

export default function VisualizePage() {
  const location = useLocation();
  const preselectedPlant = location.state?.plant as Plant | undefined;

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(preselectedPlant || null);
  const [plantSearch, setPlantSearch] = useState(preselectedPlant?.commonName || '');
  const [plantResults, setPlantResults] = useState<Plant[]>([]);
  const [showPlantSearch, setShowPlantSearch] = useState(!preselectedPlant);
  const [growthStage, setGrowthStage] = useState('5year');
  const [location2, setLocation2] = useState('');
  const [mode, setMode] = useState<'analyze' | 'visualize'>('analyze');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    toast.success('Image ready for analysis!');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const searchPlants = async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setPlantResults([]);
      return;
    }
    try {
      const res = await axios.get('/api/plants/search', { params: { q, limit: 6 } });
      setPlantResults(res.data.results);
    } catch {
      // Backend may not be running
    }
  };

  const handlePlantSearchChange = (val: string) => {
    setPlantSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchPlants(val), 300);
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

  const runAnalysis = async () => {
    if (!uploadedFile) {
      toast.error('Please upload an image first');
      return;
    }

    setLoading(true);
    setResult(null);

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
    if (mode === 'visualize') {
      formData.append('growthStage', growthStage);
    }

    try {
      const endpoint = mode === 'analyze' ? '/api/ai/analyze' : '/api/ai/visualize';
      const res = await axios.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const text = res.data.analysis || res.data.visualization || '';
      setResult(text);
      setIsDemo(res.data.demo || false);

      if (res.data.demo) {
        toast('Running in demo mode. Add ANTHROPIC_API_KEY for real AI analysis.', {
          icon: '⚠️',
          duration: 5000,
        });
      } else {
        toast.success('AI analysis complete!');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Analysis failed';
      toast.error(msg);

      // Try to use demo response
      if (err.response?.data?.analysis || err.response?.data?.visualization) {
        setResult(err.response.data.analysis || err.response.data.visualization);
        setIsDemo(true);
      }
    } finally {
      setLoading(false);
    }
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

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left: Controls */}
        <div className="lg:col-span-2 space-y-5">
          {/* Mode selector */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Analysis Mode</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('analyze')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  mode === 'analyze'
                    ? 'border-forest-500 bg-forest-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Search className={`w-5 h-5 mb-1.5 ${mode === 'analyze' ? 'text-forest-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${mode === 'analyze' ? 'text-forest-700' : 'text-gray-700'}`}>
                  Yard Analysis
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Assess site & recommend plants</p>
              </button>
              <button
                onClick={() => setMode('visualize')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  mode === 'visualize'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Sparkles className={`w-5 h-5 mb-1.5 ${mode === 'visualize' ? 'text-purple-600' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${mode === 'visualize' ? 'text-purple-700' : 'text-gray-700'}`}>
                  Growth Visualizer
                </p>
                <p className="text-xs text-gray-500 mt-0.5">See plant growth over time</p>
              </button>
            </div>
          </div>

          {/* Image upload */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-gray-400" />
              Upload Photo
            </h2>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
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
                    className="w-full h-40 object-cover rounded-lg mb-2"
                  />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setImagePreview(null);
                      setUploadedFile(null);
                      setResult(null);
                    }}
                    className="absolute top-2 right-2 bg-white/90 text-gray-700 rounded-full p-1 hover:bg-white shadow"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-xs text-forest-600 font-medium">
                    {uploadedFile?.name}
                  </p>
                  <p className="text-xs text-gray-400">Click to change image</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">
                    {isDragActive ? 'Drop image here' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    House exterior, yard, or aerial photo
                  </p>
                  <p className="text-xs text-gray-400">JPG, PNG, WebP up to 20MB</p>
                </>
              )}
            </div>
          </div>

          {/* Plant selection (for visualize mode) */}
          {mode === 'visualize' && (
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
                <Link
                  to="/plants"
                  className="flex items-center gap-2 text-sm text-forest-600 hover:text-forest-800"
                >
                  <Leaf className="w-4 h-4" />
                  Open Plant Library
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Growth stage (visualize mode) */}
          {mode === 'visualize' && (
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
          )}

          {/* Location */}
          <div className="card p-4">
            <label className="label">
              Property Location <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={location2}
              onChange={e => setLocation2(e.target.value)}
              placeholder="e.g., Northern Virginia, Zone 7"
              className="input text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Helps AI tailor recommendations to your climate</p>
          </div>

          {/* Analyze button */}
          <button
            onClick={runAnalysis}
            disabled={loading || !uploadedFile}
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
                {mode === 'analyze' ? 'Analyze My Yard' : 'Visualize Plant Growth'}
              </>
            )}
          </button>

          {/* API key notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-medium mb-1">AI Features Require API Key</p>
              <p>Add your <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> to{' '}
              <code className="bg-amber-100 px-1 rounded">backend/.env</code> for real AI analysis.
              Without it, demo responses are shown.</p>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-3">
          {result ? (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mode === 'visualize' ? 'bg-purple-100' : 'bg-forest-100'}`}>
                    {mode === 'visualize' ? (
                      <Sparkles className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Eye className="w-4 h-4 text-forest-600" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {mode === 'analyze' ? 'Yard Analysis' : `Growth Visualization: ${GROWTH_STAGES.find(s => s.value === growthStage)?.label}`}
                    </h2>
                    {selectedPlant && mode === 'visualize' && (
                      <p className="text-xs text-gray-500">{selectedPlant.commonName} · {selectedPlant.scientificName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isDemo && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Demo Mode
                    </span>
                  )}
                  <button
                    onClick={() => setResult(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Uploaded image thumbnail */}
              {imagePreview && (
                <div className="mb-4">
                  <img
                    src={imagePreview}
                    alt="Analyzed yard"
                    className="w-full max-h-64 object-cover rounded-xl border border-gray-200"
                  />
                </div>
              )}

              {/* Result text */}
              <div className="bg-gray-50 rounded-xl p-4">
                <MarkdownResult text={result} />
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={runAnalysis}
                  className="btn-outline text-sm"
                >
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
                  <button
                    onClick={() => setMode('visualize')}
                    className="btn-secondary text-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    Try Visualizer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full">
              {/* Placeholder */}
              <div className="card p-8 text-center h-full flex flex-col items-center justify-center min-h-[400px]">
                {uploadedFile ? (
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
