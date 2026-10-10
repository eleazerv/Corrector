from uuid import UUID

from core.errors import AppError

from .schemas import (
    CreateClassTestRequest,
    CreateQuestionRequest,
    CreateTestRequest,
    CriteriaRequest,
    QuestionResponse,
    TestDetailResponse,
    TestResponse,
    UpdateClassTestRequest,
    UpdateQuestionRequest,
    UpdateTestRequest,
)


# ============================================================
# HELPER
# ============================================================

async def get_test(
    db,
    test_id: UUID,
    school_id: UUID,
):
    return await db.fetchrow(
        """
        SELECT
            t.id,
            t.subject_id,
            s.name AS subject_name,
            t.maker_id,
            te.name AS maker_name,
            t.name,
            t.max_score,
            t.test_type,
            t.status
        FROM tests t
        JOIN subjects s
          ON s.id = t.subject_id
        LEFT JOIN teachers te
          ON te.id = t.maker_id
        WHERE t.id = $1
          AND s.school_id = $2
        """,
        test_id,
        school_id,
    )


async def get_test_response(
    db,
    test_id: UUID,
    school_id: UUID,
):
    row = await get_test(
        db,
        test_id,
        school_id,
    )

    if row is None:
        return None

    question_count = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM test_questions
        WHERE test_id = $1
        """,
        test_id,
    )

    return TestResponse(
        id=row["id"],
        subject_id=row["subject_id"],
        subject_name=row["subject_name"],
        maker_id=row["maker_id"],
        maker_name=row["maker_name"],
        name=row["name"],
        max_score=row["max_score"],
        test_type=row["test_type"],
        status=row["status"],
        question_count=question_count,
    )


async def validate_test_owner(
    db,
    test_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
):
    row = await get_test(
        db,
        test_id,
        school_id,
    )

    if row is None:
        return None

    if row["maker_id"] != teacher_id:
        raise AppError(
            "FORBIDDEN",
            "Teacher can only manage their own test",
            403,
        )

    return row


# ============================================================
# TEST LIST
# ============================================================

async def list_tests(
    db,
    school_id: UUID,
    teacher_id: UUID,
    scope: str = "mine",
):
    if scope == "school":
        rows = await db.fetch(
            """
            SELECT
                t.id,
                t.subject_id,
                s.name AS subject_name,
                t.maker_id,
                te.name AS maker_name,
                t.name,
                t.max_score,
                t.test_type,
                t.status,
                COUNT(tq.id) AS question_count
            FROM tests t
            JOIN subjects s
              ON s.id = t.subject_id
            LEFT JOIN teachers te
              ON te.id = t.maker_id
            LEFT JOIN test_questions tq
              ON tq.test_id = t.id
            WHERE s.school_id = $1
              AND t.status = 'ready'
            GROUP BY
                t.id,
                t.subject_id,
                s.name,
                t.maker_id,
                te.name,
                t.name,
                t.max_score,
                t.test_type,
                t.status
            ORDER BY t.created_at DESC
            """,
            school_id,
        )

    else:
        rows = await db.fetch(
            """
            SELECT
                t.id,
                t.subject_id,
                s.name AS subject_name,
                t.maker_id,
                te.name AS maker_name,
                t.name,
                t.max_score,
                t.test_type,
                t.status,
                COUNT(tq.id) AS question_count
            FROM tests t
            JOIN subjects s
              ON s.id = t.subject_id
            LEFT JOIN teachers te
              ON te.id = t.maker_id
            LEFT JOIN test_questions tq
              ON tq.test_id = t.id
            WHERE s.school_id = $1
              AND t.maker_id = $2
            GROUP BY
                t.id,
                t.subject_id,
                s.name,
                t.maker_id,
                te.name,
                t.name,
                t.max_score,
                t.test_type,
                t.status
            ORDER BY t.created_at DESC
            """,
            school_id,
            teacher_id,
        )

    items = [
        TestResponse(
            id=row["id"],
            subject_id=row["subject_id"],
            subject_name=row["subject_name"],
            maker_id=row["maker_id"],
            maker_name=row["maker_name"],
            name=row["name"],
            max_score=row["max_score"],
            test_type=row["test_type"],
            status=row["status"],
            question_count=row["question_count"],
        )
        for row in rows
    ]

    return items, len(items)


# ============================================================
# CREATE TEST
# ============================================================

async def create_test(
    db,
    school_id: UUID,
    teacher_id: UUID,
    req: CreateTestRequest,
):
    subject_exists = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM subjects
            WHERE id = $1
              AND school_id = $2
        )
        """,
        req.subject_id,
        school_id,
    )

    if not subject_exists:
        raise AppError(
            "SUBJECT_NOT_FOUND",
            "Subject not found in this school",
            404,
        )

    if req.max_score <= 0:
        raise AppError(
            "INVALID_MAX_SCORE",
            "max_score must be greater than zero",
            400,
        )

    row = await db.fetchrow(
        """
        INSERT INTO tests (
            subject_id,
            maker_id,
            name,
            max_score,
            test_type,
            status
        )
        VALUES ($1, $2, $3, $4, $5, 'draft')
        RETURNING
            id,
            subject_id,
            name,
            max_score,
            test_type,
            status,
            maker_id
        """,
        req.subject_id,
        teacher_id,
        req.name,
        req.max_score,
        req.test_type,
    )

    return await get_test_response(
        db,
        row["id"],
        school_id,
    )


