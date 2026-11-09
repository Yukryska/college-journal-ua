"use client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BookOpen, LayoutGrid, Users, GraduationCap, BarChart3, Settings2, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, Download, Printer, Check, X, ArrowUpRight, CalendarDays, Clock3, CheckCheck, ShieldCheck, ShieldPlus, LogOut, Menu, ArrowLeft, LoaderCircle, CircleHelp, Pencil, ClipboardList, Wifi, AlertCircle, Trash2 } from "lucide-react";
import type { JournalData, Lesson, Student, Mark, Role, User } from "./lib/types";
import { mean, attendancePercent, csvCell, roleLabels } from "./lib/types";
import CollegeBrand from "./CollegeBrand";
import ThemeToggle from "./ThemeToggle";
import Classroom from "./Classroom";
import SubjectCards from "./SubjectCards";

type Page="journal"|"subjects"|"classroom"|"lessons"|"students"|"analytics"|"settings";
type Modal={kind:"mark";student:Student;lesson:Lesson;mark?:Mark}|{kind:"lesson";lesson?:Lesson}|{kind:"student"|"group"|"subject"|"account"|"assignment"}|{kind:"account-access"|"account-delete"|"account-promote";account:User}|null;
const dates=(s:string,opts:Intl.DateTimeFormatOptions={day:"numeric",month:"long"})=>new Date(s+"T12:00:00").toLocaleDateString("uk-UA",opts);
const initials=(s:string)=>s.split(" ").slice(0,2).map(x=>x[0]).join("");
const format=(n:number|null)=>n===null?"—":n.toFixed(1).replace(".",",");
const gradeClass=(n:number)=>n>=10?"excellent":n>=7?"good":n>=4?"fair":"low";
const getToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Kyiv",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const menuItems:{id:Page;label:string;icon:typeof BookOpen}[]=[{id:"journal",label:"Журнал оцінок",icon:BookOpen},{id:"subjects",label:"Предмети",icon:LayoutGrid},{id:"lessons",label:"Заняття та завдання",icon:CalendarDays},{id:"students",label:"Студенти та групи",icon:Users},{id:"analytics",label:"Успішність",icon:BarChart3}];

