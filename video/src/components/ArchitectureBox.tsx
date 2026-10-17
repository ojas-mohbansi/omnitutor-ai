import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT_SIZES } from '../constants';

export type ArchitectureBoxProps = {
  label: string;
  sublabel?: string;
  accentColor?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  delayFrames?: number;
  highlighted?: boolean;
};

export const ArchitectureBox: React.FC<ArchitectureBoxProps> = ({
  label,
  sublabel,
  accentColor = COLORS.white,
  x,
  y,
  width = 200,
  height = 80,
  delayFrames = 0,
  highlighted = false,
}) => {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame - delayFrames);

  const opacity = interpolate(localFrame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = interpolate(localFrame, [0, 20], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const borderColor = highlighted ? accentColor : COLORS.border;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity,
        scale: String(scale),
        background: COLORS.surface,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        boxSizing: 'border-box',
        boxShadow: highlighted ? `0 0 24px 4px ${accentColor}40` : 'none',
      }}
    >
      <span style={{fontFamily: 'Inter, sans-serif', fontSize: FONT_SIZES.caption, fontWeight: 700, color: accentColor, textAlign: 'center', lineHeight: 1.2}}>
        {label}
      </span>
      {sublabel && (
        <span style={{fontFamily: 'monospace', fontSize: 11, color: COLORS.white, opacity: 0.5, textAlign: 'center', marginTop: 3, lineHeight: 1.2}}>
          {sublabel}
        </span>
      )}
    </div>
  );
};
