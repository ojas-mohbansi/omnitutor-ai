import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS, FONT_SIZES } from '../constants';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });

const GUARDS = [
  {
    step: '①',
    title: 'Citation Verification',
    detail: 'Every citation ID is checked against the retrieved chunk set. An uncited claim cannot reference real material.',
    color: COLORS.amber,
    verdict: 'VERIFIED',
    verdictColor: COLORS.emerald,
  },
  {
    step: '②',
    title: 'Block Relabeling',
    detail: 'Any block tagged origin:material without a valid citation is automatically relabeled origin:outside. No trust without evidence.',
    color: COLORS.amber,
    verdict: 'RELABELED',
    verdictColor: COLORS.amber,
  },
  {
    step: '③',
    title: 'Refusal Threshold — REFUSAL_TAU = 0.60',
    detail: 'If the top cosine similarity score falls below 0.60, or coverage=NOT_COVERED, the entire answer is refused. Grounding enforced in code, not in a prompt.',
    color: COLORS.amber,
    verdict: 'REFUSED if < τ',
    verdictColor: COLORS.cyan,
  },
];

export const Scene6SafetyGrounding: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      <div style={{position: 'absolute', top: 48, left: 80, opacity: titleOpacity}}>
        <span style={{fontSize: 14, color: COLORS.amber, opacity: 0.9, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Scene 6 — Safety &amp; Grounding</span>
        <div style={{fontSize: 13, color: COLORS.white, opacity: 0.4, marginTop: 4}}>Grounding is enforced in code, not requested in a prompt.</div>
      </div>

      {GUARDS.map((guard, i) => {
        const delay = fps * (0.4 + i * 1.8);
        const opacity = interpolate(frame, [delay, delay + fps * 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const slideX = interpolate(frame, [delay, delay + fps * 0.5], [-60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const verdictDelay = delay + fps * 0.8;
        const verdictOpacity = interpolate(frame, [verdictDelay, verdictDelay + fps * 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 80,
              top: 160 + i * 200,
              width: 1500,
              opacity,
              translate: `${slideX}px 0`,
            }}
          >
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 28}}>
              <div style={{fontSize: 48, color: guard.color, fontWeight: 700, lineHeight: 1, minWidth: 50}}>{guard.step}</div>
              <div style={{flex: 1}}>
                <div style={{fontSize: FONT_SIZES.label, fontWeight: 700, color: guard.color, marginBottom: 8}}>{guard.title}</div>
                <div style={{fontSize: FONT_SIZES.body, color: COLORS.white, opacity: 0.75, lineHeight: 1.6, maxWidth: 820}}>{guard.detail}</div>
              </div>
              <div style={{opacity: verdictOpacity, textAlign: 'right', minWidth: 160}}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: `${guard.verdictColor}22`,
                    border: `1.5px solid ${guard.verdictColor}66`,
                    fontSize: 15,
                    fontWeight: 700,
                    color: guard.verdictColor,
                    fontFamily: 'monospace',
                  }}
                >
                  {guard.verdict}
                </div>
              </div>
            </div>
            {i < GUARDS.length - 1 && (
              <div style={{ height: 1, background: `${guard.color}22`, marginTop: 20, marginLeft: 78 }} />
            )}
          </div>
        );
      })}

      <NarrationCaption
        text="The server does not trust that response. Every citation is verified against the retrieved set. Any material block without a citation is relabeled. If the retrieval confidence falls below the calibrated threshold, the entire answer is refused. Grounding is enforced in code, not requested in a prompt."
        startFrame={fps * 0.5}
        endFrame={fps * 19}
      />
      {/* Narration audio — set available={true} once public/narration/scene6.mp3 is generated */}
      <AudioTrack scene={6} available={true} />
    </AbsoluteFill>
  );
};