# ============================================================
# GET TEST DETAIL
# ============================================================

async def get_test_detail(
    db,
    test_id: UUID,
    school_id: UUID,
):
    test = await get_test_response(
        db,
        test_id,
        school_id,
    )

    if test is None:
        return None

    question_rows = await db.fetch(
        """
        SELECT
            id,
            test_id,
            number,
            question_type,
            question_text,
            max_points,
            key_answer
        FROM test_questions
        WHERE test_id = $1
        ORDER BY number
        """,
        test_id,
    )

    questions = []

    for question in question_rows:
        criteria_rows = await db.fetch(
            """
            SELECT
                id,
                question_id,
                description,
                points
            FROM question_criteria
            WHERE question_id = $1
            ORDER BY id
            """,
            question["id"],
        )

        criteria = [
            {
                "id": row["id"],
                "question_id": row["question_id"],
                "description": row["description"],
                "points": row["points"],
            }
            for row in criteria_rows
        ]

        questions.append(
            {
                "id": question["id"],
                "test_id": question["test_id"],
                "number": question["number"],
                "question_type": question["question_type"],
                "question_text": question["question_text"],
                "max_points": question["max_points"],
                "key_answer": question["key_answer"],
                "criteria": criteria,
            }
        )

    return TestDetailResponse(
        **test.model_dump(),
        questions=questions,
    )


# ============================================================
# UPDATE TEST
# ============================================================

async def update_test(
    db,
    test_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
    req: UpdateTestRequest,
):
    current = await validate_test_owner(
        db,
        test_id,
        school_id,
        teacher_id,
    )

    if current is None:
        return None

    if req.max_score <= 0:
        raise AppError(
            "INVALID_MAX_SCORE",
            "max_score must be greater than zero",
            400,
        )

    new_status = req.status or current["status"]

    if new_status == "ready":
        question_count = await db.fetchval(
            """
            SELECT COUNT(*)
            FROM test_questions
            WHERE test_id = $1
            """,
            test_id,
        )

        if question_count == 0:
            raise AppError(
                "TEST_NOT_READY",
                "Test must have at least one question",
                400,
            )

        invalid_question = await db.fetchrow(
            """
            SELECT
                q.id,
                q.number
            FROM test_questions q
            WHERE q.test_id = $1
              AND (
                  COALESCE(
                      (
                          SELECT SUM(qc.points)
                          FROM question_criteria qc
                          WHERE qc.question_id = q.id
                      ),
                      0
                  ) > q.max_points
              )
            LIMIT 1
            """,
            test_id,
        )

        if invalid_question is not None:
            raise AppError(
                "CRITERIA_POINTS_EXCEEDED",
                f"Criteria points exceed max_points for question {invalid_question['number']}",
                400,
            )

    row = await db.fetchrow(
        """
        UPDATE tests
        SET
            name = $1,
            max_score = $2,
            test_type = $3,
            status = $4
        WHERE id = $5
        RETURNING id
        """,
        req.name,
        req.max_score,
        req.test_type,
        new_status,
        test_id,
    )

    return await get_test_response(
        db,
        row["id"],
        school_id,
    )


