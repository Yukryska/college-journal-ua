export type Role = "admin" | "teacher" | "student";
export type Group = {id:string;name:string;course:number;specialty:string};
export type Student = {id:string;groupId:string;name:string;email:string|null;archived:number};
export type User = {id:string;authId?:string|null;name:string;email:string;role:Role;studentId:string|null;accessRevoked?:number;isOwner?:boolean};
export type Subject = {id:string;title:string;teacherName:string};
export type Assignment = {id:string;groupId:string;subjectId:string;teacherId:string|null};
export type Lesson = {id:string;groupId:string;subjectId:string;date:string;number:number;type:string;topic:string;homework:string};
export type Mark = {id:string;lessonId:string;studentId:string;grade:number|null;attendance:"present"|"absent"|"excused"|null;note:string;updatedAt:string};
export type Audit = {id:string;actor:string;message:string;createdAt:string};
export type JournalData = {user:User;activeUser:Pick<User,"id"|"name"|"role">;role:Role;mode:"teacher"|"student"|null;preview:boolean;permissions:{canGrade:boolean;canManage:boolean;canManageAdmins:boolean};groups:Group[];students:Student[];subjects:Subject[];assignments:Assignment[];lessons:Lesson[];records:Mark[];users:User[];audit:Audit[]};
export function mean(marks:Mark[]):number|null { const values=marks.filter(m=>m.grade!==null).map(m=>m.grade!); return values.length?values.reduce((a,b)=>a+b,0)/values.length:null; }
export function attendancePercent(marks:Mark[]):number|null {const filled=marks.filter(m=>m.attendance);return filled.length?Math.round(filled.filter(m=>m.attendance==="present").length/filled.length*100):null;}
export const roleLabels:Record<Role,string>={admin:"Адміністратор",teacher:"Викладач",student:"Студент"};
export function csvCell(value:unknown):string {let str=String(value??"");if(/^[=+@\-\t\r]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"';}
