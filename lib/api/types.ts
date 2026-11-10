import type { components } from "@/contracts/pretriage-api";

export type ApiSchemas = components["schemas"];
export type ReceptionHospital = ApiSchemas["RecepcionHospitalDTO"];
export type ReceptionSession = ApiSchemas["SesionRecepcionDTO"];
export type ReceptionPatient = ApiSchemas["PacienteRecepcionDTO"];
export type ReceptionAdmission = Omit<ApiSchemas["AdmisionRecepcionDTO"], "estimacion"> & {
  // Older backend exports included a range; preserve read compatibility with them.
  estimacion?: ApiSchemas["TiempoEstimadoAtencionResponse"] & {
    fechaHoraAtencionEstimadaDesde?: string;
    fechaHoraAtencionEstimadaHasta?: string;
  };
};
export type ReceptionAdmissionDetail =
  ApiSchemas["AdmisionRecepcionDetalleDTO"];
export type ReceptionCoverage = ApiSchemas["CoberturaRecepcionDTO"];
export type CreateReceptionAdmission = Omit<
  ApiSchemas["CrearAdmisionRecepcionRequest"],
  "codigoPostal"
> & { codigoPostal?: string };
export type ReceptionTriageForm =
  ApiSchemas["FormularioTriageRecepcionRequest"];
export type DoctorAssignment = ApiSchemas["AsignacionMedicoDTO"];
export type MedicalSector = ApiSchemas["SectorDTO"];
export type MedicalRoom = ApiSchemas["SalaDTO"];
export type MedicalSession = ApiSchemas["SesionAtencionMedicaDTO"];
export type CurrentMedicalState = ApiSchemas["SesionMedicaActualDTO"];
export type QueueConsultation = ApiSchemas["ConsultaLlamadaDTO"];
export type MedicalAttention = ApiSchemas["AtencionMedicaDTO"];
export type ConsultationPretriage = ApiSchemas["PretriajeConsultaDTO"];
export type PriorityReviewRequest = ApiSchemas["RevisionPrioridadRequest"];
export type ClinicalStudy = ApiSchemas["Estudio"] & { id: number };
export type ConsultationClinicalData = ApiSchemas["DatosClinicosConsultaDTO"];
export type SymptomsDiscrepancy = ApiSchemas["DiscrepanciaSintomasDTO"];
export type CreatePatientCredential = ApiSchemas["CredencialRequest"];
export type PatientCredential = ApiSchemas["CredencialResponse"] & {
  nombreObraSocial?: string;
};

export type ReceptionBootstrap = {
  hospitals: ReceptionHospital[];
  session: ReceptionSession | null;
  openAdmissions: ReceptionAdmissionDetail[];
};

export type DoctorBootstrap = {
  assignments: DoctorAssignment[];
  history: MedicalAttention[];
  session: MedicalSession | null;
  currentConsultation: QueueConsultation | null;
};
