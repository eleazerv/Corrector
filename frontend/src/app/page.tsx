"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useAuth } from "@/lib/auth";
import { Loading } from "@/components/kit/status";

export default function Home() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "signed_in") router.replace(homeFor(state.session.role));
    if (state.status === "signed_out") router.replace("/masuk");
  }, [state, router]);

  return (
    <main className="mx-auto max-w-xl px-4">
      <Loading what="akun" />
    </main>
  );
}
