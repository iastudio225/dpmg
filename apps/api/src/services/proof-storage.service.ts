import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { AppError } from "../middleware/errorHandler";
import { env } from "../config";

/**
 * Stockage des justificatifs d'exécution.
 *
 * Les fichiers sont écrits sur le disque de l'API (pas de service externe) dans
 * `UPLOAD_DIR/demandes/<demandeId>/justificatif.<ext>` avec un fichier
 * `meta.json` contenant le nom d'origine et le type MIME. Un seul justificatif
 * est conservé par demande : un nouvel envoi remplace le précédent.
 */

export const PROOF_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".doc",
  ".docx",
] as const;

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export interface ProofFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType?: string | null;
}

export interface StoredProofFile {
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface ProofFileOnDisk {
  path: string;
  originalName: string;
  mimeType: string;
}

const DEMANDE_ID_PATTERN = /^[A-Za-z0-9_-]{5,64}$/;

function uploadRoot(): string {
  // Lecture paresseuse : permet de surcharger le répertoire en test.
  const configured = process.env["UPLOAD_DIR"] ?? env.UPLOAD_DIR;
  return configured && configured.trim() !== ""
    ? resolve(configured.trim())
    : resolve(process.cwd(), "uploads");
}

function demandeDirectory(demandeId: string): string {
  if (!DEMANDE_ID_PATTERN.test(demandeId)) {
    throw new AppError("VALIDATION_ERROR", "Identifiant de demande invalide", 400);
  }
  return join(uploadRoot(), "demandes", demandeId);
}

function sanitizeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "justificatif";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "justificatif";
}

function resolveExtension(originalName: string, mimeType?: string | null): string {
  const fromName = extname(originalName).toLowerCase();
  if (fromName && EXTENSION_TO_MIME[fromName]) return fromName;
  if (mimeType) {
    const normalized = mimeType.split(";")[0]!.trim().toLowerCase();
    const fromMime = MIME_TO_EXTENSION[normalized];
    if (fromMime) return fromMime;
  }
  throw new AppError(
    "VALIDATION_ERROR",
    "Format de justificatif non autorisé (PDF, PNG, JPEG, WEBP, DOC, DOCX)",
    400
  );
}

export function maxProofSizeBytes(): number {
  return env.PROOF_MAX_SIZE_MB * 1024 * 1024;
}

export async function saveProofFile(
  demandeId: string,
  file: ProofFileInput
): Promise<StoredProofFile> {
  const directory = demandeDirectory(demandeId);

  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Le justificatif est requis", 400);
  }
  const max = maxProofSizeBytes();
  if (file.buffer.length > max) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Le justificatif dépasse la taille maximale de ${env.PROOF_MAX_SIZE_MB} Mo`,
      400
    );
  }

  const originalName = sanitizeOriginalName(file.originalName);
  const extension = resolveExtension(originalName, file.mimeType);
  const mimeType = EXTENSION_TO_MIME[extension]!;

  await mkdir(directory, { recursive: true });
  // Un seul justificatif par demande : purge l'ancien contenu éventuel.
  for (const entry of await readdir(directory)) {
    await rm(join(directory, entry), { force: true, recursive: true });
  }

  const storedName = `justificatif${extension}`;
  await writeFile(join(directory, storedName), file.buffer);
  const meta = {
    originalName,
    mimeType,
    size: file.buffer.length,
    uploadedAt: new Date().toISOString(),
  };
  await writeFile(join(directory, "meta.json"), JSON.stringify(meta), "utf8");

  return {
    url: `/api/demandes/${demandeId}/justificatif`,
    originalName,
    mimeType,
    size: meta.size,
  };
}

export async function getProofFile(demandeId: string): Promise<ProofFileOnDisk | null> {
  const directory = demandeDirectory(demandeId);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return null;
  }

  const storedName = entries.find((entry) => entry.startsWith("justificatif."));
  if (!storedName) return null;

  const extension = extname(storedName).toLowerCase();
  const fallbackMime = EXTENSION_TO_MIME[extension] ?? "application/octet-stream";
  let originalName = storedName;
  let mimeType = fallbackMime;

  try {
    const rawMeta = await readFile(join(directory, "meta.json"), "utf8");
    const meta = JSON.parse(rawMeta) as { originalName?: unknown; mimeType?: unknown };
    if (typeof meta.originalName === "string" && meta.originalName.trim() !== "") {
      originalName = meta.originalName;
    }
    if (typeof meta.mimeType === "string" && meta.mimeType.startsWith("application/")) {
      mimeType = meta.mimeType;
    } else if (typeof meta.mimeType === "string" && meta.mimeType.startsWith("image/")) {
      mimeType = meta.mimeType;
    }
  } catch {
    // meta.json absent ou illisible : on retombe sur les valeurs déduites de l'extension.
  }

  return { path: join(directory, storedName), originalName, mimeType };
}

export async function deleteProofFile(demandeId: string): Promise<void> {
  const directory = demandeDirectory(demandeId);
  await rm(directory, { force: true, recursive: true });
}
