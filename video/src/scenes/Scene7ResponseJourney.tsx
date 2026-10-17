import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS } from '../constants';
import { ArchitectureBox } from '../components/ArchitectureBox';
import { DataFlowArrow } from '../components/DataFlowArrow';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });

export const Scene7ResponseJourney: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const phase1 = interpolate(frame, [fps * 0.3, fps * 1.0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const phase2 = interpolate(frame, [fps * 2.2, fps * 2.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const phase3 = interpolate(frame, [fps * 4.0, fps * 4.8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const citationPulse = interpolate(frame, [fps * 4.5, fps * 5.0, fps * 5.5], [1, 1.08, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      <div style={{position: 'absolute', top: 48, left: 80, opacity: titleOpacity}}>
        <span style={{fontSize: 14, color: COLORS.emerald, opacity: 0.9, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Scene 7 — Response Journey</span>
      </div>

      {/* Phase 1: TutorAnswer JSON */}
      <div style={{opacity: phase1}}>
        <ArchitectureBox label="TutorAnswer" sublabel="{coverage, blocks[], bktDelta}" accentColor={COLORS.emerald} x={80} y={250} width={260} height={80} delayFrames={fps * 0.4} highlighted={true} />
        <DataFlowArrow x1={340} y1={290} x2={480} y2={290} color={COLORS.emerald} label="JSON response" delayFrames={fps * 0.9} />
      </div>

      {/* Phase 2: Frontend rendering */}
      <div style={{opacity: phase2}}>
        <ArchitectureBox label="Next.js Frontend" sublabel="block-by-block rendering" accentColor={COLORS.cyan} x={480} y={250} width={240} height={80} delayFrames={fps * 2.3} />
        <DataFlowArrow x1={720} y1={270} x2={840} y2={200} color={COLORS.cyan} delayFrames={fps * 2.7} />
        <DataFlowArrow x1={720} y1={290} x2={840} y2={310} color={COLORS.cyan} delayFrames={fps * 2.8} />

        {/* Rendered blocks */}
        <div style={{ position: 'absolute', left: 840, top: 150, width: 300, opacity: interpolate(frame, [fps * 2.9, fps * 3.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <div style={{ background: `${COLORS.violet}18`, border: `1px solid ${COLORS.violet}44`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
            <span style={{fontSize: 13, color: COLORS.white, opacity: 0.8, fontFamily: 'monospace'}}>origin: <span style={{color: COLORS.emerald}}>&quot;material&quot;</span></span>
            <div style={{fontSize: 14, color: COLORS.white, lineHeight: 1.5, marginTop: 4}}>Virtual memory uses page tables to map virtual addresses…</div>
          </div>
          <div style={{ background: `${COLORS.amber}12`, border: `1px solid ${COLORS.amber}33`, borderRadius: 8, padding: '10px 14px' }}>
            <span style={{fontSize: 13, color: COLORS.white, opacity: 0.8, fontFamily: 'monospace'}}>origin: <span style={{color: COLORS.amber}}>&quot;outside&quot;</span></span>
            <div style={{fontSize: 14, color: COLORS.white, lineHeight: 1.5, marginTop: 4}}>Additional context not in course material.</div>
          </div>
        </div>
      </div>

      {/* Phase 3: Citation chip click */}
      <div style={{opacity: phase3}}>
        <div
          style={{position: 'absolute', left: 840, top: 370,
            scale: String(citationPulse),}}
        >
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              background: `${COLORS.cyan}22`,
              border: `1.5px solid ${COLORS.cyan}88`,
              borderRadius: 20,
              cursor: 'pointer',
            }}
          >
            <span style={{fontSize: 14, color: COLORS.cyan, fontWeight: 600}}>📄 Lecture-3.pdf · p.12</span>
          </div>
        </div>
        <DataFlowArrow x1={1050} y1={390} x2={1160} y2={390} color={COLORS.cyan} label="opens at exact page" delayFrames={fps * 4.6} />
        <div style={{ position: 'absolute', left: 1160, top: 330, opacity: interpolate(frame, [fps * 4.8, fps * 5.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <div style={{ width: 200, height: 130, background: 'rgba(255,255,255,0.04)', border: `1.5px solid ${COLORS.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{fontSize: 12, color: COLORS.white, opacity: 0.5, textAlign: 'center'}}>PDF / Video / Slide<br />source at exact location</span>
          </div>
        </div>
      </div>

      <NarrationCaption
        text="The validated answer travels back to the browser. The student sees the response rendered block by block. A citation chip references a PDF page, a slide, a video timestamp. Click it — and the source opens at the exact location. The loop is complete."
        startFrame={fps * 0.5}
        endFrame={fps * 19}
      />
      {/* Narration audio — set available={true} once public/narration/scene7.mp3 is generated */}
      <AudioTrack scene={7} available={true} />
    </AbsoluteFill>
  );
};
