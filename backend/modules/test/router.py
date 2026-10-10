from uuid import UUID

from fastapi import APIRouter, Depends, Query

from core.deps import CurrentUser, get_current_user, get_db
from core.errors import forbidden, not_found

from . import service
from .schemas import (
    ClassTestDetailResponse,
    ClassTestListResponse,
    ClassTestResponse,
    CreateClassTestRequest,
    CreateQuestionRequest,
    CreateTestRequest,
    CriteriaRequest,
    QuestionResponse,
    TestDetailResponse,
    TestListResponse,
    TestResponse,
    UpdateClassTestRequest,
    UpdateQuestionRequest,
    UpdateTestRequest,
)


router = APIRouter(
    prefix="/tests",
    tags=["Test"],
)

questions_router = APIRouter(
    prefix="/questions",
    tags=["Test"],
)

class_tests_router = APIRouter(
    prefix="/class-tests",
    tags=["Test"],
)


# ============================================================
# TESTS
# ============================================================

@router.get(
    "",
    response_model=TestListResponse,
)
async def list_tests(
    scope: str = Query(default="mine"),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    if scope not in ("mine", "school"):
        scope = "mine"

    items, total = await service.list_tests(
        db,
        user.school_id,
        user.profile_id,
        scope,
    )

    return TestListResponse(
        items=items,
        total=total,
    )


@router.post(
    "",
    response_model=TestResponse,
    status_code=201,
)
async def create_test(
    req: CreateTestRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    return await service.create_test(
        db,
        user.school_id,
        user.profile_id,
        req,
    )


@router.get(
    "/{id}",
    response_model=TestDetailResponse,
)
async def get_test(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.get_test_detail(
        db,
        id,
        user.school_id,
    )

    if result is None:
        raise not_found("Test not found")

    return result


@router.patch(
    "/{id}",
    response_model=TestResponse,
)
async def update_test(
    id: UUID,
    req: UpdateTestRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.update_test(
        db,
        id,
        user.school_id,
        user.profile_id,
        req,
    )

    if result is None:
        raise not_found("Test not found")

    return result


@router.delete(
    "/{id}",
    status_code=204,
)
async def delete_test(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    deleted = await service.delete_test(
        db,
        id,
        user.school_id,
        user.profile_id,
    )

    if not deleted:
        raise not_found("Test not found")


# ============================================================
# QUESTIONS
# ============================================================

@router.post(
    "/{id}/questions",
    response_model=QuestionResponse,
    status_code=201,
)
async def add_question(
    id: UUID,
    req: CreateQuestionRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.add_question(
        db,
        id,
        user.school_id,
        user.profile_id,
        req,
    )

    if result is None:
        raise not_found("Test not found")

    return result


@router.patch(
    "/{id}/questions/{question_id}",
    response_model=QuestionResponse,
)
async def update_question(
    id: UUID,
    question_id: UUID,
    req: UpdateQuestionRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.update_question(
        db,
        id,
        question_id,
        user.school_id,
        user.profile_id,
        req,
    )

    if result is None:
        raise not_found("Question not found")

    return result


# ============================================================
# QUESTION CRITERIA
# ============================================================

@questions_router.delete(
    "/{id}",
    status_code=204,
)
async def delete_question(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    deleted = await service.delete_question(
        db,
        id,
        user.school_id,
        user.profile_id,
    )

    if not deleted:
        raise not_found("Question not found")


@questions_router.put(
    "/{id}/criteria",
    response_model=list[CriteriaRequest],
)
async def replace_criteria(
    id: UUID,
    criteria: list[CriteriaRequest],
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.replace_criteria(
        db,
        id,
        user.school_id,
        user.profile_id,
        criteria,
    )

    if result is None:
        raise not_found("Question not found")

    return result


# ============================================================
# CLASS TESTS
# ============================================================

@class_tests_router.get(
    "",
    response_model=ClassTestListResponse,
)
async def list_class_tests(
    class_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    items, total = await service.list_class_tests(
        db,
        user.school_id,
        user.profile_id,
        class_id,
        status,
    )

    return ClassTestListResponse(
        items=items,
        total=total,
    )


@class_tests_router.post(
    "",
    response_model=ClassTestResponse,
    status_code=201,
)
async def create_class_test(
    req: CreateClassTestRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    return await service.create_class_test(
        db,
        user.school_id,
        user.profile_id,
        req,
    )


@class_tests_router.get(
    "/{id}",
    response_model=ClassTestDetailResponse,
)
async def get_class_test(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.get_class_test_detail(
        db,
        id,
        user.school_id,
    )

    if result is None:
        raise not_found("Class test not found")

    return result


@class_tests_router.patch(
    "/{id}",
    response_model=ClassTestResponse,
)
async def update_class_test(
    id: UUID,
    req: UpdateClassTestRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    result = await service.update_class_test(
        db,
        id,
        user.school_id,
        user.profile_id,
        req,
    )

    if result is None:
        raise not_found("Class test not found")

    return result


@class_tests_router.delete(
    "/{id}",
    status_code=204,
)
async def delete_class_test(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role != "teacher":
        raise forbidden()

    deleted = await service.delete_class_test(
        db,
        id,
        user.school_id,
        user.profile_id,
    )

    if not deleted:
        raise not_found("Class test not found")