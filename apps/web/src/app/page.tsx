import { redirect } from "next/navigation";
import { homePathFor, loadViewer } from "@/server/auth";

export default async function Root() {
  const viewer = await loadViewer();
  redirect(viewer ? await homePathFor(viewer) : "/entrar");
}
