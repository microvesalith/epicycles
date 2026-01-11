
import React, { useRef, useEffect } from 'react';

interface CanvasProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  onDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

const Canvas: React.FC<CanvasProps> = ({ onDraw, ...props }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Synchronize canvas size with logical CSS size once on mount and on window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width * dpr);
      const displayHeight = Math.floor(rect.height * dpr);

      // Only set dimensions if they have changed to avoid clearing the buffer unnecessarily
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
          ctx.scale(dpr, dpr);
        }
      }
    };

    syncSize();
    window.addEventListener('resize', syncSize);
    return () => window.removeEventListener('resize', syncSize);
  }, []);

  // Run the draw callback whenever onDraw or other dependencies change
  // Note: App.tsx wraps onDraw in useCallback depending on 't', so this triggers every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    onDraw?.(ctx, rect.width, rect.height);
  }, [onDraw]);

  return <canvas ref={canvasRef} className="w-full h-full block touch-none" {...props} />;
};

export default Canvas;
