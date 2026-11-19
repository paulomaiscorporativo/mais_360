"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { uploadBrandAsset } from "./upload-actions";

/** Campo de imagem com prévia, troca e remoção. Reaproveitável (logo, banner). */
export function ImageUpload({
  tenant,
  target,
  projectId,
  label,
  hint,
  current,
  aspect = "logo",
  dark,
  disabled,
}: {
  tenant: string;
  target: "logo" | "logoDark" | "favicon" | "projectBanner";
  projectId?: string;
  label: string;
  hint: string;
  current: string | null;
  aspect?: "logo" | "banner" | "square";
  dark?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(current);
  const [pending, start] = useTransition();

  function send(file: File | null) {
    const fd = new FormData();
    fd.set("tenant", tenant);
    fd.set("target", target);
    if (projectId) fd.set("projectId", projectId);
    if (file) fd.set("file", file);
    else fd.set("remove", "1");
    start(async () => {
      const r = await uploadBrandAsset(fd);
      if (r.ok) {
        setUrl(r.data.fileId ? `/api/files/${r.data.fileId}` : null);
        toast.success(file ? "Imagem atualizada." : "Imagem removida.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => input.current?.click()}
        className={cn(
          "border-border-strong hover:border-brand-ring grid shrink-0 place-items-center overflow-hidden rounded-md border border-dashed transition-colors disabled:cursor-not-allowed",
          aspect === "banner" ? "h-24 w-full sm:w-64" : aspect === "square" ? "size-20" : "h-20 w-full sm:w-48",
          dark ? "bg-brand" : "bg-surface-muted",
          pending && "animate-pulse",
        )}
        aria-label={url ? `Trocar ${label.toLowerCase()}` : `Enviar ${label.toLowerCase()}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={cn("size-full", aspect === "banner" ? "object-cover" : "object-contain p-3")} />
        ) : (
          <ImagePlus className="text-fg-subtle size-5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium">{label}</p>
        <p className="text-fg-subtle text-sm">{hint}</p>
        {!disabled && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={pending}>
              {url ? "Trocar" : "Enviar"}
            </Button>
            {url && (
              <Button size="sm" variant="danger-ghost" onClick={() => send(null)} disabled={pending}>
                <Trash2 /> Remover
              </Button>
            )}
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) send(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
