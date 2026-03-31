import {
  useState, useEffect, useRef, useCallback,
  type ReactNode, type MouseEvent, type WheelEvent, type FormEvent,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Upload, ZoomIn, ZoomOut, Move, Home,
  X, Check, Plus, Square, Layers, Image, Satellite, Pencil,
} from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import toast from 'react-hot-toast';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Point { x: number; y: number; }

interface GridShape {
  id: string;
  type: ShapeType;
  label: string;
  points: Point[];
  color: string;
  fill: string;
}

interface YardDesign {
  gridScale: number;
  shapes: GridShape[];
}

interface ProjectImage {
  id: number;
  filename: string;
  original_name: string;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
  address: string;
  description: string;
  lat: number | null;
  lng: number | null;
  yard_design: string | null;
  images: ProjectImage[];
}

type ShapeType = 'property' | 'house' | 'deck' | 'garden' | 'lawn' | 'driveway' | 'path' | 'custom';
type ToolMode = 'select' | 'draw' | 'pan';

// ── Shape config ──────────────────────────────────────────────────────────

const SHAPE_CONFIG: Record<ShapeType, { label: string; color: string; fill: string }> = {
  property:  { label: 'Property',   color: '#16a34a', fill: '#dcfce7' },
  house:     { label: 'House',      color: '#475569', fill: '#e2e8f0' },
  deck:      { label: 'Deck/Patio', color: '#d97706', fill: '#fef3c7' },
  garden:    { label: 'Garden Bed', color: '#92400e', fill: '#ecfdf5' },
  lawn:      { label: 'Lawn',       color: '#22c55e', fill: '#f0fdf4' },
  driveway:  { label: 'Driveway',   color: '#9ca3af', fill: '#f3f4f6' },
  path:      { label: 'Path',       color: '#78716c', fill: '#f5f5f4' },
  custom:    { label: 'Custom',     color: '#8b5cf6', fill: '#ede9fe' },
};

const SHAPE_TYPES = Object.keys(SHAPE_CONFIG) as ShapeType[];

const GRID_SCALE_OPTIONS = [1, 2, 5, 10];

const MINOR_GRID = 1;   // every 1 unit
const MAJOR_EVERY = 5;  // every 5 units

// ── Helpers ───────────────────────────────────────────────────────────────

function centroid(pts: Point[]): Point {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}

function boundingBox(pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)),
    maxY: Math.max(...pts.map(p => p.y)),
  };
}

function ptsToSvgPath(pts: Point[]): string {
  if (pts.length < 2) return '';
  const [first, ...rest] = pts;
  return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
}

function worldToSvg(p: Point, pan: Point, zoom: number): Point {
  return { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y };
}

