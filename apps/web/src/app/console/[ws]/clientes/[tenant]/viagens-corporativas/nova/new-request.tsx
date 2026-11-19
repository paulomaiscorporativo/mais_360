"use client";

import {
  TravelRequestForm,
  type RequesterOption,
} from "@/components/corporate-travel/request-form";
import { createStaffRequest } from "../actions";

export function NewStaffRequest({
  tenant,
  base,
  requesters,
}: {
  tenant: string;
  base: string;
  requesters: RequesterOption[];
}) {
  return (
    <TravelRequestForm
      mode="staff"
      requesters={requesters}
      doneHref={base}
      submit={(input) =>
        createStaffRequest({
          tenant,
          request: input.request,
          sendCopy: input.sendCopy ?? true,
          requester: input.requester ?? { name: "", email: "", phone: "", company: "" },
        })
      }
    />
  );
}
