/**
 * Sample data for the prototype. Everything here is placeholder content shown under
 * the "Data contoh" notice; replace with apiFetch calls once the backend exposes
 * grading endpoints.
 */
import type {
  AnswerPage,
  AppData,
  Confidence,
  Exam,
  Grade,
  Question,
  Student,
  Submission,
} from "./types";

const LECTURER = { id: "d1", name: "Dosen Pengampu" };

const students: Student[] = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { id: `s${n}`, nim: `26010${n}`, name: `Mahasiswa ${n}` };
});

const PERIOD = "Ganjil 2026/2027";

const quizQuestions: Question[] = [
  {
    id: "k1q1",
    number: 1,
    prompt:
      "Jelaskan perbedaan penelitian kualitatif dan kuantitatif, lalu berikan satu contoh untuk masing-masing.",
    maxScore: 40,
    answerKey:
      "Kualitatif menggali makna dan pengalaman melalui data non-angka (wawancara, observasi). Kuantitatif mengukur variabel dengan data angka dan analisis statistik. Contoh harus sesuai jenisnya.",
    criteria: [
      { id: "k1q1c1", name: "Definisi kualitatif", weight: 30, baseScore: 0, deduction: 0, max: 12 },
      { id: "k1q1c2", name: "Definisi kuantitatif", weight: 30, baseScore: 0, deduction: 0, max: 12 },
      { id: "k1q1c3", name: "Contoh relevan", weight: 40, baseScore: 0, deduction: 4, max: 16 },
    ],
    requiredConcepts: ["data non-angka", "pengukuran variabel", "analisis statistik"],
    keywords: ["makna", "generalisasi", "instrumen terstruktur"],
    alternatives: ["Menyebut 'pendekatan interpretif' untuk kualitatif diterima."],
    commonMistakes: ["Menganggap kuesioner selalu kuantitatif."],
  },
  {
    id: "k1q2",
    number: 2,
    prompt:
      "Susun rumusan masalah dan hipotesis untuk topik pengaruh penggunaan media sosial terhadap prestasi belajar.",
    maxScore: 60,
    answerKey:
      "Rumusan masalah berbentuk pertanyaan yang menyebut kedua variabel dan populasi. Hipotesis berupa pernyataan hubungan yang dapat diuji (H0 dan H1).",
    criteria: [
      { id: "k1q2c1", name: "Rumusan masalah jelas", weight: 35, baseScore: 0, deduction: 0, max: 21 },
      { id: "k1q2c2", name: "Hipotesis dapat diuji", weight: 35, baseScore: 0, deduction: 0, max: 21 },
      { id: "k1q2c3", name: "Keterkaitan variabel", weight: 30, baseScore: 0, deduction: 0, max: 18 },
    ],
    requiredConcepts: ["variabel bebas", "variabel terikat", "H0 dan H1"],
    keywords: ["pengaruh", "populasi", "dapat diukur"],
    alternatives: ["Hipotesis satu arah diterima bila diberi alasan."],
    commonMistakes: ["Menulis hipotesis sebagai pertanyaan."],
  },
];

const utsQuestions: Question[] = [
  {
    id: "u1q1",
    number: 1,
    prompt: "Jelaskan cara menguji validitas dan reliabilitas instrumen penelitian.",
    maxScore: 40,
    answerKey:
      "Validitas: uji isi (expert judgement) dan uji konstruk (korelasi item-total). Reliabilitas: konsistensi internal, misalnya Cronbach's alpha, atau test-retest.",
    criteria: [
      { id: "u1q1c1", name: "Uji validitas", weight: 40, baseScore: 0, deduction: 0, max: 16 },
      { id: "u1q1c2", name: "Uji reliabilitas", weight: 40, baseScore: 0, deduction: 0, max: 16 },
      { id: "u1q1c3", name: "Contoh penerapan", weight: 20, baseScore: 0, deduction: 0, max: 8 },
    ],
    requiredConcepts: ["validitas isi", "korelasi item-total", "konsistensi internal"],
    keywords: ["Cronbach's alpha", "test-retest", "expert judgement"],
    alternatives: ["Split-half diterima sebagai metode reliabilitas."],
    commonMistakes: ["Menyamakan validitas dengan reliabilitas."],
  },
  {
    id: "u1q2",
    number: 2,
    prompt:
      "Bandingkan teknik sampling probabilitas dan non-probabilitas, lalu pilih teknik yang tepat untuk survei kepuasan mahasiswa beserta alasannya.",
    maxScore: 60,
    answerKey:
      "Probabilitas: setiap anggota populasi punya peluang terpilih yang diketahui (acak sederhana, stratified). Non-probabilitas: tidak (purposive, convenience). Untuk survei kepuasan, stratified random sampling per fakultas paling tepat agar representatif.",
    criteria: [
      { id: "u1q2c1", name: "Perbandingan teknik", weight: 40, baseScore: 0, deduction: 0, max: 24 },
      { id: "u1q2c2", name: "Pilihan teknik", weight: 30, baseScore: 0, deduction: 0, max: 18 },
      { id: "u1q2c3", name: "Alasan pemilihan", weight: 30, baseScore: 0, deduction: 0, max: 18 },
    ],
    requiredConcepts: ["peluang terpilih", "representatif", "strata"],
    keywords: ["stratified", "purposive", "generalisasi"],
    alternatives: ["Cluster sampling per kelas diterima bila alasannya efisiensi."],
    commonMistakes: ["Memilih convenience sampling tanpa membahas bias."],
  },
];

