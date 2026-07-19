from __future__ import annotations

import asyncio
import os
from pathlib import Path
from uuid import UUID

from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from . import __version__
from .models import Capability, HealthResponse, JobRecord, JobRequest, JobState
from .runner import JobManager, capability_snapshot

runtime_root = Path(os.environ.get("AEROCEL_RUNTIME_ROOT", "runtime")).resolve()
manager = JobManager(runtime_root)
app = FastAPI(
    title="Aerocel Forge Scientific Orchestrator",
    version=__version__,
    docs_url="/docs",
    redoc_url=None,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service_version=__version__,
        active_jobs=manager.active_count(),
        capabilities=capability_snapshot(),
    )


@app.get("/capabilities", response_model=list[Capability])
def capabilities() -> list[Capability]:
    return capability_snapshot()


@app.get("/jobs", response_model=list[JobRecord])
def jobs() -> list[JobRecord]:
    return manager.list()


@app.get("/jobs/{job_id}", response_model=JobRecord)
def job(job_id: UUID) -> JobRecord:
    record = manager.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job does not exist")
    return record


@app.post("/jobs", response_model=JobRecord, status_code=202)
def create_job(request: JobRequest, background_tasks: BackgroundTasks) -> JobRecord:
    available = {item.adapter: item.available for item in capability_snapshot()}
    if not available.get(request.adapter, False):
        raise HTTPException(
            status_code=409,
            detail=f"Adapter {request.adapter.value} is unavailable on this host",
        )
    try:
        record = manager.create(request)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    background_tasks.add_task(manager.start, record.id)
    return record


@app.post("/jobs/{job_id}/cancel", response_model=JobRecord)
def cancel_job(job_id: UUID) -> JobRecord:
    try:
        return manager.cancel(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job does not exist") from exc


@app.websocket("/jobs/{job_id}/telemetry")
async def job_telemetry(websocket: WebSocket, job_id: UUID) -> None:
    await websocket.accept()
    try:
        while True:
            record = manager.get(job_id)
            if record is None:
                await websocket.send_json({"error": "Job does not exist"})
                await websocket.close(code=4404)
                return
            await websocket.send_json(
                {
                    "jobId": str(record.id),
                    "state": record.state.value,
                    "stage": record.stage,
                    "telemetry": record.telemetry,
                    "errorSummary": record.error_summary,
                    "timestamp": record.finished_at or record.started_at or record.created_at,
                    "progressFraction": None,
                    "progressNote": (
                        "No exact completion fraction is inferred from solver iteration counts."
                    ),
                },
                mode="json",
            )
            if record.state in {JobState.SUCCEEDED, JobState.FAILED, JobState.CANCELLED}:
                await websocket.close(code=1000)
                return
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return
