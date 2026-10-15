# BeeCorrect 🐝

**Koreksi lembar jawaban tulisan tangan dengan AI, tetap dalam kendali dosen.**

Dosen cukup memotret lembar jawaban. BeeCorrect membaca tulisan tangan dan rumus matematika,
menilai setiap kriteria rubrik, lalu menampilkan **bukti nilai langsung di foto jawaban**.
Dosen tinggal review dan umumkan.

> Repo ini bernama `Corrector`; di dalam kode project ini juga disebut **JOINTS**.

| ⏱️ Hemat waktu | 💰 Hemat biaya | 🧾 Biaya per ujian |
|:---:|:---:|:---:|
| **80%** (6,7 jam → 1,3 jam per kelas) | **41%** dibanding koreksi manual | **Rp1.300** per mahasiswa |

<sub>Asumsi: honor dosen Rp20.000/jam, 10 menit koreksi manual per ujian, kelas 40 mahasiswa, ujian 5 halaman.</sub>

---

## Masalah

- Dosen menghabiskan **berjam-jam** membaca tulisan tangan untuk satu kelas.
- **Kelelahan** membuat penilaian **tidak konsisten** antara lembar pertama dan terakhir.
- Rumus matematika tulisan tangan **sulit didigitalkan**, sehingga tool otomatis biasa tidak bisa dipakai.
- Mahasiswa **tidak tahu kenapa** nilainya dipotong, dan **AI grading biasa sulit dipercaya** dosen.

## Solusi

| | Apa yang dilakukan |
|---|---|
| 🔍 **Smart OCR** | Membaca tulisan tangan **dan rumus (LaTeX)** beserta posisinya di foto |
| ✅ **AI Grading Agents** | Menilai setiap kriteria rubrik, hitungan dicek ulang secara matematis |
| 🛡️ **Lecturer in Control** | Mengikuti aturan dosen, menandai jawaban yang meragukan, menunjukkan bukti di foto |

---

## Cara AI menilai

Setiap lembar jawaban diproses oleh pipeline **LangGraph** yang berjalan di background:

```
Foto ─▶ OCR (Datalab) ─▶ Segment AI ─▶ Retrieve Rules ─▶ Grader ×3 ─▶ Math Check ─▶ Judge ─▶ Database
                            │                                           (SymPy)      (jika perlu)
                            └─▶ bukan lembar jawaban? → minta unggah ulang (tidak dinilai 0)
```

| Langkah | Jenis | Kenapa |
|---|---|---|
| **Segment AI** | Agen LLM | Memetakan jawaban ke nomor soal, termasuk jawaban acak, `1a/1b`, dan "lanjutan" di halaman lain |
| **Retrieve Rules** | Query | Mengambil catatan gaya menilai dosen untuk mata kuliah itu |
| **Grader ×3** | Agen LLM | Menilai 3 kali per kriteria lalu mengambil **median**, supaya nilai stabil |
| **Pilihan ganda** | Aturan + LLM | Aturan memastikan jawaban yang jelas benar; LLM mengecek kesetaraan (mis. `1/2` = `0,5`) |
| **Math Check** | Tool (SymPy) | Menghitung ulang turunan, integral, limit, dan aljabar. Kebenaran hitungan dipastikan matematika, bukan tebakan AI |
| **Judge** | Agen LLM | Dipanggil hanya jika grader berbeda pendapat atau hitungan bentrok. Ragu → **Perlu dicek** dosen |

**Belajar dari dosen.** Setiap kali dosen mengoreksi nilai atau menulis catatan, sistem mengubahnya
menjadi aturan baru. Aturan di-embed dengan **Gemini Embedding** dan disimpan di **pgvector**, supaya
catatan yang **bertentangan atau duplikat** terdeteksi sebelum dipakai.

## Fitur lain

- Upload per mahasiswa atau **ZIP satu kelas**.
- **Notifikasi realtime** (SSE) saat proses selesai atau ada konflik catatan.
- **Publish nilai** ke mahasiswa dan **pengajuan keberatan**.
- Rumus ditampilkan rapi dengan **KaTeX** di halaman review.
- Multi-sekolah: admin sekolah, dosen, dan mahasiswa dengan kuota per paket.

## Arsitektur & teknologi

```
Next.js ──foto──▶ FastAPI ──job──▶ Redis + ARQ ──▶ worker-ocr (Datalab OCR)
                                               └─▶ worker (LangGraph + DeepSeek + SymPy)
                                                        │
                       Supabase (Postgres + pgvector + Storage + Auth) ◀──┘
nginx (port 80): / → Next.js · /api → FastAPI · /auth/v1, /storage/v1/object/sign → Supabase
```

| Bagian | Teknologi |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4, KaTeX |
| Backend API | FastAPI, asyncpg (Python 3.13) |
| Antrean | Redis 7 + ARQ (antrean `default` dan `ocr`) |
| AI | DeepSeek V4 Flash (LLM), Gemini Embedding, SymPy, LangGraph |
| OCR | Datalab (Chandra) |
| Database | Supabase (Postgres 17 + pgvector, Storage, Auth) |
| Deploy | Docker Compose + nginx |

