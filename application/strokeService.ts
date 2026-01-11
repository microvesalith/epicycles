
import { Point } from '../types';

/**
 * Centering helper for generated shapes
 */
const centerShape = (points: Point[], targetX = 300, targetY = 300): Point[] => {
  if (points.length === 0) return points;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map(p => ({
    x: p.x - cx + targetX,
    y: p.y - cy + targetY
  }));
};

export const loadSampleStar = (): Point[] => {
  const points: Point[] = [];
  const spikes = 5;
  const outerRadius = 150;
  const innerRadius = 60;
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    points.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r
    });
  }
  return centerShape(points);
};

export const generateSquare = (): Point[] => {
  const s = 150;
  return centerShape([
    { x: -s, y: -s },
    { x: s, y: -s },
    { x: s, y: s },
    { x: -s, y: s },
    { x: -s, y: -s }
  ]);
};

export const generateTriangle = (): Point[] => {
  const r = 160;
  const points: Point[] = [];
  for (let i = 0; i <= 3; i++) {
    const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return centerShape(points);
};

export const generatePentagon = (): Point[] => {
  const r = 160;
  const points: Point[] = [];
  for (let i = 0; i <= 5; i++) {
    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return centerShape(points);
};

export const generateHeart = (): Point[] => {
  const points: Point[] = [];
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Standard parametric heart formula
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    points.push({ x: x * 10, y: y * 10 });
  }
  return centerShape(points);
};

export const generateCircle = (): Point[] => {
  const r = 150;
  const points: Point[] = [];
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return centerShape(points);
};

export const exportStroke = (points: Point[]) => {
  const blob = new Blob([JSON.stringify(points)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stroke.json';
  a.click();
  URL.revokeObjectURL(url);
};
