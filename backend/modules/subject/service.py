from uuid import UUID

from core.errors import AppError, forbidden

from .schemas import (
    CreateSubjectRequest,
    CreateSubjectRuleRequest,
    SubjectCoordinatorResponse,
    SubjectResponse,
    SubjectRuleResponse,
    UpdateCoordinatorsRequest,
    UpdateSubjectRequest,
    UpdateSubjectRuleRequest,
)


# ============================================================
# HELPER
# ============================================================

async def get_subject(
    db,
    subject_id: UUID,
    school_id: UUID,
):
    row = await db.fetchrow(
        """
        SELECT
            id,
            school_id,
            name,
            code,
            description
        FROM subjects
        WHERE id = $1
          AND school_id = $2
        """,
        subject_id,
        school_id,
    )

    return row


# ============================================================
# SUBJECT
# ============================================================

async def list_subjects(
    db,
    school_id: UUID,
):
    rows = await db.fetch(
        """
        SELECT
            id,
            school_id,
            name,
            code,
            description
        FROM subjects
        WHERE school_id = $1
        ORDER BY name
        """,
        school_id,
    )

    items = []

    for row in rows:
        coordinator_rows = await db.fetch(
            """
            SELECT
                sc.id,
                sc.teacher_id,
                t.name AS teacher_name,
                t.email AS teacher_email
            FROM subject_coordinators sc
            JOIN teachers t
              ON t.id = sc.teacher_id
            WHERE sc.subject_id = $1
            ORDER BY t.name
            """,
            row["id"],
        )

        coordinators = [
            SubjectCoordinatorResponse(**dict(coordinator))
            for coordinator in coordinator_rows
        ]

        items.append(
            SubjectResponse(
                id=row["id"],
                school_id=row["school_id"],
                name=row["name"],
                code=row["code"],
                description=row["description"],
                coordinators=coordinators,
            )
        )

    return items, len(items)


async def get_subject_detail(
    db,
    subject_id: UUID,
    school_id: UUID,
):
    row = await get_subject(
        db,
        subject_id,
        school_id,
    )

    if row is None:
        return None

    coordinator_rows = await db.fetch(
        """
        SELECT
            sc.id,
            sc.teacher_id,
            t.name AS teacher_name,
            t.email AS teacher_email
        FROM subject_coordinators sc
        JOIN teachers t
          ON t.id = sc.teacher_id
        WHERE sc.subject_id = $1
        ORDER BY t.name
        """,
        subject_id,
    )

    coordinators = [
        SubjectCoordinatorResponse(**dict(row))
        for row in coordinator_rows
    ]

    return SubjectResponse(
        id=row["id"],
        school_id=row["school_id"],
        name=row["name"],
        code=row["code"],
        description=row["description"],
        coordinators=coordinators,
    )


async def create_subject(
    db,
    school_id: UUID,
    req: CreateSubjectRequest,
):
    existing = await db.fetchrow(
        """
        SELECT id
        FROM subjects
        WHERE school_id = $1
          AND code = $2
        """,
        school_id,
        req.code,
    )

    if existing is not None:
        raise AppError(
            "SUBJECT_CODE_EXISTS",
            "Subject code already exists in this school",
            409,
        )

    row = await db.fetchrow(
        """
        INSERT INTO subjects (
            school_id,
            name,
            code,
            description
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            school_id,
            name,
            code,
            description
        """,
        school_id,
        req.name,
        req.code,
        req.description,
    )

    return SubjectResponse(
        id=row["id"],
        school_id=row["school_id"],
        name=row["name"],
        code=row["code"],
        description=row["description"],
        coordinators=[],
    )


async def update_subject(
    db,
    subject_id: UUID,
    school_id: UUID,
    req: UpdateSubjectRequest,
):
    subject = await get_subject(
        db,
        subject_id,
        school_id,
    )

    if subject is None:
        return None

    duplicate = await db.fetchrow(
        """
        SELECT id
        FROM subjects
        WHERE school_id = $1
          AND code = $2
          AND id <> $3
        """,
        school_id,
        req.code,
        subject_id,
    )

    if duplicate is not None:
        raise AppError(
            "SUBJECT_CODE_EXISTS",
            "Subject code already exists in this school",
            409,
        )

    row = await db.fetchrow(
        """
        UPDATE subjects
        SET
            name = $1,
            code = $2,
            description = $3
        WHERE id = $4
          AND school_id = $5
        RETURNING
            id,
            school_id,
            name,
            code,
            description
        """,
        req.name,
        req.code,
        req.description,
        subject_id,
        school_id,
    )

    coordinator_rows = await db.fetch(
        """
        SELECT
            sc.id,
            sc.teacher_id,
            t.name AS teacher_name,
            t.email AS teacher_email
        FROM subject_coordinators sc
        JOIN teachers t
          ON t.id = sc.teacher_id
        WHERE sc.subject_id = $1
        ORDER BY t.name
        """,
        subject_id,
    )

    coordinators = [
        SubjectCoordinatorResponse(**dict(row))
        for row in coordinator_rows
    ]

    return SubjectResponse(
        id=row["id"],
        school_id=row["school_id"],
        name=row["name"],
        code=row["code"],
        description=row["description"],
        coordinators=coordinators,
    )


