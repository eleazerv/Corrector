from uuid import UUID

from fastapi import APIRouter, Depends

from core.deps import (
    AdminUser,
    CurrentUser,
    get_current_user,
    get_db,
)
from core.errors import forbidden, not_found

from . import service
from .schemas import (
    CreateSubjectRequest,
    CreateSubjectRuleRequest,
    SubjectListResponse,
    SubjectResponse,
    SubjectRuleListResponse,
    SubjectRuleResponse,
    UpdateCoordinatorsRequest,
    UpdateSubjectRequest,
    UpdateSubjectRuleRequest,
)


router = APIRouter(
    prefix="/subjects",
    tags=["Subject"],
)


# ============================================================
# SUBJECT
# ============================================================

@router.get(
    "",
    response_model=SubjectListResponse,
)
async def list_subjects(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    subjects, total = await service.list_subjects(
        db,
        user.school_id,
    )

    return SubjectListResponse(
        items=subjects,
        total=total,
    )


@router.get(
    "/{id}",
    response_model=SubjectResponse,
)
async def get_subject(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    subject = await service.get_subject_detail(
        db,
        id,
        user.school_id,
    )

    if subject is None:
        raise not_found("Subject not found")

    return subject


@router.post(
    "",
    response_model=SubjectResponse,
    status_code=201,
)
async def create_subject(
    req: CreateSubjectRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    return await service.create_subject(
        db,
        admin.school_id,
        req,
    )


@router.patch(
    "/{id}",
    response_model=SubjectResponse,
)
async def update_subject(
    id: UUID,
    req: UpdateSubjectRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    subject = await service.update_subject(
        db,
        id,
        admin.school_id,
        req,
    )

    if subject is None:
        raise not_found("Subject not found")

    return subject


@router.delete(
    "/{id}",
    status_code=204,
)
async def delete_subject(
    id: UUID,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    deleted = await service.delete_subject(
        db,
        id,
        admin.school_id,
    )

    if not deleted:
        raise not_found("Subject not found")


# ============================================================
# COORDINATORS
# ============================================================

@router.put(
    "/{id}/coordinators",
    response_model=SubjectResponse,
)
async def replace_coordinators(
    id: UUID,
    req: UpdateCoordinatorsRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    subject = await service.replace_coordinators(
        db,
        id,
        admin.school_id,
        req,
    )

    if subject is None:
        raise not_found("Subject not found")

    return subject


# ============================================================
# SUBJECT RULES
# ============================================================

@router.get(
    "/{id}/rules",
    response_model=SubjectRuleListResponse,
)
async def list_rules(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    result = await service.list_rules(
        db,
        id,
        user.school_id,
    )

    if result is None:
        raise not_found("Subject not found")

    items, total = result

    return SubjectRuleListResponse(
        items=items,
        total=total,
    )


@router.post(
    "/{id}/rules",
    response_model=SubjectRuleResponse,
    status_code=201,
)
async def create_rule(
    id: UUID,
    req: CreateSubjectRuleRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    # Kalau teacher, harus menjadi coordinator subject
    if user.role == "teacher":
        is_coordinator = await db.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM subject_coordinators sc
                WHERE sc.subject_id = $1
                  AND sc.teacher_id = $2
            )
            """,
            id,
            user.profile_id,
        )

        if not is_coordinator:
            raise forbidden(
                "Only subject coordinators can manage this subject's rules"
            )

    rule = await service.create_rule(
        db,
        id,
        user.school_id,
        user.user_id,
        req,
    )

    if rule is None:
        raise not_found("Subject not found")

    return rule


@router.patch(
    "/rules/{id}",
    response_model=SubjectRuleResponse,
)
async def update_rule(
    id: UUID,
    req: UpdateSubjectRuleRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    if user.role == "teacher":
        is_coordinator = await db.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM subject_coordinators sc
                JOIN subject_rules sr
                  ON sr.subject_id = sc.subject_id
                WHERE sr.id = $1
                  AND sc.teacher_id = $2
            )
            """,
            id,
            user.profile_id,
        )

        if not is_coordinator:
            raise forbidden(
                "Only subject coordinators can manage this subject's rules"
            )

    rule = await service.update_rule(
        db,
        id,
        user.school_id,
        user.user_id,
        req,
    )

    if rule is None:
        raise not_found("Subject rule not found")

    return rule


@router.delete(
    "/rules/{id}",
    status_code=204,
)
async def delete_rule(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    if user.role == "teacher":
        is_coordinator = await db.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM subject_coordinators sc
                JOIN subject_rules sr
                  ON sr.subject_id = sc.subject_id
                WHERE sr.id = $1
                  AND sc.teacher_id = $2
            )
            """,
            id,
            user.profile_id,
        )

        if not is_coordinator:
            raise forbidden(
                "Only subject coordinators can manage this subject's rules"
            )

    deleted = await service.delete_rule(
        db,
        id,
        user.school_id,
    )

    if not deleted:
        raise not_found("Subject rule not found")