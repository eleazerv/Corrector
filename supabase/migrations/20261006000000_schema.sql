-- Skema JOINTS (pg_dump) yang disesuaikan untuk migrasi Supabase lokal:
--   1) baris \restrict / \unrestrict dihapus (perintah khusus psql)
--   2) CREATE SCHEMA public + COMMENT ON SCHEMA public dihapus (skema itu sudah ada)
--   3) baris create extension di bawah ini ditambahkan (tabel memakai tipe public.vector)
create extension if not exists vector with schema public;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth_school_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_school_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return coalesce(
    (select school_id from teachers where user_id = auth.uid() limit 1),
    (select school_id from students where user_id = auth.uid() limit 1),
    (select school_id from school_admins where user_id = auth.uid() and is_active limit 1)
  );
end $$;


--
-- Name: auth_student_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_student_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (select id from students where user_id = auth.uid() limit 1);
end $$;


--
-- Name: auth_teacher_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_teacher_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (select id from teachers where user_id = auth.uid() limit 1);
end $$;


--
-- Name: grading_runs_apply_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grading_runs_apply_tokens() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'running' and new.status <> 'running'
     and new.tokens_total > 0 and new.school_plan_id is not null then

    update school_plans set token_used = token_used + new.tokens_total
    where id = new.school_plan_id;

    if new.teacher_id is not null then
      insert into teacher_plans (teacher_id, school_plan_id, token_used)
      values (new.teacher_id, new.school_plan_id, new.tokens_total)
      on conflict (teacher_id, school_plan_id)
      do update set token_used = teacher_plans.token_used + excluded.token_used;
    end if;
  end if;
  return null;   -- AFTER trigger: nilai return diabaikan
end $$;


--
-- Name: grading_runs_fill_refs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grading_runs_fill_refs() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_class_test_id uuid;
  v_corrector_id  uuid;
begin
  select st.class_test_id, ct.corrector_id
    into v_class_test_id, v_corrector_id
  from student_tests st join class_tests ct on ct.id = st.class_test_id
  where st.id = new.student_test_id;

  if new.class_test_id is null then
    new.class_test_id := v_class_test_id;
  elsif new.class_test_id <> v_class_test_id then
    raise exception 'grading_runs: class_test_id % tidak cocok dengan student_test %',
      new.class_test_id, new.student_test_id;
  end if;

  if new.teacher_id is null then
    new.teacher_id := v_corrector_id;
  end if;
  return new;
end $$;


--
-- Name: grading_runs_lock_finished(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grading_runs_lock_finished() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if old.status <> 'running' then
    raise exception 'grading_runs: run % sudah selesai (%) dan tidak bisa diubah', old.id, old.status;
  end if;
  if new.student_test_id <> old.student_test_id or new.class_test_id <> old.class_test_id then
    raise exception 'grading_runs: student_test_id / class_test_id tidak boleh diubah';
  end if;
  return new;
end $$;


--
-- Name: is_school_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_school_admin(p_school_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from school_admins
    where user_id = auth.uid() and school_id = p_school_id and is_active
  );
end $$;


--
-- Name: is_subject_coordinator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_subject_coordinator(p_subject_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from subject_coordinators
    where subject_id = p_subject_id and teacher_id = public.auth_teacher_id()
  );
end $$;


--
-- Name: refresh_school_plans(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_school_plans() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  update school_plans set plan_status = 'ended'
  where plan_status = 'on' and end_date <= now();

  update school_plans sp set plan_status = 'on'
  where sp.plan_status = 'paused' and sp.payment_status = 'paid'
    and sp.start_date <= now() and sp.end_date > now()
    and not exists (select 1 from school_plans x where x.school_id = sp.school_id and x.plan_status = 'on');
end $$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: school_of_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_of_class(p_class_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (select school_id from classes where id = p_class_id);
end $$;


--
-- Name: school_of_class_test(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_of_class_test(p_class_test_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (select c.school_id from class_tests ct join classes c on c.id = ct.class_id where ct.id = p_class_test_id);
end $$;


--
-- Name: school_of_student_test(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_of_student_test(p_student_test_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (
    select c.school_id
    from student_tests st
    join class_tests ct on ct.id = st.class_test_id
    join classes c on c.id = ct.class_id
    where st.id = p_student_test_id
  );
end $$;


--
-- Name: school_of_subject(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_of_subject(p_subject_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (select school_id from subjects where id = p_subject_id);
end $$;


--
-- Name: school_of_test(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_of_test(p_test_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return (select s.school_id from tests t join subjects s on s.id = t.subject_id where t.id = p_test_id);
end $$;


--
-- Name: school_quota(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_quota(p_school_id uuid) RETURNS TABLE(school_plan_id uuid, plan_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, grading_quota_total integer, grading_used integer, grading_remaining integer, teacher_limit integer, token_used bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select sp.id, p.name, sp.start_date, sp.end_date,
         p.grading_quota * sp.total_month,
         sp.grading_used,
         case when p.grading_quota is null then null
              else greatest(p.grading_quota * sp.total_month - sp.grading_used, 0) end,
         p.teacher_count,
         sp.token_used
  from school_plans sp join plans p on p.id = sp.plan_id
  where sp.school_id = p_school_id
    and sp.plan_status = 'on' and sp.payment_status = 'paid'
    and now() >= sp.start_date and now() < sp.end_date
  limit 1
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: student_can_view_test(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_can_view_test(p_test_id uuid, p_published_only boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from class_tests ct
    join student_classes sc on sc.class_id = ct.class_id
    where ct.test_id = p_test_id
      and sc.student_id = public.auth_student_id()
      and (not p_published_only or ct.published_at is not null)
  );
end $$;


--
-- Name: student_in_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_in_class(p_class_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from student_classes
    where class_id = p_class_id and student_id = public.auth_student_id()
  );
end $$;


--
-- Name: student_tests_charge_quota(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_tests_charge_quota() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_school_id uuid;
  v_plan_id uuid;
begin
  if new.status not in ('graded', 'reviewed', 'published') or new.quota_charged_at is not null then
    return new;
  end if;

  select c.school_id into v_school_id
  from class_tests ct join classes c on c.id = ct.class_id
  where ct.id = new.class_test_id;

  select q.school_plan_id into v_plan_id from public.school_quota(v_school_id) q;
  if v_plan_id is null then
    return new;                       -- tidak ada plan aktif → tidak dicatat
  end if;

  update school_plans set grading_used = grading_used + 1 where id = v_plan_id;
  new.quota_school_plan_id := v_plan_id;
  new.quota_charged_at := now();
  return new;
end $$;


--
-- Name: teacher_can_access_class_test(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.teacher_can_access_class_test(p_class_test_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from class_tests ct join classes c on c.id = ct.class_id
    where ct.id = p_class_test_id
      and (ct.corrector_id = public.auth_teacher_id() or c.teacher_id = public.auth_teacher_id())
  );
end $$;


--
-- Name: teacher_can_access_student_test(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.teacher_can_access_student_test(p_student_test_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from student_tests st
    where st.id = p_student_test_id
      and public.teacher_can_access_class_test(st.class_test_id)
  );
end $$;


--
-- Name: teacher_can_manage_test(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.teacher_can_manage_test(p_test_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return exists (
    select 1 from tests t
    where t.id = p_test_id
      and (t.maker_id = public.auth_teacher_id() or public.is_subject_coordinator(t.subject_id))
  );
end $$;


--
-- Name: teachers_enforce_plan_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.teachers_enforce_plan_limit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_limit int;
  v_count int;
begin
  select q.teacher_limit into v_limit from public.school_quota(new.school_id) q;
  if v_limit is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('teachers:' || new.school_id::text));   -- cegah race 2 insert bersamaan
  select count(*) into v_count from teachers where school_id = new.school_id;
  if v_count >= v_limit then
    raise exception 'Batas guru plan aktif sudah tercapai (%/%)', v_count, v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: calibration_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calibration_grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_answer_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    teacher_grade numeric,
    teacher_criteria_result jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: checkpoint_blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_blobs (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    channel text NOT NULL,
    version text NOT NULL,
    type text NOT NULL,
    blob bytea
);


--
-- Name: checkpoint_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_migrations (
    v integer NOT NULL
);


--
-- Name: checkpoint_writes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_writes (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    checkpoint_id text NOT NULL,
    task_id text NOT NULL,
    idx integer NOT NULL,
    channel text NOT NULL,
    type text,
    blob bytea NOT NULL,
    task_path text DEFAULT ''::text NOT NULL
);


--
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoints (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    checkpoint_id text NOT NULL,
    parent_checkpoint_id text,
    type text,
    checkpoint jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: class_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    corrector_id uuid,
    class_id uuid NOT NULL,
    test_id uuid NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    test_date timestamp with time zone NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT class_tests_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'uploading'::text, 'processing'::text, 'reviewing'::text, 'published'::text])))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: grade_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grade_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_test_id uuid NOT NULL,
    test_answer_id uuid NOT NULL,
    complaint_id uuid,
    teacher_id uuid NOT NULL,
    reason text,
    old_grade numeric,
    new_grade numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    trait_processed_at timestamp with time zone
);


--
-- Name: grading_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grading_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_test_id uuid NOT NULL,
    class_test_id uuid NOT NULL,
    teacher_id uuid,
    school_plan_id uuid,
    thread_id text NOT NULL,
    trigger_source text DEFAULT 'auto'::text NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    model text,
    segment_method text,
    tokens_total bigint DEFAULT 0 NOT NULL,
    questions_total integer DEFAULT 0 NOT NULL,
    questions_needs_review integer DEFAULT 0 NOT NULL,
    questions_error integer DEFAULT 0 NOT NULL,
    total_grade numeric,
    error jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer GENERATED ALWAYS AS (((EXTRACT(epoch FROM (finished_at - started_at)) * (1000)::numeric))::integer) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grading_runs_attempt_check CHECK ((attempt >= 1)),
    CONSTRAINT grading_runs_finished_after_started CHECK (((finished_at IS NULL) OR (finished_at >= started_at))),
    CONSTRAINT grading_runs_question_counts CHECK (((questions_needs_review + questions_error) <= questions_total)),
    CONSTRAINT grading_runs_questions_error_check CHECK ((questions_error >= 0)),
    CONSTRAINT grading_runs_questions_review_check CHECK ((questions_needs_review >= 0)),
    CONSTRAINT grading_runs_questions_total_check CHECK ((questions_total >= 0)),
    CONSTRAINT grading_runs_running_iff_unfinished CHECK (((status = 'running'::text) = (finished_at IS NULL))),
    CONSTRAINT grading_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'quota_exceeded'::text, 'skipped'::text]))),
    CONSTRAINT grading_runs_tokens_check CHECK ((tokens_total >= 0)),
    CONSTRAINT grading_runs_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['auto'::text, 'regrade'::text, 'manual'::text, 'retry'::text])))
);


--
-- Name: TABLE grading_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.grading_runs IS 'Log run pipeline grading per siswa. Baris yang sudah selesai tidak bisa diubah (audit).';


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    teacher_count integer,
    grading_quota integer,
    description text NOT NULL,
    price_per_month numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT plans_grading_quota_check CHECK (((grading_quota IS NULL) OR (grading_quota >= 0))),
    CONSTRAINT plans_teacher_count_check CHECK (((teacher_count IS NULL) OR (teacher_count > 0)))
);


--
-- Name: question_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    description text NOT NULL,
    points integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT question_criteria_points_check CHECK ((points > 0))
);


--
-- Name: question_trait_picks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_trait_picks (
    question_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    version text NOT NULL,
    picked jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: school_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    school_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: school_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone NOT NULL,
    grading_used integer DEFAULT 0 NOT NULL,
    total_month integer NOT NULL,
    total_payment numeric NOT NULL,
    external_payment_id text,
    payment_invoice_url text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    plan_status text DEFAULT 'on'::text NOT NULL,
    token_used bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT school_plans_dates_check CHECK ((end_date > start_date)),
    CONSTRAINT school_plans_grading_used_check CHECK ((grading_used >= 0)),
    CONSTRAINT school_plans_on_requires_paid CHECK (((plan_status <> 'on'::text) OR (payment_status = 'paid'::text))),
    CONSTRAINT school_plans_paid_has_paid_at CHECK (((payment_status <> 'paid'::text) OR (paid_at IS NOT NULL))),
    CONSTRAINT school_plans_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'refunded'::text]))),
    CONSTRAINT school_plans_plan_status_check CHECK ((plan_status = ANY (ARRAY['on'::text, 'ended'::text, 'paused'::text]))),
    CONSTRAINT school_plans_total_month_check CHECK (((total_month >= 1) AND (total_month <= 12)))
);


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school text NOT NULL,
    location text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL
);


