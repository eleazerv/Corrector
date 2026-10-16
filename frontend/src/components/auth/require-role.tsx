"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import type { BackendRole } from "@/lib/backend-types";
import { useMounted, useSession } from "@/lib/use-api";
import { Icon } from "@/components/ui/icon";

export function RequireRole({ role, children }: { role: BackendRole; children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const mounted = useMounted();
  const ok = session?.me?.role === role;

  useEffect(() => {
    if (mounted && !ok) router.replace("/");
  }, [mounted, ok, router]);

  if (!mounted || !ok) {
    return (
      <p role="status" className="flex items-center gap-2 px-4 py-16 text-text-muted sm:px-8">
        <Icon icon={LoaderCircle} className="animate-spin" />
        Memeriksa sesi…
      </p>
    );
  }
  return <>{children}</>;
}
