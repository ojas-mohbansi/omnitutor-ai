-- AlterTable
ALTER TABLE "Course" ADD COLUMN "ownerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Course_ownerId_key" ON "Course"("ownerId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
