import { env } from "./config";
import app from "./app";
import { startNotificationWorker, stopNotificationWorker } from "./worker/notifications";

const server = app.listen(env.PORT, () => {
  console.log(`🚀 API démarrée sur http://localhost:${env.PORT}`);
  console.log(`📋 Environment: ${env.NODE_ENV}`);
  startNotificationWorker();
});

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM reçu, arrêt du serveur...");
  stopNotificationWorker();
  server.close(() => {
    console.log("✅ Serveur arrêté");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT reçu, arrêt du serveur...");
  stopNotificationWorker();
  server.close(() => {
    console.log("✅ Serveur arrêté");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
  server.close(() => {
    console.log("✅ Serveur arrêté après erreur fatale");
    process.exit(1);
  });
});