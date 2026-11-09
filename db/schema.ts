import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", { key: text().primaryKey(), value: text().notNull() });
export const groups = sqliteTable("groups", {
  id: text().primaryKey(), name: text().notNull().unique(), course: integer().notNull(), specialty: text().notNull(),
});
export const students = sqliteTable("students", {
  id: text().primaryKey(), groupId: text().notNull().references(() => groups.id),
  name: text().notNull(), email: text(), archived: integer().notNull().default(0),
});
export const users = sqliteTable("users", {
  id: text().primaryKey(), authId: text().unique(), email: text().notNull().unique(), name: text().notNull(),
  role: text().notNull(), studentId: text().references(() => students.id),
  accessRevoked: integer().notNull().default(0),
}, t => [check("user_role", sql`${t.role} in ('admin','teacher','student')`)]);
export const subjects = sqliteTable("subjects", {
  id: text().primaryKey(), title: text().notNull(), teacherName: text().notNull(),
});
export const assignments = sqliteTable("assignments", {
  id: text().primaryKey(), groupId: text().notNull().references(() => groups.id),
  subjectId: text().notNull().references(() => subjects.id), teacherId: text().references(() => users.id),
}, t => [uniqueIndex("group_subject_unique").on(t.groupId, t.subjectId)]);
export const lessons = sqliteTable("lessons", {
  id: text().primaryKey(), groupId: text().notNull().references(() => groups.id),
  subjectId: text().notNull().references(() => subjects.id), date: text().notNull(),
  number: integer().notNull(), type: text().notNull(), topic: text().notNull(), homework: text().notNull(),
}, t => [uniqueIndex("lesson_slot_unique").on(t.groupId, t.subjectId, t.date, t.number)]);
export const records = sqliteTable("records", {
  id: text().primaryKey(), lessonId: text().notNull().references(() => lessons.id),
  studentId: text().notNull().references(() => students.id), grade: integer(), attendance: text(),
  note: text().notNull().default(""), updatedAt: text().notNull(),
}, t => [uniqueIndex("student_lesson_unique").on(t.studentId, t.lessonId),
  check("grade_range", sql`${t.grade} is null or (${t.grade} between 1 and 12)`),
  check("attendance_type", sql`${t.attendance} is null or ${t.attendance} in ('present','absent','excused')`)]);
export const auditLogs = sqliteTable("auditLogs", {
  id: text().primaryKey(), actor: text().notNull(), message: text().notNull(), createdAt: text().notNull(),
});

export const coursework = sqliteTable("coursework", {
  id: text().primaryKey(),
  groupId: text().notNull().references(() => groups.id),
  subjectId: text().notNull().references(() => subjects.id),
  kind: text().notNull(),
  title: text().notNull(),
  description: text().notNull(),
  dueDate: text(),
  fileName: text(),
  createdAt: text().notNull(),
}, t => [
  check("coursework_kind", sql`${t.kind} in ('lecture','assignment')`),
  index("coursework_scope").on(t.groupId, t.subjectId, t.createdAt),
]);

export const submissions = sqliteTable("submissions", {
  id: text().primaryKey(),
  courseworkId: text().notNull().references(() => coursework.id),
  studentId: text().notNull().references(() => students.id),
  isDemo: integer().notNull().default(0),
  fileName: text().notNull(),
  submittedAt: text().notNull(),
  grade: integer(),
  feedback: text().notNull().default(""),
}, t => [
  uniqueIndex("submission_per_student").on(t.courseworkId, t.studentId, t.isDemo),
  check("submission_grade_range", sql`${t.grade} is null or ${t.grade} between 1 and 12`),
]);

export const journalSessions = sqliteTable("journalSessions", {
  tokenHash: text().primaryKey(),
  email: text().notNull(),
  keyHash: text().notNull(),
  expiresAt: integer().notNull(),
}, t => [index("journal_session_expiry").on(t.expiresAt)]);