# ============================================================
# DELETE TEST
# ============================================================

async def delete_test(
    db,
    test_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
):
    current = await validate_test_owner(
        db,
        test_id,
        school_id,
        teacher_id,
    )

    if current is None:
        return False

    scheduled = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM class_tests
            WHERE test_id = $1
        )
        """,
        test_id,
    )

    if scheduled:
        raise AppError(
            "TEST_ALREADY_SCHEDULED",
            "Test cannot be deleted because it has already been scheduled",
            409,
        )

    await db.execute(
        """
        DELETE FROM tests
        WHERE id = $1
        """,
        test_id,
    )

    return True


# ============================================================
# ADD QUESTION + CRITERIA
# ============================================================

async def add_question(
    db,
    test_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
    req: CreateQuestionRequest,
):
    test = await validate_test_owner(
        db,
        test_id,
        school_id,
        teacher_id,
    )

    if test is None:
        return None

    if req.number <= 0:
        raise AppError(
            "INVALID_QUESTION_NUMBER",
            "Question number must be greater than zero",
            400,
        )

    if req.max_points <= 0:
        raise AppError(
            "INVALID_MAX_POINTS",
            "max_points must be greater than zero",
            400,
        )

    criteria_total = sum(
        criterion.points
        for criterion in req.criteria
    )

    if any(
        criterion.points <= 0
        for criterion in req.criteria
    ):
        raise AppError(
            "INVALID_CRITERIA_POINTS",
            "Criteria points must be greater than zero",
            400,
        )

    if criteria_total > req.max_points:
        raise AppError(
            "CRITERIA_POINTS_EXCEEDED",
            "Total criteria points cannot exceed question max_points",
            400,
        )

    duplicate = await db.fetchrow(
        """
        SELECT id
        FROM test_questions
        WHERE test_id = $1
          AND number = $2
        """,
        test_id,
        req.number,
    )

    if duplicate is not None:
        raise AppError(
            "QUESTION_NUMBER_EXISTS",
            "Question number already exists in this test",
            409,
        )

    async with db.transaction():
        question = await db.fetchrow(
            """
            INSERT INTO test_questions (
                test_id,
                number,
                question_type,
                question_text,
                max_points,
                key_answer
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id,
                test_id,
                number,
                question_type,
                question_text,
                max_points,
                key_answer
            """,
            test_id,
            req.number,
            req.question_type,
            req.question_text,
            req.max_points,
            req.key_answer,
        )

        criteria = []

        for item in req.criteria:
            row = await db.fetchrow(
                """
                INSERT INTO question_criteria (
                    question_id,
                    description,
                    points
                )
                VALUES ($1, $2, $3)
                RETURNING
                    id,
                    question_id,
                    description,
                    points
                """,
                question["id"],
                item.description,
                item.points,
            )

            criteria.append(dict(row))

    return QuestionResponse(
        **dict(question),
        criteria=criteria,
    )


# ============================================================
# UPDATE QUESTION
# ============================================================

async def update_question(
    db,
    test_id: UUID,
    question_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
    req: UpdateQuestionRequest,
):
    test = await validate_test_owner(
        db,
        test_id,
        school_id,
        teacher_id,
    )

    if test is None:
        return None

    question = await db.fetchrow(
        """
        SELECT id
        FROM test_questions
        WHERE id = $1
          AND test_id = $2
        """,
        question_id,
        test_id,
    )

    if question is None:
        return None

    if req.number <= 0 or req.max_points <= 0:
        raise AppError(
            "INVALID_QUESTION",
            "Question number and max_points must be greater than zero",
            400,
        )

    duplicate = await db.fetchrow(
        """
        SELECT id
        FROM test_questions
        WHERE test_id = $1
          AND number = $2
          AND id <> $3
        """,
        test_id,
        req.number,
        question_id,
    )

    if duplicate is not None:
        raise AppError(
            "QUESTION_NUMBER_EXISTS",
            "Question number already exists in this test",
            409,
        )

    criteria_total = await db.fetchval(
        """
        SELECT COALESCE(SUM(points), 0)
        FROM question_criteria
        WHERE question_id = $1
        """,
        question_id,
    )

    if criteria_total > req.max_points:
        raise AppError(
            "CRITERIA_POINTS_EXCEEDED",
            "Existing criteria points exceed the new max_points",
            400,
        )

    row = await db.fetchrow(
        """
        UPDATE test_questions
        SET
            number = $1,
            question_type = $2,
            question_text = $3,
            max_points = $4,
            key_answer = $5
        WHERE id = $6
          AND test_id = $7
        RETURNING
            id,
            test_id,
            number,
            question_type,
            question_text,
            max_points,
            key_answer
        """,
        req.number,
        req.question_type,
        req.question_text,
        req.max_points,
        req.key_answer,
        question_id,
        test_id,
    )

    criteria_rows = await db.fetch(
        """
        SELECT
            id,
            question_id,
            description,
            points
        FROM question_criteria
        WHERE question_id = $1
        ORDER BY id
        """,
        question_id,
    )

    return QuestionResponse(
        **dict(row),
        criteria=[
            dict(item)
            for item in criteria_rows
        ],
    )


# ============================================================
# DELETE QUESTION
# ============================================================

async def delete_question(
    db,
    question_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
):
    row = await db.fetchrow(
        """
        SELECT
            q.id,
            q.test_id
        FROM test_questions q
        JOIN tests t
          ON t.id = q.test_id
        JOIN subjects s
          ON s.id = t.subject_id
        WHERE q.id = $1
          AND s.school_id = $2
          AND t.maker_id = $3
        """,
        question_id,
        school_id,
        teacher_id,
    )

    if row is None:
        return False

    await db.execute(
        """
        DELETE FROM test_questions
        WHERE id = $1
        """,
        question_id,
    )

    return True


# ============================================================
# REPLACE QUESTION CRITERIA
# ============================================================

async def replace_criteria(
    db,
    question_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
    criteria: list[CriteriaRequest],
):
    question = await db.fetchrow(
        """
        SELECT
            q.id,
            q.max_points
        FROM test_questions q
        JOIN tests t
          ON t.id = q.test_id
        JOIN subjects s
          ON s.id = t.subject_id
        WHERE q.id = $1
          AND s.school_id = $2
          AND t.maker_id = $3
        """,
        question_id,
        school_id,
        teacher_id,
    )

    if question is None:
        return None

    if any(item.points <= 0 for item in criteria):
        raise AppError(
            "INVALID_CRITERIA_POINTS",
            "Criteria points must be greater than zero",
            400,
        )

    total_points = sum(
        item.points
        for item in criteria
    )

    if total_points > question["max_points"]:
        raise AppError(
            "CRITERIA_POINTS_EXCEEDED",
            "Total criteria points cannot exceed question max_points",
            400,
        )

    async with db.transaction():
        await db.execute(
            """
            DELETE FROM question_criteria
            WHERE question_id = $1
            """,
            question_id,
        )

        for item in criteria:
            await db.execute(
                """
                INSERT INTO question_criteria (
                    question_id,
                    description,
                    points
                )
                VALUES ($1, $2, $3)
                """,
                question_id,
                item.description,
                item.points,
            )

    rows = await db.fetch(
        """
        SELECT
            id,
            question_id,
            description,
            points
        FROM question_criteria
        WHERE question_id = $1
        ORDER BY id
        """,
        question_id,
    )

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# CLASS TEST HELPER
# ============================================================

async def get_class_test(
    db,
    class_test_id: UUID,
    school_id: UUID,
):
    return await db.fetchrow(
        """
        SELECT
            ct.id,
            ct.class_id,
            c.name AS class_name,
            ct.test_id,
            t.name AS test_name,
            ct.corrector_id,
            te.name AS corrector_name,
            ct.status,
            ct.test_date
        FROM class_tests ct
        JOIN classes c
          ON c.id = ct.class_id
        JOIN tests t
          ON t.id = ct.test_id
        LEFT JOIN teachers te
          ON te.id = ct.corrector_id
        JOIN subjects s
          ON s.id = t.subject_id
        WHERE ct.id = $1
          AND c.school_id = $2
          AND s.school_id = $2
        """,
        class_test_id,
        school_id,
    )


async def class_test_response(
    db,
    row,
):
    student_count = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM student_tests
        WHERE class_test_id = $1
        """,
        row["id"],
    )

    return ClassTestResponse(
        id=row["id"],
        class_id=row["class_id"],
        class_name=row["class_name"],
        test_id=row["test_id"],
        test_name=row["test_name"],
        corrector_id=row["corrector_id"],
        corrector_name=row["corrector_name"],
        status=row["status"],
        test_date=row["test_date"],
        student_count=student_count,
    )


