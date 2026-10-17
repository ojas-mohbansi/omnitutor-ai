// OmniTutor Film — design constants
// All verified from source: C:\Users\styli\OneDrive\Documents\GitHub\Omnitutor

export const COLORS = {
  background: '#0a0f1e',      // midnight navy — environment
  cyan: '#00d4ff',            // electric cyan — request flow, data movement
  violet: '#7c3aed',          // deep violet — AI/Gemini processing
  white: '#f8f8f2',           // warm white — typography, labels
  amber: '#f59e0b',           // amber — decisions, guards, boundaries
  emerald: '#10b981',         // emerald — verified/success states
  surface: 'rgba(255,255,255,0.04)',   // glassmorphism box fill
  border: 'rgba(255,255,255,0.12)',    // glassmorphism border
  borderCyan: 'rgba(0,212,255,0.35)', // cyan-tinted border
  borderViolet: 'rgba(124,58,237,0.45)', // violet-tinted border
} as const;

export const FONT_SIZES = {
  headline: 72,
  label: 36,
  body: 24,
  caption: 18,
  code: 16,
} as const;

// Scene frame ranges (30fps, target 4500 total before transition overlap)
export const SCENE_DURATIONS = {
  scene1: 360,   // 0:12 — Opening
  scene2: 540,   // 0:18 — Interface
  scene3: 600,   // 0:20 — API boundary
  scene4: 600,   // 0:20 — Core pipeline
  scene5: 840,   // 0:28 — Intelligence pipeline
  scene6: 600,   // 0:20 — Safety & grounding
  scene7: 600,   // 0:20 — Response journey
  scene8: 360,   // 0:12 — Full architecture
} as const;

// 15-frame fade transition between each of the 7 scene boundaries
// Total: sum(SCENE_DURATIONS) - 7*15 = 4500 - 105 = 4395 effective frames
// We set main composition to 4395 to match exactly
export const TRANSITION_FRAMES = 15;
export const TOTAL_FRAMES = 4395; // 30fps × ~2:27, effectively 2:30 with transitions
export const FPS = 30;

export const ARCH_NODES = [
  { id: 'browser', label: 'Browser', sublabel: 'React + Next.js', color: COLORS.cyan, x: 80, y: 440 },
  { id: 'route', label: 'POST /api/chat', sublabel: 'apps/web/app/api/chat/route.ts', color: COLORS.white, x: 340, y: 440 },
  { id: 'core', label: '@sc/core', sublabel: 'packages/core/src/tutor.ts', color: COLORS.white, x: 660, y: 440 },
  { id: 'llm', label: 'llm.ts', sublabel: 'packages/core/src/llm.ts', color: COLORS.violet, x: 900, y: 300 },
  { id: 'gemini', label: 'Gemini API', sublabel: 'google/genai 2.29', color: COLORS.violet, x: 1140, y: 300 },
  { id: 'postgres', label: 'PostgreSQL', sublabel: 'Prisma 6.19 · chunks + mastery', color: COLORS.emerald, x: 900, y: 580 },
  { id: 'uploads', label: 'data/uploads', sublabel: 'originals (permanent)', color: COLORS.amber, x: 660, y: 700 },
] as const;
