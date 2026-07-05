import { motion } from 'framer-motion';
import type { Camera } from '../../api/client';
import { LiveStream } from './LiveStream';

interface CameraFullscreenProps {
  camera: Camera;
  onClose: () => void;
}

export function CameraFullscreen({ camera, onClose }: CameraFullscreenProps) {
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
        <button
          onClick={onClose}
          className="text-white/70 text-3xl min-w-[48px] min-h-[48px] flex items-center justify-center"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-2 min-h-0" onClick={onClose}>
        <LiveStream
          cameraName={camera.name}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    </motion.div>
  );
}
