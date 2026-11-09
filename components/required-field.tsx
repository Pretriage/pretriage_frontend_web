import type { ReactNode } from "react";

export function RequiredLabel({ children }: { children: ReactNode }) {
  return <span>{children} <span aria-hidden="true" className="required-mark">*</span></span>;
}

export function RequiredFieldsNote() {
  return <p className="required-fields-note">Los campos marcados con * son obligatorios.</p>;
}
