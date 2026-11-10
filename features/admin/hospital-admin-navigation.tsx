"use client";

import Link from "next/link";
import type { HospitalAdminSectionId } from "./hospital-admin-sections";
import { hospitalAdminSections } from "./hospital-admin-sections";

type NavigationSection = HospitalAdminSectionId;

export function HospitalAdminNavigation({ hospitalId, activeSection }: { hospitalId: number; activeSection: NavigationSection }) {
  return (
    <>
      {hospitalAdminSections.map(({ id, label }) => (
        <Link
          key={id}
          href={`/admin/hospital/${id}?hospitalId=${hospitalId}`}
          className={`nav-item nav-subitem${activeSection === id ? " nav-item-active" : ""}`}
          aria-current={activeSection === id ? "page" : undefined}
        >
          <span className="nav-dot" aria-hidden="true" />{label}
        </Link>
      ))}
    </>
  );
}
