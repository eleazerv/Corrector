import { LoaderCircle } from "lucide-react";
import { Icon } from "@/components/ui/icon";

export default function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 px-4 py-16 text-text-muted sm:px-8">
      <Icon icon={LoaderCircle} className="animate-spin" />
      Memuat halaman…
    </p>
  );
}
