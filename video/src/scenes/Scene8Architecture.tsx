import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS, FONT_SIZES, ARCH_NODES } from '../constants';
import { ArchitectureBox } from '../components/ArchitectureBox';
import { DataFlowArrow } from '../components/DataFlowArrow';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700', '900'], subsets: ['latin'] });

const CONNECTIONS = [
  { from: 'browser', to: 'route', label: 'POST /api/chat', color: COLORS.cyan, delay: 30 },
  { from: 'route', to: 'core', label: 'tutor()', color: COLORS.violet, delay: 50 },
  { from: 'core', to: 'llm', label: 'embed + infer', color: COLORS.violet, delay: 70 },
  { from: 'llm', to: 'gemini', label: 'Gemini API', color: COLORS.violet, delay: 90 },
  { from: 'core', to: 'postgres', label: 'chunks + mastery', color: COLORS.emerald, delay: 110 },
  { from: 'gemini', to: 'core', label: 'TutorAnswer', color: COLORS.emerald, delay: 130 },
  { from: 'core', to: 'route', label: 'answer', color: COLORS.emerald, delay: 150 },
  { from: 'route', to: 'browser', label: 'JSON', color: COLORS.cyan, delay: 170 },
];

export const Scene8Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const nodePositions: Record<string, { x: number; y: number; w: number; h: number }> = {
    browser:  { x: 60,   y: 380, w: 200, h: 80 },
    route:    { x: 340,  y: 380, w: 240, h: 80 },
    core:     { x: 660,  y: 380, w: 200, h: 80 },
    llm:      { x: 940,  y: 240, w: 180, h: 80 },
    gemini:   { x: 1180, y: 240, w: 200, h: 80 },
    postgres: { x: 940,  y: 520, w: 220, h: 80 },
    uploads:  { x: 660,  y: 660, w: 200, h: 70 },
  };

  const getCenterX = (id: string) => nodePositions[id].x + nodePositions[id].w / 2;
  const getCenterY = (id: string) => nodePositions[id].y + nodePositions[id].h / 2;

  // Final OmniTutor identity card
  const identityOpacity = interpolate(frame, [fps * 7.5, fps * 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      {/* Grid */}
      <div
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(${COLORS.cyan}10 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyan}10 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          opacity: 0.6,
        }}
      />

      <div style={{position: 'absolute', top: 40, left: 80, opacity: titleOpacity}}>
        <span style={{fontSize: 28, fontWeight: 900, color: COLORS.white}}>Omni<span style={{color: COLORS.cyan}}>Tutor</span> — Complete Architecture</span>
      </div>

      {/* Connection arrows */}
      {CONNECTIONS.map((conn, i) => (
        <DataFlowArrow
          key={i}
          x1={getCenterX(conn.from)}
          y1={getCenterY(conn.from)}
          x2={getCenterX(conn.to)}
          y2={getCenterY(conn.to)}
          color={conn.color}
          label={conn.label}
          delayFrames={conn.delay}
        />
      ))}

      {/* Architecture nodes */}
      {ARCH_NODES.map((node, i) => {
        const pos = nodePositions[node.id];
        return (
          <ArchitectureBox
            key={node.id}
            label={node.label}
            sublabel={node.sublabel}
            accentColor={node.color}
            x={pos.x}
            y={pos.y}
            width={pos.w}
            height={pos.h}
            delayFrames={i * 8}
          />
        );
      })}

      {/* Tech stack legend */}
      <div style={{ position: 'absolute', bottom: 140, left: 80, display: 'flex', gap: 24, opacity: interpolate(frame, [fps * 4, fps * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        {[
          { label: 'Request flow', color: COLORS.cyan },
          { label: 'AI / Gemini', color: COLORS.violet },
          { label: 'Data / Storage', color: COLORS.emerald },
          { label: 'Guards / Decisions', color: COLORS.amber },
        ].map((item) => (
          <div key={item.label} style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <div style={{width: 24, height: 3, background: item.color, borderRadius: 2}} />
            <span style={{fontSize: 13, color: COLORS.white, opacity: 0.7}}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Final identity */}
      <div
        style={{position: 'absolute', bottom: 60, left: '50%',
          translate: '-50% 0',
          opacity: identityOpacity,
          textAlign: 'center',}}
      >
        <span style={{fontSize: FONT_SIZES.body, color: COLORS.white, opacity: 0.55}}>
          Next.js 16.4 · PostgreSQL 16 · Prisma 6.19 · Gemini API · BKT Learner Model · Turborepo
        </span>
      </div>

      <NarrationCaption
        text="Browser to API route to domain core to Gemini and back. PostgreSQL as the knowledge store. BKT as the learner model. A contract that validates at every boundary. OmniTutor: a complete learning system, grounded in your material."
        startFrame={fps * 0.5}
        endFrame={fps * 11}
      />
      {/* Narration audio — set available={true} once public/narration/scene8.mp3 is generated */}
      <AudioTrack scene={8} available={true} />
    </AbsoluteFill>
  );
};
