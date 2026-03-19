import React, { useState, useRef, useCallback, useEffect, PointerEvent } from 'react';
import toast from 'react-hot-toast';
import {
  MousePointer2, Home, Trees, Flower2, Tag,
  Save, RotateCcw, ZoomIn, ZoomOut, Download,
  Square, Minus, Camera, X, ChevronRight,
  Grid3X3, Pencil, ChevronDown, Printer, FileImage, FileCode,
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

const STORAGE_KEY    = 'pyyYardDesign';
const BG_STORAGE_KEY = 'pyyYardBackground';

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
  } catch { /* quota exceeded */ }
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
  const majorPx   = pxPerFt * gridSize;
  const minorColor = overPhoto ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const majorColor = overPhoto ? 'rgba(255,255,255,0.32)' : '#94a3b8';
  const lblColor   = overPhoto ? 'rgba(255,255,255,0.65)' : '#94a3b8';

  const lines: React.ReactElement[] = [];
  for (let x = 0; x <= widthPx; x += pxPerFt) {
    const major = Math.abs(x % majorPx) < 0.5;
    lines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={heightPx}
      stroke={major ? majorColor : minorColor} strokeWidth={major ? 0.8 : 0.3} />);
  }
  for (let y = 0; y <= heightPx; y += pxPerFt) {
    const major = Math.abs(y % majorPx) < 0.5;
    lines.push(<line key={`hy${y}`} x1={0} y1={y} x2={widthPx} y2={y}
      stroke={major ? majorColor : minorColor} strokeWidth={major ? 0.8 : 0.3} />);
  }

  const labels: React.ReactElement[] = [];
  for (let x = majorPx; x < widthPx; x += majorPx) {
    labels.push(<text key={`lx${x}`} x={x} y={13} textAnchor="middle"
      fontSize={9} fill={lblColor} fontFamily="Roboto Mono, monospace">{Math.round(x / pxPerFt)}ft</text>);
  }
  for (let y = majorPx; y < heightPx; y += majorPx) {
    labels.push(<text key={`ly${y}`} x={14} y={y} textAnchor="middle" dominantBaseline="middle"
      fontSize={9} fill={lblColor} fontFamily="Roboto Mono, monospace">{Math.round(y / pxPerFt)}ft</text>);
  }

  return <g style={{ pointerEvents: 'none' }}>{lines}{labels}</g>;
}

// ─── Element Renderer ─────────────────────────────────────────────────────────

