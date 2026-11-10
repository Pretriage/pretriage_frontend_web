import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const unavailableMessage = "No pudimos mostrar este PDF. Puede estar dañado o protegido con contraseña.";

export function PdfPreview({ file, name }: { file: Blob; name: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let task: PDFDocumentLoadingTask | undefined;

    async function load() {
      try {
        const [pdf, bytes] = await Promise.all([import("pdfjs-dist"), file.arrayBuffer()]);
        if (disposed) return;
        pdf.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        task = pdf.getDocument({
          data: new Uint8Array(bytes),
          isEvalSupported: false,
          verbosity: pdf.VerbosityLevel.ERRORS,
        });
        const loaded = await task.promise;
        if (!disposed) setDocument(loaded);
      } catch {
        if (!disposed) setFailed(true);
      }
    }

    void load();
    return () => {
      disposed = true;
      void task?.destroy().catch(() => {});
    };
  }, [file]);

  if (failed) return <p className="notice notice-error" role="alert">{unavailableMessage}</p>;
  if (!document) return <p role="status">Preparando el PDF…</p>;

  return (
    <>
      {document.numPages > 1 ? (
        <div className="clinical-preview-actions">
          <button className="button button-secondary" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>Anterior</button>
          <span role="status">Página {pageNumber} de {document.numPages}</span>
          <button className="button button-secondary" disabled={pageNumber >= document.numPages} onClick={() => setPageNumber(pageNumber + 1)}>Siguiente</button>
        </div>
      ) : null}
      <PdfPage key={pageNumber} document={document} pageNumber={pageNumber} name={name} />
    </>
  );
}

function PdfPage({ document, pageNumber, name }: {
  document: PDFDocumentProxy;
  pageNumber: number;
  name: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"pending" | "ready" | "error">("pending");

  useEffect(() => {
    let disposed = false;
    let render: RenderTask | undefined;

    async function draw() {
      try {
        const page = await document.getPage(pageNumber);
        const element = canvas.current;
        if (disposed || !element) return;
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1800 / Math.max(original.width, original.height));
        const viewport = page.getViewport({ scale });
        element.width = Math.ceil(viewport.width);
        element.height = Math.ceil(viewport.height);
        render = page.render({ canvas: element, viewport });
        await render.promise;
        if (!disposed) setStatus("ready");
      } catch {
        if (!disposed) setStatus("error");
      }
    }

    void draw();
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [document, pageNumber]);

  return (
    <>
      {status === "pending" ? <p role="status">Cargando página…</p> : null}
      {status === "error" ? <p className="notice notice-error" role="alert">{unavailableMessage}</p> : null}
      <canvas ref={canvas} hidden={status !== "ready"} role="img" aria-label={`${name}, página ${pageNumber}`} />
    </>
  );
}
