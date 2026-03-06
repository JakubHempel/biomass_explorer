from __future__ import annotations

from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional
import os

import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import database

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "biomass-explorer-jwt-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 h

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

# ---------------------------------------------------------------------------
# User record loaded from users.accounts (PostgreSQL)
# ---------------------------------------------------------------------------

@dataclass
class UserRecord:
    id: int
    username: str
    email: Optional[str]
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    hashed_password: str = field(default="", repr=False)


_SELECT = (
    "SELECT id, username, email, full_name, hashed_password, role, is_active, created_at "
    f"FROM {database.USERS_ACCOUNTS_TABLE}"
)


def _row_to_user(row) -> UserRecord:
    return UserRecord(
        id=row[0], username=row[1], email=row[2], full_name=row[3],
        hashed_password=row[4], role=row[5], is_active=row[6], created_at=row[7],
    )


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Auth logic
# ---------------------------------------------------------------------------

def authenticate_user(username: str, password: str) -> Optional[UserRecord]:
    """Verify credentials against users.accounts in PostgreSQL."""
    with database.pg_cursor() as cur:
        cur.execute(
            _SELECT + " WHERE username = %s AND is_active = TRUE",
            (username,),
        )
        row = cur.fetchone()

    if not row or not verify_password(password, row[4]):
        return None
    return _row_to_user(row)


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserRecord:
    """FastAPI dependency: decode JWT and return UserRecord from PostgreSQL."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    payload = _decode_token(token)
    if payload is None:
        raise exc
    username: str = payload.get("sub")
    if not username:
        raise exc

    with database.pg_cursor() as cur:
        cur.execute(
            _SELECT + " WHERE username = %s AND is_active = TRUE",
            (username,),
        )
        row = cur.fetchone()

    if row is None:
        raise exc
    return _row_to_user(row)


def require_admin(current_user: UserRecord = Depends(get_current_user)) -> UserRecord:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
