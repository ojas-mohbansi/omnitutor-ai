import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'public', 'sfx');

fs.mkdirSync(outputDir, { recursive: true });

/**
 * Write a mono WAV file from an array/Float32Array of samples.
 * @param {string} filePath
 * @param {number[]} samples  - values in [-1, 1]
 * @param {number} sampleRate
 */
function writeMonoWav(filePath, samples, sampleRate) {
  const numSamples = samples.length;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = numSamples * channels * bytesPerSample;
  const chunkSize = 4 + 8 + 16 + 8 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);                          // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // byteRate
  header.writeUInt16LE(channels * bytesPerSample, 32);              // blockAlign
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const dataBuf = Buffer.alloc(dataSize);
  for (let i = 0; i < numSamples; i++) {
    let s = samples[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    dataBuf.writeInt16LE(Math.round(s * 32767), i * bytesPerSample);
  }

  const fd = fs.openSync(filePath, 'w');
  fs.writeSync(fd, header);
  fs.writeSync(fd, dataBuf);
  fs.closeSync(fd);

  const stats = fs.statSync(filePath);
  console.log(`Written ${filePath} (${stats.size} bytes)`);
}

// ---- transition.wav ----
// 0.5 seconds, 22050 samples, mono, 44100 Hz
// Soft frequency sweep 800Hz -> 300Hz, half-sine envelope
{
  const sampleRate = 44100;
  const durationSec = 0.5;
  const numSamples = Math.round(sampleRate * durationSec); // 22050
  const samples = new Array(numSamples);
  let phase = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 800 * Math.pow(300 / 800, t / 0.5); // exponential sweep 800->300
    const env = Math.sin(Math.PI * t / 0.5);          // half-sine envelope
    samples[i] = 0.3 * env * Math.sin(2 * Math.PI * freq * t);
  }

  writeMonoWav(path.join(outputDir, 'transition.wav'), samples, sampleRate);
}

// ---- data-flow.wav ----
// 0.15 seconds, 6615 samples, mono, 44100 Hz
// Soft click/tick: exponential decay envelope, 1200Hz
{
  const sampleRate = 44100;
  const durationSec = 0.15;
  const numSamples = Math.round(sampleRate * durationSec); // 6615
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 40);                        // sharp exponential decay
    samples[i] = 0.4 * env * Math.sin(2 * Math.PI * 1200 * t);
  }

  writeMonoWav(path.join(outputDir, 'data-flow.wav'), samples, sampleRate);
}

console.log('SFX generation complete.');
