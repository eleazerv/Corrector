import { ExamFrame } from "@/components/exam/frame";

export default async function ExamLayout(props: LayoutProps<"/dosen/ujian/[ujianId]">) {
  const { ujianId } = await props.params;
  return <ExamFrame id={ujianId}>{props.children}</ExamFrame>;
}
