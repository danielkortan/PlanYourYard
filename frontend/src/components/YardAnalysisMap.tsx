import { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { TreePine, X, Pencil, Check, Search, MapPin } from 'lucide-react';
import { Plant } from '../types';
import PlantImage from './PlantImage';

export interface PlantRecommendation {
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
  x: number;
  y: number;
}

export interface ExistingPlantMapItem {
  label: string;
  x: number;
  y: number;
  plantId?: string;
  scientificName?: string;
  corrected?: boolean;
}

export interface StructuredAnalysis {
  siteAssessment: string;
  landscapeOpportunities: string;
  currentPlants: string;
  existingPlantsMap: ExistingPlantMapItem[];
  recommendations: PlantRecommendation[];
  house: { xStart: number; xEnd: number };
  designConcept: {
    title: string;
    description: string;
    steps: string[];
  };
}

interface MapMarkerBase {
  key: string;
  x: number;
  y: number;
  label: string;
}

// Greedily place each label near its marker, trying a ring of candidate offsets
// (radius, then angle) and skipping any that overlap a label already placed, so
// crowded clusters (e.g. plants lined up along the house) fan their names out
// instead of stacking illegibly on top of each other.
function computeLabelLayout(markers: MapMarkerBase[]): Map<string, { x: number; y: number }> {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const result = new Map<string, { x: number; y: number }>();
  const angles = [90, 270, 45, 135, 225, 315, 0, 180];
  const radii = [7, 10, 13, 17, 21, 26];

  for (const m of markers) {
    const w = Math.min(30, Math.max(11, m.label.length * 1.05));
    const h = 5;
    let chosen = { x: Math.min(97, Math.max(3, m.x)), y: Math.min(96, m.y + 6) };
    let found = false;

    for (const r of radii) {
      for (const a of angles) {
        const rad = (a * Math.PI) / 180;
        const cx = Math.min(97, Math.max(3, m.x + r * Math.cos(rad)));
        const cy = Math.min(97, Math.max(4, m.y - r * Math.sin(rad) * 0.75));
        const rect = { x: cx - w / 2, y: cy - h / 2, w, h };
        const collides = placed.some(
          p => !(rect.x + rect.w < p.x || p.x + p.w < rect.x || rect.y + rect.h < p.y || p.y + p.h < rect.y)
        );
        if (!collides) {
          chosen = { x: cx, y: cy };
          placed.push(rect);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      chosen = { x: Math.min(97, Math.max(3, m.x)), y: Math.min(97, m.y + 6) };
      placed.push({ x: chosen.x - w / 2, y: chosen.y - h / 2, w, h });
    }
    result.set(m.key, chosen);
  }
  return result;
}

function LeaderLines({ markers, layout }: { markers: MapMarkerBase[]; layout: Map<string, { x: number; y: number }> }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      {markers.map(m => {
        const l = layout.get(m.key);
        if (!l) return null;
        const dist = Math.hypot(l.x - m.x, l.y - m.y);
        if (dist < 2.5) return null;
        return (
          <line
            key={m.key}
            x1={m.x} y1={m.y} x2={l.x} y2={l.y}
            stroke="#78716c" strokeWidth={0.3} strokeDasharray="1.2,1" opacity={0.55}
          />
        );
      })}
    </svg>
  );
}

function useDebouncedPlantSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Plant[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const onChange = (val: string) => {
    setQuery(val);
    clearTimeout(timeoutRef.current);
    if (!val.trim() || val.length < 2) { setResults([]); return; }
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await axios.get('/api/plants/search', { params: { q: val, limit: 6 } });
        setResults(res.data.results || []);
      } catch { /* ignore */ }
    }, 300);
  };

  return { query, results, onChange };
}

interface MarkerPopoverProps {
  kind: 'existing' | 'rec';
  label: string;
  scientificName?: string;
  plantId?: string;
  rec?: PlantRecommendation;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRename: (newLabel: string) => void;
  onLink: (plant: Plant) => void;
  onClose: () => void;
}