function ElementShape({ el, selected, onPointerDown }: {
  el: DesignElement; selected: boolean;
  onPointerDown: (e: PointerEvent<SVGElement>, id: string) => void;
}) {
  const selGlow = selected ? { filter: 'drop-shadow(0 0 4px rgba(26,115,232,0.7))' } : {};

  if (el.type === 'path' && el.points && el.points.length >= 2) {
    return (
      <path d={ptsToD(el.points, false)}
        stroke={el.color || '#78909c'} strokeWidth={2.5}
        strokeDasharray="8,5" strokeLinecap="round" fill="none"
        style={{ cursor: 'move', ...selGlow }}
        onPointerDown={e => onPointerDown(e, el.id)} />
    );
  }

  if (el.type === 'structure' && el.points && el.points.length >= 2) {
    const { stroke, fill } = STRUCTURE_COLORS[el.structureKind || 'other'];
    const ctr = el.points.length >= 3 ? centroid(el.points) : null;
    return (
      <g style={selGlow} onPointerDown={e => onPointerDown(e, el.id)}>
        <path d={ptsToD(el.points, true)}
          stroke={el.color || stroke} strokeWidth={2} strokeLinejoin="round"
          fill={el.fill || fill} fillOpacity={el.opacity ?? 0.88}
          style={{ cursor: 'move' }} />
        {el.label && ctr && (
          <text x={ctr.x} y={ctr.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fontWeight="600" fill={stroke}
            style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Roboto, sans-serif' }}>
            {el.label}
          </text>
        )}
      </g>
    );
  }

  if ((el.type === 'tree' || el.type === 'plant') && el.cx !== undefined && el.cy !== undefined) {
    const r = el.radius || (el.type === 'tree' ? 18 : 9);
    const color = el.color || (el.type === 'tree' ? '#2e7d32' : '#558b2f');
    return (
      <g style={selGlow} onPointerDown={e => onPointerDown(e, el.id)}>
        <ellipse cx={el.cx + 3} cy={el.cy + 4} rx={r * 0.9} ry={r * 0.6}
          fill="rgba(0,0,0,0.12)" style={{ pointerEvents: 'none' }} />
        <circle cx={el.cx} cy={el.cy} r={r}
          fill={color} fillOpacity={el.type === 'tree' ? 0.45 : 0.55}
          stroke={color} strokeWidth={1.5} style={{ cursor: 'move' }} />
        <circle cx={el.cx - r * 0.25} cy={el.cy - r * 0.25} r={r * 0.35}
          fill="rgba(255,255,255,0.2)" style={{ pointerEvents: 'none' }} />
        <circle cx={el.cx} cy={el.cy} r={3} fill={color} />
        {el.label && (
          <text x={el.cx} y={el.cy + r + 12} textAnchor="middle"
            fontSize={10} fontWeight="500" fill="#1b5e20"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>{el.label}</text>
        )}
      </g>
    );
  }

  if (el.type === 'label' && el.tx !== undefined && el.ty !== undefined) {
    const w = (el.text?.length || 5) * 7.5 + 16;
    return (
      <g style={selGlow} onPointerDown={e => onPointerDown(e, el.id)}>
        <rect x={el.tx - w / 2} y={el.ty - 11} width={w} height={22}
          rx={4} fill="rgba(255,255,255,0.9)" stroke="rgba(0,0,0,0.1)" strokeWidth={1}
          style={{ cursor: 'move' }} />
        <text x={el.tx} y={el.ty} textAnchor="middle" dominantBaseline="middle"
          fontSize={12} fontWeight="600" fill={el.color || '#202124'}
          style={{ cursor: 'move', userSelect: 'none', fontFamily: 'Roboto, sans-serif' }}>
          {el.text || 'Label'}
        </text>
      </g>
    );
  }

  return null;
}

// ─── CAD Point-Edit Layer ─────────────────────────────────────────────────────
// Renders over a selected polygon: draggable vertex handles, segment midpoints
// for insertion, and real-world length labels on each segment.

function PointEditLayer({ el, pxPerFt, selectedPtIdx, onSelectPt, onMovePtDown, onDeletePt, onInsertPt }: {
  el: DesignElement;
  pxPerFt: number;
  selectedPtIdx: number | null;
  onSelectPt: (i: number) => void;
  onMovePtDown: (e: PointerEvent<SVGCircleElement>, ptIdx: number) => void;
  onDeletePt: (i: number) => void;
  onInsertPt: (afterIdx: number, pt: Pt) => void;
}) {
  if (!el.points || el.points.length < 2) return null;

  const pts    = el.points;
  const closed = el.type !== 'path' && pts.length >= 3;
  const segCount = closed ? pts.length : pts.length - 1;
  const accent = el.type === 'property' ? G_BLUE : '#ff6d00';

  return (
    <g>
      {/* Segments: length labels + midpoint insertion handles */}
      {Array.from({ length: segCount }, (_, i) => {
        const a   = pts[i];
        const b   = pts[(i + 1) % pts.length];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const len = Math.hypot(b.x - a.x, b.y - a.y) / pxPerFt;

        return (
          <g key={`seg${i}`}>
            {/* Length label */}
            <g transform={`translate(${mid.x},${mid.y})`} style={{ pointerEvents: 'none' }}>
              <rect x={-20} y={-9} width={40} height={14} rx={3}
                fill="rgba(255,255,255,0.92)" stroke={accent} strokeWidth={0.5} />
              <text textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fontWeight="700" fill={accent}
                fontFamily="Roboto Mono, monospace">
                {len.toFixed(1)}ft
              </text>
            </g>
            {/* Midpoint insertion handle */}
            <circle cx={mid.x} cy={mid.y} r={5}
              fill="white" stroke={accent} strokeWidth={1.5} strokeDasharray="0"
              style={{ cursor: 'cell' }}
              onClick={e => { e.stopPropagation(); onInsertPt(i + 1, mid); }} />
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill={accent} fontWeight="bold"
              style={{ pointerEvents: 'none' }}>+</text>
          </g>
        );
      })}

      {/* Vertex handles */}
      {pts.map((pt, i) => {
        const isSelected = selectedPtIdx === i;
        return (
          <g key={`pt${i}`}>
            {/* Large transparent hit area */}
            <circle cx={pt.x} cy={pt.y} r={12} fill="transparent"
              style={{ cursor: 'move' }}
              onPointerDown={e => { e.stopPropagation(); onSelectPt(i); onMovePtDown(e, i); }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onDeletePt(i); }} />
            {/* Outer ring */}
            <circle cx={pt.x} cy={pt.y} r={isSelected ? 8 : 6}
              fill={isSelected ? accent : 'white'}
              stroke={accent} strokeWidth={isSelected ? 0 : 2.5}
              style={{ pointerEvents: 'none' }} />
            {/* Inner dot when unselected */}
            {!isSelected && (
              <circle cx={pt.x} cy={pt.y} r={2.5} fill={accent} style={{ pointerEvents: 'none' }} />
            )}
            {/* Index badge */}
            {isSelected && (
              <text x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fontWeight="700" fill="white" style={{ pointerEvents: 'none' }}>
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ─── Label Dialog ─────────────────────────────────────────────────────────────

function LabelDialog({ initial, onSave, onCancel }: {
  initial?: string; onSave: (text: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(initial || '');
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="font-medium text-gray-900 text-base mb-4">Add Label</h3>
        <input
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); }}
          placeholder="e.g. Back Yard, Flower Bed…"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-full hover:bg-gray-100 transition-colors" style={{ color: G_BLUE }}>
            Cancel
          </button>
          <button onClick={() => onSave(val)}
            className="px-4 py-2 text-sm font-medium text-white rounded-full hover:opacity-90 transition-opacity"
            style={{ background: G_BLUE }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ el, onChange, onDelete, selectedPtIdx, onDeletePt }: {
  el: DesignElement;
  onChange: (u: Partial<DesignElement>) => void;
  onDelete: () => void;
  selectedPtIdx: number | null;
  onDeletePt: (i: number) => void;
}) {
  const typeName = el.type === 'property' ? 'Yard Border'
    : el.type === 'structure' ? STRUCTURE_LABELS[el.structureKind || 'other']
    : el.type === 'tree' ? 'Tree' : el.type === 'plant' ? 'Plant'
    : el.type === 'path' ? 'Path / Fence' : 'Label';

  return (
    <div style={{ fontFamily: 'Roboto, sans-serif' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-800">{typeName}</span>
        <button onClick={onDelete}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-red-500 transition-colors" title="Delete element">
          <X className="w-4 h-4" />
        </button>
      </div>

      {selectedPtIdx !== null && el.points && (
        <div className="mb-3 p-2.5 rounded-lg bg-orange-50 border border-orange-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-orange-700">Point #{selectedPtIdx + 1} selected</span>
            <button
              onClick={() => onDeletePt(selectedPtIdx)}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
              title="Delete this point">
              Delete point
            </button>
          </div>
          <p className="text-xs text-orange-600 mt-1">Drag to move · Del to delete · right-click to delete</p>
        </div>
      )}

      {el.type === 'structure' && (
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">Type</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
            value={el.structureKind || 'other'}
            onChange={e => onChange({ structureKind: e.target.value as StructureKind, label: STRUCTURE_LABELS[e.target.value as StructureKind] })}>
            {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
              <option key={k} value={k}>{STRUCTURE_ICONS[k]} {STRUCTURE_LABELS[k]}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-gray-500 mb-1 block">Label</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={el.label || el.text || ''}
          onChange={e => onChange(el.type === 'label' ? { text: e.target.value } : { label: e.target.value })}
          placeholder="Enter label…" />
      </div>

      {(el.type === 'tree' || el.type === 'plant') && (
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">
            Size — {Math.round((el.radius || (el.type === 'tree' ? 18 : 9)) / 8)} ft radius
          </label>
          <input type="range" min={4} max={80}
            value={el.radius || (el.type === 'tree' ? 18 : 9)}
            onChange={e => onChange({ radius: Number(e.target.value) })}
            className="w-full" style={{ accentColor: G_BLUE }} />
        </div>
      )}

      {el.points && el.points.length >= 2 && (
        <div className="mt-2 p-2 rounded-lg bg-gray-50 text-xs text-gray-500">
          <div>{el.points.length} points</div>
          {el.type !== 'path' && el.points.length >= 3 && (() => {
            const pts = el.points!;
            const area = Math.abs(pts.reduce((sum, p, i) => {
              const n = pts[(i + 1) % pts.length];
              return sum + (p.x * n.y - n.x * p.y);
            }, 0)) / 2;
            return <div>{(area / 64).toFixed(0)} sq ft (approx)</div>;
          })()}
        </div>
      )}

      <div className="mt-3">
        <label className="text-xs text-gray-500 mb-1 block">Color</label>
        <input type="color" value={el.color || '#1a73e8'}
          onChange={e => onChange({ color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer border border-gray-200" />
      </div>
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group flex items-center justify-center">
      {children}
      <div className="absolute left-full ml-2.5 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg
        whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-tight">
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
      </div>
    </div>
  );
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: { id: ToolType; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; requiresBorder?: boolean }[] = [
  { id: 'select',    label: 'Select & Edit',   icon: MousePointer2, desc: 'Select shapes · drag points' },
  { id: 'property',  label: 'Yard Border',      icon: Square,        desc: 'Draw the boundary of your yard' },
  { id: 'structure', label: 'Structure',        icon: Home,          desc: 'House, deck, driveway…', requiresBorder: true },
  { id: 'path',      label: 'Path / Fence',     icon: Minus,         desc: 'Walkways, fences, edges', requiresBorder: true },
  { id: 'tree',      label: 'Tree',             icon: Trees,         desc: 'Place a tree', requiresBorder: true },
  { id: 'plant',     label: 'Plant / Shrub',    icon: Flower2,       desc: 'Place a plant or shrub', requiresBorder: true },
  { id: 'label',     label: 'Label',            icon: Tag,           desc: 'Add a text label' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function YardDesignerPage() {
  const [design, setDesign]         = useState<YardDesign>(loadDesign);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [pendingStructureKind, setPendingStructureKind] = useState<StructureKind | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Pt[]>([]);
  const [mousePos, setMousePos]     = useState<Pt>({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPtIdx, setSelectedPtIdx] = useState<number | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [pendingLabelPos, setPendingLabelPos] = useState<Pt | null>(null);
  const [zoom, setZoom]             = useState(1);
  const [showStructureMenu, setShowStructureMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(loadBackground);

  const svgRef    = useRef<SVGSVGElement>(null);
  const photoRef  = useRef<HTMLInputElement>(null);

  // Shape drag ref
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origEl: DesignElement } | null>(null);
  // Point drag ref — for CAD vertex dragging
  const ptDragRef = useRef<{ elId: string; ptIdx: number; origPts: Pt[]; startX: number; startY: number } | null>(null);

  const widthPx  = design.canvasWidthFt  * design.pixelsPerFoot;
  const heightPx = design.canvasHeightFt * design.pixelsPerFoot;

  // Derive yard border from most recently drawn property element
  const yardBorderEl  = [...design.elements].reverse().find(el => el.type === 'property') || null;
  const yardBorderPts = yardBorderEl?.points && yardBorderEl.points.length >= 3 ? yardBorderEl.points : null;
  const hasYardBorder = yardBorderPts !== null;

  // ── Persistence ──
  const save = useCallback((d: YardDesign) => { saveDesign(d); setDesign(d); }, []);

  // Clear selectedPtIdx when selection changes
  useEffect(() => { setSelectedPtIdx(null); }, [selectedId]);

  // ── SVG coordinate mapping ──
  // Uses getScreenCTM for pixel-perfect accuracy regardless of zoom, scroll, or transforms.
  const getSvgPt = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const mapped = pt.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  }, []); // no deps — getScreenCTM reads live state every call

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

  const removeBackground = () => { setBackgroundImage(null); saveBackground(null); toast('Background photo removed'); };

  // ── Grid ──
  const toggleGrid = () => save({ ...design, gridEnabled: !design.gridEnabled });

  // ── Pointer move: shape drag OR point drag ──
  const handleSvgPointerMove = useCallback((e: PointerEvent<SVGSVGElement>) => {
    const cur = getSvgPt(e);
    setMousePos(cur);

    // CAD: individual point drag takes priority
    if (ptDragRef.current) {
      const { elId, ptIdx, origPts, startX, startY } = ptDragRef.current;
      const dx = cur.x - startX;
      const dy = cur.y - startY;
      setDesign(prev => ({
        ...prev,
        elements: prev.elements.map(el => {
          if (el.id !== elId || !el.points) return el;
          const newPts = origPts.map((p, i) =>
            i === ptIdx ? { x: p.x + dx, y: p.y + dy } : { ...p }
          );
          return { ...el, points: newPts };
        }),
      }));
      return;
    }

    // Whole-shape drag
    if (draggingRef.current) {
      const { id, startX, startY, origEl } = draggingRef.current;
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

  // ── Pointer up ──
  const handleSvgPointerUp = useCallback(() => {
    if (ptDragRef.current) { saveDesign(design); ptDragRef.current = null; }
    else if (draggingRef.current) { saveDesign(design); draggingRef.current = null; }
  }, [design]);

  // ── Canvas click ──
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingRef.current || ptDragRef.current) return;
    const pt = getSvgPt(e);

    if (activeTool === 'select') {
      setSelectedId(null);
      setSelectedPtIdx(null);
      setShowExportMenu(false);
      return;
    }

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

    if (activeTool === 'label') { setPendingLabelPos(pt); setShowLabelDialog(true); return; }

    if (['property', 'structure', 'path'].includes(activeTool)) {
      if (activeTool === 'structure' && !pendingStructureKind) { setShowStructureMenu(true); return; }
      setDrawingPoints(prev => [...prev, pt]);
    }
  }, [activeTool, design, getSvgPt, pendingStructureKind, save]);

  // ── Double-click: close polygon ──
  const handleSvgDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (drawingPoints.length < 2) return;
    const finalPts = drawingPoints.slice(0, -1); // drop duplicate from dblclick
    if (finalPts.length < 2) return;

    let el: DesignElement;
    if (activeTool === 'property') {
      el = { id: uid(), type: 'property', points: finalPts, color: G_BLUE, fill: 'rgba(26,115,232,0.05)' };
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
      toast.success('Yard border drawn! Switch to Select to drag individual points.');
    }
  }, [activeTool, design, drawingPoints, pendingStructureKind, save]);

  // ── Whole-shape drag start ──
  const handleElementPointerDown = useCallback((e: PointerEvent<SVGElement>, id: string) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    const pt = getSvgPt(e);
    const el = design.elements.find(x => x.id === id);
    if (!el) return;
    draggingRef.current = {
      id, startX: pt.x, startY: pt.y,
      origEl: { ...el, points: el.points ? [...el.points] : undefined },
    };
    setSelectedId(id);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, [activeTool, design.elements, getSvgPt]);

  // ── CAD: individual point drag start ──
  const handlePointPointerDown = useCallback((e: PointerEvent<SVGCircleElement>, elId: string, ptIdx: number) => {
    e.stopPropagation();
    const pt = getSvgPt(e);
    const el = design.elements.find(x => x.id === elId);
    if (!el?.points) return;
    ptDragRef.current = { elId, ptIdx, origPts: [...el.points], startX: pt.x, startY: pt.y };
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, [design.elements, getSvgPt]);

  // ── CAD: insert a new point on a segment ──
  const handleInsertPoint = useCallback((elId: string, afterIdx: number, pt: Pt) => {
    setDesign(prev => {
      const updated = {
        ...prev,
        elements: prev.elements.map(el => {
          if (el.id !== elId || !el.points) return el;
          const newPts = [...el.points];
          newPts.splice(afterIdx, 0, pt);
          return { ...el, points: newPts };
        }),
      };
      saveDesign(updated);
      return updated;
    });
    setSelectedPtIdx(afterIdx);
  }, []);

  // ── CAD: delete a point from a polygon ──
  const handleDeletePoint = useCallback((elId: string, ptIdx: number) => {
    const el = design.elements.find(x => x.id === elId);
    const minPts = el?.type === 'path' ? 2 : 3;
    if (!el?.points || el.points.length <= minPts) {
      toast.error(`Need at least ${minPts} points — delete the whole shape instead`);
      return;
    }
    setDesign(prev => {
      const updated = {
        ...prev,
        elements: prev.elements.map(e =>
          e.id !== elId ? e : { ...e, points: e.points!.filter((_, i) => i !== ptIdx) }
        ),
      };
      saveDesign(updated);
      return updated;
    });
    setSelectedPtIdx(null);
    toast(`Point ${ptIdx + 1} deleted`);
  }, [design.elements]);

  // ── Label submit ──
  const handleLabelSave = (text: string) => {
    if (!pendingLabelPos) return;
    const el: DesignElement = { id: uid(), type: 'label', tx: pendingLabelPos.x, ty: pendingLabelPos.y, text, color: '#202124' };
    save({ ...design, elements: [...design.elements, el] });
    setSelectedId(el.id);
    setShowLabelDialog(false);
    setPendingLabelPos(null);
  };

  // ── Update / delete selected ──
  const updateSelected = (partial: Partial<DesignElement>) => {
    setDesign(prev => {
      const updated = { ...prev, elements: prev.elements.map(el => el.id === selectedId ? { ...el, ...partial } : el) };
      saveDesign(updated);
      return updated;
    });
  };

  const deleteSelected = useCallback(() => {
    setDesign(prev => {
      const updated = { ...prev, elements: prev.elements.filter(el => el.id !== selectedId) };
      saveDesign(updated);
      return updated;
    });
    setSelectedId(null);
    setSelectedPtIdx(null);
  }, [selectedId]);

  // ── Export: SVG ──
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

  // ── Export: PNG ──
  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width  = widthPx * scale;
    canvas.height = heightPx * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'yard-design.png';
      a.click();
      toast.success('PNG exported!');
    };
    img.src = url;
  };

  // ── Export: Print ──
  const printDesign = (pageSize: string) => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgStr = new XMLSerializer().serializeToString(svg);
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — please allow pop-ups'); return; }
    win.document.write(`<!DOCTYPE html><html>
<head><title>Yard Design</title>
<style>
  @page { size: ${pageSize}; margin: 0.5in; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { display:flex; align-items:center; justify-content:center; width:100%; height:100vh; }
  svg { max-width:100%; max-height:100%; width:auto; height:auto; page-break-inside:avoid; }
</style></head>
<body>${svgStr}
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1000);};</script>
</body></html>`);
    win.document.close();
  };

  // ── Clear / Save ──
  const handleClear = () => {
    if (!confirm('Clear all elements? This cannot be undone.')) return;
    save(defaultDesign());
    setSelectedId(null);
    setDrawingPoints([]);
    toast('Canvas cleared');
  };

  const handleSave = () => { saveDesign(design); toast.success('Design saved!'); };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        setDrawingPoints([]); setPendingStructureKind(null);
        setActiveTool('select'); setShowStructureMenu(false);
        setShowExportMenu(false); setSelectedPtIdx(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          if (selectedPtIdx !== null) handleDeletePoint(selectedId, selectedPtIdx);
          else deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, selectedPtIdx, handleDeletePoint, deleteSelected]);

  const selectedEl = design.elements.find(el => el.id === selectedId) || null;

  const cursorMap: Record<ToolType, string> = {
    select: 'default', property: 'crosshair', structure: 'crosshair',
    path: 'crosshair', tree: 'cell', plant: 'cell', label: 'text',
  };

  const previewPts = drawingPoints.length > 0 ? [...drawingPoints, mousePos] : [];
  const isDrawing  = drawingPoints.length > 0;

  const instruction = activeTool === 'tree' || activeTool === 'plant'
    ? `Click to place a ${activeTool} inside your yard.`
    : activeTool === 'label' ? 'Click where you want to add a label.'
    : activeTool === 'property'
    ? isDrawing ? 'Keep clicking corners. Double-click to close the yard border.'
      : 'Click to place the first corner of your yard border.'
    : activeTool === 'structure' && !pendingStructureKind
    ? 'Choose a structure type from the panel.'
    : isDrawing
    ? `Click to add corners. Double-click to finish. Esc to cancel.`
    : 'Click to start drawing. Double-click to finish.';

  // ── Print size options ──
  const PRINT_SIZES = [
    { label: 'Letter  8.5"×11"',   size: 'letter' },
    { label: 'Legal   8.5"×14"',   size: 'legal' },
    { label: 'Tabloid 11"×17"',    size: 'tabloid' },
    { label: 'A4',                 size: 'A4' },
    { label: 'A3',                 size: 'A3' },
  ];

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 4rem)', fontFamily: 'Roboto, system-ui, sans-serif' }}>
      {/* Hidden photo input */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handlePhotoChange} />

      {/* ── Main canvas area ── */}
      <div className="relative flex-1 overflow-hidden" style={{ background: '#e8eaf6' }}>

        {/* Scrollable canvas */}
        <div className="absolute inset-0 overflow-auto">
          <div className="p-8 min-w-max min-h-full flex items-start">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'inline-block' }}>
              <svg
                ref={svgRef}
                width={widthPx}
                height={heightPx}
                style={{
                  cursor: cursorMap[activeTool],
                  display: 'block',
                  borderRadius: 6,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.3), 0 8px 40px rgba(0,0,0,0.15)',
                }}
                onClick={handleSvgClick}
                onDoubleClick={handleSvgDblClick}
                onPointerMove={handleSvgPointerMove}
                onPointerUp={handleSvgPointerUp}
              >
                <defs>
                  {yardBorderPts && (
                    <>
                      <clipPath id="yardClip">
                        <path d={ptsToD(yardBorderPts, true)} />
                      </clipPath>
                      <mask id="outsideMask">
                        <rect width={widthPx} height={heightPx} fill="white" />
                        <path d={ptsToD(yardBorderPts, true)} fill="black" />
                      </mask>
                    </>
                  )}
                  {!backgroundImage && (
                    <pattern id="grassPat" patternUnits="userSpaceOnUse" width="40" height="40">
                      <rect width="40" height="40" fill="#e8f5e9" />
                      <circle cx="10" cy="10" r="2.5" fill="#c8e6c9" opacity="0.6" />
                      <circle cx="30" cy="20" r="2"   fill="#c8e6c9" opacity="0.5" />
                      <circle cx="20" cy="32" r="2.5" fill="#c8e6c9" opacity="0.6" />
                      <circle cx="5"  cy="28" r="1.5" fill="#a5d6a7" opacity="0.4" />
                      <circle cx="35" cy="8"  r="1.5" fill="#a5d6a7" opacity="0.4" />
                    </pattern>
                  )}
                </defs>

                {/* Background */}
                {backgroundImage
                  ? <image href={backgroundImage} x={0} y={0} width={widthPx} height={heightPx} preserveAspectRatio="xMidYMid slice" />
                  : <rect width={widthPx} height={heightPx} fill="url(#grassPat)" />
                }

                {/* Outside-yard dim */}
                {yardBorderPts && (
                  <rect width={widthPx} height={heightPx}
                    fill="rgba(0,0,0,0.48)" mask="url(#outsideMask)"
                    style={{ pointerEvents: 'none' }} />
                )}

                {/* Yard interior content */}
                <g clipPath={yardBorderPts ? 'url(#yardClip)' : undefined}>
                  {design.gridEnabled && (
                    <GridLayer widthPx={widthPx} heightPx={heightPx}
                      pxPerFt={design.pixelsPerFoot} gridSize={design.gridSize}
                      overPhoto={!!backgroundImage} />
                  )}
                  {design.elements.filter(el => el.type !== 'property').map(el => (
                    <ElementShape key={el.id} el={el}
                      selected={el.id === selectedId && selectedPtIdx === null}
                      onPointerDown={handleElementPointerDown} />
                  ))}
                </g>

                {/* Yard border */}
                {yardBorderEl && yardBorderPts && (
                  <g>
                    <path d={ptsToD(yardBorderPts, true)} fill="rgba(26,115,232,0.04)"
                      style={{ pointerEvents: 'none' }} />
                    <path d={ptsToD(yardBorderPts, true)}
                      stroke={G_BLUE} strokeWidth={3} strokeLinejoin="round" fill="none"
                      style={{
                        cursor: activeTool === 'select' ? 'move' : undefined,
                        filter: 'drop-shadow(0 0 3px rgba(26,115,232,0.5))',
                      }}
                      onPointerDown={e => activeTool === 'select' && handleElementPointerDown(e, yardBorderEl.id)} />
                    {/* Show corner dots only when NOT in point-edit mode for this element */}
                    {selectedId !== yardBorderEl.id && yardBorderPts.map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r={5}
                        fill={G_BLUE} stroke="white" strokeWidth={2}
                        style={{ pointerEvents: 'none' }} />
                    ))}
                  </g>
                )}

                {/* CAD point-edit layer — shown when a polygon is selected in select mode */}
                {selectedEl && selectedEl.points && selectedEl.points.length >= 2 && activeTool === 'select' && (
                  <PointEditLayer
                    el={selectedEl}
                    pxPerFt={design.pixelsPerFoot}
                    selectedPtIdx={selectedPtIdx}
                    onSelectPt={setSelectedPtIdx}
                    onMovePtDown={(e, ptIdx) => handlePointPointerDown(e, selectedEl.id, ptIdx)}
                    onDeletePt={ptIdx => handleDeletePoint(selectedEl.id, ptIdx)}
                    onInsertPt={(afterIdx, pt) => handleInsertPoint(selectedEl.id, afterIdx, pt)}
                  />
                )}

                {/* Drawing preview */}
                {previewPts.length >= 2 && (
                  <path d={ptsToD(previewPts, false)}
                    stroke={G_BLUE} strokeWidth={2} strokeDasharray="10,5" strokeLinecap="round"
                    fill="none" style={{ pointerEvents: 'none' }} />
                )}
                {drawingPoints.map((p, i) => (
                  <g key={i} style={{ pointerEvents: 'none' }}>
                    <circle cx={p.x} cy={p.y} r={7} fill="rgba(26,115,232,0.15)" />
                    <circle cx={p.x} cy={p.y} r={4} fill={G_BLUE} stroke="white" strokeWidth={2} />
                    <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                      fontSize={7} fontWeight="700" fill="white">{i + 1}</text>
                  </g>
                ))}

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

        {/* ═══ FLOATING UI ═══ */}

        {/* Top-left: title chip */}
        <div className="absolute top-4 left-4">
          <div className="bg-white rounded-full px-4 py-2 flex items-center gap-2"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: G_BLUE }}>
              <Pencil className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-800">Yard Designer</span>
          </div>
        </div>

        {/* Top-right: controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Zoom pill */}
          <div className="bg-white rounded-xl flex items-center divide-x divide-gray-100 overflow-hidden"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }}>
            <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(1)))}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 text-gray-600" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-medium text-gray-600 min-w-[3.5rem] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(1)))}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 text-gray-600" title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Grid toggle */}
          <button onClick={toggleGrid}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{
              background: design.gridEnabled ? G_BLUE_LT : 'white',
              color: design.gridEnabled ? G_BLUE : '#5f6368',
              boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
            }}
            title={`Grid ${design.gridEnabled ? 'on' : 'off'}`}>
            <Grid3X3 className="w-4 h-4" />
          </button>

          {/* Grid size (shown when grid is on) */}
          {design.gridEnabled && (
            <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }}>
              <select className="text-xs px-2 py-2.5 bg-transparent text-gray-600 border-none outline-none cursor-pointer h-9"
                value={design.gridSize}
                onChange={e => save({ ...design, gridSize: Number(e.target.value) })}>
                <option value={5}>5 ft</option>
                <option value={10}>10 ft</option>
                <option value={20}>20 ft</option>
              </select>
            </div>
          )}

          <div className="w-px h-6 bg-gray-300" />

          {/* Clear */}
          <button onClick={handleClear}
            className="h-9 px-3 bg-white rounded-xl flex items-center gap-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }}>
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="h-9 px-3 bg-white rounded-xl flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }}>
              <Download className="w-3.5 h-3.5" />
              Export
              <ChevronDown className={`w-3 h-3 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <div
                className="absolute top-11 right-0 bg-white rounded-2xl py-2 w-52 z-50"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}>
                {/* Download section */}
                <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Download</div>
                <button onClick={() => { exportSvg(); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileCode className="w-4 h-4 text-gray-400" />
                  SVG — vector / scalable
                </button>
                <button onClick={() => { exportPng(); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <FileImage className="w-4 h-4 text-gray-400" />
                  PNG — 2× high-res
                </button>

                <div className="border-t border-gray-100 my-1.5" />

                {/* Print section */}
                <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Print</div>
                {PRINT_SIZES.map(({ label, size }) => (
                  <button key={size} onClick={() => { printDesign(size); setShowExportMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Printer className="w-4 h-4 text-gray-400" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <button onClick={handleSave}
            className="h-9 px-4 rounded-xl flex items-center gap-1.5 text-sm text-white font-medium hover:opacity-90 transition-opacity"
            style={{ background: G_BLUE, boxShadow: '0 2px 8px rgba(0,0,0,0.28)' }}>
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>

        {/* Left: floating tools panel */}
        <div className="absolute top-1/2 -translate-y-1/2 left-4 flex flex-col gap-1 rounded-2xl p-2 bg-white"
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.28)' }}>

          {/* Photo upload */}
          <Tooltip label={backgroundImage ? 'Change yard photo' : 'Upload yard photo'}>
            <button
              onClick={() => photoRef.current?.click()}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors relative"
              style={{
                background: backgroundImage ? '#e6f4ea' : undefined,
                color: backgroundImage ? '#34a853' : '#5f6368',
              }}>
              <Camera className="w-5 h-5" />
              {backgroundImage && (
                <span
                  onClick={e => { e.stopPropagation(); removeBackground(); }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full border border-gray-200 flex items-center justify-center hover:bg-red-50 cursor-pointer"
                  title="Remove photo">
                  <X className="w-2.5 h-2.5 text-gray-400" />
                </span>
              )}
            </button>
          </Tooltip>

          <div className="w-full h-px bg-gray-100 my-0.5" />

          {TOOLS.map(tool => {
            const isActive   = activeTool === tool.id;
            const isDisabled = tool.requiresBorder && !hasYardBorder;
            return (
              <Tooltip key={tool.id} label={isDisabled ? 'Draw yard border first' : `${tool.label} — ${tool.desc}`}>
                <button
                  onClick={() => {
                    if (isDisabled) { toast('Draw your yard border first', { icon: '📍' }); return; }
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
                  }}>
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

        {/* Structure picker (floating card) */}
        {showStructureMenu && (
          <div className="absolute left-20 top-1/2 -translate-y-1/2 bg-white rounded-2xl p-3 w-48 z-40"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.22)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Structure</span>
              <button onClick={() => setShowStructureMenu(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(STRUCTURE_LABELS) as StructureKind[]).map(k => (
                <button key={k}
                  onClick={() => { setPendingStructureKind(k); setShowStructureMenu(false); setActiveTool('structure'); }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-colors"
                  style={{
                    background: pendingStructureKind === k ? G_BLUE_LT : undefined,
                    color: pendingStructureKind === k ? G_BLUE : '#3c4043',
                    border: `1px solid ${pendingStructureKind === k ? G_BLUE : '#e0e0e0'}`,
                  }}>
                  <span>{STRUCTURE_ICONS[k]}</span>
                  <span>{STRUCTURE_LABELS[k]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Properties panel (right side, slides in when element selected) */}
        {selectedEl && (
          <div className="absolute top-16 right-4 bg-white rounded-2xl p-4 w-60 z-40"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.2)', maxHeight: 'calc(100% - 5rem)', overflowY: 'auto' }}>
            <PropertiesPanel
              el={selectedEl}
              onChange={updateSelected}
              onDelete={deleteSelected}
              selectedPtIdx={selectedPtIdx}
              onDeletePt={ptIdx => handleDeletePoint(selectedEl.id, ptIdx)}
            />
          </div>
        )}

        {/* Instruction pill */}
        {activeTool !== 'select' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full px-5 py-2.5
            flex items-center gap-2 whitespace-nowrap pointer-events-none"
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.25)', fontSize: 13, color: '#3c4043' }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: G_BLUE }} />
            {instruction}
          </div>
        )}

        {/* Select mode tip when element is selected and has points */}
        {activeTool === 'select' && selectedEl?.points && selectedPtIdx === null && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full px-4 py-2
            flex items-center gap-2 whitespace-nowrap pointer-events-none"
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.25)', fontSize: 12, color: '#5f6368' }}>
            Click a point to select it · Drag to move it · + to insert · right-click to delete
          </div>
        )}

        {/* Getting-started overlay */}
        {!backgroundImage && design.elements.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(232,234,246,0.4)' }}>
            <div className="bg-white rounded-3xl p-8 max-w-sm text-center"
              style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: G_BLUE_LT }}>
                <Camera className="w-8 h-8" style={{ color: G_BLUE }} />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">Design Your Yard</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                Upload an aerial photo of your property, then draw your yard border.
                Add structures, trees, and plants — all with CAD-style point editing.
              </p>
              <div className="space-y-3">
                <button onClick={() => photoRef.current?.click()}
                  className="w-full rounded-full py-3 text-sm font-medium text-white hover:opacity-90"
                  style={{ background: G_BLUE }}>
                  <Camera className="w-4 h-4 inline mr-2 mb-0.5" />
                  Upload Yard Photo
                </button>
                <button onClick={() => setActiveTool('property')}
                  className="w-full rounded-full py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #dadce0', color: '#3c4043' }}>
                  <ChevronRight className="w-4 h-4 inline mr-1 mb-0.5" />
                  Skip · Draw Yard Border
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Step 1: Photo · Step 2: Yard border · Step 3: Add details
              </p>
            </div>
          </div>
        )}

        {/* Photo-set nudge */}
        {backgroundImage && !hasYardBorder && design.elements.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full px-5 py-3
            flex items-center gap-3"
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: G_BLUE_LT }}>
              <Square className="w-4 h-4" style={{ color: G_BLUE }} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800">Photo added! Draw your yard border.</div>
              <div className="text-xs text-gray-500">Select the Yard Border tool and click corners around your property.</div>
            </div>
            <button onClick={() => setActiveTool('property')}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-white"
              style={{ background: G_BLUE }}>
              Start
            </button>
          </div>
        )}
      </div>

      {showLabelDialog && (
        <LabelDialog
          onSave={handleLabelSave}
          onCancel={() => { setShowLabelDialog(false); setPendingLabelPos(null); }}
        />
      )}
    </div>
  );
}
