export type Specialty = { id: number; codigo: string; nombre: string; habilitada: boolean };
export type Sector = {
  id: number;
  nombre: string;
  activa: boolean;
  especialidadId: number;
  especialidadCodigo: string;
  especialidadNombre: string;
};
export type Room = Omit<Sector, "id"> & {
  id: number;
  sectorId: number | null;
  sectorNombre: string | null;
};
export type HospitalConfiguration = {
  especialidades: Specialty[];
  salas: Room[];
  sectores: Sector[];
  salasOcupadasIds?: number[];
};
export type MedicalSession = {
  id: number;
  medicoId: number;
  medicoNombre: string;
  estado: "ACTIVA" | "PAUSADA" | "FINALIZADA";
  sectorId: number;
  sectorNombre: string;
  salaId: number | null;
  salaNombre: string | null;
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  fechaHoraInicio: string;
};
type NamedSpecialty = { nombre: string; especialidadId: number };
export type ConfigurationOperation =
  | { operation: "enableSpecialty"; specialtyId: number }
  | { operation: "disableSpecialty"; specialtyId: number }
  | { operation: "createSector"; sector: NamedSpecialty }
  | { operation: "updateSector"; sectorId: number; sector: NamedSpecialty & { activa: boolean } }
  | { operation: "deleteSector"; sectorId: number }
  | { operation: "createRoom"; sectorId: number; room: NamedSpecialty }
  | { operation: "updateRoom"; sectorId: number; roomId: number; room: NamedSpecialty }
  | { operation: "setRoomActive"; sectorId: number; roomId: number; active: boolean };
