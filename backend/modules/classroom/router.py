from uuid import UUID

from fastapi import APIRouter, Depends, Query

from core.deps import (
    CurrentUser,
    get_current_user,
    get_db,
)
from core.errors import forbidden, not_found

from . import service
from .schemas import (
    AddStudentsRequest,
    ClassDetailResponse,
    ClassListResponse,
    ClassResponse,
    ClassStudentListResponse,
    ClassStudentResponse,
    CreateClassRequest,
    SchoolStudentListResponse,
    UpdateClassRequest,
)


router = APIRouter(
    prefix="/classes",
    tags=["Classroom"],
)

students_router = APIRouter(
    prefix="/students",
    tags=["Classroom"],
)


# ============================================================
# CLASSES
# ============================================================

@router.get(
    "",
    response_model=ClassListResponse,
)
async def list_classes(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    items, total = await service.list_classes(
        db,
        user.school_id,
        user.role,          
        user.profile_id,  
    )

    return ClassListResponse(
        items=items,
        total=total,
    )


@router.post(
    "",
    response_model=ClassResponse,
    status_code=201,
)
async def create_class(
    req: CreateClassRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    return await service.create_class(
        db,
        user.school_id,
        user.role,
        user.profile_id,
        req,
    )


@router.get(
    "/{id}",
    response_model=ClassDetailResponse,
)
async def get_class(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    result = await service.get_class_detail(
        db,
        id,
        user.school_id,
        user.role,          
        user.profile_id,    
    )

    if result is None:
        raise not_found("Class not found")

    return result


@router.patch(
    "/{id}",
    response_model=ClassResponse,
)
async def update_class(
    id: UUID,
    req: UpdateClassRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    result = await service.update_class(
        db,
        id,
        user.school_id,
        user.role,
        user.profile_id,
        req,
    )

    if result is None:
        raise not_found("Class not found")

    return result


@router.delete(
    "/{id}",
    status_code=204,
)
async def delete_class(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    deleted = await service.delete_class(
        db,
        id,
        user.school_id,
        user.role,
        user.profile_id,
    )

    if not deleted:
        raise not_found("Class not found")


# ============================================================
# CLASS STUDENTS
# ============================================================

@router.get(
    "/{id}/students",
    response_model=ClassStudentListResponse,
)
async def list_class_students(
    id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    result = await service.list_class_students(
        db,
        id,
        user.school_id,
        user.role,          
        user.profile_id,    
    )

    if result is None:
        raise not_found("Class not found")

    items, total = result

    return ClassStudentListResponse(
        items=items,
        total=total,
    )


@router.post(
    "/{id}/students",
    response_model=ClassStudentListResponse,
)
async def add_students(
    id: UUID,
    req: AddStudentsRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    result = await service.add_students(
        db,
        id,
        user.school_id,
        user.role,
        user.profile_id,
        req,
    )

    if result is None:
        raise not_found("Class not found")

    items, total = result

    return ClassStudentListResponse(
        items=items,
        total=total,
    )


@router.delete(
    "/{id}/students/{student_id}",
    status_code=204,
)
async def remove_student(
    id: UUID,
    student_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    deleted = await service.remove_student(
        db,
        id,
        student_id,
        user.school_id,
        user.role,
        user.profile_id,
    )

    if deleted is None:
        raise not_found("Class not found")

    if not deleted:
        raise not_found("Student is not a member of this class")


# ============================================================
# SCHOOL STUDENTS SEARCH
# ============================================================

@students_router.get(
    "",
    response_model=SchoolStudentListResponse,
)
async def search_students(
    q: str | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_db),
):
    if user.role not in ("teacher", "school_admin"):
        raise forbidden()

    items, total = await service.search_students(
        db,
        user.school_id,
        q,
    )

    return SchoolStudentListResponse(
        items=items,
        total=total,
    )