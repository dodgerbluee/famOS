# Camera MSE connect: stagger, give-up, queue cap

Live video was falling back to snapshots because an 8s timer called `giveUp()`, which closed the go2rtc websocket. Listen/Talk was left in place.

As of main after 2026-10-02, MSE lives in `web/src/components/cameras/LiveStream.tsx` (grid tiles pass `staggerMs`). The last revision that closed the socket on that timer is `5677bd0` (`origin/main` at rebase). Compare with `git show 5677bd0:web/src/components/cameras/LiveStream.tsx`.

**Do not restore the 8s `giveUp()` call.** That closed the websocket and ended the MediaSource when the first MSE codec message had not arrived yet. A slow go2rtc start then left the tile stuck on the snapshot with no socket left to recover. Stagger and the 60-chunk queue cap stayed on main.

## What `giveUp()` does

`giveUp()` still exists for real failures (SourceBuffer codec throw, `ws.onerror` / `ws.onclose` before any MSE data). It:

1. hides the spinner
2. optionally flips to snapshot polling (`fallbackPollMs > 0`)
3. `ws.close()` and `ms.endOfStream()`

The 8s timer only calls `setConnecting(false)` now. The socket stays open.

## Restore the timeout tear-down (not recommended)

In `LiveStream` `onSourceOpen`:

```ts
failTimer = setTimeout(() => {
  if (!receivedStreamData) giveUp();
}, 8000);
```

Grid tiles use `fallbackPollMs={0}`, so that path closed the socket without even switching to snapshot refresh.

## Keep / retry

- **Stagger** — `STREAM_START_STAGGER_MS = 250` in `CameraGrid`; each tile passes `staggerMs={index * STREAM_START_STAGGER_MS}`.
- **Queue cap** — `MAX_QUEUED_CHUNKS = 60` in `LiveStream.pushChunk`.
