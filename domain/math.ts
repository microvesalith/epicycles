
import { Point, Complex, Coefficient } from '../types';

/**
 * Ensures a polyline is closed for periodic Fourier representation.
 * Connects the last point back to the first point if they are not identical.
 */
export const closeStroke = (points: Point[]): Point[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dist = Math.hypot(last.x - first.x, last.y - first.y);
  if (dist > 1e-4) {
    return [...points, { x: first.x, y: first.y }];
  }
  return points;
};

/**
 * Resamples a polyline to N points uniformly spaced in time.
 * If closeLoop is true, it ensures the last point connects back to the first point
 * so the perimeter and sampled points form a seamless periodic loop.
 */
export const resampleStroke = (points: Point[], N: number, closeLoop: boolean = true): Complex[] => {
  if (points.length < 2) return [];

  const pts = closeLoop ? closeStroke(points) : points;

  // Calculate cumulative distance
  const distances = [0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    distances.push(distances[i - 1] + d);
  }

  const totalLength = distances[distances.length - 1];
  if (totalLength === 0) return [];

  const resampled: Complex[] = [];

  for (let i = 0; i < N; i++) {
    const targetDist = (i / N) * totalLength;
    
    // Find segment where targetDist falls
    let idx = distances.findIndex(d => d >= targetDist);
    if (idx === -1) idx = distances.length - 1;
    if (idx === 0) {
      resampled.push({ re: pts[0].x, im: pts[0].y });
      continue;
    }

    const prevDist = distances[idx - 1];
    const nextDist = distances[idx];
    const segmentDist = nextDist - prevDist;
    const t = segmentDist === 0 ? 0 : (targetDist - prevDist) / segmentDist;

    const x = pts[idx - 1].x + (pts[idx].x - pts[idx - 1].x) * t;
    const y = pts[idx - 1].y + (pts[idx].y - pts[idx - 1].y) * t;
    resampled.push({ re: x, im: y });
  }

  return resampled;
};

/**
 * Centering and Auto-scaling the signal
 * Subtracts the centroid (mean) so that the DC offset (k=0 DFT component) is exactly zero,
 * ensuring the epicycle chain and drawing are centered with zero vertical bias.
 */
export const normalizeSignal = (signal: Complex[], width: number, height: number): Complex[] => {
  if (signal.length === 0) return [];
  
  // 1. Calculate centroid (mean) of the signal
  let sumRe = 0;
  let sumIm = 0;
  signal.forEach(p => {
    sumRe += p.re;
    sumIm += p.im;
  });
  const meanRe = sumRe / signal.length;
  const meanIm = sumIm / signal.length;

  // 2. Center signal strictly around centroid (guarantees C_0 = 0 in DFT)
  const centered = signal.map(p => ({
    re: p.re - meanRe,
    im: p.im - meanIm
  }));

  // 3. Compute symmetric bounding extents from center
  let maxExtentX = 0;
  let maxExtentY = 0;
  centered.forEach(p => {
    maxExtentX = Math.max(maxExtentX, Math.abs(p.re));
    maxExtentY = Math.max(maxExtentY, Math.abs(p.im));
  });

  const margin = 0.25; // 25% margin for comfortable visualization
  const scale = Math.min(
    ((width / 2) * (1 - margin)) / (maxExtentX || 1),
    ((height / 2) * (1 - margin)) / (maxExtentY || 1)
  );

  return centered.map(p => ({
    re: p.re * scale,
    im: p.im * scale
  }));
};

/**
 * Direct Discrete Fourier Transform
 */
export const computeDFT = (signal: Complex[], K: number, symmetric: boolean): Coefficient[] => {
  const N = signal.length;
  const coeffs: Coefficient[] = [];

  const range = symmetric ? Array.from({ length: 2 * K + 1 }, (_, i) => i - K) : Array.from({ length: K + 1 }, (_, i) => i);

  for (const k of range) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (2 * Math.PI * k * n) / N;
      const cos = Math.cos(phi);
      const sin = -Math.sin(phi); // e^(-i*phi)
      re += signal[n].re * cos - signal[n].im * sin;
      im += signal[n].re * sin + signal[n].im * cos;
    }
    re /= N;
    im /= N;

    coeffs.push({
      k,
      amp: Math.sqrt(re * re + im * im),
      phase: Math.atan2(im, re),
      val: { re, im }
    });
  }

  // Sort by amplitude descending for stable epicycle chains (visually nicer)
  return coeffs.sort((a, b) => b.amp - a.amp);
};

/**
 * Evaluate partial sums at time t
 */
export const evaluateSum = (coeffs: Coefficient[], t: number): Point[] => {
  let currentPos = { x: 0, y: 0 };
  const partialSums: Point[] = [currentPos];

  for (const c of coeffs) {
    const phi = 2 * Math.PI * c.k * t + c.phase;
    currentPos = {
      x: currentPos.x + c.amp * Math.cos(phi),
      y: currentPos.y + c.amp * Math.sin(phi)
    };
    partialSums.push(currentPos);
  }

  return partialSums;
};

/**
 * Pre-evaluates the full reconstructed Fourier curve for t in [0, 1].
 * Guarantees that the end point connects seamlessly to the exact start coordinate.
 */
export const computeFullCurve = (coeffs: Coefficient[], steps = 600): Point[] => {
  if (coeffs.length === 0) return [];
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const tVal = i / steps;
    const sums = evaluateSum(coeffs, tVal);
    pts.push(sums[sums.length - 1]);
  }
  // Clamp the last point to exact start coordinate so start and end are identical
  if (pts.length > 0) {
    pts[pts.length - 1] = { x: pts[0].x, y: pts[0].y };
  }
  return pts;
};
