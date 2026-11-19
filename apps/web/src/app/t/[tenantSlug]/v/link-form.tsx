"use client";

import { MailCheck, Send } from "lucide-react";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { TextField, useRunAction } from "@/components/travel/kit";
import { requestPortalLink } from "./actions";

export function PortalLinkForm({ tenantSlug }: { tenantSlug: string }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState(false);
  const { run, pending, errors } = useRunAction();

  if (sent)
    return (
      <Notice tone="success" icon={<MailCheck />} title="Pronto" className="mt-6">
        Se houver uma viagem para este e-mail, o link chega em instantes. Confira também a caixa de
        spam.
      </Notice>
    );

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => requestPortalLink({ tenantSlug, email, website }), {
          refresh: false,
          onSuccess: () => setSent(true),
        });
      }}
    >
      <TextField
        label="E-mail"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={setEmail}
        error={errors.email}
        inputClassName="h-12 text-md"
      />
      {/* Campo-isca para robôs: invisível e fora da ordem de tabulação */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="sr-only"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <Button type="submit" size="lg" block loading={pending}>
        <Send /> Enviar meu link
      </Button>
    </form>
  );
}
