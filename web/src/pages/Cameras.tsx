import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import type { Camera } from '../api/client';
import { CameraGrid } from '../components/cameras/CameraGrid';
import { CameraFullscreen } from '../components/cameras/CameraFullscreen';
import { EventTimeline } from '../components/cameras/EventTimeline';

export function Cameras() {
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [view, setView] = useState<'grid' | 'timeline'>('grid');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const cameraName = searchParams.get('camera');
    if (!cameraName) {
      return;
    }

    setView('grid');
    setSelectedCamera({
      name: cameraName,
      snapshotUrl: `/api/cameras/${cameraName}/snapshot`,
      streamUrl: `/api/cameras/${cameraName}/stream`,
    });
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('camera');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Cameras</h1>
        <div className="flex items-center gap-3">
          <a
            href="/api/cameras/frigate/open"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-surface-light px-4 py-2 text-sm font-medium text-text-bright"
          >
            Open Frigate
          </a>
          <div className="flex bg-surface-light rounded-xl overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={`px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
                view === 'grid' ? 'bg-primary text-white' : 'text-text-dim'
              }`}
            >
              Live
            </button>
            <button
              onClick={() => setView('timeline')}
              className={`px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
                view === 'timeline' ? 'bg-primary text-white' : 'text-text-dim'
              }`}
            >
              Events
            </button>
          </div>
        </div>
      </div>

      {!selectedCamera && (
        view === 'grid' ? (
          <CameraGrid onSelect={setSelectedCamera} />
        ) : (
          <div className="bg-surface rounded-2xl p-4">
            <h2 className="text-lg font-semibold text-text-bright mb-3">Recent Events</h2>
            <EventTimeline limit={30} />
          </div>
        )
      )}

      <AnimatePresence>
        {selectedCamera && (
          <CameraFullscreen
            camera={selectedCamera}
            onClose={() => setSelectedCamera(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
