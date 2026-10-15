-- Konflik trait, notifikasi dosen, pemakaian token LLM non-grading,
-- dan fix search_path 4 trigger function.

-- koreksi baru bertentangan dengan trait lama, menunggu keputusan dosen
create table public.trait_conflicts (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  old_trait_id  uuid not null references public.teacher_traits(id) on delete cascade,
  new_trait_id  uuid not null references public.teacher_traits(id) on delete cascade,
  override_id   uuid references public.grade_overrides(id) on delete set null,
  status        text not null default 'pending'
                check (status in ('pending', 'keep_old', 'replace', 'keep_both')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
-- 1 trait lama hanya boleh punya 1 konflik pending
create unique index uq_trait_conflicts_pending
  on public.trait_conflicts (old_trait_id) where status = 'pending';
create index idx_trait_conflicts_teacher
  on public.trait_conflicts (teacher_id, status, created_at desc);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  payload     jsonb not null default '{}'::jsonb,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create unique index uq_notifications_dedupe
  on public.notifications (teacher_id, dedupe_key) where dedupe_key is not null;
create index idx_notifications_teacher
  on public.notifications (teacher_id, created_at desc);
create index idx_notifications_unread
  on public.notifications (teacher_id) where read_at is null;

create table public.llm_usage (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid references public.teachers(id) on delete set null,
  school_plan_id  uuid references public.school_plans(id) on delete set null,
  job             text not null,
  ref_id          uuid,
  model           text,
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  created_at      timestamptz not null default now()
);
create index idx_llm_usage_teacher on public.llm_usage (teacher_id, created_at desc);
create index idx_llm_usage_plan    on public.llm_usage (school_plan_id, created_at desc);

-- hanya backend (service role) yang akses
alter table public.trait_conflicts enable row level security;
alter table public.notifications   enable row level security;
alter table public.llm_usage       enable row level security;

alter function public.grading_runs_fill_refs()     set search_path = public;
alter function public.grading_runs_apply_tokens()  set search_path = public;
alter function public.grading_runs_lock_finished() set search_path = public;
alter function public.set_updated_at()             set search_path = public;
