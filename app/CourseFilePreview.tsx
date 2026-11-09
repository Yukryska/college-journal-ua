"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import PdfFilePreview from "./PdfFilePreview";
import type { CourseFile } from "./lib/course-files";
import type { WordPreview } from "./lib/word-preview";

const textPreviewLimit = 300_000;
type FileContent =
  | { kind: "pdf"; bytes: ArrayBuffer }
  | { kind: "word"; document: WordPreview }
  | { kind: "text"; text: string; partial: boolean }
  | { kind: "image"; src: string };

function wordParts(content: (string | { src: string; alt: string })[]) {
  return content.map((part, index) => typeof part === "string"
    ? <Fragment key={index}>{part}</Fragment>
    : <img key={index} src={part.src} alt={part.alt}/>);
}

export default function CourseFilePreview({ file, close }: { file: CourseFile; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [content, setContent] = useState<FileContent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    function makeUrl(blob: Blob) {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return url;
    }

    async function load() {
      try {
        const response = await fetch(file.url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("File unavailable");
        const bytes = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        if (file.format === "pdf") {
          setContent({ kind: "pdf", bytes });
        } else if (file.format === "word") {
          const { readWordPreview } = await import("./lib/word-preview");
          if (!controller.signal.aborted) setContent({ kind: "word", document: readWordPreview(bytes, makeUrl) });
        } else if (file.format === "text") {
          const text = new TextDecoder().decode(bytes.slice(0, textPreviewLimit));
          setContent({ kind: "text", text, partial: bytes.byteLength > textPreviewLimit });
        } else {
          setContent({ kind: "image", src: makeUrl(new Blob([bytes], { type: file.format })) });
        }
      } catch {
        if (!controller.signal.aborted) setError("Не вдалося відкрити файл. Оригінал доступний для завантаження.");
      }
    }
    void load();
    return () => {
      controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [file]);

  return <dialog ref={dialog} className="file-preview-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="file-preview-shell">
      <header className="file-preview-header">
        <div className="file-preview-heading">
          <span>Перегляд файлу</span>
          <h2 id={titleId}>{file.name}</h2>
        </div>
        <div className="file-preview-actions">
          <a className="button secondary" href={file.url} download aria-label={"Завантажити " + file.name}>
            <Download size={16} aria-hidden="true"/><span>Завантажити</span>
          </a>
          <button ref={closeButton} className="icon-button" type="button" onClick={close} aria-label="Закрити перегляд"><X size={21}/></button>
        </div>
      </header>
      <div className={content?.kind === "pdf" ? "file-preview-content file-preview-content--pdf" : "file-preview-content"}>
        {error && <p className="file-preview-status" role="alert">{error}</p>}
        {!content && !error && <p className="file-preview-status" role="status">Відкриваємо файл…</p>}
        {!error && content?.kind === "image" && <img className="file-preview-image" src={content.src} alt={file.name}
          onError={() => setError("Не вдалося показати зображення. Оригінал доступний для завантаження.")}/>}
        {content?.kind === "pdf" && <PdfFilePreview bytes={content.bytes}/>}
        {content?.kind === "text" && <div className="file-preview-paper">
          <pre>{content.text}</pre>
          {content.partial && <p className="file-preview-caption">Показано початок файлу. Повний текст доступний для завантаження.</p>}
        </div>}
        {content?.kind === "word" && <div className="file-preview-paper">
          <p className="file-preview-caption">
            Перегляд вмісту DOCX. Оформлення оригіналу доступне у файлі.
          </p>
          {content.document.blocks.map((block, index) => block.kind === "paragraph"
            ? <p className="file-word-paragraph" key={index}>{wordParts(block.content)}</p>
            : <div className="file-word-table" key={index}><table><tbody>
              {block.rows.map((row, rowIndex) => <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{wordParts(cell)}</td>)}
              </tr>)}
            </tbody></table></div>)}
          {content.document.partial && <p className="file-preview-caption">Показано частину документа.</p>}
        </div>}
      </div>
    </div>
  </dialog>;
}