function MarkerPopoverCard({
  kind, label, scientificName, plantId, rec, editing, onStartEdit, onCancelEdit, onRename, onLink, onClose,
}: MarkerPopoverProps) {
  const [renameValue, setRenameValue] = useState(label);
  const search = useDebouncedPlantSearch();

  useEffect(() => { setRenameValue(label); }, [label, editing]);

  if (editing) {
    return (
      <div className="w-64 max-w-[80vw] bg-white border border-gray-200 rounded-xl shadow-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-900">Correct this plant ID</p>
          <button onClick={onCancelEdit} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {kind === 'existing' && (
          <div className="mb-3">
            <label className="text-[11px] text-gray-500 mb-1 block">Quick rename</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                className="input text-xs py-1.5"
              />
              <button
                onClick={() => { if (renameValue.trim()) onRename(renameValue.trim()); }}
                className="shrink-0 bg-forest-600 hover:bg-forest-700 text-white rounded-lg px-2 flex items-center justify-center"
                title="Save name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="text-[11px] text-gray-500 mb-1 block">Or search the plant library</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search.query}
              onChange={e => search.onChange(e.target.value)}
              placeholder="Search species…"
              className="input text-xs py-1.5 pl-7"
            />
          </div>
          {search.results.length > 0 && (
            <div className="mt-1.5 border border-gray-100 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {search.results.map(p => (
                <button
                  key={p.id}
                  onClick={() => onLink(p)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-forest-50 border-b border-gray-50 last:border-0"
                >
                  <p className="text-xs font-medium text-gray-900">{p.commonName}</p>
                  <p className="text-[10px] text-gray-500 italic">{p.scientificName}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 max-w-[80vw] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      {kind === 'rec' && rec && (
        <PlantImage plantId={rec.plantId} commonName={rec.commonName} className="w-full h-24 object-cover" />
      )}
      {kind === 'existing' && plantId && (
        <PlantImage plantId={plantId} commonName={label} className="w-full h-24 object-cover" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{kind === 'rec' ? rec?.commonName : label}</p>
            {(kind === 'rec' ? rec?.scientificName : scientificName) && (
              <p className="text-xs text-gray-500 italic truncate">{kind === 'rec' ? rec?.scientificName : scientificName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {kind === 'existing' && (
          <p className="text-[11px] text-gray-400 mt-1">Existing plant identified from your photo</p>
        )}
        {kind === 'rec' && rec && (
          <>
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{rec.height.min}-{rec.height.max} ft</span>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{rec.sunRequirements.join(' / ')}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{rec.waterRequirements} water</span>
            </div>
            <p className="text-xs text-gray-600 mt-2 line-clamp-3">{rec.whyItWorks}</p>
          </>
        )}
        <button
          onClick={onStartEdit}
          className="mt-2.5 flex items-center gap-1 text-xs text-forest-600 hover:text-forest-800 font-medium"
        >
          <Pencil className="w-3 h-3" />
          Not the right plant? Correct ID
        </button>
      </div>
    </div>
  );
}

export function YardMapView({
  existingPlantsMap,
  recommendations,
  house,
  onUpdateExisting,
  onUpdateRecommendation,
}: {
  existingPlantsMap: ExistingPlantMapItem[];
  recommendations: PlantRecommendation[];
  house: { xStart: number; xEnd: number };
  onUpdateExisting: (index: number, patch: Partial<ExistingPlantMapItem>) => void;
  onUpdateRecommendation: (index: number, patch: Partial<PlantRecommendation>) => void;
}) {
  const houseWidth = Math.max(10, house.xEnd - house.xStart);
  const houseCenter = house.xStart + houseWidth / 2;
  const roofHalfWidthPct = Math.min(14, houseWidth / 2 + 3);

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const activeKey = pinnedKey ?? hoverKey;

  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ key: string; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  const clampPct = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const applyDragMove = (key: string, xPct: number, yPct: number) => {
    if (key.startsWith('existing-')) {
      onUpdateExisting(Number(key.slice('existing-'.length)), { x: xPct, y: yPct });
    } else {
      onUpdateRecommendation(Number(key.slice('rec-'.length)), { x: xPct, y: yPct });
    }
  };

  const handleMarkerPointerDown = (key: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = { key, moved: false };
    setDraggingKey(key);
    setPinnedKey(null);
    setEditingKey(null);
  };

  const handleMarkerPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const xPct = clampPct(((e.clientX - rect.left) / rect.width) * 100, 2, 98);
    const yPct = clampPct(((e.clientY - rect.top) / rect.height) * 100, 3, 97);
    drag.moved = true;
    applyDragMove(drag.key, xPct, yPct);
  };

  const handleMarkerPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (drag?.moved) justDraggedRef.current = true;
    dragStateRef.current = null;
    setDraggingKey(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleMarkerClick = (key: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    setPinnedKey(k => (k === key ? null : key));
    setEditingKey(null);
  };

  const allMarkers = useMemo<MapMarkerBase[]>(() => [
    ...existingPlantsMap.map((p, i) => ({ key: `existing-${i}`, x: p.x, y: p.y, label: p.label })),
    ...recommendations.map((r, i) => ({ key: `rec-${i}`, x: r.x, y: r.y, label: r.commonName })),
  ], [existingPlantsMap, recommendations]);

  const layout = useMemo(() => computeLabelLayout(allMarkers), [allMarkers]);

  const closeAll = () => {
    // Don't let a stray click on the map background silently discard an in-progress correction.
    if (editingKey) return;
    setPinnedKey(null);
    setHoverKey(null);
  };
  const markerHoverHandlers = (key: string) => ({
    onMouseEnter: () => setHoverKey(key),
    onMouseLeave: () => setHoverKey(h => (h === key ? null : h)),
  });

  const renderPopover = (key: string, x: number, y: number, kind: 'existing' | 'rec', existingIndex?: number, recIndex?: number) => {
    if (activeKey !== key) return null;
    const anchorLeft = x <= 55;
    const anchorTop = y <= 55;
    const existingItem = existingIndex !== undefined ? existingPlantsMap[existingIndex] : undefined;
    const rec = recIndex !== undefined ? recommendations[recIndex] : undefined;
    return (
      <div
        className={`absolute z-30 ${anchorLeft ? '' : '-translate-x-full'} ${anchorTop ? 'mt-2' : '-translate-y-full -mt-2'}`}
        style={{ left: `${x}%`, top: `${y}%` }}
        onClick={e => e.stopPropagation()}
        {...markerHoverHandlers(key)}
      >
        <MarkerPopoverCard
          kind={kind}
          label={kind === 'existing' ? (existingItem?.label ?? '') : (rec?.commonName ?? '')}
          scientificName={existingItem?.scientificName}
          plantId={kind === 'existing' ? existingItem?.plantId : rec?.plantId}
          rec={rec}
          editing={editingKey === key}
          onStartEdit={() => { setPinnedKey(key); setEditingKey(key); }}
          onCancelEdit={() => setEditingKey(null)}
          onRename={newLabel => {
            if (kind === 'existing' && existingIndex !== undefined) {
              // A freeform rename decouples the marker from whatever species it was
              // previously linked to, so drop the stale plantId/scientificName —
              // otherwise the marker would show the old plant's photo under the new name.
              onUpdateExisting(existingIndex, {
                label: newLabel,
                corrected: true,
                plantId: undefined,
                scientificName: undefined,
              });
            }
            setEditingKey(null);
          }}
          onLink={plant => {
            if (kind === 'existing' && existingIndex !== undefined) {
              onUpdateExisting(existingIndex, {
                label: plant.commonName,
                scientificName: plant.scientificName,
                plantId: plant.id,
                corrected: true,
              });
            } else if (kind === 'rec' && recIndex !== undefined) {
              // whyItWorks/whenToBuy/howToPlant/care were AI-authored narrative text
              // about the *previous* plant — clear them so the card doesn't describe
              // a species it no longer shows.
              onUpdateRecommendation(recIndex, {
                plantId: plant.id,
                commonName: plant.commonName,
                scientificName: plant.scientificName,
                type: plant.type,
                height: plant.height,
                spread: plant.spread,
                sunRequirements: plant.sunRequirements,
                soilType: plant.soilType,
                waterRequirements: plant.waterRequirements,
                bloomTime: plant.bloomTime,
                bloomColor: plant.bloomColor,
                wildlifeValue: plant.wildlifeValue,
                whyItWorks: 'Swapped in by you to replace the AI\'s original suggestion.',
                whenToBuy: 'Best planted in spring or fall while dormant.',
                howToPlant: plant.careTips || 'Follow standard planting depth and spacing for this species.',
                care: plant.careTips || '',
              });
            }
            setEditingKey(null);
          }}
          onClose={closeAll}
        />
      </div>
    );
  };

  return (
    <div>
      <div ref={mapRef} className="relative w-full aspect-[4/3] rounded-2xl border border-gray-200 shadow-inner" onClick={closeAll}>
        {/* Decorative background — clipped separately so hover/click popovers can escape the frame */}
        <div className="absolute inset-0 bg-gradient-to-b from-lime-100 via-green-100 to-green-200 rounded-2xl overflow-hidden pointer-events-none">
          {/* Property border */}
          <div className="absolute inset-2 border-2 border-dashed border-green-900/10 rounded-lg" />

          {/* House */}
          <div className="absolute top-0 h-[17%]" style={{ left: `${house.xStart}%`, width: `${houseWidth}%` }}>
            {/* roof */}
            <div
              className="absolute -top-[9%] w-0 h-0"
              style={{
                left: '50%',
                transform: 'translateX(-50%)',
                borderLeft: `${roofHalfWidthPct}% solid transparent`,
                borderRight: `${roofHalfWidthPct}% solid transparent`,
                borderBottom: '9% solid #78716c',
              }}
            />
            {/* walls */}
            <div className="absolute inset-0 bg-stone-300 border-b-2 border-stone-400 shadow-sm flex items-end justify-center pb-1">
              <span className="text-[10px] font-semibold text-stone-600 tracking-wide">HOUSE</span>
            </div>
            {/* door */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[8%] h-[45%] bg-stone-500 rounded-t-sm" />
          </div>

          {/* Walkway */}
          <div
            className="absolute top-[17%] bottom-0 w-[7%] bg-stone-200 border-x border-stone-300/60"
            style={{ left: `${houseCenter}%`, transform: 'translateX(-50%)' }}
          />

          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 tracking-wide">
            STREET / FRONT
          </div>
        </div>

        {/* Leader lines connecting markers to their (possibly offset) labels */}
        <LeaderLines markers={allMarkers} layout={layout} />

        {/* Existing plants */}
        {existingPlantsMap.map((p, i) => {
          const key = `existing-${i}`;
          const l = layout.get(key) ?? { x: p.x, y: p.y + 6 };
          return (
            <div key={key}>
              <button
                type="button"
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-stone-400 border-2 border-white shadow-md flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-forest-400 transition-shadow touch-none cursor-grab active:cursor-grabbing ${draggingKey === key ? 'ring-2 ring-forest-500 scale-110 z-20' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={handleMarkerClick(key)}
                onPointerDown={handleMarkerPointerDown(key)}
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={handleMarkerPointerUp}
                {...markerHoverHandlers(key)}
              >
                {p.plantId
                  ? <PlantImage plantId={p.plantId} commonName={p.label} className="w-7 h-7 object-cover" />
                  : <TreePine className="w-3.5 h-3.5 text-white" />}
              </button>
              {p.corrected && (
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-forest-600 border border-white flex items-center justify-center pointer-events-none"
                  style={{ left: `calc(${p.x}% + 10px)`, top: `calc(${p.y}% - 10px)` }}
                >
                  <Check className="w-2 h-2 text-white" />
                </span>
              )}
              <button
                type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-normal leading-tight text-[10px] bg-white/95 border border-gray-200 rounded-md px-1.5 py-1 shadow-sm text-gray-700 max-w-[110px] text-center hover:border-forest-400 hover:shadow-md transition-all"
                style={{ left: `${l.x}%`, top: `${l.y}%` }}
                onClick={e => { e.stopPropagation(); setPinnedKey(k => (k === key ? null : key)); setEditingKey(null); }}
                {...markerHoverHandlers(key)}
              >
                {p.label}
              </button>
              {renderPopover(key, l.x, l.y, 'existing', i, undefined)}
            </div>
          );
        })}

        {/* Recommended plants */}
        {recommendations.map((r, i) => {
          const key = `rec-${i}`;
          const l = layout.get(key) ?? { x: r.x, y: r.y + 6 };
          return (
            <div key={key}>
              <button
                type="button"
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 border-white shadow-md overflow-hidden bg-forest-100 hover:ring-2 hover:ring-forest-400 transition-shadow touch-none cursor-grab active:cursor-grabbing ${draggingKey === key ? 'ring-2 ring-forest-500 scale-110 z-20' : ''}`}
                style={{ left: `${r.x}%`, top: `${r.y}%` }}
                onClick={handleMarkerClick(key)}
                onPointerDown={handleMarkerPointerDown(key)}
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={handleMarkerPointerUp}
                {...markerHoverHandlers(key)}
              >
                <PlantImage plantId={r.plantId} commonName={r.commonName} className="w-9 h-9 object-cover" />
              </button>
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-forest-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white shadow pointer-events-none"
                style={{ left: `calc(${r.x}% + 14px)`, top: `calc(${r.y}% - 14px)` }}
              >
                {i + 1}
              </span>
              <button
                type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-normal leading-tight text-[10px] bg-white/95 border border-forest-200 rounded-md px-1.5 py-1 shadow-sm text-forest-700 font-medium max-w-[110px] text-center hover:border-forest-400 hover:shadow-md transition-all"
                style={{ left: `${l.x}%`, top: `${l.y}%` }}
                onClick={e => { e.stopPropagation(); setPinnedKey(k => (k === key ? null : key)); setEditingKey(null); }}
                {...markerHoverHandlers(key)}
              >
                {r.commonName}
              </button>
              {renderPopover(key, l.x, l.y, 'rec', undefined, i)}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-stone-400 inline-flex items-center justify-center border-2 border-white shadow">
            <TreePine className="w-2.5 h-2.5 text-white" />
          </span>
          Existing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-forest-600 inline-flex items-center justify-center text-white text-[9px] font-bold border-2 border-white shadow">1</span>
          Recommended (numbered to match list below)
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Approximate layout based on the AI's interpretation of the photo — not to scale or surveyed.
        Hover a marker for details, click to keep it open, drag a marker to reposition it, and use "Correct ID" if a plant was misidentified.
      </p>
    </div>
  );
}

export function StructuredAnalysisView({
  data,
  onChange,
  footer,
}: {
  data: StructuredAnalysis;
  onChange: (updater: (prev: StructuredAnalysis) => StructuredAnalysis) => void;
  footer?: React.ReactNode;
}) {
  const updateExisting = (index: number, patch: Partial<ExistingPlantMapItem>) => {
    onChange(prev => ({
      ...prev,
      existingPlantsMap: prev.existingPlantsMap.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };
  const updateRecommendation = (index: number, patch: Partial<PlantRecommendation>) => {
    onChange(prev => ({
      ...prev,
      recommendations: prev.recommendations.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };
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
      {(data.existingPlantsMap?.length > 0 || data.recommendations?.length > 0) && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-forest-600" />
            Yard Map
          </h3>
          <YardMapView
            existingPlantsMap={data.existingPlantsMap || []}
            recommendations={data.recommendations || []}
            house={data.house || { xStart: 25, xEnd: 75 }}
            onUpdateExisting={updateExisting}
            onUpdateRecommendation={updateRecommendation}
          />
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
              <div key={i} className="relative border border-gray-200 rounded-xl overflow-hidden bg-white">
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-forest-600 text-white text-xs font-bold flex items-center justify-center border-2 border-white shadow-md z-10">
                  {i + 1}
                </div>
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
      {footer}
    </div>
  );
}
