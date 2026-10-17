// Module 16: accounts, sessions and authorization, against the real DB. Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { prisma } from "@sc/db";
import {
  authorizeAssessment, authorizeLearner, authorizeSource, courseFor, hashPassword, login, readSession, sessionLearner, signSession, signup, verifyPassword,
} from "../src/auth";
import { AppError } from "../src/errors";
import { listLearners } from "../src/learners";

const SECRET = "x".repeat(40);
const NAME = `__test__auth ${Date.now()}`;
const code = (e: unknown) => (e instanceof AppError ? e.code : String(e));

after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: "__test__auth" } } });
});

describe("auth: pure parts", () => {
  it("hashes with a random salt and verifies only the right password", async () => {
    const [a, b] = [await hashPassword("correct horse"), await hashPassword("correct horse")];
    assert.notEqual(a, b);
    assert.ok(await verifyPassword("correct horse", a));
    assert.ok(!(await verifyPassword("correct horsE", a)));
    assert.ok(!(await verifyPassword("x", "garbage")));
  });

  it("session tokens: valid until expiry, reject tampering and other secrets", () => {
    const t = signSession("learner1", SECRET, 1_000_000, 60);
    assert.equal(readSession(t, SECRET, 1_000_000), "learner1");
    assert.equal(readSession(t, SECRET, 1_000_000 + 61_000), null); // expired
    assert.equal(readSession(t, "y".repeat(40), 1_000_000), null); // other secret
    assert.equal(readSession(t.replace("learner1", "learner2"), SECRET, 1_000_000), null); // forged id
    for (const bad of [undefined, null, "", "a.b", "a.b.c.d"]) assert.equal(readSession(bad, SECRET), null);
  });
});

describe("auth: accounts against the DB", () => {
  it("signup → login; duplicate names (any case) and wrong passwords are refused", async () => {
    const a = await signup({ name: NAME, password: "password-1" });
    assert.equal((await login({ name: NAME.toUpperCase(), password: "password-1" })).id, a.id);
    await assert.rejects(signup({ name: ` ${NAME.toLowerCase()} `, password: "password-2" }), (e) => code(e) === "bad_request");
    await assert.rejects(login({ name: NAME, password: "password-2" }), (e) => code(e) === "unauthorized");
    await assert.rejects(login({ name: `${NAME} nobody`, password: "password-1" }), (e) => code(e) === "unauthorized");
    assert.deepEqual(await sessionLearner(a.id), a);
    assert.equal(await sessionLearner(null), null);
    assert.ok(!(await listLearners()).some((l) => l.id === a.id), "accounts are never listed");
  });

  it("private data needs that account's session; open profiles stay open", async () => {
    const owner = await signup({ name: `${NAME} owner`, password: "password-1" });
    const other = await signup({ name: `${NAME} other`, password: "password-1" });
    const open = await prisma.learner.create({ data: { name: `${NAME} open` } });
    await authorizeLearner(owner.id, owner.id);
    await assert.rejects(authorizeLearner(owner.id, null), (e) => code(e) === "unauthorized");
    await assert.rejects(authorizeLearner(owner.id, other.id), (e) => code(e) === "unauthorized");
    await authorizeLearner(open.id, null);
    await assert.rejects(authorizeLearner("no-such-learner", owner.id), (e) => code(e) === "not_found");

    const course = await prisma.course.findFirstOrThrow();
    const quiz = await prisma.assessment.create({ data: { learnerId: owner.id, courseId: course.id, kind: "QUIZ", scopeTopicIds: [] } });
    try {
      await authorizeAssessment(quiz.id, owner.id);
      await assert.rejects(authorizeAssessment(quiz.id, other.id), (e) => code(e) === "unauthorized");
      await authorizeAssessment("no-such-quiz", null); // the service reports its own 404
    } finally {
      await prisma.assessment.delete({ where: { id: quiz.id } });
    }
  });
});

describe("course privacy: each account has its own course", () => {
  it("signed in → own course (created once); another account's course or source → 401; no session → shared demo course", async () => {
    const a = await signup({ name: `${NAME} privA`, password: "password-1" });
    const b = await signup({ name: `${NAME} privB`, password: "password-1" });
    const [ca, ca2, cb] = await Promise.all([courseFor(a.id), courseFor(a.id), courseFor(b.id)]);
    assert.equal(ca, ca2, "one course per account, even for concurrent first requests");
    assert.notEqual(ca, cb);
    assert.equal(await courseFor(null), "demo-course");
    await assert.rejects(courseFor(b.id, ca), (e) => code(e) === "unauthorized");
    await assert.rejects(courseFor(null, ca), (e) => code(e) === "unauthorized");
    await assert.rejects(courseFor(a.id, "demo-course"), (e) => code(e) === "unauthorized");
    assert.equal(await courseFor(a.id, ca), ca);

    const src = await prisma.source.create({ data: { courseId: ca, type: "PDF", filename: `${NAME}.pdf`, mimeType: "application/pdf", sizeBytes: 1, path: "data/uploads/none.pdf", status: "PENDING" } });
    await authorizeSource(src.id, a.id);
    await assert.rejects(authorizeSource(src.id, b.id), (e) => code(e) === "unauthorized");
    await assert.rejects(authorizeSource(src.id, null), (e) => code(e) === "unauthorized");
    await authorizeSource("no-such-source", b.id); // the service reports its own 404
    // Deleting the account deletes its course and everything in it.
    await prisma.learner.delete({ where: { id: a.id } });
    assert.equal(await prisma.course.count({ where: { id: ca } }), 0);
    assert.equal(await prisma.source.count({ where: { id: src.id } }), 0);
  });
});
