import { redirect } from "next/navigation";

export default async function Page(props: PageProps<"/dosen/ujian/[ujianId]">) {
  const { ujianId } = await props.params;
  redirect(`/dosen/ujian/${ujianId}/rubrik`);
}
