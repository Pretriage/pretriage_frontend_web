import { NextResponse } from "next/server";
import { z } from "zod";
import { STAFF_NAME_MAX_LENGTH, type StaffProfileName } from "@/features/auth/staff-profile";
import { apiErrorResponse } from "@/lib/api/route";
import { backendRequest } from "@/lib/api/server";

const name = z.string().trim().min(1).max(STAFF_NAME_MAX_LENGTH);
const profileSchema = z.object({ nombre: name, apellido: name });

export async function PUT(request: Request) {
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Ingresá tu nombre y apellido.", status: 400 },
      { status: 400 },
    );
  }

  try {
    const { nombre, apellido } = await backendRequest<StaffProfileName>("/api/staff/me", {
      method: "PUT",
      body: JSON.stringify(parsed.data),
    });
    return NextResponse.json({ nombre, apellido });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
