import { useEffect, useRef, useState } from "react";
import { formatoFechaHoraArgentina, formatoFechaIso } from "@/lib/argentina-date";
import type { ClinicalStudy, ConsultationClinicalData } from "@/lib/api/types";
import { PdfPreview } from "./pdf-preview";

const previewExtensions = new Set(["pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp"]);
const studyName = (study: ClinicalStudy) => study.nombreArchivo || "Estudio clínico";
type StudyRequest = { studyId: number; sessionId: number; consultationId: number };

async function getStudyFile(operation: "clinicalFile" | "downloadClinicalFile", ids: StudyRequest, signal: AbortSignal) {
  const response = await fetch("/api/staff/doctor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, ...ids }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    if (response.status === 503) {
      throw new Error("El archivo no está disponible en este momento. Podés continuar con la atención.");
    }
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "No pudimos abrir el archivo.");
  }
  return response.blob();
}

export function ClinicalHistory({ data, sessionId, consultationId }: {
  data: ConsultationClinicalData;
  sessionId: number;
  consultationId: number;
}) {
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null);
  const studies = (data.estudios ?? []).filter((study): study is ClinicalStudy => typeof study.id === "number");
  if (!studies.length && data.peso == null && data.altura == null) return null;

  const fields = [
    ["Fecha de nacimiento", data.fechaNacimiento ? formatoFechaIso(data.fechaNacimiento) : null],
    ["Género biológico", data.generoBiologico],
    ["Género con el que se identifica", data.generoConElQueSeIdentifica],
    ["Peso", data.peso == null ? null : `${data.peso} kg`],
    ["Altura", data.altura == null ? null : `${data.altura} cm`],
  ].filter(([, value]) => value);

  return (
    <section className="priority-review" aria-labelledby="clinical-data-title">
      <div className="priority-review-heading"><h2 id="clinical-data-title">Datos clínicos del paciente</h2></div>
      {fields.length ? (
        <dl className="clinical-summary">
          {fields.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value?.replaceAll("_", " ")}</dd></div>
          ))}
        </dl>
      ) : null}
      <div className="clinical-studies">
        <h3>Archivos de historia clínica</h3>
        {studies.length ? (
          <ul className="clinical-study-list">
            {studies.map((study) => {
              const selected = selectedStudyId === study.id;
              const extension = study.extensionArchivo?.replace(/^\./, "").toLowerCase() ?? "";
              const previewable = previewExtensions.has(extension);
              return (
                <li className="clinical-study" key={study.id}>
                  <div className="clinical-study-row">
                    <div>
                      <strong>{studyName(study)}</strong>
                      {study.descripcion ? <p>{study.descripcion}</p> : null}
                      {study.fechaSubida ? <p>Cargado el {formatoFechaHoraArgentina(study.fechaSubida)}</p> : null}
                    </div>
                    {previewable ? (
                      <button
                        className="button button-secondary"
                        aria-expanded={selected}
                        aria-label={`${selected ? "Cerrar vista previa de" : "Ver"} ${studyName(study)}`}
                        onClick={() => setSelectedStudyId(selected ? null : study.id)}
                      >
                        {selected ? "Cerrar vista previa" : "Ver archivo"}
                      </button>
                    ) : <DownloadStudy study={study} sessionId={sessionId} consultationId={consultationId} />}
                  </div>
                  {selected ? (
                    <ClinicalFilePreview
                      key={study.id}
                      study={study}
                      sessionId={sessionId}
                      consultationId={consultationId}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p>No hay archivos cargados.</p>}
      </div>
    </section>
  );
}

function DownloadStudy({ study, sessionId, consultationId }: {
  study: ClinicalStudy;
  sessionId: number;
  consultationId: number;
}) {
  const inFlight = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function download() {
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setError(null);
    try {
      const file = await getStudyFile("downloadClinicalFile", { sessionId, consultationId, studyId: study.id }, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = studyName(study).replace(/[\\/]/g, "_");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "No pudimos descargar el archivo.");
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
      inFlight.current = null;
    }
  }

  return (
    <div className="clinical-study-download">
      <span className="status-chip">Sin vista previa</span>
      <button className="button button-secondary" aria-label={`Descargar ${studyName(study)}`} disabled={pending} onClick={() => void download()}>
        {pending ? "Preparando archivo…" : "Descargar archivo"}
      </button>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    </div>
  );
}

function ClinicalFilePreview({ study, sessionId, consultationId }: {
  study: ClinicalStudy;
  sessionId: number;
  consultationId: number;
}) {
  const [preview, setPreview] = useState<{ file: Blob } | { url: string } | { error: string }>();

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;

    async function load() {
      try {
        const file = await getStudyFile("clinicalFile", { sessionId, consultationId, studyId: study.id }, controller.signal);
        if (controller.signal.aborted) return;
        if (file.type === "application/pdf") {
          setPreview({ file });
        } else {
          objectUrl = URL.createObjectURL(file);
          setPreview({ url: objectUrl });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreview({ error: error instanceof Error ? error.message : "No pudimos abrir el archivo." });
        }
      }
    }

    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, consultationId, study.id]);

  return (
    <div className="clinical-preview">
      {!preview ? <p role="status">Cargando archivo…</p> : null}
      {preview && "error" in preview ? <p className="notice notice-error" role="alert">{preview.error}</p> : null}
      {preview && "file" in preview ? <PdfPreview file={preview.file} name={studyName(study)} /> : null}
      {preview && "url" in preview ? (
        // The image is a transient, authenticated Blob. The optimizer cannot fetch it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.url} alt={studyName(study)} onError={() => setPreview({ error: "No pudimos mostrar esta imagen." })} />
      ) : null}
    </div>
  );
}
