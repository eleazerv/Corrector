import { RoleGate } from "@/components/app/role-gate";

export default function MahasiswaLayout({ children }: LayoutProps<"/mahasiswa">) {
  return <RoleGate role="student">{children}</RoleGate>;
}
