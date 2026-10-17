import { z } from "zod";
import { Count, Id, IsoDate } from "./common";

/**
 * Notebooks (Module 18): an account's private courses. Exactly one is active; every course-scoped
 * route (sources, topics, tutor, quiz, mastery) works in the active notebook. The name is given to
 * the prompts as the course's context, so name it after the subject.
 */
export const NotebookView = z.object({
  id: Id,
  name: z.string().min(1),
  createdAt: IsoDate,
  sourceCount: Count,
  active: z.boolean(),
});
export type NotebookView = z.infer<typeof NotebookView>;

/** GET /api/notebooks (and every notebook write's reply): newest first, with the active one marked. */
export const NotebookList = z.object({ notebooks: z.array(NotebookView) });
export type NotebookList = z.infer<typeof NotebookList>;

/** POST /api/notebooks: creates a notebook and makes it active. */
export const CreateNotebookRequest = z.object({ name: z.string().trim().min(1).max(80) });
export type CreateNotebookRequest = z.infer<typeof CreateNotebookRequest>;

/** POST /api/notebooks/active: switches the active notebook (must be one of yours). */
export const SelectNotebookRequest = z.object({ notebookId: Id });
export type SelectNotebookRequest = z.infer<typeof SelectNotebookRequest>;
