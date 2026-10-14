// Test inputs generated in code, so the smoke test needs no checked-in binaries.
import { crc32, deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** One-page PDF: FCFS text + a Gantt chart drawn as shapes (a "figure"). */
export async function makeSchedulingPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  page.drawText("5.3 First-Come, First-Served (FCFS) Scheduling", { x: 50, y: 780, size: 16, font: bold });
  const lines = [
    "With FCFS, the process that requests the CPU first is allocated the CPU first.",
    "Consider three processes arriving at time 0 in the order P1, P2, P3 with",
    "CPU burst times of 24 ms, 3 ms and 3 ms respectively.",
    "The waiting time is 0 ms for P1, 24 ms for P2 and 27 ms for P3.",
    "Figure 5.1 shows the resulting Gantt chart.",
  ];
  lines.forEach((t, i) => page.drawText(t, { x: 50, y: 740 - i * 20, size: 11, font }));

  // Gantt chart: P1 [0,24) P2 [24,27) P3 [27,30), 15 px per ms.
  const x0 = 50, y = 560, h = 40, scale = 15;
  const bars: [string, number, number][] = [["P1", 0, 24], ["P2", 24, 27], ["P3", 27, 30]];
  for (const [label, s, e] of bars) {
    page.drawRectangle({ x: x0 + s * scale, y, width: (e - s) * scale, height: h, borderColor: rgb(0, 0, 0), borderWidth: 1, color: rgb(0.85, 0.9, 1) });
    page.drawText(label, { x: x0 + ((s + e) / 2) * scale - 8, y: y + 15, size: 12, font: bold });
  }
  for (const t of [0, 24, 27, 30]) page.drawText(String(t), { x: x0 + t * scale - 4, y: y - 15, size: 10, font });
  page.drawText("Figure 5.1  Gantt chart for FCFS scheduling", { x: 50, y: y - 40, size: 10, font });

  return doc.save();
}

/** Minimal PNG encoder: white canvas with solid horizontal bars. */
export function makeBarsPng(colors: [number, number, number][], width = 300, height = 160): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height, 255);
  const barH = Math.floor(height / (colors.length * 2));
  for (let row = 0; row < height; row++) {
    raw[row * (width * 3 + 1)] = 0; // filter: none
    const slot = Math.floor(row / barH);
    if (slot % 2 === 1 && (slot - 1) / 2 < colors.length) {
      const [r, g, b] = colors[(slot - 1) / 2];
      for (let x = 20; x < width - 20; x++) {
        const o = row * (width * 3 + 1) + 1 + x * 3;
        raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
      }
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