--
-- Name: student_complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    student_test_id uuid NOT NULL,
    test_answer_id uuid,
    complaint text NOT NULL,
    teacher_response text,
    resolved_at timestamp with time zone,
    ai_summary text,
    ai_recommendation text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_complaints_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: student_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_test_id uuid NOT NULL,
    student_id uuid NOT NULL,
    total_grade numeric,
    total_pages integer DEFAULT 0 NOT NULL,
    pages_done integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'ocr_queued'::text NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    quota_school_plan_id uuid,
    quota_charged_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_tests_pages_check CHECK ((pages_done <= total_pages)),
    CONSTRAINT student_tests_status_check CHECK ((status = ANY (ARRAY['absent'::text, 'needs_reupload'::text, 'failed'::text, 'ocr_queued'::text, 'ocr_processing'::text, 'grading'::text, 'graded'::text, 'reviewed'::text, 'published'::text, 'quota_exceeded'::text])))
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    school_id uuid NOT NULL,
    nim text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: subject_coordinators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_coordinators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: subject_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    title text NOT NULL,
    rule text NOT NULL,
    category text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: teacher_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    school_plan_id uuid NOT NULL,
    token_used bigint DEFAULT 0 NOT NULL
);


--
-- Name: teacher_traits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_traits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    subject_id uuid,
    class_id uuid,
    category text,
    aspect text,
    condition text,
    direction text,
    canonical_text text NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    embedding public.vector(768),
    embedding_model text DEFAULT 'gemini-embedding-001'::text,
    last_seen timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    source text DEFAULT 'learned'::text NOT NULL,
    CONSTRAINT teacher_traits_direction_check CHECK ((direction = ANY (ARRAY['lenient'::text, 'stricter'::text]))),
    CONSTRAINT teacher_traits_source_check CHECK ((source = ANY (ARRAY['learned'::text, 'manual'::text])))
);


--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    code text NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: test_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_test_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_status text,
    answer_text text,
    bbox jsonb,
    grade numeric,
    criteria_result jsonb,
    grading_internal jsonb,
    student_feedback jsonb,
    confidence_grading numeric,
    needs_review boolean DEFAULT false NOT NULL,
    ocr_issue boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT test_answers_answer_status_check CHECK ((answer_status = ANY (ARRAY['answered'::text, 'unanswered'::text, 'irrelevant'::text, 'unmapped'::text]))),
    CONSTRAINT test_answers_confidence_check CHECK (((confidence_grading >= (0)::numeric) AND (confidence_grading <= (1)::numeric)))
);


--
-- Name: test_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_test_id uuid NOT NULL,
    page_no integer NOT NULL,
    image_path text NOT NULL,
    ocr_result jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    error jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT test_pages_status_check CHECK ((status = ANY (ARRAY['needs_reupload'::text, 'success'::text, 'failed'::text, 'processing'::text, 'pending'::text])))
);


