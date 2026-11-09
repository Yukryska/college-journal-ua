"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Check, ClipboardList, Download, Eye, Paperclip, Pencil, Upload } from "lucide-react";
import CourseFilePreview from "./CourseFilePreview";
import { previewFormat, type CourseFile } from "./lib/course-files";
import { courseworkFileAccept, courseworkFileLimit, type ClassroomData, type Submission } from "./lib/coursework-types";

type Props = {
  groupId: string;
  subjectId: string;
  view: string;
  canTeach: boolean;
  preview: boolean;
  today: string;
};

const dateLabel = (date: string) => new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv", day: "numeric", month: "long", year: "numeric",
}).format(new Date(date));
const sections = [
  { id: "all", title: "Усі матеріали" },
  { id: "lecture", title: "Лекції" },
  { id: "assignment", title: "Завдання" },
] as const;

export default function Classroom({ groupId, subjectId, view, canTeach, preview, today }: Props) {
  const [data, setData] = useState<ClassroomData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ target: string; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("lecture");
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("all");
  const [openFile, setOpenFile] = useState<CourseFile | null>(null);

  const [editingGrades, setEditingGrades] = useState<Set<string>>(() => new Set());

  function editGrade(id: string, editing: boolean) {
    setEditingGrades(current => {
      const next = new Set(current);
      if (editing) next.add(id);
      else next.delete(id);
      return next;
    });
    setError(current => current?.target === id ? null : current);
  }

  function endpoint(action: string, id?: string) {
    const query = new URLSearchParams({ classroom: action, groupId, subjectId });
    if (view) query.set("view", view);
    if (id) query.set("id", id);
    return "/api/journal?" + query;
  }

  async function load(signal?: AbortSignal) {
    const response = await fetch(endpoint("list"), { cache: "no-store", signal });
    const result = await response.json() as ClassroomData & { error?: string };
    if (!response.ok) throw new Error(result.error || "Матеріали тимчасово недоступні.");
    setData(result);
  }

  useEffect(() => {
    if (!groupId || !subjectId) return;
    const controller = new AbortController();
    load(controller.signal).catch(err => {
      if (!controller.signal.aborted) setError({ target: "list", message: err.message });
    });
    return () => controller.abort();
  }, [groupId, subjectId, view]);

  async function submit(event: FormEvent<HTMLFormElement>, action: "publish" | "submit" | "grade", id?: string) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const target = id ?? "publish";
    setNotice("");
    setError(null);
    const file = values.get("file");
    if (file instanceof File && file.size > courseworkFileLimit) {
      setError({ target, message: "Розмір файлу має бути до 10 МБ." });
      return;
    }
    setBusy(target);
    try {
      const request: RequestInit = { method: "POST", body: values };
      if (action === "grade") {
        request.headers = { "Content-Type": "application/json" };
        request.body = JSON.stringify({ grade: Number(values.get("grade")), feedback: values.get("feedback") });
      }
      const response = await fetch(endpoint(action, id), request);
      const result = await response.json() as { error?: string; grade?: number; feedback?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося зберегти зміни.");
      if (action === "grade") {
        const { grade, feedback } = result;
        if (typeof grade === "number" && typeof feedback === "string") {
          setData(current => current && {
            ...current,
            submissions: current.submissions.map(work => work.id === target ? { ...work, grade, feedback } : work),
          });
        } else {
          await load();
        }
        editGrade(target, false);
        return;
      }
      form.reset();
      if (action === "publish") setSection("all");
      setNotice({ publish: "Матеріал опубліковано.", submit: preview ? "Тестову роботу здано." : "Роботу здано." }[action]);
      await load();
    } catch (err) {
      setError({ target, message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function fieldError(target: string) {
    return error?.target === target && <p className="classroom-error" role="alert">{error.message}</p>;
  }

  function attachment(name: string, type: "material" | "submission", id: string) {
    const url = endpoint(type, id);
    const format = previewFormat(name);
    const downloadLabel = "Завантажити " + name;
    if (!format) return <a className="classroom-file" href={url} download aria-label={downloadLabel} title={downloadLabel}>
      <Download size={16} aria-hidden="true"/>{name}
    </a>;
    return <div className="classroom-attachment">
      <button type="button" className="classroom-file" aria-label={"Переглянути " + name}
        title="Переглянути файл" onClick={() => setOpenFile({ name, url, format })}>
        <Eye size={16} aria-hidden="true"/><span>{name}</span>
      </button>
      <a className="icon-button" href={url} download aria-label={downloadLabel} title={downloadLabel}>
        <Download size={16} aria-hidden="true"/>
      </a>
    </div>;
  }

  function submissionCard(work: Submission) {
    const graded = work.grade !== null;
    const editing = editingGrades.has(work.id);
    const workTitle = canTeach ? work.studentName : "Твоя робота";
    return <div key={work.id} className="classroom-work">
      <div className="classroom-work-title">
        <strong>{workTitle}{work.isDemo === 1 && " · тестова"}</strong>
        <span aria-live="polite">{work.grade === null ? "На перевірці" : `${work.grade} / 12 балів`}</span>
      </div>
      {attachment(work.fileName, "submission", work.id)}
      <small>Здано {dateLabel(work.submittedAt)}</small>
      {canTeach && (!graded || editing) ? <form className="classroom-grade" onSubmit={event => submit(event, "grade", work.id)}>
        <label className="field"><span>Оцінка (1–12)</span>
          <input name="grade" type="number" min={1} max={12} step={1} required defaultValue={work.grade ?? ""} autoFocus={editing}/>
        </label>
        <label className="field"><span>Коментар</span>
          <textarea name="feedback" rows={2} maxLength={1500} defaultValue={work.feedback}/>
        </label>
        <div className="classroom-grade-actions">
          <button type="submit" className="button primary" disabled={busy !== null}>
            {busy === work.id ? "Зберігаємо…" : graded ? "Зберегти зміни" : "Зберегти оцінку"}
          </button>
          {graded && <button type="button" className="button secondary" disabled={busy !== null}
            onClick={() => editGrade(work.id, false)}>Скасувати</button>}
        </div>
        {fieldError(work.id)}
      </form> : canTeach ? <div className="classroom-grade-result">
        <div>
          <span className="classroom-grade-status"><Check size={15} aria-hidden="true"/>Оцінку збережено</span>
          {work.feedback && <p className="classroom-copy">{work.feedback}</p>}
        </div>
        <button type="button" className="button secondary" disabled={busy !== null}
          onClick={() => editGrade(work.id, true)}><Pencil size={15} aria-hidden="true"/>Змінити оцінку</button>
      </div> : work.feedback && <p className="classroom-copy">{work.feedback}</p>}
    </div>;
  }

  if (!groupId || !subjectId) return <section className="panel classroom-panel"><p>Оберіть групу та предмет.</p></section>;

  const items = data?.items.filter(item => section === "all" || item.kind === section);
  const submissions = data?.submissions ?? [];

  return <div className="classroom-stack">
    <div className="course-sections" role="group" aria-label="Розділи курсу">
      {sections.map(option => <button type="button" className="button secondary" key={option.id}
        aria-pressed={section === option.id} onClick={() => setSection(option.id)}>{option.title}</button>)}
    </div>
    {canTeach && <details className="panel classroom-panel">
      <summary>Опублікувати лекцію або завдання</summary>
      <form className="classroom-form" onSubmit={event => submit(event, "publish")}>
        <div className="classroom-form-row">
          <label className="field"><span>Тип</span>
            <select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
              <option value="lecture">Лекція</option><option value="assignment">Завдання</option>
            </select>
          </label>
          <label className="field"><span>Назва</span><input name="title" maxLength={150} required/></label>
        </div>
        <label className="field"><span>{kind === "lecture" ? "Опис" : "Умови завдання"}</span>
          <textarea name="description" rows={3} maxLength={4000}/>
        </label>
        {kind === "assignment" && <label className="field"><span>Термін здачі (необов’язково)</span><input type="date" name="dueDate"/></label>}
        <label className="field"><span>{kind === "lecture" ? "Файл лекції" : "Файл до завдання (необов’язково)"}</span>
          <input type="file" name="file" accept={courseworkFileAccept} required={kind === "lecture"}/>
        </label>
        <small>Документи, презентації, зображення або ZIP. До 10 МБ.</small>
        <button className="button primary" disabled={busy !== null}><Paperclip size={16}/>{busy === "publish" ? "Публікуємо…" : "Опублікувати"}</button>
        {fieldError("publish")}
      </form>
    </details>}
    {notice && <p className="classroom-notice" role="status">{notice}</p>}
    {fieldError("list")}
    {!data && !error && <p className="muted">Завантажуємо матеріали…</p>}
    {items?.length === 0 && <section className="panel classroom-panel"><p>{
      section === "lecture" ? "Лекцій у курсі ще немає." : section === "assignment" ? "Завдань у курсі ще немає." : "У курсі ще немає лекцій і завдань."
    }</p></section>}
    {items?.map(item => {
      const works = submissions.filter(work => work.courseworkId === item.id);
      const assignment = item.kind === "assignment";
      const closed = item.dueDate !== null && item.dueDate < today;
      return <article key={item.id} className="panel classroom-panel">
        <header className="classroom-item-heading">
          <span className="square-icon">{assignment ? <ClipboardList size={20}/> : <BookOpen size={20}/>}</span>
          <div><small>{assignment ? "Завдання" : "Лекція"}</small><h2>{item.title}</h2></div>
        </header>
        {item.description && <p className="classroom-copy">{item.description}</p>}
        {item.dueDate && <p className="classroom-due">Здати до {dateLabel(item.dueDate)} включно</p>}
        {item.fileName && attachment(item.fileName, "material", item.id)}
        {assignment && <div className="classroom-works">
          {canTeach && <h3>Здані роботи ({works.length})</h3>}
          {works.map(submissionCard)}
          {!canTeach && !works.length && (closed
            ? <p className="muted">Термін здачі минув.</p>
            : <form className="classroom-form" onSubmit={event => submit(event, "submit", item.id)}>
                <label className="field"><span>Файл твоєї роботи</span>
                  <input type="file" name="file" accept={courseworkFileAccept} required/>
                </label>
                <small>Один файл до 10 МБ.</small>
                <button className="button primary" disabled={busy !== null}><Upload size={16}/>{busy === item.id ? "Завантажуємо…" : preview ? "Здати тестову роботу" : "Здати роботу"}</button>
                {fieldError(item.id)}
              </form>)}
        </div>}
      </article>;
    })}
    {openFile && <CourseFilePreview file={openFile} close={() => setOpenFile(null)}/>}
  </div>;
}
