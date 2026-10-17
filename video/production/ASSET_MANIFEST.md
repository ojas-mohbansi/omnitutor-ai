# OmniTutor Film — Asset Manifest & Licensing

## Fonts

| Font | Source | License | Usage |
|------|--------|---------|-------|
| Inter | Google Fonts (@remotion/google-fonts/Inter) | SIL Open Font License 1.1 | All text in video |

## NPM Packages

| Package | Purpose | License |
|---------|---------|--------|
| remotion | Core video framework | Remotion License (free for open source) |
| @remotion/transitions | Scene fade transitions | Remotion License |
| @remotion/google-fonts | Inter font loading | Remotion License |
| @remotion/effects | Visual effects (future use) | Remotion License |
| @remotion/shapes | SVG shapes (future use) | Remotion License |
| @remotion/media | Video/audio components (future use) | Remotion License |

## Color Palette

| Name | Hex | Semantic Meaning |
|------|-----|------------------|
| Midnight Navy | #0a0f1e | Background / environment |
| Electric Cyan | #00d4ff | Request flow, data movement |
| Deep Violet | #7c3aed | AI / Gemini processing |
| Warm White | #f8f8f2 | Typography, labels |
| Amber | #f59e0b | Decisions, guards, boundaries |
| Emerald | #10b981 | Verified / success states |

## Audio Assets

### Narration (generated)

| File | Source | Voice ID | Model | License |
|------|--------|----------|-------|---------|
| narration/scene1.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO (user-created) | eleven_turbo_v2_5 | Generated — user owns output |
| narration/scene2.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |
| narration/scene3.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |
| narration/scene4.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |
| narration/scene5.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |
| narration/scene6.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |
| narration/scene7.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |
| narration/scene8.mp3 | ElevenLabs TTS | wjH9GfMgLMFTMbdW5HuO | eleven_turbo_v2_5 | Generated |

**Note:** API key not stored in any source file. Stored only in `video/.env` (gitignored).

### Background Music

| File | Source | License | Notes |
|------|--------|---------|-------|
| music/background.wav | Procedurally generated (scripts/generate-music.mjs) | Original — no third-party rights | 180s stereo ambient pad, 3-oscillator sine blend (40Hz + 220Hz + 440Hz), 16-bit PCM 44100Hz |

### Sound Effects

| File | Source | License | Notes |
|------|--------|---------|-------|
| sfx/transition.wav | Procedurally generated (scripts/generate-sfx.mjs) | Original | 0.5s exponential sweep 800→300Hz, mono |
| sfx/data-flow.wav | Procedurally generated (scripts/generate-sfx.mjs) | Original | 0.15s 1200Hz click, mono |

**Audio delivery spec:** Narration at volume 1.0, background music at volume 0.18 (natural ducking). For broadcast normalization: `ffmpeg -i out/omnitutor-architecture-film.mp4 -af loudnorm=I=-23:TP=-1 out/omnitutor-normalized.mp4`

## Architecture Data

All architectural information is derived directly from the OmniTutor source code repository at https://github.com/Parth-Mankawade/Omnitutor. No third-party diagrams or assets were used.

## Remotion License Note

Remotion is free for companies with annual revenue under $1M USD and individuals. See https://www.remotion.dev/license for full terms.
