-- CreateTable
CREATE TABLE "Prestataire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "raisonSociale" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "numeroIdent" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestataire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Devis" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "demandeId" TEXT NOT NULL,
    "prestataireId" TEXT NOT NULL,
    "dateDevis" TIMESTAMP(3),
    "dateValidite" TIMESTAMP(3),
    "montantHT" DECIMAL(15,2),
    "montantTVA" DECIMAL(15,2),
    "montantTTC" DECIMAL(15,2),
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "description" TEXT,
    "observations" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Devis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "nomOriginal" TEXT NOT NULL,
    "nomStockage" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "categorie" TEXT,
    "demandeId" TEXT NOT NULL,
    "devisId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prestataire_nom_idx" ON "Prestataire"("nom");
CREATE INDEX "Prestataire_createdById_idx" ON "Prestataire"("createdById");

CREATE UNIQUE INDEX "Devis_id_demandeId_key" ON "Devis"("id", "demandeId");
CREATE INDEX "Devis_demandeId_idx" ON "Devis"("demandeId");
CREATE INDEX "Devis_prestataireId_idx" ON "Devis"("prestataireId");

CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE INDEX "Document_demandeId_idx" ON "Document"("demandeId");
CREATE INDEX "Document_devisId_idx" ON "Document"("devisId");

-- AddForeignKey
ALTER TABLE "Prestataire" ADD CONSTRAINT "Prestataire_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "Prestataire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_devis_demande_fkey" FOREIGN KEY ("devisId", "demandeId") REFERENCES "Devis"("id", "demandeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom constraints
ALTER TABLE "Devis" ADD CONSTRAINT devis_montants_non_neg CHECK (
  ("montantHT" IS NULL OR "montantHT" >= 0) AND
  ("montantTVA" IS NULL OR "montantTVA" >= 0) AND
  ("montantTTC" IS NULL OR "montantTTC" >= 0)
);
ALTER TABLE "Devis" ADD CONSTRAINT devis_coherence CHECK (
  (
    "montantHT" IS NULL OR
    "montantTVA" IS NULL OR
    "montantTTC" IS NULL OR
    "montantTTC" = "montantHT" + "montantTVA"
  )
  AND
  (
    "montantHT" IS NULL OR
    "montantTTC" IS NULL OR
    "montantTTC" >= "montantHT"
  )
);
ALTER TABLE "Document" ADD CONSTRAINT document_taille_positive CHECK ("taille" > 0);