const essayQuestions: Question[] = [
  {
    id: "t1q1",
    number: 1,
    prompt: "Tulis ringkasan kritis satu artikel jurnal tentang metode survei daring.",
    maxScore: 100,
    answerKey: "",
    criteria: [
      { id: "t1q1c1", name: "Ringkasan isi", weight: 40, baseScore: 0, deduction: 0, max: 40 },
      { id: "t1q1c2", name: "Analisis kritis", weight: 50, baseScore: 0, deduction: 0, max: 60 },
    ],
    requiredConcepts: [],
    keywords: [],
    alternatives: [],
    commonMistakes: [],
  },
];

interface Variant {
  paragraphs: string[];
  scores: number[];
  confidence: Confidence;
  reviewRequired: boolean;
  reasoning: string;
  feedback: string;
  evidence: { effect: "plus" | "minus"; paragraph: number; quote: string; note: string }[];
}

const VARIANTS: Record<string, Variant[]> = {
  k1q1: [
    {
      paragraphs: [
        "Penelitian kualitatif berusaha memahami makna dan pengalaman orang melalui data berupa kata-kata, misalnya dari wawancara dan observasi.",
        "Penelitian kuantitatif mengukur variabel dengan angka lalu dianalisis memakai statistik supaya hasilnya bisa digeneralisasi.",
        "Contoh kualitatif: wawancara mendalam dengan guru honorer tentang beban kerja. Contoh kuantitatif: survei 200 siswa tentang jam belajar dan nilai rapor.",
      ],
      scores: [11, 11, 14],
      confidence: "tinggi",
      reviewRequired: false,
      reasoning:
        "Kedua definisi memuat konsep wajib (data non-angka, pengukuran variabel, analisis statistik). Contoh sesuai jenisnya; contoh kuantitatif belum menyebut instrumen sehingga kriteria 3 dikurangi 2.",
      feedback:
        "Perbedaan kedua pendekatan sudah dijelaskan dengan tepat. Contoh kuantitatif akan lebih kuat bila menyebut alat ukurnya, misalnya kuesioner skala Likert.",
      evidence: [
        { effect: "plus", paragraph: 0, quote: "memahami makna dan pengalaman", note: "Definisi kualitatif tepat." },
        { effect: "plus", paragraph: 1, quote: "dianalisis memakai statistik", note: "Menyebut analisis statistik." },
        { effect: "minus", paragraph: 2, quote: "survei 200 siswa", note: "Instrumen pengukuran tidak disebut." },
      ],
    },
    {
      paragraphs: [
        "Kualitatif itu penelitian yang tidak pakai angka. Kuantitatif pakai angka.",
        "Contoh kualitatif adalah menyebar kuesioner ke mahasiswa. Contoh kuantitatif menghitung rata-rata nilai.",
      ],
      scores: [6, 6, 6],
      confidence: "rendah",
      reviewRequired: true,
      reasoning:
        "Definisi terlalu singkat dan tidak menyebut tujuan (makna vs pengukuran). Contoh kualitatif memakai kuesioner, termasuk kesalahan umum yang tercatat di rubrik. Confidence rendah karena tulisan pada paragraf 2 sebagian kabur.",
      feedback:
        "Jawaban sudah membedakan kedua pendekatan dari jenis datanya. Penjelasan tentang tujuan masing-masing masih kurang, dan contoh pertama belum sesuai. Coba bandingkan lagi cara pengumpulan data pada tiap pendekatan.",
      evidence: [
        { effect: "plus", paragraph: 0, quote: "tidak pakai angka", note: "Menyebut jenis data." },
        { effect: "minus", paragraph: 1, quote: "menyebar kuesioner ke mahasiswa", note: "Contoh tidak sesuai jenis penelitian." },
      ],
    },
  ],
  k1q2: [
    {
      paragraphs: [
        "Rumusan masalah: Apakah terdapat pengaruh durasi penggunaan media sosial terhadap prestasi belajar mahasiswa semester 3?",
        "H0: tidak ada pengaruh durasi penggunaan media sosial terhadap prestasi belajar. H1: ada pengaruh durasi penggunaan media sosial terhadap prestasi belajar.",
        "Variabel bebasnya durasi penggunaan media sosial per hari, variabel terikatnya IPK semester.",
      ],
      scores: [19, 18, 15],
      confidence: "sedang",
      reviewRequired: false,
      reasoning:
        "Rumusan masalah menyebut kedua variabel dan populasi. H0 dan H1 lengkap. Keterkaitan variabel jelas tetapi cara pengukuran durasi belum dijelaskan.",
      feedback:
        "Rumusan masalah dan hipotesis sudah tersusun rapi. Tambahkan cara mengukur durasi penggunaan media sosial agar variabelnya benar-benar dapat diuji.",
      evidence: [
        { effect: "plus", paragraph: 0, quote: "mahasiswa semester 3", note: "Populasi disebut jelas." },
        { effect: "plus", paragraph: 1, quote: "H0: tidak ada pengaruh", note: "Hipotesis nol dan alternatif lengkap." },
        { effect: "minus", paragraph: 2, quote: "durasi penggunaan media sosial per hari", note: "Cara pengukuran belum dijelaskan." },
      ],
    },
    {
      paragraphs: [
        "Bagaimana media sosial mempengaruhi mahasiswa?",
        "Hipotesis: apakah mahasiswa yang sering main media sosial nilainya turun?",
      ],
      scores: [9, 6, 8],
      confidence: "rendah",
      reviewRequired: true,
      reasoning:
        "Rumusan masalah tidak menyebut variabel terikat. Hipotesis ditulis sebagai pertanyaan, termasuk kesalahan umum di rubrik.",
      feedback:
        "Topik yang dipilih sudah sesuai. Rumusan masalah belum menyebut prestasi belajar sebagai hal yang diukur, dan hipotesis perlu ditulis sebagai pernyataan yang bisa dibuktikan benar atau salah.",
      evidence: [
        { effect: "minus", paragraph: 0, quote: "mempengaruhi mahasiswa", note: "Variabel terikat tidak disebut." },
        { effect: "minus", paragraph: 1, quote: "apakah mahasiswa yang sering", note: "Hipotesis berbentuk pertanyaan." },
      ],
    },
  ],
  u1q1: [
    {
      paragraphs: [
        "Validitas diuji dengan meminta pendapat ahli terhadap isi butir soal, lalu dengan korelasi item-total untuk melihat apakah tiap butir mengukur konstruk yang sama.",
        "Reliabilitas diuji dengan Cronbach's alpha. Nilai di atas 0,7 biasanya dianggap cukup konsisten.",
        "Contoh: kuesioner motivasi belajar 20 butir diuji ke 30 responden sebelum dipakai.",
      ],
      scores: [15, 14, 7],
      confidence: "tinggi",
      reviewRequired: false,
      reasoning:
        "Menyebut validitas isi dan korelasi item-total. Reliabilitas memakai Cronbach's alpha dengan ambang yang benar. Contoh relevan.",
      feedback:
        "Penjelasan uji validitas dan reliabilitas sudah lengkap dan runtut. Untuk reliabilitas, kamu bisa menambahkan satu metode lain sebagai pembanding.",
      evidence: [
        { effect: "plus", paragraph: 0, quote: "korelasi item-total", note: "Uji validitas konstruk." },
        { effect: "plus", paragraph: 1, quote: "Cronbach's alpha", note: "Metode reliabilitas tepat." },
      ],
    },
    {
      paragraphs: [
        "Validitas dan reliabilitas artinya instrumen harus konsisten dan dapat dipercaya.",
        "Caranya dengan menguji ke beberapa orang dan melihat hasilnya sama atau tidak.",
      ],
      scores: [5, 9, 2],
      confidence: "rendah",
      reviewRequired: true,
      reasoning:
        "Jawaban menyamakan validitas dengan reliabilitas (kesalahan umum). Cara uji yang disebut mendekati test-retest sehingga kriteria reliabilitas diberi skor parsial. Tidak ada contoh spesifik.",
      feedback:
        "Kamu sudah menangkap bahwa instrumen perlu diuji sebelum dipakai. Validitas dan reliabilitas adalah dua hal berbeda, jadi jelaskan masing-masing dengan cara ujinya sendiri.",
      evidence: [
        { effect: "minus", paragraph: 0, quote: "harus konsisten dan dapat dipercaya", note: "Validitas disamakan dengan reliabilitas." },
        { effect: "plus", paragraph: 1, quote: "hasilnya sama atau tidak", note: "Mendekati konsep test-retest." },
      ],
    },
  ],
  u1q2: [
    {
      paragraphs: [
        "Sampling probabilitas memberi setiap anggota populasi peluang terpilih yang diketahui, contohnya acak sederhana dan stratified. Non-probabilitas tidak, contohnya purposive dan convenience.",
        "Untuk survei kepuasan mahasiswa saya memilih stratified random sampling berdasarkan fakultas.",
        "Alasannya jumlah mahasiswa tiap fakultas berbeda, sehingga strata membuat sampel lebih representatif dan hasilnya bisa digeneralisasi.",
      ],
      scores: [22, 17, 16],
      confidence: "tinggi",
      reviewRequired: false,
      reasoning:
        "Perbandingan menyebut konsep peluang terpilih. Pilihan stratified sesuai kunci. Alasan menyebut representatif dan generalisasi.",
      feedback:
        "Perbandingan dan pilihan tekniknya tepat, alasannya juga masuk akal. Jawaban akan lebih lengkap bila menyebut risiko bias pada teknik non-probabilitas.",
      evidence: [
        { effect: "plus", paragraph: 0, quote: "peluang terpilih yang diketahui", note: "Inti perbedaan disebut." },
        { effect: "plus", paragraph: 2, quote: "lebih representatif", note: "Alasan sesuai tujuan survei." },
      ],
    },
    {
      paragraphs: [
        "Probabilitas itu acak, non-probabilitas tidak acak.",
        "Saya pilih convenience sampling karena lebih mudah dan cepat, cukup sebar link ke grup angkatan.",
      ],
      scores: [10, 6, 5],
      confidence: "sedang",
      reviewRequired: true,
      reasoning:
        "Perbandingan benar tetapi dangkal. Convenience sampling dipilih tanpa membahas bias (kesalahan umum). Alasan hanya kemudahan.",
      feedback:
        "Perbedaan dasarnya sudah benar. Teknik yang dipilih mudah dilakukan, tetapi hasilnya belum tentu mewakili seluruh mahasiswa. Pertimbangkan teknik yang membuat setiap fakultas terwakili.",
      evidence: [
        { effect: "plus", paragraph: 0, quote: "non-probabilitas tidak acak", note: "Perbedaan dasar benar." },
        { effect: "minus", paragraph: 1, quote: "lebih mudah dan cepat", note: "Alasan tidak membahas keterwakilan." },
      ],
    },
  ],
};

