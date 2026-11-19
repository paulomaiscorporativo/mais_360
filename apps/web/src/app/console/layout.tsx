import { ConsoleShell } from "@/components/shell/console-shell";
import { requireUser } from "@/server/auth";
import { loadNav } from "@/server/nav";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireUser();
  const nav = await loadNav(viewer);
  return <ConsoleShell nav={nav}>{children}</ConsoleShell>;
}
