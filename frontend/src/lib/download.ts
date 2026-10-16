// unduh file yang butuh token (mis. export CSV) lalu simpan di komputer user.
import { getAccessToken } from "./auth";
import { ApiError } from "./api";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "").replace(/\/api\/v1$/, "");

export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "DOWNLOAD_FAILED", `Unduhan gagal (${res.status}).`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
