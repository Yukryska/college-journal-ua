export const demoAccountEmails = {
  teacher: "teacher@example.test",
  student: "student1@example.test",
};

export async function seedDemo(db:D1Database) {
  if(await db.prepare("SELECT value FROM settings WHERE key='demoSeeded'").first())return;
  const q:D1PreparedStatement[]=[];
  const put=(sql:string,...args:(string|number|null)[])=>q.push(db.prepare(sql).bind(...args));
  put("INSERT OR IGNORE INTO groups(id,name,course,specialty) VALUES (?,?,?,?)","g1","МТ-42",4,"Мережні технології та Інтернет речей");
  put("INSERT OR IGNORE INTO groups(id,name,course,specialty) VALUES (?,?,?,?)","g2","КН-31",3,"Комп’ютерні науки");
  put("INSERT OR IGNORE INTO groups(id,name,course,specialty) VALUES (?,?,?,?)","g3","МТ-21",2,"Мережні технології та Інтернет речей");
  const names=["Бойко Андрій","Бондар Софія","Гнатюк Максим","Данилюк Олександр","Захарченко Марія","Іваненко Назар","Коваль Анастасія","Кравчук Дмитро","Левицька Ольга","Мельник Артем","Петренко Вікторія","Романюк Ілля","Савчук Дарина","Ткаченко Владислав","Шевченко Юлія"];
  for(let i=0;i<names.length;i++)put("INSERT OR IGNORE INTO students(id,groupId,name,email) VALUES (?,?,?,?)",`s${i+1}`,"g1",names[i],`student${i+1}@example.test`);
  for(let i=0;i<6;i++)put("INSERT OR IGNORE INTO students(id,groupId,name,email) VALUES (?,?,?,?)",`k${i+1}`,"g2",["Андрусів Олег","Гордієнко Ірина","Дорошенко Денис","Климчук Олена","Лозинський Роман","Мартинюк Анна"][i],null);
  const subjects=[["sub1","Комп’ютерні мережі","Ковальчук Оксана Петрівна"],["sub2","Програмування","Мельник Тарас Іванович"],["sub3","Інтернет речей","Шевчук Андрій Васильович"]];
  for(const s of subjects)put("INSERT OR IGNORE INTO subjects(id,title,teacherName) VALUES (?,?,?)",...s);
  put("INSERT OR IGNORE INTO users(id,email,name,role) VALUES (?,?,?,?)","demo-teacher",demoAccountEmails.teacher,subjects[0][2],"teacher");
  put("INSERT OR IGNORE INTO users(id,email,name,role,studentId) VALUES (?,?,?,?,?)","demo-student",demoAccountEmails.student,names[0],"student","s1");
  for(const g of ["g1","g2","g3"])for(const s of subjects)put("INSERT OR IGNORE INTO assignments(id,groupId,subjectId,teacherId) VALUES (?,?,?,?)",`${g}-${s[0]}`,g,s[0],s[0]==="sub1"?"demo-teacher":null);
  const dates=["2026-11-02","2026-11-04","2026-11-06","2026-11-09","2026-11-11","2026-11-13","2026-11-16","2026-11-18"];
  const topics=["Мережеві моделі OSI та TCP/IP","Адресація IPv4. Маски підмереж","Розрахунок і проєктування підмереж","Налаштування комутатора","Віртуальні локальні мережі VLAN","Маршрутизація між мережами","Налаштування DHCP і DNS","Захист локальної мережі"];
  const now="2026-11-06T09:00:00.000Z";
  for(const g of ["g1","g2"])for(const sub of subjects)for(let i=0;i<dates.length;i++) {
    const lid=`${g}-${sub[0]}-l${i}`;
    put("INSERT OR IGNORE INTO lessons(id,groupId,subjectId,date,number,type,topic,homework) VALUES (?,?,?,?,?,?,?,?)",lid,g,sub[0],dates[i],2,i%3===2?"Лабораторна":"Лекція",sub[0]==="sub1"?topics[i]:sub[0]==="sub2"?["Вступ до TypeScript","Типи даних і змінні","Функції та параметри","Масиви й об’єкти","Асинхронне програмування","Робота з API","Обробка помилок","Модулі та компоненти"][i]:["Архітектура IoT-систем","Мікроконтролери та плати","Цифрові й аналогові входи","Протоколи обміну даними","MQTT та брокери повідомлень","Підключення пристроїв до Wi-Fi","Збір і зберігання телеметрії","Безпека IoT-пристроїв"][i],i%3===2?"Завершити практичне завдання та оформити звіт.":"Опрацювати конспект. Підготувати відповіді на контрольні запитання.");
    if(i>2)continue;
    const count=g==="g1"?15:6;
    for(let j=0;j<count;j++) {
      const sid=g==="g1"?`s${j+1}`:`k${j+1}`;
      const absent=(j+i*3)%11===4;
      put("INSERT OR IGNORE INTO records(id,lessonId,studentId,grade,attendance,note,updatedAt) VALUES (?,?,?,?,?,?,?)",`${lid}-${sid}`,lid,sid,absent?null:((j+i)%4===0||i===2?7+(j*2+i)%6:null),absent?(j%2?"excused":"absent"):"present","",now);
    }
  }
  put("INSERT OR IGNORE INTO auditLogs(id,actor,message,createdAt) VALUES (?,?,?,?)","seed","Система","Створено демонстраційні групи та журнал",now);
  put("INSERT OR IGNORE INTO settings(key,value) VALUES ('demoSeeded','1')");
  for(let offset=0;offset<q.length;offset+=60) await db.batch(q.slice(offset,offset+60));
}
