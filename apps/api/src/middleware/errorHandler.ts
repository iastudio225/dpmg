import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "@dpmg/shared";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sanitizeForLog(message: string): string {
  return message
    .replace(/(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+/gi, "$1://[REDACTED]")
    .replace(/((?:password|pwd|secret)\s*[=:]\s*)[^\s&'"]+/gi, "$1[REDACTED]");
}

export function logServerError(context: string, err: unknown): void {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    console.error(`❌ ${context}:`, {
      name: err.name,
      code,
      message: sanitizeForLog(err.message),
      stack: err.stack ? sanitizeForLog(err.stack) : undefined,
    });
  } else {
    console.error(`❌ ${context}:`, sanitizeForLog(String(err)));
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    const details = err.flatten().fieldErrors;
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Données invalides",
      details,
    } satisfies ApiError);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details,
    } satisfies ApiError);
  }

  logServerError("Unhandled error", err);
  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Erreur interne du serveur",
  } satisfies ApiError);
}

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({
    code: "NOT_FOUND",
    message: "Ressource non trouvée",
  } satisfies ApiError);
}