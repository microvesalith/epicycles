
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface CanvasProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  onDraw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(({ onDraw, ...props }, ref) => {
  const internalRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => internalRef.current as HTMLCanvasElement);

  // Synchronize canvas size with logical CSS size using ResizeObserver
  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const displayWidth = Math.round(rect.width * dpr);
      const displayHeight = Math.round(rect.height * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }
    };

    syncSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => syncSize());
      resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', syncSize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', syncSize);
    };
  }, []);

  // Run the draw callback whenever onDraw or its dependencies update
  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onDraw?.(ctx, rect.width, rect.height);
    ctx.restore();
  }, [onDraw]);

  return <canvas ref={internalRef} className="w-full h-full block touch-none" {...props} />;
});

Canvas.displayName = 'Canvas';

export default Canvas;
