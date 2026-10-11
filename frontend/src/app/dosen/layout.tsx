import { RoleGate } from "@/components/app/role-gate";

export default function DosenLayout({ children }: LayoutProps<"/dosen">) {
  return <RoleGate role="teacher">{children}</RoleGate>;
}
