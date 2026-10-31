/** RAMP 5.1.1 ships no TypeScript declarations. Only the public props used here. */
declare module '@samvera/ramp' {
  import type { ComponentType, ReactNode } from 'react';
  export const IIIFPlayer: ComponentType<{
    manifest: object;
    children: ReactNode;
  }>;
  export const MediaPlayer: ComponentType<{
    enablePlaybackRate?: boolean;
    enablePIP?: boolean;
    enableFileDownload?: boolean;
  }>;
}
