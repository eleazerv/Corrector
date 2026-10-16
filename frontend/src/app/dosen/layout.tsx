import { DosenShell } from "@/components/shell/dosen-shell";
import { RequireRole } from "@/components/auth/require-role";

export default function DosenLayout({ children }: LayoutProps<"/dosen">) {
  return (
    <RequireRole role="teacher">
      <DosenShell>{children}</DosenShell>
    </RequireRole>
  ); 
}