```
backend/      FastAPI, worker ARQ, pipeline LangGraph (pipeline/), provider OCR/LLM/storage (providers/)
  tests_ci/   unit test (tanpa DB/Redis/LLM asli)
frontend/     Next.js (halaman dosen & mahasiswa)
supabase/     config.toml, migrations/, seed.sql (akun demo)
deploy/       nginx.conf
scripts/      skrip uji manual (OCR, LLM, storage, end-to-end) — bukan unit test
```

---

## Instalasi

### Persiapan

| Software | Versi | Cek |
|---|---|---|
| Git | terbaru | `git --version` |
| Docker Desktop (Windows/Mac) atau Docker Engine (Linux) | terbaru | `docker --version` |
| Node.js | **20.9+** (disarankan 22) | `node -v` |
| Python | **3.12+** (hanya untuk menjalankan tanpa Docker) | `python --version` |

API key yang dibutuhkan:

| Layanan | Untuk | Daftar di |
|---|---|---|
| DeepSeek | LLM grading | https://platform.deepseek.com |
| Datalab | OCR tulisan tangan | https://www.datalab.to |
| Google AI Studio (Gemini) | embedding catatan dosen | https://aistudio.google.com |

> Tanpa key pun aplikasi bisa dicoba: set `LLM_PROVIDER=fake`, `OCR_PROVIDER=fake`, `EMBEDDING_PROVIDER=fake`.

### Langkah 1. Clone repo

```bash
git clone https://github.com/eleazerv/Corrector.git
cd Corrector
```

### Langkah 2. Jalankan Supabase lokal

Pastikan Docker Desktop menyala, lalu:

```bash
npx supabase start
```

Pertama kali akan mengunduh image (beberapa menit). Migration dan `seed.sql` (akun demo) dijalankan otomatis.

```bash
npx supabase status
```

| Dari `status` | Dipakai untuk |
|---|---|
| API URL (`http://127.0.0.1:54321`) | `SUPABASE_URL` |
| DB URL (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) | `DATABASE_URL` |
| Secret key / service_role key | `SUPABASE_KEY` (backend, **rahasia**) |
| Publishable key / anon key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (frontend) |
| Studio URL (`http://127.0.0.1:54323`) | dashboard database |

**Buat bucket Storage** (sekali saja): buka Studio → **Storage** → **New bucket** → beri nama
(mis. `answer-sheets`), biarkan **Public = off**. Nama ini diisi ke `SUPABASE_BUCKET`.

### Langkah 3. Isi environment backend

```bash
cd backend
cp .env.example .env        # Windows CMD: copy .env.example .env
```

```env
ENV=development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<secret / service_role key>
SUPABASE_BUCKET=answer-sheets
SUPABASE_PUBLIC_URL=http://127.0.0.1:54321

REDIS_URL=redis://localhost:6379
REDIS_API=redis://localhost:6379
WORKER_TOKEN=<string acak minimal 32 karakter>

LLM_API_KEY=<key DeepSeek>
EMBEDDING_API_KEY=<key Gemini>
OCR_PROVIDER=api
OCR_API_URL=<endpoint Datalab>
OCR_API_KEY=<key Datalab>

CORS_ORIGINS=["http://localhost:3000"]
```

Membuat `WORKER_TOKEN` acak:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Lalu pilih **Opsi A (Docker, paling mudah)** atau **Opsi B (manual, untuk development)**.

### Opsi A. Docker Compose

Menjalankan Redis, API, 2 worker, frontend, dan nginx. Supabase tetap dari Langkah 2.

**A1.** Salin `backend/.env` menjadi `backend/.env.docker`, lalu ganti alamat Supabase ke alamat di dalam network Docker:

```env
DATABASE_URL=postgresql://postgres:postgres@supabase_db_JOINTS:5432/postgres
SUPABASE_URL=http://supabase_kong_JOINTS:8000
SUPABASE_PUBLIC_URL=http://localhost
CORS_ORIGINS=["http://localhost"]
```
Port DB di dalam network adalah **5432**, bukan 54322. `REDIS_URL` otomatis di-override compose.

**A2.** Buat `.env` di **root repo** (dibaca saat build frontend):

```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
NEXT_PUBLIC_DEMO_DOSEN_EMAIL=dosen01@und.joints.test
NEXT_PUBLIC_DEMO_MAHASISWA_EMAIL=mhs001@und.joints.test
NEXT_PUBLIC_DEMO_PASSWORD=Joints123!
```

**A3.** Build dan jalankan:

```bash
docker compose up -d --build
docker compose ps
```

Buka **http://localhost** (port 80). Dokumentasi API: http://localhost/docs.

```bash
docker compose logs api --tail 50                    # log (ganti: worker, worker-ocr, frontend, nginx)
docker compose up -d --build api worker worker-ocr   # rebuild backend setelah ubah kode
docker compose up -d --build frontend                # rebuild FE (wajib kalau NEXT_PUBLIC_* berubah)
docker compose down                                  # matikan app (data Supabase tetap aman)
```

### Opsi B. Manual (development, hot reload)

