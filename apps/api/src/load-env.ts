import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { config as dotenvConfig } from "dotenv";

function findEnvFile(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwdCandidates = [".env", "../.env", "../../.env"].map((p) =>
    resolve(process.cwd(), p)
  );
  return cwdCandidates.find((p) => existsSync(p));
}

const envFile = findEnvFile();

if (envFile) {
  dotenvConfig({ path: envFile });
}
