import { StudentShell } from "@/components/shell/student-shell";
import { RequireRole } from "@/components/auth/require-role"; 

export default function MahasiswaLayout({ children }: LayoutProps<"/mahasiswa">) {
  return (
    <RequireRole role="student">
      <StudentShell>{children}</StudentShell>
    </RequireRole>
  ); 
}
