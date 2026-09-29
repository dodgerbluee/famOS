import { useEffect, useRef, useState } from 'react';
import { useStreamPaused } from '../../hooks/useStreamPaused';
import { cameraSnapshotUrl } from '../../api/client';

interface LiveStreamProps {
  cameraName: string;
  className?: string;
  fallbackPollMs?: number;
  snapshotHeight?: number;
}

export function LiveStream({ cameraName, className = '', fallbackPollMs = 2000, snapshotHeight = 720 }: LiveStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveReady, setLiveReady] = useState(false);
  const paused = useStreamPaused();

  useEffect(() => {
    if (useFallback || paused) return;

    const video = videoRef.current;
    if (!video) return;

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];
    let connected = false;

    const fallbackTimer = setTimeout(() => {
      if (!connected) setUseFallback(true);
    }, 5000);

    const MAX_QUEUED_CHUNKS = 60;
    function pushChunk(chunk: ArrayBuffer) {
      queue.push(chunk);
      while (queue.length > MAX_QUEUED_CHUNKS) {
        queue.shift();
      }
    }

    function flushQueue() {
      if (!sb || sb.updating || queue.length === 0) return;
      const chunk = queue.shift()!;
      try {
        sb.appendBuffer(chunk);
      } catch {
        if (!sb.updating && ms.readyState === 'open') {
          try {
            const buffered = sb.buffered;
            if (buffered.length > 0 && buffered.end(0) - buffered.start(0) > 30) {
              sb.remove(buffered.start(0), buffered.end(0) - 10);
            }
          } catch { /* ignore */ }
        }
      }
    }

    ms.addEventListener('sourceopen', () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/api/cameras/${cameraName}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        connected = true;
        ws!.send(JSON.stringify({ type: 'mse' }));
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'mse' && !sb) {
            try {
              sb = ms.addSourceBuffer(msg.value);
              sb.mode = 'segments';
              sb.addEventListener('updateend', flushQueue);
            } catch {
              setUseFallback(true);
            }
          }
        } else if (ev.data instanceof ArrayBuffer && sb) {
          if (sb.updating) {
            pushChunk(ev.data);
          } else {
            try { sb.appendBuffer(ev.data); }
            catch { pushChunk(ev.data); }
          }
        }
      };

      ws.onerror = () => { if (!connected) setUseFallback(true); };
      ws.onclose = () => { if (!connected) setUseFallback(true); };
    });

    const playInterval = setInterval(() => {
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
      if (video.readyState >= 2) setLiveReady(true);
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        if (end - video.currentTime > 3) {
          video.currentTime = end - 0.5;
        }
      }
    }, 1000);

    return () => {
      clearTimeout(fallbackTimer);
      clearInterval(playInterval);
      ws?.close();
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
      setLiveReady(false);
    };
  }, [cameraName, useFallback, paused]);

  useEffect(() => {
    if (!useFallback && !paused) return;
    const interval = setInterval(() => setRefreshKey((k) => k + 1), fallbackPollMs);
    return () => clearInterval(interval);
  }, [useFallback, paused, fallbackPollMs]);

  if (useFallback || paused) {
    return (
      <img
        key={refreshKey}
        src={`${cameraSnapshotUrl(cameraName, snapshotHeight)}&t=${refreshKey}`}
        alt={cameraName}
        className={className}
      />
    );
  }

  return (
    <>
      {!liveReady && (
        <img
          src={cameraSnapshotUrl(cameraName, snapshotHeight)}
          alt={cameraName}
          className={className}
        />
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`${className} ${liveReady ? '' : 'hidden'}`}
      />
    </>
  );
}