# ============================================================
# LIST CLASS TESTS
# ============================================================

async def list_class_tests(
    db,
    school_id: UUID,
    teacher_id: UUID,
    class_id: UUID | None = None,
    status: str | None = None,
):
    rows = await db.fetch(
        """
        SELECT
            ct.id,
            ct.class_id,
            c.name AS class_name,
            ct.test_id,
            t.name AS test_name,
            ct.corrector_id,
            te.name AS corrector_name,
            ct.status,
            ct.test_date
        FROM class_tests ct
        JOIN classes c
          ON c.id = ct.class_id
        JOIN tests t
          ON t.id = ct.test_id
        LEFT JOIN teachers te
          ON te.id = ct.corrector_id
        JOIN subjects s
          ON s.id = t.subject_id
        WHERE c.school_id = $1
          AND s.school_id = $1
          AND (
              c.teacher_id = $2
              OR ct.corrector_id = $2
          )
          AND ($3::uuid IS NULL OR ct.class_id = $3)
          AND ($4::text IS NULL OR ct.status = $4)
        ORDER BY ct.test_date DESC
        """,
        school_id,
        teacher_id,
        class_id,
        status,
    )

    items = []

    for row in rows:
        items.append(
            await class_test_response(
                db,
                row,
            )
        )

    return items, len(items)


