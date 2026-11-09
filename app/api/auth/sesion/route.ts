import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// El middleware renueva la sesión cuando corresponde antes de esta sonda.
// La respuesta solo indica si la sesión está activa.
export const dynamic = "force-dynamic";

function conCabecerasSinCache(respuesta: NextResponse) {
  respuesta.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  respuesta.headers.set("Pragma", "no-cache");
  respuesta.headers.set("Expires", "0");
  return respuesta;
}

export async function GET() {
  const sesion = await getSession();
  if (!sesion) {
    return conCabecerasSinCache(
      NextResponse.json({ autenticado: false }, { status: 401 }),
    );
  }
  return conCabecerasSinCache(
    NextResponse.json({ autenticado: true }),
  );
}

export const POST = GET;
