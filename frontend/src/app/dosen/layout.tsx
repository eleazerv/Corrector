import { DosenShell } from "@/components/shell/dosen-shell";

export default function DosenLayout({ children }: LayoutProps<"/dosen">) {
  return <DosenShell>{children}</DosenShell>;
}
