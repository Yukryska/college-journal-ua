import type { User } from "./types";
import { courseworkFileAccept, courseworkFileLimit, type Coursework, type Submission, type SubjectTaskPreview } from "./coursework-types";
import { dateValue, intValue, optional, required, InputError } from "./validation";

export class CourseworkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Classroom = {
  db: D1Database;
  bucket: R2Bucket | undefined;
  user: User;
  groupId: string;
  subjectId: string;
  canTeach: boolean;
  mode: "teacher" | "student" | null;
};

async function studentInGroup(db: D1Database, user: User, groupId: string) {
  if (user.role !== "student" || !user.studentId) return false;
  return Boolean(await db.prepare("SELECT id FROM students WHERE id=? AND groupId=? AND archived=0")
    .bind(user.studentId, groupId).first());
}

export async function recentSubjectTasks(db: D1Database, user: User, url: URL) {
  const groupId = required(url.searchParams.get("groupId"), "Група");
  if (user.role === "student" && !await studentInGroup(db, user, groupId)) {
    throw new CourseworkError(403, "Цей розділ доступний учасникам групи.");
  }

  const teacherOnly = user.role === "teacher";
  const args = teacherOnly ? [groupId, user.id] : [groupId];
  const { results } = await db.prepare(`WITH ranked AS (
    SELECT c.id, c.subjectId, c.title,
      ROW_NUMBER() OVER (PARTITION BY c.subjectId ORDER BY c.createdAt DESC, c.id) AS position
    FROM coursework c JOIN assignments a ON a.groupId=c.groupId AND a.subjectId=c.subjectId
    WHERE c.groupId=? AND c.kind='assignment' ${teacherOnly ? "AND a.teacherId=?" : ""}
  )
  SELECT id, subjectId, title FROM ranked WHERE position<=2 ORDER BY subjectId, position`)
    .bind(...args).all<SubjectTaskPreview>();
  return results;
}

export async function classroomScope(db: D1Database, bucket: R2Bucket | undefined, user: User, url: URL, mode: Classroom["mode"]): Promise<Classroom> {
  const groupId = required(url.searchParams.get("groupId"), "Група");
  const subjectId = required(url.searchParams.get("subjectId"), "Предмет");
  const assignment = await db.prepare("SELECT teacherId FROM assignments WHERE groupId=? AND subjectId=?")
    .bind(groupId, subjectId).first<{ teacherId: string | null }>();
  if (!assignment) throw new CourseworkError(404, "Предмет не знайдено в цій групі.");

  const canTeach = user.role === "admin" || (user.role === "teacher" && assignment.teacherId === user.id);
  if (!canTeach && !await studentInGroup(db, user, groupId)) {
    throw new CourseworkError(403, "Цей розділ доступний учасникам групи.");
  }
  return { db, bucket, user, groupId, subjectId, canTeach, mode };
}

function storage(scope: Classroom) {
  if (!scope.bucket) throw new CourseworkError(503, "Сховище файлів тимчасово недоступне.");
  return scope.bucket;
}

function courseworkItem(scope: Classroom, id: string) {
  return scope.db.prepare("SELECT * FROM coursework WHERE id=? AND groupId=? AND subjectId=?")
    .bind(id, scope.groupId, scope.subjectId).first<Coursework>();
}

function submissionsQuery(scope: Classroom) {
  const filters = ["c.groupId=?", "c.subjectId=?"];
  const args: (string | number | null)[] = [scope.groupId, scope.subjectId];
  if (!scope.canTeach) {
    filters.push("s.studentId=?", "s.isDemo=?");
    args.push(scope.user.studentId, Number(scope.mode === "student"));
  } else if (scope.user.role !== "admin" && scope.mode !== "teacher") {
    filters.push("s.isDemo=0");
  }
  const from = `FROM submissions s JOIN coursework c ON c.id=s.courseworkId
    JOIN students st ON st.id=s.studentId WHERE ${filters.join(" AND ")}`;
  return { from, args };
}

export async function readCoursework(scope: Classroom, action: string, url: URL) {
  const { db, groupId, subjectId } = scope;
  const { from, args } = submissionsQuery(scope);

  if (action === "list") {
    const [items, submissions] = await Promise.all([
      db.prepare("SELECT * FROM coursework WHERE groupId=? AND subjectId=? ORDER BY createdAt DESC, id")
        .bind(groupId, subjectId).all<Coursework>(),
      db.prepare(`SELECT s.id, s.courseworkId, s.fileName, s.submittedAt, s.grade, s.feedback,
        s.isDemo, st.name AS studentName ${from} ORDER BY s.submittedAt DESC, s.id`)
        .bind(...args).all<Submission>(),
    ]);
    return Response.json({ items: items.results, submissions: submissions.results }, { headers: { "Cache-Control": "no-store" } });
  }

  const id = required(url.searchParams.get("id"), "Файл");
  let fileName: string | null | undefined;
  if (action === "material") {
    fileName = (await courseworkItem(scope, id))?.fileName;
  } else if (action === "submission") {
    fileName = (await db.prepare(`SELECT s.fileName ${from} AND s.id=?`)
      .bind(...args, id).first<{ fileName: string }>())?.fileName;
  } else {
    throw new InputError("Невідома дія з навчальними матеріалами.");
  }
  if (!fileName) throw new CourseworkError(404, "Файл не знайдено.");
  const object = await storage(scope).get(`classroom/${action}/${id}`);
  if (!object) throw new CourseworkError(404, "Файл не знайдено у сховищі.");
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, char => "%" + char.charCodeAt(0).toString(16));
  return new Response(object.body, { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  } });
}

