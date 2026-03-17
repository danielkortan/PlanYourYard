import { useState, useRef, useCallback, useEffect, PointerEvent } from 'react';
import toast from 'react-hot-toast';
import {
  Grid3X3, MousePointer2, Pencil, Home, Trees, Flower2, Type, Trash2,
  Save, RotateCcw, ZoomIn, ZoomOut, Download, Eye, EyeOff, Move,
  Square, Circle, Minus, ChevronDown, X, Tag,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ElementType = 'property' | 'structure' | 'path' | 'tree' | 'plant' | 'label';
type StructureKind = 'house' | 'garage' | 'deck' | 'patio' | 'driveway' | 'pool' | 'fence' | 'shed' | 'other';
type ToolType = 'select' | 'property' | 'structure' | 'path' | 'tree' | 'plant' | 'label';

interface Pt { x: number; y: number }

interface DesignElement {
  id: string;
  type: ElementType;
  // polygons / polylines
  points?: Pt[];
  // circles (tree/plant)
  cx?: number;
  cy?: number;
  radius?: number;
  // text labels
  tx?: number;
  ty?: number;
  text?: string;
  // meta
  label?: string;
  structureKind?: StructureKind;
  color?: string;
  fill?: string;
  opacity?: number;
}

interface YardDesign {
  elements: DesignElement[];
  gridEnabled: boolean;
  gridSize: number;   // feet per major grid cell
  canvasWidthFt: number;
  canvasHeightFt: number;
  pixelsPerFoot: number;
}

const STORAGE_KEY = 'pyyYardDesign';

const STRUCTURE_COLORS: Record<StructureKind, { stroke: string; fill: string }> = {
  house:    { stroke: '#78350f', fill: '#fef3c7' },
  garage:   { stroke: '#374151', fill: '#e5e7eb' },
  deck:     { stroke: '#92400e', fill: '#fde68a' },
  patio:    { stroke: '#6b7280', fill: '#f3f4f6' },
  driveway: { stroke: '#4b5563', fill: '#d1d5db' },
  pool:     { stroke: '#0369a1', fill: '#bae6fd' },
  fence:    { stroke: '#6b7280', fill: 'none' },
  shed:     { stroke: '#065f46', fill: '#d1fae5' },
  other:    { stroke: '#7c3aed', fill: '#ede9fe' },
};

const STRUCTURE_LABELS: Record<StructureKind, string> = {
  house: 'House', garage: 'Garage', deck: 'Deck', patio: 'Patio',
  driveway: 'Driveway', pool: 'Pool', fence: 'Fence', shed: 'Shed', other: 'Other',
};

const defaultDesign = (): YardDesign => ({
  elements: [],
  gridEnabled: true,
  gridSize: 10,
  canvasWidthFt: 120,
  canvasHeightFt: 100,
  pixelsPerFoot: 8,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadDesign(): YardDesign {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultDesign(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultDesign();
}

function saveDesign(d: YardDesign) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function ptsToD(pts: Pt[], close = true) {
  if (pts.length < 2) return '';
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return close ? d + ' Z' : d;
}

// ─── Grid Layer ───────────────────────────────────────────────────────────────

function GridLayer({ widthPx, heightPx, pxPerFt, gridSize }: {
  widthPx: number; heightPx: number; pxPerFt: number; gridSize: number;
}) {
  const minorPx = pxPerFt;     // 1 ft minor
  const majorPx = pxPerFt * gridSize;
  const lines: React.ReactElement[] = [];

  for (let x = 0; x <= widthPx; x += minorPx) {
    const major = Math.abs(x % majorPx) < 0.5;
    lines.push(
      <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={heightPx}
        stroke={major ? '#94a3b8' : '#e2e8f0'} strokeWidth={major ? 0.8 : 0.4} />
    );
  }
  for (let y = 0; y <= heightPx; y += minorPx) {
    const major = Math.abs(y % majorPx) < 0.5;
    lines.push(
      <line key={`hy${y}`} x1={0} y1={y} x2={widthPx} y2={y}
        stroke={major ? '#94a3b8' : '#e2e8f0'} strokeWidth={major ? 0.8 : 0.4} />
    );
  }

  // Major grid labels (ft)
  const labels: React.ReactElement[] = [];
  for (let x = majorPx; x < widthPx; x += majorPx) {
    labels.push(
      <text key={`lx${x}`} x={x} y={10} textAnchor="middle"
        fontSize={8} fill="#94a3b8" fontFamily="monospace">
        {Math.round(x / pxPerFt)}ft
      </text>
    );
  }
  for (let y = majorPx; y < heightPx; y += majorPx) {
    labels.push(
      <text key={`ly${y}`} x={8} y={y} textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fill="#94a3b8" fontFamily="monospace">
        {Math.round(y / pxPerFt)}ft
      </text>
    );
  }

  return <g className="grid-layer" style={{ pointerEvents: 'none' }}>{lines}{labels}</g>;
}

// ─── Element renderer ─────────────────────────────────────────────────────────

function ElementShape({
  el, selected, onPointerDown,
}: {
  el: DesignElement;
  selected: boolean;
  onPointerDown: (e: PointerEvent<SVGElement>, id: string) => void;
}) {
  const selStyle = selected ? { filter: 'drop-shadow(0 0 4px #3b82f6)' } : {};

  if ((el.type === 'property' || el.type === 'path') && el.points && el.points.length >= 2) {
    const closed = el.type === 'property' && el.points.length >= 3;
    return (
      <path
        d={ptsToD(el.points, closed)}
        stroke={el.color || (el.type === 'property' ? '#1e3a5f' : '#6b7280')}
        strokeWidth={el.type === 'property' ? 3 : 1.5}
        strokeDasharray={el.type === 'path' ? '6,3' : undefined}
        fill={closed ? (el.fill || 'rgba(34,197,94,0.07)') : 'none'}
        style={{ cursor: 'move', ...selStyle }}
        onPointerDown={e => onPointerDown(e, el.id)}
      />
    );
  }

  if (el.type === 'structure' && el.points && el.points.length >= 2) {
    const sk = el.structureKind || 'other';
    const { stroke, fill } = STRUCTURE_COLORS[sk];
    return (
      <g style={selStyle} onPointerDown={e => onPointerDown(e, el.id)}>
        <path
          d={ptsToD(el.points, true)}
          stroke={el.color || stroke}
          strokeWidth={2}
          fill={el.fill || fill}
          fillOpacity={el.opacity ?? 0.85}
          style={{ cursor: 'move' }}
        />
        {el.label && el.points.length >= 3 && (
          <text
            x={el.points.reduce((s, p) => s + p.x, 0) / el.points.length}
            y={el.points.reduce((s, p) => s + p.y, 0) / el.points.length}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fontWeight="600" fill={stroke} style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {el.label}
          </text>
        )}
      </g>
    );
  }

  if ((el.type === 'tree' || el.type === 'plant') && el.cx !== undefined && el.cy !== undefined) {
    const r = el.radius || (el.type === 'tree' ? 16 : 8);
    const color = el.color || (el.type === 'tree' ? '#15803d' : '#84cc16');
    return (
      <g style={selStyle} onPointerDown={e => onPointerDown(e, el.id)}>
        <circle cx={el.cx} cy={el.cy} r={r} fill={color} fillOpacity={0.35}
          stroke={color} strokeWidth={1.5} style={{ cursor: 'move' }} />
        <circle cx={el.cx} cy={el.cy} r={3} fill={color} />
        {el.label && (
          <text x={el.cx} y={el.cy + r + 10} textAnchor="middle"
            fontSize={9} fill="#374151" style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {el.label}
          </text>
        )}
      </g>
    );
  }

  if (el.type === 'label' && el.tx !== undefined && el.ty !== undefined) {
    return (
      <text
        x={el.tx} y={el.ty}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={13} fontWeight="600" fill={el.color || '#1e293b'}
        style={{ cursor: 'move', userSelect: 'none', ...selStyle }}
        onPointerDown={e => onPointerDown(e, el.id)}
      >
        {el.text || 'Label'}
      </text>
    );
  }

  return null;
}

// ─── Tool options panels ───────────────────────────────────────────────────────

function StructurePanel({ onSelect }: { onSelect: (k: StructureKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
        <button
          key={k}
          onClick={() => onSelect(k)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:border-forest-400 hover:bg-forest-50 transition text-left font-medium text-gray-700"
        >
          {STRUCTURE_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

// ─── Label dialog ─────────────────────────────────────────────────────────────

function LabelDialog({ initial, onSave, onCancel }: {
  initial?: string; onSave: (text: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(initial || '');
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="font-semibold text-gray-900 mb-3">Enter Label Text</h3>
        <input
          autoFocus
          className="input w-full mb-4"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
          placeholder="e.g. Back Yard, Flower Bed…"
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 btn-secondary text-sm justify-center">Cancel</button>
          <button onClick={() => onSave(val)} className="flex-1 btn-primary text-sm justify-center">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Properties panel (right side, for selected element) ─────────────────────

function PropertiesPanel({ el, onChange, onDelete }: {
  el: DesignElement;
  onChange: (updated: Partial<DesignElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Properties</span>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 transition">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {(el.type === 'structure') && (
        <div>
          <label className="label text-xs">Structure Type</label>
          <select
            className="select text-sm w-full"
            value={el.structureKind || 'other'}
            onChange={e => onChange({ structureKind: e.target.value as StructureKind, label: STRUCTURE_LABELS[e.target.value as StructureKind] })}
          >
            {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
              <option key={k} value={k}>{STRUCTURE_LABELS[k]}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label text-xs">Label</label>
        <input
          className="input text-sm w-full"
          value={el.label || el.text || ''}
          onChange={e => onChange(el.type === 'label' ? { text: e.target.value } : { label: e.target.value })}
          placeholder="Label…"
        />
      </div>

      {(el.type === 'tree' || el.type === 'plant') && (
        <div>
          <label className="label text-xs">Canopy Radius (px)</label>
          <input
            type="range" min={4} max={80}
            value={el.radius || (el.type === 'tree' ? 16 : 8)}
            onChange={e => onChange({ radius: Number(e.target.value) })}
            className="w-full accent-forest-600"
          />
          <span className="text-xs text-gray-500">{el.radius || (el.type === 'tree' ? 16 : 8)}px ≈ {Math.round((el.radius || (el.type === 'tree' ? 16 : 8)) / 8)} ft radius</span>
        </div>
      )}

      <div>
        <label className="label text-xs">Color</label>
        <input
          type="color"
          value={el.color || '#1e3a5f'}
          onChange={e => onChange({ color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer border border-gray-200"
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TOOLS: { id: ToolType; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: 'select',    label: 'Select / Move', icon: MousePointer2, desc: 'Click to select, drag to move' },
  { id: 'property',  label: 'Property Lines', icon: Square,       desc: 'Draw outer boundary of your yard' },
  { id: 'structure', label: 'Structure',      icon: Home,         desc: 'House, deck, driveway, etc.' },
  { id: 'path',      label: 'Path / Fence',   icon: Minus,        desc: 'Draw walkways, fences, edges' },
  { id: 'tree',      label: 'Tree',           icon: Trees,        desc: 'Place a tree (draggable canopy)' },
  { id: 'plant',     label: 'Plant / Shrub',  icon: Flower2,      desc: 'Place a plant or shrub' },
  { id: 'label',     label: 'Label',          icon: Tag,          desc: 'Add a text label anywhere' },
];

export default function YardDesignerPage() {
  const [design, setDesign] = useState<YardDesign>(loadDesign);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [pendingStructureKind, setPendingStructureKind] = useState<StructureKind | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Pt[]>([]);
  const [mousePos, setMousePos] = useState<Pt>({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [pendingLabelPos, setPendingLabelPos] = useState<Pt | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showStructureMenu, setShowStructureMenu] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origEl: DesignElement } | null>(null);

  const widthPx = design.canvasWidthFt * design.pixelsPerFoot;
  const heightPx = design.canvasHeightFt * design.pixelsPerFoot;

  // ── Persistence ──
  const save = useCallback((d: YardDesign) => {
    saveDesign(d);
    setDesign(d);
  }, []);

  const handleSave = () => {
    saveDesign(design);
    toast.success('Yard design saved!');
  };

  const handleClear = () => {
    if (!confirm('Clear all elements? This cannot be undone.')) return;
    const fresh = defaultDesign();
    save(fresh);
    setSelectedId(null);
    setDrawingPoints([]);
    toast('Canvas cleared');
  };

  // ── Grid toggle ──
  const toggleGrid = () => {
    const updated = { ...design, gridEnabled: !design.gridEnabled };
    save(updated);
  };

  // ── SVG coordinate helper ──
  const getSvgPt = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  }, [zoom]);

  // ── Pointer move (preview line while drawing) ──
  const handleSvgPointerMove = useCallback((e: PointerEvent<SVGSVGElement>) => {
    setMousePos(getSvgPt(e));

    // Drag-move selected element
    if (draggingRef.current) {
      const { id, startX, startY, origEl } = draggingRef.current;
      const cur = getSvgPt(e);
      const dx = cur.x - startX;
      const dy = cur.y - startY;

      setDesign(prev => ({
        ...prev,
        elements: prev.elements.map(el => {
          if (el.id !== id) return el;
          if (el.points) return { ...el, points: origEl.points!.map(p => ({ x: p.x + dx, y: p.y + dy })) };
          if (el.cx !== undefined) return { ...el, cx: (origEl.cx || 0) + dx, cy: (origEl.cy || 0) + dy };
          if (el.tx !== undefined) return { ...el, tx: (origEl.tx || 0) + dx, ty: (origEl.ty || 0) + dy };
          return el;
        }),
      }));
    }
  }, [getSvgPt]);

  // ── Click on canvas ──
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingRef.current) return; // was a drag, not a click
    const pt = getSvgPt(e);

    if (activeTool === 'select') {
      setSelectedId(null);
      return;
    }

    if (activeTool === 'tree' || activeTool === 'plant') {
      const el: DesignElement = {
        id: uid(),
        type: activeTool,
        cx: pt.x, cy: pt.y,
        radius: activeTool === 'tree' ? 16 : 8,
        label: activeTool === 'tree' ? 'Tree' : 'Plant',
        color: activeTool === 'tree' ? '#15803d' : '#84cc16',
      };
      const updated = { ...design, elements: [...design.elements, el] };
      save(updated);
      setSelectedId(el.id);
      return;
    }

    if (activeTool === 'label') {
      setPendingLabelPos(pt);
      setShowLabelDialog(true);
      return;
    }

    // polygon drawing tools
    if (['property', 'structure', 'path'].includes(activeTool)) {
      if (activeTool === 'structure' && !pendingStructureKind) {
        setShowStructureMenu(true);
        return;
      }
      setDrawingPoints(prev => [...prev, pt]);
    }
  }, [activeTool, design, getSvgPt, pendingStructureKind, save]);

  // Double-click to finish polygon
  const handleSvgDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (drawingPoints.length < 2) return;
    const finalPts = drawingPoints.slice(0, -1); // remove last dup from dblclick
    if (finalPts.length < 2) return;

    let el: DesignElement;
    if (activeTool === 'property') {
      el = { id: uid(), type: 'property', points: finalPts, color: '#1e3a5f', fill: 'rgba(34,197,94,0.06)' };
    } else if (activeTool === 'path') {
      el = { id: uid(), type: 'path', points: finalPts, color: '#6b7280' };
    } else {
      const sk = pendingStructureKind || 'other';
      const { stroke, fill } = STRUCTURE_COLORS[sk];
      el = { id: uid(), type: 'structure', points: finalPts, structureKind: sk, label: STRUCTURE_LABELS[sk], color: stroke, fill };
    }

    const updated = { ...design, elements: [...design.elements, el] };
    save(updated);
    setDrawingPoints([]);
    setSelectedId(el.id);
    if (activeTool === 'structure') setPendingStructureKind(null);
  }, [activeTool, design, drawingPoints, pendingStructureKind, save]);

  // ── Drag start on element ──
  const handleElementPointerDown = useCallback((e: PointerEvent<SVGElement>, id: string) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    const pt = getSvgPt(e);
    const el = design.elements.find(x => x.id === id);
    if (!el) return;
    draggingRef.current = { id, startX: pt.x, startY: pt.y, origEl: { ...el, points: el.points ? [...el.points] : undefined } };
    setSelectedId(id);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, [activeTool, design.elements, getSvgPt]);

  const handleSvgPointerUp = useCallback(() => {
    if (draggingRef.current) {
      // persist final position
      saveDesign(design);
      draggingRef.current = null;
    }
  }, [design]);

  // ── Label dialog submit ──
  const handleLabelSave = (text: string) => {
    if (!pendingLabelPos) return;
    const el: DesignElement = { id: uid(), type: 'label', tx: pendingLabelPos.x, ty: pendingLabelPos.y, text, color: '#1e293b' };
    const updated = { ...design, elements: [...design.elements, el] };
    save(updated);
    setSelectedId(el.id);
    setShowLabelDialog(false);
    setPendingLabelPos(null);
  };

  // ── Update selected element ──
  const updateSelected = (partial: Partial<DesignElement>) => {
    setDesign(prev => {
      const updated = {
        ...prev,
        elements: prev.elements.map(el => el.id === selectedId ? { ...el, ...partial } : el),
      };
      saveDesign(updated);
      return updated;
    });
  };

  const deleteSelected = () => {
    setDesign(prev => {
      const updated = { ...prev, elements: prev.elements.filter(el => el.id !== selectedId) };
      saveDesign(updated);
      return updated;
    });
    setSelectedId(null);
  };

  // ── Export SVG ──
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'yard-design.svg'; a.click();
    URL.revokeObjectURL(url);
    toast.success('SVG exported!');
  };

  const selectedEl = design.elements.find(el => el.id === selectedId) || null;

  // cursor
  const cursorMap: Record<ToolType, string> = {
    select: 'default', property: 'crosshair', structure: 'crosshair',
    path: 'crosshair', tree: 'cell', plant: 'cell', label: 'text',
  };

  // drawing preview polygon/line
  const previewPts = drawingPoints.length > 0 ? [...drawingPoints, mousePos] : [];

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawingPoints([]); setPendingStructureKind(null); setActiveTool('select'); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId && document.activeElement?.tagName !== 'INPUT') deleteSelected(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-100">
      {/* ── Left: Canvas area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 flex-wrap">
          <span className="text-sm font-semibold text-gray-700 mr-1">Yard Designer</span>

          {/* Zoom */}
          <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Grid toggle */}
          <button
            onClick={toggleGrid}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              design.gridEnabled
                ? 'bg-forest-50 border-forest-300 text-forest-700'
                : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}
            title="Toggle grid"
          >
            <Grid3X3 className="w-4 h-4" />
            Grid {design.gridEnabled ? 'On' : 'Off'}
          </button>

          {/* Grid size */}
          {design.gridEnabled && (
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
              value={design.gridSize}
              onChange={e => save({ ...design, gridSize: Number(e.target.value) })}
            >
              <option value={5}>5 ft grid</option>
              <option value={10}>10 ft grid</option>
              <option value={20}>20 ft grid</option>
            </select>
          )}

          <div className="flex-1" />

          {/* Undo / Clear */}
          <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 border border-red-200 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>

          {/* Export */}
          <button onClick={exportSvg} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export SVG
          </button>

          {/* Save */}
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-forest-600 hover:bg-forest-700 text-white border border-forest-700 transition-colors">
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>

        {/* Instructions banner */}
        {activeTool !== 'select' && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-700 flex items-center gap-2 shrink-0">
            {activeTool === 'tree' || activeTool === 'plant'
              ? `Click on the canvas to place a ${activeTool}. Switch to Select tool to drag it.`
              : activeTool === 'label'
              ? 'Click where you want to add a label.'
              : activeTool === 'structure' && !pendingStructureKind
              ? 'Choose a structure type from the right panel, then click to start drawing.'
              : `Click to add points. Double-click to finish the ${activeTool === 'property' ? 'property boundary' : activeTool === 'path' ? 'path/fence' : (pendingStructureKind ? STRUCTURE_LABELS[pendingStructureKind] : 'structure')}. Press Esc to cancel.`}
          </div>
        )}

        {/* SVG Canvas */}
        <div className="flex-1 overflow-auto bg-gray-200 p-4">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'inline-block' }}>
            <svg
              ref={svgRef}
              width={widthPx}
              height={heightPx}
              style={{
                background: '#f8fafc',
                border: '2px solid #cbd5e1',
                borderRadius: 4,
                cursor: cursorMap[activeTool],
                display: 'block',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
              }}
              onClick={handleSvgClick}
              onDoubleClick={handleSvgDblClick}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
            >
              {/* Grid */}
              {design.gridEnabled && (
                <GridLayer widthPx={widthPx} heightPx={heightPx} pxPerFt={design.pixelsPerFoot} gridSize={design.gridSize} />
              )}

              {/* Canvas border label */}
              <text x={widthPx / 2} y={heightPx - 6} textAnchor="middle" fontSize={9} fill="#94a3b8" fontFamily="monospace">
                {design.canvasWidthFt} ft × {design.canvasHeightFt} ft
              </text>

              {/* Elements */}
              {design.elements.map(el => (
                <ElementShape key={el.id} el={el} selected={el.id === selectedId} onPointerDown={handleElementPointerDown} />
              ))}

              {/* Drawing preview */}
              {previewPts.length >= 2 && (
                <path
                  d={ptsToD(previewPts, false)}
                  stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5,3"
                  fill="none" style={{ pointerEvents: 'none' }}
                />
              )}
              {drawingPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="#3b82f6" style={{ pointerEvents: 'none' }} />
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* ── Right: Tool Panel ── */}
      <div className="w-64 bg-white border-l border-gray-200 flex flex-col overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-gray-100 bg-forest-800 text-white">
          <h2 className="font-semibold text-sm">Tools</h2>
          <p className="text-xs text-forest-200 mt-0.5">Select a tool, then draw on the canvas</p>
        </div>

        <div className="p-3 space-y-1">
          {TOOLS.map(tool => (
            <div key={tool.id}>
              <button
                onClick={() => {
                  setActiveTool(tool.id);
                  setDrawingPoints([]);
                  if (tool.id !== 'structure') setPendingStructureKind(null);
                  if (tool.id === 'structure') setShowStructureMenu(s => !s);
                  else setShowStructureMenu(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  activeTool === tool.id
                    ? 'bg-forest-600 text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <tool.icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium leading-tight">{tool.label}</div>
                  <div className={`text-xs leading-tight truncate ${activeTool === tool.id ? 'text-forest-200' : 'text-gray-400'}`}>{tool.desc}</div>
                </div>
                {tool.id === 'structure' && (
                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showStructureMenu ? 'rotate-180' : ''}`} />
                )}
              </button>

              {/* Structure sub-menu */}
              {tool.id === 'structure' && showStructureMenu && (
                <div className="ml-3 mt-1 p-2 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1.5">Choose type, then draw on canvas:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
                      <button
                        key={k}
                        onClick={() => { setPendingStructureKind(k); setShowStructureMenu(false); }}
                        className={`text-xs px-2 py-1.5 rounded-lg border transition text-left font-medium ${
                          pendingStructureKind === k
                            ? 'border-forest-400 bg-forest-50 text-forest-700'
                            : 'border-gray-200 hover:border-forest-300 hover:bg-forest-50 text-gray-700'
                        }`}
                      >
                        {STRUCTURE_LABELS[k]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Selected element props */}
        {selectedEl && (
          <div className="px-3 pb-3 border-t border-gray-100 mt-2 pt-3">
            <PropertiesPanel el={selectedEl} onChange={updateSelected} onDelete={deleteSelected} />
          </div>
        )}

        {/* Legend */}
        <div className="mt-auto p-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Legend</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-4 h-0.5 bg-blue-800 rounded" />Property line
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-800" />Structure
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-3 h-3 rounded-full bg-green-600/30 border border-green-700" />Tree
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-3 h-3 rounded-full bg-lime-400/30 border border-lime-600" />Plant / shrub
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-4 border-b border-dashed border-gray-500" />Path / fence
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Double-click to finish drawing a shape. Press <kbd className="bg-gray-200 px-1 rounded">Esc</kbd> to cancel. <kbd className="bg-gray-200 px-1 rounded">Del</kbd> to delete selected.
          </p>
        </div>
      </div>

      {/* Label dialog */}
      {showLabelDialog && (
        <LabelDialog
          onSave={handleLabelSave}
          onCancel={() => { setShowLabelDialog(false); setPendingLabelPos(null); }}
        />
      )}
    </div>
  );
}
