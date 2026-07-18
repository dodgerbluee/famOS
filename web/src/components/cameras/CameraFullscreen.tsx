import { motion } from 'framer-motion';
import type { Camera } from '../../api/client';
import { LiveStream } from './LiveStream';
import { useCameraIntercom } from '../../hooks/useCameraIntercom';

interface CameraFullscreenProps {
  camera: Camera;
  onClose: () => void;
}

function ListenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TalkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CameraFullscreen({ camera, onClose }: CameraFullscreenProps) {
  const { listening, toggleListening, talking, startTalking, stopTalking, error } =
    useCameraIntercom(camera.name);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      <div className="flex items-center justify-between p-4">
        <h2 className="text-white text-xl font-semibold capitalize">
          {camera.name.replace(/_/g, ' ')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label="Listen"
            className={`min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full transition-colors ${
              listening ? 'bg-blue-500 text-white' : 'text-white/70'
            }`}
          >
            <ListenIcon />
          </button>
          <button
            onMouseDown={startTalking}
            onMouseUp={stopTalking}
            onMouseLeave={stopTalking}
            onTouchStart={(e) => {
              e.preventDefault();
              startTalking();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopTalking();
            }}
            aria-pressed={talking}
            aria-label="Talk"
            className={`min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full transition-colors select-none touch-none ${
              talking ? 'bg-red-500 text-white' : 'text-white/70'
            }`}
          >
            <TalkIcon />
          </button>
          <button
            onClick={onClose}
            className="text-white/70 text-3xl min-w-[48px] min-h-[48px] flex items-center justify-center"
          >
            &times;
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm text-center px-4 -mt-2">{error}</p>}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0" onClick={onClose}>
        <LiveStream
          cameraName={camera.name}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    </motion.div>
  );
}
