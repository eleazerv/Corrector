import { StudentShell } from "@/components/shell/student-shell";

export default function MahasiswaLayout({ children }: LayoutProps<"/mahasiswa">) {
  return <StudentShell>{children}</StudentShell>;
}