async def delete_subject(
    db,
    subject_id: UUID,
    school_id: UUID,
):
    subject = await get_subject(
        db,
        subject_id,
        school_id,
    )

    if subject is None:
        return False

    has_test = await db.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM tests
            WHERE subject_id = $1
        )
        """,
        subject_id,
    )

    if has_test:
        raise AppError(
            "SUBJECT_HAS_TEST",
            "Subject cannot be deleted because it already has an exam",
            409,
        )

    await db.execute(
        """
        DELETE FROM subjects
        WHERE id = $1
          AND school_id = $2
        """,
        subject_id,
        school_id,
    )

    return True


# ============================================================
# COORDINATORS
# ============================================================

async def replace_coordinators(
    db,
    subject_id: UUID,
    school_id: UUID,
    req: UpdateCoordinatorsRequest,
):
    subject = await get_subject(
        db,
        subject_id,
        school_id,
    )

    if subject is None:
        return None

    # Hilangkan UUID yang duplikat
    teacher_ids = list(dict.fromkeys(req.teacher_ids))

    # Pastikan semua teacher berasal dari school yang sama
    if teacher_ids:
        teacher_rows = await db.fetch(
            """
            SELECT id
            FROM teachers
            WHERE school_id = $1
              AND id = ANY($2::uuid[])
            """,
            school_id,
            teacher_ids,
        )

        found_teacher_ids = {
            row["id"]
            for row in teacher_rows
        }

        invalid_teacher_ids = [
            teacher_id
            for teacher_id in teacher_ids
            if teacher_id not in found_teacher_ids
        ]

        if invalid_teacher_ids:
            raise AppError(
                "INVALID_COORDINATOR",
                "One or more teachers do not belong to this school",
                400,
            )

    async with db.transaction():
        await db.execute(
            """
            DELETE FROM subject_coordinators
            WHERE subject_id = $1
            """,
            subject_id,
        )

        for teacher_id in teacher_ids:
            await db.execute(
                """
                INSERT INTO subject_coordinators (
                    subject_id,
                    teacher_id
                )
                VALUES ($1, $2)
                """,
                subject_id,
                teacher_id,
            )

    return await get_subject_detail(
        db,
        subject_id,
        school_id,
    )


# ============================================================
# SUBJECT RULES
# ============================================================

async def list_rules(
    db,
    subject_id: UUID,
    school_id: UUID,
):
    subject = await get_subject(
        db,
        subject_id,
        school_id,
    )

    if subject is None:
        return None

    rows = await db.fetch(
        """
        SELECT
            id,
            subject_id,
            title,
            rule,
            category,
            is_active,
            created_by,
            updated_by
        FROM subject_rules
        WHERE subject_id = $1
        ORDER BY created_at
        """,
        subject_id,
    )

    items = [
        SubjectRuleResponse(**dict(row))
        for row in rows
    ]

    return items, len(items)


async def create_rule(
    db,
    subject_id: UUID,
    school_id: UUID,
    user_id: UUID,
    req: CreateSubjectRuleRequest,
):
    subject = await get_subject(
        db,
        subject_id,
        school_id,
    )

    if subject is None:
        return None

    row = await db.fetchrow(
        """
        INSERT INTO subject_rules (
            subject_id,
            title,
            rule,
            category,
            is_active,
            created_by,
            updated_by
        )
        VALUES ($1, $2, $3, $4, true, $5, $5)
        RETURNING
            id,
            subject_id,
            title,
            rule,
            category,
            is_active,
            created_by,
            updated_by
        """,
        subject_id,
        req.title,
        req.rule,
        req.category,
        user_id,
    )

    return SubjectRuleResponse(**dict(row))


async def update_rule(
    db,
    rule_id: UUID,
    school_id: UUID,
    user_id: UUID,
    req: UpdateSubjectRuleRequest,
):
    row = await db.fetchrow(
        """
        SELECT
            sr.id,
            sr.subject_id
        FROM subject_rules sr
        JOIN subjects s
          ON s.id = sr.subject_id
        WHERE sr.id = $1
          AND s.school_id = $2
        """,
        rule_id,
        school_id,
    )

    if row is None:
        return None

    updated = await db.fetchrow(
        """
        UPDATE subject_rules
        SET
            title = $1,
            rule = $2,
            category = $3,
            is_active = $4,
            updated_by = $5,
            updated_at = now()
        WHERE id = $6
        RETURNING
            id,
            subject_id,
            title,
            rule,
            category,
            is_active,
            created_by,
            updated_by
        """,
        req.title,
        req.rule,
        req.category,
        req.is_active,
        user_id,
        rule_id,
    )

    return SubjectRuleResponse(**dict(updated))


async def delete_rule(
    db,
    rule_id: UUID,
    school_id: UUID,
):
    row = await db.fetchrow(
        """
        SELECT sr.id
        FROM subject_rules sr
        JOIN subjects s
          ON s.id = sr.subject_id
        WHERE sr.id = $1
          AND s.school_id = $2
        """,
        rule_id,
        school_id,
    )

    if row is None:
        return False

    await db.execute(
        """
        DELETE FROM subject_rules
        WHERE id = $1
        """,
        rule_id,
    )

    return True