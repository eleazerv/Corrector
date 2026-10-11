/**
 * Demo dataset, one array per backend table. Every id starts with "demo-" so the API router can
 * tell demo records from real ones. Names are placeholders ("Mahasiswa 01"), and the UI labels
 * everything from here as sample data.
 */
import type {
  AnswerStatus,
  ClassTestStatus,
  ComplaintStatus,
  EvidenceBox,
  GradingInternal,
  GradingRun,
  OcrBlock,
  PageStatus,
  Question,
  SheetStatus,
  StudentFeedback,
  TeacherTrait,
  TraitEvidence,
} from "../types";

export interface DbClass {
  id: string;
  name: string;
  code: string;
  description: string | null;
}

export interface DbStudent {
  id: string;
  nim: string;
  name: string;
}

export interface DbClassTest {
  id: string;
  class_id: string;
  test_name: string;
  status: ClassTestStatus;
  max_score: number;
  test_date: string | null;
  published_at: string | null;
  rubric_updated_at: string | null;
  questions: Question[];
}

/** test_pages */
export interface DbPage {
  id: string;
  page_no: number;
  status: PageStatus;
  error: string | null;
  ocr_blocks: OcrBlock[];
}

/** test_answers. criteria_result is stored without the criterion text, like the real column. */
export interface DbAnswer {
  id: string;
  question_id: string;
  answer_status: AnswerStatus;
  answer_text: string;
  grade: number;
  criteria_result: { criterion_id: string; points: number; max_points: number; evidence_block_ids: string[]; reasoning: string }[];
  bbox: EvidenceBox[];
  student_feedback: StudentFeedback;
  grading_internal: GradingInternal;
  confidence_grading: number;
  needs_review: boolean;
  ocr_issue: boolean;
}

/** student_tests */
export interface DbSheet {
  id: string;
  class_test_id: string;
  student_id: string;
  status: SheetStatus;
  total_pages: number;
  pages_done: number;
  total_grade: number | null;
  needs_review: boolean;
  pages: DbPage[];
  answers: DbAnswer[];
}

/** grade_overrides */
export interface DbOverride {
  id: string;
  student_test_id: string;
  test_answer_id: string;
  complaint_id: string | null;
  teacher_name: string;
  reason: string;
  old_grade: number | null;
  new_grade: number;
  created_at: string;
}

