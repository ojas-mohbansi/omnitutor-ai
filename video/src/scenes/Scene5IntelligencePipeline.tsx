import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS } from '../constants';
import { ArchitectureBox } from '../components/ArchitectureBox';
import { DataFlowArrow } from '../components/DataFlowArrow';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });

export const Scene5IntelligencePipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const phase1 = interpolate(frame, [fps * 0.3, fps * 1.0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const phase2 = interpolate(frame, [fps * 2.5, fps * 3.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const phase3 = interpolate(frame, [fps * 4.5, fps * 5.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const codeOpacity = interpolate(frame, [fps * 5.0, fps * 6.0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Gemini pulsing glow
  const geminiGlow = interpolate(frame, [fps * 3.0, fps * 3.5, fps * 4.0], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      <div style={{position: 'absolute', top: 48, left: 80, opacity: titleOpacity}}>
        <span style={{fontSize: 14, color: COLORS.violet, opacity: 0.9, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Scene 5 — Intelligence Pipeline</span>
        <div style={{fontSize: 13, color: COLORS.white, opacity: 0.4, fontFamily: 'monospace', marginTop: 4}}>packages/core/src/llm.ts — single Gemini gateway</div>
      </div>

      {/* Phase 1: inputs converge on llm.ts */}
      <div style={{opacity: phase1}}>
        <ArchitectureBox label="Top 6 Chunks" sublabel="retrieved context" accentColor={COLORS.cyan} x={80} y={200} width={220} height={70} delayFrames={fps * 0.4} />
        <ArchitectureBox label="Learner Profile" sublabel="tone · style · mastery · goal" accentColor={COLORS.amber} x={80} y={310} width={220} height={70} delayFrames={fps * 0.5} />
        <ArchitectureBox label="Conversation" sublabel="chat history" accentColor={COLORS.white} x={80} y={420} width={220} height={70} delayFrames={fps * 0.6} />

        <DataFlowArrow x1={300} y1={235} x2={440} y2={310} color={COLORS.cyan} delayFrames={fps * 0.9} />
        <DataFlowArrow x1={300} y1={345} x2={440} y2={345} color={COLORS.amber} delayFrames={fps * 1.0} />
        <DataFlowArrow x1={300} y1={455} x2={440} y2={380} color={COLORS.white} delayFrames={fps * 1.1} />

        <ArchitectureBox label="llm.ts" sublabel="rate-limit · cache · retry · fallback" accentColor={COLORS.violet} x={440} y={290} width={200} height={90} delayFrames={fps * 1.3} highlighted={true} />
      </div>

      {/* Phase 2: single Gemini call */}
      <div style={{opacity: phase2}}>
        <DataFlowArrow x1={640} y1={335} x2={780} y2={335} color={COLORS.violet} label="LLM_MODEL_STRONG" delayFrames={fps * 2.6} />
        <div
          style={{
            position: 'absolute', left: 780, top: 270,
            width: 220, height: 130,
            background: `${COLORS.violet}22`,
            border: `1.5px solid ${COLORS.violet}`,
            borderRadius: 14,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 ${30 + geminiGlow * 30}px ${COLORS.violet}55`,
          }}
        >
          <span style={{fontSize: 22, color: COLORS.violet, fontWeight: 700}}>Gemini API</span>
          <span style={{fontSize: 12, color: COLORS.white, opacity: 0.5, marginTop: 4}}>@google/genai 2.29</span>
          <span style={{fontSize: 11, color: COLORS.violet, opacity: 0.7, marginTop: 6}}>LLM_MODEL_STRONG</span>
        </div>
      </div>

      {/* Phase 3: structured response */}
      <div style={{opacity: phase3}}>
        <DataFlowArrow x1={1000} y1={335} x2={1100} y2={335} color={COLORS.emerald} delayFrames={fps * 4.6} />
        <ArchitectureBox label="coverage" sublabel="COVERED | PARTIAL | NOT_COVERED" accentColor={COLORS.emerald} x={1100} y={200} width={240} height={70} delayFrames={fps * 4.7} />
        <ArchitectureBox label="blocks[]" sublabel="{origin: material|outside, text, citations}" accentColor={COLORS.cyan} x={1100} y={300} width={240} height={80} delayFrames={fps * 4.8} highlighted={true} />
        <ArchitectureBox label="learnerEvidence" sublabel="BKT update signal" accentColor={COLORS.amber} x={1100} y={410} width={240} height={70} delayFrames={fps * 4.9} />
      </div>

      {/* Code path label */}
      <div style={{position: 'absolute', bottom: 160, left: 80, opacity: codeOpacity}}>
        <span style={{fontSize: 13, color: COLORS.white, opacity: 0.4, fontFamily: 'monospace'}}>packages/core/src/llm.ts — the ONLY file that calls Gemini</span>
      </div>

      <NarrationCaption
        text="A single structured call reaches the Gemini model. It arrives with the student's retrieved excerpts, their personalized learning profile — tone, explanation style, mastery level — and the conversation history. The model returns labeled blocks: material claims with citation IDs, and outside knowledge clearly tagged. This is where the intelligence lives."
        startFrame={fps * 0.5}
        endFrame={fps * 27}
      />
      {/* Narration audio — set available={true} once public/narration/scene5.mp3 is generated */}
      <AudioTrack scene={5} available={true} />
    </AbsoluteFill>
  );
};
