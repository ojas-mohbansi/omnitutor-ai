-- One account, many notebooks (owned courses)
DROP INDEX "Course_ownerId_key";
CREATE INDEX "Course_ownerId_idx" ON "Course"("ownerId");

-- AlterTable
ALTER TABLE "Learner" ADD COLUMN "activeCourseId" TEXT;
