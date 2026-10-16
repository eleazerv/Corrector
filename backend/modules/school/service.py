import secrets
import string
from uuid import UUID

from supabase_auth.errors import AuthApiError  

from core.errors import AppError
from core.logging import log 

from .schemas import (
    CreateStudentBulkRequest,
    CreateStudentRequest,
    CreateTeacherRequest,
    SchoolPlanResponse,
    StudentCreatedResponse,
    StudentResponse,
    TeacherPlanResponse,
    TeacherResponse,
    UpdateStudentRequest,
    UpdateTeacherRequest,
)


def generate_temp_password(length: int = 16) -> str:
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    symbols = "!@#$%^&*"

    password = [
        secrets.choice(lowercase),
        secrets.choice(uppercase),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]

    all_chars = lowercase + uppercase + digits + symbols

    for _ in range(length - 4):
        password.append(secrets.choice(all_chars))

    secrets.SystemRandom().shuffle(password)

    return "".join(password)


async def _create_auth_user(sb, attributes: dict):
    """Buat akun login. Email sudah terdaftar / tidak valid -> 409 (sebelumnya jadi 500)."""
    try:
        return await sb.auth.admin.create_user(attributes)
    except AuthApiError as e:
        raise AppError("AUTH_USER_FAILED", f"Cannot create login account: {e}", 409)


async def _update_auth_email(sb, user_id, email: str):
    """Samakan email login dengan email di tabel."""
    try:
        await sb.auth.admin.update_user_by_id(str(user_id), {"email": email, "email_confirm": True})
    except AuthApiError as e:
        raise AppError("AUTH_USER_FAILED", f"Cannot change login email: {e}", 409)


async def _fetchrow_or_revert_email(db, sb, current, new_email: str, sql: str, *args):
    """Jalankan UPDATE; kalau gagal (mis. email kembar), kembalikan email login ke yang lama."""
    try:
        return await db.fetchrow(sql, *args)
    except Exception:
        if current["user_id"] is not None and new_email != current["email"]:
            try:
                await _update_auth_email(sb, current["user_id"], current["email"])
            except Exception as e:
                log.warning("school: gagal mengembalikan email auth %s: %s", current["user_id"], e)
        raise


async def _delete_auth_user(sb, user_id):
    """Hapus akun login. Gagal -> hanya dicatat (baris di tabel sudah terhapus)."""
    if user_id is None:
        return
    try:
        await sb.auth.admin.delete_user(str(user_id))
    except Exception as e:
        log.warning("school: gagal menghapus akun auth %s: %s", user_id, e)


async def create_teacher(
    db,
    sb,
    school_id: UUID,
    req: CreateTeacherRequest,
):
    temp_password = generate_temp_password()

    auth_response = await _create_auth_user( 
        sb,
        {
            "email": req.email,
            "password": temp_password,
            "email_confirm": True,
        }
    )

    auth_user = auth_response.user

    if auth_user is None:
        raise Exception("Failed to create Supabase user")

    auth_user_id = UUID(auth_user.id)

    try:
        row = await db.fetchrow(
            """
            INSERT INTO teachers (
                user_id,
                email,
                code,
                school_id,
                name
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                user_id,
                name,
                email,
                code,
                school_id,
                CASE
                    WHEN user_id IS NOT NULL THEN 'active'
                    ELSE 'inactive'
                END AS status
            """,
            auth_user_id,
            req.email,
            req.code,
            school_id,
            req.name,
        )

    except Exception:
        try:
            await sb.auth.admin.delete_user(str(auth_user_id))
        finally:
            raise

    teacher = TeacherResponse(**dict(row))

    return teacher, temp_password


async def create_student(
    db,
    sb,
    school_id: UUID,
    req: CreateStudentRequest,
):
    temp_password = generate_temp_password()

    auth_response = await _create_auth_user( 
        sb,
        {
            "email": req.email,
            "password": temp_password,
            "email_confirm": True,
        }
    )

    auth_user = auth_response.user

    if auth_user is None:
        raise Exception("Failed to create Supabase user")

    auth_user_id = UUID(auth_user.id)

    try:
        row = await db.fetchrow(
            """
            INSERT INTO students (
                user_id,
                school_id,
                nim,
                name,
                email
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                user_id,
                school_id,
                nim,
                name,
                email
            """,
            auth_user_id,
            school_id,
            req.nim,
            req.name,
            req.email,
        )

    except Exception:
        try:
            await sb.auth.admin.delete_user(str(auth_user_id))
        finally:
            raise

    student = StudentResponse(**dict(row))

    return student, temp_password


