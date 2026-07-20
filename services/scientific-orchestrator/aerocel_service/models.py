from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AdapterId(str, Enum):
    OPENFOAM_CHECK = "openfoam-check"
    VSPAERO = "vspaero"
    JSBSIM = "jsbsim"


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Capability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapter: AdapterId
    executable: str
    available: bool
    executable_path: Optional[str]
    reason: str


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapter: AdapterId
    case_name: str = Field(min_length=1, max_length=96)
    input_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    resource_class: str = Field(pattern=r"^(lightweight|moderate|heavy|workstation|cluster)$")

    @field_validator("case_name")
    @classmethod
    def safe_case_name(cls, value: str) -> str:
        supported = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ "
        if value.startswith(".") or any(character not in supported for character in value):
            raise ValueError("case_name contains unsupported characters")
        return value


class JobRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    request: JobRequest
    state: JobState = JobState.QUEUED
    stage: str = "queued"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    log_path: Optional[str] = None
    error_summary: Optional[str] = None
    telemetry: dict[str, float] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    service_version: str
    active_jobs: int
    capabilities: list[Capability]
