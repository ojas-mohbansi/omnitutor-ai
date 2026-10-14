import { prisma } from "@sc/db";
import { notReady } from "./errors";

/** Single-course app: requests without courseId use the seeded course. */
export const DEFAULT_COURSE_ID = "demo-course";

/** Returns the course id, or 409 not_ready if it doesn't exist (e.g. the DB wasn't seeded). */
export async function requireCourse(courseId: string = DEFAULT_COURSE_ID): Promise<string> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw notReady(`Course "${courseId}" not found. Run \`npm run db:seed\`.`);
  return course.id;
}
