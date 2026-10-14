// Streaming saves, size cap, path safety, Range parsing (no DB). Run: npm run test
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AppError } from "../src/errors";
import { parseByteRange } from "../src/sources";
import { repoRoot, resolveSourcePath, saveStream, uploadsDir } from "../src/storage";
import { chunked, zeros } from "../src/testing";

let dir: string;
before(async () => { dir = await mkdtemp(path.join(tmpdir(), "sc-storage-")); });
after(async () => { await rm(dir, { recursive: true, force: true }); });

describe("saveStream", () => {
  it("writes every chunk and returns the byte count", async () => {
    const bytes = new Uint8Array(300_000).map((_, i) => i % 251);
    const dest = path.join(dir, "ok.bin");
    assert.equal(await saveStream(chunked(bytes, 7_000), dest, 1_000_000), bytes.length);
    assert.deepEqual(new Uint8Array(await readFile(dest)), bytes);
  });
  it("aborts over the cap and leaves no file", async () => {
    const dest = path.join(dir, "big.bin");
    await assert.rejects(saveStream(zeros(5 * 1024 * 1024, 64 * 1024), dest, 1024 * 1024), (e: unknown) => e instanceof AppError && e.code === "bad_request" && /1 MB/.test(e.message));
    assert.equal(existsSync(dest), false);
  });
  it("never overwrites an existing file", async () => {
    const dest = path.join(dir, "exists.bin");
    await writeFile(dest, "keep");
    await assert.rejects(saveStream(chunked(new Uint8Array([1, 2, 3])), dest, 100));
  });
});

describe("paths", () => {
  it("repoRoot finds the directory containing turbo.json", () => {
    assert.equal(repoRoot(), path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
    assert.ok(existsSync(path.join(repoRoot(), "turbo.json")));
  });
  it("resolveSourcePath stays inside data/uploads", () => {
    assert.equal(resolveSourcePath("data/uploads/a.pdf"), path.join(uploadsDir(), "a.pdf"));
    for (const evil of ["data/uploads/../secret.txt", "data/uploads-evil/x.pdf", "../outside.pdf", "data/uploads"]) {
      assert.throws(() => resolveSourcePath(evil), AppError, evil);
    }
  });
});

describe("parseByteRange (size 1000)", () => {
  const cases: [string | null, ReturnType<typeof parseByteRange>][] = [
    [null, { kind: "full" }],
    ["bytes=0-99", { kind: "partial", start: 0, end: 99 }],
    ["bytes=900-", { kind: "partial", start: 900, end: 999 }],
    ["bytes=-100", { kind: "partial", start: 900, end: 999 }],
    ["bytes=-5000", { kind: "partial", start: 0, end: 999 }],
    ["bytes=990-5000", { kind: "partial", start: 990, end: 999 }],
    ["bytes=1000-", { kind: "unsatisfiable" }],
    ["bytes=-0", { kind: "unsatisfiable" }],
    ["bytes=50-10", { kind: "full" }], // invalid → ignored
    ["bytes=0-1,5-9", { kind: "full" }], // multi-range → ignored
    ["items=0-9", { kind: "full" }],
    ["bytes=abc", { kind: "full" }],
  ];
  for (const [header, expected] of cases) it(String(header), () => assert.deepEqual(parseByteRange(header, 1000), expected));
});