async def get_students(
    db,
    school_id: UUID,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    if q:
        search = f"%{q}%"

        rows = await db.fetch(
            """
            SELECT
                id,
                user_id,
                school_id,
                nim,
                name,
                email
            FROM students
            WHERE school_id = $1
              AND (
                  nim ILIKE $2
                  OR name ILIKE $2
                  OR email ILIKE $2
              )
            ORDER BY name
            LIMIT $3
            OFFSET $4
            """,
            school_id,
            search,
            limit,
            offset,
        )

        total = await db.fetchval(
            """
            SELECT COUNT(*)
            FROM students
            WHERE school_id = $1
              AND (
                  nim ILIKE $2
                  OR name ILIKE $2
                  OR email ILIKE $2
              )
            """,
            school_id,
            search,
        )

    else:
        rows = await db.fetch(
            """
            SELECT
                id,
                user_id,
                school_id,
                nim,
                name,
                email
            FROM students
            WHERE school_id = $1
            ORDER BY name
            LIMIT $2
            OFFSET $3
            """,
            school_id,
            limit,
            offset,
        )

        total = await db.fetchval(
            """
            SELECT COUNT(*)
            FROM students
            WHERE school_id = $1
            """,
            school_id,
        )

    items = [
        StudentResponse(**dict(row))
        for row in rows
    ]

    return items, total


async def update_teacher(
    db,
    sb,  
    teacher_id: UUID,
    school_id: UUID,
    req: UpdateTeacherRequest,
):
    current = await db.fetchrow(
        "SELECT user_id, email FROM teachers WHERE id = $1 AND school_id = $2",
        teacher_id,
        school_id,
    )
    if current is None:
        return None
    if current["user_id"] is not None and req.email != current["email"]:
        await _update_auth_email(sb, current["user_id"], req.email)

    row = await _fetchrow_or_revert_email(  
        db, sb, current, req.email,
        """
        UPDATE teachers
        SET
            name = $1,
            email = $2,
            code = $3
        WHERE id = $4
          AND school_id = $5
        RETURNING
            id,
            user_id,
            name,
            email,
            code,
            school_id,
            CASE
                WHEN user_id IS NOT NULL THEN 'active'
                ELSE 'inactive'
            END AS status
        """,
        req.name,
        req.email,
        req.code,
        teacher_id,
        school_id,
    )

    if row is None:
        return None

    return TeacherResponse(**dict(row))


async def create_students_bulk(
    db,
    sb,
    school_id: UUID,
    req: CreateStudentBulkRequest,
):
    results = []

    for student_req in req.students:
        existing = await db.fetchrow(
            """
            SELECT
                id,
                user_id,
                school_id,
                nim,
                name,
                email
            FROM students
            WHERE school_id = $1
              AND nim = $2
            """,
            school_id,
            student_req.nim,
        )

        if existing is not None:
            if existing["user_id"] is not None and student_req.email != existing["email"]:
                await _update_auth_email(sb, existing["user_id"], student_req.email)

            row = await db.fetchrow(
                """
                UPDATE students
                SET
                    name = $1,
                    email = $2
                WHERE id = $3
                  AND school_id = $4
                RETURNING
                    id,
                    user_id,
                    school_id,
                    nim,
                    name,
                    email
                """,
                student_req.name,
                student_req.email,
                existing["id"],
                school_id,
            )

            student = StudentResponse(**dict(row))

            results.append(
                StudentCreatedResponse(
                    **student.model_dump(),
                    initial_password="",
                )
            )

        else:
            student, password = await create_student(
                db,
                sb,
                school_id,
                student_req,
            )

            results.append(
                StudentCreatedResponse(
                    **student.model_dump(),
                    initial_password=password,
                )
            )

    return results


async def update_student(
    db,
    sb, 
    student_id: UUID,
    school_id: UUID,
    req: UpdateStudentRequest,
):
    current = await db.fetchrow(
        "SELECT user_id, email FROM students WHERE id = $1 AND school_id = $2",
        student_id,
        school_id,
    )
    if current is None:
        return None
    if current["user_id"] is not None and req.email != current["email"]:
        await _update_auth_email(sb, current["user_id"], req.email)

    row = await _fetchrow_or_revert_email( 
        db, sb, current, req.email,
        """
        UPDATE students
        SET
            nim = $1,
            name = $2,
            email = $3
        WHERE id = $4
          AND school_id = $5
        RETURNING
            id,
            user_id,
            school_id,
            nim,
            name,
            email
        """,
        req.nim,
        req.name,
        req.email,
        student_id,
        school_id,
    )

    if row is None:
        return None

    return StudentResponse(**dict(row))


async def delete_student(
    db,
    sb, 
    student_id: UUID,
    school_id: UUID,
):
    student = await db.fetchrow(
        """
        SELECT id, user_id
        FROM students
        WHERE id = $1
          AND school_id = $2
        """,
        student_id,
        school_id,
    )

    if student is None:
        return False

    has_answer_sheet = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM student_tests
            WHERE student_id = $1
        )
        """,
        student_id,
    )

    if has_answer_sheet:
        raise AppError(
            "STUDENT_HAS_ANSWER_SHEET",
            "Student cannot be deleted because they already have an answer sheet",
            409,
        )

    await db.execute(
        """
        DELETE FROM students
        WHERE id = $1
          AND school_id = $2
        """,
        student_id,
        school_id,
    )

    await _delete_auth_user(sb, student["user_id"])

    return True


async def delete_teacher(
    db,
    sb,  
    teacher_id: UUID,
    school_id: UUID,
):
    teacher = await db.fetchrow(
        """
        SELECT id, user_id
        FROM teachers
        WHERE id = $1
          AND school_id = $2
        """,
        teacher_id,
        school_id,
    )

    if teacher is None:
        return False

    has_class_or_test = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM classes
            WHERE teacher_id = $1
              AND school_id = $2
        )
        OR EXISTS (
            SELECT 1
            FROM tests t
            JOIN subjects s
              ON s.id = t.subject_id
            WHERE t.maker_id = $1
              AND s.school_id = $2
        )
        OR EXISTS (
            SELECT 1
            FROM class_tests ct
            JOIN classes c
              ON c.id = ct.class_id
            WHERE ct.corrector_id = $1
              AND c.school_id = $2
        )
        """,
        teacher_id,
        school_id,
    )

    if has_class_or_test:
        raise AppError(
            "TEACHER_HAS_CLASS_OR_TEST",
            "Teacher cannot be deleted because they already have a class or test",
            409,
        )

    await db.execute(
        """
        DELETE FROM teachers
        WHERE id = $1
          AND school_id = $2
        """,
        teacher_id,
        school_id,
    )

    await _delete_auth_user(sb, teacher["user_id"])

    return True


