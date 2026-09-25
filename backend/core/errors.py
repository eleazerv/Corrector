from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.logging import log 

class AppError (Exception) : 
    def __init__(self, code : str , message : str , status : int = 400 , details= None) : 
        self.code = code 
        self.message = message 
        self.status = status 
        self.details = details
        
        
def not_found(what: str) -> AppError:
    return AppError("NOT_FOUND", f"{what} not found", 404)

def forbidden(msg: str = "Forbidden Access") -> AppError:
    return AppError("FORBIDDEN", msg, 403)

def conflict (msg: str = "Conflict") -> AppError :
    return AppError("CONFLICT", msg, 409)

def _body(code, message, details=None):
    return {"error": {"code": code, "message": message, "details": details}}


def register_error_handlers(app:FastAPI): 
    
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError): 
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.details))
    
    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request : Request ,exc: RequestValidationError ):
        return JSONResponse(status_code=422,
                            content=_body("VALIDATION_ERROR", "Input is not Valid ", exc.errors()))
        
    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        rid = getattr(request.state, "request_id", None)
        log.exception("Unhandled error rid=%s", rid)       # stack trace masuk log
        return JSONResponse(status_code=500,
                            content=_body("INTERNAL", "Internal Error", {"request_id": rid}))