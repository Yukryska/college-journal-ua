const previewFormats = {
  pdf: "pdf",
  docx: "word",
  txt: "text",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;

export type PreviewFormat = (typeof previewFormats)[keyof typeof previewFormats];
export type CourseFile = { name: string; url: string; format: PreviewFormat };

export function previewFormat(name: string): PreviewFormat | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return;
  const extension = name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(previewFormats, extension)
    ? previewFormats[extension as keyof typeof previewFormats]
    : undefined;
}
