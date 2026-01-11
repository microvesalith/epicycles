
import { Point, Complex, Coefficient } from '../types';

/**
 * Resamples a polyline to N points uniformly spaced in time.
 */
export const resampleStroke = (points: Point[], N: number): Complex[] => {
  if (points.length < 2) return [];

  // Calculate cumulative distance
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const d = Math.sqrt(
      Math.pow(points[i].x - points[i - 1].x, 2) +
      Math.pow(points[i].y - points[i - 1].y, 2)
    );
    distances.push(distances[i - 1] + d);
  }

  const totalLength = distances[distances.length - 1];
  const resampled: Complex[] = [];

  for (let i = 0; i < N; i++) {
    const targetDist = (i / N) * totalLength;
    
    // Find segment where targetDist falls
    let idx = distances.findIndex(d => d >= targetDist);
    if (idx === -1) idx = distances.length - 1;
    if (idx === 0) {
      resampled.push({ re: points[0].x, im: points[0].y });
      continue;
    }

    const prevDist = distances[idx - 1];
    const nextDist = distances[idx];
    const segmentDist = nextDist - prevDist;
    const t = segmentDist === 0 ? 0 : (targetDist - prevDist) / segmentDist;

    const x = points[idx - 1].x + (points[idx].x - points[idx - 1].x) * t;
    const y = points[idx - 1].y + (points[idx].y - points[idx - 1].y) * t;
    resampled.push({ re: x, im: y });
  }

  return resampled;
};

/**
 * Centering and Auto-scaling the signal
 */
export const normalizeSignal = (signal: Complex[], width: number, height: number): Complex[] => {
  if (signal.length === 0) return [];
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  signal.forEach(p => {
    minX = Math.min(minX, p.re);
    maxX = Math.max(maxX, p.re);
    minY = Math.min(minY, p.im);
    maxY = Math.max(maxY, p.im);
  });

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const strokeW = maxX - minX;
  const strokeH = maxY - minY;

  const margin = 0.2; // 20% margin
  const scale = Math.min(
    (width * (1 - margin)) / (strokeW || 1),
    (height * (1 - margin)) / (strokeH || 1)
  );

  return signal.map(p => ({
    re: (p.re - centerX) * scale,
    im: (p.im - centerY) * scale
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
