import React from 'react';
import { Audio } from '@remotion/media';
import { staticFile, useVideoConfig } from 'remotion';

// BackgroundMusic plays an ambient audio bed at low volume.
// Defaults to background.wav; set useMp3={true} if background.mp3 is generated.
export const BackgroundMusic: React.FC<{ useMp3?: boolean }> = ({ useMp3 = false }) => {
  const { fps } = useVideoConfig();
  const src = useMp3
    ? staticFile('music/background.mp3')
    : staticFile('music/background.wav');
  return (
    <Audio
      src={src}
      premountFor={fps * 2}
      volume={0.18}
      loop
    />
  );
};
