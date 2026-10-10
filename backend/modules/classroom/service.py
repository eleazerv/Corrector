from uuid import UUID

from core.errors import AppError

from .schemas import (
    AddStudentsRequest,
    ClassDetailResponse,
    ClassResponse,
    ClassStudentResponse,
    ClassTestResponse,
    CreateClassRequest,
    SchoolStudentResponse,
    UpdateClassRequest,
)


# ============================================================
# HELPER
# ============================================================

async def get_class(
    db,
    class_id: UUID,
    school_id: UUID,
):
    return await db.fetchrow(
        """
        SELECT
            c.id,
            c.school_id,
            c.teacher_id,
            t.name AS teacher_name,
            c.name,
            c.code,
            c.description
        FROM classes c
        LEFT JOIN teachers t
          ON t.id = c.teacher_id
        WHERE c.id = $1
          AND c.school_id = $2
        """,
        class_id,
        school_id,
    )


async def get_class_response(
    db,
    class_id: UUID,
    school_id: UUID,
):
    row = await get_class(
        db,
        class_id,
        school_id,
    )

    if row is None:
        return None

    student_count = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM student_classes
        WHERE class_id = $1
        """,
        class_id,
    )

    test_count = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM class_tests
        WHERE class_id = $1
        """,
        class_id,
    )

    return ClassResponse(
        id=row["id"],
        school_id=row["school_id"],
        teacher_id=row["teacher_id"],
        teacher_name=row["teacher_name"],
        name=row["name"],
        code=row["code"],
        description=row["description"],
        student_count=student_count,
        test_count=test_count,
    )


# ============================================================
# CLASS LIST
# ============================================================

async def list_classes(
    db,
    school_id: UUID,
):
    rows = await db.fetch(
        """
        SELECT
            c.id,
            c.school_id,
            c.teacher_id,
            t.name AS teacher_name,
            c.name,
            c.code,
            c.description,
            COUNT(DISTINCT sc.student_id) AS student_count,
            COUNT(DISTINCT ct.id) AS test_count
        FROM classes c
        LEFT JOIN teachers t
          ON t.id = c.teacher_id
        LEFT JOIN student_classes sc
          ON sc.class_id = c.id
        LEFT JOIN class_tests ct
          ON ct.class_id = c.id
        WHERE c.school_id = $1
        GROUP BY
            c.id,
            c.school_id,
            c.teacher_id,
            t.name,
            c.name,
            c.code,
            c.description
        ORDER BY c.name
        """,
        school_id,
    )

    items = [
        ClassResponse(
            id=row["id"],
            school_id=row["school_id"],
            teacher_id=row["teacher_id"],
            teacher_name=row["teacher_name"],
            name=row["name"],
            code=row["code"],
            description=row["description"],
            student_count=row["student_count"],
            test_count=row["test_count"],
        )
        for row in rows
    ]

    return items, len(items)


# ============================================================
# CLASS DETAIL
# ============================================================

async def get_class_detail(
    db,
    class_id: UUID,
    school_id: UUID,
):
    class_response = await get_class_response(
        db,
        class_id,
        school_id,
    )

    if class_response is None:
        return None

    student_rows = await db.fetch(
        """
        SELECT
            s.id,
            s.nim,
            s.name,
            s.email
        FROM student_classes sc
        JOIN students s
          ON s.id = sc.student_id
        WHERE sc.class_id = $1
        ORDER BY s.name
        """,
        class_id,
    )

    test_rows = await db.fetch(
        """
        SELECT
            ct.id,
            ct.test_id,
            t.name AS test_name,
            ct.status,
            ct.test_date
        FROM class_tests ct
        JOIN tests t
          ON t.id = ct.test_id
        WHERE ct.class_id = $1
        ORDER BY ct.test_date DESC
        """,
        class_id,
    )

    students = [
        ClassStudentResponse(**dict(row))
        for row in student_rows
    ]

    tests = [
        ClassTestResponse(
            id=row["id"],
            test_id=row["test_id"],
            test_name=row["test_name"],
            status=row["status"],
            test_date=row["test_date"].isoformat(),
        )
        for row in test_rows
    ]

    return ClassDetailResponse(
        **class_response.model_dump(),
        students=students,
        tests=tests,
    )


# ============================================================
# CREATE CLASS
# ============================================================

