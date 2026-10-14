import { z } from "zod";
import { Learner } from "./course";

/**
 * POST /api/auth/signup and /api/auth/login. A signed-up learner is a private account: their chat,
 * quizzes and mastery need a session (HttpOnly cookie) for that account. Names are unique among
 * accounts, case-insensitively.
 */
export const Credentials = z.object({
  name: z.string().trim().min(1).max(60),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});
export type Credentials = z.infer<typeof Credentials>;

/** GET /api/auth/session (and the logout response): the signed-in account, or null. */
export const SessionView = z.object({ learner: Learner.nullable() });
export type SessionView = z.infer<typeof SessionView>;
