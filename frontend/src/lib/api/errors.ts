/** Error envelope from backend/core/errors.py: {"error": {"code", "message", "details"}}. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** ApiError code for a multi-step save that failed after some rows were already written. */
export const PARTIAL_WRITE = "PARTIAL_WRITE";

/** Thrown when a screen needs an endpoint the backend has not built yet. */
export class NotAvailableError extends Error {
  constructor(
    public endpoint: string,
    public feature: string,
  ) {
    super(`${feature} belum tersedia di backend (${endpoint}).`);
    this.name = "NotAvailableError";
  }
}

const SHEET_STATUS_ID: Record<string, string> = {
  absent: "belum diunggah",
  ocr_queued: "antre dibaca",
  ocr_processing: "sedang dibaca",
  grading: "sedang dinilai",
  graded: "sudah dinilai AI",
  reviewed: "sudah diperiksa",
  published: "sudah dipublikasikan",
  needs_reupload: "fotonya perlu diulang",
  failed: "gagal diproses",
  quota_exceeded: "kuota habis",
};

const st = (s: string) => SHEET_STATUS_ID[s.trim()] ?? s.trim();

/**
 * The backend writes its messages in English. These are the ones a lecturer or student can
 * actually hit, rewritten in Indonesian. Anything not listed falls through unchanged.
 */
const KNOWN: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Cannot override a sheet with status (\w+)/, (m) => `Nilai lembar yang ${st(m[1])} belum bisa diubah.`],
  [/^Only graded sheets can be approved \(status : (\w+)\)/, (m) => `Lembar yang ${st(m[1])} belum bisa ditandai diperiksa.`],
  [/^Cannot regrade a sheet with status (\w+)/, (m) => `Lembar yang ${st(m[1])} tidak bisa dinilai ulang.`],
  [/^OCR not complete/, () => "Foto lembar ini belum selesai dibaca, jadi belum bisa dinilai ulang."],
  [/^some answer sheets are still being processed/, () => "Masih ada lembar yang sedang dibaca atau dinilai. Tunggu sampai selesai, lalu coba lagi."],
  [/^No graded answer sheets to publish/, () => "Belum ada lembar yang selesai dinilai untuk dipublikasikan."],
  [/^(\d+) answer sheet\(s\) still need review/, (m) => `${m[1]} lembar masih perlu diperiksa.`],
  [/^Complaint is already (\w+)/, () => "Keberatan ini sudah diputuskan sebelumnya."],
  [/^You already have a pending complaint for this item/, () => "Anda masih punya keberatan yang menunggu keputusan untuk soal ini."],
  [/^new_grade is required when accepting/, () => "Isi nilai baru untuk menerima keberatan atas satu soal."],
  [/^new_grade is only allowed when accepting/, () => "Nilai baru hanya bisa diisi saat menerima keberatan atas satu soal."],
  [/^new_grade must be between 0 and ([\d.]+)/, (m) => `Nilai harus di antara 0 dan ${m[1]}.`],
  [/^teacher_grade must be between 0 and ([\d.]+)/, (m) => `Nilai harus di antara 0 dan ${m[1]}.`],
  [/^page doesnt need to be reuploaded/, () => "Halaman ini tidak perlu diunggah ulang. Mungkin sudah diunggah ulang sebelumnya."],
  [/^page .* is not found/, () => "Halaman itu tidak ada di lembar ini."],
  [/^Student already has an answer sheet \(status: (\w+)\)/, (m) => `Mahasiswa ini sudah punya lembar yang ${st(m[1])}.`],
  [/^student in this class not found/, () => "Mahasiswa itu tidak terdaftar di kelas ini."],
  [/^File '(.+)' is not a JPEG, PNG or WebP image/, (m) => `${m[1]} bukan foto JPEG, PNG, atau WebP.`],
  [/^File '(.+)' exceeds (\d+) MB/, (m) => `${m[1]} lebih dari ${m[2]} MB.`],
  [/^'(.+)' exceeds (\d+) MB/, (m) => `${m[1]} di dalam ZIP lebih dari ${m[2]} MB.`],
  [/^File '(.+)' is empty/, (m) => `${m[1]} kosong.`],
  [/^ZIP exceeds (\d+) MB/, (m) => `ZIP lebih dari ${m[1]} MB. Bagi menjadi beberapa ZIP.`],
  [/^File is not a valid ZIP/, () => "File itu bukan ZIP yang valid."],
  [/^ZIP has more than (\d+) entries/, (m) => `ZIP berisi lebih dari ${m[1]} file. Bagi menjadi beberapa ZIP.`],
  [/^ZIP content is too large/, () => "Isi ZIP terlalu besar setelah dibuka. Bagi menjadi beberapa ZIP."],
  [/^Max(?:imum)? (\d+) pages per student/, (m) => `Maksimal ${m[1]} halaman per mahasiswa.`],
  [/^Account has not been activated yet/, () => "Akun ini belum diaktifkan sebagai dosen atau mahasiswa. Hubungi admin sekolah."],
  [/^The edit reverses the meaning of this trait/, () => "Suntingan ini membalik makna catatan. Matikan catatan ini dan tulis catatan baru."],
  [/^Cannot verify the edit right now/, () => "Suntingan belum bisa diperiksa sekarang. Coba lagi nanti."],
];

function translate(message: string): string {
  for (const [re, out] of KNOWN) {
    const m = message.match(re);
    if (m) return out(m);
  }
  return message;
}

/** Human message for any thrown value, in Indonesian, for toasts and error states. */
export function errorMessage(err: unknown): string {
  if (err instanceof NotAvailableError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 0) return "Server tidak bisa dihubungi. Periksa koneksi atau pastikan backend berjalan.";
    if (err.status === 401) return "Sesi Anda berakhir. Masuk lagi untuk melanjutkan.";
    if (err.status === 403) return translate(err.message) || "Akun Anda tidak punya akses ke data ini.";
    if (err.status === 404) return "Data tidak ditemukan, atau Anda tidak punya akses ke data ini.";
    if (err.status === 429) return "Terlalu banyak permintaan dalam satu menit. Tunggu sebentar lalu coba lagi.";
    if (err.code === "VALIDATION_ERROR" && Array.isArray(err.details)) return "Isian tidak valid. Periksa lagi lalu kirim ulang.";
    const known = translate(err.message);
    if (known !== err.message) return known;
    if (err.status >= 500) return "Server sedang bermasalah. Coba lagi sebentar lagi.";
    return err.message || `Permintaan gagal (kode ${err.status}).`;
  }
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan yang tidak dikenal.";
}