Butuh 5 terminal, semua dari root repo.

```bash
# 1. Redis
docker run -d --name joints-redis -p 6379:6379 redis:7-alpine

# 2. Backend API
cd backend
python -m venv venv
#   Windows PowerShell: .\venv\Scripts\Activate.ps1  |  CMD: venv\Scripts\activate.bat  |  Mac/Linux: source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn main:app --reload --port 8000           # cek http://localhost:8000/docs

# 3. Worker grading   (terminal baru, venv aktif, di folder backend)
arq core.worker.WorkerSettings

# 4. Worker OCR       (terminal baru, venv aktif, di folder backend)
arq core.worker.OcrWorkerSettings

# 5. Frontend
cd frontend
cp .env.example .env.local                       # Windows CMD: copy .env.example .env.local
npm install
npm run dev                                      # buka http://localhost:3000
```

Isi `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
```

---

## Akun demo

Semua akun memakai password **`Joints123!`**.

| Peran | Email |
|---|---|
| Admin sekolah | `admin1@und.joints.test` |
| Dosen | `dosen01@und.joints.test`, `dosen02@und.joints.test` |
| Mahasiswa | `mhs001@und.joints.test`, `mhs002@und.joints.test` |

Akun serupa tersedia untuk `ithb` dan `umt` (mis. `dosen01@ithb.joints.test`).

## Alur pemakaian

1. **Dosen** login → buat ujian → isi soal, kunci jawaban, dan kriteria rubrik → **Tandai siap**.
2. Jadwalkan ujian ke kelas.
3. **Unggah** foto lembar jawaban (per mahasiswa atau ZIP satu kelas).
4. Tunggu OCR dan grading selesai (notifikasi muncul otomatis).
5. **Review** soal bertanda *Perlu dicek*, ubah nilai kalau perlu. Koreksi menjadi catatan baru untuk AI.
6. **Umumkan** nilai. Mahasiswa bisa melihat nilai beserta buktinya dan mengajukan keberatan.

## Test

```bash
cd backend
python -m pytest tests_ci -q      # venv harus aktif
```
`tests_ci` tidak butuh database, Redis, maupun API key (semua layanan luar diganti tiruan).

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Port 54322 terblokir saat `supabase start` (Windows) | CMD **sebagai Administrator**: `net stop winnat` → `netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=10` → `net start winnat` |
| `supabase start` lama / terlihat macet | Sedang mengunduh image. Tunggu, atau lewati Studio: `npx supabase start -x studio` |
| `network supabase_network_JOINTS not found` | Jalankan `npx supabase start` sebelum `docker compose up` |
| `container joints-api-1 is unhealthy` | Pastikan Supabase jalan dan `backend/.env.docker` memakai `supabase_db_JOINTS:5432`. Cek `docker compose logs api` |
| Build frontend gagal: `build arg ... kosong` | `.env` di root repo belum dibuat (Opsi A, langkah A2) |
| Foto jawaban tidak muncul di halaman review | Cek `SUPABASE_PUBLIC_URL`: Docker `http://localhost` (atau IP VM), manual `http://127.0.0.1:54321` |
| `No module named pytest` | Python global yang terpanggil. Aktifkan venv dulu |
| Kode diubah tapi perilaku sama (Docker) | `docker compose up -d --build api worker worker-ocr` |

## Deploy ke VM

1. Install Docker + Node di VM, lalu clone repo.
2. `npx supabase start`, buat bucket, isi `backend/.env.docker` dan `.env` root seperti Opsi A dengan `SUPABASE_PUBLIC_URL=http://<ip-vm>`.
3. `docker compose up -d --build`.
4. **Firewall cloud provider: buka hanya port 22 dan 80.** Port Supabase (54321–54324) jangan dibuka ke publik. Port Docker melewati `ufw`, jadi atur di firewall/security group provider.
5. Buka Studio dari laptop lewat SSH tunnel: `ssh -L 54323:localhost:54323 user@ip-vm`.

## Keamanan

- Jangan commit `.env`, `backend/.env*` (kecuali `.env.example`), dan `frontend/.env.local`.
- `SUPABASE_KEY` (service role) hanya untuk backend, tidak pernah dikirim ke frontend.
- nginx hanya meneruskan `POST /auth/v1/token` (dengan rate limit) dan `GET /storage/v1/object/sign/*` ke Supabase; rute lain ditolak 403.
- Dosen hanya bisa melihat kelas miliknya atau kelas yang ia koreksi.

---

## Limitasi & roadmap

| Saat ini | Rencana |
|---|---|
| Sketsa grafik/diagram terdeteksi sebagai gambar dan masuk review dosen | **Graph grading**: SymPy menghitung kunci grafik (titik potong, ekstrem, asimtot), model vision mencocokkan sketsa |
| Upload berupa foto | Upload **PDF** hasil scan |
| Approve nilai per lembar | Approve **per soal** dan publish sebagian |

## Tim

| Nama | Peran |
|---|---|
| Eleazer | Backend & AI pipeline |
| [Nama] | [Peran] |
| [Nama] | [Peran] |
