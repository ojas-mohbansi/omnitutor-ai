import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS, FONT_SIZES } from '../constants';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '700', '900'], subsets: ['latin'] });

export const Scene1Opening: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Grid opacity: fades in slowly
  const gridOpacity = interpolate(frame, [0, fps * 1.5], [0, 0.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Title fade and scale
  const titleOpacity = interpolate(frame, [fps * 0.3, fps * 1.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleScale = interpolate(frame, [fps * 0.3, fps * 1.2], [0.88, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Subtitle fades in after title
  const subtitleOpacity = interpolate(frame, [fps * 1.5, fps * 2.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Tagline
  const taglineOpacity = interpolate(frame, [fps * 2.8, fps * 3.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Cyan accent line below title
  const lineWidth = interpolate(frame, [fps * 1.2, fps * 2.0], [0, 280], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      {/* Grid background */}
      <div
        style={{
          position: 'absolute', inset: 0, opacity: gridOpacity,
          backgroundImage: `linear-gradient(${COLORS.cyan}22 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyan}22 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Title */}
      <div
        style={{position: 'absolute', top: '34%', width: '100%', textAlign: 'center',
          opacity: titleOpacity,
          scale: String(titleScale),}}
      >
        <span style={{fontSize: 96, fontWeight: 900, color: COLORS.white, letterSpacing: '-2px'}}>
          Omni<span style={{color: COLORS.cyan}}>Tutor</span>
        </span>
      </div>

      {/* Cyan accent line */}
      <div
        style={{
          position: 'absolute', top: 'calc(34% + 110px)',
          left: '50%',
          translate: `${-lineWidth / 2}px 0`,
          width: lineWidth,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${COLORS.cyan}, transparent)`,
          borderRadius: 2,
        }}
      />

      {/* Subtitle */}
      <div
        style={{position: 'absolute', top: 'calc(34% + 135px)', width: '100%', textAlign: 'center',
          opacity: subtitleOpacity,}}
      >
        <span style={{fontSize: FONT_SIZES.label, fontWeight: 400, color: COLORS.white, opacity: 0.7, letterSpacing: '0.05em'}}>
          A knowledge base grounded in your course material
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{position: 'absolute', top: 'calc(34% + 200px)', width: '100%', textAlign: 'center',
          opacity: taglineOpacity,}}
      >
        <span style={{fontSize: FONT_SIZES.body, fontWeight: 400, color: COLORS.cyan, opacity: 0.8, letterSpacing: '0.12em', textTransform: 'uppercase'}}>
          Next.js · PostgreSQL · Gemini API · BKT Learner Model
        </span>
      </div>

      <NarrationCaption
        text="Every question a student asks travels through a system most will never see. This is OmniTutor — a knowledge base built from your own course material, designed to teach, test, and track understanding."
        startFrame={fps * 0.5}
        endFrame={fps * 11}
      />
      {/* Narration audio — set available={true} once public/narration/scene1.mp3 is generated */}
      <AudioTrack scene={1} available={true} />
    </AbsoluteFill>
  );
};
