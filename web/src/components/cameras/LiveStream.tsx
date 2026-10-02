import { useEffect, useRef, useState } from 'react';

interface LiveStreamProps {
  cameraName: string;
  className?: string;
}

// Restored from before PR #2: MSE video is the view. JPEG is a last-resort
// static still after a hard websocket failure — not idle-pause, not 2s polling.
export function LiveStream({ cameraName, className = '' }: LiveStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    if (useFallback) return;

    const video = videoRef.current;
    if (!video) return;

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];
    let receivedStreamData = false;
    let cancelled = false;

    function giveUp() {
      if (cancelled) return;
      setUseFallback(true);
      ws?.close();
      ws = null;
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
    }

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

    function onSourceOpen() {
      if (cancelled) return;

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/api/cameras/${cameraName}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
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
              receivedStreamData = true;
            } catch {
              giveUp();
            }
          }
        } else if (ev.data instanceof ArrayBuffer && sb) {
          receivedStreamData = true;
          if (sb.updating) {
            pushChunk(ev.data);
          } else {
            try { sb.appendBuffer(ev.data); }
            catch { pushChunk(ev.data); }
          }
        }
      };

      ws.onerror = () => { if (!receivedStreamData) giveUp(); };
      ws.onclose = () => { if (!receivedStreamData) giveUp(); };
    }

    ms.addEventListener('sourceopen', onSourceOpen);

    const playInterval = setInterval(() => {
      if (!video) return;
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        if (end - video.currentTime > 3) {
          video.currentTime = end - 0.5;
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      ms.removeEventListener('sourceopen', onSourceOpen);
      clearInterval(playInterval);
      ws?.close();
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [cameraName, useFallback]);

  if (useFallback) {
    return (
      <img
        src={`/api/cameras/${cameraName}/snapshot`}
        alt={cameraName}
        className={className}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className}
    />
  );
}
