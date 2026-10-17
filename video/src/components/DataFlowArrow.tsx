import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../constants';

export type DataFlowArrowProps = {
  x1: number; y1: number;
  x2: number; y2: number;
  color?: string;
  label?: string;
  delayFrames?: number;
  animated?: boolean;
};

export const DataFlowArrow: React.FC<DataFlowArrowProps> = ({
  x1, y1, x2, y2,
  color = COLORS.cyan,
  label,
  delayFrames = 0,
  animated = true,
}) => {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame - delayFrames);

  const progress = animated
    ? interpolate(localFrame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  const opacity = interpolate(localFrame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const dx = x2 - x1;
  const dy = y2 - y1;

  const midX = x1 + (dx * progress) / 2;
  const midY = y1 + (dy * progress) / 2;

  return (
    <svg
      style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', opacity}}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id={`arrow-${color.replace('#','')}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x1 + dx * progress}
        y2={y1 + dy * progress}
        stroke={color}
        strokeWidth={2}
        markerEnd={progress > 0.9 ? `url(#arrow-${color.replace('#','')})` : undefined}
        strokeLinecap="round"
      />
      {label && progress > 0.5 && (
        <text
          x={midX}
          y={midY - 8}
          fill={color}
          fontSize={12}
          fontFamily="Inter, sans-serif"
          textAnchor="middle"
          opacity={interpolate(progress, [0.5, 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        >
          {label}
        </text>
      )}
    </svg>
  );
};