function buildSubmission(
  id: string,
  examId: string,
  studentId: string | null,
  fileName: string,
  questions: Question[],
  variantIndex: number[],
): Pick<Submission, "id" | "examId" | "studentId" | "fileName" | "pages" | "grades"> {
  const pages: AnswerPage[] = [];
  const grades: Grade[] = [];
  questions.forEach((q, qi) => {
    const v = VARIANTS[q.id][variantIndex[qi]];
    const page = qi + 1;
    pages.push({ page, questionId: q.id, paragraphs: v.paragraphs });
    grades.push({
      questionId: q.id,
      aiCriterionScores: Object.fromEntries(q.criteria.map((c, ci) => [c.id, v.scores[ci]])),
      confidence: v.confidence,
      reviewRequired: v.reviewRequired,
      reasoning: v.reasoning,
      studentFeedback: v.feedback,
      evidence: v.evidence.map((e, ei) => ({ ...e, id: `${id}-${q.id}-e${ei}`, page })),
    });
  });
  return { id, examId, studentId, fileName, pages, grades };
}

/**
 * Stand-in for the OCR + AI grading worker. Questions with sample answers reuse them;
 * lecturer-written questions get a clearly labelled simulated result.
 */
export function simulateGrading(
  submissionId: string,
  questions: Question[],
  seed: number,
): Pick<Submission, "pages" | "grades"> & { reviewRequired: boolean } {
  if (questions.every((q) => VARIANTS[q.id])) {
    const built = buildSubmission(submissionId, "", null, "", questions, questions.map((_, i) => (seed + i) % 2));
    return { pages: built.pages, grades: built.grades, reviewRequired: built.grades.some((g) => g.reviewRequired) };
  }
  const pages: AnswerPage[] = questions.map((q, i) => ({
    page: i + 1,
    questionId: q.id,
    paragraphs: ["[Teks OCR simulasi. Jawaban asli mahasiswa akan tampil di sini setelah OCR berjalan.]"],
  }));
  const grades: Grade[] = questions.map((q) => ({
    questionId: q.id,
    aiCriterionScores: Object.fromEntries(q.criteria.map((c) => [c.id, Math.round(c.max * 0.7)])),
    confidence: "rendah",
    reviewRequired: true,
    reasoning: "[Reasoning simulasi. Layanan AI belum terhubung di prototipe ini.]",
    studentFeedback: "[Umpan balik simulasi. Akan diisi oleh layanan AI.]",
    evidence: [],
  }));
  return { pages, grades, reviewRequired: true };
}

