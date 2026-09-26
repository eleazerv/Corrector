import { Suspense } from "react";
import { ComplaintInbox } from "@/components/dosen/complaint-inbox";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-text-muted">Memuat keberatan…</p>}>
      <ComplaintInbox />
    </Suspense>
  );
}
