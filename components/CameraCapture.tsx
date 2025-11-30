import React, { useRef, useState, useEffect } from 'react';
import { CameraIcon, SwitchCameraIcon, XIcon, CheckIcon } from './Icons';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  label?: string;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, label = "Take Photo" }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Manage Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    const initCamera = async () => {
      if (!active || capturedImage) return;
      
      setLoading(true);
      setError(null);

      try {
        if (stream) {
          (stream as MediaStream).getTracks().forEach(track => track.stop());
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setLoading(false);
      } catch (err) {
        console.error("Camera Error:", err);
        setError("Camera unavailable. Check permissions.");
        setLoading(false);
      }
    };

    if (active) {
      initCamera();
    }

    return () => {
      if (stream) {
        (stream as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [active, facingMode, capturedImage]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Ensure video is playing
      if (video.readyState !== 4) return;

      const scale = 0.5; // Downscale for storage efficiency
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Mirror if user facing
        if (facingMode === 'user') {
           ctx.translate(canvas.width, 0);
           ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Compress
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setCapturedImage(dataUrl);
        // Note: Logic in useEffect will clean up the stream since capturedImage is now set
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setError(null);
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      // Reset
      setCapturedImage(null);
      setActive(false);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // 1. Capture Review State
  if (capturedImage) {
    return (
      <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-md">
        <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
          <button onClick={handleRetake} className="text-white bg-white/20 px-4 py-2 rounded-full hover:bg-white/30 backdrop-blur-md transition">
             <span className="text-xs font-bold">Retake</span>
          </button>
          <button onClick={handleConfirm} className="bg-green-500 text-white p-3 rounded-full shadow-lg hover:bg-green-600 transition active:scale-95">
             <CheckIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    );
  }

  // 2. Active Camera State
  if (active) {
    return (
      <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-md group">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
        />
        
        <canvas ref={canvasRef} className="hidden" />
        
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center">
            <p className="text-red-400 font-bold text-sm mb-2">{error}</p>
            <button onClick={() => setActive(false)} className="bg-white/10 text-white px-3 py-1 rounded text-xs">Close</button>
          </div>
        )}
        
        <div className="absolute top-2 right-2 z-10">
           <button onClick={() => setActive(false)} className="bg-black/40 text-white p-2 rounded-full hover:bg-black/60 backdrop-blur-md transition">
             <XIcon className="w-5 h-5" />
           </button>
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-8 z-10">
           <button onClick={toggleCamera} className="bg-white/20 text-white p-3 rounded-full backdrop-blur-md hover:bg-white/30 transition">
              <SwitchCameraIcon className="w-6 h-6" />
           </button>
           <button 
             onClick={handleCapture} 
             disabled={loading || !!error}
             className="bg-white p-1 rounded-full shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
           >
              <div className="w-14 h-14 border-4 border-black rounded-full bg-white"></div>
           </button>
           <div className="w-12"></div> {/* Spacer */}
        </div>
      </div>
    );
  }

  // 3. Idle State
  return (
    <div 
      className="w-full h-48 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all group" 
      onClick={() => setActive(true)}
    >
       <div className="p-4 bg-white text-indigo-500 rounded-full shadow-sm group-hover:scale-110 transition-transform duration-300">
         <CameraIcon className="w-8 h-8" />
       </div>
       <span className="text-sm font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">{label}</span>
    </div>
  );
};

export default CameraCapture;