import { useState } from 'react';
import { Gem } from 'lucide-react';

interface OrnamentPhotoProps {
  src?: string;
  alt: string;
  label: string;
  className?: string;
}

export function OrnamentPhoto({ src, alt, label, className = 'w-full h-40' }: OrnamentPhotoProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-slate-100 border border-slate-200 rounded-md flex flex-col items-center justify-center p-3 text-center text-slate-500`}
      >
        <Gem className="w-6 h-6 text-amber-700 mb-1.5" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-700 truncate max-w-full">{label}</span>
        <span className="text-[11px] text-slate-400">No photograph attached</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-cover rounded-md border border-slate-200 bg-slate-100`}
    />
  );
}
