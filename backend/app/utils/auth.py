"""Authentication utilities (mocked for MVP)"""

from fastapi import Header, HTTPException


def get_current_user(
    x_user_id: str = Header(..., description="User ID (mocked auth)"),
    x_user_role: str = Header(..., description="User role: 'operator' or 'officer'"),
) -> dict:
    """Mock auth - extracts user info from headers"""
    if x_user_role not in ["operator", "officer"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'operator' or 'officer'")
    return {"user_id": x_user_id, "role": x_user_role}
