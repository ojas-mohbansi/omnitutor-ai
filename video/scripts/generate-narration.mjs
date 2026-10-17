/**
 * generate-narration.mjs
 * Generates MP3 narration files for each scene via ElevenLabs TTS.
 * Node.js ESM — no external dependencies.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '.env');
const NARRATION_DIR = path.resolve(__dirname, '..', 'public', 'narration');

// ---------------------------------------------------------------------------
// .env parser — no dotenv dependency
// ---------------------------------------------------------------------------
function loadEnv(envPath) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const API_KEY = env['ELEVENLABS_API_KEY'];
const VOICE_ID = env['ELEVENLABS_VOICE_ID'];

if (!API_KEY || !VOICE_ID) {
  console.error('Error: ELEVENLABS_API_KEY and/or ELEVENLABS_VOICE_ID are missing from .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Scene definitions
// ---------------------------------------------------------------------------
const SCENES = [
  {
    scene: 1,
    durationSec: 12,
    text: 'Every question a student asks travels through a system most will never see. This is OmniTutor — a knowledge base built from your own course material, designed to teach, test, and track understanding.',
  },
  {
    scene: 2,
    durationSec: 18,
    text: 'A student types a question. Behind that text field, a Next.js application captures the request and validates it against a shared Zod contract. The entry point: POST /api/chat. One route. One purpose.',
  },
  {
    scene: 3,
    durationSec: 20,
    text: "The route handler is deliberately thin. It reads the request body, verifies the session cookie, and delegates entirely to @sc/core — the domain library that contains all intelligence. The session boundary is the system's trust boundary.",
  },
  {
    scene: 4,
    durationSec: 20,
    text: 'Inside @sc/core, the tutor function begins. The question becomes a 768-dimensional embedding via the Gemini embedding model. That vector is compared against thousands of course chunks stored in PostgreSQL — not in a vector database, but in plain floats, with cosine similarity computed directly in TypeScript. The top six chunks are retrieved.',
  },
  {
    scene: 5,
    durationSec: 28,
    text: "A single structured call reaches the Gemini model. It arrives with the student's retrieved excerpts, their personalized learning profile — tone, explanation style, mastery level — and the conversation history. The model returns labeled blocks: material claims with citation IDs, and outside knowledge clearly tagged. This is where the intelligence lives.",
  },
  {
    scene: 6,
    durationSec: 20,
    text: 'The server does not trust that response. Every citation is verified against the retrieved set. Any material block without a citation is relabeled. If the retrieval confidence falls below the calibrated threshold, the entire answer is refused. Grounding is enforced in code, not requested in a prompt.',
  },
  {
    scene: 7,
    durationSec: 20,
    text: 'The validated answer travels back to the browser. The student sees the response rendered block by block. A citation chip references a PDF page, a slide, a video timestamp. Click it — and the source opens at the exact location. The loop is complete.',
  },
  {
    scene: 8,
    durationSec: 12,
    text: 'Browser to API route to domain core to Gemini and back. PostgreSQL as the knowledge store. BKT as the learner model. A contract that validates at every boundary. OmniTutor: a complete learning system, grounded in your material.',
  },
];

// ---------------------------------------------------------------------------
// CLI: --scene=N
// ---------------------------------------------------------------------------
let sceneFilter = null;
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--scene=(\d+)$/);
  if (m) {
    sceneFilter = parseInt(m[1], 10);
    break;
  }
}

const scenesToProcess = sceneFilter
  ? SCENES.filter((s) => s.scene === sceneFilter)
  : SCENES;

if (sceneFilter && scenesToProcess.length === 0) {
  console.error(`Error: scene ${sceneFilter} not found (valid range: 1–8)`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ensure output directory exists
// ---------------------------------------------------------------------------
fs.mkdirSync(NARRATION_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// ElevenLabs TTS call — uses Node built-in https, NOT fetch
// ---------------------------------------------------------------------------
function callElevenLabs(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.85,
        style: 0.15,
        use_speaker_boost: true,
      },
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ status: res.statusCode, buffer });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main — sequential to avoid rate limits
// ---------------------------------------------------------------------------
const manifestScenes = [];

for (const scene of scenesToProcess) {
  const outPath = path.join(NARRATION_DIR, `scene${scene.scene}.mp3`);

  if (fs.existsSync(outPath)) {
    console.log(`Scene ${scene.scene}: already exists, skipping`);
    // Still record in manifest with existing file info
    const stat = fs.statSync(outPath);
    manifestScenes.push({
      scene: scene.scene,
      filename: `scene${scene.scene}.mp3`,
      generatedAt: stat.mtime.toISOString(),
    });
    continue;
  }

  const { status, buffer } = await callElevenLabs(scene.text);

  if (status !== 200) {
    console.error(`Scene ${scene.scene}: API error HTTP ${status}`);
    console.error('Response body:', buffer.toString('utf8'));
    process.exit(1);
  }

  fs.writeFileSync(outPath, buffer);
  console.log(`Scene ${scene.scene}: generated, ${buffer.length} bytes`);

  manifestScenes.push({
    scene: scene.scene,
    filename: `scene${scene.scene}.mp3`,
    generatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
const manifest = {
  generatedAt: new Date().toISOString(),
  modelId: 'eleven_turbo_v2_5',
  voiceId: VOICE_ID,
  scenes: manifestScenes,
};

fs.writeFileSync(
  path.join(NARRATION_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);
console.log('Manifest written.');
