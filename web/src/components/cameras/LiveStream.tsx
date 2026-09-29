import { useEffect, useRef, useState } from 'react';
import { useStreamPaused } from '../../hooks/useStreamPaused';
import { cameraSnapshotUrl } from '../../api/client';

interface LiveStreamProps {
  cameraName: string;
  className?: string;
  fallbackPollMs?: number;
  snapshotHeight?: number;
  staggerMs?: number;
  showStatus?: boolean;
  statusCorner?: 'tr' | 'tl';
  snapshotSrc?: string;
  ignorePause?: boolean;
}

export function LiveStream({
  cameraName,
  className = '',
  fallbackPollMs = 2000,
  snapshotHeight = 720,
  staggerMs = 0,
  showStatus = false,
  statusCorner = 'tr',
  snapshotSrc,
  ignorePause = false,
}: LiveStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [refreshKey, setRefreshKey] = useState(() => Date.now());
  const [liveReady, setLiveReady] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const idleOrHidden = useStreamPaused();
  const paused = ignorePause ? false : idleOrHidden;

  useEffect(() => {
    if (useFallback || paused) return;

    const video = videoRef.current;
    if (!video) return;

    setConnecting(true);
    setLiveReady(false);

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];
    let receivedStreamData = false;
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | null = null;
    let playInterval: ReturnType<typeof setInterval> | null = null;
    let staggerTimer: ReturnType<typeof setTimeout> | null = null;

    function giveUp() {
      setConnecting(false);
      if (fallbackPollMs > 0) setUseFallback(true);
      if (failTimer) { clearTimeout(failTimer); failTimer = null; }
      if (playInterval) { clearInterval(playInterval); playInterval = null; }
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

    async function onSourceOpen() {
      if (staggerMs > 0) {
        await new Promise<void>((resolve) => {
          staggerTimer = setTimeout(resolve, staggerMs);
        });
      }
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

      failTimer = setTimeout(() => {
        if (!receivedStreamData) giveUp();
      }, 8000);

      playInterval = setInterval(() => {
        if (!video) return;
        if (video.paused && video.readyState >= 2) {
          video.play().catch(() => {});
        }
        if (video.readyState >= 2) {
          setLiveReady(true);
          setConnecting(false);
        }
        if (video.buffered.length > 0) {
          const end = video.buffered.end(video.buffered.length - 1);
          if (end - video.currentTime > 3) {
            video.currentTime = end - 0.5;
          }
        }
      }, 500);
    }

    ms.addEventListener('sourceopen', onSourceOpen);

    return () => {
      cancelled = true;
      ms.removeEventListener('sourceopen', onSourceOpen);
      if (staggerTimer) clearTimeout(staggerTimer);
      if (failTimer) clearTimeout(failTimer);
      if (playInterval) clearInterval(playInterval);
      ws?.close();
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
      setLiveReady(false);
    };
  }, [cameraName, useFallback, paused, staggerMs, fallbackPollMs]);

  useEffect(() => {
    if (paused || !useFallback || fallbackPollMs <= 0) return;
    const interval = setInterval(() => setRefreshKey(Date.now()), fallbackPollMs);
    return () => clearInterval(interval);
  }, [useFallback, paused, fallbackPollMs]);

  const showLive = liveReady && !paused && !useFallback;
  const snapshotUrl = snapshotSrc ?? `${cameraSnapshotUrl(cameraName, snapshotHeight)}&t=${refreshKey}`;
  const cornerClass = statusCorner === 'tl' ? 'top-2 left-2' : 'top-2 right-2';

  return (
    <>
      <img
        src={snapshotUrl}
        alt={cameraName}
        className={`${className} transition-opacity duration-300 ${showLive ? 'opacity-0' : 'opacity-100'}`}
      />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`${className} transition-opacity duration-300 ${showLive ? 'opacity-100' : 'opacity-0'}`}
      />
      {showStatus && connecting && !paused && !useFallback && (
        <div className={`absolute ${cornerClass} bg-black/50 rounded-full p-1.5 flex items-center gap-1.5`}>
          <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {statusCorner === 'tl' && (
            <span className="text-white text-[10px] font-semibold pr-1">Connecting</span>
          )}
        </div>
      )}
      {showStatus && showLive && (
        <div className={`absolute ${cornerClass} bg-accent-red/90 rounded-full px-2 py-0.5 flex items-center gap-1`}>
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-white text-[10px] font-bold uppercase">Live</span>
        </div>
      )}
    </>
  );
}
