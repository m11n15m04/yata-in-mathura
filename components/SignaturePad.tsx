import React, { useRef, useState, useEffect } from 'react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  className?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        // Fill white background for saving transparency issues
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasDrawn(true);
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (hasDrawn && canvasRef.current) {
      onSave(canvasRef.current.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
        onSave('');
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={350}
        height={150}
        className="w-full h-40 border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div className="absolute top-2 right-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-300"
        >
          Clear
        </button>
      </div>
      {!hasDrawn && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-slate-400 text-sm">Sign Here</span>
        </div>
      )}
    </div>
  );
};

export default SignaturePad;