import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config";
import { createSessionMiddleware } from "./config/session";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import demandesRouter from "./routes/demandes";
import notificationsRouter from "./routes/notifications";
import usersRouter from "./routes/users";
import structuresRouter from "./routes/structures";
import departmentsRouter from "./routes/departments";
import consolidationsRouter from "./routes/consolidations";
import rapportsRouter from "./routes/rapports";
import prestatairesRouter from "./routes/prestataires";
import devisRouter from "./routes/devis";
import databaseAdminRouter from "./routes/database-admin";

const app: Express = express();

// Derrière le proxy Coolify/Nginx : utiliser l'IP réelle du client
// (X-Forwarded-For) au lieu de l'IP du proxy, sinon tous les utilisateurs
// partagent le même quota de rate limiting.
app.set("trust proxy", 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(createSessionMiddleware());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/demandes", demandesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/users", usersRouter);
app.use("/api/structures", structuresRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/consolidations", consolidationsRouter);
app.use("/api/rapports", rapportsRouter);
app.use("/api/prestataires", prestatairesRouter);
app.use("/api/devis", devisRouter);
app.use("/api/admin/database", databaseAdminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;