const QUIZ_PUBLISHED ="2026-09-20T08:00:00.000Z";

const quizSubs: Submission[] = students.slice(0, 8).map((s, i) => {
  const base = buildSubmission(`sub-k${i + 1}`, "e1", s.id, `${s.nim}_kuis1.pdf`, quizQuestions, [
    i % 3 === 1 ? 1 : 0,
    i % 4 === 1 ? 1 : 0,
  ]);
  return { ...base, status: "published", publishedAt: QUIZ_PUBLISHED };
});

// Overrides recorded before publication; they also seed the feedback memory list.
quizSubs[0].grades[1].override = {
  criterionScores: { k1q2c1: 20, k1q2c2: 19, k1q2c3: 17 },
  reason:
    "Hipotesis sudah dapat diuji walaupun memakai istilah 'durasi'. Pengukuran durasi tersirat dari rumusan per hari.",
  by: LECTURER.name,
  at: "2026-09-19T06:12:00.000Z",
};
quizSubs[1].grades[0].override = {
  criterionScores: { k1q1c1: 7, k1q1c2: 7, k1q1c3: 6 },
  reason: "Definisi singkat tetapi memuat jenis data yang benar, layak ditambah 1 poin tiap definisi.",
  by: LECTURER.name,
  at: "2026-09-19T06:30:00.000Z",
};
quizSubs.forEach((s) =>
  s.grades.forEach((g) => {
    if (!g.override) g.approved = { by: LECTURER.name, at: "2026-09-19T07:00:00.000Z" };
  }),
);