--
-- Name: test_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    number integer NOT NULL,
    question_type text DEFAULT 'essay'::text NOT NULL,
    question_text text NOT NULL,
    max_points integer NOT NULL,
    key_answer text NOT NULL,
    key_answer_embedding public.vector(768),
    embedding_model text DEFAULT 'gemini-embedding-001'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT test_questions_max_points_check CHECK ((max_points > 0)),
    CONSTRAINT test_questions_type_check CHECK ((question_type = ANY (ARRAY['objective'::text, 'essay'::text, 'calculation'::text])))
);


--
-- Name: tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    maker_id uuid,
    name text NOT NULL,
    max_score integer DEFAULT 100,
    test_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'archived'::text]))),
    CONSTRAINT tests_test_type_check CHECK ((test_type = ANY (ARRAY['ASG'::text, 'FINAL'::text, 'MID'::text])))
);


--
-- Name: trait_evidences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trait_evidences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trait_id uuid NOT NULL,
    override_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    similarity numeric,
    decided_by text,
    relation text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT trait_evidences_decided_by_check CHECK ((decided_by = ANY (ARRAY['rule'::text, 'llm'::text]))),
    CONSTRAINT trait_evidences_relation_check CHECK ((relation = ANY (ARRAY['support'::text, 'contradict'::text])))
);


--
-- Name: v_student_complaints; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_student_complaints AS
 SELECT id,
    student_test_id,
    test_answer_id,
    complaint,
    status,
    teacher_response,
    resolved_at,
    created_at
   FROM public.student_complaints sc
  WHERE (student_id = public.auth_student_id());


--
-- Name: v_student_test_answers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_student_test_answers AS
 SELECT ta.id,
    ta.student_test_id,
    ta.question_id,
    ta.answer_status,
    ta.answer_text,
    ta.bbox,
    ta.grade,
    ta.student_feedback
   FROM (public.test_answers ta
     JOIN public.student_tests st ON ((st.id = ta.student_test_id)))
  WHERE ((st.student_id = public.auth_student_id()) AND (st.status = 'published'::text));


--
-- Name: calibration_grades calibration_grades_answer_teacher_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_grades
    ADD CONSTRAINT calibration_grades_answer_teacher_key UNIQUE (test_answer_id, teacher_id);


--
-- Name: calibration_grades calibration_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_grades
    ADD CONSTRAINT calibration_grades_pkey PRIMARY KEY (id);


--
-- Name: checkpoint_blobs checkpoint_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_blobs
    ADD CONSTRAINT checkpoint_blobs_pkey PRIMARY KEY (thread_id, checkpoint_ns, channel, version);


--
-- Name: checkpoint_migrations checkpoint_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_migrations
    ADD CONSTRAINT checkpoint_migrations_pkey PRIMARY KEY (v);


--
-- Name: checkpoint_writes checkpoint_writes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_writes
    ADD CONSTRAINT checkpoint_writes_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx);


--
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id);


--
-- Name: class_tests class_tests_class_test_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tests
    ADD CONSTRAINT class_tests_class_test_key UNIQUE (class_id, test_id);


--
-- Name: class_tests class_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tests
    ADD CONSTRAINT class_tests_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: classes classes_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_code_key UNIQUE (school_id, code);


--
-- Name: grade_overrides grade_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_overrides
    ADD CONSTRAINT grade_overrides_pkey PRIMARY KEY (id);


--
-- Name: grading_runs grading_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_runs
    ADD CONSTRAINT grading_runs_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: question_criteria question_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_criteria
    ADD CONSTRAINT question_criteria_pkey PRIMARY KEY (id);


--
-- Name: question_trait_picks question_trait_picks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_trait_picks
    ADD CONSTRAINT question_trait_picks_pkey PRIMARY KEY (question_id, teacher_id);


--
-- Name: school_admins school_admins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_email_key UNIQUE (email);


--
-- Name: school_admins school_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_pkey PRIMARY KEY (id);


--
-- Name: school_admins school_admins_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_user_id_key UNIQUE (user_id);


