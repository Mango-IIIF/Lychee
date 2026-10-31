/*
 * RAMP (Samvera, React + Video.js) mounted as an island in the Svelte editor.
 *
 * Loaded with a dynamic import, so React and Video.js are only fetched for
 * audio and video manifests. The island reports playback to Svelte through
 * callbacks and takes seeks back; nothing else crosses the boundary.
 */

import { createRoot } from 'react-dom/client';
import { IIIFPlayer, MediaPlayer } from '@samvera/ramp';
import '@samvera/ramp/dist/ramp.css';

export interface RampPlayback {
  time: number;
  duration: number;
  /** A player is attached, so it can be seeked. Streams may not load metadata until played. */
  ready: boolean;
  /** Playing now, as opposed to paused or ended. */
  playing: boolean;
  error: boolean;
}

export interface RampHandle {
  seek(time: number): void;
  destroy(): void;
}

/** The slice of RAMP's Video.js player used here. */
interface Player {
  currentTime(): number | undefined;
  currentTime(time: number): void;
  duration(): number | undefined;
  readyState(): number | undefined;
  paused(): boolean;
  isDisposed(): boolean;
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
}

/*
 * RAMP bundles its own Video.js, so its players are not in the registry of any
 * `video.js` this package could import. Video.js puts the player on its
 * element; finding it inside this island also keeps two editors apart.
 */
const findPlayer = (element: HTMLElement): Player | undefined =>
  (element.querySelector('.video-js') as (HTMLElement & { player?: Player }) | null)?.player;

export const mountRamp = (
  element: HTMLElement,
  manifest: object,
  initialDuration: number,
  onplayback: (playback: RampPlayback) => void,
): RampHandle => {
  const root = createRoot(element);
  root.render(
    <IIIFPlayer manifest={manifest}>
      <MediaPlayer enablePlaybackRate enablePIP enableFileDownload={false} />
    </IIIFPlayer>,
  );

  const state: RampPlayback = { time: 0, duration: initialDuration, ready: false, playing: false, error: false };
  const report = () => onplayback({ ...state });
  let player: Player | undefined;
  let detach = () => {};

  // RAMP creates its player asynchronously and recreates it on source changes.
  const timer = setInterval(() => {
    const current = findPlayer(element);
    if (!current || current.isDisposed() || current === player) return;
    detach();
    player = current;
    // Video.js holds a seek until the media can take it, so the player is usable now.
    state.ready = true;
    report();

    const onTime = () => {
      state.time = current.currentTime() || 0;
      report();
    };
    const onMetadata = () => {
      state.ready = true;
      state.error = false;
      const value = current.duration();
      if (value && Number.isFinite(value)) state.duration = value;
      report();
    };
    const onPlayState = () => {
      state.playing = !current.paused();
      report();
    };
    const onError = () => {
      state.ready = false;
      state.error = true;
      report();
    };
    current.on('timeupdate', onTime);
    current.on('loadedmetadata', onMetadata);
    current.on('error', onError);
    current.on('play', onPlayState);
    current.on('pause', onPlayState);
    current.on('ended', onPlayState);
    if ((current.readyState() ?? 0) >= 1) onMetadata();

    detach = () => {
      if (current.isDisposed()) return;
      current.off('timeupdate', onTime);
      current.off('loadedmetadata', onMetadata);
      current.off('error', onError);
      current.off('play', onPlayState);
      current.off('pause', onPlayState);
      current.off('ended', onPlayState);
    };
  }, 150);

  report();

  return {
    seek(time) {
      if (!player || player.isDisposed()) return;
      const next = Math.max(0, Math.min(time, state.duration || time));
      player.currentTime(next);
      state.time = next;
      report();
    },
    destroy() {
      clearInterval(timer);
      detach();
      root.unmount();
    },
  };
};
