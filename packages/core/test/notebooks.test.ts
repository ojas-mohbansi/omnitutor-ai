// Module 18: notebooks (an account's private courses), against the real DB. No Gemini. Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { FIRST_NOTEBOOK_NAME, courseFor, signup } from "../src/auth";
import { AppError } from "../src/errors";
import { createNotebook, deleteNotebook, listNotebooks, selectNotebook } from "../src/notebooks";
import { chatHistory } from "../src/tutor";

const NAME = `__test__notebooks ${Date.now()}`;
const code = (e: unknown) => (e instanceof AppError ? e.code : String(e));

after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: "__test__notebooks" } } });
});

describe("notebooks", () => {
  it("first use creates one notebook; create makes the new one active; courseFor follows the active one", async () => {
    const a = await signup({ name: `${NAME} a`, password: "password-1" });
    const [l1, l2] = await Promise.all([listNotebooks(a.id), listNotebooks(a.id)]);
    assert.equal(l1.notebooks.length, 1, "concurrent first requests create one notebook");
    assert.equal(l2.notebooks[0].id, l1.notebooks[0].id);
    const first = l1.notebooks[0].id;
    assert.equal(l1.notebooks[0].name, FIRST_NOTEBOOK_NAME, "a clean first notebook, nothing inherited from the shared course");
    assert.equal(await courseFor(a.id), first);

    const after = await createNotebook(a.id, { name: "Computer Networks" });
    const cn = after.notebooks.find((n) => n.name === "Computer Networks")!;
    assert.equal(after.notebooks.length, 2);
    assert.ok(cn.active);
    assert.equal(after.notebooks.filter((n) => n.active).length, 1);
    assert.equal(await courseFor(a.id), cn.id);

    await selectNotebook(a.id, first);
    assert.equal(await courseFor(a.id), first);
  });

  it("each notebook keeps its own chat history; other accounts can't select, read or delete it", async () => {
    const a = await signup({ name: `${NAME} owner`, password: "password-1" });
    const b = await signup({ name: `${NAME} other`, password: "password-1" });
    const one = await courseFor(a.id);
    const two = (await createNotebook(a.id, { name: "Second" })).notebooks.find((n) => n.active)!.id;
    await prisma.chatMessage.createMany({ data: [
      { learnerId: a.id, courseId: one, role: "USER", content: "question in one" },
      { learnerId: a.id, courseId: two, role: "USER", content: "question in two" },
    ] });
    assert.deepEqual((await chatHistory(a.id, one)).map((m) => m.content), ["question in one"]);
    assert.deepEqual((await chatHistory(a.id, two)).map((m) => m.content), ["question in two"]);

    await assert.rejects(selectNotebook(b.id, one), (e) => code(e) === "unauthorized");
    await assert.rejects(deleteNotebook(b.id, one), (e) => code(e) === "unauthorized");
    await assert.rejects(courseFor(b.id, one), (e) => code(e) === "unauthorized");
    assert.ok(!(await listNotebooks(b.id)).notebooks.some((n) => n.id === one || n.id === two));
    await assert.rejects(listNotebooks(null), (e) => code(e) === "unauthorized");
    await assert.rejects(selectNotebook(a.id, "no-such-notebook"), (e) => code(e) === "not_found");
  });

  it("deleting the active notebook removes everything in it and activates another (a new one if none is left)", async () => {
    const a = await signup({ name: `${NAME} deleter`, password: "password-1" });
    const one = await courseFor(a.id);
    const two = (await createNotebook(a.id, { name: "To delete" })).notebooks.find((n) => n.active)!.id;
    await prisma.chatMessage.create({ data: { learnerId: a.id, courseId: two, role: "USER", content: "bye" } });
    const left = await deleteNotebook(a.id, two);
    assert.deepEqual(left.notebooks.map((n) => [n.id, n.active]), [[one, true]]);
    assert.equal(await prisma.chatMessage.count({ where: { courseId: two } }), 0);
    const fresh = await deleteNotebook(a.id, one);
    assert.equal(fresh.notebooks.length, 1);
    assert.ok(fresh.notebooks[0].active && fresh.notebooks[0].id !== one);
  });
});
