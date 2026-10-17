import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS, FONT_SIZES } from '../constants';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });

const messages = [
  { role: 'user' as const, text: 'Explain virtual memory with page tables', delay: 0 },
  { role: 'system' as const, text: 'Retrieving relevant course material…', delay: 30 },
];

export const Scene2Interface: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panelOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [fps * 0.8, fps * 1.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily, alignItems: 'center', justifyContent: 'center'}}>
      {/* Left: UI mockup */}
      <div
        style={{
          position: 'absolute',
          left: '8%',
          top: '15%',
          width: 560,
          height: 640,
          opacity: panelOpacity,
          background: 'rgba(255,255,255,0.03)',
          border: `1.5px solid ${COLORS.border}`,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header bar */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{width: 10, height: 10, borderRadius: '50%', background: COLORS.cyan}} />
          <span style={{fontSize: 14, color: COLORS.white, opacity: 0.8, fontWeight: 600}}>OmniTutor Chat</span>
        </div>
        {/* Messages */}
        <div style={{flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14}}>
          {messages.map((msg, i) => {
            const msgOpacity = interpolate(frame, [fps * (0.5 + i * 0.6), fps * (0.9 + i * 0.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const isUser = msg.role === 'user';
            return (
              <div key={i} style={{display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', opacity: msgOpacity}}>
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: isUser ? `${COLORS.cyan}22` : `${COLORS.violet}22`,
                    border: `1px solid ${isUser ? COLORS.cyan + '44' : COLORS.violet + '44'}`,
                    fontSize: 15,
                    color: COLORS.white,
                    lineHeight: 1.5,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>
        {/* Input bar */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${COLORS.border}` }} />
          <div style={{ width: 38, height: 38, borderRadius: 8, background: `${COLORS.cyan}33`, border: `1px solid ${COLORS.cyan}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{color: COLORS.cyan, fontSize: 18}}>↑</span>
          </div>
        </div>
      </div>

      {/* Right: annotation */}
      <div style={{position: 'absolute', left: '44%', top: '30%', opacity: labelOpacity}}>
        <div style={{fontSize: FONT_SIZES.label, fontWeight: 700, color: COLORS.cyan, marginBottom: 12}}>POST /api/chat</div>
        <div style={{fontSize: FONT_SIZES.body, color: COLORS.white, opacity: 0.75, lineHeight: 1.6, maxWidth: 480}}>
          One route. One Zod-validated request body.<br />
          <span style={{color: COLORS.amber}}>Session cookie verified.</span><br />
          Delegated entirely to <span style={{color: COLORS.violet, fontFamily: 'monospace'}}>@sc/core</span>.
        </div>
        <div style={{marginTop: 16, fontSize: 14, color: COLORS.white, opacity: 0.4, fontFamily: 'monospace'}}>
          apps/web/app/api/chat/route.ts
        </div>
      </div>

      <NarrationCaption
        text="A student types a question. Behind that text field, a Next.js application captures the request and validates it against a shared Zod contract. The entry point: POST /api/chat. One route. One purpose."
        startFrame={fps * 0.5}
        endFrame={fps * 17}
      />
      {/* Narration audio — set available={true} once public/narration/scene2.mp3 is generated */}
      <AudioTrack scene={2} available={true} />
    </AbsoluteFill>
  );
};
