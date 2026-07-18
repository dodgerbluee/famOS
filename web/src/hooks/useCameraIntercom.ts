import { useCallback, useEffect, useRef, useState } from 'react';

interface WebRTCMessage {
  type: string;
  value?: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function streamURL(cameraName: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/cameras/${cameraName}/stream`;
}

function wireSignaling(ws: WebSocket, pc: RTCPeerConnection, onError: (msg: string) => void) {
  pc.onicecandidate = (ev) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'webrtc/candidate', value: ev.candidate?.candidate ?? '' }));
  };

  ws.onmessage = (ev) => {
    let msg: WebRTCMessage;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === 'webrtc/answer' && msg.value) {
      pc.setRemoteDescription({ type: 'answer', sdp: msg.value }).catch(() => {
        onError('Failed to connect camera audio');
      });
    } else if (msg.type === 'webrtc/candidate' && msg.value) {
      pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' }).catch(() => {
        // ignore stray/late candidates
      });
    }
  };

  ws.onerror = () => onError('Camera audio connection failed');
}

async function negotiate(ws: WebSocket, pc: RTCPeerConnection) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
}

interface Connection {
  ws: WebSocket;
  pc: RTCPeerConnection;
}

export function useCameraIntercom(cameraName: string) {
  const [listening, setListening] = useState(false);
  const [talking, setTalking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listenRef = useRef<Connection | null>(null);
  const talkRef = useRef<(Connection & { track: MediaStreamTrack; micStream: MediaStream }) | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  if (!audioElRef.current && typeof Audio !== 'undefined') {
    audioElRef.current = new Audio();
    audioElRef.current.autoplay = true;
  }

  const closeListen = useCallback(() => {
    listenRef.current?.pc.close();
    listenRef.current?.ws.close();
    listenRef.current = null;
    if (audioElRef.current) audioElRef.current.srcObject = null;
  }, []);

  const closeTalk = useCallback(() => {
    talkRef.current?.pc.close();
    talkRef.current?.ws.close();
    talkRef.current?.micStream.getTracks().forEach((t) => t.stop());
    talkRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      closeListen();
      closeTalk();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraName]);

  const toggleListening = useCallback(() => {
    if (listenRef.current) {
      closeListen();
      setListening(false);
      return;
    }

    setError(null);
    const ws = new WebSocket(streamURL(cameraName));
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
    listenRef.current = { ws, pc };

    pc.ontrack = (ev) => {
      if (audioElRef.current) {
        audioElRef.current.srcObject = ev.streams[0];
        audioElRef.current.muted = talking;
        audioElRef.current.play().catch(() => {});
      }
    };

    wireSignaling(ws, pc, (msg) => {
      setError(msg);
      closeListen();
      setListening(false);
    });

    pc.addTransceiver('audio', { direction: 'recvonly' });

    ws.onopen = () => {
      negotiate(ws, pc).catch(() => {
        setError('Failed to connect camera audio');
        closeListen();
        setListening(false);
      });
    };

    setListening(true);
  }, [cameraName, closeListen, talking]);

  const startTalking = useCallback(async () => {
    if (talkRef.current) {
      talkRef.current.track.enabled = true;
      setTalking(true);
      if (audioElRef.current) audioElRef.current.muted = true;
      return;
    }

    setError(null);
    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError('Microphone permission denied');
      return;
    }

    const track = micStream.getAudioTracks()[0];
    const ws = new WebSocket(streamURL(cameraName));
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
    talkRef.current = { ws, pc, track, micStream };

    wireSignaling(ws, pc, (msg) => {
      setError(msg);
      closeTalk();
      setTalking(false);
      if (audioElRef.current) audioElRef.current.muted = false;
    });

    pc.addTransceiver(track, { direction: 'sendonly' });

    ws.onopen = () => {
      negotiate(ws, pc).catch(() => {
        setError('Failed to connect camera audio');
        closeTalk();
        setTalking(false);
        if (audioElRef.current) audioElRef.current.muted = false;
      });
    };

    if (audioElRef.current) audioElRef.current.muted = true;
    setTalking(true);
  }, [cameraName, closeTalk]);

  const stopTalking = useCallback(() => {
    if (talkRef.current) {
      talkRef.current.track.enabled = false;
    }
    setTalking(false);
    if (audioElRef.current) audioElRef.current.muted = false;
  }, []);

  return { listening, toggleListening, talking, startTalking, stopTalking, error };
}
