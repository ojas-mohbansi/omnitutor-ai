import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS, FONT_SIZES } from '../constants';
import { ArchitectureBox } from '../components/ArchitectureBox';
import { DataFlowArrow } from '../components/DataFlowArrow';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });

export const Scene4CorePipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Step labels fade in sequentially
  const step1Op = interpolate(frame, [fps * 0.2, fps * 0.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const step2Op = interpolate(frame, [fps * 2.0, fps * 2.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const step3Op = interpolate(frame, [fps * 3.8, fps * 4.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      <div style={{position: 'absolute', top: 48, left: 80, opacity: titleOpacity}}>
        <span style={{fontSize: 14, color: COLORS.cyan, opacity: 0.7, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Scene 4 — Core Pipeline</span>
        <div style={{fontSize: 13, color: COLORS.white, opacity: 0.4, fontFamily: 'monospace', marginTop: 4}}>packages/core/src/tutor.ts</div>
      </div>

      {/* Step 1: Question → Embed */}
      <div style={{position: 'absolute', top: 160, left: 80, opacity: step1Op}}>
        <div style={{fontSize: FONT_SIZES.caption, color: COLORS.cyan, fontWeight: 700, marginBottom: 6}}>① Embed Query</div>
      </div>
      <ArchitectureBox label='"Explain virtual memory…"' accentColor={COLORS.white} x={80} y={200} width={280} height={70} delayFrames={fps * 0.3} />
      <DataFlowArrow x1={360} y1={235} x2={480} y2={235} color={COLORS.cyan} label="768-dim" delayFrames={fps * 0.8} />
      <ArchitectureBox label="Gemini Embed" sublabel="EMBED_MODEL" accentColor={COLORS.violet} x={480} y={200} width={180} height={70} delayFrames={fps * 0.9} />
      <DataFlowArrow x1={660} y1={235} x2={780} y2={235} color={COLORS.violet} delayFrames={fps * 1.2} />
      <div style={{ position: 'absolute', left: 780, top: 210, opacity: interpolate(frame, [fps * 1.3, fps * 1.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <div style={{fontSize: 28, color: COLORS.violet}}>⟨v⟩</div>
        <div style={{fontSize: 11, color: COLORS.white, opacity: 0.5, fontFamily: 'monospace', marginTop: 2}}>Float[768]</div>
      </div>

      {/* Step 2: Vector vs Postgres */}
      <div style={{position: 'absolute', top: 340, left: 80, opacity: step2Op}}>
        <div style={{fontSize: FONT_SIZES.caption, color: COLORS.cyan, fontWeight: 700, marginBottom: 6}}>② Cosine Search — PostgreSQL (no pgvector)</div>
        <div style={{fontSize: 13, color: COLORS.white, opacity: 0.5}}>cosine computed in TypeScript · chunks stored as Float[768] in Postgres</div>
      </div>
      <ArchitectureBox label="PostgreSQL" sublabel="Course chunks · Float[768] embeddings" accentColor={COLORS.emerald} x={80} y={400} width={280} height={80} delayFrames={fps * 2.1} />
      <DataFlowArrow x1={360} y1={440} x2={480} y2={440} color={COLORS.emerald} label="top-6" delayFrames={fps * 2.5} />
      <ArchitectureBox label="Top 6 Chunks" sublabel="TEXT · FIGURE · SLIDE · TRANSCRIPT" accentColor={COLORS.amber} x={480} y={400} width={260} height={80} delayFrames={fps * 2.8} highlighted={true} />

      {/* Step 3: Mastery load */}
      <div style={{position: 'absolute', top: 550, left: 80, opacity: step3Op}}>
        <div style={{fontSize: FONT_SIZES.caption, color: COLORS.cyan, fontWeight: 700, marginBottom: 6}}>③ Load Learner Mastery (BKT)</div>
        <div style={{fontSize: 13, color: COLORS.white, opacity: 0.5}}>packages/core/src/bkt.ts · p0=0.3 · learn=0.15 · slip=0.1</div>
      </div>
      <ArchitectureBox label="Mastery" sublabel="p per topic from Postgres" accentColor={COLORS.amber} x={80} y={600} width={220} height={70} delayFrames={fps * 3.9} />
      <DataFlowArrow x1={300} y1={635} x2={400} y2={635} color={COLORS.amber} delayFrames={fps * 4.2} />
      <ArchitectureBox label="Learner Profile" sublabel="tone · style · mastery level · goal" accentColor={COLORS.white} x={400} y={600} width={260} height={70} delayFrames={fps * 4.3} />

      <NarrationCaption
        text="Inside @sc/core, the tutor function begins. The question becomes a 768-dimensional embedding via the Gemini embedding model. That vector is compared against thousands of course chunks stored in PostgreSQL — not in a vector database, but in plain floats, with cosine similarity computed directly in TypeScript. The top six chunks are retrieved."
        startFrame={fps * 0.5}
        endFrame={fps * 19}
      />
      {/* Narration audio — set available={true} once public/narration/scene4.mp3 is generated */}
      <AudioTrack scene={4} available={true} />
    </AbsoluteFill>
  );
};
