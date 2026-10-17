import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONT_SIZES } from '../constants';

export type NarrationCaptionProps = {
  text: string;
  startFrame?: number;
  endFrame?: number;
};

export const NarrationCaption: React.FC<NarrationCaptionProps> = ({
  text,
  startFrame = 0,
  endFrame,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const end = endFrame ?? durationInFrames;

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 15, end - 15, end],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{position: 'absolute',
        bottom: 60,
        left: '10%',
        width: '80%',
        textAlign: 'center',
        opacity,}}
    >
      <div
        style={{display: 'inline-block',
          background: 'rgba(10,15,30,0.82)',
          borderRadius: 8,
          padding: '10px 24px',
          fontFamily: 'Inter, sans-serif',
          fontSize: FONT_SIZES.caption,
          color: COLORS.white,
          lineHeight: 1.5,
          maxWidth: 900,}}
      >
        {text}
      </div>
    </div>
  );
};