async function readForm(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data") || !request.body) {
    throw new CourseworkError(415, "Очікується форма з файлом.");
  }
  const maxBody = courseworkFileLimit + 64 * 1024;
  let received = 0;
  const limited = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBody) controller.error(new Error("Upload too large"));
      else controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(limited, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    if (received > maxBody) throw new CourseworkError(413, "Розмір файлу має бути до 10 МБ.");
    throw new InputError("Не вдалося прочитати форму.");
  }
}

function attachment(form: FormData, mandatory: boolean) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.name || !file.size) {
    if (mandatory) throw new InputError("Прикріпіть файл.");
    return null;
  }
  if (file.size > courseworkFileLimit) throw new CourseworkError(413, "Розмір файлу має бути до 10 МБ.");
  const name = file.name.normalize().replace(/[\\/\p{Cc}]/gu, "_");
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (name.length > 180 || !courseworkFileAccept.split(",").includes(extension)) {
    throw new InputError("Оберіть документ, презентацію, зображення або ZIP-архів із коректною назвою.");
  }
  return { file, name };
}

async function saveAttachment(scope: Classroom, kind: "material" | "submission", id: string, file: File, record: D1PreparedStatement) {
  const bucket = storage(scope);
  const key = `classroom/${kind}/${id}`;
  await bucket.put(key, await file.arrayBuffer());
  const result = await record.run().catch(async error => {
    const table = kind === "material" ? "coursework" : "submissions";
    try {
      // A write can succeed even if its response is lost. Verify before removing the attachment.
      const saved = await scope.db.prepare(`SELECT id FROM ${table} WHERE id=?`).bind(id).first();
      if (!saved) await bucket.delete(key);
    } catch (cleanupError) {
      console.error("Coursework upload cleanup failed", cleanupError);
    }
    throw error;
  });
  if (!result.meta.changes) {
    await bucket.delete(key);
    throw new CourseworkError(409, "Роботу вже здано.");
  }
}

export async function writeCoursework(scope: Classroom, action: string, url: URL, request: Request, auditActor: string) {
  const { db, groupId, subjectId, user, canTeach, mode } = scope;
  if (action === "grade") {
    if (!canTeach) throw new CourseworkError(403, "Оцінку може виставити викладач цього предмета.");
    let form: unknown;
    try { form = await request.json(); } catch { throw new InputError("Некоректна оцінка."); }
    if (!form || typeof form !== "object" || Array.isArray(form)) throw new InputError("Некоректна оцінка.");
    const { grade, feedback } = form as Record<string, unknown>;
    const score = intValue(grade, 1, 12, "Оцінка");
    const note = optional(feedback, 1500);
    const id = required(url.searchParams.get("id"), "Робота");
    const { from, args } = submissionsQuery(scope);
    const submission = await db.prepare(`SELECT c.title, s.isDemo ${from} AND s.id=?`)
      .bind(...args, id).first<{ title: string; isDemo: number }>();
    if (!submission) throw new CourseworkError(404, "Роботу не знайдено.");
    const message = `Оцінено ${submission.isDemo ? "тестову роботу" : "роботу"} «${submission.title}»`;
    await db.batch([
      db.prepare("UPDATE submissions SET grade=?, feedback=? WHERE id=?").bind(score, note, id),
      db.prepare("INSERT INTO auditLogs(id,actor,message,createdAt) VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), auditActor, message, new Date().toISOString()),
    ]);
    return Response.json({ ok: true, grade: score, feedback: note }, { headers: { "Cache-Control": "no-store" } });
  } else if (action === "publish") {
    if (!canTeach) throw new CourseworkError(403, "Публікувати може викладач цього предмета.");
    const form = await readForm(request);
    const kind = form.get("kind");
    if (kind !== "lecture" && kind !== "assignment") throw new InputError("Оберіть тип матеріалу.");
    const title = required(form.get("title"), "Назва", 150);
    const description = optional(form.get("description"), 4000);
    const date = form.get("dueDate");
    const dueDate = kind === "assignment" && date ? dateValue(date) : null;
    const file = attachment(form, kind === "lecture");
    const id = crypto.randomUUID();
    const record = db.prepare(`INSERT INTO coursework(id,groupId,subjectId,kind,title,description,dueDate,fileName,createdAt)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(id, groupId, subjectId, kind, title, description, dueDate, file?.name ?? null, new Date().toISOString());
    if (file) await saveAttachment(scope, "material", id, file.file, record);
    else await record.run();
  } else if (action === "submit") {
    if (user.role !== "student" || !user.studentId) {
      throw new CourseworkError(403, "Роботу можна здати зі свого студентського акаунта.");
    }
    const courseworkId = required(url.searchParams.get("id"), "Завдання");
    const item = await courseworkItem(scope, courseworkId);
    if (item?.kind !== "assignment") throw new CourseworkError(404, "Завдання не знайдено.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (item.dueDate && item.dueDate < today) throw new CourseworkError(409, "Термін здачі вже минув.");
    const isDemo = Number(mode === "student");
    const existing = await db.prepare("SELECT id FROM submissions WHERE courseworkId=? AND studentId=? AND isDemo=?")
      .bind(courseworkId, user.studentId, isDemo).first();
    if (existing) throw new CourseworkError(409, "Роботу вже здано.");
    const file = attachment(await readForm(request), true);
    if (!file) throw new InputError("Прикріпіть файл.");
    const id = crypto.randomUUID();
    const record = db.prepare(`INSERT INTO submissions(id,courseworkId,studentId,isDemo,fileName,submittedAt)
      VALUES (?,?,?,?,?,?) ON CONFLICT(courseworkId,studentId,isDemo) DO NOTHING`)
      .bind(id, courseworkId, user.studentId, isDemo, file.name, new Date().toISOString());
    await saveAttachment(scope, "submission", id, file.file, record);
  } else {
    throw new InputError("Невідома дія з навчальними матеріалами.");
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
