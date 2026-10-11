import { ComplaintInbox } from "@/components/teacher/complaints";

export default async function Page(props: PageProps<"/dosen/keberatan">) {
  const { k } = await props.searchParams;
  return <ComplaintInbox initial={typeof k === "string" ? k : undefined} />;
}
