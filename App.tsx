
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Point, Complex, Coefficient } from './types';
import * as MathDomain from './domain/math';
import * as StrokeService from './application/strokeService';
import Canvas from './components/Canvas';
import { Search, Eye, RotateCcw, ZoomIn } from 'lucide-react';

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<'visualizer' | 'data'>('visualizer');

  // UI & Engine State
  const [isDrawingMode, setIsDrawingMode] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [harmonicsK, setHarmonicsK] = useState(64);
  const [samplingN, setSamplingN] = useState(512);
  const [speed, setSpeed] = useState(1.0);
  const [showLabels, setShowLabels] = useState(false);
  const [useSymmetric, setUseSymmetric] = useState(true);
  
  // Zoom, Pan & View Controls
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const [followTip, setFollowTip] = useState(false);

  // Small Circles Inspection Controls
  const [showLoupe, setShowLoupe] = useState(false);
  const [loupeZoom, setLoupeZoom] = useState(10);
  const [emphasizeMicro, setEmphasizeMicro] = useState(false);

  // Path Closure & Reconstruction Controls
  const [autoCloseStroke, setAutoCloseStroke] = useState(true);
  const [hasCompletedCycle, setHasCompletedCycle] = useState(false);
  const [showOriginalSketch, setShowOriginalSketch] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [rawStroke, setRawStroke] = useState<Point[]>([]);
  const [coeffs, setCoeffs] = useState<Coefficient[]>([]);

  // Canvas Refs for physical layout alignment
  const epicycleCanvasRef = useRef<HTMLCanvasElement>(null);
  const pathCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Animation Refs
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);
  const tInternal = useRef(0); // High-frequency time tracker

  const handleClear = () => {
    setRawStroke([]);
    setCoeffs([]);
    setHasCompletedCycle(false);
    setT(0);
    tInternal.current = 0;
    setIsPlaying(false);
    setIsDrawingMode(true);
    setPanOffset({ x: 0, y: 0 });
    setZoomLevel(1.0);
  };

  const resetView = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  /**
   * Main use case: Compute DFT from the current stroke and start animation
   */
  const handleCompute = useCallback((targetStroke?: Point[]) => {
    const strokeToUse = targetStroke || rawStroke;
    if (strokeToUse.length < 2) return;
    
    const strokeClosed = autoCloseStroke ? MathDomain.closeStroke(strokeToUse) : strokeToUse;
    const resampled = MathDomain.resampleStroke(strokeClosed, samplingN, autoCloseStroke);
    const normalized = MathDomain.normalizeSignal(resampled, 500, 500);
    const computedCoeffs = MathDomain.computeDFT(normalized, harmonicsK, useSymmetric);
    
    setCoeffs(computedCoeffs);
    setHasCompletedCycle(false);
    setT(0);
    tInternal.current = 0;
    setIsPlaying(true);
    setIsDrawingMode(false);
  }, [rawStroke, samplingN, harmonicsK, useSymmetric, autoCloseStroke]);

  /**
   * Full reconstructed Fourier curve evaluated from t = 0 to t = 1.
   * Start and end coordinates are mathematically unified to the exact same position.
   */
  const reconstructedPath = React.useMemo(() => {
    if (coeffs.length === 0) return [];
    return MathDomain.computeFullCurve(coeffs, 600);
  }, [coeffs]);

  /**
   * Replay animation from t = 0
   */
  const replayDrawing = () => {
    setHasCompletedCycle(false);
    setT(0);
    tInternal.current = 0;
    setIsPlaying(true);
  };

  /**
   * The Animation Engine
   */
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== null && isPlaying && coeffs.length > 0) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      const prevT = tInternal.current;
      const nextT = prevT + (deltaTime * speed * 0.1);

      if (nextT >= 1.0) {
        setHasCompletedCycle(true);
      }

      tInternal.current = nextT % 1.0;
      setT(tInternal.current);
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, speed, coeffs]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  /**
   * Handlers for predefined shapes
   */
  const handleShapeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const shape = e.target.value;
    let points: Point[] = [];
    switch (shape) {
      case 'star': points = StrokeService.loadSampleStar(); break;
      case 'square': points = StrokeService.generateSquare(); break;
      case 'triangle': points = StrokeService.generateTriangle(); break;
      case 'pentagon': points = StrokeService.generatePentagon(); break;
      case 'heart': points = StrokeService.generateHeart(); break;
      case 'circle': points = StrokeService.generateCircle(); break;
      default: return;
    }
    setRawStroke(points);
    setCoeffs([]);
    setHasCompletedCycle(false);
    setT(0);
    tInternal.current = 0;
    setIsDrawingMode(true);
    setIsPlaying(false);
  };

  /**
   * UI Adapter: Render the user's raw sketch
   */
  const onDrawCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    if (rawStroke.length < 1) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Draw a shape here!", w / 2, h / 2 - 10);
      ctx.font = "14px sans-serif";
      ctx.fillText("(Click & drag to sketch or select below)", w / 2, h / 2 + 15);
      return;
    }

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rawStroke[0].x, rawStroke[0].y);
    for (let i = 1; i < rawStroke.length; i++) {
      ctx.lineTo(rawStroke[i].x, rawStroke[i].y);
    }
    // If autoClose is active and user is not currently in the middle of dragging, close the preview
    if (!isDrawing && autoCloseStroke && rawStroke.length >= 3) {
      ctx.closePath();
    }
    ctx.stroke();

    // Start anchor / closure node
    if (rawStroke.length > 0) {
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(rawStroke[0].x, rawStroke[0].y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [rawStroke, isDrawing, autoCloseStroke]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setRawStroke([{ x, y }]);
    setCoeffs([]);
    setHasCompletedCycle(false);
    setT(0);
    tInternal.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingMode || !isDrawing || e.buttons !== 1) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRawStroke(prev => [...prev, { x, y }]);
  };

  const handlePointerUp = () => {
    if (!isDrawingMode || !isDrawing) return;
    setIsDrawing(false);
    if (autoCloseStroke) {
      setRawStroke(prev => {
        if (prev.length < 3) return prev;
        return MathDomain.closeStroke(prev);
      });
    }
  };

  const handleViewportWheel = (e: React.WheelEvent) => {
    if (isDrawingMode) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoomLevel(prev => Math.min(30, Math.max(0.5, prev * factor)));
  };

  const handlePanStart = (e: React.PointerEvent) => {
    if (isDrawingMode || e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handlePanMove = (e: React.PointerEvent) => {
    if (!isPanning || isDrawingMode) return;
    setPanOffset({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y
    });
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  /**
   * UI Adapter: Render Epicycle Chain (LEFT)
   */
  const onEpicycleCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const centerX = w / 2;
    const centerY = h / 2;

    if (coeffs.length === 0) {
       ctx.strokeStyle = "rgba(229, 231, 235, 0.7)";
       ctx.lineWidth = 1;
       ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, h); ctx.stroke();
       return;
    }

    const sums = MathDomain.evaluateSum(coeffs, t);
    const tip = sums[sums.length - 1];
    
    ctx.save();
    ctx.translate(centerX, centerY);
    if (followTip) {
      ctx.translate(-tip.x * zoomLevel, -tip.y * zoomLevel);
    } else {
      ctx.translate(panOffset.x, panOffset.y);
    }
    ctx.scale(zoomLevel, zoomLevel);

    // Reference axes centered at origin
    ctx.strokeStyle = "rgba(229, 231, 235, 0.5)";
    ctx.lineWidth = 1 / zoomLevel;
    ctx.beginPath(); ctx.moveTo(-w * 10, 0); ctx.lineTo(w * 10, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -h * 10); ctx.lineTo(0, h * 10); ctx.stroke();

    for (let i = 0; i < coeffs.length; i++) {
      const c = coeffs[i];
      const start = sums[i];
      const end = sums[i + 1];
      const isMicro = c.amp < 6 || i > coeffs.length * 0.7;

      // Circle stroke: micro-circles are highlighted in electric violet with crisp stroke
      if (isMicro) {
        ctx.strokeStyle = emphasizeMicro ? "rgba(168, 85, 247, 0.85)" : "rgba(168, 85, 247, 0.55)";
        ctx.lineWidth = Math.max((emphasizeMicro ? 1.8 : 1.2) / zoomLevel, 0.75 / zoomLevel);
      } else {
        ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
        ctx.lineWidth = Math.max(1.2 / zoomLevel, 0.6 / zoomLevel);
      }
      ctx.beginPath();
      ctx.arc(start.x, start.y, c.amp, 0, Math.PI * 2);
      ctx.stroke();

      // Vector arm
      ctx.strokeStyle = isMicro ? "#9333ea" : (i === 0 ? "rgba(79, 70, 229, 0.4)" : "#4f46e5");
      ctx.lineWidth = (i === 0 ? 1.5 : (isMicro ? 1.8 : 2)) / zoomLevel;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Pivot node for micro-circles so joints don't blur together
      if (isMicro && (zoomLevel > 1.2 || emphasizeMicro)) {
        ctx.fillStyle = "#c084fc";
        ctx.beginPath();
        ctx.arc(start.x, start.y, Math.max(1.8 / zoomLevel, 0.8), 0, Math.PI * 2);
        ctx.fill();
      }

      // Arrows for rotating vectors
      const minAmpForArrow = emphasizeMicro ? 2.5 : 5;
      if (c.amp * zoomLevel > minAmpForArrow) {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowSize = 6 / zoomLevel;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - arrowSize * Math.cos(angle - Math.PI / 6), end.y - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - arrowSize * Math.cos(angle + Math.PI / 6), end.y - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }

      if (showLabels && i < 6 && c.amp * zoomLevel > 10) {
        ctx.fillStyle = "rgba(30, 27, 75, 0.9)";
        ctx.font = `bold ${10 / zoomLevel}px monospace`;
        ctx.fillText(`k:${c.k}`, end.x + 5 / zoomLevel, end.y - 5 / zoomLevel);
      }
    }

    ctx.fillStyle = "#ef4444";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(239, 68, 68, 0.6)";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 5.5 / zoomLevel, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }, [coeffs, t, showLabels, zoomLevel, followTip, panOffset, emphasizeMicro]);

  /**
   * UI Adapter: Render Reconstructed Path (RIGHT)
   * Connects start and end points cleanly at identical coordinates
   */
  const onPathCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const centerX = w / 2;
    const centerY = h / 2;

    // Matching centered coordinate axes on reconstruction canvas
    ctx.strokeStyle = "rgba(229, 231, 235, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, h); ctx.stroke();

    if (coeffs.length === 0 || reconstructedPath.length === 0) return;

    ctx.save();
    ctx.translate(centerX, centerY);

    // 1. Optional: Show original sketch overlay for direct visual comparison
    if (showOriginalSketch && rawStroke.length > 1) {
      const normalizedRaw = MathDomain.normalizeSignal(
        MathDomain.resampleStroke(rawStroke, samplingN, autoCloseStroke),
        500,
        500
      );
      if (normalizedRaw.length > 0) {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.35)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(normalizedRaw[0].re, normalizedRaw[0].im);
        for (let i = 1; i < normalizedRaw.length; i++) {
          ctx.lineTo(normalizedRaw[i].re, normalizedRaw[i].im);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 2. Guide trace of the full reconstruction before cycle 1 completes
    if (!hasCompletedCycle) {
      ctx.strokeStyle = "rgba(209, 213, 219, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(reconstructedPath[0].x, reconstructedPath[0].y);
      for (let i = 1; i < reconstructedPath.length; i++) {
        ctx.lineTo(reconstructedPath[i].x, reconstructedPath[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Active solid reconstruction stroke
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (hasCompletedCycle) {
      // Completed full cycle: render the full closed shape!
      ctx.beginPath();
      ctx.moveTo(reconstructedPath[0].x, reconstructedPath[0].y);
      for (let i = 1; i < reconstructedPath.length; i++) {
        ctx.lineTo(reconstructedPath[i].x, reconstructedPath[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      // Progressively drawing the first cycle:
      const steps = reconstructedPath.length - 1;
      const maxIndex = Math.min(steps, Math.floor(t * steps));
      if (maxIndex > 0) {
        ctx.beginPath();
        ctx.moveTo(reconstructedPath[0].x, reconstructedPath[0].y);
        for (let i = 1; i <= maxIndex; i++) {
          ctx.lineTo(reconstructedPath[i].x, reconstructedPath[i].y);
        }
        const currentTip = MathDomain.evaluateSum(coeffs, t).slice(-1)[0];
        ctx.lineTo(currentTip.x, currentTip.y);
        ctx.stroke();
      }
    }

    // 4. Draw the pen tip synchronously from current Fourier sum evaluation
    const sums = MathDomain.evaluateSum(coeffs, t);
    const currentTip = sums[sums.length - 1];

    ctx.fillStyle = "#ef4444";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(239, 68, 68, 0.5)";
    ctx.beginPath();
    ctx.arc(currentTip.x, currentTip.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Draw start/end junction node with subtle pulse ring
    const origin = reconstructedPath[0];
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [coeffs, reconstructedPath, hasCompletedCycle, t, showOriginalSketch, rawStroke, samplingN, autoCloseStroke]);

  /**
   * UI Adapter: Render Connecting Line (FULL OVERLAY)
   * Precisely aligned horizontally to the centers of both views
   */
  const onOverlayCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    if (coeffs.length === 0 || !isPlaying || currentView !== 'visualizer') return;

    const overlayCanvas = overlayCanvasRef.current;
    const leftCanvas = epicycleCanvasRef.current;
    const rightCanvas = pathCanvasRef.current;

    const overlayRect = overlayCanvas?.getBoundingClientRect();
    const leftRect = leftCanvas?.getBoundingClientRect();
    const rightRect = rightCanvas?.getBoundingClientRect();

    const leftCenterX = (leftRect && overlayRect)
      ? (leftRect.left - overlayRect.left) + leftRect.width / 2
      : w / 4;
    const leftCenterY = (leftRect && overlayRect)
      ? (leftRect.top - overlayRect.top) + leftRect.height / 2
      : h / 2;

    const rightCenterX = (rightRect && overlayRect)
      ? (rightRect.left - overlayRect.left) + rightRect.width / 2
      : (3 * w) / 4;
    const rightCenterY = (rightRect && overlayRect)
      ? (rightRect.top - overlayRect.top) + rightRect.height / 2
      : h / 2;

    const sums = MathDomain.evaluateSum(coeffs, t);
    const tip = sums[sums.length - 1];

    let xA = leftCenterX;
    let yA = leftCenterY;
    if (followTip) {
      xA = leftCenterX;
      yA = leftCenterY;
    } else {
      xA = leftCenterX + tip.x * zoomLevel + panOffset.x;
      yA = leftCenterY + tip.y * zoomLevel + panOffset.y;
    }

    const xB = rightCenterX + tip.x;
    const yB = rightCenterY + tip.y;

    // Connecting horizontal guide line between epicycles and drawing pen
    ctx.strokeStyle = "rgba(239, 68, 68, 0.65)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Concentric target indicators
    ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
    ctx.beginPath(); ctx.arc(xA, yA, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(xB, yB, 8, 0, Math.PI * 2); ctx.fill();
  }, [coeffs, t, isPlaying, zoomLevel, followTip, panOffset, currentView]);

  /**
   * UI Adapter: Render Tip Loupe (Magnifier for micro-epicycles)
   */
  const onLoupeCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    if (coeffs.length === 0) return;

    const sums = MathDomain.evaluateSum(coeffs, t);
    const tip = sums[sums.length - 1];

    const centerX = w / 2;
    const centerY = h / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(loupeZoom, loupeZoom);
    ctx.translate(-tip.x, -tip.y);

    // Subtle coordinate reticle
    ctx.strokeStyle = "rgba(229, 231, 235, 0.6)";
    ctx.lineWidth = 1 / loupeZoom;
    ctx.beginPath(); ctx.moveTo(tip.x - 30, tip.y); ctx.lineTo(tip.x + 30, tip.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y - 30); ctx.lineTo(tip.x, tip.y + 30); ctx.stroke();

    // Render the terminal micro-epicycles (last 20 epicycles)
    const startIndex = Math.max(0, coeffs.length - 20);
    for (let i = startIndex; i < coeffs.length; i++) {
      const c = coeffs[i];
      const start = sums[i];
      const end = sums[i + 1];

      ctx.strokeStyle = "rgba(168, 85, 247, 0.75)";
      ctx.lineWidth = Math.max(1.4 / loupeZoom, 0.8);
      ctx.beginPath();
      ctx.arc(start.x, start.y, c.amp, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#9333ea";
      ctx.lineWidth = Math.max(2 / loupeZoom, 1);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Pivot node
      ctx.fillStyle = "#c084fc";
      ctx.beginPath();
      ctx.arc(start.x, start.y, Math.max(2 / loupeZoom, 1), 0, Math.PI * 2);
      ctx.fill();

      // Vector arrow
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const arrowSize = Math.max(4.5 / loupeZoom, 2);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - arrowSize * Math.cos(angle - Math.PI / 6), end.y - arrowSize * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - arrowSize * Math.cos(angle + Math.PI / 6), end.y - arrowSize * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    // Pen tip dot
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, Math.max(3.5 / loupeZoom, 1.8), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [coeffs, t, loupeZoom]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 select-none">
      {/* TABS / NAVIGATION */}
      <div className="bg-gray-900 px-6 py-2 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-1 font-black text-white tracking-tighter text-xl italic">
          <span className="text-indigo-400">∑</span> EPI.CYCLE
        </div>
        <div className="flex bg-gray-800 rounded-lg p-1">
          <button 
            onClick={() => setCurrentView('visualizer')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${currentView === 'visualizer' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Visualizer
          </button>
          <button 
            onClick={() => setCurrentView('data')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${currentView === 'data' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Data Analysis
          </button>
        </div>
      </div>

      {currentView === 'visualizer' ? (
        <>
          {/* TOOLBAR */}
          <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-6 text-sm shadow-sm z-50">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  setIsDrawingMode(!isDrawingMode);
                  if (!isDrawingMode) setIsPlaying(false);
                }} 
                className={`px-4 py-2 rounded-lg font-bold transition-all border shadow-sm ${isDrawingMode ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-200' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'}`}
              >
                {isDrawingMode ? '✏️ Sketching' : '✍️ Switch to Sketch'}
              </button>
              
              <button onClick={handleClear} className="px-3 py-2 bg-gray-50 hover:bg-gray-200 rounded-lg border text-gray-500 font-medium">Clear</button>
              
              <button 
                disabled={rawStroke.length < 2}
                onClick={() => handleCompute()}
                className={`px-5 py-2 rounded-lg font-bold border transition-all ${rawStroke.length < 2 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-green-600 text-white border-green-700 hover:bg-green-700 shadow-md active:scale-95'}`}
              >
                Compute & Play
              </button>
            </div>

            <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
              <button 
                onClick={() => setIsPlaying(!isPlaying)} 
                disabled={coeffs.length === 0}
                className={`w-11 h-11 flex items-center justify-center rounded-full shadow-sm transition-all ${coeffs.length === 0 ? 'bg-gray-100 text-gray-300' : isPlaying ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                ) : (
                  <svg className="w-5 h-5 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
            </div>

            <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Zoom: {zoomLevel.toFixed(1)}x</span>
                <input type="range" min="0.5" max="25.0" step="0.5" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="w-24 h-1.5 bg-gray-200 rounded-lg cursor-pointer accent-indigo-600" />
              </label>
              {(zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
                <button 
                  onClick={resetView} 
                  title="Reset Zoom & Pan" 
                  className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded border border-gray-200 text-xs flex items-center gap-1 font-medium transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100">
                <input type="checkbox" checked={followTip} onChange={e => setFollowTip(e.target.checked)} className="w-3.5 h-3.5 rounded text-indigo-600" />
                Focus Tip
              </label>
            </div>

            {/* Small Circles Inspection Tools */}
            <div className="flex items-center gap-2 border-l border-gray-200 pl-6">
              <button
                onClick={() => setShowLoupe(!showLoupe)}
                title="Picture-in-picture magnifier lens focused on the terminal micro-epicycles"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  showLoupe 
                    ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-200' 
                    : 'bg-white text-purple-700 hover:bg-purple-50 border-purple-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Tip Loupe
              </button>

              <button
                onClick={() => setEmphasizeMicro(!emphasizeMicro)}
                title="Highlight high-frequency micro-circles with higher contrast and rotation arrows"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  emphasizeMicro 
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-200' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Highlight Small Circles
              </button>
            </div>

            <div className="flex items-center gap-6 border-l border-gray-200 pl-6">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Speed: {speed.toFixed(1)}x</span>
                <input type="range" min="0.1" max="4.0" step="0.1" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-24 h-1.5 bg-gray-200 rounded-lg cursor-pointer accent-blue-600" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Harmonics K: {harmonicsK}</span>
                <input type="range" min="1" max="256" value={harmonicsK} onChange={e => setHarmonicsK(Number(e.target.value))} className="w-28 h-1.5 bg-gray-200 rounded-lg cursor-pointer accent-blue-600" />
              </label>
            </div>

            {/* Loop Closure & Comparison Controls */}
            <div className="flex items-center gap-2.5 border-l border-gray-200 pl-6">
              <label 
                className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg border border-gray-200 transition-colors"
                title="Automatically connects the start and end of freehand sketches into a closed periodic loop"
              >
                <input 
                  type="checkbox" 
                  checked={autoCloseStroke} 
                  onChange={e => {
                    const checked = e.target.checked;
                    setAutoCloseStroke(checked);
                    if (checked && rawStroke.length >= 3) {
                      setRawStroke(prev => MathDomain.closeStroke(prev));
                    }
                  }} 
                  className="w-3.5 h-3.5 rounded text-indigo-600" 
                />
                Auto-Close
              </label>

              <label 
                className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors"
                title="Overlay the original sketch behind the Fourier reconstruction in View B"
              >
                <input 
                  type="checkbox" 
                  checked={showOriginalSketch} 
                  onChange={e => setShowOriginalSketch(e.target.checked)} 
                  className="w-3.5 h-3.5 rounded text-blue-600" 
                />
                Overlay Sketch
              </label>
            </div>

            <div className="flex items-center gap-3 ml-auto border-l border-gray-200 pl-6">
              <div className="flex flex-col gap-1">
                 <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Add Shape</span>
                 <select 
                   onChange={handleShapeSelect} 
                   className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2 py-1 text-xs font-bold outline-none cursor-pointer hover:bg-indigo-100 transition-colors"
                   defaultValue=""
                 >
                    <option value="" disabled>Select Geometry...</option>
                    <option value="square">Square</option>
                    <option value="triangle">Triangle</option>
                    <option value="pentagon">Pentagon</option>
                    <option value="circle">Circle</option>
                    <option value="star">Star</option>
                    <option value="heart">Heart</option>
                 </select>
              </div>
              <div className="h-8 w-[1px] bg-gray-200 mx-1"></div>
              <button onClick={() => StrokeService.exportStroke(rawStroke)} className="text-xs text-blue-600 hover:underline font-bold">Export</button>
            </div>
          </div>

          {/* MAIN VIEWPORT */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="absolute inset-0 pointer-events-none z-40">
               <Canvas ref={overlayCanvasRef} onDraw={onOverlayCanvas} />
            </div>

            {/* VIEW A: Epicycle Chain */}
            <div 
              className="w-1/2 h-full border-r relative bg-white flex flex-col shadow-[inset_-10px_0_10px_-10px_rgba(0,0,0,0.05)] overflow-hidden"
              onWheel={handleViewportWheel}
              onPointerDown={handlePanStart}
              onPointerMove={handlePanMove}
              onPointerUp={handlePanEnd}
              onPointerLeave={handlePanEnd}
            >
              <div className="absolute top-4 left-5 z-20 pointer-events-none">
                <span className="bg-white/90 px-3 py-1.5 rounded-md text-[10px] font-black text-indigo-600 border border-indigo-100 shadow-sm uppercase tracking-widest">
                  View A: Epicycles
                </span>
              </div>

              <div className={`flex-1 h-full relative ${!isDrawingMode ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                <Canvas ref={epicycleCanvasRef} onDraw={onEpicycleCanvas} />
                {isDrawingMode && (
                  <div className="absolute inset-0 cursor-crosshair z-10">
                    <Canvas 
                      onDraw={onDrawCanvas} 
                      onPointerDown={handlePointerDown} 
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                    />
                  </div>
                )}
              </div>

              {/* Magnifier Loupe for Micro-Circles (Picture-in-Picture) */}
              {showLoupe && coeffs.length > 0 && (
                <div className="absolute bottom-5 right-5 z-30 bg-white/95 rounded-xl border border-purple-200 shadow-xl p-3 w-56 flex flex-col gap-2 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-purple-900 uppercase tracking-wider">
                      <ZoomIn className="w-3.5 h-3.5 text-purple-600" />
                      Tip Loupe
                    </div>
                    <div className="flex items-center gap-1">
                      {[6, 10, 16].map((zoomVal) => (
                        <button
                          key={zoomVal}
                          onClick={() => setLoupeZoom(zoomVal)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                            loupeZoom === zoomVal 
                              ? 'bg-purple-600 text-white' 
                              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                          }`}
                        >
                          {zoomVal}x
                        </button>
                      ))}
                      <button
                        onClick={() => setShowLoupe(false)}
                        className="text-gray-400 hover:text-gray-600 p-0.5 ml-1 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-36 bg-gray-50 rounded-lg border border-purple-100 overflow-hidden relative">
                    <Canvas onDraw={onLoupeCanvas} />
                  </div>
                  <div className="text-[10px] text-gray-500 flex items-center justify-between font-mono">
                    <span>Terminal epicycles</span>
                    <span className="text-purple-600 font-bold">{loupeZoom}x zoom</span>
                  </div>
                </div>
              )}
            </div>

            {/* VIEW B: Reconstruction */}
            <div className="w-1/2 h-full relative bg-gray-50 flex flex-col">
              <div className="absolute top-4 left-5 z-20 flex items-center gap-2">
                <span className="bg-white/95 px-3 py-1.5 rounded-md text-[10px] font-black text-gray-700 border border-gray-200 shadow-sm uppercase tracking-widest flex items-center gap-2">
                  View B: Reconstruction
                  {coeffs.length > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-normal ${
                      hasCompletedCycle ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}>
                      {hasCompletedCycle ? '✓ Closed Loop' : `Tracing ${(t * 100).toFixed(0)}%`}
                    </span>
                  )}
                </span>
                {coeffs.length > 0 && (
                  <button
                    onClick={replayDrawing}
                    title="Replay drawing animation from t = 0"
                    className="bg-white/95 hover:bg-white text-gray-700 hover:text-indigo-600 px-2.5 py-1.5 rounded-md text-[10px] font-bold border border-gray-200 shadow-sm transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Replay
                  </button>
                )}
              </div>
              <div className="flex-1 h-full relative">
                <Canvas ref={pathCanvasRef} onDraw={onPathCanvas} />
              </div>
            </div>
          </div>
        </>
      ) : (
        /* DATA ANALYSIS VIEW */
        <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Fourier Analysis Report</h1>
              <div className="flex gap-4">
                <div className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-sm border border-indigo-200">
                  N={rawStroke.length > 0 ? samplingN : 0} Points
                </div>
                <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-bold text-sm border border-green-200">
                  K={coeffs.length} Harmonics
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* RAW COORDINATES */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-[500px]">
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                  <h2 className="font-black text-gray-500 text-xs uppercase tracking-widest">Input Signals (z_n = x + iy)</h2>
                  <span className="text-[10px] text-gray-400 italic">Showing first 100 points</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {rawStroke.length > 0 ? (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b text-gray-400">
                          <th className="pb-2">n</th>
                          <th className="pb-2">x (real)</th>
                          <th className="pb-2">y (imag)</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-600">
                        {rawStroke.slice(0, 100).map((p, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-indigo-50">
                            <td className="py-1.5">{i}</td>
                            <td className="py-1.5">{p.x.toFixed(2)}</td>
                            <td className="py-1.5">{p.y.toFixed(2)}</td>
                          </tr>
                        ))}
                        {rawStroke.length > 100 && (
                          <tr><td colSpan={3} className="py-4 text-center text-gray-300">... truncated ...</td></tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      No points captured yet. Go to visualizer and draw!
                    </div>
                  )}
                </div>
              </div>

              {/* FOURIER COEFFICIENTS */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-[500px]">
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                  <h2 className="font-black text-gray-500 text-xs uppercase tracking-widest">Output Coefficients (C_k)</h2>
                  <span className="text-[10px] text-gray-400 italic">Sorted by Amplitude</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {coeffs.length > 0 ? (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b text-gray-400">
                          <th className="pb-2">k (freq)</th>
                          <th className="pb-2">Amp |C_k|</th>
                          <th className="pb-2">Phase φ_k</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-600">
                        {coeffs.map((c, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-green-50">
                            <td className="py-1.5 font-bold text-indigo-600">{c.k}</td>
                            <td className="py-1.5">{c.amp.toFixed(3)}</td>
                            <td className="py-1.5">{(c.phase * 180 / Math.PI).toFixed(1)}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      Coefficients not computed. Click "Compute" in visualizer.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* THE EDUCATIONAL SECTION */}
            <div className="mt-8 bg-indigo-900 text-indigo-100 rounded-xl p-8 shadow-xl">
              <h2 className="text-2xl font-black mb-4 uppercase italic">What did the DFT actually do?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm leading-relaxed">
                <div>
                  <p className="mb-4">
                    The <span className="text-indigo-300 font-bold">Discrete Fourier Transform</span> is like a prism for geometry. 
                    Just as a prism splits white light into its component colors, the DFT splits your 2D drawing into its component <span className="italic">circular motions</span>.
                  </p>
                  <p>
                    {/* Fixed: Wrapped math expression in string literal to prevent TS identifier lookup errors */}
                    Mathematically, we treat your drawing as a sequence of complex numbers {"$z_n$"}. The DFT computes the contribution of every possible frequency $k$.
                    The result is a set of <span className="text-white font-bold">Coefficients {"($C_k$)"}</span>.
                  </p>
                </div>
                <ul className="space-y-4">
                  <li className="flex gap-3">
                    <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center shrink-0 font-bold text-white">1</div>
                    <div>
                      <span className="text-white font-bold block uppercase text-xs tracking-widest">Amplitude {"($|C_k|$)"}</span>
                      Determines the <span className="text-indigo-300">radius</span> of the epicycle. Larger amplitudes represent dominant features of the shape.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center shrink-0 font-bold text-white">2</div>
                    <div>
                      <span className="text-white font-bold block uppercase text-xs tracking-widest">Phase {"($\\phi_k$)"}</span>
                      Determines the <span className="text-indigo-300">starting angle</span>. It tells the circle exactly where to begin its rotation at $t=0$.
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center shrink-0 font-bold text-white">3</div>
                    <div>
                      <span className="text-white font-bold block uppercase text-xs tracking-widest">Frequency {"($k$)"}</span>
                      Determines the <span className="text-indigo-300">speed and direction</span>. A positive $k$ rotates clockwise, while a negative $k$ rotates counter-clockwise.
                    </div>
                  </li>
                </ul>
              </div>
              <div className="mt-8 pt-8 border-t border-indigo-800 text-center">
                <p className="text-xs font-mono text-indigo-300 italic">
                  {/* Fixed line 602: Wrapped in string literal with escaped backslashes to avoid TS parsing identifiers like N, n, i */}
                  {"$C_k = \\frac{1}{N} \\sum_{n=0}^{N-1} z_n e^{-i \\frac{2\\pi}{N} kn}$"}
                </p>
                <p className="text-[10px] mt-2 opacity-50 uppercase tracking-[0.3em]">The magic of linear combinations</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
