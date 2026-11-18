import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';

interface CameraModalProps {
  title: string;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraModal({ title, onCapture, onClose }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function initCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera API unavailable in this browser context. Upload a photo file below.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreamReady(true);
        }
      } catch {
        setCameraError('Camera access was denied or no camera device was found. Upload a photo file below.');
      }
    }
    initCamera();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleSnap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    onCapture(dataUrl);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onCapture(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label="Close camera modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!cameraError ? (
            <div className="relative aspect-[4/3] w-full bg-slate-900 rounded-md overflow-hidden border border-slate-200">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!streamReady && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-300">
                  Initializing camera feed...
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
              {cameraError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo File</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!streamReady}
                onClick={handleSnap}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-40 rounded-md whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Capture Photograph</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
