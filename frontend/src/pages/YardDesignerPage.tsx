import React, { useState, useRef, useCallback, useEffect, PointerEvent } from 'react';
import toast from 'react-hot-toast';
import {
  MousePointer2, Home, Trees, Flower2, Tag,
  Save, RotateCcw, ZoomIn, ZoomOut, Download,
  Square, Minus, Camera, X, ChevronRight,
  Grid3X3, Pencil,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ElementType = 'property' | 'structure' | 'path' | 'tree' | 'plant' | 'label';
type StructureKind = 'house' | 'garage' | 'deck' | 'patio' | 'driveway' | 'pool' | 'fence' | 'shed' | 'other';
type ToolType = 'select' | 'property' | 'structure' | 'path' | 'tree' | 'plant' | 'label';

interface Pt { x: number; y: number }

interface DesignElement {
  id: string;
  type: ElementType;
  points?: Pt[];
  cx?: number; cy?: number; radius?: number;
  tx?: number; ty?: number; text?: string;
  label?: string;
  structureKind?: StructureKind;
  color?: string;
  fill?: string;
  opacity?: number;
}

interface YardDesign {
  elements: DesignElement[];
  gridEnabled: boolean;
  gridSize: number;
  canvasWidthFt: number;
  canvasHeightFt: number;
  pixelsPerFoot: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pyyYardDesign';
const BG_STORAGE_KEY = 'pyyYardBackground';

// Google Maps-inspired palette
const G_BLUE    = '#1a73e8';
const G_BLUE_LT = '#e8f0fe';

const STRUCTURE_COLORS: Record<StructureKind, { stroke: string; fill: string }> = {
  house:    { stroke: '#5f4339', fill: '#fff8e1' },
  garage:   { stroke: '#455a64', fill: '#eceff1' },
  deck:     { stroke: '#795548', fill: '#fff3e0' },
  patio:    { stroke: '#607d8b', fill: '#f5f5f5' },
  driveway: { stroke: '#546e7a', fill: '#e0e0e0' },
  pool:     { stroke: '#0277bd', fill: '#e1f5fe' },
  fence:    { stroke: '#6d4c41', fill: 'none' },
  shed:     { stroke: '#2e7d32', fill: '#e8f5e9' },
  other:    { stroke: '#6a1b9a', fill: '#f3e5f5' },
};

const STRUCTURE_LABELS: Record<StructureKind, string> = {
  house: 'House', garage: 'Garage', deck: 'Deck', patio: 'Patio',
  driveway: 'Driveway', pool: 'Pool', fence: 'Fence', shed: 'Shed', other: 'Other',
};

const STRUCTURE_ICONS: Record<StructureKind, string> = {
  house: '🏠', garage: '🚗', deck: '🪵', patio: '⛱', driveway: '🛣',
  pool: '🏊', fence: '🪜', shed: '🏚', other: '📦',
};

const defaultDesign = (): YardDesign => ({
  elements: [],
  gridEnabled: true,
  gridSize: 10,
  canvasWidthFt: 120,
  canvasHeightFt: 100,
  pixelsPerFoot: 8,
});

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadDesign(): YardDesign {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultDesign(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultDesign();
}
function saveDesign(d: YardDesign) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }

function loadBackground(): string | null {
  try { return localStorage.getItem(BG_STORAGE_KEY); } catch { return null; }
}
function saveBackground(url: string | null) {
  try {
    if (url) localStorage.setItem(BG_STORAGE_KEY, url);
    else localStorage.removeItem(BG_STORAGE_KEY);
  } catch { /* quota exceeded – silently ignore */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function ptsToD(pts: Pt[], close = true) {
  if (pts.length < 2) return '';
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return close ? d + ' Z' : d;
}

function centroid(pts: Pt[]): Pt {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

// ─── Grid Layer ───────────────────────────────────────────────────────────────

function GridLayer({ widthPx, heightPx, pxPerFt, gridSize, overPhoto }: {
  widthPx: number; heightPx: number; pxPerFt: number; gridSize: number; overPhoto?: boolean;
}) {
  const minorPx = pxPerFt;
  const majorPx = pxPerFt * gridSize;
  const lines: React.ReactElement[] = [];

  const minorColor  = overPhoto ? 'rgba(255,255,255,0.15)' : '#e2e8f0';
  const majorColor  = overPhoto ? 'rgba(255,255,255,0.35)' : '#94a3b8';
  const labelColor  = overPhoto ? 'rgba(255,255,255,0.7)'  : '#94a3b8';
  const minorW = overPhoto ? 0.5 : 0.4;
  const majorW = overPhoto ? 1   : 0.8;

  for (let x = 0; x <= widthPx; x += minorPx) {
    const major = Math.abs(x % majorPx) < 0.5;
    lines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={heightPx}
      stroke={major ? majorColor : minorColor} strokeWidth={major ? majorW : minorW} />);
  }
  for (let y = 0; y <= heightPx; y += minorPx) {
    const major = Math.abs(y % majorPx) < 0.5;
    lines.push(<line key={`hy${y}`} x1={0} y1={y} x2={widthPx} y2={y}
      stroke={major ? majorColor : minorColor} strokeWidth={major ? majorW : minorW} />);
  }

  const labels: React.ReactElement[] = [];
  for (let x = majorPx; x < widthPx; x += majorPx) {
    labels.push(<text key={`lx${x}`} x={x} y={14} textAnchor="middle"
      fontSize={9} fill={labelColor} fontFamily="Google Sans, Roboto, sans-serif">
      {Math.round(x / pxPerFt)}ft
    </text>);
  }
  for (let y = majorPx; y < heightPx; y += majorPx) {
    labels.push(<text key={`ly${y}`} x={12} y={y} textAnchor="middle" dominantBaseline="middle"
      fontSize={9} fill={labelColor} fontFamily="Google Sans, Roboto, sans-serif">
      {Math.round(y / pxPerFt)}ft
    </text>);
  }

  return <g style={{ pointerEvents: 'none' }}>{lines}{labels}</g>;
}

// ─── Element Renderer ─────────────────────────────────────────────────────────

function ElementShape({ el, selected, onPointerDown }: {
  el: DesignElement; selected: boolean;
  onPointerDown: (e: PointerEvent<SVGElement>, id: string) => void;
}) {
  const selRing = selected
    ? { filter: 'drop-shadow(0 0 0 3px rgba(26,115,232,0.6)) drop-shadow(0 0 8px rgba(26,115,232,0.4))' }
    : {};

  if ((el.type === 'path') && el.points && el.points.length >= 2) {
    return (
      <path
        d={ptsToD(el.points, false)}
        stroke={el.color || '#78909c'}
        strokeWidth={2.5}
        strokeDasharray="8,5"
        strokeLinecap="round"
        fill="none"
        style={{ cursor: 'move', ...selRing }}
        onPointerDown={e => onPointerDown(e, el.id)}
      />
    );
  }

  if (el.type === 'structure' && el.points && el.points.length >= 2) {
    const sk = el.structureKind || 'other';
    const { stroke, fill } = STRUCTURE_COLORS[sk];
    const ctr = el.points.length >= 3 ? centroid(el.points) : null;
    return (
      <g style={selRing} onPointerDown={e => onPointerDown(e, el.id)}>
        <path
          d={ptsToD(el.points, true)}
          stroke={el.color || stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          fill={el.fill || fill}
          fillOpacity={el.opacity ?? 0.88}
          style={{ cursor: 'move' }}
        />
        {el.label && ctr && (
          <text
            x={ctr.x} y={ctr.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fontWeight="600"
            fill={stroke}
            style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Google Sans, Roboto, sans-serif' }}
          >
            {el.label}
          </text>
        )}
      </g>
    );
  }

  if ((el.type === 'tree' || el.type === 'plant') && el.cx !== undefined && el.cy !== undefined) {
    const r  = el.radius || (el.type === 'tree' ? 18 : 9);
    const isTree = el.type === 'tree';
    const color = el.color || (isTree ? '#2e7d32' : '#558b2f');
    return (
      <g style={selRing} onPointerDown={e => onPointerDown(e, el.id)}>
        {/* Shadow */}
        <ellipse cx={el.cx + 3} cy={el.cy + 4} rx={r * 0.9} ry={r * 0.6}
          fill="rgba(0,0,0,0.15)" style={{ pointerEvents: 'none' }} />
        {/* Canopy */}
        <circle cx={el.cx} cy={el.cy} r={r}
          fill={color} fillOpacity={isTree ? 0.45 : 0.55}
          stroke={color} strokeWidth={1.5}
          style={{ cursor: 'move' }} />
        {/* Inner highlight */}
        <circle cx={el.cx - r * 0.25} cy={el.cy - r * 0.25} r={r * 0.35}
          fill="rgba(255,255,255,0.2)" style={{ pointerEvents: 'none' }} />
        {/* Center dot */}
        <circle cx={el.cx} cy={el.cy} r={3} fill={color} />
        {el.label && (
          <text x={el.cx} y={el.cy + r + 12} textAnchor="middle"
            fontSize={10} fontWeight="500" fill="#1b5e20"
            style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Google Sans, Roboto, sans-serif' }}>
            {el.label}
          </text>
        )}
      </g>
    );
  }

  if (el.type === 'label' && el.tx !== undefined && el.ty !== undefined) {
    return (
      <g style={selRing} onPointerDown={e => onPointerDown(e, el.id)}>
        <rect
          x={el.tx - (el.text?.length || 5) * 4 - 6}
          y={el.ty - 10}
          width={(el.text?.length || 5) * 8 + 12}
          height={20}
          rx={4}
          fill="rgba(255,255,255,0.88)"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={1}
          style={{ cursor: 'move' }}
        />
        <text
          x={el.tx} y={el.ty}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={12} fontWeight="600" fill={el.color || '#202124'}
          style={{ cursor: 'move', userSelect: 'none', fontFamily: 'Google Sans, Roboto, sans-serif' }}
        >
          {el.text || 'Label'}
        </text>
      </g>
    );
  }

  return null;
}

// ─── Label Dialog ─────────────────────────────────────────────────────────────

function LabelDialog({ initial, onSave, onCancel }: {
  initial?: string; onSave: (text: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(initial || '');
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" style={{ fontFamily: 'Google Sans, Roboto, sans-serif' }}>
        <h3 className="font-medium text-gray-900 text-base mb-4">Add Label</h3>
        <input
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 mb-4"
          style={{ '--focus-ring-color': G_BLUE } as React.CSSProperties}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
          placeholder="e.g. Back Yard, Flower Bed…"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-blue-600 rounded-full hover:bg-blue-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(val)}
            className="px-4 py-2 text-sm font-medium text-white rounded-full transition-colors"
            style={{ background: G_BLUE }}>
            Add Label
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Floating Properties Panel ────────────────────────────────────────────────

function PropertiesPanel({ el, onChange, onDelete }: {
  el: DesignElement;
  onChange: (updated: Partial<DesignElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ fontFamily: 'Google Sans, Roboto, sans-serif' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-800">
          {el.type === 'property' ? 'Yard Border'
            : el.type === 'structure' ? (STRUCTURE_LABELS[el.structureKind || 'other'])
            : el.type === 'tree' ? 'Tree'
            : el.type === 'plant' ? 'Plant'
            : el.type === 'path' ? 'Path / Fence'
            : 'Label'}
        </span>
        <button onClick={onDelete}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-red-500 transition-colors"
          title="Delete">
          <X className="w-4 h-4" />
        </button>
      </div>

      {el.type === 'structure' && (
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">Type</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-800 bg-white"
            value={el.structureKind || 'other'}
            onChange={e => onChange({ structureKind: e.target.value as StructureKind, label: STRUCTURE_LABELS[e.target.value as StructureKind] })}
          >
            {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
              <option key={k} value={k}>{STRUCTURE_ICONS[k]} {STRUCTURE_LABELS[k]}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-gray-500 mb-1 block">Label</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800"
          value={el.label || el.text || ''}
          onChange={e => onChange(el.type === 'label' ? { text: e.target.value } : { label: e.target.value })}
          placeholder="Enter label…"
        />
      </div>

      {(el.type === 'tree' || el.type === 'plant') && (
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">
            Size — {Math.round((el.radius || (el.type === 'tree' ? 18 : 9)) / 8)} ft radius
          </label>
          <input
            type="range" min={4} max={80}
            value={el.radius || (el.type === 'tree' ? 18 : 9)}
            onChange={e => onChange({ radius: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: G_BLUE }}
          />
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500 mb-1 block">Color</label>
        <input
          type="color"
          value={el.color || '#1a73e8'}
          onChange={e => onChange({ color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer border border-gray-200"
        />
      </div>
    </div>
  );
}

// ─── Tooltip wrapper ──────────────────────────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group flex items-center justify-center">
      {children}
      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap
        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
      </div>
    </div>
  );
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: { id: ToolType; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; requiresBorder?: boolean }[] = [
  { id: 'select',    label: 'Select & Move',  icon: MousePointer2, desc: 'Click to select, drag to move' },
  { id: 'property',  label: 'Yard Border',     icon: Square,        desc: 'Draw the boundary of your yard' },
  { id: 'structure', label: 'Structure',       icon: Home,          desc: 'House, deck, driveway…', requiresBorder: true },
  { id: 'path',      label: 'Path / Fence',    icon: Minus,         desc: 'Walkways, fences, edges', requiresBorder: true },
  { id: 'tree',      label: 'Tree',            icon: Trees,         desc: 'Place a tree', requiresBorder: true },
  { id: 'plant',     label: 'Plant / Shrub',   icon: Flower2,       desc: 'Place a plant or shrub', requiresBorder: true },
  { id: 'label',     label: 'Label',           icon: Tag,           desc: 'Add a text label' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function YardDesignerPage() {
  const [design, setDesign]           = useState<YardDesign>(loadDesign);
  const [activeTool, setActiveTool]   = useState<ToolType>('select');
  const [pendingStructureKind, setPendingStructureKind] = useState<StructureKind | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Pt[]>([]);
  const [mousePos, setMousePos]       = useState<Pt>({ x: 0, y: 0 });
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [pendingLabelPos, setPendingLabelPos] = useState<Pt | null>(null);
  const [zoom, setZoom]               = useState(1);
  const [showStructureMenu, setShowStructureMenu] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(loadBackground);

  const svgRef       = useRef<SVGSVGElement>(null);
  const photoRef     = useRef<HTMLInputElement>(null);
  const draggingRef  = useRef<{ id: string; startX: number; startY: number; origEl: DesignElement } | null>(null);

  const widthPx  = design.canvasWidthFt  * design.pixelsPerFoot;
  const heightPx = design.canvasHeightFt * design.pixelsPerFoot;

  // Derived: most recently drawn yard border polygon
  const yardBorderEl  = [...design.elements].reverse().find(el => el.type === 'property') || null;
  const yardBorderPts = yardBorderEl?.points && yardBorderEl.points.length >= 3
    ? yardBorderEl.points : null;

  // ── Persistence ──
  const save = useCallback((d: YardDesign) => { saveDesign(d); setDesign(d); }, []);

  // ── Photo upload ──
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      setBackgroundImage(url);
      saveBackground(url);
      toast.success('Yard photo set as background');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeBackground = () => {
    setBackgroundImage(null);
    saveBackground(null);
    toast('Background photo removed');
  };

  // ── Grid toggle ──
  const toggleGrid = () => save({ ...design, gridEnabled: !design.gridEnabled });

  // ── SVG coordinate helper ──
  const getSvgPt = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top)  / zoom,
    };
  }, [zoom]);

  // ── Pointer move ──
  const handleSvgPointerMove = useCallback((e: PointerEvent<SVGSVGElement>) => {
    setMousePos(getSvgPt(e));
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
    if (draggingRef.current) return;
    const pt = getSvgPt(e);

    if (activeTool === 'select') { setSelectedId(null); return; }

    if (activeTool === 'tree' || activeTool === 'plant') {
      const isTree = activeTool === 'tree';
      const el: DesignElement = {
        id: uid(), type: activeTool,
        cx: pt.x, cy: pt.y,
        radius: isTree ? 18 : 9,
        label: isTree ? 'Tree' : 'Plant',
        color: isTree ? '#2e7d32' : '#558b2f',
      };
      save({ ...design, elements: [...design.elements, el] });
      setSelectedId(el.id);
      return;
    }

    if (activeTool === 'label') {
      setPendingLabelPos(pt);
      setShowLabelDialog(true);
      return;
    }

    if (['property', 'structure', 'path'].includes(activeTool)) {
      if (activeTool === 'structure' && !pendingStructureKind) {
        setShowStructureMenu(true);
        return;
      }
      setDrawingPoints(prev => [...prev, pt]);
    }
  }, [activeTool, design, getSvgPt, pendingStructureKind, save]);

  // ── Double-click to finish polygon ──
  const handleSvgDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (drawingPoints.length < 2) return;
    const finalPts = drawingPoints.slice(0, -1);
    if (finalPts.length < 2) return;

    let el: DesignElement;
    if (activeTool === 'property') {
      el = { id: uid(), type: 'property', points: finalPts, color: G_BLUE, fill: 'rgba(26,115,232,0.06)' };
    } else if (activeTool === 'path') {
      el = { id: uid(), type: 'path', points: finalPts, color: '#78909c' };
    } else {
      const sk = pendingStructureKind || 'other';
      const { stroke, fill } = STRUCTURE_COLORS[sk];
      el = { id: uid(), type: 'structure', points: finalPts, structureKind: sk, label: STRUCTURE_LABELS[sk], color: stroke, fill };
    }

    save({ ...design, elements: [...design.elements, el] });
    setDrawingPoints([]);
    setSelectedId(el.id);
    if (activeTool === 'structure') setPendingStructureKind(null);
    if (activeTool === 'property') {
      setActiveTool('select');
      toast.success('Yard border drawn! Now add structures, trees, and plants inside your yard.');
    }
  }, [activeTool, design, drawingPoints, pendingStructureKind, save]);

  // ── Element drag start ──
  const handleElementPointerDown = useCallback((e: PointerEvent<SVGElement>, id: string) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    const pt  = getSvgPt(e);
    const el  = design.elements.find(x => x.id === id);
    if (!el) return;
    draggingRef.current = { id, startX: pt.x, startY: pt.y, origEl: { ...el, points: el.points ? [...el.points] : undefined } };
    setSelectedId(id);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, [activeTool, design.elements, getSvgPt]);

  const handleSvgPointerUp = useCallback(() => {
    if (draggingRef.current) { saveDesign(design); draggingRef.current = null; }
  }, [design]);

  // ── Label submit ──
  const handleLabelSave = (text: string) => {
    if (!pendingLabelPos) return;
    const el: DesignElement = { id: uid(), type: 'label', tx: pendingLabelPos.x, ty: pendingLabelPos.y, text, color: '#202124' };
    save({ ...design, elements: [...design.elements, el] });
    setSelectedId(el.id);
    setShowLabelDialog(false);
    setPendingLabelPos(null);
  };

  // ── Update / delete selected element ──
  const updateSelected = (partial: Partial<DesignElement>) => {
    setDesign(prev => {
      const updated = { ...prev, elements: prev.elements.map(el => el.id === selectedId ? { ...el, ...partial } : el) };
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
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yard-design.svg';
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('SVG exported!');
  };

  // ── Clear ──
  const handleClear = () => {
    if (!confirm('Clear all elements? This cannot be undone.')) return;
    save(defaultDesign());
    setSelectedId(null);
    setDrawingPoints([]);
    toast('Canvas cleared');
  };

  // ── Save ──
  const handleSave = () => { saveDesign(design); toast.success('Design saved!'); };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawingPoints([]); setPendingStructureKind(null); setActiveTool('select'); setShowStructureMenu(false); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement?.tagName !== 'INPUT') deleteSelected();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const selectedEl = design.elements.find(el => el.id === selectedId) || null;

  const cursorMap: Record<ToolType, string> = {
    select: 'default', property: 'crosshair', structure: 'crosshair',
    path: 'crosshair', tree: 'cell', plant: 'cell', label: 'text',
  };

  const previewPts = drawingPoints.length > 0 ? [...drawingPoints, mousePos] : [];
  const isDrawing  = drawingPoints.length > 0;
  const hasYardBorder = yardBorderPts !== null;

  // Instruction text
  const instruction = activeTool === 'tree' || activeTool === 'plant'
    ? `Click inside your yard to place a ${activeTool}. Switch to Select to move it.`
    : activeTool === 'label'
    ? 'Click where you want to add a label.'
    : activeTool === 'property'
    ? isDrawing
      ? 'Keep clicking to add corners. Double-click to close the yard border.'
      : 'Click to place the first corner of your yard border.'
    : activeTool === 'structure' && !pendingStructureKind
    ? 'Choose a structure type from the panel, then draw on the yard.'
    : isDrawing
    ? `Click to add corners. Double-click to finish drawing ${pendingStructureKind ? STRUCTURE_LABELS[pendingStructureKind] : 'the shape'}.`
    : `Click inside your yard to start drawing. Double-click to finish.`;

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 4rem)', fontFamily: 'Google Sans, Roboto, system-ui, sans-serif' }}>
      {/* Hidden photo input */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* ── Main area ── */}
      <div className="relative flex-1 overflow-hidden" style={{ background: '#e8eaf6' }}>

        {/* ── Scrollable canvas ── */}
        <div className="absolute inset-0 overflow-auto">
          <div className="p-6 min-w-max">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'inline-block' }}>
              <svg
                ref={svgRef}
                width={widthPx}
                height={heightPx}
                style={{
                  cursor: cursorMap[activeTool],
                  display: 'block',
                  borderRadius: 8,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.15)',
                }}
                onClick={handleSvgClick}
                onDoubleClick={handleSvgDblClick}
                onPointerMove={handleSvgPointerMove}
                onPointerUp={handleSvgPointerUp}
              >
                <defs>
                  {yardBorderPts && (
                    <>
                      {/* Clip path = inside the yard */}
                      <clipPath id="yardClip">
                        <path d={ptsToD(yardBorderPts, true)} />
                      </clipPath>
                      {/* Mask to dim outside the yard */}
                      <mask id="outsideYardMask">
                        <rect width={widthPx} height={heightPx} fill="white" />
                        <path d={ptsToD(yardBorderPts, true)} fill="black" />
                      </mask>
                    </>
                  )}
                  {/* Subtle grass texture pattern (no photo) */}
                  {!backgroundImage && (
                    <pattern id="grassPattern" patternUnits="userSpaceOnUse" width="32" height="32">
                      <rect width="32" height="32" fill="#e8f5e9" />
                      <circle cx="8"  cy="8"  r="2" fill="#c8e6c9" opacity="0.6" />
                      <circle cx="24" cy="16" r="1.5" fill="#c8e6c9" opacity="0.5" />
                      <circle cx="16" cy="26" r="2" fill="#c8e6c9" opacity="0.6" />
                      <circle cx="4"  cy="22" r="1" fill="#a5d6a7" opacity="0.4" />
                      <circle cx="28" cy="6"  r="1" fill="#a5d6a7" opacity="0.4" />
                    </pattern>
                  )}
                </defs>

                {/* ── Background ── */}
                {backgroundImage ? (
                  <image
                    href={backgroundImage}
                    x={0} y={0}
                    width={widthPx} height={heightPx}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <rect width={widthPx} height={heightPx} fill="url(#grassPattern)" />
                )}

                {/* ── Outside-yard dimming overlay ── */}
                {yardBorderPts && (
                  <rect
                    width={widthPx} height={heightPx}
                    fill="rgba(0,0,0,0.48)"
                    mask="url(#outsideYardMask)"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* ── Yard interior content (clipped to border) ── */}
                <g clipPath={yardBorderPts ? 'url(#yardClip)' : undefined}>
                  {/* Grid */}
                  {design.gridEnabled && (
                    <GridLayer
                      widthPx={widthPx} heightPx={heightPx}
                      pxPerFt={design.pixelsPerFoot} gridSize={design.gridSize}
                      overPhoto={!!backgroundImage}
                    />
                  )}

                  {/* All non-property elements */}
                  {design.elements
                    .filter(el => el.type !== 'property')
                    .map(el => (
                      <ElementShape
                        key={el.id}
                        el={el}
                        selected={el.id === selectedId}
                        onPointerDown={handleElementPointerDown}
                      />
                    ))}
                </g>

                {/* ── Yard border (rendered on top, not clipped) ── */}
                {yardBorderEl && yardBorderPts && (
                  <g>
                    {/* Subtle blue tint fill */}
                    <path
                      d={ptsToD(yardBorderPts, true)}
                      fill="rgba(26,115,232,0.04)"
                      style={{ pointerEvents: 'none' }}
                    />
                    {/* Border stroke */}
                    <path
                      d={ptsToD(yardBorderPts, true)}
                      stroke={G_BLUE}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      fill="none"
                      style={{
                        cursor: activeTool === 'select' ? 'move' : undefined,
                        filter: 'drop-shadow(0 0 3px rgba(26,115,232,0.5))',
                      }}
                      onPointerDown={e => activeTool === 'select' && handleElementPointerDown(e, yardBorderEl.id)}
                    />
                    {/* Corner dots */}
                    {yardBorderPts.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x} cy={pt.y} r={5}
                        fill={G_BLUE} stroke="white" strokeWidth={2}
                        style={{ pointerEvents: 'none' }}
                      />
                    ))}
                  </g>
                )}

                {/* ── Drawing preview ── */}
                {previewPts.length >= 2 && (
                  <path
                    d={ptsToD(previewPts, false)}
                    stroke={G_BLUE} strokeWidth={2}
                    strokeDasharray="10,5" strokeLinecap="round"
                    fill="none" style={{ pointerEvents: 'none' }}
                  />
                )}
                {drawingPoints.map((p, i) => (
                  <g key={i} style={{ pointerEvents: 'none' }}>
                    <circle cx={p.x} cy={p.y} r={6} fill="rgba(26,115,232,0.15)" />
                    <circle cx={p.x} cy={p.y} r={4} fill={G_BLUE} stroke="white" strokeWidth={2} />
                  </g>
                ))}

                {/* Canvas size label (no photo only) */}
                {!backgroundImage && !yardBorderPts && (
                  <text x={widthPx / 2} y={heightPx - 8} textAnchor="middle"
                    fontSize={10} fill="#9e9e9e" fontFamily="Roboto Mono, monospace">
                    {design.canvasWidthFt} ft × {design.canvasHeightFt} ft canvas
                  </text>
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            FLOATING UI OVERLAYS
        ═══════════════════════════════════════════ */}

        {/* ── Top-left: Title chip ── */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="bg-white rounded-full px-4 py-2 flex items-center gap-2"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)', pointerEvents: 'auto' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: G_BLUE }}>
              <Pencil className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-800">Yard Designer</span>
          </div>
        </div>

        {/* ── Top-right: Action buttons ── */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Zoom */}
          <div className="bg-white rounded-xl overflow-hidden flex items-center divide-x divide-gray-100"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 text-gray-600 transition-colors"
              title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-medium text-gray-600 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 text-gray-600 transition-colors"
              title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Grid toggle */}
          <button
            onClick={toggleGrid}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{
              background: design.gridEnabled ? G_BLUE_LT : 'white',
              color: design.gridEnabled ? G_BLUE : '#5f6368',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
            title={`Grid ${design.gridEnabled ? 'on' : 'off'}`}>
            <Grid3X3 className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-300" />

          {/* Clear */}
          <button onClick={handleClear}
            className="h-9 px-3 bg-white rounded-xl flex items-center gap-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>

          {/* Export */}
          <button onClick={exportSvg}
            className="h-9 px-3 bg-white rounded-xl flex items-center gap-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          {/* Save */}
          <button onClick={handleSave}
            className="h-9 px-4 rounded-xl flex items-center gap-1.5 text-sm text-white font-medium transition-colors hover:opacity-90"
            style={{ background: G_BLUE, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>

        {/* ── Left: Floating tools panel ── */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-4 flex flex-col gap-1 rounded-2xl p-2"
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.3)', background: 'white' }}>

          {/* Photo upload */}
          <Tooltip label={backgroundImage ? 'Change Yard Photo' : 'Add Yard Photo'}>
            <button
              onClick={() => photoRef.current?.click()}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors relative"
              style={{
                background: backgroundImage ? '#e6f4ea' : undefined,
                color: backgroundImage ? '#34a853' : '#5f6368',
              }}
              onMouseEnter={e => { if (!backgroundImage) (e.currentTarget as HTMLElement).style.background = '#f1f3f4'; }}
              onMouseLeave={e => { if (!backgroundImage) (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              <Camera className="w-5 h-5" />
              {backgroundImage && (
                <button
                  onClick={e => { e.stopPropagation(); removeBackground(); }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full border border-gray-200 flex items-center justify-center hover:bg-red-50"
                  title="Remove photo">
                  <X className="w-2.5 h-2.5 text-gray-400" />
                </button>
              )}
            </button>
          </Tooltip>

          {/* Divider */}
          <div className="w-full h-px bg-gray-100 my-0.5" />

          {/* Tool buttons */}
          {TOOLS.map(tool => {
            const isActive   = activeTool === tool.id;
            const isDisabled = tool.requiresBorder && !hasYardBorder;
            return (
              <Tooltip key={tool.id} label={isDisabled ? `Draw your yard border first` : `${tool.label} — ${tool.desc}`}>
                <button
                  onClick={() => {
                    if (isDisabled) {
                      toast('Draw your yard border first using the Yard Border tool', { icon: '📍' });
                      return;
                    }
                    setActiveTool(tool.id);
                    setDrawingPoints([]);
                    if (tool.id !== 'structure') setPendingStructureKind(null);
                    if (tool.id === 'structure') setShowStructureMenu(s => !s);
                    else setShowStructureMenu(false);
                  }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all relative"
                  style={{
                    background: isActive ? G_BLUE : undefined,
                    color: isActive ? 'white' : isDisabled ? '#bdbdbd' : '#5f6368',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!isActive && !isDisabled) (e.currentTarget as HTMLElement).style.background = '#f1f3f4'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <tool.icon className="w-5 h-5" />
                  {tool.id === 'structure' && pendingStructureKind && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                      style={{ background: STRUCTURE_COLORS[pendingStructureKind].stroke }} />
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* ── Structure type picker (floating card) ── */}
        {showStructureMenu && (
          <div
            className="absolute left-20 top-1/2 -translate-y-1/2 bg-white rounded-2xl p-3 w-48"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Structure Type</span>
              <button onClick={() => setShowStructureMenu(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
                <button
                  key={k}
                  onClick={() => {
                    setPendingStructureKind(k);
                    setShowStructureMenu(false);
                    setActiveTool('structure');
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-colors"
                  style={{
                    background: pendingStructureKind === k ? G_BLUE_LT : undefined,
                    color: pendingStructureKind === k ? G_BLUE : '#3c4043',
                    border: `1px solid ${pendingStructureKind === k ? G_BLUE : '#e0e0e0'}`,
                  }}
                >
                  <span>{STRUCTURE_ICONS[k]}</span>
                  <span>{STRUCTURE_LABELS[k]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Properties panel (floating right) ── */}
        {selectedEl && (
          <div
            className="absolute top-16 right-4 bg-white rounded-2xl p-4 w-60"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxHeight: 'calc(100% - 5rem)', overflowY: 'auto' }}>
            <PropertiesPanel el={selectedEl} onChange={updateSelected} onDelete={deleteSelected} />
          </div>
        )}

        {/* ── Grid size selector (appears when grid is on) ── */}
        {design.gridEnabled && (
          <div className="absolute bottom-6 right-4 bg-white rounded-xl overflow-hidden"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
            <select
              className="text-xs px-3 py-2 bg-transparent text-gray-600 border-none outline-none cursor-pointer"
              value={design.gridSize}
              onChange={e => save({ ...design, gridSize: Number(e.target.value) })}
            >
              <option value={5}>5 ft grid</option>
              <option value={10}>10 ft grid</option>
              <option value={20}>20 ft grid</option>
            </select>
          </div>
        )}

        {/* ── Bottom center: instruction pill ── */}
        {activeTool !== 'select' && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full px-5 py-2.5 flex items-center gap-2 whitespace-nowrap pointer-events-none"
            style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.3)', fontSize: 13, color: '#3c4043' }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: G_BLUE }} />
            {instruction}
            <span className="text-gray-400 text-xs ml-1">· Esc to cancel</span>
          </div>
        )}

        {/* ── Getting-started overlay (empty canvas) ── */}
        {!backgroundImage && design.elements.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(232,234,246,0.3)' }}>
            <div
              className="bg-white rounded-3xl p-8 max-w-sm text-center pointer-events-auto"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2)', fontFamily: 'Google Sans, Roboto, sans-serif' }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: G_BLUE_LT }}>
                <Camera className="w-8 h-8" style={{ color: G_BLUE }} />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Design Your Yard</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                Upload a photo of your yard as the background, then draw your yard border to start adding structures, trees, and plants.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => photoRef.current?.click()}
                  className="w-full rounded-full py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
                  style={{ background: G_BLUE }}>
                  <Camera className="w-4 h-4 inline mr-2 mb-0.5" />
                  Upload Yard Photo
                </button>
                <button
                  onClick={() => setActiveTool('property')}
                  className="w-full rounded-full py-3 text-sm font-medium transition-colors hover:bg-gray-50"
                  style={{ border: `1px solid #dadce0`, color: '#3c4043' }}>
                  <ChevronRight className="w-4 h-4 inline mr-1 mb-0.5" />
                  Skip · Draw Yard Border
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-4">
                Step 1: Upload photo &nbsp;·&nbsp; Step 2: Draw yard border &nbsp;·&nbsp; Step 3: Add details
              </p>
            </div>
          </div>
        )}

        {/* ── "Draw your border" nudge (has photo but no border) ── */}
        {backgroundImage && !hasYardBorder && design.elements.length === 0 && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full px-5 py-3 flex items-center gap-3 pointer-events-auto"
            style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: G_BLUE_LT }}>
              <Square className="w-4 h-4" style={{ color: G_BLUE }} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800">Photo set! Now draw your yard border.</div>
              <div className="text-xs text-gray-500">Click the Yard Border tool on the left, then click to draw corners.</div>
            </div>
            <button
              onClick={() => setActiveTool('property')}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-white"
              style={{ background: G_BLUE }}>
              Start
            </button>
          </div>
        )}
      </div>

      {/* ── Label dialog ── */}
      {showLabelDialog && (
        <LabelDialog
          onSave={handleLabelSave}
          onCancel={() => { setShowLabelDialog(false); setPendingLabelPos(null); }}
        />
      )}
    </div>
  );
}
