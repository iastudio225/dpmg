import { Router, Request, Response, raw } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  demandeCreateSchema,
  demandeUpdateSchema,
  demandeListQuerySchema,
} from "@dpmg/shared/zod";
import type { ApiError } from "@dpmg/shared";
import {
  createDemande,
  listDemandes,
  getDemandeStats,
  findVisibleDemande,
  updateDemande,
  submitDemande,
  approveDemande,
  refuseDemande,
  returnDemande,
  avisDemande,
  decisionDpmgDemande,
  controlDfcDemande,
  startExecution,
  declareSatisfaction,
  confirmSatisfaction,
  closeDemande,
  returnDemandeForExecution,
  addObservation,
  listObservations,
} from "../services/demande.service";
import {
  demandeRefuseSchema,
  demandeReturnSchema,
  avisBodySchema,
  dpmgApproveSchema,
  dpmgRefuseSchema,
  dpmgReturnSchema,
  dfcControlSchema,
  declareSatisfactionSchema,
  returnForExecutionSchema,
  observationBodySchema,
} from "@dpmg/shared/zod";
import { getProofFile, maxProofSizeBytes } from "../services/proof-storage.service";

const router: Router = Router();

const MANAGER_ROLES = new Set([
  "HIERARCHICAL_MANAGER",
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_DELEGATE",
  "DPMG_MANAGER",
  "DPMG_DELEGATE",
]);

function managerScopesFromRequest(req: Request): string[] {
  const scopes = new Set<string>();
  for (const role of req.userRoles ?? []) {
    if (MANAGER_ROLES.has(role.role) && role.scope && role.scope !== "*") {
      scopes.add(role.scope);
    }
  }
  return [...scopes];
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = demandeCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de demande invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const demande = await createDemande(req.user!.id, parsed.data);
    return res.status(201).json(demande);
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = demandeListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Filtres invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const demandes = await listDemandes(req.user!.id, managerScopesFromRequest(req), parsed.data);
    return res.json(demandes);
  })
);

router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await getDemandeStats(req.user!.id, managerScopesFromRequest(req));
    return res.json(stats);
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demande = await findVisibleDemande(
      req.params["id"]!,
      req.user!.id,
      managerScopesFromRequest(req)
    );

    if (!demande) {
      return res.status(404).json({
        code: "NOT_FOUND",
        message: "Demande non trouvée",
      } satisfies ApiError);
    }

    return res.json(demande);
  })
);

router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = demandeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de modification invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }

    const demande = await updateDemande(req.params["id"]!, req.user!.id, parsed.data);
    return res.json(demande);
  })
);

router.patch(
  "/:id/submit",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demande = await submitDemande(req.params["id"]!, req.user!.id);
    return res.json(demande);
  })
);

router.post(
  "/:id/approve",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demande = await approveDemande(req.params["id"]!, req.user!.id);
    return res.json(demande);
  })
);

router.post(
  "/:id/refuse",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = demandeRefuseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de refus invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await refuseDemande(req.params["id"]!, req.user!.id, parsed.data.motif);
    return res.json(demande);
  })
);

router.post(
  "/:id/return",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = demandeReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de retour invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await returnDemande(
      req.params["id"]!,
      req.user!.id,
      parsed.data.motif,
      parsed.data.commentaire
    );
    return res.json(demande);
  })
);

router.post(
  "/:id/avis",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = avisBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données d'avis invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await avisDemande(
      req.params["id"]!,
      req.user!.id,
      parsed.data.motif,
      parsed.data.commentaire
    );
    return res.json(demande);
  })
);

// ---------------------------------------------------------------------------
// Décision DPMG — circuit distinct de la validation hiérarchique.
// Les routes sont préfixées "dpmg" pour ne jamais être confondues avec
// :id/approve, :id/refuse et :id/return, qui relèvent de la hiérarchie.
// ---------------------------------------------------------------------------

router.post(
  "/:id/dpmg/approve",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = dpmgApproveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de décision invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await decisionDpmgDemande(
      req.params["id"]!,
      req.user!.id,
      "APPROBATION",
      null,
      parsed.data.commentaire
    );
    return res.json(demande);
  })
);

router.post(
  "/:id/dpmg/refuse",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = dpmgRefuseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de décision invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await decisionDpmgDemande(
      req.params["id"]!,
      req.user!.id,
      "REFUS",
      parsed.data.motif,
      parsed.data.commentaire
    );
    return res.json(demande);
  })
);

