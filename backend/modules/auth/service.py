from .schemas import MeResponse

PROFILE_SQL = {
    "teacher": "select name, email, null::text as nim from teachers where id = $1",
    "student": "select name, email, nim from students where id = $1",
    "school_admin": "select name, email, null::text as nim from school_admins where id = $1",
}


async def get_me(db, user) -> MeResponse:
    row = None
    sql = PROFILE_SQL.get(user.role)                       
    if sql is not None:
        row = await db.fetchrow(sql, user.profile_id)
    return MeResponse(
        user_id=user.user_id,
        role=user.role,
        profile_id=user.profile_id,
        school_id=user.school_id,
        name=row["name"] if row else None,                   
        email=row["email"] if row else None,                 
        nim=row["nim"] if row else None,                    
    )
