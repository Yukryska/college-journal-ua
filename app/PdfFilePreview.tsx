/// <reference types="vite/client" />
"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import type { PDFViewer as PdfViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// PDF.js accepts null to detach the document, including when a render is in progress.
type EmbeddedViewer = PdfViewer & { setDocument(document: null): void };

function fitToPreview(viewer: PdfViewer, container: HTMLDivElement) {
  const scale = getComputedStyle(container).getPropertyValue("--pdf-preview-scale").trim();
  viewer.currentScaleValue = scale === "page-fit" ? "page-fit" : "page-width";
}

export default function PdfFilePreview({ bytes }: { bytes: ArrayBuffer }) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const viewer = useRef<EmbeddedViewer | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = scrollArea.current;
    const pageList = pages.current;
    if (!container || !pageList) return;

    const controller = new AbortController();
    const { signal } = controller;
    let task: PDFDocumentLoadingTask | undefined;
    let resize: ResizeObserver | undefined;
    let releaseLocalization: (() => void) | undefined;
    let current: EmbeddedViewer | undefined;

    async function openPdf(container: HTMLDivElement, pageList: HTMLDivElement) {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (signal.aborted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        task = pdfjs.getDocument({
          data: new Uint8Array(bytes.slice(0)),
          isEvalSupported: false,
          enableXfa: false,
          useWasm: false,
          disableAutoFetch: true,
        });

        const [pdf, { EventBus, GenericL10n, PDFViewer }] = await Promise.all([
          task.promise,
          import("pdfjs-dist/web/pdf_viewer.mjs"),
        ]);
        if (signal.aborted) return;
        // The PDF.js viewer switches to single-page mode above this threshold.
        if (pdf.numPages > 10_000) {
          setError("У PDF понад 10 000 сторінок. Оригінал доступний для завантаження.");
          return;
        }

        const eventBus = new EventBus();
        const l10n = new GenericL10n(undefined);
        releaseLocalization = () => { void l10n.destroy().catch(() => {}); };
        const options = {
          container,
          viewer: pageList,
          eventBus,
          l10n,
          abortSignal: signal,
          textLayerMode: 0,
          annotationMode: pdfjs.AnnotationMode.DISABLE,
          annotationEditorMode: pdfjs.AnnotationEditorType.DISABLE,
          enableAutoLinking: false,
          maxCanvasPixels: 4_320_000,
          maxCanvasDim: 4096,
          enableDetailCanvas: false,
        };
        const pdfViewer = new PDFViewer(options) as EmbeddedViewer;
        current = pdfViewer;
        viewer.current = pdfViewer;

        eventBus.on("pagesinit", () => {
          fitToPreview(pdfViewer, container);
          setPageCount(pdf.numPages);
        }, { signal });
        eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
          setPageNumber(pageNumber);
        }, { signal });

        let width = container.clientWidth;
        let height = container.clientHeight;
        resize = new ResizeObserver(() => {
          const nextWidth = container.clientWidth;
          const nextHeight = container.clientHeight;
          const scale = pdfViewer.currentScaleValue;
          if (nextWidth && nextHeight && (nextWidth !== width || nextHeight !== height) &&
              (scale === "page-fit" || scale === "page-width")) {
            fitToPreview(pdfViewer, container);
          }
          width = nextWidth;
          height = nextHeight;
        });
        resize.observe(container);
        pdfViewer.setDocument(pdf);
        await pdfViewer.pagesPromise;
      } catch {
        if (!signal.aborted) setError("PDF не вдалося відкрити. Оригінал доступний для завантаження.");
      }
    }

    void openPdf(container, pageList);
    return () => {
      controller.abort();
      resize?.disconnect();
      if (viewer.current === current) viewer.current = null;
      current?.setDocument(null);
      releaseLocalization?.();
      void task?.destroy().catch(() => {});
    };
  }, [bytes]);

  const ready = pageCount > 0 && !error;
  return <div className="file-pdf">
    <div className="file-pdf-toolbar" role="group" aria-label="Керування PDF">
      <span className="file-pdf-counter">{ready ? `Сторінка ${pageNumber} з ${pageCount}` : "PDF"}</span>
      <button className="icon-button" type="button" aria-label="Зменшити PDF" title="Зменшити PDF"
        disabled={!ready} onClick={() => viewer.current?.decreaseScale()}><ZoomOut size={18}/></button>
      <button className="icon-button" type="button" aria-label="Збільшити PDF" title="Збільшити PDF"
        disabled={!ready} onClick={() => viewer.current?.increaseScale()}><ZoomIn size={18}/></button>
      <button className="icon-button" type="button" aria-label="Скинути масштаб PDF" title="Скинути масштаб"
        disabled={!ready} onClick={() => {
          if (viewer.current && scrollArea.current) fitToPreview(viewer.current, scrollArea.current);
        }}>
        <Maximize2 size={17}/>
      </button>
    </div>
    <div className="file-pdf-viewport">
      <div className="file-pdf-scroll" ref={scrollArea} tabIndex={0} role="region" aria-label="Сторінки PDF" aria-busy={!ready && !error}>
        <div className="file-pdf-pages pdfViewer" ref={pages}/>
      </div>
      {!ready && <p className="file-pdf-message file-preview-status" role={error ? "alert" : "status"}>
        {error || "Відкриваємо PDF…"}
      </p>}
    </div>
  </div>;
}
