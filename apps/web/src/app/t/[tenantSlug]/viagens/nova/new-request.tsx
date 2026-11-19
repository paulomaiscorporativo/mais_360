"use client";

import { TravelRequestForm } from "@/components/corporate-travel/request-form";
import { createRequest } from "../actions";

export function NewMemberRequest({
  tenantSlug,
  base,
  holder,
}: {
  tenantSlug: string;
  base: string;
  holder: { name: string; email: string; phone: string };
}) {
  return (
    <TravelRequestForm
      mode="member"
      holder={holder}
      doneHref={base}
      submit={(input) => createRequest({ tenantSlug, request: input.request })}
    />
  );
}