--
-- Name: school_plans school_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_plans
    ADD CONSTRAINT school_plans_pkey PRIMARY KEY (id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: student_classes student_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_pkey PRIMARY KEY (id);


--
-- Name: student_classes student_classes_student_class_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_student_class_key UNIQUE (student_id, class_id);


--
-- Name: student_complaints student_complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_complaints
    ADD CONSTRAINT student_complaints_pkey PRIMARY KEY (id);


--
-- Name: student_tests student_tests_class_test_student_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_tests
    ADD CONSTRAINT student_tests_class_test_student_key UNIQUE (class_test_id, student_id);


--
-- Name: student_tests student_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_tests
    ADD CONSTRAINT student_tests_pkey PRIMARY KEY (id);


--
-- Name: students students_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_email_key UNIQUE (email);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_school_nim_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_nim_key UNIQUE (school_id, nim);


--
-- Name: students students_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_key UNIQUE (user_id);


--
-- Name: subject_coordinators subject_coordinators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_coordinators
    ADD CONSTRAINT subject_coordinators_pkey PRIMARY KEY (id);


--
-- Name: subject_coordinators subject_coordinators_subject_teacher_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_coordinators
    ADD CONSTRAINT subject_coordinators_subject_teacher_key UNIQUE (subject_id, teacher_id);


--
-- Name: subject_rules subject_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_rules
    ADD CONSTRAINT subject_rules_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_code_key UNIQUE (school_id, code);


--
-- Name: teacher_plans teacher_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_plans
    ADD CONSTRAINT teacher_plans_pkey PRIMARY KEY (id);


--
-- Name: teacher_plans teacher_plans_teacher_plan_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_plans
    ADD CONSTRAINT teacher_plans_teacher_plan_key UNIQUE (teacher_id, school_plan_id);


--
-- Name: teacher_traits teacher_traits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_traits
    ADD CONSTRAINT teacher_traits_pkey PRIMARY KEY (id);


--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- Name: teachers teachers_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_school_code_key UNIQUE (school_id, code);


--
-- Name: teachers teachers_school_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_school_email_key UNIQUE (school_id, email);


--
-- Name: teachers teachers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_key UNIQUE (user_id);


--
-- Name: test_answers test_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_answers
    ADD CONSTRAINT test_answers_pkey PRIMARY KEY (id);


--
-- Name: test_answers test_answers_student_test_question_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_answers
    ADD CONSTRAINT test_answers_student_test_question_key UNIQUE (student_test_id, question_id);


--
-- Name: test_pages test_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_pages
    ADD CONSTRAINT test_pages_pkey PRIMARY KEY (id);


--
-- Name: test_pages test_pages_student_test_page_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_pages
    ADD CONSTRAINT test_pages_student_test_page_key UNIQUE (student_test_id, page_no);


--
-- Name: test_questions test_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_questions
    ADD CONSTRAINT test_questions_pkey PRIMARY KEY (id);


--
-- Name: test_questions test_questions_test_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_questions
    ADD CONSTRAINT test_questions_test_number_key UNIQUE (test_id, number);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: trait_evidences trait_evidences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trait_evidences
    ADD CONSTRAINT trait_evidences_pkey PRIMARY KEY (id);


--
-- Name: trait_evidences trait_evidences_trait_override_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trait_evidences
    ADD CONSTRAINT trait_evidences_trait_override_key UNIQUE (trait_id, override_id);


--
-- Name: checkpoint_blobs_thread_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkpoint_blobs_thread_id_idx ON public.checkpoint_blobs USING btree (thread_id);


--
-- Name: checkpoint_writes_thread_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkpoint_writes_thread_id_idx ON public.checkpoint_writes USING btree (thread_id);


--
-- Name: checkpoints_thread_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkpoints_thread_id_idx ON public.checkpoints USING btree (thread_id);


--
-- Name: idx_calibration_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calibration_teacher ON public.calibration_grades USING btree (teacher_id);


--
-- Name: idx_class_tests_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_tests_class ON public.class_tests USING btree (class_id);


--
-- Name: idx_class_tests_corrector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_tests_corrector ON public.class_tests USING btree (corrector_id);


--
-- Name: idx_class_tests_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_class_tests_test ON public.class_tests USING btree (test_id);


--
-- Name: idx_classes_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_school ON public.classes USING btree (school_id);


--
-- Name: idx_classes_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_teacher ON public.classes USING btree (teacher_id);


--
-- Name: idx_complaints_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_pending ON public.student_complaints USING btree (student_test_id) WHERE (status = 'pending'::text);


--
-- Name: idx_complaints_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_student ON public.student_complaints USING btree (student_id);


--
-- Name: idx_complaints_student_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_student_test ON public.student_complaints USING btree (student_test_id);


--
-- Name: idx_complaints_test_answer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_test_answer ON public.student_complaints USING btree (test_answer_id);


--
-- Name: idx_evidences_override; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidences_override ON public.trait_evidences USING btree (override_id);


--
-- Name: idx_evidences_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidences_teacher ON public.trait_evidences USING btree (teacher_id);


--
-- Name: idx_grading_runs_class_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grading_runs_class_test ON public.grading_runs USING btree (class_test_id, started_at DESC);


--
-- Name: idx_grading_runs_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grading_runs_failed ON public.grading_runs USING btree (class_test_id, started_at DESC) WHERE (status = ANY (ARRAY['failed'::text, 'quota_exceeded'::text]));


--
-- Name: idx_grading_runs_running; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grading_runs_running ON public.grading_runs USING btree (started_at) WHERE (status = 'running'::text);


--
-- Name: idx_grading_runs_school_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grading_runs_school_plan ON public.grading_runs USING btree (school_plan_id, started_at DESC);


--
-- Name: idx_grading_runs_student_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grading_runs_student_test ON public.grading_runs USING btree (student_test_id, started_at DESC);


--
-- Name: idx_grading_runs_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grading_runs_teacher ON public.grading_runs USING btree (teacher_id, started_at DESC);


--
-- Name: idx_overrides_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_complaint ON public.grade_overrides USING btree (complaint_id);


--
-- Name: idx_overrides_student_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_student_test ON public.grade_overrides USING btree (student_test_id);


--
-- Name: idx_overrides_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_teacher ON public.grade_overrides USING btree (teacher_id);


--
-- Name: idx_overrides_test_answer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_test_answer ON public.grade_overrides USING btree (test_answer_id);


--
-- Name: idx_overrides_trait_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_trait_pending ON public.grade_overrides USING btree (created_at) WHERE (trait_processed_at IS NULL);


--
-- Name: idx_question_criteria_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_criteria_question ON public.question_criteria USING btree (question_id);


--
-- Name: idx_school_admins_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_school_admins_school ON public.school_admins USING btree (school_id);


--
-- Name: idx_school_plans_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_school_plans_plan ON public.school_plans USING btree (plan_id);


--
-- Name: idx_school_plans_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_school_plans_school ON public.school_plans USING btree (school_id);


--
-- Name: idx_student_classes_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_classes_class ON public.student_classes USING btree (class_id);


--
-- Name: idx_student_tests_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_tests_needs_review ON public.student_tests USING btree (class_test_id) WHERE needs_review;


--
-- Name: idx_student_tests_quota_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_tests_quota_plan ON public.student_tests USING btree (quota_school_plan_id);


--
-- Name: idx_student_tests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_tests_status ON public.student_tests USING btree (class_test_id, status);


--
-- Name: idx_student_tests_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_tests_student ON public.student_tests USING btree (student_id);


--
-- Name: idx_students_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_school ON public.students USING btree (school_id);


--
-- Name: idx_subject_coord_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subject_coord_teacher ON public.subject_coordinators USING btree (teacher_id);


--
-- Name: idx_subject_rules_subject_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subject_rules_subject_active ON public.subject_rules USING btree (subject_id) WHERE is_active;


--
-- Name: idx_subjects_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subjects_school ON public.subjects USING btree (school_id);


--
-- Name: idx_teacher_plans_school_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teacher_plans_school_plan ON public.teacher_plans USING btree (school_plan_id);


--
-- Name: idx_teachers_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teachers_school ON public.teachers USING btree (school_id);


--
-- Name: idx_test_answers_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_answers_needs_review ON public.test_answers USING btree (student_test_id) WHERE needs_review;


--
-- Name: idx_test_answers_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_answers_question ON public.test_answers USING btree (question_id);


--
-- Name: idx_test_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_pages_status ON public.test_pages USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_tests_maker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_maker ON public.tests USING btree (maker_id);


--
-- Name: idx_tests_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tests_subject ON public.tests USING btree (subject_id);


--
-- Name: idx_traits_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_traits_class ON public.teacher_traits USING btree (class_id);


--
-- Name: idx_traits_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_traits_embedding ON public.teacher_traits USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_traits_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_traits_lookup ON public.teacher_traits USING btree (teacher_id, subject_id) WHERE is_active;


--
-- Name: question_trait_picks_teacher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_trait_picks_teacher_idx ON public.question_trait_picks USING btree (teacher_id);


--
-- Name: uq_grading_runs_one_running; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_grading_runs_one_running ON public.grading_runs USING btree (student_test_id) WHERE (status = 'running'::text);


--
-- Name: uq_school_plans_external_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_school_plans_external_payment ON public.school_plans USING btree (external_payment_id) WHERE (external_payment_id IS NOT NULL);


--
-- Name: uq_school_plans_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_school_plans_one_active ON public.school_plans USING btree (school_id) WHERE (plan_status = 'on'::text);


--
-- Name: grading_runs trg_grading_runs_apply_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grading_runs_apply_tokens AFTER UPDATE OF status ON public.grading_runs FOR EACH ROW EXECUTE FUNCTION public.grading_runs_apply_tokens();


--
-- Name: grading_runs trg_grading_runs_fill_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grading_runs_fill_refs BEFORE INSERT ON public.grading_runs FOR EACH ROW EXECUTE FUNCTION public.grading_runs_fill_refs();


--
-- Name: grading_runs trg_grading_runs_lock_finished; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grading_runs_lock_finished BEFORE UPDATE ON public.grading_runs FOR EACH ROW EXECUTE FUNCTION public.grading_runs_lock_finished();


--
-- Name: grading_runs trg_grading_runs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grading_runs_updated_at BEFORE UPDATE ON public.grading_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plans trg_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: student_tests trg_student_tests_charge_quota; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_student_tests_charge_quota BEFORE INSERT OR UPDATE OF status ON public.student_tests FOR EACH ROW EXECUTE FUNCTION public.student_tests_charge_quota();


--
-- Name: student_tests trg_student_tests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_student_tests_updated_at BEFORE UPDATE ON public.student_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subject_rules trg_subject_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subject_rules_updated_at BEFORE UPDATE ON public.subject_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teacher_traits trg_teacher_traits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teacher_traits_updated_at BEFORE UPDATE ON public.teacher_traits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: teachers trg_teachers_enforce_plan_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teachers_enforce_plan_limit BEFORE INSERT ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.teachers_enforce_plan_limit();


--
-- Name: test_answers trg_test_answers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_test_answers_updated_at BEFORE UPDATE ON public.test_answers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: test_pages trg_test_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_test_pages_updated_at BEFORE UPDATE ON public.test_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: calibration_grades calibration_grades_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_grades
    ADD CONSTRAINT calibration_grades_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: calibration_grades calibration_grades_test_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_grades
    ADD CONSTRAINT calibration_grades_test_answer_id_fkey FOREIGN KEY (test_answer_id) REFERENCES public.test_answers(id) ON DELETE CASCADE;


--
-- Name: class_tests class_tests_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tests
    ADD CONSTRAINT class_tests_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_tests class_tests_corrector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tests
    ADD CONSTRAINT class_tests_corrector_id_fkey FOREIGN KEY (corrector_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: class_tests class_tests_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_tests
    ADD CONSTRAINT class_tests_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE RESTRICT;


--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: classes classes_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: grade_overrides grade_overrides_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_overrides
    ADD CONSTRAINT grade_overrides_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.student_complaints(id) ON DELETE SET NULL;


--
-- Name: grade_overrides grade_overrides_student_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_overrides
    ADD CONSTRAINT grade_overrides_student_test_id_fkey FOREIGN KEY (student_test_id) REFERENCES public.student_tests(id) ON DELETE CASCADE;


--
-- Name: grade_overrides grade_overrides_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_overrides
    ADD CONSTRAINT grade_overrides_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: grade_overrides grade_overrides_test_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade_overrides
    ADD CONSTRAINT grade_overrides_test_answer_id_fkey FOREIGN KEY (test_answer_id) REFERENCES public.test_answers(id) ON DELETE CASCADE;


--
-- Name: grading_runs grading_runs_class_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_runs
    ADD CONSTRAINT grading_runs_class_test_id_fkey FOREIGN KEY (class_test_id) REFERENCES public.class_tests(id) ON DELETE CASCADE;


--
-- Name: grading_runs grading_runs_school_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_runs
    ADD CONSTRAINT grading_runs_school_plan_id_fkey FOREIGN KEY (school_plan_id) REFERENCES public.school_plans(id) ON DELETE SET NULL;


--
-- Name: grading_runs grading_runs_student_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_runs
    ADD CONSTRAINT grading_runs_student_test_id_fkey FOREIGN KEY (student_test_id) REFERENCES public.student_tests(id) ON DELETE CASCADE;


--
-- Name: grading_runs grading_runs_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grading_runs
    ADD CONSTRAINT grading_runs_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: question_criteria question_criteria_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_criteria
    ADD CONSTRAINT question_criteria_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.test_questions(id) ON DELETE CASCADE;


--
-- Name: question_trait_picks question_trait_picks_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_trait_picks
    ADD CONSTRAINT question_trait_picks_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.test_questions(id) ON DELETE CASCADE;


--
-- Name: question_trait_picks question_trait_picks_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_trait_picks
    ADD CONSTRAINT question_trait_picks_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: school_admins school_admins_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: school_admins school_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: school_plans school_plans_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_plans
    ADD CONSTRAINT school_plans_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: school_plans school_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_plans
    ADD CONSTRAINT school_plans_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: student_classes student_classes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: student_classes student_classes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_complaints student_complaints_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_complaints
    ADD CONSTRAINT student_complaints_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_complaints student_complaints_student_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_complaints
    ADD CONSTRAINT student_complaints_student_test_id_fkey FOREIGN KEY (student_test_id) REFERENCES public.student_tests(id) ON DELETE CASCADE;


--
-- Name: student_complaints student_complaints_test_answer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_complaints
    ADD CONSTRAINT student_complaints_test_answer_id_fkey FOREIGN KEY (test_answer_id) REFERENCES public.test_answers(id) ON DELETE CASCADE;


--
-- Name: student_tests student_tests_class_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_tests
    ADD CONSTRAINT student_tests_class_test_id_fkey FOREIGN KEY (class_test_id) REFERENCES public.class_tests(id) ON DELETE RESTRICT;


--
-- Name: student_tests student_tests_quota_school_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_tests
    ADD CONSTRAINT student_tests_quota_school_plan_id_fkey FOREIGN KEY (quota_school_plan_id) REFERENCES public.school_plans(id) ON DELETE SET NULL;


--
-- Name: student_tests student_tests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_tests
    ADD CONSTRAINT student_tests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subject_coordinators subject_coordinators_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_coordinators
    ADD CONSTRAINT subject_coordinators_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: subject_coordinators subject_coordinators_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_coordinators
    ADD CONSTRAINT subject_coordinators_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: subject_rules subject_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_rules
    ADD CONSTRAINT subject_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subject_rules subject_rules_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_rules
    ADD CONSTRAINT subject_rules_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: subject_rules subject_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_rules
    ADD CONSTRAINT subject_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: subjects subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: teacher_plans teacher_plans_school_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_plans
    ADD CONSTRAINT teacher_plans_school_plan_id_fkey FOREIGN KEY (school_plan_id) REFERENCES public.school_plans(id) ON DELETE CASCADE;


--
-- Name: teacher_plans teacher_plans_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_plans
    ADD CONSTRAINT teacher_plans_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_traits teacher_traits_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_traits
    ADD CONSTRAINT teacher_traits_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: teacher_traits teacher_traits_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_traits
    ADD CONSTRAINT teacher_traits_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: teacher_traits teacher_traits_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_traits
    ADD CONSTRAINT teacher_traits_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_traits teacher_traits_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_traits
    ADD CONSTRAINT teacher_traits_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: teachers teachers_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: teachers teachers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: test_answers test_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_answers
    ADD CONSTRAINT test_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.test_questions(id) ON DELETE CASCADE;


--
-- Name: test_answers test_answers_student_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_answers
    ADD CONSTRAINT test_answers_student_test_id_fkey FOREIGN KEY (student_test_id) REFERENCES public.student_tests(id) ON DELETE CASCADE;


--
-- Name: test_pages test_pages_student_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_pages
    ADD CONSTRAINT test_pages_student_test_id_fkey FOREIGN KEY (student_test_id) REFERENCES public.student_tests(id) ON DELETE CASCADE;


--
-- Name: test_questions test_questions_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_questions
    ADD CONSTRAINT test_questions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: tests tests_maker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_maker_id_fkey FOREIGN KEY (maker_id) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: tests tests_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: trait_evidences trait_evidences_override_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trait_evidences
    ADD CONSTRAINT trait_evidences_override_id_fkey FOREIGN KEY (override_id) REFERENCES public.grade_overrides(id) ON DELETE CASCADE;


--
-- Name: trait_evidences trait_evidences_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trait_evidences
    ADD CONSTRAINT trait_evidences_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: trait_evidences trait_evidences_trait_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trait_evidences
    ADD CONSTRAINT trait_evidences_trait_id_fkey FOREIGN KEY (trait_id) REFERENCES public.teacher_traits(id) ON DELETE CASCADE;


--
-- Name: calibration_grades calibration_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calibration_admin_select ON public.calibration_grades FOR SELECT TO authenticated USING (public.is_school_admin(( SELECT t.school_id
   FROM public.teachers t
  WHERE (t.id = calibration_grades.teacher_id))));


--
-- Name: calibration_grades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calibration_grades ENABLE ROW LEVEL SECURITY;

--
-- Name: calibration_grades calibration_teacher_manage_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY calibration_teacher_manage_own ON public.calibration_grades TO authenticated USING ((teacher_id = public.auth_teacher_id())) WITH CHECK (((teacher_id = public.auth_teacher_id()) AND public.teacher_can_access_student_test(( SELECT ta.student_test_id
   FROM public.test_answers ta
  WHERE (ta.id = calibration_grades.test_answer_id)))));


--
-- Name: checkpoint_blobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkpoint_blobs ENABLE ROW LEVEL SECURITY;

--
-- Name: checkpoint_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: checkpoint_writes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkpoint_writes ENABLE ROW LEVEL SECURITY;

--
-- Name: checkpoints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;

--
-- Name: class_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: class_tests class_tests_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tests_admin_manage ON public.class_tests TO authenticated USING (public.is_school_admin(public.school_of_class(class_id))) WITH CHECK (public.is_school_admin(public.school_of_class(class_id)));


--
-- Name: class_tests class_tests_select_student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tests_select_student ON public.class_tests FOR SELECT TO authenticated USING (public.student_in_class(class_id));


--
-- Name: class_tests class_tests_select_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tests_select_teacher ON public.class_tests FOR SELECT TO authenticated USING (public.teacher_can_access_class_test(id));


--
-- Name: class_tests class_tests_teacher_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tests_teacher_manage ON public.class_tests TO authenticated USING ((( SELECT c.teacher_id
   FROM public.classes c
  WHERE (c.id = class_tests.class_id)) = public.auth_teacher_id())) WITH CHECK ((( SELECT c.teacher_id
   FROM public.classes c
  WHERE (c.id = class_tests.class_id)) = public.auth_teacher_id()));


--
-- Name: class_tests class_tests_update_corrector; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_tests_update_corrector ON public.class_tests FOR UPDATE TO authenticated USING ((corrector_id = public.auth_teacher_id())) WITH CHECK ((corrector_id = public.auth_teacher_id()));


--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_admin_manage ON public.classes TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));


