import { ComplaintForm } from "@/components/mahasiswa/complaint-form";

export default async function Page(props: PageProps<"/mahasiswa/nilai/[ujianId]/keberatan">) {
  const { ujianId } = await props.params;
  return <ComplaintForm examId={ujianId} />;
}