# ============================================================
# CREATE CLASS TEST / SCHEDULE
# ============================================================

async def create_class_test(
    db,
    school_id: UUID,
    teacher_id: UUID,
    req: CreateClassTestRequest,
):
    test = await get_test(
        db,
        req.test_id,
        school_id,
    )

    if test is None:
        raise AppError(
            "TEST_NOT_FOUND",
            "Test not found",
            404,
        )

    if test["maker_id"] != teacher_id:
        raise AppError(
            "FORBIDDEN",
            "Teacher can only schedule their own test",
            403,
        )

    if test["status"] != "ready":
        raise AppError(
            "TEST_NOT_READY",
            "Only ready tests can be scheduled",
            400,
        )

    class_row = await db.fetchrow(
        """
        SELECT
            id,
            teacher_id,
            name
        FROM classes
        WHERE id = $1
          AND school_id = $2
        """,
        req.class_id,
        school_id,
    )

    if class_row is None:
        raise AppError(
            "CLASS_NOT_FOUND",
            "Class not found",
            404,
        )

    # Hanya dosen pengampu kelas yang dapat menjadwalkan
    if class_row["teacher_id"] != teacher_id:
        raise AppError(
            "FORBIDDEN",
            "Teacher can only schedule exams for their own class",
            403,
        )

    corrector_id = req.corrector_id or teacher_id

    corrector_exists = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM teachers
            WHERE id = $1
              AND school_id = $2
        )
        """,
        corrector_id,
        school_id,
    )

    if not corrector_exists:
        raise AppError(
            "CORRECTOR_NOT_FOUND",
            "Corrector does not belong to this school",
            404,
        )

    duplicate = await db.fetchrow(
        """
        SELECT id
        FROM class_tests
        WHERE class_id = $1
          AND test_id = $2
        """,
        req.class_id,
        req.test_id,
    )

    if duplicate is not None:
        raise AppError(
            "TEST_ALREADY_SCHEDULED",
            "This test is already scheduled for this class",
            409,
        )

    row = await db.fetchrow(
        """
        INSERT INTO class_tests (
            corrector_id,
            class_id,
            test_id,
            status,
            test_date
        )
        VALUES ($1, $2, $3, 'scheduled', $4)
        RETURNING id
        """,
        corrector_id,
        req.class_id,
        req.test_id,
        req.test_date,
    )

    result = await get_class_test(
        db,
        row["id"],
        school_id,
    )

    return await class_test_response(
        db,
        result,
    )


# ============================================================
# CLASS TEST DETAIL
# ============================================================

async def get_class_test_detail(
    db,
    class_test_id: UUID,
    school_id: UUID,
):
    row = await get_class_test(
        db,
        class_test_id,
        school_id,
    )

    if row is None:
        return None

    base = await class_test_response(
        db,
        row,
    )

    total_pages = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM test_pages tp
        JOIN student_tests st
          ON st.id = tp.student_test_id
        WHERE st.class_test_id = $1
        """,
        class_test_id,
    )

    completed_pages = await db.fetchval(
        """
        SELECT COUNT(*)
        FROM test_pages tp
        JOIN student_tests st
          ON st.id = tp.student_test_id
        WHERE st.class_test_id = $1
          AND tp.status = 'success'
        """,
        class_test_id,
    )

    return ClassTestDetailResponse(
        **base.model_dump(),
        total_pages=total_pages,
        completed_pages=completed_pages,
    )


