import { redirect } from "next/navigation";

export default function PasswordChangePage() {
  redirect("/cuenta/perfil#contrasena");
}
