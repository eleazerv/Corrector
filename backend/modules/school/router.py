from uuid import UUID

from fastapi import APIRouter, Depends, Query

from core.deps import (
    AdminUser,
    CurrentUser,
    get_db,
    get_supabase,
)
from core.errors import not_found
from core.ratelimit import rate_limit 

from . import service
from .schemas import (
    CreateStudentBulkRequest,
    CreateStudentRequest,
    CreateTeacherRequest,
    SchoolPlanResponse,
    StudentBulkCreatedResponse,
    StudentCreatedResponse,
    StudentListResponse,
    StudentUpdatedResponse,
    TeacherCreatedResponse,
    TeacherListResponse,
    TeacherUpdatedResponse,
    UpdateStudentRequest,
    UpdateTeacherRequest,
)


router = APIRouter(
    prefix="/school",
    tags=["School"],
)


# ============================================================
# TEACHERS
# ============================================================

@router.post(
    "/teachers",
    response_model=TeacherCreatedResponse,
    status_code=201,
    dependencies=[Depends(rate_limit("school_create", 30))],  
)
async def create_teacher(
    req: CreateTeacherRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase),
):
    teacher, password = await service.create_teacher(
        db,
        sb,
        admin.school_id,
        req,
    )

    return TeacherCreatedResponse(
        **teacher.model_dump(),
        initial_password=password,
    )


@router.get(
    "/teachers",
    response_model=TeacherListResponse,
)
async def get_teachers(
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    teachers, total = await service.list_teachers(
        db,
        admin.school_id,
    )

    return TeacherListResponse(
        items=teachers,
        total=total,
    )


@router.patch(
    "/teachers/{id}",
    response_model=TeacherUpdatedResponse,
)
async def update_teacher(
    id: UUID,
    req: UpdateTeacherRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase),
):
    teacher = await service.update_teacher(
        db,
        sb,
        id,
        admin.school_id,
        req,
    )

    if teacher is None:
        raise not_found("Teacher not found")

    return TeacherUpdatedResponse(
        **teacher.model_dump(),
    )


@router.delete(
    "/teachers/{id}",
    status_code=204,
)
async def delete_teacher(
    id: UUID,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase), 
):
    deleted = await service.delete_teacher(
        db,
        sb,
        id,
        admin.school_id,
    )

    if not deleted:
        raise not_found("Teacher not found")


# ============================================================
# STUDENTS
# ============================================================

@router.post(
    "/students",
    response_model=StudentCreatedResponse,
    status_code=201,
    dependencies=[Depends(rate_limit("school_create", 30))], 
)
async def create_student(
    req: CreateStudentRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase),
):
    student, password = await service.create_student(
        db,
        sb,
        admin.school_id,
        req,
    )

    return StudentCreatedResponse(
        **student.model_dump(),
        initial_password=password,
    )


@router.get(
    "/students",
    response_model=StudentListResponse,
)
async def get_students(
    q: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    students, total = await service.get_students(
        db,
        admin.school_id,
        q,
        limit,
        offset,
    )

    return StudentListResponse(
        items=students,
        total=total,
    )


@router.post(
    "/students/bulk",
    response_model=StudentBulkCreatedResponse,
    status_code=201,
    dependencies=[Depends(rate_limit("school_bulk", 5))],  
)
async def create_students_bulk(
    req: CreateStudentBulkRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase),
):
    students = await service.create_students_bulk(
        db,
        sb,
        admin.school_id,
        req,
    )

    return StudentBulkCreatedResponse(
        items=students,
        total=len(students),
    )


@router.patch(
    "/students/{id}",
    response_model=StudentUpdatedResponse,
)
async def update_student(
    id: UUID,
    req: UpdateStudentRequest,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase), 
):
    student = await service.update_student(
        db,
        sb,
        id,
        admin.school_id,
        req,
    )

    if student is None:
        raise not_found("Student not found")

    return StudentUpdatedResponse(
        **student.model_dump(),
    )


@router.delete(
    "/students/{id}",
    status_code=204,
)
async def delete_student(
    id: UUID,
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
    sb=Depends(get_supabase),  
):
    deleted = await service.delete_student(
        db,
        sb,
        id,
        admin.school_id,
    )

    if not deleted:
        raise not_found("Student not found")


# ============================================================
# SCHOOL PLAN
# ============================================================

@router.get(
    "/plan",
    response_model=SchoolPlanResponse,
)
async def get_school_plan(
    admin: CurrentUser = AdminUser,
    db=Depends(get_db),
):
    return await service.get_school_plan(
        db,
        admin.school_id,
    )