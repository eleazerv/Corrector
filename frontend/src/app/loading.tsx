import { Loading } from "@/components/kit/status";

export default function RouteLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6">
      <Loading what="halaman" />
    </main>
  );
}
