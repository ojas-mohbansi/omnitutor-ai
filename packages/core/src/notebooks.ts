// Notebooks (Module 18): an account's private courses. Exactly one is active (Learner.activeCourseId);
// every course-scoped route resolves it through courseFor() → ownCourse(), so switching notebooks
// switches the sources, topics, tutor history, quizzes and mastery all at once.
import { rm } from "node:fs/promises";
import { prisma } from "@sc/db";
import type { CreateNotebookRequest, NotebookList } from "@sc/schemas";
import { ownCourse, unauthorized } from "./auth";
import { notFound, notReady } from "./errors";
import { resolveSourcePath } from "./storage";

function requireSession(sessionLearnerId: string | null): string {
  if (!sessionLearnerId) throw unauthorized("Sign in to use notebooks.");
  return sessionLearnerId;
}

async function ownedNotebook(learnerId: string, notebookId: string) {
  const course = await prisma.course.findUnique({ where: { id: notebookId }, select: { id: true, ownerId: true } });
  if (!course) throw notFound(`Notebook "${notebookId}" not found.`);
  if (course.ownerId !== learnerId) throw unauthorized("This notebook belongs to another account.");
  return course;
}

/** GET /api/notebooks: the account's notebooks, newest first (creates the first one if there is none). */
export async function listNotebooks(sessionLearnerId: string | null): Promise<NotebookList> {
  const learnerId = requireSession(sessionLearnerId);
  const activeId = await ownCourse(learnerId);
  const rows = await prisma.course.findMany({
    where: { ownerId: learnerId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: { id: true, name: true, createdAt: true, _count: { select: { sources: true } } },
  });
  return { notebooks: rows.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString(), sourceCount: c._count.sources, active: c.id === activeId })) };
}

/** POST /api/notebooks: a new, empty notebook, made active. */
export async function createNotebook(sessionLearnerId: string | null, input: CreateNotebookRequest): Promise<NotebookList> {
  const learnerId = requireSession(sessionLearnerId);
  await ownCourse(learnerId); // valid session (and the first notebook exists)
  const course = await prisma.course.create({ data: { name: input.name.trim(), ownerId: learnerId }, select: { id: true } });
  await prisma.learner.update({ where: { id: learnerId }, data: { activeCourseId: course.id } });
  return listNotebooks(learnerId);
}

/** POST /api/notebooks/active: switch to one of your notebooks. */
export async function selectNotebook(sessionLearnerId: string | null, notebookId: string): Promise<NotebookList> {
  const learnerId = requireSession(sessionLearnerId);
  await ownedNotebook(learnerId, notebookId);
  await prisma.learner.update({ where: { id: learnerId }, data: { activeCourseId: notebookId } });
  return listNotebooks(learnerId);
}

/**
 * DELETE /api/notebooks/[id]: deletes the notebook and everything in it (sources and their stored
 * files, chunks, topics, quizzes, chats, mastery). Refused while one of its sources is processing.
 * If it was active, the newest remaining notebook becomes active (a new one if none is left).
 */
export async function deleteNotebook(sessionLearnerId: string | null, notebookId: string): Promise<NotebookList> {
  const learnerId = requireSession(sessionLearnerId);
  await ownedNotebook(learnerId, notebookId);
  const sources = await prisma.source.findMany({ where: { courseId: notebookId }, select: { path: true, status: true } });
  if (sources.some((s) => s.status === "PROCESSING")) throw notReady("A file in this notebook is still being processed. Delete the notebook once it has finished.");
  await prisma.course.delete({ where: { id: notebookId } }); // cascades to everything inside it
  await Promise.all(sources.map((s) => rm(resolveSourcePath(s.path), { force: true }).catch(() => {})));
  await prisma.learner.updateMany({ where: { id: learnerId, activeCourseId: notebookId }, data: { activeCourseId: null } });
  return listNotebooks(learnerId);
}
