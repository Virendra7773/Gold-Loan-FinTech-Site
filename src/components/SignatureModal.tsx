import { useEffect, useRef, useState } from 'react';
import { PenTool, RotateCcw, Type, X } from 'lucide-react';

interface SignatureModalProps {
  title: string;
  signerLabel: string;
  defaultTypedName?: string;
  onConfirm: (signatureDataUrl: string) => void;
  onClose: () => void;
}

export function SignatureModal({
  title,
  signerLabel,
  defaultTypedName = '',
  onConfirm,
  onClose,
}: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState(defaultTypedName);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  function resetCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  useEffect(() => {
    resetCanvas();
    setHasStroke(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'type') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    resetCanvas();
    const clean = typedName.trim();
    if (!clean) {
      setHasStroke(false);
      return;
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = 'italic 600 42px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clean, canvas.width / 2, canvas.height / 2);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, canvas.height / 2 + 34);
    ctx.lineTo(canvas.width - 90, canvas.height / 2 + 34);
    ctx.stroke();
    setHasStroke(true);
  }, [mode, typedName]);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    setDrawing(true);
    setHasStroke(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  }

  function handlePointerUp() {
    setDrawing(false);
  }

  function handleClear() {
    resetCanvas();
    setTypedName('');
    setHasStroke(false);
  }

  function handleApply() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    onConfirm(canvas.toDataURL('image/png'));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Signatory: {signerLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
            aria-label="Close signature modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                mode === 'draw'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Draw Signature</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('type')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                mode === 'type'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Type E-Signature</span>
            </button>
          </div>

          {mode === 'type' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Signatory Full Name
              </label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type full name to render signature"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-slate-500"
              />
            </div>
          )}

          <div className="border border-slate-300 rounded-md overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              width={560}
              height={180}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`w-full h-44 touch-none block ${
                mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'
              }`}
            />
          </div>
          <p className="text-xs text-slate-500">
            {mode === 'draw'
              ? 'Draw signature inside the box above.'
              : 'Typed e-signature renders onto the sanction document canvas.'}{' '}
            Recording captures an immutable timestamp in the audit trail.
          </p>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>

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
                disabled={!hasStroke}
                onClick={handleApply}
                className="btn-bullion inline-flex items-center gap-2 px-4 py-2 text-xs font-medium disabled:opacity-40 rounded-lg cursor-pointer"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Record Signature</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
