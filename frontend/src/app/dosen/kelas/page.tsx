import { redirect } from "next/navigation";

// Classes are listed on the lecturer home; this keeps old links working.
export default function Page() {
  redirect("/dosen");
}
