# OmniTutor Architecture Film — Production README

A cinematic architecture documentary film about OmniTutor, built with Remotion.

## Requirements

- Node.js 18+
- npm 9+
- Chrome/Chromium (for rendering)

## Installation

```bash
cd video
npm install
```

## Preview in Remotion Studio

```bash
cd video
npx remotion studio
```

This opens the Studio in your browser. You can:
- Scrub through the timeline
- Inspect individual scenes by opening the `Scenes/` folder in the left panel
- Edit scene durations directly in code — changes hot-reload

## Individual Scene Preview

Navigate directly to a scene in Studio:

```
http://localhost:3000/Scene1Opening
http://localhost:3000/Scene2Interface
http://localhost:3000/Scene3ApiBoundary
http://localhost:3000/Scene4CorePipeline
http://localhost:3000/Scene5IntelligencePipeline
http://localhost:3000/Scene6SafetyGrounding
http://localhost:3000/Scene7ResponseJourney
http://localhost:3000/Scene8Architecture
```

## Render to MP4

Final render command (H.264 + AAC, used to produce the current deliverable):
```bash
cd video
npx remotion render OmniTutorFilm out/omnitutor-architecture-film.mp4 --codec=h264 --crf=22 --audio-codec=aac
```

For higher quality (larger file):
```bash
npx remotion render OmniTutorFilm out/omnitutor-architecture-film.mp4 --codec=h264 --crf=18 --audio-codec=aac
```

Muted render (for visual-only preview):
```bash
npx remotion render OmniTutorFilm out/omnitutor-film-muted.mp4 --codec=h264 --crf=22 --muted
```

## Generate narration audio

```bash
cd video

# Generate all 8 scenes
node scripts/generate-narration.mjs

# Regenerate a single scene (e.g. scene 3 only)
node scripts/generate-narration.mjs --scene=3
```

Requires `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `video/.env`.  
Voice used: ID `wjH9GfMgLMFTMbdW5HuO`, model `eleven_turbo_v2_5`.

## Generate music and SFX

```bash
node scripts/generate-music.mjs   # → public/music/background.wav (180s)
node scripts/generate-sfx.mjs     # → public/sfx/transition.wav + data-flow.wav
```

No external dependencies — pure Node.js math.

## Activate/deactivate narration per scene

In each `src/scenes/SceneN.tsx`, find:
```tsx
<AudioTrack scene={N} available={true} />
```
Set `available={false}` to silence a scene without removing the component.

## Render a Single Frame

```bash
npx remotion still OmniTutorFilm --frame=225 out/frame-225.png
```

## Adding Narration Audio

1. Record narration per `production/NARRATION_SCRIPT.md`
2. Place files in `video/public/narration/`:
   - `scene1.mp3`, `scene2.mp3`, ..., `scene8.mp3`
3. In each scene file, import and add:

```tsx
import { Audio } from '@remotion/media';
import { staticFile } from 'remotion';

// Inside the scene component:
<Audio src={staticFile('narration/scene1.mp3')} />
```

## Project Structure

```
video/
├── src/
│   ├── Root.tsx                          # Composition registrations
│   ├── OmniTutorFilm.tsx                 # Main film (all 8 scenes)
│   ├── constants.ts                      # Colors, timing, architecture data
│   ├── components/
│   │   ├── ArchitectureBox.tsx           # Reusable component box
│   │   ├── DataFlowArrow.tsx             # Animated directional arrow
│   │   ├── CodeSnippet.tsx               # Syntax-highlighted code excerpt
│   │   └── NarrationCaption.tsx          # Bottom subtitle component
│   └── scenes/
│       ├── Scene1Opening.tsx             # 0:00–0:12 — Title card
│       ├── Scene2Interface.tsx           # 0:12–0:30 — Chat UI
│       ├── Scene3ApiBoundary.tsx         # 0:30–0:50 — API route
│       ├── Scene4CorePipeline.tsx        # 0:50–1:10 — Embed + retrieve
│       ├── Scene5IntelligencePipeline.tsx # 1:10–1:38 — Gemini call
│       ├── Scene6SafetyGrounding.tsx     # 1:38–1:58 — Grounding guards
│       ├── Scene7ResponseJourney.tsx     # 1:58–2:15 — Return path
│       └── Scene8Architecture.tsx       # 2:15–2:30 — Full diagram
├── public/
│   └── narration/                       # Place audio files here
├── production/
│   ├── ARCHITECTURE_VERIFICATION.md
│   ├── NARRATION_SCRIPT.md
│   ├── STORYBOARD.md
│   ├── ASSET_MANIFEST.md
│   └── README.md (this file)
└── package.json
```

## Editing Scenes

- Each scene is independently registered as a `<Composition>` in `Root.tsx`
- Open any scene directly in Studio to edit its timeline
- Scene durations are defined in `src/constants.ts` — change `SCENE_DURATIONS.sceneN` to adjust
- Colors are in `COLORS` in `src/constants.ts`
- Architecture node positions are in `ARCH_NODES`

## Technical Notes

- **No CSS transitions** — all animations use `interpolate()` + `useCurrentFrame()`
- **Font:** Inter via `@remotion/google-fonts` — blocks rendering until loaded
- **Transitions:** `@remotion/transitions` fade, 15 frames each, between all scenes
- **Total frames:** 4395 at 30fps = 2:27.5 effective runtime
- **Source data:** All architecture labels match verified source code — see `production/ARCHITECTURE_VERIFICATION.md`
