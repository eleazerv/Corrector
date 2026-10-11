import { ClassPage } from "@/components/teacher/class-page";

export default async function Page(props: PageProps<"/dosen/kelas/[kelasId]">) {
  const { kelasId } = await props.params;
  return <ClassPage classId={kelasId} />;
}
