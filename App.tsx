
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Point, Complex, Coefficient } from './types';
import * as MathDomain from './domain/math';
import * as StrokeService from './application/strokeService';
import Canvas from './components/Canvas';

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
  
  // Zoom & View Controls
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [followTip, setFollowTip] = useState(false);
  
  const [rawStroke, setRawStroke] = useState<Point[]>([]);
  const [coeffs, setCoeffs] = useState<Coefficient[]>([]);
  const [trail, setTrail] = useState<Point[]>([]);

  // Animation Refs
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);
  const tInternal = useRef(0); // High-frequency time tracker

  const handleClear = () => {
    setRawStroke([]);
    setCoeffs([]);
    setTrail([]);
    setT(0);
    tInternal.current = 0;
    setIsPlaying(false);
    setIsDrawingMode(true);
  };

  /**
   * Main use case: Compute DFT from the current stroke and start animation
   */
  const handleCompute = useCallback((targetStroke?: Point[]) => {
    const strokeToUse = targetStroke || rawStroke;
    if (strokeToUse.length < 2) return;
    
    const resampled = MathDomain.resampleStroke(strokeToUse, samplingN);
    const normalized = MathDomain.normalizeSignal(resampled, 500, 500);
    const computedCoeffs = MathDomain.computeDFT(normalized, harmonicsK, useSymmetric);
    
    setCoeffs(computedCoeffs);
    setTrail([]);
    setT(0);
    tInternal.current = 0;
    setIsPlaying(true);
    setIsDrawingMode(false);
  }, [rawStroke, samplingN, harmonicsK, useSymmetric]);

  /**
   * The Animation Engine
   */
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== null && isPlaying && coeffs.length > 0) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      tInternal.current = (tInternal.current + (deltaTime * speed * 0.1)) % 1;
      const currentT = tInternal.current;
      setT(currentT);

      const sums = MathDomain.evaluateSum(coeffs, currentT);
      const tip = sums[sums.length - 1];
      
      setTrail(prevTrail => {
        if (prevTrail.length > 20 && currentT < 0.02) return [tip];
        return [...prevTrail, tip];
      });
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
    setTrail([]);
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
    ctx.stroke();
  }, [rawStroke]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRawStroke([{ x, y }]);
    setTrail([]);
    setCoeffs([]);
    setT(0);
    tInternal.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingMode || e.buttons !== 1) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRawStroke(prev => [...prev, { x, y }]);
  };

  /**
   * UI Adapter: Render Epicycle Chain (LEFT)
   */
  const onEpicycleCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const centerX = w / 2;
    const centerY = h / 2;

    if (coeffs.length === 0) {
       ctx.strokeStyle = "rgba(229, 231, 235, 0.6)";
       ctx.lineWidth = 1;
       ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, h); ctx.stroke();
       return;
    }

    const sums = MathDomain.evaluateSum(coeffs, t);
    const tip = sums[sums.length - 1];
    
    ctx.save();
    ctx.translate(centerX, centerY);
    if (followTip) ctx.translate(-tip.x * zoomLevel, -tip.y * zoomLevel);
    ctx.scale(zoomLevel, zoomLevel);

    ctx.strokeStyle = "rgba(229, 231, 235, 0.4)";
    ctx.lineWidth = 1 / zoomLevel;
    ctx.beginPath(); ctx.moveTo(-w*10, 0); ctx.lineTo(w*10, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -h*10); ctx.lineTo(0, h*10); ctx.stroke();

    for (let i = 0; i < coeffs.length; i++) {
      const c = coeffs[i];
      const start = sums[i];
      const end = sums[i + 1];

      ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
      ctx.lineWidth = 1.2 / zoomLevel;
      ctx.beginPath();
      ctx.arc(start.x, start.y, c.amp, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = i === 0 ? "rgba(79, 70, 229, 0.4)" : "#4f46e5";
      ctx.lineWidth = (i === 0 ? 1.5 : 2) / zoomLevel;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      if (c.amp * zoomLevel > 5) {
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
    ctx.arc(tip.x, tip.y, 6 / zoomLevel, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }, [coeffs, t, showLabels, zoomLevel, followTip]);

  /**
   * UI Adapter: Render Reconstructed Path (RIGHT)
   */
  const onPathCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const centerX = w / 2;
    const centerY = h / 2;
    if (trail.length < 2) return;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(trail[i].x, trail[i].y);
    }
    ctx.stroke();

    const tip = trail[trail.length - 1];
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [trail]);

  /**
   * UI Adapter: Render Connecting Line (FULL OVERLAY)
   */
  const onOverlayCanvas = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    if (coeffs.length === 0 || !isPlaying || currentView !== 'visualizer') return;

    const halfW = w / 2;
    const centerY = h / 2;
    const centerX_L = halfW / 2;
    const centerX_R = halfW + halfW / 2;

    const sums = MathDomain.evaluateSum(coeffs, t);
    const tip = sums[sums.length - 1];

    let xA = centerX_L;
    let yA = centerY;
    if (followTip) {
      xA = centerX_L;
      yA = centerY;
    } else {
      xA = centerX_L + tip.x * zoomLevel;
      yA = centerY + tip.y * zoomLevel;
    }

    const xB = centerX_R + tip.x;
    const yB = centerY + tip.y;

    ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
    ctx.beginPath(); ctx.arc(xA, yA, 10, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(xB, yB, 10, 0, Math.PI*2); ctx.fill();
  }, [coeffs, t, isPlaying, zoomLevel, followTip, currentView]);

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

            <div className="flex items-center gap-6 border-l border-gray-200 pl-6">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Zoom: {zoomLevel.toFixed(1)}x</span>
                <input type="range" min="1.0" max="15.0" step="0.5" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="w-24 h-1.5 bg-gray-200 rounded-lg cursor-pointer accent-indigo-600" />
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-indigo-700 font-bold bg-indigo-50 px-2 py-1 rounded">
                <input type="checkbox" checked={followTip} onChange={e => setFollowTip(e.target.checked)} className="w-4 h-4 rounded text-indigo-600" /> Focus Tip
              </label>
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
               <Canvas onDraw={onOverlayCanvas} />
            </div>

            <div className="w-1/2 border-r relative bg-white flex flex-col shadow-[inset_-10px_0_10px_-10px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="absolute top-4 left-5 z-20">
                <span className="bg-white/90 px-3 py-1.5 rounded-md text-[10px] font-black text-indigo-500 border border-indigo-100 shadow-sm uppercase tracking-widest">
                  View A: Epicycle Chain {zoomLevel > 1 && `(${zoomLevel.toFixed(1)}x Zoom)`}
                </span>
              </div>
              <div className="flex-1 relative">
                <Canvas onDraw={onEpicycleCanvas} />
                {isDrawingMode && (
                  <div className="absolute inset-0 cursor-crosshair z-10">
                    <Canvas onDraw={onDrawCanvas} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} />
                  </div>
                )}
              </div>
              <div className="absolute bottom-6 left-6 flex gap-6 text-[11px] font-mono text-gray-400 bg-white/90 px-3 py-2 rounded-lg border shadow-sm">
                 <div><span className="text-indigo-300">ZOOM:</span> {zoomLevel.toFixed(1)}x</div>
                 <div><span className="text-gray-300">T:</span> {t.toFixed(4)}</div>
                 <div><span className="text-gray-300">K:</span> {coeffs.length}</div>
              </div>
            </div>

            <div className="w-1/2 relative bg-gray-50 flex flex-col">
              <div className="absolute top-4 left-5 z-20">
                <span className="bg-white/90 px-3 py-1.5 rounded-md text-[10px] font-black text-gray-400 border shadow-sm uppercase tracking-widest">View B: Reconstruction</span>
              </div>
              <div className="flex-1 relative">
                <Canvas onDraw={onPathCanvas} />
              </div>
            </div>
          </div>

          <div className="px-10 py-8 bg-gray-950 text-gray-500 text-xs border-t border-gray-900 shrink-0">
            <div className="max-w-6xl mx-auto flex gap-12 items-start">
              <div className="flex-1">
                <h3 className="text-gray-300 font-black mb-3 uppercase tracking-[0.2em] text-[10px]">Mathematical Reconstruction</h3>
                <p className="leading-relaxed">
                  Use the <span className="text-indigo-400 font-bold">Add Shape</span> dropdown to load perfect geometries. Each vertex and curve is decomposed into frequency components. The <span className="text-indigo-400 font-bold">Zoom</span> and <span className="text-indigo-400 font-bold">Focus Tip</span> features allow you to observe how high-frequency circles converge at sharp corners.
                </p>
              </div>
              <div className="w-56 text-[10px] border-l border-gray-800 pl-8">
                 <div className="text-gray-400 font-black mb-2 uppercase tracking-widest">Shape Library</div>
                 <ul className="space-y-1.5 list-disc list-inside">
                   <li><span className="text-indigo-400 font-bold">Heart</span>: Smooth curves</li>
                   <li><span className="text-indigo-400 font-bold">Triangle</span>: Sharp discontinuities</li>
                   <li><span className="text-indigo-400 font-bold">Square</span>: Right-angle harmonics</li>
                 </ul>
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
