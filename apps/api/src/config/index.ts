import "../load-env";
import { envSchema, type Env } from "@dpmg/shared/zod";

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  if (!result.data.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL absent de l'environnement : les requêtes base de données échoueront.");
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = getEnv();