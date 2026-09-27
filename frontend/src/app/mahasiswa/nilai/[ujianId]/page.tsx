import { StudentGrade } from "@/components/mahasiswa/student-grade";

export default async function Page(props: PageProps<"/mahasiswa/nilai/[ujianId]">) {
  const { ujianId } = await props.params;
  return <StudentGrade examId={ujianId} />;
}
