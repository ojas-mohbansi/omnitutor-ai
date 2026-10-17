import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { COLORS } from '../constants';
import { ArchitectureBox } from '../components/ArchitectureBox';
import { DataFlowArrow } from '../components/DataFlowArrow';
import { CodeSnippet } from '../components/CodeSnippet';
import { NarrationCaption } from '../components/NarrationCaption';
import { AudioTrack } from '../components/AudioTrack';

const { fontFamily } = loadFont('normal', { weights: ['400', '600', '700'], subsets: ['latin'] });

export const Scene3ApiBoundary: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily}}>
      {/* Scene title */}
      <div style={{position: 'absolute', top: 48, left: 80, opacity: titleOpacity}}>
        <span style={{fontSize: 14, color: COLORS.cyan, opacity: 0.7, letterSpacing: '0.15em', textTransform: 'uppercase'}}>Scene 3 — API Boundary</span>
      </div>

      {/* Browser box */}
      <ArchitectureBox label="Browser" sublabel="React / Next.js" accentColor={COLORS.cyan} x={80} y={380} width={200} height={90} delayFrames={0} highlighted={false} />

      {/* Arrow 1: Browser → Route */}
      <DataFlowArrow x1={280} y1={425} x2={460} y2={425} color={COLORS.cyan} label="POST /api/chat" delayFrames={25} />

      {/* Route box */}
      <ArchitectureBox label="Route Handler" sublabel="apps/web/app/api/chat/route.ts" accentColor={COLORS.white} x={460} y={380} width={240} height={90} delayFrames={30} highlighted={true} />

      {/* Arrow 2: Route → Core */}
      <DataFlowArrow x1={700} y1={425} x2={870} y2={425} color={COLORS.violet} label="tutor()" delayFrames={60} />

      {/* Core box */}
      <ArchitectureBox label="@sc/core" sublabel="packages/core/src/tutor.ts" accentColor={COLORS.violet} x={870} y={380} width={220} height={90} delayFrames={65} highlighted={false} />

      {/* Trust boundary line */}
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', opacity: interpolate(frame, [fps * 1.5, fps * 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <line x1="840" y1="300" x2="840" y2="560" stroke={COLORS.amber} strokeWidth={1.5} strokeDasharray="8 6" />
        <text x="848" y="295" fill={COLORS.amber} fontSize={13} fontFamily="Inter, sans-serif" opacity={0.8}>Session trust boundary</text>
      </svg>

      {/* Code snippet */}
      <CodeSnippet
        title="apps/web/app/api/chat/route.ts"
        delayFrames={fps * 1.2}
        x={80}
        y={530}
        width={680}
        lines={[
          { text: 'export async function POST(req: Request) {', color: COLORS.white },
          { text: '  const body = ChatRequestSchema.parse(await req.json());', color: COLORS.cyan },
          { text: '  const session = await getSession(req.cookies);', color: COLORS.amber },
          { text: '  if (!session) return unauthorized();', color: COLORS.amber },
          { text: '  const answer = await tutor(body, session);', color: COLORS.violet },
          { text: '  return Response.json(answer);', color: COLORS.emerald },
          { text: '}', color: COLORS.white },
        ]}
      />

      <NarrationCaption
        text="The route handler is deliberately thin. It reads the request body, verifies the session cookie, and delegates entirely to @sc/core — the domain library that contains all intelligence. The session boundary is the system's trust boundary."
        startFrame={fps * 0.5}
        endFrame={fps * 19}
      />
      {/* Narration audio — set available={true} once public/narration/scene3.mp3 is generated */}
      <AudioTrack scene={3} available={true} />
    </AbsoluteFill>
  );
};
