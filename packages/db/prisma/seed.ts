// Idempotent seed: one demo course + one demo learner with fixed ids
// (handy in Postman: learnerId = "demo-learner").
import path from "node:path";
import { PrismaClient } from "@prisma/client";

process.loadEnvFile(path.join(__dirname, "../../../.env"));
const prisma = new PrismaClient();

async function main() {
  const course = await prisma.course.upsert({
    where: { id: "demo-course" },
    update: {},
    // The name is prompt context for ingestion and course build: it must describe the real material.
    create: { id: "demo-course", name: process.env.COURSE_NAME?.trim() || "My course" },
  });
  const learner = await prisma.learner.upsert({
    where: { id: "demo-learner" },
    update: {},
    create: { id: "demo-learner", name: "Demo Learner" },
  });
  console.log(`seeded course=${course.id} learner=${learner.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
