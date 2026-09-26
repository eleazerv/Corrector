import { ClassDetail } from "@/components/dosen/class-detail";

export default async function Page(props: PageProps<"/dosen/kelas/[kelasId]">) {
  const { kelasId } = await props.params;
  return <ClassDetail classId={kelasId} />;
}
