"use client";

import { useTransition } from "react";

export function PermissionToggle({
  role,
  page,
  defaultChecked,
  action,
}: {
  role: string;
  page: string;
  defaultChecked: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      defaultChecked={defaultChecked}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("role", role);
        fd.set("page", page);
        if (e.currentTarget.checked) fd.set("visible", "on");
        start(() => action(fd));
      }}
    />
  );
}
