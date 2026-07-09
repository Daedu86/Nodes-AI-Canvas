import { promises as fs } from "node:fs";
import path from "node:path";
import type { AuthenticatedUser } from "@/lib/server/auth-user";
import type { ProjectDocument } from "@/lib/project-documents";

const ACCESS_NOTIFICATION_WINDOW_MS = 12 * 60 * 60 * 1000;

type AccessNotificationRecord = {
  key: string;
  lastNotifiedAt: string;
};

const parseCsv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const getAdminRecipients = () => parseCsv(process.env.SUPPORT_ADMIN_EMAILS);

const getNotificationStoreDir = () =>
  process.env.PROJECT_NOTIFICATION_STORE_DIR
    ? path.resolve(process.env.PROJECT_NOTIFICATION_STORE_DIR)
    : path.join(process.cwd(), "data", "project-notifications");

const accessRecordPath = (key: string) =>
  path.join(getNotificationStoreDir(), `${key}.json`);

const buildAccessKey = (projectId: string, accessorId: string) =>
  `${projectId}__${accessorId}`.replace(/[^a-zA-Z0-9:_-]/g, "_");

async function shouldSendAccessNotification(projectId: string, accessorId: string) {
  const key = buildAccessKey(projectId, accessorId);
  const filePath = accessRecordPath(key);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AccessNotificationRecord>;
    const last = typeof parsed.lastNotifiedAt === "string" ? new Date(parsed.lastNotifiedAt).getTime() : 0;
    if (Number.isFinite(last) && Date.now() - last < ACCESS_NOTIFICATION_WINDOW_MS) {
      return false;
    }
  } catch {
    // no record yet
  }

  await fs.mkdir(getNotificationStoreDir(), { recursive: true });
  const payload: AccessNotificationRecord = {
    key,
    lastNotifiedAt: new Date().toISOString(),
  };
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
  return true;
}

async function sendMail(input: { subject: string; text: string }) {
  const recipients = getAdminRecipients();
  if (recipients.length === 0) return;
  console.info("[project-notifications] email notification skipped because nodemailer is not installed", {
    recipients: recipients.length,
    subject: input.subject,
  });
}

export async function notifyProjectMemberAdded(input: {
  projectId: string;
  projectTitle: string | null;
  actor: AuthenticatedUser;
  memberEmail: string;
  memberRole: "editor" | "viewer";
}) {
  try {
    await sendMail({
      subject: `[Project] Member added: ${input.projectTitle ?? input.projectId}`,
      text: [
        "A project member was added.",
        "",
        `Project ID: ${input.projectId}`,
        `Project Title: ${input.projectTitle ?? "-"}`,
        `Member Email: ${input.memberEmail}`,
        `Member Role: ${input.memberRole}`,
        "",
        `Added By User ID: ${input.actor.id}`,
        `Added By Name: ${input.actor.name ?? "-"}`,
        `Added By Email: ${input.actor.email ?? "-"}`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[project-notifications] member notification failed", error);
  }
}

export async function notifyProjectAccessed(input: {
  project: Pick<ProjectDocument, "id" | "title" | "accessRole">;
  accessor: AuthenticatedUser;
}) {
  if (input.project.accessRole === "owner") return;
  try {
    const shouldSend = await shouldSendAccessNotification(input.project.id, input.accessor.id);
    if (!shouldSend) return;

    await sendMail({
      subject: `[Project] Accessed by ${input.accessor.name ?? input.accessor.email ?? input.accessor.id}`,
      text: [
        "A non-owner user accessed a project.",
        "",
        `Project ID: ${input.project.id}`,
        `Project Title: ${input.project.title ?? "-"}`,
        `Accessor Role: ${input.project.accessRole}`,
        "",
        `Accessor User ID: ${input.accessor.id}`,
        `Accessor Name: ${input.accessor.name ?? "-"}`,
        `Accessor Email: ${input.accessor.email ?? "-"}`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[project-notifications] access notification failed", error);
  }
}
