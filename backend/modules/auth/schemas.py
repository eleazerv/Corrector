from uuid import UUID

from pydantic import BaseModel


class MeResponse(BaseModel):
    user_id: UUID
    role: str
    profile_id: UUID
    school_id: UUID