function svgToWorld(p: Point, pan: Point, zoom: number): Point {
  return { x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom };
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Design state
  const [design, setDesign] = useState<YardDesign>({ gridScale: 5, shapes: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Tool state
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [shapeType, setShapeType] = useState<ShapeType>('house');
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);

  // Viewport state (committed)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(40); // px per grid unit

  // Viewport refs for panning (no re-render during drag)
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOriginRef = useRef<Point>({ x: 0, y: 0 });

  // Drag state (shape-move or vertex-move in select mode)
  const dragModeRef = useRef<'none' | 'shape' | 'vertex'>('none');
  const dragShapeIdRef = useRef<string | null>(null);
  const dragVertexIdxRef = useRef<number>(-1);
  const dragStartWorldRef = useRef<Point>({ x: 0, y: 0 });
  const dragOrigPointsRef = useRef<Point[]>([]);

  // Baseline JSON for auto-save diffing (skip save on initial load)
  const loadedDesignJsonRef = useRef<string>('');

  // Mouse position in world coords
  const [cursorWorld, setCursorWorld] = useState<Point | null>(null);

  // Canvas SVG ref
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  // Quick Add form
  const [quickLabel, setQuickLabel] = useState('');
  const [quickWidth, setQuickWidth] = useState('');
  const [quickHeight, setQuickHeight] = useState('');

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  // ── Load project ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    axios.get<Project>(`/api/projects/${id}`)
      .then(res => {
        const proj: Project = res.data;
        setProject(proj);
        if (proj.yard_design) {
          try {
            const parsed: YardDesign = JSON.parse(proj.yard_design);
            setDesign(parsed);
            loadedDesignJsonRef.current = proj.yard_design;
          } catch {
            // ignore
          }
        } else {
          loadedDesignJsonRef.current = JSON.stringify({ gridScale: 5, shapes: [] });
        }
        hasLoadedRef.current = true;
      })
      .catch(() => toast.error('Failed to load project'))
      .finally(() => setLoading(false));
  }, [id]);

  // Centre canvas origin on first load
  useEffect(() => {
    if (!canvasWrapRef.current) return;
    const { width, height } = canvasWrapRef.current.getBoundingClientRect();
    const initialPan = { x: width / 2, y: height / 2 };
    setPan(initialPan);
    panRef.current = initialPan;
  }, [loading]);

  // ── Auto-save ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasLoadedRef.current || !id) return;
    const currentJson = JSON.stringify(design);
    if (currentJson === loadedDesignJsonRef.current) return; // unchanged since last save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await axios.put(`/api/projects/${id}`, { yard_design: currentJson });
        loadedDesignJsonRef.current = currentJson; // update baseline on success
      } catch {
        toast.error('Auto-save failed');
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [design, id]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (toolMode === 'draw') { setDrawPoints([]); setToolMode('select'); }
        else setSelectedId(null);
      }
      if (e.key === 'Enter' && toolMode === 'draw' && drawPoints.length >= 3) {
        finishShape();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && toolMode !== 'draw') {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode, drawPoints, selectedId]);

  // ── SVG event helpers ─────────────────────────────────────────────────

  function getSvgPoint(e: MouseEvent): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function getWorldPoint(svgPt: Point): Point {
    return svgToWorld(svgPt, panRef.current, zoom);
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  const mouseMoveStartRef = useRef<Point | null>(null);

  function handleCanvasMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const svgPt = getSvgPoint(e);
    mouseMoveStartRef.current = svgPt;

    // Pan when: pan mode, alt-key held, or select mode clicking on empty canvas space.
    // Shape/vertex onMouseDown handlers stop propagation, so this only fires on empty space.
    if (toolMode === 'pan' || e.altKey || toolMode === 'select') {
      isPanningRef.current = true;
      panStartRef.current = svgPt;
      panOriginRef.current = { ...panRef.current };
    }
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    const svgPt = getSvgPoint(e);
    const worldPt = getWorldPoint(svgPt);
    setCursorWorld(worldPt);

    if (dragModeRef.current === 'shape' && dragShapeIdRef.current) {
      const dx = worldPt.x - dragStartWorldRef.current.x;
      const dy = worldPt.y - dragStartWorldRef.current.y;
      const shapeId = dragShapeIdRef.current;
      const origPts = dragOrigPointsRef.current;
      setDesign(d => ({
        ...d,
        shapes: d.shapes.map(s =>
          s.id === shapeId
            ? { ...s, points: origPts.map(p => ({ x: p.x + dx, y: p.y + dy })) }
            : s
        ),
      }));
    } else if (dragModeRef.current === 'vertex' && dragShapeIdRef.current) {
      const shapeId = dragShapeIdRef.current;
      const idx = dragVertexIdxRef.current;
      setDesign(d => ({
        ...d,
        shapes: d.shapes.map(s =>
          s.id === shapeId
            ? { ...s, points: s.points.map((p, i) => (i === idx ? worldPt : p)) }
            : s
        ),
      }));
    } else if (isPanningRef.current) {
      const dx = svgPt.x - panStartRef.current.x;
      const dy = svgPt.y - panStartRef.current.y;
      panRef.current = {
        x: panOriginRef.current.x + dx,
        y: panOriginRef.current.y + dy,
      };
      setPan({ ...panRef.current });
    }
  }

  function handleCanvasMouseUp(e: MouseEvent) {
    const svgPt = getSvgPoint(e);
    const start = mouseMoveStartRef.current;
    const moved = start
      ? Math.sqrt(Math.pow(svgPt.x - start.x, 2) + Math.pow(svgPt.y - start.y, 2))
      : 999;

    // End shape / vertex drag
    if (dragModeRef.current !== 'none') {
      dragModeRef.current = 'none';
      dragShapeIdRef.current = null;
      dragVertexIdxRef.current = -1;
      mouseMoveStartRef.current = null;
      return;
    }

    // End pan — if it was a small movement treat as a click
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setPan({ ...panRef.current });
      if (moved < 5 && toolMode === 'select') setSelectedId(null); // deselect on empty-space click
      mouseMoveStartRef.current = null;
      return;
    }

    // Draw mode click
    if (moved < 5 && toolMode === 'draw') {
      const worldPt = getWorldPoint(svgPt);
      setDrawPoints(prev => [...prev, worldPt]);
    }
    mouseMoveStartRef.current = null;
  }

  function handleCanvasLeave() {
    setCursorWorld(null);
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setPan({ ...panRef.current });
    }
    if (dragModeRef.current !== 'none') {
      dragModeRef.current = 'none';
      dragShapeIdRef.current = null;
      dragVertexIdxRef.current = -1;
    }
    mouseMoveStartRef.current = null;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const svgPt = getSvgPoint(e);
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    const newZoom = Math.max(5, Math.min(200, zoom * delta));
    // Zoom toward cursor
    const worldPt = svgToWorld(svgPt, panRef.current, zoom);
    const newPanX = svgPt.x - worldPt.x * newZoom;
    const newPanY = svgPt.y - worldPt.y * newZoom;
    panRef.current = { x: newPanX, y: newPanY };
    setPan({ x: newPanX, y: newPanY });
    setZoom(newZoom);
  }

  function finishShape() {
    if (drawPoints.length < 2) return;
    const cfg = SHAPE_CONFIG[shapeType];
    const newShape: GridShape = {
      id: uuidv4(),
      type: shapeType,
      label: cfg.label,
      points: drawPoints,
      color: cfg.color,
      fill: cfg.fill,
    };
    setDesign(d => ({ ...d, shapes: [...d.shapes, newShape] }));
    setDrawPoints([]);
    setToolMode('select');
    setSelectedId(newShape.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setDesign(d => ({ ...d, shapes: d.shapes.filter(s => s.id !== selectedId) }));
    setSelectedId(null);
  }

  function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    const w = parseFloat(quickWidth);
    const h = parseFloat(quickHeight);
    if (!w || !h) { toast.error('Enter valid width and height'); return; }
    const label = quickLabel.trim() || SHAPE_CONFIG[shapeType].label;

    // Place at current canvas center in world coords
    const svgEl = svgRef.current;
    let cx = 0, cy = 0;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const center = svgToWorld({ x: rect.width / 2, y: rect.height / 2 }, panRef.current, zoom);
      cx = center.x;
      cy = center.y;
    }

    const hw = w / 2, hh = h / 2;
    const points: Point[] = [
      { x: cx - hw, y: cy - hh },
      { x: cx + hw, y: cy - hh },
      { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh },
    ];

    const cfg = SHAPE_CONFIG[shapeType];
    const newShape: GridShape = {
      id: uuidv4(),
      type: shapeType,
      label,
      points,
      color: cfg.color,
      fill: cfg.fill,
    };
    setDesign(d => ({ ...d, shapes: [...d.shapes, newShape] }));
    setSelectedId(newShape.id);
    setQuickLabel('');
    setQuickWidth('');
    setQuickHeight('');
    toast.success(`${label} added`);
  }

  // ── Photo upload ──────────────────────────────────────────────────────

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || !files.length || !id) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', files[0]);
      const res = await axios.post(`/api/projects/${id}/images`, formData);
      setProject(p => p ? { ...p, images: [...p.images, res.data] } : p);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [id]);

  const handleDeleteImage = useCallback(async (imgId: number) => {
    if (!id) return;
    if (!confirm('Delete this photo?')) return;
    try {
      await axios.delete(`/api/projects/${id}/images/${imgId}`);
      setProject(p => p ? { ...p, images: p.images.filter(i => i.id !== imgId) } : p);
      toast.success('Photo deleted');
    } catch {
      toast.error('Failed to delete photo');
    }
  }, [id]);

  // ── Grid rendering ────────────────────────────────────────────────────

  function renderGrid(svgWidth: number, svgHeight: number) {
    const lines: ReactNode[] = [];

    // Compute visible world range
    const worldTopLeft = svgToWorld({ x: 0, y: 0 }, pan, zoom);
    const worldBottomRight = svgToWorld({ x: svgWidth, y: svgHeight }, pan, zoom);

    const startX = Math.floor(worldTopLeft.x / MINOR_GRID) * MINOR_GRID;
    const endX   = Math.ceil(worldBottomRight.x / MINOR_GRID) * MINOR_GRID;
    const startY = Math.floor(worldTopLeft.y / MINOR_GRID) * MINOR_GRID;
    const endY   = Math.ceil(worldBottomRight.y / MINOR_GRID) * MINOR_GRID;

    for (let gx = startX; gx <= endX; gx += MINOR_GRID) {
      const sx = gx * zoom + pan.x;
      const isMajor = gx % MAJOR_EVERY === 0;
      lines.push(
        <line key={`vx${gx}`}
          x1={sx} y1={0} x2={sx} y2={svgHeight}
          stroke={isMajor ? '#cbd5e1' : '#e2e8f0'}
          strokeWidth={isMajor ? 0.8 : 0.4}
        />
      );
    }
    for (let gy = startY; gy <= endY; gy += MINOR_GRID) {
      const sy = gy * zoom + pan.y;
      const isMajor = gy % MAJOR_EVERY === 0;
      lines.push(
        <line key={`hy${gy}`}
          x1={0} y1={sy} x2={svgWidth} y2={sy}
          stroke={isMajor ? '#cbd5e1' : '#e2e8f0'}
          strokeWidth={isMajor ? 0.8 : 0.4}
        />
      );
    }

    return lines;
  }

  // ── Scale indicator ───────────────────────────────────────────────────

  function ScaleIndicator() {
    // Show a bar representing ~50px wide in real-world feet
    const feetPerPx = design.gridScale / zoom;
    const targetPx = 80;
    const rawFeet = targetPx * feetPerPx;
    // Round to nice number
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].reduce((prev, curr) =>
      Math.abs(curr - rawFeet) < Math.abs(prev - rawFeet) ? curr : prev
    );
    const barPx = nice / feetPerPx;
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <div className="relative" style={{ width: barPx }}>
          <div className="border-b-2 border-l-2 border-r-2 border-gray-400 h-2" style={{ width: barPx }} />
        </div>
        <span>{nice} ft</span>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Project not found.
      </div>
    );
  }

  const svgWidth  = canvasWrapRef.current?.clientWidth  ?? 800;
  const svgHeight = canvasWrapRef.current?.clientHeight ?? 600;

  const cursor =
    toolMode === 'pan'    ? 'cursor-grab'
    : toolMode === 'draw' ? 'cursor-crosshair'
    : 'cursor-default';

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shrink-0 z-10">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="font-semibold text-gray-900 truncate">{project.name}</h1>
        {project.address && (
          <>
            <span className="text-gray-300 hidden sm:inline">•</span>
            <span className="text-sm text-gray-500 truncate hidden sm:block">{project.address}</span>
          </>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Main canvas area ── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 h-10 bg-white border-b border-gray-200 shrink-0 flex-wrap">

            {/* Tool mode buttons */}
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
              <button
                title="Select / Move shapes"
                onClick={() => { setToolMode('select'); setDrawPoints([]); }}
                className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${toolMode === 'select' ? 'bg-forest-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <Square className="w-3.5 h-3.5" /> Select
              </button>
              <button
                title="Pan canvas"
                onClick={() => { setToolMode('pan'); setDrawPoints([]); }}
                className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors border-l border-gray-200 ${toolMode === 'pan' ? 'bg-forest-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <Move className="w-3.5 h-3.5" /> Pan
              </button>
              <button
                title="Draw polygon"
                onClick={() => { setToolMode('draw'); setDrawPoints([]); }}
                className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors border-l border-gray-200 ${toolMode === 'draw' ? 'bg-forest-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <Pencil className="w-3.5 h-3.5" /> Draw
              </button>
            </div>

            {/* Shape type selector */}
            <div className="relative flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={shapeType}
                onChange={e => setShapeType(e.target.value as ShapeType)}
                className="text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-forest-500"
              >
                {SHAPE_TYPES.map(t => (
                  <option key={t} value={t}>{SHAPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>

            {/* Grid scale */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">Scale:</span>
              <select
                value={design.gridScale}
                onChange={e => setDesign(d => ({ ...d, gridScale: Number(e.target.value) }))}
                className="text-xs border border-gray-200 rounded px-1 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-forest-500"
              >
                {GRID_SCALE_OPTIONS.map(s => (
                  <option key={s} value={s}>{s} ft/sq</option>
                ))}
              </select>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setZoom(z => Math.min(200, +(z * 1.25).toFixed(1)))}
                title="Zoom in"
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(z => Math.max(5, +(z * 0.8).toFixed(1)))}
                title="Zoom out"
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const w = canvasWrapRef.current?.clientWidth ?? 800;
                  const h = canvasWrapRef.current?.clientHeight ?? 600;
                  const newPan = { x: w / 2, y: h / 2 };
                  setPan(newPan);
                  panRef.current = newPan;
                  setZoom(40);
                }}
                title="Reset view"
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
              >
                <Home className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Draw mode controls */}
            {toolMode === 'draw' && (
              <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-200">
                <span className="text-xs text-blue-600 font-medium">
                  {drawPoints.length === 0 ? 'Click to start polygon' : `${drawPoints.length} pts — Enter or`}
                </span>
                {drawPoints.length >= 3 && (
                  <button
                    onClick={finishShape}
                    className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded transition-colors"
                  >
                    <Check className="w-3 h-3" /> Finish
                  </button>
                )}
                <button
                  onClick={() => { setDrawPoints([]); setToolMode('select'); }}
                  className="flex items-center gap-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded transition-colors"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            )}

            {/* Delete selected */}
            {selectedId && toolMode !== 'draw' && (
              <button
                onClick={deleteSelected}
                title="Delete selected shape (Del)"
                className="ml-auto flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>

          {/* Canvas */}
          <div
            ref={canvasWrapRef}
            className={`flex-1 relative overflow-hidden bg-white ${cursor}`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasLeave}
            onWheel={handleWheel}
          >
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              style={{ display: 'block' }}
            >
              {/* Grid */}
              <g>{renderGrid(svgWidth, svgHeight)}</g>

              {/* Origin crosshair */}
              <circle
                cx={pan.x} cy={pan.y} r={3}
                fill="#94a3b8" opacity={0.5}
              />

              {/* Shapes */}
              {design.shapes.map(shape => {
                const svgPts = shape.points.map(p => worldToSvg(p, pan, zoom));
                const path = ptsToSvgPath(svgPts);
                const c = centroid(svgPts);
                const bb = boundingBox(shape.points);
                const wFt = Math.round(bb.maxX - bb.minX);
                const hFt = Math.round(bb.maxY - bb.minY);
                const isSelected = shape.id === selectedId;

                return (
                  <g key={shape.id}>
                    {/* Invisible hit-area slightly larger than the shape for easier grabbing */}
                    <path
                      d={path}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth={10}
                      style={{ cursor: toolMode === 'select' ? 'move' : 'default' }}
                      onMouseDown={(e) => {
                        if (toolMode !== 'select') return;
                        e.stopPropagation();
                        setSelectedId(shape.id);
                        // Start shape drag from current world position
                        const svgPt = getSvgPoint(e as unknown as MouseEvent);
                        const worldPt = getWorldPoint(svgPt);
                        dragModeRef.current = 'shape';
                        dragShapeIdRef.current = shape.id;
                        dragStartWorldRef.current = worldPt;
                        dragOrigPointsRef.current = shape.points.map(p => ({ ...p }));
                        mouseMoveStartRef.current = svgPt;
                      }}
                    />
                    <path
                      d={path}
                      fill={shape.fill}
                      fillOpacity={0.7}
                      stroke={shape.color}
                      strokeWidth={isSelected ? 0 : 1.5}
                      style={{ pointerEvents: 'none' }}
                    />
                    {isSelected && (
                      <path
                        d={path}
                        fill="none"
                        stroke={shape.color}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Vertex dots — draggable when selected */}
                    {isSelected && svgPts.map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r={6}
                        fill="white" stroke={shape.color} strokeWidth={2}
                        style={{ cursor: 'crosshair' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const svgPt = getSvgPoint(e as unknown as MouseEvent);
                          dragModeRef.current = 'vertex';
                          dragShapeIdRef.current = shape.id;
                          dragVertexIdxRef.current = i;
                          dragStartWorldRef.current = getWorldPoint(svgPt);
                          mouseMoveStartRef.current = svgPt;
                        }}
                      />
                    ))}
                    {/* Label */}
                    <text
                      x={c.x} y={c.y - 6}
                      textAnchor="middle"
                      fontSize={Math.max(9, Math.min(14, zoom * 0.3))}
                      fontWeight="600"
                      fill={shape.color}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {shape.label}
                    </text>
                    {wFt > 0 && hFt > 0 && (
                      <text
                        x={c.x} y={c.y + 8}
                        textAnchor="middle"
                        fontSize={Math.max(8, Math.min(11, zoom * 0.22))}
                        fill={shape.color}
                        opacity={0.75}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {wFt * design.gridScale}′ × {hFt * design.gridScale}′
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Drawing preview */}
              {drawPoints.length > 0 && (() => {
                const svgPts = drawPoints.map(p => worldToSvg(p, pan, zoom));
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    {svgPts.map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r={4}
                        fill={SHAPE_CONFIG[shapeType].color} opacity={0.8}
                      />
                    ))}
                    {svgPts.length > 1 && (
                      <polyline
                        points={svgPts.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={SHAPE_CONFIG[shapeType].color}
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        opacity={0.7}
                      />
                    )}
                  </g>
                );
              })()}

              {/* Cursor crosshair while drawing */}
              {toolMode === 'draw' && cursorWorld && (() => {
                const sp = worldToSvg(cursorWorld, pan, zoom);
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={sp.x} y1={sp.y - 8} x2={sp.x} y2={sp.y + 8}
                      stroke={SHAPE_CONFIG[shapeType].color} strokeWidth={1} opacity={0.6} />
                    <line x1={sp.x - 8} y1={sp.y} x2={sp.x + 8} y2={sp.y}
                      stroke={SHAPE_CONFIG[shapeType].color} strokeWidth={1} opacity={0.6} />
                  </g>
                );
              })()}
            </svg>

            {/* Bottom bar: cursor coords + scale */}
            <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between pointer-events-none">
              <div className="text-xs text-gray-400 bg-white/80 px-2 py-0.5 rounded">
                {cursorWorld
                  ? `${(cursorWorld.x * design.gridScale).toFixed(0)}′, ${(cursorWorld.y * design.gridScale).toFixed(0)}′`
                  : '—'
                }
              </div>
              <div className="pointer-events-auto">
                <ScaleIndicator />
              </div>
            </div>
          </div>

          {/* Quick Add row */}
          <div className="bg-white border-t border-gray-200 px-3 py-2 shrink-0">
            <form onSubmit={handleQuickAdd} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 shrink-0">Quick Add:</span>
              <input
                type="text"
                placeholder="Label (optional)"
                value={quickLabel}
                onChange={e => setQuickLabel(e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-forest-500"
              />
              <input
                type="number"
                placeholder="Width (ft)"
                value={quickWidth}
                onChange={e => setQuickWidth(e.target.value)}
                min="1"
                className="text-xs border border-gray-200 rounded px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-forest-500"
              />
              <span className="text-xs text-gray-400">×</span>
              <input
                type="number"
                placeholder="Height (ft)"
                value={quickHeight}
                onChange={e => setQuickHeight(e.target.value)}
                min="1"
                className="text-xs border border-gray-200 rounded px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-forest-500"
              />
              <button
                type="submit"
                className="flex items-center gap-1 text-xs bg-forest-600 hover:bg-forest-700 text-white px-3 py-1 rounded transition-colors"
              >
                <Plus className="w-3 h-3" /> Place
              </button>
            </form>
          </div>
        </div>

        {/* ── Right Reference Panel ── */}
        <aside className="w-[250px] shrink-0 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">

          {/* Aerial View */}
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Satellite className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Aerial Reference</span>
            </div>
            {project.lat && project.lng ? (
              <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 180 }}>
                <MapContainer
                  center={[project.lat, project.lng]}
                  zoom={19}
                  style={{ height: '100%', width: '100%' }}
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                  keyboard={false}
                  touchZoom={false}
                  zoomControl={false}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxNativeZoom={20}
                    maxZoom={22}
                  />
                </MapContainer>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400"
                style={{ height: 120 }}>
                No location set
              </div>
            )}
          </div>

          {/* Photos */}
          <div className="p-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Photos</span>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-2 py-1 rounded transition-colors"
              >
                <Upload className="w-3 h-3" />
                {uploading ? '…' : 'Upload'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleUpload(e.target.files)}
              />
            </div>

            {project.images.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-6">
                No photos yet. Upload yard photos for reference.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {project.images.map(img => (
                  <div key={img.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={`/uploads/${img.filename}`}
                      alt={img.original_name}
                      className="w-full h-20 object-cover"
                    />
                    <button
                      onClick={() => handleDeleteImage(img.id)}
                      className="absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