const utsPlan: { student: string | null; file: string; status: Submission["status"]; v: number[] }[] = [
  { student: "s01", file: "2601001_uts.pdf", status: "graded", v: [0, 0] },
  { student: "s02", file: "2601002_uts.pdf", status: "review_required", v: [1, 0] },
  { student: "s03", file: "2601003_uts.pdf", status: "graded", v: [0, 0] },
  { student: "s04", file: "2601004_uts.pdf", status: "review_required", v: [0, 1] },
  { student: "s05", file: "2601005_uts.pdf", status: "ocr_failed", v: [] },
  { student: "s06", file: "2601006_uts.pdf", status: "review_required", v: [1, 1] },
  { student: null, file: "scan_0007.jpg", status: "uploaded", v: [] },
];

const utsSubs: Submission[] = utsPlan.map((p, i) => {
  const id = `sub-u${i + 1}`;
  if (p.v.length === 0) {
    return { id, examId: "e2", studentId: p.student, fileName: p.file, status: p.status, pages: [], grades: [] };
  }
  return { ...buildSubmission(id, "e2", p.student, p.file, utsQuestions, p.v), status: p.status };
});

const exams: Exam[] = [
  {
    id: "e1",
    classId: "c1",
    title: "Kuis 1",
    stage: "publish",
    rubricVersion: 2,
    rubricUpdatedAt: "2026-09-10T03:00:00.000Z",
    questions: quizQuestions,
    studentView: { perQuestion: true, evidence: true, overrideReason: false },
    createdAt: "2026-09-05T02:00:00.000Z",
    publishedAt: QUIZ_PUBLISHED,
    complaintDeadline: "2026-10-04T16:59:00.000Z",
  },
  {
    id: "e2",
    classId: "c1",
    title: "Ujian Tengah Semester",
    stage: "review",
    rubricVersion: 3,
    rubricUpdatedAt: "2026-09-24T09:15:00.000Z",
    questions: utsQuestions,
    studentView: { perQuestion: true, evidence: true, overrideReason: false },
    createdAt: "2026-09-15T02:00:00.000Z",
  },
  {
    id: "e3",
    classId: "c1",
    title: "Tugas Esai",
    stage: "draft",
    rubricVersion: 1,
    rubricUpdatedAt: "2026-09-26T04:00:00.000Z",
    questions: essayQuestions,
    studentView: { perQuestion: true, evidence: true, overrideReason: false },
    createdAt: "2026-09-26T04:00:00.000Z",
  },
];

