import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'public', 'music');
const outputWav = path.join(outputDir, 'background.wav');

// Step 1: Try Pixabay
function tryPixabay() {
  return new Promise((resolve) => {
    const apiUrl = 'https://pixabay.com/api/?key=46912737-84dd83fd0d68e67cbde5a03a8&q=cinematic+documentary+ambient&music=true&per_page=3';
    https.get(apiUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.hits && json.hits.length > 0 && json.hits[0].audio) {
            const track = json.hits[0];
            console.log(`Pixabay track found: "${track.tags}" - ${track.audio}`);
            resolve({ found: true, url: track.audio, title: track.tags });
          } else {
            console.log('Pixabay: no audio hits, falling back to procedural generation.');
            resolve({ found: false });
          }
        } catch (e) {
          console.log('Pixabay: JSON parse error, falling back.', e.message);
          resolve({ found: false });
        }
      });
      res.on('error', (e) => {
        console.log('Pixabay: request error, falling back.', e.message);
        resolve({ found: false });
      });
    }).on('error', (e) => {
      console.log('Pixabay: connection error, falling back.', e.message);
      resolve({ found: false });
    });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const destMp3 = dest.replace('.wav', '.mp3');
    const file = fs.createWriteStream(destMp3);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`Downloaded to ${destMp3}`);
          resolve(destMp3);
        });
      } else {
        file.close();
        fs.unlink(destMp3, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', (e) => {
      file.close();
      fs.unlink(destMp3, () => {});
      reject(e);
    });
  });
}

// Step 2: Procedural ambient WAV generation
function generateAmbientWav() {
  console.log('Generating procedural ambient WAV...');
  const sampleRate = 44100;
  const channels = 2;
  const bitsPerSample = 16;
  const duration = 180;
  const totalSamples = sampleRate * duration; // 7,938,000

  const dataSize = totalSamples * channels * (bitsPerSample / 8); // 4 bytes per stereo frame
  const chunkSize = 4 + 8 + 16 + 8 + dataSize;

  // Build 44-byte WAV header
  const header = Buffer.alloc(44);
  // RIFF chunk
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8, 'ascii');
  // fmt sub-chunk
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);              // subchunk1 size
  header.writeUInt16LE(1, 20);              // PCM = 1
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // byteRate = 176400
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);              // blockAlign = 4
  header.writeUInt16LE(bitsPerSample, 34);
  // data sub-chunk
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const fd = fs.openSync(outputWav, 'w');
  fs.writeSync(fd, header);

  const CHUNK = 44100; // write 1 second at a time
  const chunkBuf = Buffer.alloc(CHUNK * channels * (bitsPerSample / 8));

  for (let base = 0; base < totalSamples; base += CHUNK) {
    const end = Math.min(base + CHUNK, totalSamples);
    let bufOffset = 0;
    for (let i = base; i < end; i++) {
      const t = i / sampleRate;

      // Fade envelope
      let env;
      if (t < 5) {
        env = t / 5;
      } else if (t > 175) {
        env = Math.max(0, 1 - (t - 175) / 5);
      } else {
        env = 1.0;
      }

      let sample = env * (
        0.15 * Math.sin(2 * Math.PI * 55 * t) +
        0.08 * Math.sin(2 * Math.PI * 220 * t) +
        0.04 * Math.sin(2 * Math.PI * 440 * t) +
        0.03 * Math.sin(2 * Math.PI * 880 * t) *
               (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t))
      );

      // Clamp
      if (sample > 1) sample = 1;
      if (sample < -1) sample = -1;

      const int16 = Math.round(sample * 32767);

      // Left channel
      chunkBuf.writeInt16LE(int16, bufOffset);
      bufOffset += 2;
      // Right channel (identical)
      chunkBuf.writeInt16LE(int16, bufOffset);
      bufOffset += 2;
    }
    fs.writeSync(fd, chunkBuf, 0, bufOffset);
  }

  fs.closeSync(fd);
  const stats = fs.statSync(outputWav);
  console.log(`Generated ${outputWav} (${stats.size} bytes)`);
}

// Main
(async () => {
  fs.mkdirSync(outputDir, { recursive: true });

  const pixabay = await tryPixabay();
  if (pixabay.found) {
    try {
      await downloadFile(pixabay.url, outputWav);
      console.log('MUSIC_SOURCE: pixabay');
      process.exit(0);
    } catch (e) {
      console.log('Pixabay download failed:', e.message, '— falling back to procedural.');
    }
  }

  generateAmbientWav();
  console.log('MUSIC_SOURCE: procedural');
})();
