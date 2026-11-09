export type Coursework = {
  id: string;
  kind: "lecture" | "assignment";
  title: string;
  description: string;
  dueDate: string | null;
  fileName: string | null;
};

export type Submission = {
  id: string;
  courseworkId: string;
  studentName: string;
  isDemo: number;
  fileName: string;
  submittedAt: string;
  grade: number | null;
  feedback: string;
};

export type ClassroomData = { items: Coursework[]; submissions: Submission[] };
export type SubjectTaskPreview = Pick<Coursework, "id" | "title"> & { subjectId: string };
export const courseworkFileAccept = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.txt,.zip,.png,.jpg,.jpeg";
export const courseworkFileLimit = 10 * 1024 * 1024;