--
-- Name: classes classes_select_student_enrolled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_select_student_enrolled ON public.classes FOR SELECT TO authenticated USING (public.student_in_class(id));


--
-- Name: classes classes_select_teacher_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_select_teacher_same_school ON public.classes FOR SELECT TO authenticated USING (((public.auth_teacher_id() IS NOT NULL) AND (school_id = public.auth_school_id())));


--
-- Name: classes classes_update_owner_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_update_owner_teacher ON public.classes FOR UPDATE TO authenticated USING ((teacher_id = public.auth_teacher_id())) WITH CHECK (((teacher_id = public.auth_teacher_id()) AND (school_id = public.auth_school_id())));


--
-- Name: student_complaints complaints_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY complaints_admin_select ON public.student_complaints FOR SELECT TO authenticated USING (public.is_school_admin(public.school_of_student_test(student_test_id)));


--
-- Name: student_complaints complaints_student_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY complaints_student_insert_own ON public.student_complaints FOR INSERT TO authenticated WITH CHECK (((student_id = public.auth_student_id()) AND (EXISTS ( SELECT 1
   FROM public.student_tests st
  WHERE ((st.id = student_complaints.student_test_id) AND (st.student_id = public.auth_student_id()) AND (st.status = 'published'::text)))) AND (status = 'pending'::text)));


