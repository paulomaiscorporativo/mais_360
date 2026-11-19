import { redirect } from "next/navigation";
import { homePathFor, requireUser } from "@/server/auth";

export default async function ConsoleIndex() {
  redirect(await homePathFor(await requireUser()));
}
