-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "qualityScore" DOUBLE PRECISION,
ADD COLUMN     "section" TEXT;
