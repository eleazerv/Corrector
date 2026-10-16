import { Suspense } from "react";
import { ComplaintForm } from "@/components/mahasiswa/complaint-form";

export default async function Page(props: PageProps<"/mahasiswa/nilai/[ujianId]/keberatan">) {
  const { ujianId } = await props.params;
  return (
    <Suspense fallback={<p className="text-text-muted">Memuat…</p>}>
      <ComplaintForm examId={ujianId} />
    </Suspense>
  );
}
