/**
 * AudioTrack.tsx
 *
 * Graceful narration audio component. When `available` is false (the default,
 * used while narration MP3s are pending) the component renders nothing and
 * Remotion will not crash or warn about a missing src. Once narration files
 * are generated, set `available={true}` on each scene's <AudioTrack />.
 *
 * Usage:
 *   <AudioTrack scene={1} available={false} />   // no-op placeholder
 *   <AudioTrack scene={1} available={true}  />   // plays public/narration/scene1.mp3
 */
import React from 'react';
import { staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';

export type AudioTrackProps = {
  /** 1–8: which scene narration file to play */
  scene: number;
  /**
   * Set to true once public/narration/sceneN.mp3 exists.
   * When false the component renders null (Remotion won't crash).
   */
  available: boolean;
  /** Optional master volume (0–1). Default 1. */
  volume?: number;
};

export const AudioTrack: React.FC<AudioTrackProps> = ({
  scene,
  available,
  volume = 1,
}) => {
  const { fps } = useVideoConfig();

  if (!available) {
    // Narration file not yet generated — render nothing.
    // The scene will render silently; this is intentional during development.
    return null;
  }

  return (
    <Audio
      src={staticFile(`narration/scene${scene}.mp3`)}
      volume={volume}
      premountFor={fps}
    />
  );
};
