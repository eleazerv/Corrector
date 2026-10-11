import { StudentComplaintForm } from "@/components/student/complaint-form";

export default async function Page(props: PageProps<"/mahasiswa/nilai/[ujianId]/keberatan">) {
  const { ujianId } = await props.params;
  return <StudentComplaintForm studentTestId={ujianId} />;
}