router.post(
  "/:id/dpmg/return",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = dpmgReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de décision invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await decisionDpmgDemande(
      req.params["id"]!,
      req.user!.id,
      "RETOUR",
      parsed.data.motif,
      parsed.data.commentaire
    );
    return res.json(demande);
  })
);

// ---------------------------------------------------------------------------
// Contrôle financier DFC — circuit distinct de la décision DPMG.
// ---------------------------------------------------------------------------
router.post(
  "/:id/dfc/control",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = dfcControlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de contrôle financier invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const consolidationId =
      typeof req.query["consolidationId"] === "string" ? req.query["consolidationId"] : null;
    const demande = await controlDfcDemande(
      req.params["id"]!,
      req.user!.id,
      parsed.data.result,
      parsed.data.motif,
      consolidationId
    );
    return res.json(demande);
  })
);

// ---------------------------------------------------------------------------
// Exécution et clôture (lot 9.7)
// ---------------------------------------------------------------------------
router.post(
  "/:id/execution/start",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demande = await startExecution(req.params["id"]!, req.user!.id);
    return res.json(demande);
  })
);

router.post(
  "/:id/satisfaction",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = declareSatisfactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de satisfaction invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await declareSatisfaction(
      req.params["id"]!,
      req.user!.id,
      parsed.data.proofUrl,
      parsed.data.observations
    );
    return res.json(demande);
  })
);

/**
 * Déclaration de satisfaction avec téléversement direct du justificatif.
 *
 * Le corps de la requête est le fichier brut (Content-Type du fichier).
 * Le nom d'origine est transmis via l'en-tête `X-File-Name` (URL-encodé) et les
 * observations via le paramètre de requête `observations`.
 */
router.post(
  "/:id/satisfaction/file",
  requireAuth,
  raw({ type: () => true, limit: maxProofSizeBytes() + 1024 * 1024 }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Le justificatif est requis",
        details: { proofFile: ["Aucun fichier reçu"] },
      } satisfies ApiError);
    }

    const rawName = req.header("x-file-name") ?? "justificatif";
    let originalName = rawName;
    try {
      originalName = decodeURIComponent(rawName);
    } catch {
      /* en-tête non encodé : on conserve la valeur brute */
    }

    const observations =
      typeof req.query["observations"] === "string" ? req.query["observations"] : undefined;

    const demande = await declareSatisfaction(
      req.params["id"]!,
      req.user!.id,
      null,
      observations,
      {
        buffer: req.body,
        originalName,
        mimeType: req.header("x-file-type") ?? req.header("content-type") ?? null,
      }
    );
    return res.status(201).json(demande);
  })
);

/**
 * Téléchargement du justificatif stocké côté API.
 * Vérifie la visibilité de la demande avant de servir le fichier.
 */
router.get(
  "/:id/justificatif",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const visible = await findVisibleDemande(
      req.params["id"]!,
      req.user!.id,
      managerScopesFromRequest(req)
    );
    if (!visible) {
      return res.status(404).json({
        code: "NOT_FOUND",
        message: "Demande non trouvée",
      } satisfies ApiError);
    }

    const file = await getProofFile(req.params["id"]!);
    if (!file) {
      return res.status(404).json({
        code: "NOT_FOUND",
        message: "Aucun justificatif n'est associé à cette demande",
      } satisfies ApiError);
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(file.path);
  })
);

router.post(
  "/:id/satisfaction/confirm",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demande = await confirmSatisfaction(req.params["id"]!, req.user!.id);
    return res.json(demande);
  })
);

router.post(
  "/:id/close",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const demande = await closeDemande(req.params["id"]!, req.user!.id);
    return res.json(demande);
  })
);

router.post(
  "/:id/execution/return",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = returnForExecutionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données de retour invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const demande = await returnDemandeForExecution(
      req.params["id"]!,
      req.user!.id,
      parsed.data.motif
    );
    return res.json(demande);
  })
);

// ---------------------------------------------------------------------------
// Observations DG / CPMP (Lot W1) — consultation uniquement, pas de changement de statut.
// ---------------------------------------------------------------------------
router.get(
  "/:id/observations",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const observations = await listObservations(req.params["id"]!, req.user!.id);
    return res.json(observations);
  })
);

router.post(
  "/:id/observations",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = observationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Données d'observation invalides",
        details: parsed.error.flatten().fieldErrors,
      } satisfies ApiError);
    }
    const observation = await addObservation(req.params["id"]!, req.user!.id, parsed.data.commentaire);
    return res.status(201).json(observation);
  })
);

export default router;