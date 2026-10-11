import { UploadStep } from "@/components/exam/upload-step";

export default async function Page(props: PageProps<"/dosen/ujian/[ujianId]/unggah">) {
  const { nim } = await props.searchParams;
  return <UploadStep initialNim={typeof nim === "string" ? nim : undefined} />;
}