/** student_complaints */
export interface DbComplaint {
  id: string;
  student_id: string;
  student_test_id: string;
  test_answer_id: string | null;
  status: ComplaintStatus;
  complaint: string;
  ai_summary: string | null;
  ai_recommendation: string | null;
  teacher_response: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** trait_evidences, joined columns resolved at read time */
export type DbEvidence = Pick<TraitEvidence, "override_id" | "relation" | "decided_by" | "similarity"> & { trait_id: string };

export interface Db {
  version: 3;
  teacher: { id: string; name: string; email: string };
  me_student_id: string;
  subject_id: string;
  classes: DbClass[];
  students: DbStudent[];
  enrol: { class_id: string; student_id: string }[];
  class_tests: DbClassTest[];
  sheets: DbSheet[];
  overrides: DbOverride[];
  complaints: DbComplaint[];
  traits: TeacherTrait[];
  evidences: DbEvidence[];
  runs: (Omit<GradingRun, "nim" | "student_name"> & { class_test_id: string })[];
  /** calibration_grades for the demo lecturer */
  calibration: { test_answer_id: string; teacher_grade: number }[];
}

const DAY = 86_400_000;

/* ---------- rubric ---------- */

function q(
  id: string,
  number: number,
  question_type: Question["question_type"],
  question_text: string,
  key_answer: string,
  criteria: [string, number][],
): Question {
  return {
    id: `demo-${id}`,
    number,
    question_type,
    question_text,
    key_answer,
    max_points: criteria.reduce((a, [, p]) => a + p, 0),
    criteria: criteria.map(([description, points], i) => ({ id: `demo-${id}c${i + 1}`, description, points })),
  };
}

const QUIZ: Question[] = [
  q(
    "k1q1",
    1,
    "essay",
    "Jelaskan perbedaan penelitian kualitatif dan kuantitatif, lalu berikan satu contoh untuk masing-masing.",
    "Kualitatif menggali makna dan pengalaman melalui data non-angka (wawancara, observasi). Kuantitatif mengukur variabel dengan data angka dan analisis statistik. Contoh harus sesuai jenisnya. Kesalahan umum: menganggap kuesioner selalu kuantitatif.",
    [
      ["Definisi kualitatif: data non-angka, tujuan memahami makna", 12],
      ["Definisi kuantitatif: pengukuran variabel, analisis statistik", 12],
      ["Contoh relevan untuk tiap jenis, menyebut instrumen", 16],
    ],
  ),
  q(
    "k1q2",
    2,
    "essay",
    "Susun rumusan masalah dan hipotesis untuk topik pengaruh penggunaan media sosial terhadap prestasi belajar.",
    "Rumusan masalah berbentuk pertanyaan yang menyebut kedua variabel dan populasi. Hipotesis berupa pernyataan hubungan yang dapat diuji (H0 dan H1). Hipotesis satu arah diterima bila diberi alasan.",
    [
      ["Rumusan masalah menyebut kedua variabel dan populasi", 21],
      ["Hipotesis H0 dan H1 berupa pernyataan yang dapat diuji", 21],
      ["Keterkaitan variabel dan cara mengukurnya", 18],
    ],
  ),
];

const UTS: Question[] = [
  q(
    "u1q1",
    1,
    "essay",
    "Jelaskan cara menguji validitas dan reliabilitas instrumen penelitian.",
    "Validitas: uji isi (expert judgement) dan uji konstruk (korelasi item-total). Reliabilitas: konsistensi internal, misalnya Cronbach's alpha, atau test-retest. Split-half juga diterima.",
    [
      ["Uji validitas: validitas isi dan korelasi item-total", 16],
      ["Uji reliabilitas: konsistensi internal atau test-retest", 16],
      ["Contoh penerapan pada instrumen nyata", 8],
    ],
  ),
  q(
    "u1q2",
    2,
    "essay",
    "Bandingkan teknik sampling probabilitas dan non-probabilitas, lalu pilih teknik yang tepat untuk survei kepuasan mahasiswa beserta alasannya.",
    "Probabilitas: setiap anggota populasi punya peluang terpilih yang diketahui (acak sederhana, stratified). Non-probabilitas: tidak (purposive, convenience). Untuk survei kepuasan, stratified random sampling per fakultas paling tepat. Cluster per kelas diterima bila alasannya efisiensi.",
    [
      ["Perbandingan probabilitas dan non-probabilitas", 24],
      ["Pilihan teknik untuk survei kepuasan", 18],
      ["Alasan pemilihan: keterwakilan, bias", 18],
    ],
  ),
];

const ESSAY: Question[] = [
  q(
    "t1q1",
    1,
    "essay",
    "Tulis ringkasan kritis satu artikel jurnal tentang metode survei daring.",
    "Ringkasan memuat tujuan, metode, dan temuan utama artikel. Analisis kritis menilai kekuatan dan kelemahan metode survei daring yang dipakai.",
    [
      ["Ringkasan isi: tujuan, metode, temuan", 40],
      ["Analisis kritis kekuatan dan kelemahan metode", 60],
    ],
  ),
];

/* ---------- sample answers, one or two per question ---------- */

interface Variant {
  paragraphs: string[];
  criteria: { points: number; evidence: number[]; reasoning: string }[];
  confidence: number;
  review: boolean;
  ocr_issue?: string;
  feedback: string;
}

export const VARIANTS: Record<string, Variant[]> = {
  k1q1: [
    {
      paragraphs: [
        "Penelitian kualitatif berusaha memahami makna dan pengalaman orang melalui data berupa kata-kata, misalnya dari wawancara dan observasi.",
        "Penelitian kuantitatif mengukur variabel dengan angka lalu dianalisis memakai statistik supaya hasilnya bisa digeneralisasi.",
        "Contoh kualitatif: wawancara mendalam dengan guru honorer tentang beban kerja. Contoh kuantitatif: survei 200 siswa tentang jam belajar dan nilai rapor.",
      ],
      criteria: [
        { points: 11, evidence: [0], reasoning: "Menyebut data non-angka dan tujuan memahami makna. Sifat induktif belum disebut." },
        { points: 11, evidence: [1], reasoning: "Menyebut pengukuran variabel dan analisis statistik." },
        { points: 14, evidence: [2], reasoning: "Kedua contoh sesuai jenisnya. Contoh kuantitatif belum menyebut instrumen, dikurangi 2." },
      ],
      confidence: 0.86,
      review: false,
      feedback:
        "Perbedaan kedua pendekatan sudah dijelaskan dengan tepat. Contoh kuantitatif akan lebih kuat bila menyebut alat ukurnya, misalnya kuesioner skala Likert.",
    },
    {
      paragraphs: [
        "Kualitatif itu penelitian yang tidak pakai angka. Kuantitatif pakai angka.",
        "Contoh kualitatif adalah menyebar kuesioner ke mahasiswa. Contoh kuantitatif menghitung rata-rata nilai.",
      ],
      criteria: [
        { points: 6, evidence: [0], reasoning: "Definisi terlalu singkat, tidak menyebut tujuan menggali makna." },
        { points: 6, evidence: [0], reasoning: "Hanya menyebut jenis data, tanpa pengukuran variabel atau statistik." },
        { points: 6, evidence: [1], reasoning: "Contoh kualitatif memakai kuesioner, kesalahan umum yang tercatat di kunci." },
      ],
      confidence: 0.38,
      review: true,
      ocr_issue: "Sebagian tulisan pada paragraf 2 kabur.",
      feedback:
        "Jawaban sudah membedakan kedua pendekatan dari jenis datanya. Penjelasan tentang tujuan masing-masing masih kurang, dan contoh pertama belum sesuai. Coba bandingkan lagi cara pengumpulan data pada tiap pendekatan.",
    },
  ],
  k1q2: [
    {
      paragraphs: [
        "Rumusan masalah: Apakah terdapat pengaruh durasi penggunaan media sosial terhadap prestasi belajar mahasiswa semester 3?",
        "H0: tidak ada pengaruh durasi penggunaan media sosial terhadap prestasi belajar. H1: ada pengaruh durasi penggunaan media sosial terhadap prestasi belajar.",
        "Variabel bebasnya durasi penggunaan media sosial per hari, variabel terikatnya IPK semester.",
      ],
      criteria: [
        { points: 19, evidence: [0], reasoning: "Menyebut kedua variabel dan populasi (mahasiswa semester 3)." },
        { points: 18, evidence: [1], reasoning: "H0 dan H1 lengkap dan dapat diuji." },
        { points: 15, evidence: [2], reasoning: "Variabel bebas dan terikat jelas, cara mengukur durasi belum dijelaskan." },
      ],
      confidence: 0.72,
      review: false,
      feedback:
        "Rumusan masalah dan hipotesis sudah tersusun rapi. Tambahkan cara mengukur durasi penggunaan media sosial agar variabelnya benar-benar dapat diuji.",
    },
    {
      paragraphs: [
        "Bagaimana media sosial mempengaruhi mahasiswa?",
        "Hipotesis: apakah mahasiswa yang sering main media sosial nilainya turun?",
      ],
      criteria: [
        { points: 9, evidence: [0], reasoning: "Rumusan masalah tidak menyebut variabel terikat maupun populasi yang jelas." },
        { points: 6, evidence: [1], reasoning: "Hipotesis ditulis sebagai pertanyaan, kesalahan umum yang tercatat di kunci." },
        { points: 8, evidence: [0, 1], reasoning: "Hubungan media sosial dan nilai tersirat, tetapi variabel tidak didefinisikan." },
      ],
      confidence: 0.41,
      review: true,
      feedback:
        "Topik yang dipilih sudah sesuai. Rumusan masalah belum menyebut prestasi belajar sebagai hal yang diukur, dan hipotesis perlu ditulis sebagai pernyataan yang bisa dibuktikan benar atau salah.",
    },
  ],
  u1q1: [
    {
      paragraphs: [
        "Validitas diuji dengan meminta pendapat ahli terhadap isi butir soal, lalu dengan korelasi item-total untuk melihat apakah tiap butir mengukur konstruk yang sama.",
        "Reliabilitas diuji dengan Cronbach's alpha. Nilai di atas 0,7 biasanya dianggap cukup konsisten.",
        "Contoh: kuesioner motivasi belajar 20 butir diuji ke 30 responden sebelum dipakai.",
      ],
      criteria: [
        { points: 15, evidence: [0], reasoning: "Menyebut validitas isi lewat penilaian ahli dan korelasi item-total." },
        { points: 14, evidence: [1], reasoning: "Cronbach's alpha dengan ambang 0,7 tepat. Tidak ada metode pembanding." },
        { points: 7, evidence: [2], reasoning: "Contoh relevan: uji coba kuesioner sebelum dipakai." },
      ],
      confidence: 0.9,
      review: false,
      feedback:
        "Penjelasan uji validitas dan reliabilitas sudah lengkap dan runtut. Untuk reliabilitas, kamu bisa menambahkan satu metode lain sebagai pembanding.",
    },
    {
      paragraphs: [
        "Validitas dan reliabilitas artinya instrumen harus konsisten dan dapat dipercaya.",
        "Caranya dengan menguji ke beberapa orang dan melihat hasilnya sama atau tidak.",
      ],
      criteria: [
        { points: 5, evidence: [0], reasoning: "Validitas disamakan dengan reliabilitas, kesalahan umum yang tercatat di kunci." },
        { points: 9, evidence: [1], reasoning: "Cara uji mendekati test-retest, diberi skor parsial." },
        { points: 2, evidence: [], reasoning: "Tidak ada contoh spesifik." },
      ],
      confidence: 0.35,
      review: true,
      feedback:
        "Kamu sudah menangkap bahwa instrumen perlu diuji sebelum dipakai. Validitas dan reliabilitas adalah dua hal berbeda, jadi jelaskan masing-masing dengan cara ujinya sendiri.",
    },
  ],
  u1q2: [
    {
      paragraphs: [
        "Sampling probabilitas memberi setiap anggota populasi peluang terpilih yang diketahui, contohnya acak sederhana dan stratified. Non-probabilitas tidak, contohnya purposive dan convenience.",
        "Untuk survei kepuasan mahasiswa saya memilih stratified random sampling berdasarkan fakultas.",
        "Alasannya jumlah mahasiswa tiap fakultas berbeda, sehingga strata membuat sampel lebih representatif dan hasilnya bisa digeneralisasi.",
      ],
      criteria: [
        { points: 22, evidence: [0], reasoning: "Perbandingan menyebut peluang terpilih yang diketahui, dengan contoh tiap jenis." },
        { points: 17, evidence: [1], reasoning: "Stratified random sampling sesuai kunci." },
        { points: 16, evidence: [2], reasoning: "Alasan menyebut keterwakilan dan generalisasi, belum membahas bias." },
      ],
      confidence: 0.88,
      review: false,
      feedback:
        "Perbandingan dan pilihan tekniknya tepat, alasannya juga masuk akal. Jawaban akan lebih lengkap bila menyebut risiko bias pada teknik non-probabilitas.",
    },
    {
      paragraphs: [
        "Probabilitas itu acak, non-probabilitas tidak acak.",
        "Saya pilih convenience sampling karena lebih mudah dan cepat, cukup sebar link ke grup angkatan.",
      ],
      criteria: [
        { points: 10, evidence: [0], reasoning: "Perbedaan dasar benar tetapi dangkal." },
        { points: 6, evidence: [1], reasoning: "Convenience sampling dipilih tanpa membahas bias, kesalahan umum yang tercatat di kunci." },
        { points: 5, evidence: [1], reasoning: "Alasan hanya kemudahan, tidak membahas keterwakilan." },
      ],
      confidence: 0.55,
      review: true,
      feedback:
        "Perbedaan dasarnya sudah benar. Teknik yang dipilih mudah dilakukan, tetapi hasilnya belum tentu mewakili seluruh mahasiswa. Pertimbangkan teknik yang membuat setiap fakultas terwakili.",
    },
  ],
};

export const round = (n: number) => Math.round(n * 100) / 100;

export function evidenceKind(points: number, max: number): EvidenceBox["kind"] {
  if (points >= max - 1e-9) return "gain";
  return points > 0 ? "partial" : "loss";
}

/** Same fallback sentences as write_feedback() in backend/pipeline/question_nodes.py. */
function pointFeedback(points: number, max: number) {
  const kind = evidenceKind(points, max);
  return kind === "gain" ? "Bagian ini sudah tepat." : kind === "partial" ? "Bagian ini sebagian tepat." : "Bagian ini belum tepat.";
}

/** One OCR block per paragraph, stacked down the page. */
function blocksFor(paragraphs: string[], offset: number): OcrBlock[] {
  return paragraphs.map((text, i) => {
    const y = 60 + ((offset + i) % 4) * 230;
    return { text, label: "Text", bbox: [60, y, 940, y + 200] };
  });
}

export interface Graded {
  answer: DbAnswer;
  /** OCR blocks to append to the page the answer sits on. */
  blocks: OcrBlock[];
}

/**
 * Builds a test_answers row the way finalize() and map_bbox() in the pipeline do. `place` says
 * which page the answer is on and how many blocks that page already holds, so block ids follow
 * the pipeline's "p{page}-{index}" form.
 */
export function buildAnswer(
  sheetId: string,
  question: Question,
  variantIndex: number,
  place: { page: number; offset: number } = { page: question.number, offset: 0 },
): Graded {
  const key = question.id.replace(/^demo-/, "");
  const pool = VARIANTS[key];
  const v: Variant = pool
    ? pool[variantIndex % pool.length]
    : {
        paragraphs: [
          "[Simulasi] Data contoh tidak punya OCR sungguhan. Teks jawaban muncul di sini setelah backend membaca fotonya.",
        ],
        criteria: question.criteria.map(() => ({
          points: 0,
          evidence: [],
          reasoning: "[Simulasi] Penilaian AI sungguhan dibuat oleh worker backend.",
        })),
        confidence: 0.3,
        review: true,
        feedback: "[Simulasi] Umpan balik ditulis oleh layanan AI.",
      };
  const page = place.page;
  const blocks = blocksFor(v.paragraphs, place.offset);
  const bid = (i: number) => `p${page}-${place.offset + i}`;
  const criteria_result = question.criteria.map((c, i) => ({
    criterion_id: c.id,
    points: pool ? v.criteria[i].points : Math.round(c.points * 0.6),
    max_points: c.points,
    evidence_block_ids: v.criteria[i].evidence.map(bid),
    reasoning: v.criteria[i].reasoning,
  }));
  const bbox: EvidenceBox[] = criteria_result.flatMap((c) =>
    c.evidence_block_ids.map((id) => {
      const [x0, y0, x1, y1] = blocks[Number(id.split("-")[1]) - place.offset].bbox;
      return {
        block_id: id,
        page_no: page,
        bbox: [x0, y0, x1, y1] as EvidenceBox["bbox"],
        criterion_id: c.criterion_id,
        kind: evidenceKind(c.points, c.max_points),
      };
    }),
  );
  const grade = round(Math.min(question.max_points, criteria_result.reduce((a, c) => a + c.points, 0)));
  return {
    blocks,
    answer: {
      id: `${sheetId}-a${question.number}`,
      question_id: question.id,
      answer_status: "answered",
      answer_text: v.paragraphs.join("\n"),
      grade,
      criteria_result,
      bbox,
      student_feedback: {
        summary: v.feedback,
        points: criteria_result.map((c, i) => ({
          no: i + 1,
          points: c.points,
          max_points: c.max_points,
          feedback: pointFeedback(c.points, c.max_points),
          block_ids: c.evidence_block_ids,
        })),
      },
      grading_internal: { precheck: null, traits_used: [], notes: pool ? [] : ["Hasil simulasi data contoh."] },
      confidence_grading: v.confidence,
      needs_review: v.review,
      ocr_issue: !!v.ocr_issue,
    },
  };
}

/**
 * Reads every page and grades every question, as the OCR and grading workers would. A sheet
 * without pages (seed data) gets one page per question; an uploaded sheet keeps its page count,
 * and questions beyond the last page land on the last page.
 */
export function applyGrading(sheet: DbSheet, questions: Question[], variant: (q: Question, i: number) => number) {
  if (sheet.pages.length === 0) {
    sheet.pages = questions.map((q) => ({ id: `${sheet.id}-p${q.number}`, page_no: q.number, status: "success", error: null, ocr_blocks: [] }));
  }
  for (const p of sheet.pages) {
    p.status = "success";
    p.error = null;
    p.ocr_blocks = [];
  }
  sheet.answers = questions.map((q, i) => {
    const page = sheet.pages[Math.min(q.number, sheet.pages.length) - 1];
    const g = buildAnswer(sheet.id, q, variant(q, i), { page: page.page_no, offset: page.ocr_blocks.length });
    page.ocr_blocks.push(...g.blocks);
    return g.answer;
  });
  sheet.total_pages = sheet.pages.length;
  sheet.pages_done = sheet.pages.length;
  sheet.total_grade = round(sheet.answers.reduce((a, x) => a + x.grade, 0));
  sheet.needs_review = sheet.answers.some((a) => a.needs_review);
}

/* ---------- assembling the dataset ---------- */

export function createSeed(): Db {
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();

  const students: DbStudent[] = Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { id: `demo-s${n}`, nim: `26010${n}`, name: `Mahasiswa ${n}` };
  });
  const sid = (n: number) => students[n - 1].id;

  const class_tests: DbClassTest[] = [
    {
      id: "demo-ct-kuis1",
      class_id: "demo-c1",
      test_name: "Kuis 1",
      status: "published",
      max_score: 100,
      test_date: iso(-30),
      published_at: iso(-16),
      rubric_updated_at: iso(-28),
      questions: QUIZ,
    },
    {
      id: "demo-ct-uts",
      class_id: "demo-c1",
      test_name: "Ujian Tengah Semester",
      status: "reviewing",
      max_score: 100,
      test_date: iso(-5),
      published_at: null,
      rubric_updated_at: iso(-12),
      questions: UTS,
    },
    {
      id: "demo-ct-esai",
      class_id: "demo-c1",
      test_name: "Tugas Esai",
      status: "scheduled",
      max_score: 100,
      test_date: iso(9),
      published_at: null,
      rubric_updated_at: iso(-2),
      questions: ESSAY,
    },
  ];

  const emptySheet = (ct: DbClassTest, studentNo: number): DbSheet => ({
    id: `${ct.id}-st${String(studentNo).padStart(2, "0")}`,
    class_test_id: ct.id,
    student_id: sid(studentNo),
    status: "graded",
    total_pages: 0,
    pages_done: 0,
    total_grade: null,
    needs_review: false,
    pages: [],
    answers: [],
  });

  function gradedSheet(ct: DbClassTest, studentNo: number, variants: number[]): DbSheet {
    const s = emptySheet(ct, studentNo);
    applyGrading(s, ct.questions, (_q, i) => variants[i]);
    return s;
  }

  const [kuis, uts] = class_tests;
  const lecturer = "Dosen Pengampu";

  // Kuis 1: published. Two answers were changed by the lecturer, every sheet was marked checked.
  const quizSheets = [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) =>
    gradedSheet(kuis, n, [i % 3 === 1 ? 1 : 0, i % 4 === 1 ? 1 : 0]),
  );
  const overrides: DbOverride[] = [];
  const override = (id: string, sheet: DbSheet, qIndex: number, newGrade: number, reason: string, daysAgo: number) => {
    const a = sheet.answers[qIndex];
    overrides.push({
      id,
      student_test_id: sheet.id,
      test_answer_id: a.id,
      complaint_id: null,
      teacher_name: lecturer,
      reason,
      old_grade: a.grade,
      new_grade: newGrade,
      created_at: iso(-daysAgo),
    });
    a.grade = newGrade;
  };
  override(
    "demo-o1",
    quizSheets[0],
    1,
    56,
    "Hipotesis sudah dapat diuji walaupun memakai istilah durasi. Pengukuran durasi tersirat dari rumusan per hari.",
    17,
  );
  override("demo-o2", quizSheets[1], 0, 20, "Definisi singkat tetapi memuat jenis data yang benar, layak ditambah 1 poin tiap definisi.", 17);
  for (const s of quizSheets) {
    for (const a of s.answers) a.needs_review = false;
    s.total_grade = round(s.answers.reduce((x, a) => x + a.grade, 0));
    s.needs_review = false;
    s.status = "published";
  }

  // UTS: graded, some sheets need review, one page unreadable, one grading run failed, one student absent.
  const utsSheets = [
    gradedSheet(uts, 1, [0, 0]),
    gradedSheet(uts, 2, [1, 0]),
    gradedSheet(uts, 3, [0, 0]),
    gradedSheet(uts, 4, [0, 1]),
    gradedSheet(uts, 6, [1, 1]),
  ];
  const unreadable = emptySheet(uts, 5);
  unreadable.status = "needs_reupload";
  unreadable.total_pages = 2;
  unreadable.pages_done = 1;
  unreadable.pages = [
    { id: `${unreadable.id}-p1`, page_no: 1, status: "success", error: null, ocr_blocks: [] },
    {
      id: `${unreadable.id}-p2`,
      page_no: 2,
      status: "needs_reupload",
      error: "[Simulasi] Foto terlalu buram untuk dibaca.",
      ocr_blocks: [],
    },
  ];
  const failed = emptySheet(uts, 7);
  applyGrading(failed, uts.questions, () => 0);
  failed.status = "failed";
  failed.answers = [];
  failed.total_grade = null;
  failed.needs_review = false;
  utsSheets.push(unreadable, failed);

  const runs: Db["runs"] = [...quizSheets, ...utsSheets]
    .filter((s) => s.status !== "needs_reupload")
    .map((s, i) => {
      const ct = s.class_test_id === kuis.id ? kuis : uts;
      const started = iso(ct === kuis ? -29 : -4);
      const ok = s.status !== "failed";
      return {
        id: `demo-run${i + 1}`,
        class_test_id: ct.id,
        student_test_id: s.id,
        trigger_source: "auto",
        attempt: 1,
        status: ok ? "succeeded" : "failed",
        model: "[simulasi]",
        segment_method: "llm",
        tokens_total: ok ? 3000 + ((i * 377) % 1500) : 0,
        questions_total: ct.questions.length,
        questions_needs_review: ok ? s.answers.filter((a) => a.needs_review).length : 0,
        questions_error: ok ? 0 : ct.questions.length,
        total_grade: ok ? s.total_grade : null,
        error: ok ? null : { message: "[Simulasi] Layanan AI tidak merespons." },
        started_at: started,
        finished_at: new Date(new Date(started).getTime() + 40_000 + i * 1_300).toISOString(),
        duration_ms: 40_000 + i * 1_300,
      };
    });

  const subject_id = "demo-subj1";
  const traits: TeacherTrait[] = [
    {
      id: "demo-tr1",
      subject_id,
      class_id: "demo-c1",
      category: "Penilaian hipotesis",
      aspect: "Istilah variabel",
      condition: "Hipotesis memakai istilah lain untuk variabel yang sama",
      direction: "lenient",
      canonical_text:
        "Hipotesis tetap dianggap dapat diuji bila variabelnya jelas walaupun memakai istilah berbeda, misalnya durasi untuk intensitas penggunaan.",
      evidence_count: 1,
      last_seen: iso(-17),
      is_active: true,
      source: "learned",
      updated_at: iso(-17),
    },
    {
      id: "demo-tr2",
      subject_id,
      class_id: "demo-c1",
      category: "Definisi konsep",
      aspect: "Kelengkapan definisi",
      condition: "Definisi singkat yang hanya menyebut jenis data",
      direction: "lenient",
      canonical_text: "Definisi singkat yang menyebut jenis data dengan benar layak diberi tambahan 1 poin.",
      evidence_count: 1,
      last_seen: iso(-17),
      is_active: false,
      source: "learned",
      updated_at: iso(-15),
    },
  ];

  const complaints: DbComplaint[] = [
    {
      id: "demo-k1",
      student_id: sid(3),
      student_test_id: quizSheets[2].id,
      test_answer_id: quizSheets[2].answers[1].id,
      status: "pending",
      complaint:
        "Saya sudah menulis hipotesis H0 dan H1 lengkap di halaman 2, tetapi nilai kriteria hipotesis hanya 18. Mohon dicek kembali karena menurut saya hipotesis saya sudah bisa diuji.",
      ai_summary:
        "Mahasiswa menilai kriteria hipotesis terlalu rendah (18 dari 21). Jawaban memang memuat H0 dan H1. Pengurangan terbesar ada di kriteria keterkaitan variabel, karena cara mengukur durasi belum dijelaskan.",
      ai_recommendation:
        "review: Hipotesis sudah lengkap, tetapi pengurangan 3 poin di kriteria hipotesis tidak dijelaskan rinci. Perlu dicek dosen.",
      teacher_response: null,
      resolved_at: null,
      created_at: iso(-3),
    },
    {
      id: "demo-k2",
      student_id: sid(2),
      student_test_id: quizSheets[1].id,
      test_answer_id: null,
      status: "pending",
      complaint:
        "Contoh kualitatif saya memang kuesioner, tetapi kuesionernya berisi pertanyaan terbuka. Mohon nilai total saya ditinjau ulang.",
      ai_summary:
        "Mahasiswa berargumen bahwa kuesioner terbuka dapat dipakai dalam penelitian kualitatif. Jawaban aslinya tidak menyebut bahwa kuesioner berisi pertanyaan terbuka.",
      ai_recommendation: "reject: Jawaban tertulis tidak memuat keterangan pertanyaan terbuka.",
      teacher_response: null,
      resolved_at: null,
      created_at: iso(-5),
    },
    {
      id: "demo-k3",
      student_id: sid(1),
      student_test_id: quizSheets[0].id,
      test_answer_id: quizSheets[0].answers[0].id,
      status: "rejected",
      complaint: "Contoh kuantitatif saya sudah menyebut jumlah responden, mohon ditinjau pengurangannya.",
      ai_summary:
        "Mahasiswa meminta peninjauan pengurangan pada kriteria contoh. Pengurangan terkait instrumen yang tidak disebut, bukan jumlah responden.",
      ai_recommendation: "reject: Pengurangan sesuai kunci, instrumen belum disebut.",
      teacher_response:
        "Pengurangan tetap berlaku karena instrumen pengukuran belum disebut. Jumlah responden sudah dihitung dalam nilai.",
      resolved_at: iso(-7),
      created_at: iso(-8),
    },
  ];

  return {
    version: 3,
    teacher: { id: "demo-t1", name: lecturer, email: "dosen@contoh.test" },
    me_student_id: sid(1),
    subject_id,
    classes: [
      { id: "demo-c1", name: "Metodologi Penelitian", code: "MP-201", description: "Semester ganjil 2026/2027" },
      { id: "demo-c2", name: "Statistika Dasar", code: "ST-101", description: null },
    ],
    students,
    enrol: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ class_id: "demo-c1", student_id: sid(n) })),
      { class_id: "demo-c2", student_id: sid(9) },
      { class_id: "demo-c2", student_id: sid(10) },
    ],
    class_tests,
    sheets: [...quizSheets, ...utsSheets],
    overrides,
    complaints,
    traits,
    evidences: [
      { trait_id: "demo-tr1", override_id: "demo-o1", relation: "support", decided_by: "rule", similarity: null },
      { trait_id: "demo-tr2", override_id: "demo-o2", relation: "support", decided_by: "rule", similarity: null },
    ],
    runs,
    calibration: [],
  };
}
