// Module 17: learner profile (onboarding) → tutor tone, structure and temperature. Real DB, no Gemini. Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { prisma } from "@sc/db";
import type { LearnerProfile } from "@sc/schemas";
import { signup } from "../src/auth";
import { AppError } from "../src/errors";
import { DEFAULT_TEMPERATURE, getProfile, profileInstructions, profileView, saveProfile, temperatureFor } from "../src/profile";
import { tutorPrompt } from "../src/tutor";

const NAME = `__test__profile ${Date.now()}`;
const code = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const funny: LearnerProfile = { tone: "funny", style: "examples_first", level: "new", goal: "exam" };

after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: "__test__profile" } } });
});

describe("profile → tutor behaviour (pure)", () => {
  it("tone sets the temperature: playful high, precise low; no profile = the original 0.2", () => {
    assert.ok(temperatureFor(funny) > temperatureFor({ ...funny, tone: "friendly" }));
    assert.ok(temperatureFor({ ...funny, tone: "friendly" }) > temperatureFor({ ...funny, tone: "serious" }));
    assert.equal(temperatureFor(null), DEFAULT_TEMPERATURE);
    for (const t of ["funny", "friendly", "serious", "concise"] as const) {
      const v = temperatureFor({ ...funny, tone: t });
      assert.ok(v >= 0 && v <= 1, t);
    }
  });
  it("every answer changes the instructions; no profile adds nothing", () => {
    assert.equal(profileInstructions(null), "");
    const base = profileInstructions(funny);
    assert.match(base, /joke|playful/i);
    for (const [k, v] of [["tone", "serious"], ["style", "big_picture"], ["level", "confident"], ["goal", "revise"]] as const) {
      assert.notEqual(profileInstructions({ ...funny, [k]: v }), base, `${k}=${v}`);
    }
    assert.match(base, /never the facts or the citation rules/);
  });
  it("the tutor prompt asks it to teach, while material stays cited", () => {
    const p = tutorPrompt("Any course");
    assert.match(p, /TEACH the student/);
    assert.match(p, /Every fact in it must come from the excerpts it cites/);
  });
});

describe("profile storage (DB)", () => {
  it("save → read back; 401 without a session; nothing before onboarding", async () => {
    const a = await signup({ name: `${NAME} a`, password: "password-1" });
    assert.deepEqual(await profileView(a.id), { profile: null });
    assert.deepEqual(await saveProfile(a.id, funny), { profile: funny });
    assert.deepEqual(await getProfile(a.id), funny);
    await assert.rejects(profileView(null), (e) => code(e) === "unauthorized");
    await assert.rejects(saveProfile(null, funny), (e) => code(e) === "unauthorized");
    await prisma.learner.update({ where: { id: a.id }, data: { profile: { tone: "sarcastic" } } });
    assert.equal(await getProfile(a.id), null, "stored data that no longer matches the schema is ignored");
  });
});