# ============================================================
# UPDATE CLASS TEST
# ============================================================

async def update_class_test(
    db,
    class_test_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
    req: UpdateClassTestRequest,
):
    current = await get_class_test(
        db,
        class_test_id,
        school_id,
    )

    if current is None:
        return None

    if (
        current["corrector_id"] != teacher_id
        and not await db.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM classes
                WHERE id = $1
                  AND teacher_id = $2
            )
            """,
            current["class_id"],
            teacher_id,
        )
    ):
        raise AppError(
            "FORBIDDEN",
            "Teacher cannot update this class test",
            403,
        )

    corrector_id = req.corrector_id

    if corrector_id is not None:
        corrector_exists = await db.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM teachers
                WHERE id = $1
                  AND school_id = $2
            )
            """,
            corrector_id,
            school_id,
        )

        if not corrector_exists:
            raise AppError(
                "CORRECTOR_NOT_FOUND",
                "Corrector does not belong to this school",
                404,
            )

    row = await db.fetchrow(
        """
        UPDATE class_tests
        SET
            corrector_id = $1,
            test_date = $2,
            status = COALESCE($3, status)
        WHERE id = $4
        RETURNING id
        """,
        corrector_id,
        req.test_date,
        req.status,
        class_test_id,
    )

    result = await get_class_test(
        db,
        row["id"],
        school_id,
    )

    return await class_test_response(
        db,
        result,
    )


# ============================================================
# DELETE CLASS TEST
# ============================================================

async def delete_class_test(
    db,
    class_test_id: UUID,
    school_id: UUID,
    teacher_id: UUID,
):
    current = await get_class_test(
        db,
        class_test_id,
        school_id,
    )

    if current is None:
        return False

    can_manage = (
        current["corrector_id"] == teacher_id
        or await db.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM classes
                WHERE id = $1
                  AND teacher_id = $2
            )
            """,
            current["class_id"],
            teacher_id,
        )
    )

    if not can_manage:
        raise AppError(
            "FORBIDDEN",
            "Teacher cannot delete this class test",
            403,
        )

    has_answer_sheet = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM student_tests
            WHERE class_test_id = $1
        )
        """,
        class_test_id,
    )

    if has_answer_sheet:
        raise AppError(
            "CLASS_TEST_HAS_ANSWER_SHEET",
            "Class test cannot be deleted because answer sheets already exist",
            409,
        )

    await db.execute(
        """
        DELETE FROM class_tests
        WHERE id = $1
        """,
        class_test_id,
    )

    return True