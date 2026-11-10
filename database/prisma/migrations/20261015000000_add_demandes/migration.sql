-- CreateEnum
CREATE TYPE "DemandeStatus" AS ENUM ('BROUILLON', 'SOUMISE');

-- CreateEnum
CREATE TYPE "DemandeCategory" AS ENUM ('INFRASTRUCTURE', 'LOGISTIQUE', 'MAGASIN');

-- CreateTable
CREATE TABLE "Demande" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DemandeStatus" NOT NULL DEFAULT 'BROUILLON',
    "category" "DemandeCategory" NOT NULL,
    "authorId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "Demande_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Demande_reference_key" ON "Demande"("reference");

-- CreateIndex
CREATE INDEX "Demande_authorId_idx" ON "Demande"("authorId");

-- CreateIndex
CREATE INDEX "Demande_departmentId_idx" ON "Demande"("departmentId");

-- CreateIndex
CREATE INDEX "Demande_status_idx" ON "Demande"("status");

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

