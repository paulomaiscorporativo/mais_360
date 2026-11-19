"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "next-themes";
import { useIsDesktop } from "./overlay";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  const desktop = useIsDesktop();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position={desktop ? "bottom-right" : "top-center"}
      gap={8}
      icons={{
        success: <CircleCheck className="size-4 text-success" />,
        error: <CircleAlert className="size-4 text-danger" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        info: <Info className="size-4 text-info" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border !border-border !bg-surface-raised !text-fg !shadow-pop !font-sans !text-base",
          description: "!text-fg-muted !text-sm",
          actionButton: "!bg-brand !text-brand-fg !rounded-sm",
        },
      }}
    />
  );
}

export { toast };