async def create_class(
    db,
    school_id: UUID,
    user_role: str,
    user_profile_id: UUID,
    req: CreateClassRequest,
):
    if user_role == "school_admin":
        if req.teacher_id is None:
            raise AppError(
                "TEACHER_REQUIRED",
                "Admin must provide teacher_id",
                400,
            )

        teacher_id = req.teacher_id

    else:
        # Dosen otomatis menjadi pengampu kelas
        teacher_id = user_profile_id

    # Pastikan teacher berasal dari school yang sama
    teacher_exists = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM teachers
            WHERE id = $1
              AND school_id = $2
        )
        """,
        teacher_id,
        school_id,
    )

    if not teacher_exists:
        raise AppError(
            "TEACHER_NOT_FOUND",
            "Teacher does not belong to this school",
            400,
        )

    # Code kelas harus unik dalam satu school
    existing = await db.fetchrow(
        """
        SELECT id
        FROM classes
        WHERE school_id = $1
          AND code = $2
        """,
        school_id,
        req.code,
    )

    if existing is not None:
        raise AppError(
            "CLASS_CODE_EXISTS",
            "Class code already exists in this school",
            409,
        )

    row = await db.fetchrow(
        """
        INSERT INTO classes (
            school_id,
            teacher_id,
            name,
            code,
            description
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id,
            school_id,
            teacher_id,
            name,
            code,
            description
        """,
        school_id,
        teacher_id,
        req.name,
        req.code,
        req.description,
    )

    teacher_name = await db.fetchval(
        """
        SELECT name
        FROM teachers
        WHERE id = $1
        """,
        teacher_id,
    )

    return ClassResponse(
        id=row["id"],
        school_id=row["school_id"],
        teacher_id=row["teacher_id"],
        teacher_name=teacher_name,
        name=row["name"],
        code=row["code"],
        description=row["description"],
        student_count=0,
        test_count=0,
    )


# ============================================================
# UPDATE CLASS
# ============================================================

async def update_class(
    db,
    class_id: UUID,
    school_id: UUID,
    user_role: str,
    user_profile_id: UUID,
    req: UpdateClassRequest,
):
    current = await get_class(
        db,
        class_id,
        school_id,
    )

    if current is None:
        return None

    # Dosen hanya boleh mengubah kelas yang dia ampu
    if user_role == "teacher":
        if current["teacher_id"] != user_profile_id:
            raise AppError(
                "FORBIDDEN",
                "Teacher can only update their own class",
                403,
            )

        teacher_id = current["teacher_id"]

    else:
        # Admin boleh mengganti teacher_id
        if req.teacher_id is None:
            raise AppError(
                "TEACHER_REQUIRED",
                "Admin must provide teacher_id",
                400,
            )

        teacher_id = req.teacher_id

    teacher_exists = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM teachers
            WHERE id = $1
              AND school_id = $2
        )
        """,
        teacher_id,
        school_id,
    )

    if not teacher_exists:
        raise AppError(
            "TEACHER_NOT_FOUND",
            "Teacher does not belong to this school",
            400,
        )

    duplicate = await db.fetchrow(
        """
        SELECT id
        FROM classes
        WHERE school_id = $1
          AND code = $2
          AND id <> $3
        """,
        school_id,
        req.code,
        class_id,
    )

    if duplicate is not None:
        raise AppError(
            "CLASS_CODE_EXISTS",
            "Class code already exists in this school",
            409,
        )

    row = await db.fetchrow(
        """
        UPDATE classes
        SET
            teacher_id = $1,
            name = $2,
            code = $3,
            description = $4
        WHERE id = $5
          AND school_id = $6
        RETURNING
            id,
            school_id,
            teacher_id,
            name,
            code,
            description
        """,
        teacher_id,
        req.name,
        req.code,
        req.description,
        class_id,
        school_id,
    )

    teacher_name = await db.fetchval(
        """
        SELECT name
        FROM teachers
        WHERE id = $1
        """,
        teacher_id,
    )

    student_count = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM student_classes
        WHERE class_id = $1
        """,
        class_id,
    )

    test_count = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM class_tests
        WHERE class_id = $1
        """,
        class_id,
    )

    return ClassResponse(
        id=row["id"],
        school_id=row["school_id"],
        teacher_id=row["teacher_id"],
        teacher_name=teacher_name,
        name=row["name"],
        code=row["code"],
        description=row["description"],
        student_count=student_count,
        test_count=test_count,
    )


# ============================================================
# DELETE CLASS
# ============================================================

