import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT_SIZES } from '../constants';

type CodeLine = { text: string; color?: string };

export type CodeSnippetProps = {
  title?: string;
  lines: CodeLine[];
  delayFrames?: number;
  x?: number;
  y?: number;
  width?: number;
};

export const CodeSnippet: React.FC<CodeSnippetProps> = ({
  title,
  lines,
  delayFrames = 0,
  x = 0,
  y = 0,
  width = 500,
}) => {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame - delayFrames);

  const opacity = interpolate(localFrame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        opacity,
        background: 'rgba(0,0,0,0.55)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: '14px 18px',
        boxSizing: 'border-box',
      }}
    >
      {title && (
        <div style={{fontFamily: 'monospace', fontSize: 11, color: COLORS.cyan, marginBottom: 10, opacity: 0.8}}>
          {title}
        </div>
      )}
      {lines.map((line, i) => {
        const lineOpacity = interpolate(
          localFrame,
          [i * 4, i * 4 + 12],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return (
          <div
            key={i}
            style={{fontFamily: 'monospace',
              fontSize: FONT_SIZES.code,
              color: line.color ?? COLORS.white,
              lineHeight: 1.7,
              opacity: lineOpacity,
              whiteSpace: 'pre',}}
          >
            {line.text}
          </div>
        );
      })}
    </div>
  );
};