--
-- Name: student_complaints complaints_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY complaints_teacher_select ON public.student_complaints FOR SELECT TO authenticated USING (public.teacher_can_access_student_test(student_test_id));


--
-- Name: trait_evidences evidences_teacher_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evidences_teacher_select_own ON public.trait_evidences FOR SELECT TO authenticated USING ((teacher_id = public.auth_teacher_id()));


--
-- Name: grade_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grade_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: grading_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grading_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: grading_runs grading_runs_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grading_runs_admin_select ON public.grading_runs FOR SELECT TO authenticated USING (public.is_school_admin(public.school_of_class_test(class_test_id)));


--
-- Name: grading_runs grading_runs_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grading_runs_teacher_select ON public.grading_runs FOR SELECT TO authenticated USING (public.teacher_can_access_class_test(class_test_id));


--
-- Name: grade_overrides overrides_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY overrides_admin_select ON public.grade_overrides FOR SELECT TO authenticated USING (public.is_school_admin(public.school_of_student_test(student_test_id)));


--
-- Name: grade_overrides overrides_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY overrides_teacher_select ON public.grade_overrides FOR SELECT TO authenticated USING (public.teacher_can_access_student_test(student_test_id));


--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: plans plans_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_select_all ON public.plans FOR SELECT TO authenticated USING (true);


--
-- Name: question_criteria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_criteria ENABLE ROW LEVEL SECURITY;

--
-- Name: question_criteria question_criteria_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_criteria_manage ON public.question_criteria TO authenticated USING (public.teacher_can_manage_test(( SELECT q.test_id
   FROM public.test_questions q
  WHERE (q.id = question_criteria.question_id)))) WITH CHECK (public.teacher_can_manage_test(( SELECT q.test_id
   FROM public.test_questions q
  WHERE (q.id = question_criteria.question_id))));


--
-- Name: question_criteria question_criteria_select_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY question_criteria_select_teacher ON public.question_criteria FOR SELECT TO authenticated USING (((public.auth_teacher_id() IS NOT NULL) AND (public.school_of_test(( SELECT q.test_id
   FROM public.test_questions q
  WHERE (q.id = question_criteria.question_id))) = public.auth_school_id())));


--
-- Name: question_trait_picks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_trait_picks ENABLE ROW LEVEL SECURITY;

--
-- Name: school_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: school_admins school_admins_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_admins_admin_manage ON public.school_admins TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));


--
-- Name: school_admins school_admins_select_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_admins_select_self_or_admin ON public.school_admins FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_school_admin(school_id)));


--
-- Name: school_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: school_plans school_plans_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_plans_select_admin ON public.school_plans FOR SELECT TO authenticated USING (public.is_school_admin(school_id));


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_select_member ON public.schools FOR SELECT TO authenticated USING ((id = public.auth_school_id()));


--
-- Name: student_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: student_classes student_classes_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_classes_admin_manage ON public.student_classes TO authenticated USING (public.is_school_admin(public.school_of_class(class_id))) WITH CHECK (public.is_school_admin(public.school_of_class(class_id)));


--
-- Name: student_classes student_classes_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_classes_select_self ON public.student_classes FOR SELECT TO authenticated USING ((student_id = public.auth_student_id()));


--
-- Name: student_classes student_classes_teacher_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_classes_teacher_manage ON public.student_classes TO authenticated USING ((( SELECT c.teacher_id
   FROM public.classes c
  WHERE (c.id = student_classes.class_id)) = public.auth_teacher_id())) WITH CHECK ((( SELECT c.teacher_id
   FROM public.classes c
  WHERE (c.id = student_classes.class_id)) = public.auth_teacher_id()));


--
-- Name: student_complaints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_complaints ENABLE ROW LEVEL SECURITY;

--
-- Name: student_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: student_tests student_tests_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_tests_admin_select ON public.student_tests FOR SELECT TO authenticated USING (public.is_school_admin(public.school_of_class_test(class_test_id)));


--
-- Name: student_tests student_tests_select_student_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_tests_select_student_published ON public.student_tests FOR SELECT TO authenticated USING (((student_id = public.auth_student_id()) AND (status = 'published'::text)));


--
-- Name: student_tests student_tests_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_tests_teacher_select ON public.student_tests FOR SELECT TO authenticated USING (public.teacher_can_access_class_test(class_test_id));


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_admin_manage ON public.students TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));


--
-- Name: students students_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select_self ON public.students FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: students students_select_teacher_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select_teacher_same_school ON public.students FOR SELECT TO authenticated USING (((public.auth_teacher_id() IS NOT NULL) AND (school_id = public.auth_school_id())));


--
-- Name: subject_coordinators subject_coord_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_coord_admin_manage ON public.subject_coordinators TO authenticated USING (public.is_school_admin(public.school_of_subject(subject_id))) WITH CHECK (public.is_school_admin(public.school_of_subject(subject_id)));


--
-- Name: subject_coordinators subject_coord_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_coord_select_same_school ON public.subject_coordinators FOR SELECT TO authenticated USING ((public.school_of_subject(subject_id) = public.auth_school_id()));


--
-- Name: subject_coordinators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subject_coordinators ENABLE ROW LEVEL SECURITY;

--
-- Name: subject_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subject_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: subject_rules subject_rules_manage_coord_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_rules_manage_coord_admin ON public.subject_rules TO authenticated USING ((public.is_subject_coordinator(subject_id) OR public.is_school_admin(public.school_of_subject(subject_id)))) WITH CHECK ((public.is_subject_coordinator(subject_id) OR public.is_school_admin(public.school_of_subject(subject_id))));


--
-- Name: subject_rules subject_rules_select_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subject_rules_select_teacher ON public.subject_rules FOR SELECT TO authenticated USING (((public.auth_teacher_id() IS NOT NULL) AND (public.school_of_subject(subject_id) = public.auth_school_id())));


--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: subjects subjects_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subjects_admin_manage ON public.subjects TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));