async def delete_class(
    db,
    class_id: UUID,
    school_id: UUID,
    user_role: str,
    user_profile_id: UUID,
):
    current = await get_class(
        db,
        class_id,
        school_id,
    )

    if current is None:
        return False

    # Dosen hanya boleh menghapus kelasnya sendiri
    if user_role == "teacher":
        if current["teacher_id"] != user_profile_id:
            raise AppError(
                "FORBIDDEN",
                "Teacher can only delete their own class",
                403,
            )

    has_test = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM class_tests
            WHERE class_id = $1
        )
        """,
        class_id,
    )

    if has_test:
        raise AppError(
            "CLASS_HAS_TEST",
            "Class cannot be deleted because it already has an exam",
            409,
        )

    await db.execute(
        """
        DELETE FROM classes
        WHERE id = $1
          AND school_id = $2
        """,
        class_id,
        school_id,
    )

    return True


# ============================================================
# LIST CLASS STUDENTS
# ============================================================

async def list_class_students(
    db,
    class_id: UUID,
    school_id: UUID,
):
    class_exists = await get_class(
        db,
        class_id,
        school_id,
    )

    if class_exists is None:
        return None

    rows = await db.fetch(
        """
        SELECT
            s.id,
            s.nim,
            s.name,
            s.email
        FROM student_classes sc
        JOIN students s
          ON s.id = sc.student_id
        WHERE sc.class_id = $1
          AND s.school_id = $2
        ORDER BY s.name
        """,
        class_id,
        school_id,
    )

    items = [
        ClassStudentResponse(**dict(row))
        for row in rows
    ]

    return items, len(items)


# ============================================================
# ADD CLASS STUDENTS
# ============================================================

async def add_students(
    db,
    class_id: UUID,
    school_id: UUID,
    user_role: str,
    user_profile_id: UUID,
    req: AddStudentsRequest,
):
    current = await get_class(
        db,
        class_id,
        school_id,
    )

    if current is None:
        return None

    # Dosen hanya boleh mengelola kelasnya sendiri
    if user_role == "teacher":
        if current["teacher_id"] != user_profile_id:
            raise AppError(
                "FORBIDDEN",
                "Teacher can only manage their own class",
                403,
            )

    if not req.student_ids and not req.nims:
        raise AppError(
            "STUDENTS_REQUIRED",
            "Provide student_ids or nims",
            400,
        )

    student_ids = set(req.student_ids)

    if req.nims:
        rows = await db.fetch(
            """
            SELECT id
            FROM students
            WHERE school_id = $1
              AND nim = ANY($2::text[])
            """,
            school_id,
            req.nims,
        )

        found_nims = {
            row["id"]
            for row in rows
        }

        student_ids.update(found_nims)

        found_nim_values = await db.fetch(
            """
            SELECT nim
            FROM students
            WHERE school_id = $1
              AND nim = ANY($2::text[])
            """,
            school_id,
            req.nims,
        )

        found_nims_text = {
            row["nim"]
            for row in found_nim_values
        }

        missing_nims = [
            nim
            for nim in req.nims
            if nim not in found_nims_text
        ]

        if missing_nims:
            raise AppError(
                "STUDENT_NOT_FOUND",
                f"Student with NIM not found: {', '.join(missing_nims)}",
                404,
            )

    # Pastikan semua student memang berasal dari school ini
    valid_rows = await db.fetch(
        """
        SELECT id
        FROM students
        WHERE school_id = $1
          AND id = ANY($2::uuid[])
        """,
        school_id,
        list(student_ids),
    )

    valid_ids = {
        row["id"]
        for row in valid_rows
    }

    invalid_ids = [
        student_id
        for student_id in student_ids
        if student_id not in valid_ids
    ]

    if invalid_ids:
        raise AppError(
            "STUDENT_NOT_FOUND",
            "One or more students do not belong to this school",
            404,
        )

    async with db.transaction():
        for student_id in student_ids:
            await db.execute(
                """
                INSERT INTO student_classes (
                    student_id,
                    class_id
                )
                VALUES ($1, $2)
                ON CONFLICT (student_id, class_id)
                DO NOTHING
                """,
                student_id,
                class_id,
            )

    result = await list_class_students(
        db,
        class_id,
        school_id,
    )

    return result


# ============================================================
# REMOVE STUDENT
# ============================================================

async def remove_student(
    db,
    class_id: UUID,
    student_id: UUID,
    school_id: UUID,
    user_role: str,
    user_profile_id: UUID,
):
    current = await get_class(
        db,
        class_id,
        school_id,
    )

    if current is None:
        return None

    if user_role == "teacher":
        if current["teacher_id"] != user_profile_id:
            raise AppError(
                "FORBIDDEN",
                "Teacher can only manage their own class",
                403,
            )

    exists = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM student_classes sc
            JOIN students s
              ON s.id = sc.student_id
            WHERE sc.class_id = $1
              AND sc.student_id = $2
              AND s.school_id = $3
        )
        """,
        class_id,
        student_id,
        school_id,
    )

    if not exists:
        return False

    await db.execute(
        """
        DELETE FROM student_classes
        WHERE class_id = $1
          AND student_id = $2
        """,
        class_id,
        student_id,
    )

    return True


# ============================================================
# SEARCH SCHOOL STUDENTS
# ============================================================

async def search_students(
    db,
    school_id: UUID,
    q: str | None = None,
):
    if q:
        search = f"%{q}%"

        rows = await db.fetch(
            """
            SELECT
                id,
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
            """,
            school_id,
            search,
        )

    else:
        rows = await db.fetch(
            """
            SELECT
                id,
                nim,
                name,
                email
            FROM students
            WHERE school_id = $1
            ORDER BY name
            """,
            school_id,
        )

    items = [
        SchoolStudentResponse(**dict(row))
        for row in rows
    ]

    return items, len(items)