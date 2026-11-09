import { env } from "cloudflare:workers";
import { getJournalUser } from "../../lib/session";
import { demoAccountEmails, seedDemo } from "../../lib/seed";
import { roleLabels, type User, type Group, type Student, type Subject, type Assignment, type Lesson, type Mark, type Audit, type Role } from "../../lib/types";
import { required, optional, gradeValue, attendanceValue, dateValue, intValue, emailValue, InputError } from "../../lib/validation";

import { classroomScope, CourseworkError, readCoursework, recentSubjectTasks, writeCoursework } from "../../lib/coursework-server";

export const dynamic = "force-dynamic";
class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
const db=()=>{if(!env.DB)throw new HttpError(503,"База даних ще недоступна. Спробуйте пізніше.");return env.DB;};
const all=async<T>(sql:string,...args:unknown[]) => (await db().prepare(sql).bind(...args).all<T>()).results;
const one=async<T>(sql:string,...args:unknown[]) => db().prepare(sql).bind(...args).first<T>();
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
async function actor(request:Request):Promise<{account:User;ownerId:string}> {
  const auth=await getJournalUser(request);
  if(!auth)throw new HttpError(401,"Увійдіть, щоб відкрити журнал.");
  if(auth.isOwner) {
    await db().prepare("INSERT OR IGNORE INTO settings(key,value) VALUES ('owner',?)").bind(auth.userId).run();
  }
  const ownerId=(await one<{value:string}>("SELECT value FROM settings WHERE key='owner'"))?.value??"";
  if(ownerId===auth.userId) {
    await db().prepare("INSERT OR IGNORE INTO users(id,authId,email,name,role) VALUES (?,?,?,?, 'admin')").bind(auth.userId,auth.userId,auth.email.toLowerCase(),auth.displayName).run();
    await seedDemo(db());
  }
  let u=await one<User>("SELECT * FROM users WHERE authId=?",auth.userId);
  if(!u) {
    const pending=await one<User>("SELECT * FROM users WHERE email=? AND authId IS NULL",auth.email.toLowerCase());
    if (pending) {
      checkAccountAccess(pending);
      await db().prepare("UPDATE users SET authId=? WHERE id=? AND authId IS NULL AND accessRevoked=0")
        .bind(auth.userId,pending.id).run();
      u=await one<User>("SELECT * FROM users WHERE authId=?",auth.userId);
    }
  }
  if(!u)throw new HttpError(403,"Вашому обліковому запису ще не надано доступ. Зверніться до адміністратора журналу.");
  checkAccountAccess(u);
  return {account:u,ownerId};
}
function checkAccountAccess(user:User) {
  if (user.accessRevoked) {
    throw new HttpError(403,"Доступ до журналу відкликано. Зверніться до адміністратора.");
  }
}
async function roleContext(request:Request,account:User):Promise<{effective:User;mode:"teacher"|"student"|null;readOnly:boolean}> {
  const requested=new URL(request.url).searchParams.get("view");
  // Only an authenticated administrator can enter another role's cabinet.
  // GET and POST resolve the same principal, so teacher writes still pass canTeach.
  if(account.role!=="admin"||!requested)return {effective:account,mode:null,readOnly:account.role==="student"};
  if(requested!=="teacher"&&requested!=="student")throw new HttpError(400,"Невідомий режим журналу.");
  const effective=await one<User>("SELECT * FROM users WHERE email=? AND role=?",demoAccountEmails[requested],requested);
  if(!effective)throw new HttpError(404,"Демонстраційний обліковий запис для цього кабінету не знайдено.");
  checkAccountAccess(effective);
  return {effective,mode:requested,readOnly:requested==="student"};
}
async function canTeach(user:User,groupId:string,subjectId:string) {
  if(user.role==="admin")return;
  if(user.role!=="teacher"||!await one("SELECT id FROM assignments WHERE groupId=? AND subjectId=? AND teacherId=?",groupId,subjectId,user.id))throw new HttpError(403,"Недостатньо прав для редагування цього журналу.");
}
async function log(user:User,message:string):Promise<D1PreparedStatement> {return db().prepare("INSERT INTO auditLogs(id,actor,message,createdAt) VALUES (?,?,?,?)").bind(crypto.randomUUID(),user.name,message,new Date().toISOString());}
function handle(error:unknown) {
  if(error instanceof HttpError||error instanceof CourseworkError)return json({error:error.message},error.status);
  if(error instanceof InputError)return json({error:error.message},400);
  const message=String(error);
  if(message.includes("UNIQUE constraint"))return json({error:"Такий запис уже існує. Перевірте групу, дату або електронну пошту."},409);
  console.error("Journal API error",error);
  return json({error:"Не вдалося зберегти дані. Спробуйте ще раз."},500);
}
export async function GET(request:Request) {
  try {
    const {account:user,ownerId}=await actor(request);
    const {effective,mode,readOnly}=await roleContext(request,user);
    const url = new URL(request.url);
    const classroomAction = url.searchParams.get("classroom");
    if (classroomAction === "subject-tasks") return json({ items: await recentSubjectTasks(db(), effective, url) });
    if (classroomAction) {
      const scope = await classroomScope(db(), env.BUCKET, effective, url, mode);
      return await readCoursework(scope, classroomAction, url);
    }
    const preview=mode==="student";
    let [groups,students,subjects,assignments,lessons,records]=await Promise.all([
      all<Group>("SELECT * FROM groups ORDER BY name"),all<Student>("SELECT * FROM students WHERE archived=0 ORDER BY name"),
      all<Subject>("SELECT * FROM subjects ORDER BY title"),all<Assignment>("SELECT * FROM assignments"),
      all<Lesson>("SELECT * FROM lessons ORDER BY date,number"),all<Mark>("SELECT * FROM records"),
    ]);
    if(effective.role==="teacher") {
      assignments=assignments.filter(a=>a.teacherId===effective.id);
      groups=groups.filter(g=>assignments.some(a=>a.groupId===g.id));
      subjects=subjects.filter(s=>assignments.some(a=>a.subjectId===s.id));
      students=students.filter(s=>groups.some(g=>g.id===s.groupId));
      lessons=lessons.filter(l=>assignments.some(a=>a.groupId===l.groupId&&a.subjectId===l.subjectId));
      records=records.filter(r=>lessons.some(l=>l.id===r.lessonId));
    }
    if(effective.role==="student") {
      students=students.filter(s=>s.id===effective.studentId);
      groups=groups.filter(g=>students.some(s=>s.groupId===g.id));
      assignments=assignments.filter(a=>groups.some(g=>g.id===a.groupId));
      subjects=subjects.filter(s=>assignments.some(a=>a.subjectId===s.id));
      lessons=lessons.filter(l=>groups.some(g=>g.id===l.groupId));
      records=records.filter(r=>r.studentId===effective.studentId);
    }
    const isAdmin=effective.role==="admin";
    const users=isAdmin?await all<User>("SELECT id,name,email,role,studentId,authId,accessRevoked FROM users ORDER BY role,name"):[];
    const audit=isAdmin?await all<Audit>("SELECT * FROM auditLogs ORDER BY createdAt DESC LIMIT 16"):[];
    return json({user:{id:user.id,name:user.name,email:user.email,role:user.role,studentId:user.studentId},activeUser:{id:effective.id,name:effective.name,role:effective.role},role:effective.role,mode,preview,permissions:{canGrade:!readOnly&&(effective.role==="admin"||effective.role==="teacher"),canManage:!readOnly&&isAdmin,canManageAdmins:isAdmin&&user.id===ownerId},groups,students:students.map(s=>effective.role==="student"?s:{...s,email:isAdmin?s.email:null}),subjects,assignments,lessons,records,users:users.map(u=>({...u,isOwner:u.id===ownerId,authId:u.authId?"connected":null})),audit});
  }catch(error){return handle(error);}
}
export async function POST(request:Request) {
  try {
    const url = new URL(request.url);
    const classroomAction = url.searchParams.get("classroom");
    const origin=request.headers.get("origin");
    if(origin&&origin!==url.origin)throw new HttpError(403,"Неприпустиме джерело запиту.");
    if(!classroomAction&&!request.headers.get("content-type")?.includes("application/json"))throw new HttpError(415,"Потрібен JSON-запит.");
    const {account,ownerId}=await actor(request);
    const {effective:user,mode,readOnly}=await roleContext(request,account);
    const auditActor=mode==="teacher"?{...account,name:`${account.name} · кабінет викладача ${user.name}`}:account;
    if (classroomAction) {
      const scope = await classroomScope(db(), env.BUCKET, user, url, mode);
      return await writeCoursework(scope, classroomAction, url, request, auditActor.name);
    }
    if(readOnly)throw new HttpError(403,"Кабінет студента доступний лише для читання.");
    let body:Record<string,unknown>;
    try {body=await request.json();}catch{throw new InputError("Некоректний JSON.");}
    if(!body||Array.isArray(body)||typeof body!=="object")throw new InputError("Некоректний запит.");
    const action=required(body.action,"Дія",40);
    const id=crypto.randomUUID();
    const now=new Date().toISOString();
    const batch=async(q:D1PreparedStatement,message:string)=>db().batch([q,await log(auditActor,message)]);
    if(action==="mark") {
      const lesson=await one<Lesson>("SELECT * FROM lessons WHERE id=?",required(body.lessonId,"Заняття"));
      const student=await one<Student>("SELECT * FROM students WHERE id=? AND archived=0",required(body.studentId,"Студент"));
      if(!lesson||!student||lesson.groupId!==student.groupId)throw new InputError("Студент і заняття мають належати до однієї групи.");
      await canTeach(user,lesson.groupId,lesson.subjectId);
      if(lesson.date>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Kyiv",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))throw new InputError("Оцінювання майбутніх занять ще недоступне.");
      const grade=gradeValue(body.grade),attendance=attendanceValue(body.attendance),note=optional(body.note,500);
      if(grade!==null&&(attendance==="absent"||attendance==="excused"))throw new InputError("Для відсутнього студента оцінка має бути порожньою.");
      if(grade===null&&attendance===null&&!note) {
        await batch(db().prepare("DELETE FROM records WHERE lessonId=? AND studentId=?").bind(lesson.id,student.id),`Очищено запис: ${student.name}, ${lesson.date}`);
      }else await batch(db().prepare("INSERT INTO records(id,lessonId,studentId,grade,attendance,note,updatedAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(studentId,lessonId) DO UPDATE SET grade=excluded.grade,attendance=excluded.attendance,note=excluded.note,updatedAt=excluded.updatedAt").bind(id,lesson.id,student.id,grade,attendance,note,now),`Оновлено запис: ${student.name}, ${lesson.date}`);
      return json({ok:true});
    }
    if(action==="lesson") {
      const groupId=required(body.groupId,"Група"),subjectId=required(body.subjectId,"Предмет");
      await canTeach(user,groupId,subjectId);
      if(!await one("SELECT id FROM assignments WHERE groupId=? AND subjectId=?",groupId,subjectId))throw new InputError("Предмет не додано до цієї групи.");
      const date=dateValue(body.date),number=intValue(body.number,1,8,"Номер пари"),topic=required(body.topic,"Тема заняття",400),homework=optional(body.homework,2000),type=required(body.type,"Тип заняття",30);
      if(!["Лекція","Практична","Лабораторна","Контрольна","Семінар"].includes(type))throw new InputError("Невідомий тип заняття.");
      const existing=body.id?await one<Lesson>("SELECT * FROM lessons WHERE id=?",required(body.id,"Заняття")):null;
      if(body.id&&(!existing||existing.groupId!==groupId||existing.subjectId!==subjectId))throw new InputError("Заняття не знайдено в цьому журналі.");
      const stmt=existing?db().prepare("UPDATE lessons SET date=?,number=?,type=?,topic=?,homework=? WHERE id=?").bind(date,number,type,topic,homework,existing.id):db().prepare("INSERT INTO lessons(id,groupId,subjectId,date,number,type,topic,homework) VALUES (?,?,?,?,?,?,?,?)").bind(id,groupId,subjectId,date,number,type,topic,homework);
      await batch(stmt,`${existing?"Оновлено":"Додано"} заняття: ${topic}`);
      return json({ok:true,id:existing?.id||id});
    }
    if(user.role!=="admin")throw new HttpError(403,"Дія доступна лише адміністратору.");
    const isOwner=account.id===ownerId;
    if(action==="group") {
      const name=required(body.name,"Назва групи",30),course=intValue(body.course,1,6,"Курс"),specialty=required(body.specialty,"Спеціальність",200);
      await batch(db().prepare("INSERT INTO groups(id,name,course,specialty) VALUES (?,?,?,?)").bind(id,name,course,specialty),`Додано групу ${name}`);
    }else if(action==="student") {
      const name=required(body.name,"ПІБ",150),groupId=required(body.groupId,"Група"),email=body.email?emailValue(body.email):null;
      if(!await one("SELECT id FROM groups WHERE id=?",groupId))throw new InputError("Групу не знайдено.");
      await batch(db().prepare("INSERT INTO students(id,groupId,name,email) VALUES (?,?,?,?)").bind(id,groupId,name,email),`Додано студента ${name}`);
    }else if(action==="subject") {
      const title=required(body.title,"Предмет",150),teacherName=required(body.teacherName,"Викладач",150),groupId=required(body.groupId,"Група");
      if(!await one("SELECT id FROM groups WHERE id=?",groupId))throw new InputError("Групу не знайдено.");
      await db().batch([db().prepare("INSERT INTO subjects(id,title,teacherName) VALUES (?,?,?)").bind(id,title,teacherName),db().prepare("INSERT INTO assignments(id,groupId,subjectId) VALUES (?,?,?)").bind(crypto.randomUUID(),groupId,id),await log(auditActor,`Додано предмет ${title}`)]);
    }else if(action==="account") {
      const name=required(body.name,"ПІБ",150),email=emailValue(body.email),role=required(body.role,"Роль",20) as Role;
      if(!["teacher","student","admin"].includes(role))throw new InputError("Оберіть роль користувача.");
      if(role==="admin"&&!isOwner)throw new HttpError(403,"Роль адміністратора може надавати лише власник журналу.");
      const studentId=role==="student"?required(body.studentId,"Студент"):null;
      if(studentId&&!await one("SELECT id FROM students WHERE id=? AND archived=0",studentId))throw new InputError("Студента не знайдено.");
      await batch(db().prepare("INSERT INTO users(id,email,name,role,studentId) VALUES (?,?,?,?,?)").bind(id,email,name,role,studentId),`Надано роль «${roleLabels[role]}»: ${name}`);
    }else if(action==="account-promote") {
      if(!isOwner)throw new HttpError(403,"Роль адміністратора може надавати лише власник журналу.");
      const userId=required(body.userId,"Обліковий запис");
      if(!await one("SELECT id FROM users WHERE id=?",userId))throw new HttpError(404,"Обліковий запис не знайдено.");

      const promotableAccount="id=? AND role IN ('teacher','student')";
      await db().batch([
        db().prepare(`INSERT INTO auditLogs(id,actor,message,createdAt)
          SELECT ?,?, 'Надано роль «Адміністратор»: ' || name,? FROM users WHERE ${promotableAccount}`)
          .bind(id,auditActor.name,now,userId),
        db().prepare(`UPDATE users SET role='admin' WHERE ${promotableAccount}`).bind(userId),
      ]);
      return json({ok:true,id:userId});
    }else if(action==="account-access"||action==="account-delete") {
      const userId=required(body.userId,"Обліковий запис");
      if(action==="account-access"&&typeof body.revoked!=="boolean")throw new InputError("Укажіть стан доступу.");
      const target=await one<Pick<User,"role"|"name">>("SELECT role,name FROM users WHERE id=?",userId);
      if(!target) {
        if(action==="account-delete")return json({ok:true,id:userId});
        throw new HttpError(404,"Обліковий запис не знайдено.");
      }
      if(userId===ownerId)throw new HttpError(403,"Обліковий запис власника журналу захищено.");
      if(target.role==="admin"&&!isOwner)throw new HttpError(403,"Доступом адміністраторів керує власник журналу.");

      // Apply the same authority check at write time in case the target was just promoted.
      const manageableAccount="id=? AND id<>? AND (role<>'admin' OR ?=1)";
      const targetArgs=[userId,ownerId,Number(isOwner)];
      if(action==="account-delete") {
        // Detach the account while preserving its group and subject journals.
        await db().batch([
          db().prepare(`UPDATE assignments SET teacherId=NULL
            WHERE teacherId IN (SELECT id FROM users WHERE ${manageableAccount})`).bind(...targetArgs),
          db().prepare(`INSERT INTO auditLogs(id,actor,message,createdAt)
            SELECT ?,?, 'Видалено обліковий запис: ' || name,? FROM users WHERE ${manageableAccount}`)
            .bind(id,auditActor.name,now,...targetArgs),
          db().prepare(`DELETE FROM users WHERE ${manageableAccount}`).bind(...targetArgs),
        ]);
      }else{
        const revoked=body.revoked ? 1 : 0;
        const message=`${revoked ? "Відкликано" : "Відновлено"} доступ до журналу для ${target.name}`;
        const needsUpdate=`${manageableAccount} AND accessRevoked<>?`;
        await db().batch([
          db().prepare(`INSERT INTO auditLogs(id,actor,message,createdAt)
            SELECT ?,?,?,? FROM users WHERE ${needsUpdate}`).bind(id,auditActor.name,message,now,...targetArgs,revoked),
          db().prepare(`UPDATE users SET accessRevoked=? WHERE ${needsUpdate}`).bind(revoked,...targetArgs,revoked),
        ]);
      }
      return json({ok:true,id:userId});
    }else if(action==="assignment") {
      const groupId=required(body.groupId,"Група"),subjectId=required(body.subjectId,"Предмет"),teacherId=body.teacherId?required(body.teacherId,"Викладач"):null;
      if(!await one("SELECT id FROM groups WHERE id=?",groupId)||!await one("SELECT id FROM subjects WHERE id=?",subjectId))throw new InputError("Групу або предмет не знайдено.");
      if(teacherId&&!await one("SELECT id FROM users WHERE id=? AND role='teacher' AND accessRevoked=0",teacherId))throw new InputError("Оберіть викладача з активним доступом.");
      await batch(db().prepare("INSERT INTO assignments(id,groupId,subjectId,teacherId) VALUES (?,?,?,?) ON CONFLICT(groupId,subjectId) DO UPDATE SET teacherId=excluded.teacherId").bind(id,groupId,subjectId,teacherId),"Оновлено призначення викладача до журналу");
    }else throw new InputError("Невідома дія.");
    return json({ok:true,id});
  }catch(error){return handle(error);}
}
