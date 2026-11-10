import "../load-env";
import { PrismaClient, NotificationType } from "@prisma/client";

const prisma = new PrismaClient();

const INTERVAL_MS = Number(process.env["NOTIFICATION_WORKER_INTERVAL_MS"] ?? 5000);
const BATCH_SIZE = Number(process.env["NOTIFICATION_WORKER_BATCH_SIZE"] ?? 10);
const RETRY_DELAY_MS = Number(process.env["NOTIFICATION_WORKER_RETRY_DELAY_MS"] ?? 30000);
const STUCK_TIMEOUT_MS = Number(process.env["NOTIFICATION_WORKER_STUCK_TIMEOUT_MS"] ?? 5 * 60 * 1000);

let running = true;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function recoverStuck() {
  const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS);
  await prisma.notificationOutbox.updateMany({
    where: { status: "PROCESSING", createdAt: { lt: cutoff } },
    data: { status: "PENDING", availableAt: new Date(), lastError: "recovered from stuck PROCESSING" },
  });
}

export async function reserveBatch(): Promise<any[]> {
  // Atomic reservation using FOR UPDATE SKIP LOCKED.
  const rows = await prisma.$transaction(async (tx) => {
    const selected = await tx.$queryRaw<any[]>`
      SELECT id FROM "NotificationOutbox"
      WHERE status = 'PENDING'::"NotificationOutboxStatus"
        AND "availableAt" <= now()
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = selected.map((r: any) => r.id);
    if (ids.length === 0) return [];
    await tx.notificationOutbox.updateMany({
      where: { id: { in: ids } },
      data: { status: "PROCESSING" },
    });
    return tx.notificationOutbox.findMany({ where: { id: { in: ids } } });
  }, { isolationLevel: "ReadCommitted" });
  return rows;
}

export async function processOne(row: any) {
  try {
    // Insert Notification (idempotent via unique (userId, eventKey)).
    await prisma.notification.create({
      data: {
        userId: row.recipientUserId,
        demandeId: row.demandeId,
        eventKey: row.eventKey,
        type: row.type,
        title: row.title,
        message: row.message,
        priority: row.priority,
        isRead: false,
      },
    }).catch((e: any) => {
      if (e.code !== "P2002") throw e;
      // already exists (idempotent) — continue to mark processed
    });
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempts = (row.attempts ?? 0) + 1;
    if (attempts >= 5) {
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: "FAILED", attempts, lastError: msg.slice(0, 500), processedAt: null },
      });
      return;
    }
    const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempts - 1), 5 * 60 * 1000);
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        attempts,
        availableAt: new Date(Date.now() + delay),
        lastError: msg.slice(0, 500),
      },
    });
  }
}

async function cycle() {
  await recoverStuck();
  const batch = await reserveBatch();
  for (const row of batch) {
    if (!running) break;
    await processOne(row);
  }
}

async function main() {
  console.log(`[worker] starting, interval=${INTERVAL_MS}ms, batch=${BATCH_SIZE}`);
  while (running) {
    try {
      await cycle();
    } catch (e) {
      console.error("[worker] cycle error:", e instanceof Error ? e.message : e);
    }
    await sleep(INTERVAL_MS);
  }
  console.log("[worker] stopped");
  await prisma.$disconnect();
}

function shutdown() {
  running = false;
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export function startNotificationWorker(): void {
  void main().catch((e) => {
    console.error("[worker] fatal:", e);
  });
}

export function stopNotificationWorker(): void {
  running = false;
}

if (process.argv[1] && process.argv[1].includes("notifications")) {
  main().catch((e) => {
    console.error("[worker] fatal:", e);
    process.exit(1);
  });
}