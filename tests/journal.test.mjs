import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { gradeValue, dateValue, attendanceValue } from '../app/lib/validation.ts';
import { csvCell, mean, attendancePercent } from '../app/lib/types.ts';

// Exercise the actual route with an isolated SQLite database and test identity.
// These adapters are bundled only in this test; they are not application routes.
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
const migrations=new URL('../drizzle/',import.meta.url);
for (const file of (await readdir(migrations)).filter(file=>file.endsWith('.sql')).sort()) {
 sqlite.exec(await readFile(new URL(file,migrations),'utf8'));
}
class Query {
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Query(this.sql,args);}
  async first(){return sqlite.prepare(this.sql).get(...this.args)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.args),success:true};}
  async run(){const result=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}
}
globalThis.__journalTestEnv={DB:{prepare(sql){return new Query(sql);},async batch(queries){sqlite.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
const classroomFiles = new Map();
globalThis.__journalTestEnv.BUCKET = {
  async put(key, bytes) { classroomFiles.set(key, bytes); },
  async get(key) { return classroomFiles.has(key) ? { body: classroomFiles.get(key) } : null; },
  async delete(key) { classroomFiles.delete(key); },
};
const bundled=await build({entryPoints:[new URL('../app/api/journal/route.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'test-adapters',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onResolve({filter:/\/session$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},({path})=>({contents:path==='env'?'export const env=globalThis.__journalTestEnv;':'export async function getJournalUser(){return globalThis.__journalTestUser;}',loader:'js'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const identity=(id,email=id+'@example.test')=>({userId:id,email,displayName:id,isOwner:id==="owner"});
const owner=identity('owner');
async function get(user=owner,query=''){globalThis.__journalTestUser=user;const response=await api.GET(new Request('https://journal.test/api/journal'+query));return {status:response.status,data:await response.json()};}
async function post(body,user=owner,query='',origin='https://journal.test'){globalThis.__journalTestUser=user;const response=await api.POST(new Request('https://journal.test/api/journal'+query,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}

test('Validation rejects invalid grades and calendar dates; empty marks are excluded from averages',()=>{
 for(const n of [0,13,3.5,'10',NaN])assert.throws(()=>gradeValue(n));
 assert.equal(gradeValue(12),12);assert.equal(gradeValue(''),null);
 assert.throws(()=>dateValue('2026-02-30'));assert.equal(dateValue('2028-02-29'),'2028-02-29');
 assert.throws(()=>attendanceValue('unknown'));
 assert.equal(mean([{grade:12},{grade:null},{grade:6}]),9);
 assert.equal(attendancePercent([{attendance:'present'},{attendance:'absent'},{attendance:null}]),50);
 assert.equal(csvCell('=1+1'),'"\'=1+1"');
 assert.equal(csvCell('текст "цитата"'),'"текст ""цитата"""');
});
test('Anonymous access is denied; first owner receives the admin role and seed is idempotent',async()=>{
 assert.equal((await get(null)).status,401);
 const a=await get();assert.equal(a.status,200);assert.equal(a.data.role,'admin');
 assert.equal(a.data.groups.length,3);assert.equal(a.data.students.length,21);assert.equal(a.data.lessons.length,48);
 const b=await get();assert.equal(a.data.records.length,b.data.records.length);
 assert.equal((await get(identity('outsider'))).status,403);
});
test('Grades persist, clearing removes the record, and absence cannot carry a grade',async()=>{
 const cell={action:'mark',lessonId:'g1-sub1-l0',studentId:'s1'};
 assert.equal((await post({...cell,grade:12,attendance:'present',note:'Добре'})).status,200);
 let d=(await get()).data;assert.equal(d.records.find(r=>r.lessonId===cell.lessonId&&r.studentId==='s1').grade,12);
 assert.equal((await post({...cell,grade:10,attendance:'absent'})).status,400);
 assert.equal((await post({...cell,grade:13,attendance:'present'})).status,400);
 assert.equal((await post({...cell,studentId:'k1',grade:8,attendance:'present'})).status,400);
 assert.equal((await post({...cell,lessonId:'g1-sub1-l7',grade:8,attendance:'present'})).status,400);
 assert.equal((await post({...cell,grade:null,attendance:null,note:''})).status,200);
 d=(await get()).data;assert.ok(!d.records.some(r=>r.lessonId===cell.lessonId&&r.studentId==='s1'));
});
test('Student identity can only read own records and cannot write or impersonate an admin',async()=>{
 const student=identity('actual-student','student1@example.test');const d=await get(student,'?view=teacher');
 assert.equal(d.status,200);assert.equal(d.data.role,'student');assert.equal(d.data.preview,false);
 assert.equal(d.data.students.length,1);assert.equal(d.data.students[0].id,'s1');
 assert.ok(d.data.records.every(r=>r.studentId==='s1'));assert.equal(d.data.users.length,0);assert.equal(d.data.audit.length,0);
 assert.equal((await post({action:'group',name:'Нова',course:1,specialty:'Тест'},student)).status,403);
 assert.equal((await post({action:'mark',lessonId:'g1-sub1-l0',studentId:'s1',grade:8,attendance:'present'},student)).status,403);
});
test('Teacher writes only assigned journals; student cabinet remains read-only',async()=>{
 const teacher=identity('actual-teacher','teacher@example.test');const d=await get(teacher);
 assert.equal(d.status,200);assert.equal(d.data.role,'teacher');assert.equal(d.data.subjects.length,1);
 assert.ok(d.data.lessons.every(l=>l.subjectId==='sub1'));
 assert.equal((await post({action:'mark',lessonId:'g1-sub1-l0',studentId:'s1',grade:9,attendance:'present'},teacher)).status,200);
 assert.equal((await post({action:'mark',lessonId:'g1-sub2-l0',studentId:'s1',grade:9,attendance:'present'},teacher)).status,403);
 const preview=await get(owner,'?view=student');assert.equal(preview.data.preview,true);assert.equal(preview.data.students.length,1);
 assert.equal((await post({action:'group',name:'Тест',course:1,specialty:'Тест'},owner,'?view=student')).status,403);
 assert.equal((await post({action:'group',name:'Тест',course:1,specialty:'Тест'},owner,'','https://other.test')).status,403);
});
test('Teacher cabinet saves grades after reload and keeps teacher permissions on every write',async()=>{
 const mode='?view=teacher';
 const cabinet=await get(owner,mode);
 assert.equal(cabinet.status,200);assert.equal(cabinet.data.role,'teacher');assert.equal(cabinet.data.mode,'teacher');
 assert.equal(cabinet.data.preview,false);assert.equal(cabinet.data.permissions.canGrade,true);assert.equal(cabinet.data.permissions.canManage,false);
 assert.equal(cabinet.data.activeUser.id,'demo-teacher');assert.ok(cabinet.data.lessons.every(l=>l.subjectId==='sub1'));
 const mark={action:'mark',lessonId:'g1-sub1-l2',studentId:'s2',grade:10,attendance:'present',note:'Оцінка з кабінету викладача'};
 assert.equal((await post(mark,owner,mode)).status,200);
 const reloaded=(await get(owner,mode)).data;
 const saved=reloaded.records.find(r=>r.studentId==='s2'&&r.lessonId===mark.lessonId);
 assert.equal(saved.grade,10);assert.equal(saved.note,mark.note);
 assert.equal((await post({...mark,lessonId:'g1-sub2-l2'},owner,mode)).status,403);
 assert.equal((await post({action:'group',role:'admin',name:'Forbidden',course:1,specialty:'Test'},owner,mode)).status,403);
 const studentView=(await get(owner,'?view=student')).data;assert.equal(studentView.permissions.canGrade,false);assert.equal(studentView.permissions.canManage,false);
 assert.equal((await post(mark,owner,'?view=student')).status,403);
 assert.equal((await post(mark,identity('actual-student','student1@example.test'),mode)).status,403);
 const admin=(await get(owner)).data;
 assert.equal(admin.permissions.canManage,true);assert.ok(admin.audit.some(a=>a.actor.includes('owner')&&a.actor.includes('кабінет викладача')));
 assert.equal((await get(owner,'?view=admin')).status,400);
});
test('Admin can create a connected group, student, subject, lesson and teacher assignment',async()=>{
 const group=await post({action:'group',name:'QA-11',course:1,specialty:'Тестування'});assert.equal(group.status,200);
 const subject=await post({action:'subject',title:'Тестовий предмет',teacherName:'Тестовий викладач',groupId:group.data.id});assert.equal(subject.status,200);
 assert.equal((await post({action:'student',name:'Тестовий студент',groupId:group.data.id,email:'test@example.test'})).status,200);
 const lesson={action:'lesson',groupId:group.data.id,subjectId:subject.data.id,date:'2026-11-02',number:1,type:'Практична',topic:'Тестова тема',homework:'Завдання'};
 assert.equal((await post(lesson)).status,200);assert.equal((await post(lesson)).status,409);
 assert.equal((await post({...lesson,date:'2026-02-30'})).status,400);
 assert.equal((await post({action:'assignment',groupId:group.data.id,subjectId:subject.data.id,teacherId:'demo-teacher'})).status,200);
 const teacher=(await get(identity('actual-teacher','teacher@example.test'))).data;assert.ok(teacher.lessons.some(l=>l.groupId===group.data.id));
});
test('Only administrators can revoke or restore journal access and grading rights', async()=>{
 const teacher=identity('actual-teacher','teacher@example.test');
 const revoke={action:'account-access',userId:'demo-teacher',revoked:true};
 const mark={action:'mark',lessonId:'g1-sub1-l0',studentId:'s1',grade:12,attendance:'present'};
 const before=(await get()).data;

 assert.equal((await post(revoke,teacher)).status,403);
 assert.equal((await post(revoke,owner,'?view=teacher')).status,403);
 assert.equal((await post({...revoke,userId:'owner'})).status,403);
 assert.equal((await post({...revoke,revoked:'false'})).status,400);
 assert.equal((await post(revoke)).status,200);
 assert.equal((await post(revoke)).status,200);
 assert.equal((await get(teacher)).status,403);
 assert.equal((await post(mark,teacher)).status,403);
 assert.equal((await get(owner,'?view=teacher')).status,403);

 const blocked=(await get()).data;
 const account=blocked.users.find(user=>user.id==='demo-teacher');
 assert.equal(account.accessRevoked,1);
 assert.equal(account.authId,'connected');
 assert.deepEqual(blocked.records,before.records);
 assert.deepEqual(blocked.assignments,before.assignments);
 assert.equal(blocked.audit.filter(entry=>entry.message.startsWith('Відкликано доступ до журналу')).length,1);

 assert.equal((await post({...revoke,revoked:false})).status,200);
 const restored=await get(teacher);
 assert.equal(restored.status,200);
 assert.equal(restored.data.permissions.canGrade,true);
 assert.equal((await get(owner,'?view=teacher')).status,200);
 assert.equal((await post(mark,teacher)).status,200);
});

test('Revoking access before first sign-in prevents the account from linking', async()=>{
 const email='pending-student@example.test';
 const person=identity('pending-student',email);
 const created=await post({action:'account',role:'student',name:'Тестовий студент',email,studentId:'s3'});
 assert.equal(created.status,200);
 const revoke={action:'account-access',userId:created.data.id,revoked:true};
 assert.equal((await post(revoke)).status,200);
 assert.equal((await get(person)).status,403);
 assert.equal((await get()).data.users.find(user=>user.id===revoke.userId).authId,null);
 assert.equal((await post({...revoke,revoked:false})).status,200);
 const restored=await get(person);
 assert.equal(restored.status,200);
 assert.equal(restored.data.activeUser.role,'student');
});

test('Only the owner can appoint and manage additional administrators', async()=>{
 const account={action:'account',role:'admin',name:'Адміністратор QA',email:'deputy@example.test'};
 const deputy=identity('deputy',account.email);
 const added=await post(account);
 assert.equal(added.status,200);
 const cabinet=await get(deputy);
 assert.equal(cabinet.status,200);
 assert.equal(cabinet.data.permissions.canManage,true);
 assert.equal(cabinet.data.permissions.canManageAdmins,false);
 assert.equal(cabinet.data.users.find(user=>user.id==='owner').isOwner,true);
 assert.equal((await get()).data.permissions.canManageAdmins,true);
 assert.equal((await post({...account,email:'other-admin@example.test'},deputy)).status,403);
 assert.equal((await post({action:'account-delete',userId:'owner'})).status,403);

 const email='elevated-teacher@example.test';
 const teacher=identity('elevated-teacher',email);
 const created=await post({action:'account',role:'teacher',name:'Викладач QA',email},deputy);
 assert.equal(created.status,200);
 const userId=created.data.id;
 assert.equal((await get(teacher)).data.role,'teacher');
 const promote={action:'account-promote',userId};
 const revoke={action:'account-access',userId,revoked:true};
 assert.equal((await post(promote,deputy)).status,403);
 assert.equal((await post(promote,owner,'?view=teacher')).status,403);
 assert.equal((await post(revoke,deputy)).status,200);
 assert.equal((await post(promote)).status,200);
 assert.equal((await post(promote)).status,200);
 assert.equal((await get(teacher)).status,403);
 assert.equal((await post({...revoke,revoked:false},deputy)).status,403);
 assert.equal((await post({action:'account-delete',userId},deputy)).status,403);
 assert.equal((await post({...revoke,revoked:false})).status,200);
 const promoted=await get(teacher);
 assert.equal(promoted.data.role,'admin');
 assert.equal(promoted.data.permissions.canManage,true);
 assert.equal(promoted.data.permissions.canManageAdmins,false);
 assert.equal(promoted.data.audit.filter(entry=>entry.message==='Надано роль «Адміністратор»: Викладач QA').length,1);

 assert.equal((await post(revoke)).status,200);
 assert.equal((await get(teacher)).status,403);
 assert.equal((await post({action:'account-delete',userId})).status,200);
 assert.ok(!(await get()).data.users.some(user=>user.id===userId));
});

test('Classroom shares materials by group and keeps submitted work and grades private', async()=>{
 const teacher=identity('actual-teacher','teacher@example.test');
 const student=identity('actual-student','student1@example.test');
 const second=identity('classroom-second','classroom-second@example.test');
 const otherGroup=identity('classroom-other','classroom-other@example.test');
 const addStudent=(email,studentId)=>post({action:'account',role:'student',name:'Студент QA',email,studentId});
 assert.equal((await addStudent(second.email,'s2')).status,200);
 assert.equal((await addStudent(otherGroup.email,'k1')).status,200);

 const classroom=(action,id='',subjectId='sub1',view='')=>'?' + new URLSearchParams({
   classroom:action,groupId:'g1',subjectId,...(id?{id}:{}),...(view?{view}:{})
 });
 const upload=(fields,name,contents)=>{
   const form=new FormData();
   for(const [key,value] of Object.entries(fields))form.set(key,value);
   if(name)form.set('file',new File([contents],name));
   return form;
 };
 async function send(action,body,user,id='',subjectId='sub1',view=''){
   globalThis.__journalTestUser=user;
   return api.POST(new Request('https://journal.test/api/journal'+classroom(action,id,subjectId,view),{
     method:'POST',body,headers:{Origin:'https://journal.test'}
   }));
 }
 async function download(action,id,user,view=''){
   globalThis.__journalTestUser=user;
   return api.GET(new Request('https://journal.test/api/journal'+classroom(action,id,'sub1',view)));
 }

 const lecture=()=>upload({kind:'lecture',title:'Адресація'},'Лекція.txt','Текст лекції');
 assert.equal((await send('publish',lecture(),student)).status,403);
 assert.equal((await send('publish',lecture(),teacher,'','sub2')).status,403);
 assert.equal((await send('publish',upload({kind:'lecture',title:'Порожня лекція'}),teacher)).status,400);
 assert.equal((await send('publish',lecture(),teacher)).status,200);
 assert.equal((await send('publish',upload({kind:'assignment',title:'Лабораторна',description:'Здайте звіт'}),teacher)).status,200);

 const list=await get(student,classroom('list'));
 assert.equal(list.status,200);
 assert.equal((await get(otherGroup,classroom('list'))).status,403);
 assert.equal((await get(null,classroom('list'))).status,401);
 const material=list.data.items.find(item=>item.kind==='lecture');
 const task=list.data.items.find(item=>item.kind==='assignment');
 const materialFile=await download('material',material.id,student);
 assert.equal(materialFile.status,200);
 assert.match(materialFile.headers.get('content-disposition'),/^attachment/);
 assert.equal(await materialFile.text(),'Текст лекції');

 assert.equal((await send('submit',upload({},'Звіт.txt','Моя робота'),student,task.id)).status,200);
 assert.equal((await send('submit',upload({},'Інша.txt','Повтор'),student,task.id)).status,409);
 assert.equal(classroomFiles.size,2);
 const work=(await get(teacher,classroom('list'))).data.submissions[0];
 assert.equal(work.studentName,'Бойко Андрій');
 assert.equal((await get(second,classroom('list'))).data.submissions.length,0);
 assert.equal((await download('submission',work.id,second)).status,404);
 assert.equal(await (await download('submission',work.id,teacher)).text(),'Моя робота');

 assert.equal((await post({grade:12},student,classroom('grade',work.id))).status,403);
 assert.equal((await post({grade:13},teacher,classroom('grade',work.id))).status,400);
 const savedGrade=await post({grade:10,feedback:'Перевірено'},teacher,classroom('grade',work.id));
 assert.equal(savedGrade.status,200);
 assert.deepEqual(savedGrade.data,{ok:true,grade:10,feedback:'Перевірено'});
 const updatedGrade=await post({grade:11,feedback:' Добрий звіт '},teacher,classroom('grade',work.id));
 assert.equal(updatedGrade.status,200);
 assert.deepEqual(updatedGrade.data,{ok:true,grade:11,feedback:'Добрий звіт'});
 const graded=(await get(student,classroom('list'))).data.submissions[0];
 assert.equal(graded.grade,11);
 assert.equal(graded.feedback,'Добрий звіт');

 const demoList=classroom('list','','sub1','student');
 assert.deepEqual((await get(owner,demoList)).data.submissions,[]);
 assert.equal((await download('submission',work.id,owner,'student')).status,404);
 const testWork=()=>upload({},'Демо-звіт.txt','Демонстраційна робота');
 assert.equal((await send('submit',testWork(),owner,task.id,'sub1','student')).status,200);
 assert.equal((await send('submit',testWork(),owner,task.id,'sub1','student')).status,409);
 assert.equal(classroomFiles.size,3);
 const demo=(await get(owner,demoList)).data.submissions[0];
 assert.equal(demo.isDemo,1);
 assert.equal(demo.grade,null);
 assert.notEqual(demo.id,work.id);
 assert.equal(await (await download('submission',demo.id,owner,'student')).text(),'Демонстраційна робота');
 assert.equal((await download('submission',demo.id,student,'student')).status,404);
 assert.equal((await download('submission',demo.id,teacher,'teacher')).status,404);
 assert.equal((await post({grade:12},teacher,classroom('grade',demo.id,'sub1','teacher'))).status,404);
 assert.equal((await post({grade:12},owner,classroom('grade',demo.id,'sub1','student'))).status,403);
 assert.equal((await post({grade:10},owner,classroom('grade',demo.id,'sub1','teacher'))).status,200);
 assert.equal((await get(owner,demoList)).data.submissions[0].grade,10);
 assert.equal((await get(owner,classroom('list'))).data.submissions.length,2);
 assert.deepEqual((await get(teacher,classroom('list','','sub1','teacher'))).data.submissions,[graded]);
 assert.deepEqual((await get(student,demoList)).data.submissions,[graded]);

 const overview='?classroom=subject-tasks&groupId=g1';
 for (const [day,title] of [[1,'Перше завдання'],[2,'Друге завдання'],[3,'Третє завдання']]) {
   assert.equal((await send('publish',upload({kind:'assignment',title}),owner,'','sub2')).status,200);
   sqlite.prepare("UPDATE coursework SET createdAt=? WHERE subjectId='sub2' AND title=?")
     .run('2026-11-0'+day+'T10:00:00.000Z',title);
 }
 assert.equal((await get(otherGroup,overview)).status,403);
 assert.deepEqual((await get(teacher,overview)).data.items.map(item=>item.title),['Лабораторна']);
 assert.deepEqual((await get(student,overview)).data.items.map(item=>item.title),[
   'Лабораторна','Третє завдання','Друге завдання'
 ]);
});

test('Deleting a connected teacher detaches the journals and keeps their lessons and grades', async()=>{
 const teacher=identity('actual-teacher','teacher@example.test');
 const remove={action:'account-delete',userId:'demo-teacher'};
 const before=(await get()).data;
 assert.equal((await post(remove,teacher)).status,403);
 assert.equal((await post(remove)).status,200);
 assert.equal((await post(remove)).status,200);
 assert.equal((await get(teacher)).status,403);
 assert.equal((await get(owner,'?view=teacher')).status,404);
 assert.equal((await post({action:'mark',lessonId:'g1-sub1-l0',studentId:'s1',grade:12},teacher)).status,403);
 assert.equal((await post({action:'assignment',groupId:'g1',subjectId:'sub1',teacherId:remove.userId})).status,400);

 const after=(await get()).data;
 assert.ok(!after.users.some(user=>user.id===remove.userId));
 assert.deepEqual(after.records,before.records);
 assert.deepEqual(after.lessons,before.lessons);
 assert.deepEqual(after.assignments,before.assignments.map(assignment=>({
   ...assignment,teacherId:assignment.teacherId===remove.userId?null:assignment.teacherId
 })));
 const deletedName=before.users.find(user=>user.id===remove.userId).name;
 assert.equal(after.audit.filter(entry=>entry.message==='Видалено обліковий запис: '+deletedName).length,1);

 const recreated=await post({action:'account',name:'Викладач QA',role:'teacher',email:teacher.email});
 assert.equal(recreated.status,200);
 assert.notEqual(recreated.data.id,remove.userId);
 assert.equal((await post(remove)).status,200);
 const reconnected=await get(teacher);
 assert.equal(reconnected.status,200);
 assert.equal(reconnected.data.assignments.length,0);
 assert.equal((await get(owner,'?view=teacher')).data.activeUser.id,recreated.data.id);
});

test('Deleting a revoked student account keeps the student and their results in the group', async()=>{
 const email='removed-student@example.test';
 const created=await post({action:'account',name:'Студент QA',role:'student',email,studentId:'s3'});
 assert.equal(created.status,200);
 const userId=created.data.id;
 const revoke={action:'account-access',userId,revoked:true};
 assert.equal((await post(revoke)).status,200);
 const before=(await get()).data;
 assert.equal((await post({action:'account-delete',userId},identity('deputy','deputy@example.test'))).status,200);
 assert.equal((await get(identity('removed-student',email))).status,403);
 assert.equal((await post({...revoke,revoked:false})).status,404);
 const after=(await get()).data;
 assert.ok(!after.users.some(user=>user.id===userId));
 assert.deepEqual(after.students,before.students);
 assert.deepEqual(after.records,before.records);
});

test('Database constraints reject duplicate assessment and out-of-range grade',()=>{
 const sql='INSERT INTO records(id,lessonId,studentId,grade,attendance,note,updatedAt) VALUES (?,?,?,?,?,?,?)';
 assert.throws(()=>sqlite.prepare(sql).run('bad','g1-sub1-l0','s2',99,'present','','now'));
 assert.throws(()=>sqlite.prepare(sql).run('duplicate','g1-sub1-l0','s1',8,'present','','now'));
 sqlite.close();
});
