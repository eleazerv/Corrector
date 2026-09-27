import { Suspense } from "react";
import { ReviewWorkspace } from "@/components/dosen/review-workspace";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-text-muted">Memuat jawaban…</p>}>
      <ReviewWorkspace />
    </Suspense>
  );
}