async def list_teachers(
    db,
    school_id: UUID,
):
    rows = await db.fetch(
        """
        SELECT
            id,
            user_id,
            name,
            email,
            code,
            school_id,
            CASE
                WHEN user_id IS NOT NULL THEN 'active'
                ELSE 'inactive'
            END AS status
        FROM teachers
        WHERE school_id = $1
        ORDER BY name
        """,
        school_id,
    )

    items = [
        TeacherResponse(**dict(row))
        for row in rows
    ]

    return items, len(items)


async def get_school_plan(
    db,
    school_id: UUID,
):
    plan_row = await db.fetchrow(
        """
        SELECT
            p.name AS plan_name,
            sp.grading_used,
            p.grading_quota
        FROM school_plans sp
        JOIN plans p
          ON p.id = sp.plan_id
        WHERE sp.school_id = $1
          AND sp.plan_status = 'on'
        ORDER BY sp.created_at DESC
        LIMIT 1
        """,
        school_id,
    )

    if plan_row is None:
        raise AppError(
            "PLAN_NOT_FOUND",
            "Active school plan not found",
            404,
        )

    if plan_row["grading_quota"] is None:
        remaining_quota = None
    else:
        remaining_quota = max(
            plan_row["grading_quota"] - plan_row["grading_used"],
            0,
        )

    teacher_rows = await db.fetch(
        """
        SELECT
            tp.teacher_id,
            t.name AS teacher_name,
            tp.token_used
        FROM teacher_plans tp
        JOIN teachers t
          ON t.id = tp.teacher_id
        JOIN school_plans sp
          ON sp.id = tp.school_plan_id
        WHERE sp.id = (
            SELECT id
            FROM school_plans
            WHERE school_id = $1
              AND plan_status = 'on'
            ORDER BY created_at DESC
            LIMIT 1
        )
        ORDER BY t.name
        """,
        school_id,
    )

    teachers = [
        TeacherPlanResponse(**dict(row))
        for row in teacher_rows
    ]

    return SchoolPlanResponse(
        plan_name=plan_row["plan_name"],
        grading_used=plan_row["grading_used"],
        grading_quota=plan_row["grading_quota"],
        remaining_quota=remaining_quota,
        teachers=teachers,
    )