import { StudentResultDetail } from "@/components/student/result-detail";

// The folder is named [ujianId] for older links; the value is a student_test id.
export default async function Page(props: PageProps<"/mahasiswa/nilai/[ujianId]">) {
  const { ujianId } = await props.params;
  return <StudentResultDetail studentTestId={ujianId} />;
}