--
-- Name: subjects subjects_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subjects_select_same_school ON public.subjects FOR SELECT TO authenticated USING ((school_id = public.auth_school_id()));


--
-- Name: teacher_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_plans teacher_plans_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_plans_admin_select ON public.teacher_plans FOR SELECT TO authenticated USING (public.is_school_admin(( SELECT sp.school_id
   FROM public.school_plans sp
  WHERE (sp.id = teacher_plans.school_plan_id))));


--
-- Name: teacher_plans teacher_plans_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_plans_select_self ON public.teacher_plans FOR SELECT TO authenticated USING ((teacher_id = public.auth_teacher_id()));


--
-- Name: teacher_traits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_traits ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers teachers_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_admin_manage ON public.teachers TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));


--
-- Name: teachers teachers_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_select_same_school ON public.teachers FOR SELECT TO authenticated USING ((school_id = public.auth_school_id()));


--
-- Name: teachers teachers_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_update_self ON public.teachers FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (school_id = public.auth_school_id())));


--
-- Name: test_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: test_answers test_answers_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_answers_admin_select ON public.test_answers FOR SELECT TO authenticated USING (public.is_school_admin(public.school_of_student_test(student_test_id)));


--
-- Name: test_answers test_answers_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_answers_teacher_select ON public.test_answers FOR SELECT TO authenticated USING (public.teacher_can_access_student_test(student_test_id));


--
-- Name: test_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: test_pages test_pages_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_pages_admin_select ON public.test_pages FOR SELECT TO authenticated USING (public.is_school_admin(public.school_of_student_test(student_test_id)));


--
-- Name: test_pages test_pages_select_student_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_pages_select_student_own ON public.test_pages FOR SELECT TO authenticated USING ((( SELECT st.student_id
   FROM public.student_tests st
  WHERE (st.id = test_pages.student_test_id)) = public.auth_student_id()));


--
-- Name: test_pages test_pages_teacher_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_pages_teacher_select ON public.test_pages FOR SELECT TO authenticated USING (public.teacher_can_access_student_test(student_test_id));


--
-- Name: test_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: test_questions test_questions_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_questions_manage ON public.test_questions TO authenticated USING ((public.teacher_can_manage_test(test_id) OR public.is_school_admin(public.school_of_test(test_id)))) WITH CHECK ((public.teacher_can_manage_test(test_id) OR public.is_school_admin(public.school_of_test(test_id))));


--
-- Name: test_questions test_questions_select_student_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_questions_select_student_published ON public.test_questions FOR SELECT TO authenticated USING (public.student_can_view_test(test_id, true));


--
-- Name: test_questions test_questions_select_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY test_questions_select_teacher ON public.test_questions FOR SELECT TO authenticated USING (((public.auth_teacher_id() IS NOT NULL) AND (public.school_of_test(test_id) = public.auth_school_id())));


--
-- Name: tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

--
-- Name: tests tests_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tests_admin_manage ON public.tests TO authenticated USING (public.is_school_admin(public.school_of_subject(subject_id))) WITH CHECK (public.is_school_admin(public.school_of_subject(subject_id)));


--
-- Name: tests tests_delete_maker_coord; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tests_delete_maker_coord ON public.tests FOR DELETE TO authenticated USING (((maker_id = public.auth_teacher_id()) OR public.is_subject_coordinator(subject_id)));


--
-- Name: tests tests_insert_teacher; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tests_insert_teacher ON public.tests FOR INSERT TO authenticated WITH CHECK (((maker_id = public.auth_teacher_id()) AND (public.school_of_subject(subject_id) = public.auth_school_id())));


--
-- Name: tests tests_select_student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tests_select_student ON public.tests FOR SELECT TO authenticated USING (public.student_can_view_test(id, false));


--
-- Name: tests tests_select_teacher_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tests_select_teacher_same_school ON public.tests FOR SELECT TO authenticated USING (((public.auth_teacher_id() IS NOT NULL) AND (public.school_of_subject(subject_id) = public.auth_school_id())));


--
-- Name: tests tests_update_delete_maker_coord; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tests_update_delete_maker_coord ON public.tests FOR UPDATE TO authenticated USING (((maker_id = public.auth_teacher_id()) OR public.is_subject_coordinator(subject_id))) WITH CHECK (((maker_id = public.auth_teacher_id()) OR public.is_subject_coordinator(subject_id)));


--
-- Name: trait_evidences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trait_evidences ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_traits traits_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY traits_admin_select ON public.teacher_traits FOR SELECT TO authenticated USING (public.is_school_admin(( SELECT t.school_id
   FROM public.teachers t
  WHERE (t.id = teacher_traits.teacher_id))));


