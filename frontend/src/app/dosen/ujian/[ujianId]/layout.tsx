import { ExamFrame } from "@/components/dosen/exam-frame";

export default async function ExamLayout(props: LayoutProps<"/dosen/ujian/[ujianId]">) {
  const { ujianId } = await props.params;
  return <ExamFrame examId={ujianId}>{props.children}</ExamFrame>;
}
