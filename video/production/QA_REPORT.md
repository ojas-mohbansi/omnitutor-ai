# OmniTutor Architecture Film — QA Report

**Date:** 2026-10-15  
**Composition:** OmniTutorFilm  
**Output:** `out/omnitutor-architecture-film.mp4`

---

## Render verification

| Check | Result |
|-------|--------|
| Output file exists | ✅ Pass |
| File size | ✅ 9.70 MB |
| Codec | ✅ H.264 video, AAC audio |
| Resolution | ✅ 1920×1080 |
| Frame rate | ✅ 30 fps |
| Total frames | ✅ 4395 |
| Duration | ✅ 146.5 seconds (2:26.5) — within 2:00–3:00 |
| Remotion exit code | ✅ 0 |
| TypeScript (tsc --noEmit) | ✅ 0 errors |

---

## Audio checks

| Asset | Status | Size |
|-------|--------|------|
| narration/scene1.mp3 | ✅ Generated | 204,843 bytes |
| narration/scene2.mp3 | ✅ Generated | 275,060 bytes |
| narration/scene3.mp3 | ✅ Generated | 247,892 bytes |
| narration/scene4.mp3 | ✅ Generated | 412,150 bytes |
| narration/scene5.mp3 | ✅ Generated | 366,593 bytes |
| narration/scene6.mp3 | ✅ Generated | 313,930 bytes |
| narration/scene7.mp3 | ✅ Generated | 265,029 bytes |
| narration/scene8.mp3 | ✅ Generated | 272,134 bytes |
| music/background.wav | ✅ Generated | 31,752,044 bytes (180s) |
| sfx/transition.wav | ✅ Generated | 44,144 bytes (0.5s) |
| sfx/data-flow.wav | ✅ Generated | 13,274 bytes (0.15s) |
| All scenes AudioTrack available={true} | ✅ Verified |
| BackgroundMusic in OmniTutorFilm.tsx | ✅ Integrated |

**ElevenLabs voice used:** Voice ID `wjH9GfMgLMFTMbdW5HuO` (user-created voice, free-tier eligible)  
**Model:** `eleven_turbo_v2_5`  
**API key:** Not logged anywhere.

---

## Architecture accuracy checks

| Check | Result |
|-------|--------|
| All components match verified source | ✅ See ARCHITECTURE_VERIFICATION.md |
| No invented endpoints or services | ✅ Pass |
| No pgvector (confirmed absent in schema) | ✅ Correctly absent |
| REFUSAL_TAU=0.60 shown in Scene 6 | ✅ Matches packages/core/src/tutor.ts |
| llm.ts as sole Gemini gateway (Scene 5) | ✅ Matches packages/core/src/llm.ts |
| BKT parameters correct (Scene 4) | ✅ p0=0.3, learn=0.15, slip=0.1 from bkt.ts |
| Route paths shown verbatim | ✅ All match actual route files |

---

## Visual checks

| Check | Result |
|-------|--------|
| Scene 2 UI — authentic app screenshot | ⚠️ Not captured — app was not running (no Docker, no API key in render env). Source-derived mockup used instead. Documented as limitation. |
| NarrationCaption text matches approved script | ✅ All 8 scenes match NARRATION_SCRIPT.md |
| Color palette consistent (cyan/violet/amber/emerald) | ✅ Verified in constants.ts |
| Scene transitions (15-frame fade) | ✅ All 7 transitions present in OmniTutorFilm.tsx |

---

## Git checks

| Check | Result |
|-------|--------|
| No git push performed | ✅ Confirmed |
| No git commit performed (this phase) | ✅ Confirmed |
| .env in .gitignore | ✅ Verified |
| API key not in any source file | ✅ Confirmed |

---

## Known limitations

1. **Scene 2 UI mockup:** The application could not be started in this environment (requires Docker for PostgreSQL and a configured Gemini API key). Scene 2 shows a source-derived mockup of the tutor interface, not a live screenshot. To replace: run `npm run dev` after `npm run db:up && npm run db:deploy && npm run db:seed`, capture a screenshot, place at `public/ui/scene2.png`, and update Scene2Interface.tsx.

2. **Background music:** Procedurally generated (three-oscillator sine wave ambient pad). The Pixabay API key did not support the music endpoint. The generated audio is a genuine ambient bed at 0.18 volume, not silence. Replace by placing any 180s+ MP3 at `public/music/background.mp3` and setting `useMp3={true}` in BackgroundMusic.tsx.

3. **Audio loudness not measured:** No ffprobe or loudness metering tool was available to measure integrated LUFS or true peak. The narration volume is at Remotion default (1.0) and music at 0.18. For broadcast delivery, run `ffmpeg -i out/omnitutor-architecture-film.mp4 -af loudnorm=I=-23:TP=-1` to normalize.

4. **Captions not time-synced to audio:** NarrationCaption shows static text for the duration of each scene. True word-level captions would require audio transcription (e.g. Whisper). The displayed text matches the spoken content exactly.

---

## Regeneration commands

```bash
# Regenerate all narration (from video/ directory)
node scripts/generate-narration.mjs

# Regenerate single scene
node scripts/generate-narration.mjs --scene=3

# Regenerate music and SFX
node scripts/generate-music.mjs
node scripts/generate-sfx.mjs

# Final render
npx remotion render OmniTutorFilm out/omnitutor-architecture-film.mp4 --codec=h264 --crf=22 --audio-codec=aac
```