export const initialData: AppData = {
  lecturer: LECTURER,
  currentStudentId: "s01",
  students,
  classes: [
    {
      id: "c1",
      name: "Metodologi Penelitian",
      code: "MP-201",
      period: PERIOD,
      studentIds: students.slice(0, 8).map((s) => s.id),
    },
    {
      id: "c2",
      name: "Statistika Dasar",
      code: "ST-101",
      period: PERIOD,
      studentIds: ["s09", "s10"],
    },
  ],
  exams,
  submissions: [...quizSubs, ...utsSubs],
  complaints: [
    {
      id: "k-1",
      examId: "e1",
      studentId: "s03",
      questionId: "k1q2",
      reason:
        "Saya sudah menulis hipotesis H0 dan H1 lengkap di halaman 2, tetapi nilai kriteria hipotesis hanya 18. Mohon dicek kembali karena menurut saya hipotesis saya sudah bisa diuji.",
      status: "baru",
      createdAt: "2026-09-25T02:40:00.000Z",
      aiSummary:
        "Mahasiswa menilai kriteria 'Hipotesis dapat diuji' terlalu rendah (18 / 21). Jawaban memang memuat H0 dan H1. Pengurangan dari AI berasal dari cara pengukuran variabel yang belum dijelaskan, yang sebenarnya dinilai di kriteria 'Keterkaitan variabel'.",
    },
    {
      id: "k-2",
      examId: "e1",
      studentId: "s02",
      questionId: "k1q1",
      reason:
        "Contoh kualitatif saya memang kuesioner, tetapi kuesionernya berisi pertanyaan terbuka. Apakah itu tetap dianggap salah?",
      attachmentName: "contoh_kuesioner_terbuka.pdf",
      status: "ditinjau",
      createdAt: "2026-09-23T11:05:00.000Z",
      aiSummary:
        "Mahasiswa berargumen bahwa kuesioner terbuka dapat dipakai dalam penelitian kualitatif. Jawaban aslinya tidak menyebut bahwa kuesioner berisi pertanyaan terbuka. Lampiran berisi contoh kuesioner.",
      decisionNote: "Diminta menunjukkan bagian jawaban yang menyebut pertanyaan terbuka.",
    },
    {
      id: "k-3",
      examId: "e1",
      studentId: "s01",
      questionId: "k1q1",
      reason: "Contoh kuantitatif saya sudah menyebut jumlah responden, mohon ditinjau pengurangannya.",
      status: "ditolak",
      createdAt: "2026-09-21T01:20:00.000Z",
      aiSummary:
        "Mahasiswa meminta peninjauan pengurangan pada kriteria 'Contoh relevan'. Pengurangan terkait instrumen yang tidak disebut, bukan jumlah responden.",
      decisionNote:
        "Pengurangan tetap berlaku karena instrumen pengukuran belum disebut. Jumlah responden sudah dihitung dalam nilai.",
      decidedAt: "2026-09-22T03:00:00.000Z",
    },
  ],
  memory: [
    {
      id: "m-1",
      examId: "e1",
      questionId: "k1q2",
      criterionName: "Hipotesis dapat diuji",
      aiScore: 18,
      lecturerScore: 19,
      max: 21,
      reason: quizSubs[0].grades[1].override!.reason,
      rubricVersion: 2,
      active: true,
    },
    {
      id: "m-2",
      examId: "e1",
      questionId: "k1q1",
      criterionName: "Definisi kualitatif",
      aiScore: 6,
      lecturerScore: 7,
      max: 12,
      reason: quizSubs[1].grades[0].override!.reason,
      rubricVersion: 2,
      active: false,
    },
  ],
  audit: [],
};