export default function Journal(){
  const [data,setData]=useState<JournalData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[status,setStatus]=useState(0);
  const [view,setView]=useState(()=>{if(typeof window==="undefined")return "";const mode=new URLSearchParams(window.location.search).get("view");return mode==="teacher"||mode==="student"?mode:"";});const [page,setPage]=useState<Page>("journal");
  const [groupId,setGroupId]=useState("g1"),[subjectId,setSubjectId]=useState("sub1"),[month,setMonth]=useState("2026-11");
  const [search,setSearch]=useState(""),[modal,setModal]=useState<Modal>(null),[saving,setSaving]=useState(false),[toast,setToast]=useState("");
  const [selectedLesson,setSelectedLesson]=useState("g1-sub1-l2"),[mobileMenu,setMobileMenu]=useState(false),[studentDetail,setStudentDetail]=useState<Student|null>(null);
  const [formError,setFormError]=useState("");const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const today=getToday();
  const notify=(s:string)=>{setToast(s);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(""),4500);};
  async function load(mode=view){
    setError("");try{const res=await fetch("/api/journal"+(mode?"?view="+mode:""),{cache:"no-store"});const result=await res.json() as JournalData & {error?:string};setStatus(res.status);if(!res.ok)throw new Error(result.error||"Не вдалося завантажити журнал.");setData(result);}catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  useEffect(()=>{load(view);},[view]);
  useEffect(()=>{if(!data)return;if(!data.groups.some(g=>g.id===groupId))setGroupId(data.groups[0]?.id||"");},[data,groupId]);
  const availableSubjects=useMemo(()=>data?.subjects.filter(s=>data.assignments.some(a=>a.subjectId===s.id&&a.groupId===groupId))||[],[data,groupId]);
  useEffect(()=>{if(!availableSubjects.some(s=>s.id===subjectId))setSubjectId(availableSubjects[0]?.id||"");},[availableSubjects,subjectId]);
  useEffect(()=>{setSearch("");setStudentDetail(null);},[groupId,page]);
  const group=data?.groups.find(g=>g.id===groupId),subject=data?.subjects.find(s=>s.id===subjectId);
  const lessonList=data?.lessons.filter(l=>l.groupId===groupId&&l.subjectId===subjectId&&l.date.startsWith(month))||[];
  const students=data?.students.filter(s=>s.groupId===groupId&&s.name.toLocaleLowerCase("uk").includes(search.toLocaleLowerCase("uk"))).sort((a,b)=>a.name.localeCompare(b.name,"uk"))||[];
  const records=data?.records.filter(r=>lessonList.some(l=>l.id===r.lessonId))||[];
  const marks=useMemo(()=>new Map(data?.records.map(r=>[r.studentId+":"+r.lessonId,r])||[]),[data]);
  const activeLesson=lessonList.find(l=>l.id===selectedLesson)||lessonList.find(l=>l.date>=today)||lessonList[0];
  const avg=mean(records),att=attendancePercent(records),absent=records.filter(r=>r.attendance==="absent"||r.attendance==="excused").length;
  const assessableLessons=lessonList.filter(l=>l.date<=today);
  const writable=!!data?.permissions?.canGrade;
  const admin=!!data?.permissions?.canManage;
  function openModal(m:Modal){setFormError("");setModal(m);}
  function openMarkEditor(studentId?:string,lessonId?:string){
    const student=studentId?data?.students.find(s=>s.id===studentId&&s.groupId===groupId):students[0];
    const lesson=lessonId?assessableLessons.find(l=>l.id===lessonId):(activeLesson&&activeLesson.date<=today?activeLesson:assessableLessons[assessableLessons.length-1]);
    if(!writable||!student||!lesson||student.groupId!==lesson.groupId)return;
    openModal({kind:"mark",student,lesson,mark:marks.get(student.id+":"+lesson.id)});
  }
  function navigate(p:Page){setPage(p);setMobileMenu(false);window.scrollTo({top:0,behavior:"auto"});}
  async function mutate(body:Record<string,unknown>){
    setSaving(true);setFormError("");try{const res=await fetch("/api/journal"+(view?"?view="+view:""),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const r=await res.json() as {error?:string};if(!res.ok)throw new Error(r.error||"Не вдалося зберегти.");await load();setModal(null);notify("Зміни збережено");return true;}catch(e){setFormError((e as Error).message);return false;}finally{setSaving(false);}
  }
  function shiftMonth(step:number){const d=new Date(month+"-15T12:00:00");d.setMonth(d.getMonth()+step);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}
  function exportCsv(){const rows=[["Електронний журнал",group?.name,subject?.title,month],["Студент",...lessonList.map(l=>l.date+" · "+l.number+" пара"),"Середній бал"]];for(const s of students)rows.push([s.name,...lessonList.map(l=>{const m=marks.get(s.id+":"+l.id);return m?.grade?.toString()||(m?.attendance==="absent"?"Н":m?.attendance==="excused"?"П":m?.attendance==="present"?"Присутній":"");}),format(mean(records.filter(r=>r.studentId===s.id)))]);const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`journal-${group?.name||"group"}-${month}.csv`;a.click();URL.revokeObjectURL(url);notify("CSV-файл завантажено");}
  function changeView(mode:string){const url=new URL(window.location.href);if(mode)url.searchParams.set("view",mode);else url.searchParams.delete("view");window.history.replaceState(null,"",url.pathname+url.search+url.hash);setView(mode);setPage("journal");setSearch("");setModal(null);setData(null);setLoading(true);}

  if(loading&&!data)return <div className="loading-screen"><CollegeBrand variant="standalone"/><h2>Відкриваємо журнал</h2><LoaderCircle className="spin" size={22}/></div>;
  if(error&&!data)return <div className="loading-screen"><CollegeBrand variant="standalone"/><h1>Електронний журнал</h1><p>{error}</p>{status===401?<a className="button primary" href="/sign-in">Увійти до журналу <ArrowUpRight size={17}/></a>:<button className="button primary" onClick={()=>load()}>Спробувати ще раз</button>}{view&&(status===403||status===404)&&<button className="button secondary" onClick={()=>changeView("")}>До основного кабінету</button>}<span className="muted">ІТ коледж Львівської політехніки · Навчальний простір</span></div>;
  if(!data)return null;

  const navPage=page==="classroom"?"subjects":page;
  return <div className="app-shell">
    <aside className={"sidebar "+(mobileMenu?"visible":"")}>
      <a className="brand college-brand-link" href="/" aria-label="Електронний журнал ІТ коледжу — головна"><CollegeBrand/></a>
      <div className="workspace-label">НАВЧАЛЬНИЙ ПРОСТІР</div>
      <nav>{menuItems.filter(m=>data.role!=="student"||m.id!=="students").map(m=><button className={"nav-item "+(navPage===m.id?"active":"")} onClick={()=>navigate(m.id)} key={m.id}><m.icon size={19}/>{m.label}{navPage===m.id&&<span className="nav-dot"/>}</button>)}</nav>
      {admin&&<><div className="workspace-label manage-label">КЕРУВАННЯ</div><button className={"nav-item "+(page==="settings"?"active":"")} onClick={()=>navigate("settings")}><Settings2 size={19}/>Адміністрування</button></>}
      <div className="sidebar-bottom"><div className="year-card"><GraduationCap size={21}/><div><strong>2026 / 2027</strong><span>Навчальний рік</span></div><span className="live-dot"/></div><div className="demo-note"><ShieldCheck size={16}/><span>Дипломний проєкт<br/><b>Демонстраційні дані</b></span></div><div className="profile"><span className="avatar">{initials(data.activeUser.name)}</span><span className="profile-text"><strong>{data.activeUser.name}</strong><span>{roleLabels[data.role]}</span></span><form method="post" action="/api/session"><button type="submit" name="action" value="logout" className="sign-out" title="Вийти" aria-label="Вийти"><LogOut size={17}/></button></form></div></div>
    </aside>
    {mobileMenu&&<button className="sidebar-shade" aria-label="Закрити меню" onClick={()=>setMobileMenu(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" aria-label="Відкрити меню" onClick={()=>setMobileMenu(true)}><Menu size={20}/></button><span className="mobile-brand"><CollegeBrand variant="mobile"/></span><span className="muted">ІТ коледж</span><ChevronRight className="breadcrumb-chevron" size={13}/><span className="current-page">{page==="settings"?"Адміністрування":menuItems.find(m=>m.id===navPage)?.label}</span></div><div className="topbar-right"><span className="today"><CalendarDays size={15}/>{dates(today,{day:"numeric",month:"long",year:"numeric"})}</span>{data.user.role==="admin"&&<label className="role-select"><ShieldCheck size={15}/><select aria-label="Роль у журналі" value={view} onChange={e=>changeView(e.target.value)}><option value="">Адміністратор</option><option value="teacher">Викладач — оцінювання</option><option value="student">Студент — демо</option></select></label>}<ThemeToggle/></div></header>
      <div className="page-content">
      {data.mode&&<div className={"preview-banner "+(data.mode==="teacher"?"teacher-cabinet-banner":"")}><ShieldCheck size={17}/><span>{data.mode==="teacher"?`Кабінет викладача · ${data.activeUser.name}. Оцінки та відвідування можна редагувати.`:`Демокабінет студента · ${data.activeUser.name}. Можна здати тестову роботу.`}</span><button onClick={()=>changeView("")}>Адміністратор <ArrowUpRight size={14}/></button></div>}
      {data.role==="teacher"&&!data.assignments.length&&<div className="error-banner" role="status"><CircleHelp size={17}/><span>Вам ще не призначено групу та предмет. Адміністратор має додати призначення в розділі «Адміністрування».</span></div>}
      {error&&<div className="error-banner" role="alert">{error}<button onClick={()=>load()}>Оновити</button></div>}
      <div className="page-heading"><div><div className="eyebrow">{page==="classroom"?(group?"КУРС · "+group.name:"КУРС"):data.role==="student"?"ОСОБИСТИЙ КАБІНЕТ":"ІТ КОЛЕДЖ ЛЬВІВСЬКОЇ ПОЛІТЕХНІКИ"}</div><h1>{page==="journal"?(data.role==="student"?"Мій журнал":data.role==="teacher"?"Кабінет викладача":"Електронний журнал"):page==="lessons"?"Заняття та завдання":page==="classroom"?(subject?.title||"Курс"):page==="subjects"?"Предмети":page==="students"?"Студенти та групи":page==="analytics"?"Успішність навчання":"Адміністрування"}</h1><p>{page==="journal"?"Оцінки, відвідування та прогрес — усе під рукою.":page==="lessons"?"Теми занять, навчальні матеріали та домашні завдання.":page==="classroom"?(subject?.teacherName||"Матеріали курсу."):page==="subjects"?"Обери предмет, щоб відкрити лекції та завдання.":page==="students"?"Навчальні групи та список студентів коледжу.":page==="analytics"?"Статистика оцінювання та відвідування за вибраний місяць.":"Доступ до системи та призначення викладачів."}</p></div><div className="heading-actions">{page==="classroom"&&<button className="button secondary" onClick={()=>navigate("subjects")}><ArrowLeft size={16}/>Усі предмети</button>}{page==="journal"&&<button className="button secondary" onClick={exportCsv}><Download size={16}/><span>Експорт CSV</span></button>}{page==="journal"&&writable&&<button className="button primary" onClick={()=>openMarkEditor()} disabled={!students.length||!assessableLessons.length} title={assessableLessons.length?"Оберіть студента й дату заняття":"У цьому місяці ще немає проведених занять"}><Pencil size={16}/>Виставити оцінку</button>}{(page==="journal"||page==="lessons")&&writable&&<button className={"button "+(page==="journal"?"secondary":"primary")} onClick={()=>openModal({kind:"lesson"})} disabled={!subjectId||!groupId}><Plus size={17}/>Додати заняття</button>}{page==="students"&&admin&&<button className="button primary" onClick={()=>openModal({kind:"student"})}><Plus size={17}/>Додати студента</button>}{page==="settings"&&admin&&<button className="button primary" onClick={()=>openModal({kind:"account"})}><Plus size={17}/>Надати доступ</button>}</div></div>
      {page!=="settings"&&page!=="classroom"&&<section className="filter-bar" aria-label="Фільтри журналу"><label className="filter-field group-filter"><span>ГРУПА</span><div><Users size={17}/><select aria-label="Група" value={groupId} onChange={e=>setGroupId(e.target.value)}>{data.groups.length?data.groups.map(g=><option value={g.id} key={g.id}>{g.name}</option>):<option value="">Немає груп</option>}</select></div></label>{page!=="students"&&page!=="subjects"&&<label className="filter-field subject-filter"><span>НАВЧАЛЬНИЙ ПРЕДМЕТ</span><div><BookOpen size={17}/><select aria-label="Предмет" value={subjectId} onChange={e=>setSubjectId(e.target.value)}>{availableSubjects.length?availableSubjects.map(s=><option value={s.id} key={s.id}>{s.title}</option>):<option value="">Немає предметів</option>}</select></div></label>}<div className="filter-spacer"/>{page!=="students"&&page!=="subjects"&&<div className="month-picker"><button className="icon-button" aria-label="Попередній місяць" onClick={()=>shiftMonth(-1)}><ChevronLeft size={17}/></button><label><CalendarDays size={16}/><span className="month-text">{dates(month+"-01",{month:"long",year:"numeric"}).replace(" р.","")}</span><input type="month" aria-label="Місяць журналу" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/></label><button className="icon-button" aria-label="Наступний місяць" onClick={()=>shiftMonth(1)}><ChevronRight size={17}/></button></div>}</section>}
      {page==="subjects"&&<SubjectCards key={JSON.stringify([groupId,view])} group={group} subjects={availableSubjects} view={view} openSubject={id=>{setSubjectId(id);navigate("classroom");}}/>}
      {page==="classroom"&&<Classroom key={JSON.stringify([groupId,subjectId,view])} groupId={groupId} subjectId={subjectId} view={view} canTeach={writable} preview={data.preview} today={today}/>}
      {(page==="journal"||page==="analytics")&&<section className="stat-grid"><Stat icon={<GraduationCap size={21}/>} label="Середній бал" value={format(avg)} suffix="/ 12" note="За виставленими оцінками" color="green"/><Stat icon={<CheckCheck size={21}/>} label="Відвідуваність" value={att===null?"—":att+"%"} note="За заповненими відмітками" color="blue"/><Stat icon={<Users size={21}/>} label={data.role==="student"?"Пропущено занять":"Студентів у групі"} value={String(data.role==="student"?absent:data.students.filter(s=>s.groupId===groupId).length)} note={data.role==="student"?"За вибраний місяць":`${group?.course||"—"} курс · ${lessonList.length} занять у журналі`} color="amber"/></section>}
      {page==="journal"&&<div className="journal-layout"><section className="panel journal-panel"><div className="panel-heading"><div><h2>Журнал оцінок <span className="count-badge">{group?.name||"—"}</span></h2><p>{subject?.teacherName||"Оберіть групу та предмет"}</p></div><div className="panel-tools"><label className="search-box"><Search size={16}/><input placeholder="Знайти студента" aria-label="Знайти студента" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="icon-button print-button" title="Друк журналу" aria-label="Друк журналу" onClick={()=>window.print()}><Printer size={17}/></button></div></div>
        {writable&&<div className="journal-instruction"><Pencil size={13}/><span>Натисніть клітинку під датою проведеного заняття або кнопку «Виставити оцінку».</span></div>}<div className="table-scroll"><table className="journal-table"><thead><tr><th className="number-col">№</th><th className="student-col">Студент</th>{lessonList.map(l=><th key={l.id} className={(l.id===activeLesson?.id?"selected-column ":"")+(l.date>today?"future-column":"")}><button onClick={()=>setSelectedLesson(l.id)} title={l.topic}><span>{dates(l.date,{day:"2-digit"})}</span><small>{dates(l.date,{month:"short"}).replace(".","")}</small><i>{l.type==="Лабораторна"?"ЛБ":l.type==="Контрольна"?"КР":"ЛК"}</i></button></th>)}<th className="average-col">Сер.<br/>бал</th></tr></thead><tbody>{students.map((s,index)=><tr key={s.id}><td className="number-col">{String(index+1).padStart(2,"0")}</td><td className="student-col"><button className="student-name" onClick={()=>setStudentDetail(s)}><span className={"student-avatar tone-"+(index%5)}>{initials(s.name)}</span><span>{s.name}</span></button></td>{lessonList.map(l=>{const m=marks.get(s.id+":"+l.id);const label=m?.grade!==null&&m?.grade!==undefined?String(m.grade):m?.attendance==="absent"?"Н":m?.attendance==="excused"?"П":m?.attendance==="present"?"·":"—";return <td className={(l.id===activeLesson?.id?"selected-column ":"")+(l.date>today?"future-column":"")} key={l.id}><button disabled={!writable||l.date>today} aria-label={`${s.name}, ${dates(l.date)}: ${label}`} className={"mark-cell "+(m?.grade?gradeClass(m.grade):m?.attendance==="absent"?"absent":m?.attendance==="excused"?"excused":m?.attendance==="present"?"present":"empty")} onClick={()=>openModal({kind:"mark",student:s,lesson:l,mark:m})} title={m?.note||(!writable?"Лише перегляд":l.date>today?"Майбутнє заняття":"Натисніть, щоб оцінити")}>{label}{m?.note&&<span className="note-dot"/>}</button></td>;})}<td className="average-col"><span className="student-average">{format(mean(records.filter(r=>r.studentId===s.id)))}</span></td></tr>)}</tbody></table>{!students.length&&<Empty icon={<Users size={28}/>} title={search?"Студента не знайдено":"У цій групі ще немає студентів"} text={search?"Змініть пошуковий запит.":"Адміністратор може додати студентів у розділі «Студенти та групи»."}/>}</div>
        {!lessonList.length&&students.length>0&&<div className="no-lessons"><CalendarDays size={20}/><span>У вибраному місяці ще немає занять.</span>{writable&&<button className="text-button" onClick={()=>openModal({kind:"lesson"})}>Додати перше заняття</button>}</div>}
        <div className="table-footer"><div className="legend"><span><i className="legend-point green"/>10–12</span><span><i className="legend-point blue"/>7–9</span><span><b className="legend-n">Н</b>Відсутній</span><span><b className="legend-p">П</b>Поважна причина</span><span><b className="legend-present">·</b>Присутній</span></div><span className="save-state"><Check size={13}/>Збережено</span></div></section>
        <aside className="journal-aside"><section className="panel lesson-card"><div className="card-label"><span className="square-icon"><CalendarDays size={17}/></span><span>ОБРАНЕ ЗАНЯТТЯ</span></div>{activeLesson?<><div className="lesson-date">{dates(activeLesson.date)}<span>{activeLesson.number} пара</span></div><span className="type-badge">{activeLesson.type}</span><h3>{activeLesson.topic}</h3><div className="homework"><span><ClipboardList size={15}/>Домашнє завдання</span><p>{activeLesson.homework||"Завдання не задано."}</p></div>{writable&&<button className="button secondary full-width" onClick={()=>openModal({kind:"lesson",lesson:activeLesson})}><Pencil size={14}/>Редагувати заняття</button>}</>:<p className="muted">Оберіть інший місяць або додайте заняття.</p>}</section><section className="tip-card"><span className="tip-icon"><BookOpen size={22}/></span><h3>Менше паперів.<br/>Більше навчання.</h3><p>{writable?"Натисніть на клітинку журналу, щоб виставити оцінку або відмітити відвідування.":"Переглядайте оцінки й завдання та слідкуйте за своїм прогресом."}</p><div className="tip-lines"><span/><span/><span/></div></section></aside></div>}
      {page==="lessons"&&<section className="panel"><div className="panel-heading"><div><h2>План занять <span className="count-badge">{lessonList.length}</span></h2><p>{subject?.title||"Оберіть предмет"}</p></div></div><div className="lessons-list">{lessonList.map(l=><article className="lesson-row" key={l.id}><div className="date-tile"><strong>{dates(l.date,{day:"2-digit"})}</strong><span>{dates(l.date,{month:"short"})}</span></div><div className="lesson-content"><div className="lesson-meta"><span className="type-badge">{l.type}</span><span>{l.number} пара</span>{l.date>today&&<span className="future-label">Заплановано</span>}</div><h3>{l.topic}</h3><p><b>Завдання:</b> {l.homework||"Не задано"}</p></div>{writable&&<button className="icon-button" aria-label={"Редагувати "+l.topic} onClick={()=>openModal({kind:"lesson",lesson:l})}><Pencil size={17}/></button>}</article>)}{!lessonList.length&&<Empty icon={<CalendarDays size={30}/>} title="Занять поки немає" text="Оберіть інший місяць або додайте нове заняття."/>}</div></section>}
      {page==="students"&&<><div className="group-cards">{data.groups.map(g=><button className={"group-card "+(g.id===groupId?"selected":"")} key={g.id} onClick={()=>setGroupId(g.id)}><span className="square-icon"><Users size={20}/></span><strong>{g.name}</strong><p>{g.specialty}</p><span>{g.course} курс <i/> {data.students.filter(s=>s.groupId===g.id).length} студентів</span><ArrowUpRight className="group-arrow" size={17}/></button>)}{admin&&<button className="group-card add-group" onClick={()=>openModal({kind:"group"})}><Plus size={24}/>Додати групу</button>}</div><section className="panel"><div className="panel-heading"><div><h2>Список студентів <span className="count-badge">{group?.name}</span></h2><p>{group?.specialty}</p></div><label className="search-box"><Search size={16}/><input placeholder="Пошук за ім’ям" aria-label="Пошук студентів" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="student-directory">{students.map((s,i)=><button key={s.id} onClick={()=>setStudentDetail(s)}><span className={"student-avatar tone-"+(i%5)}>{initials(s.name)}</span><span><strong>{s.name}</strong><small>{s.email||group?.name}</small></span><ArrowUpRight size={17}/></button>)}{!students.length&&<Empty icon={<Users size={28}/>} title="Список порожній" text="Додайте студента або змініть групу."/>}</div></section></>}
      {page==="analytics"&&<section className="panel"><div className="panel-heading"><div><h2>{data.role==="student"?"Мої результати":"Результати студентів"}</h2><p>{subject?.title} · {group?.name}</p></div></div><div className="analytics-students">{students.map((s,i)=>{const rows=records.filter(r=>r.studentId===s.id);const a=mean(rows);return <div key={s.id}><span className="ranking">{i+1}</span><span className="analytics-name">{s.name}</span><div className="progress-track"><span style={{width:(a||0)/12*100+"%"}}/></div><strong>{format(a)}</strong><small>{attendancePercent(rows)===null?"—":attendancePercent(rows)+"%"}</small></div>;})}{!students.length&&<Empty icon={<BarChart3 size={28}/>} title="Ще немає даних" text="Результати з’являться після додавання студентів та оцінок."/>}</div></section>}
      {page==="settings"&&admin&&<div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h2>Користувачі та доступ</h2><p>Облікові записи прив’язуються під час входу за електронною поштою.</p></div></div><div className="accounts-list">
        {data.users.map(account => {
          const revoked = Boolean(account.accessRevoked);
          const actionLabel = revoked ? "Відновити доступ" : "Відкликати доступ";
          const canManageAccount = !account.isOwner && (account.role !== "admin" || data.permissions.canManageAdmins);
          return (
            <div key={account.id}>
              <span className="student-avatar">{initials(account.name)}</span>
              <span className="account-text"><strong>{account.name}</strong><small>{account.email}</small></span>
              <span className={"role-badge "+account.role}>{account.isOwner ? "Власник" : roleLabels[account.role]}</span>
              <div className="account-access-controls">
                <span className={revoked ? "account-status account-status--revoked" : "account-status"}>
                  {revoked ? "Доступ відкликано" : account.authId ? "Підключено" : "Очікує входу"}
                </span>
                {canManageAccount && <div className="account-action-buttons">
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={actionLabel + " для " + account.name}
                    onClick={() => openModal({kind:"account-access",account})}
                  >
                    {actionLabel}
                  </button>
                  {data.permissions.canManageAdmins && account.role !== "admin" && (
                    <button
                      type="button"
                      className="button secondary account-icon-button"
                      aria-label={"Надати роль адміністратора для " + account.name}
                      title="Надати роль адміністратора"
                      onClick={() => openModal({kind:"account-promote",account})}
                    >
                      <ShieldPlus size={16} aria-hidden="true"/>
                    </button>
                  )}
                  <button
                    type="button"
                    className="button secondary account-icon-button account-delete-button"
                    aria-label={"Видалити користувача " + account.name}
                    title="Видалити користувача"
                    onClick={() => openModal({kind:"account-delete",account})}
                  >
                    <Trash2 size={16} aria-hidden="true"/>
                  </button>
                </div>}
              </div>
            </div>
          );
        })}
      </div><p className="settings-note"><ShieldCheck size={17}/>Після відновлення доступу користувач може знову увійти з тією самою поштою.</p></section><section className="panel quick-actions"><h2>Навчальні дані</h2><p className="muted">Налаштування структури журналу</p><button onClick={()=>openModal({kind:"subject"})}><span className="square-icon"><BookOpen size={19}/></span><span><strong>Додати предмет</strong><small>До навчальної групи</small></span><Plus size={17}/></button><button onClick={()=>openModal({kind:"assignment"})}><span className="square-icon"><GraduationCap size={19}/></span><span><strong>Призначити викладача</strong><small>Група та навчальний предмет</small></span><ArrowUpRight size={17}/></button><button onClick={()=>openModal({kind:"group"})}><span className="square-icon"><Users size={19}/></span><span><strong>Додати групу</strong><small>Курс і спеціальність</small></span><Plus size={17}/></button></section><section className="panel audit-panel"><div className="panel-heading"><div><h2>Історія змін</h2><p>Останні збережені дії у журналі</p></div><Clock3 size={18}/></div>{data.audit.map(a=><div className="audit-row" key={a.id}><span className="audit-dot"/><div><strong>{a.message}</strong><small>{a.actor} · {new Date(a.createdAt).toLocaleString("uk-UA",{timeZone:"Europe/Kyiv",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div></div>)}</section></div>}
      <footer className="page-footer"><span className="college-footer"><a href="https://itcollege.lviv.ua/" target="_blank" rel="noreferrer">ІТ коледж Львівської політехніки <ArrowUpRight size={11}/></a><b>·</b>Електронний журнал</span><span><span className="live-dot"/>Навчальний простір · 2026</span></footer>
      </div>
    </main>
    {toast&&<div className="toast" role="status"><CheckCheck size={18}/>{toast}<button aria-label="Закрити повідомлення" onClick={()=>setToast("")}><X size={15}/></button></div>}
    {studentDetail&&<Dialog title={studentDetail.name} subtitle={group?.name+" · Успішність за всіма предметами"} onClose={()=>setStudentDetail(null)}><div className="student-summary">{data.subjects.filter(s=>data.assignments.some(a=>a.groupId===studentDetail.groupId&&a.subjectId===s.id)).map(s=>{const ids=data.lessons.filter(l=>l.subjectId===s.id&&l.groupId===studentDetail.groupId).map(l=>l.id);const rows=data.records.filter(r=>r.studentId===studentDetail.id&&ids.includes(r.lessonId));return <div key={s.id}><span><strong>{s.title}</strong><small>{s.teacherName}</small></span><strong>{format(mean(rows))}</strong></div>;})}</div><p className="modal-hint">Середній бал обчислюється лише за виставленими оцінками. Порожні клітинки не враховуються.</p></Dialog>}
    {modal&&<Editor key={modal.kind==="mark"?modal.student.id+":"+modal.lesson.id:modal.kind} modal={modal} data={data} groupId={groupId} subjectId={subjectId} today={today} error={formError} saving={saving} onClose={()=>setModal(null)} onSubmit={mutate} onMarkTargetChange={openMarkEditor}/>}
  </div>;
}

function Stat({icon,label,value,suffix,note,color}:{icon:ReactNode;label:string;value:string;suffix?:string;note:string;color:string}){return <article className="stat-card"><span className={"stat-icon "+color}>{icon}</span><div><span className="stat-label">{label}</span><div className="stat-value">{value}<small>{suffix}</small></div><p>{note}</p></div></article>;}
function Empty({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <div className="empty-state">{icon}<strong>{title}</strong><p>{text}</p></div>;}
function Dialog({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
 return <dialog className="modal" ref={ref} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-head"><div><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="icon-button" aria-label="Закрити вікно" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
function Editor({modal,data,groupId,subjectId,today,error,saving,onClose,onSubmit,onMarkTargetChange}:{modal:NonNullable<Modal>;data:JournalData;groupId:string;subjectId:string;today:string;error:string;saving:boolean;onClose:()=>void;onSubmit:(body:Record<string,unknown>)=>Promise<boolean>;onMarkTargetChange:(studentId:string,lessonId:string)=>void}){
 const [grade,setGrade]=useState(modal.kind==="mark"?modal.mark?.grade??null:null);
 const [attendance,setAttendance]=useState<Mark["attendance"]>(modal.kind==="mark"?modal.mark?.attendance??null:null);
 const [accountRole,setAccountRole]=useState("teacher");
 const [accountStudent,setAccountStudent]=useState(data.students[0]?.id||"");
 const m=modal.kind==="lesson"?modal.lesson:undefined;
 const deletingAccount=modal.kind==="account-delete";
 const confirmingAccount=modal.kind==="account-access"||deletingAccount||modal.kind==="account-promote";
 const titles={mark:"Виставити оцінку",lesson:m?"Редагувати заняття":"Нове заняття",student:"Додати студента",group:"Нова навчальна група",subject:"Додати навчальний предмет",account:"Надати доступ",assignment:"Призначити викладача",
   "account-access":modal.kind==="account-access"&&modal.account.accessRevoked ? "Відновити доступ" : "Відкликати доступ",
   "account-delete":"Видалити користувача",
   "account-promote":"Надати роль адміністратора"
 };
 async function submit(e:FormEvent<HTMLFormElement>) {
   e.preventDefault();
   if (modal.kind==="account-access") {
     await onSubmit({action:modal.kind,userId:modal.account.id,revoked:!modal.account.accessRevoked});
     return;
   }
   if (confirmingAccount) {
     await onSubmit({action:modal.kind,userId:modal.account.id});
     return;
   }
   const values=Object.fromEntries(new FormData(e.currentTarget).entries());
   let payload:Record<string,unknown>={action:modal.kind,...values};
   if(modal.kind==="mark")payload={...payload,lessonId:modal.lesson.id,studentId:modal.student.id,grade,attendance};
   if(modal.kind==="lesson")payload={...payload,id:m?.id,groupId,subjectId,number:Number(values.number)};
   if(modal.kind==="group")payload.course=Number(values.course);
   await onSubmit(payload);
 }
 return <Dialog title={titles[modal.kind]} subtitle={confirmingAccount?modal.account.name+" · "+modal.account.email:modal.kind==="mark"?`${modal.student.name} · ${dates(modal.lesson.date)}`:modal.kind==="lesson"?`${data.groups.find(g=>g.id===groupId)?.name} · ${data.subjects.find(s=>s.id===subjectId)?.title}`:undefined} onClose={()=>{if(!saving)onClose();}}><form onSubmit={submit} className="editor-form">
  {modal.kind==="mark"&&<><div className="mark-targets"><Field label="Студент"><select aria-label="Студент для оцінювання" value={modal.student.id} onChange={e=>onMarkTargetChange(e.target.value,modal.lesson.id)}>{data.students.filter(s=>s.groupId===modal.lesson.groupId).sort((a,b)=>a.name.localeCompare(b.name,"uk")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Заняття"><select aria-label="Заняття для оцінювання" value={modal.lesson.id} onChange={e=>onMarkTargetChange(modal.student.id,e.target.value)}>{data.lessons.filter(l=>l.groupId===modal.lesson.groupId&&l.subjectId===modal.lesson.subjectId&&l.date.startsWith(modal.lesson.date.slice(0,7))&&l.date<=today).map(l=><option key={l.id} value={l.id}>{dates(l.date)} · {l.number} пара · {l.topic}</option>)}</select></Field></div><label className="form-label">Оцінка <span>12-бальна шкала</span></label><div className="grade-picker">{Array.from({length:12},(_,i)=>i+1).map(n=><button type="button" className={grade===n?"chosen":""} key={n} onClick={()=>{setGrade(grade===n?null:n);if(attendance==="absent"||attendance==="excused"||!attendance)setAttendance("present");}}>{n}</button>)}</div><label className="form-label">Відвідування</label><div className="attendance-picker">{([["present","Присутній"],["absent","Відсутній"],["excused","Поважна причина"]] as const).map(([v,label])=><button type="button" key={v} className={attendance===v?"chosen":""} onClick={()=>{setAttendance(attendance===v?null:v);if(v!=="present")setGrade(null);}}>{label}</button>)}</div><Field label="Коментар"><textarea name="note" maxLength={500} defaultValue={modal.mark?.note||""} placeholder="За потреби: уточнення або коментар" rows={2}/></Field><button className="text-button clear-mark" type="button" onClick={()=>{setGrade(null);setAttendance(null);const form=document.querySelector<HTMLFormElement>(".editor-form");const note=form?.elements.namedItem("note") as HTMLTextAreaElement|null;if(note)note.value="";}}>Очистити оцінку й відмітку</button></>}
  {modal.kind==="lesson"&&<><div className="form-row"><Field label="Дата"><input name="date" type="date" required defaultValue={m?.date||today}/></Field><Field label="Номер пари"><select name="number" defaultValue={m?.number||2}>{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{i+1} пара</option>)}</select></Field></div><Field label="Тип заняття"><select name="type" defaultValue={m?.type||"Лекція"}>{["Лекція","Практична","Лабораторна","Контрольна","Семінар"].map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Тема заняття"><textarea name="topic" required maxLength={400} defaultValue={m?.topic||""} rows={2} placeholder="Наприклад, налаштування локальної мережі"/></Field><Field label="Домашнє завдання"><textarea name="homework" maxLength={2000} defaultValue={m?.homework||""} rows={3} placeholder="Що потрібно підготувати до наступного заняття"/></Field></>}
  {modal.kind==="group"&&<><Field label="Назва групи"><input required name="name" maxLength={30} placeholder="Наприклад, МТ-41"/></Field><Field label="Курс"><select name="course" defaultValue="1">{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} курс</option>)}</select></Field><Field label="Спеціальність"><input required name="specialty" maxLength={200} placeholder="Мережні технології та Інтернет речей"/></Field></>}
  {modal.kind==="student"&&<><Field label="Прізвище та ім’я"><input required name="name" maxLength={150} placeholder="Петренко Олександр"/></Field><Field label="Навчальна група"><GroupSelect data={data} groupId={groupId}/></Field><Field label="Електронна пошта (необов’язково)"><input type="email" name="email" maxLength={200} placeholder="student@college.edu.ua"/></Field></>}
  {modal.kind==="subject"&&<><Field label="Назва предмета"><input name="title" required maxLength={150} placeholder="Наприклад, комп’ютерні мережі"/></Field><Field label="ПІБ викладача"><input name="teacherName" required maxLength={150}/></Field><Field label="Додати до групи"><GroupSelect data={data} groupId={groupId}/></Field></>}
  {modal.kind==="account"&&<>
    <Field label="Роль у системі">
      <select name="role" value={accountRole} onChange={e=>setAccountRole(e.target.value)}>
        <option value="teacher">Викладач</option>
        <option value="student">Студент</option>
        {data.permissions.canManageAdmins&&<option value="admin">Адміністратор</option>}
      </select>
    </Field>
    {accountRole==="student"&&<Field label="Прив’язати до студента"><select name="studentId" required value={accountStudent} onChange={e=>setAccountStudent(e.target.value)}>{data.students.map(s=><option key={s.id} value={s.id}>{s.name} · {data.groups.find(g=>g.id===s.groupId)?.name}</option>)}</select></Field>}
    <Field label="Прізвище та ім’я"><input name="name" required maxLength={150} key={accountRole+accountStudent} defaultValue={accountRole==="student"?data.students.find(s=>s.id===accountStudent)?.name:""}/></Field>
    <Field label="Електронна пошта облікового запису"><input name="email" type="email" required maxLength={200} placeholder="name@college.edu.ua"/></Field>
    <p className="modal-hint">
      Користувач входить із цією адресою та персональним кодом доступу.
      {accountRole==="teacher"&&" Для викладача також призначте групу та предмет."}
      {accountRole==="admin"&&" Адміністратор зможе керувати журналом і доступом викладачів та студентів."}
    </p>
  </>}
  {modal.kind==="account-access"&&(
    <p className="modal-hint">
      {modal.account.accessRevoked
        ? "Користувач знову отримає доступ до свого кабінету."
        : "Користувач втратить доступ до свого кабінету. Його оцінки, заняття та призначення збережуться."}
    </p>
  )}
  {deletingAccount&&(
    <p className="modal-hint">
      Обліковий запис зникне зі списку, а користувач втратить доступ до журналу.
      {data.assignments.some(a=>a.teacherId===modal.account.id)&&" Призначення користувача будуть зняті."}
      {modal.account.studentId&&" Навчальний запис студента залишиться в групі."}
      {" "}Історія оцінок, відвідування та занять збережеться.
    </p>
  )}
  {modal.kind==="account-promote"&&(
    <p className="modal-hint">
      Користувач зможе керувати всіма журналами й доступом викладачів та студентів.
      {modal.account.accessRevoked ? " Щоб користувач міг увійти, окремо відновіть йому доступ." : ""}
    </p>
  )}
  {modal.kind==="assignment"&&<><Field label="Навчальна група"><GroupSelect data={data} groupId={groupId}/></Field><Field label="Предмет"><select name="subjectId" required defaultValue={subjectId}>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field><Field label="Викладач"><select name="teacherId" defaultValue=""><option value="">Без призначення</option>{data.users.filter(u=>u.role==="teacher"&&!u.accessRevoked).map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></Field><p className="modal-hint">Викладач зможе оцінювати студентів і редагувати заняття лише в призначеному журналі.</p></>}
  {error&&<div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
  <div className="modal-actions">
    <button className="button secondary" type="button" disabled={saving} onClick={onClose}>Скасувати</button>
    <button className={deletingAccount?"button danger":"button primary"} type="submit" disabled={saving}>
      {saving?<LoaderCircle size={16} className="spin"/>:deletingAccount?<Trash2 size={16}/>:<Check size={16}/>}
      <span>{confirmingAccount?titles[modal.kind]:"Зберегти"}</span>
    </button>
  </div>
 </form></Dialog>;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>;}
function GroupSelect({data,groupId}:{data:JournalData;groupId:string}){return <select name="groupId" required defaultValue={groupId}>{data.groups.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select>;}
