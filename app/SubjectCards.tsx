"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, ClipboardList, GraduationCap, LayoutGrid, Wifi } from "lucide-react";
import type { SubjectTaskPreview } from "./lib/coursework-types";
import type { Group, Subject } from "./lib/types";

const covers = [
  { color: "indigo", icon: BookOpen },
  { color: "blue", icon: Wifi },
  { color: "teal", icon: LayoutGrid },
  { color: "violet", icon: ClipboardList },
  { color: "slate", icon: GraduationCap },
];

type Props = {
  group?: Group;
  subjects: Subject[];
  view: string;
  openSubject: (id: string) => void;
};

export default function SubjectCards({ group, subjects, view, openSubject }: Props) {
  const [tasks, setTasks] = useState<SubjectTaskPreview[]>([]);
  const [loadError, setLoadError] = useState(false);
  const groupId = group?.id;
  const hasSubjects = subjects.length > 0;

  useEffect(() => {
    if (!groupId || !hasSubjects) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ classroom: "subject-tasks", groupId });
    if (view) query.set("view", view);
    async function loadTasks() {
      try {
        const response = await fetch("/api/journal?" + query, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Не вдалося завантажити завдання.");
        const data = await response.json() as { items: SubjectTaskPreview[] };
        if (!controller.signal.aborted) setTasks(data.items);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      }
    }
    void loadTasks();
    return () => controller.abort();
  }, [groupId, hasSubjects, view]);

  if (!group || !hasSubjects) return (
    <div className="panel empty-state">
      <BookOpen size={28} aria-hidden="true"/>
      <strong>Поки немає предметів</strong>
      <p>{group ? "Предмети з’являться після додавання до цієї групи." : "Предмети з’являться після призначення до групи."}</p>
    </div>
  );

  return <>
    {loadError && <p className="subject-cards-note muted" role="status">Останні завдання тимчасово недоступні. Відкрийте предмет, щоб переглянути матеріали.</p>}
    <section className="subject-grid" aria-label="Предмети групи">
      {subjects.map(subject => {
        const tone = Array.from(subject.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % covers.length;
        const { color, icon: CoverIcon } = covers[tone];
        const recent = tasks.filter(task => task.subjectId === subject.id);

        return <article className="panel subject-card" key={subject.id}>
          <button type="button" className={"subject-cover subject-cover--" + color}
            aria-label={`Відкрити предмет «${subject.title}»`} onClick={() => openSubject(subject.id)}>
            <CoverIcon className="subject-cover-art" size={100} strokeWidth={1.25} aria-hidden="true"/>
            <ArrowUpRight className="subject-open-icon" size={20} aria-hidden="true"/>
            <span className="subject-cover-group">{group.name}</span>
            <span className="subject-cover-title">{subject.title}</span>
            <span className="subject-cover-teacher">{subject.teacherName}</span>
          </button>
          {recent.length > 0 && <div className="subject-card-tasks">
            <span>Останні завдання</span>
            <ul>{recent.map(task => <li key={task.id}><ClipboardList size={15} aria-hidden="true"/>{task.title}</li>)}</ul>
          </div>}
        </article>;
      })}
    </section>
  </>;
}
