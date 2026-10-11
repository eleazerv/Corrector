import { ReviewStep } from "@/components/exam/review-step";

export default async function Page(props: PageProps<"/dosen/ujian/[ujianId]/review">) {
  const { lembar } = await props.searchParams;
  return <ReviewStep initialSheet={typeof lembar === "string" ? lembar : undefined} />;
}