--
-- Name: teacher_traits traits_teacher_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY traits_teacher_select_own ON public.teacher_traits FOR SELECT TO authenticated USING ((teacher_id = public.auth_teacher_id()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION auth_school_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auth_school_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_school_id() TO authenticated;
GRANT ALL ON FUNCTION public.auth_school_id() TO service_role;


--
-- Name: FUNCTION auth_student_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auth_student_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_student_id() TO authenticated;
GRANT ALL ON FUNCTION public.auth_student_id() TO service_role;


--
-- Name: FUNCTION auth_teacher_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auth_teacher_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_teacher_id() TO authenticated;
GRANT ALL ON FUNCTION public.auth_teacher_id() TO service_role;


--
-- Name: FUNCTION grading_runs_apply_tokens(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.grading_runs_apply_tokens() TO anon;
GRANT ALL ON FUNCTION public.grading_runs_apply_tokens() TO authenticated;
GRANT ALL ON FUNCTION public.grading_runs_apply_tokens() TO service_role;


--
-- Name: FUNCTION grading_runs_fill_refs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.grading_runs_fill_refs() TO anon;
GRANT ALL ON FUNCTION public.grading_runs_fill_refs() TO authenticated;
GRANT ALL ON FUNCTION public.grading_runs_fill_refs() TO service_role;


--
-- Name: FUNCTION grading_runs_lock_finished(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.grading_runs_lock_finished() TO anon;
GRANT ALL ON FUNCTION public.grading_runs_lock_finished() TO authenticated;
GRANT ALL ON FUNCTION public.grading_runs_lock_finished() TO service_role;


--
-- Name: FUNCTION is_school_admin(p_school_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_school_admin(p_school_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_school_admin(p_school_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_school_admin(p_school_id uuid) TO service_role;


--
-- Name: FUNCTION is_subject_coordinator(p_subject_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_subject_coordinator(p_subject_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_subject_coordinator(p_subject_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_subject_coordinator(p_subject_id uuid) TO service_role;


--
-- Name: FUNCTION refresh_school_plans(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_school_plans() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_school_plans() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_school_plans() TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION school_of_class(p_class_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_of_class(p_class_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_of_class(p_class_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.school_of_class(p_class_id uuid) TO service_role;


--
-- Name: FUNCTION school_of_class_test(p_class_test_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_of_class_test(p_class_test_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_of_class_test(p_class_test_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.school_of_class_test(p_class_test_id uuid) TO service_role;


--
-- Name: FUNCTION school_of_student_test(p_student_test_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_of_student_test(p_student_test_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_of_student_test(p_student_test_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.school_of_student_test(p_student_test_id uuid) TO service_role;


--
-- Name: FUNCTION school_of_subject(p_subject_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_of_subject(p_subject_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_of_subject(p_subject_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.school_of_subject(p_subject_id uuid) TO service_role;


--
-- Name: FUNCTION school_of_test(p_test_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_of_test(p_test_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_of_test(p_test_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.school_of_test(p_test_id uuid) TO service_role;


--
-- Name: FUNCTION school_quota(p_school_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.school_quota(p_school_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.school_quota(p_school_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.school_quota(p_school_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION student_can_view_test(p_test_id uuid, p_published_only boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.student_can_view_test(p_test_id uuid, p_published_only boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.student_can_view_test(p_test_id uuid, p_published_only boolean) TO authenticated;
GRANT ALL ON FUNCTION public.student_can_view_test(p_test_id uuid, p_published_only boolean) TO service_role;


--
-- Name: FUNCTION student_in_class(p_class_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.student_in_class(p_class_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.student_in_class(p_class_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.student_in_class(p_class_id uuid) TO service_role;


--
-- Name: FUNCTION student_tests_charge_quota(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.student_tests_charge_quota() TO anon;
GRANT ALL ON FUNCTION public.student_tests_charge_quota() TO authenticated;
GRANT ALL ON FUNCTION public.student_tests_charge_quota() TO service_role;


--
-- Name: FUNCTION teacher_can_access_class_test(p_class_test_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.teacher_can_access_class_test(p_class_test_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teacher_can_access_class_test(p_class_test_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teacher_can_access_class_test(p_class_test_id uuid) TO service_role;


--
-- Name: FUNCTION teacher_can_access_student_test(p_student_test_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.teacher_can_access_student_test(p_student_test_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teacher_can_access_student_test(p_student_test_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teacher_can_access_student_test(p_student_test_id uuid) TO service_role;


--
-- Name: FUNCTION teacher_can_manage_test(p_test_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.teacher_can_manage_test(p_test_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teacher_can_manage_test(p_test_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teacher_can_manage_test(p_test_id uuid) TO service_role;


--
-- Name: FUNCTION teachers_enforce_plan_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.teachers_enforce_plan_limit() TO anon;
GRANT ALL ON FUNCTION public.teachers_enforce_plan_limit() TO authenticated;
GRANT ALL ON FUNCTION public.teachers_enforce_plan_limit() TO service_role;


--
-- Name: TABLE calibration_grades; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calibration_grades TO anon;
GRANT ALL ON TABLE public.calibration_grades TO authenticated;
GRANT ALL ON TABLE public.calibration_grades TO service_role;


--
-- Name: TABLE checkpoint_blobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checkpoint_blobs TO anon;
GRANT ALL ON TABLE public.checkpoint_blobs TO authenticated;
GRANT ALL ON TABLE public.checkpoint_blobs TO service_role;


--
-- Name: TABLE checkpoint_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checkpoint_migrations TO anon;
GRANT ALL ON TABLE public.checkpoint_migrations TO authenticated;
GRANT ALL ON TABLE public.checkpoint_migrations TO service_role;


--
-- Name: TABLE checkpoint_writes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checkpoint_writes TO anon;
GRANT ALL ON TABLE public.checkpoint_writes TO authenticated;
GRANT ALL ON TABLE public.checkpoint_writes TO service_role;


--
-- Name: TABLE checkpoints; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checkpoints TO anon;
GRANT ALL ON TABLE public.checkpoints TO authenticated;
GRANT ALL ON TABLE public.checkpoints TO service_role;


--
-- Name: TABLE class_tests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_tests TO anon;
GRANT ALL ON TABLE public.class_tests TO authenticated;
GRANT ALL ON TABLE public.class_tests TO service_role;


--
-- Name: TABLE classes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.classes TO anon;
GRANT ALL ON TABLE public.classes TO authenticated;
GRANT ALL ON TABLE public.classes TO service_role;


--
-- Name: TABLE grade_overrides; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.grade_overrides TO anon;
GRANT ALL ON TABLE public.grade_overrides TO authenticated;
GRANT ALL ON TABLE public.grade_overrides TO service_role;


--
-- Name: TABLE grading_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.grading_runs TO anon;
GRANT ALL ON TABLE public.grading_runs TO authenticated;
GRANT ALL ON TABLE public.grading_runs TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;


--
-- Name: TABLE question_criteria; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.question_criteria TO anon;
GRANT ALL ON TABLE public.question_criteria TO authenticated;
GRANT ALL ON TABLE public.question_criteria TO service_role;


--
-- Name: TABLE question_trait_picks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.question_trait_picks TO anon;
GRANT ALL ON TABLE public.question_trait_picks TO authenticated;
GRANT ALL ON TABLE public.question_trait_picks TO service_role;


--
-- Name: TABLE school_admins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_admins TO anon;
GRANT ALL ON TABLE public.school_admins TO authenticated;
GRANT ALL ON TABLE public.school_admins TO service_role;


--
-- Name: TABLE school_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_plans TO anon;
GRANT ALL ON TABLE public.school_plans TO authenticated;
GRANT ALL ON TABLE public.school_plans TO service_role;


--
-- Name: TABLE schools; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schools TO anon;
GRANT ALL ON TABLE public.schools TO authenticated;
GRANT ALL ON TABLE public.schools TO service_role;


--
-- Name: TABLE student_classes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_classes TO anon;
GRANT ALL ON TABLE public.student_classes TO authenticated;
GRANT ALL ON TABLE public.student_classes TO service_role;


--
-- Name: TABLE student_complaints; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_complaints TO anon;
GRANT ALL ON TABLE public.student_complaints TO authenticated;
GRANT ALL ON TABLE public.student_complaints TO service_role;


--
-- Name: TABLE student_tests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_tests TO anon;
GRANT ALL ON TABLE public.student_tests TO authenticated;
GRANT ALL ON TABLE public.student_tests TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: TABLE subject_coordinators; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subject_coordinators TO anon;
GRANT ALL ON TABLE public.subject_coordinators TO authenticated;
GRANT ALL ON TABLE public.subject_coordinators TO service_role;


--
-- Name: TABLE subject_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subject_rules TO anon;
GRANT ALL ON TABLE public.subject_rules TO authenticated;
GRANT ALL ON TABLE public.subject_rules TO service_role;


--
-- Name: TABLE subjects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subjects TO anon;
GRANT ALL ON TABLE public.subjects TO authenticated;
GRANT ALL ON TABLE public.subjects TO service_role;


--
-- Name: TABLE teacher_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_plans TO anon;
GRANT ALL ON TABLE public.teacher_plans TO authenticated;
GRANT ALL ON TABLE public.teacher_plans TO service_role;


--
-- Name: TABLE teacher_traits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_traits TO anon;
GRANT ALL ON TABLE public.teacher_traits TO authenticated;
GRANT ALL ON TABLE public.teacher_traits TO service_role;


--
-- Name: TABLE teachers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teachers TO anon;
GRANT ALL ON TABLE public.teachers TO authenticated;
GRANT ALL ON TABLE public.teachers TO service_role;


--
-- Name: TABLE test_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test_answers TO anon;
GRANT ALL ON TABLE public.test_answers TO authenticated;
GRANT ALL ON TABLE public.test_answers TO service_role;


--
-- Name: TABLE test_pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test_pages TO anon;
GRANT ALL ON TABLE public.test_pages TO authenticated;
GRANT ALL ON TABLE public.test_pages TO service_role;


--
-- Name: TABLE test_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.test_questions TO anon;
GRANT ALL ON TABLE public.test_questions TO authenticated;
GRANT ALL ON TABLE public.test_questions TO service_role;


--
-- Name: TABLE tests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tests TO anon;
GRANT ALL ON TABLE public.tests TO authenticated;
GRANT ALL ON TABLE public.tests TO service_role;


--
-- Name: TABLE trait_evidences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trait_evidences TO anon;
GRANT ALL ON TABLE public.trait_evidences TO authenticated;
GRANT ALL ON TABLE public.trait_evidences TO service_role;


--
-- Name: TABLE v_student_complaints; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_student_complaints TO anon;
GRANT ALL ON TABLE public.v_student_complaints TO authenticated;
GRANT ALL ON TABLE public.v_student_complaints TO service_role;


--
-- Name: TABLE v_student_test_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_student_test_answers TO anon;
GRANT ALL ON TABLE public.v_student_test_answers TO authenticated;
GRANT ALL ON TABLE public.v_student_test_answers TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


