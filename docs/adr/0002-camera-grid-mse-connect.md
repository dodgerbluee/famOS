# Camera MSE connect: stagger, give-up, queue cap

Live video was falling back to snapshots because an 8s timer called `giveUp()`, which closed the go2rtc websocket. Listen/Talk was left in place.

Grid tiles own MSE again (pre-PR #2 `CameraTile` path). Fullscreen uses `LiveStream` as a video-only MSE player. Do not put a persistent snapshot over the video, do not pause/teardown the socket on idle, and do not JPEG-poll as the live view.

**Do not restore the 8s `giveUp()` call.** That closed the websocket and ended the MediaSource when the first MSE codec message had not arrived yet. A slow go2rtc start then left the tile stuck on the snapshot with no socket left to recover. Stagger and the 60-chunk queue cap stay.

## What `giveUp()` does

`giveUp()` is only for real failures (SourceBuffer codec throw, `ws.onerror` / `ws.onclose` before any MSE data). On a tile it hides the spinner and closes a dead socket. It must not run on a timer.

## Restore the timeout tear-down (not recommended)

In a tile `onSourceOpen`:

```ts
failTimer = setTimeout(() => {
  if (!receivedStreamData) giveUp();
}, 8000);
```

That path closed the socket and left a still image.

## Keep / retry

- **Stagger** — `STREAM_START_STAGGER_MS = 250` in `CameraGrid`; each tile waits `index * STREAM_START_STAGGER_MS` before opening its websocket.
- **Queue cap** — `MAX_QUEUED_CHUNKS = 60` when pushing MSE chunks.
- **Snapshot then live** — show one snapshot until `readyState >= 2`, then unmount the snapshot so it cannot cover the video.
