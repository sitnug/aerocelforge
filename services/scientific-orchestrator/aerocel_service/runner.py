from __future__ import annotations

import json
import shutil
import subprocess
import threading
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from .models import AdapterId, Capability, JobRecord, JobRequest, JobState

_EXECUTABLES: dict[AdapterId, str] = {
    AdapterId.OPENFOAM_CHECK: "checkMesh",
    AdapterId.VSPAERO: "vspaero",
    AdapterId.JSBSIM: "JSBSim",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def capability_snapshot() -> list[Capability]:
    capabilities: list[Capability] = []
    for adapter, executable in _EXECUTABLES.items():
        path = shutil.which(executable)
        capabilities.append(
            Capability(
                adapter=adapter,
                executable=executable,
                available=path is not None,
                executable_path=path,
                reason=(
                    "Executable detected; verification case still required"
                    if path is not None
                    else "Executable not found on PATH"
                ),
            )
        )
    return capabilities


class JobManager:
    """Runs only adapter-owned command shapes inside a managed case root."""

    def __init__(self, runtime_root: Path) -> None:
        self.runtime_root = runtime_root.resolve()
        self.case_root = self.runtime_root / "cases"
        self.log_root = self.runtime_root / "logs"
        self.case_root.mkdir(parents=True, exist_ok=True)
        self.log_root.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[UUID, JobRecord] = {}
        self._processes: dict[UUID, subprocess.Popen[str]] = {}
        self._lock = threading.RLock()

    def _case_directory(self, case_name: str) -> Path:
        candidate = (self.case_root / case_name).resolve()
        if candidate.parent != self.case_root:
            raise ValueError("case path escapes the managed case root")
        return candidate

    def _command(self, request: JobRequest, case_directory: Path) -> tuple[str, list[str]]:
        executable = shutil.which(_EXECUTABLES[request.adapter])
        if executable is None:
            raise RuntimeError(f"{_EXECUTABLES[request.adapter]} is unavailable")
        if request.adapter == AdapterId.OPENFOAM_CHECK:
            return executable, ["-case", str(case_directory), "-allGeometry", "-allTopology"]
        if request.adapter == AdapterId.VSPAERO:
            model = case_directory / "model"
            return executable, [str(model)]
        if request.adapter == AdapterId.JSBSIM:
            script = case_directory / "script.xml"
            return executable, ["--script", str(script)]
        raise RuntimeError(f"No command builder exists for {request.adapter}")

    def create(self, request: JobRequest) -> JobRecord:
        case_directory = self._case_directory(request.case_name)
        if not case_directory.is_dir():
            raise FileNotFoundError(f"Managed case does not exist: {request.case_name}")
        record = JobRecord(request=request)
        with self._lock:
            self._jobs[record.id] = record
        return record.model_copy(deep=True)

    def list(self) -> list[JobRecord]:
        with self._lock:
            return [record.model_copy(deep=True) for record in self._jobs.values()]

    def get(self, job_id: UUID) -> JobRecord | None:
        with self._lock:
            record = self._jobs.get(job_id)
            return None if record is None else record.model_copy(deep=True)

    def start(self, job_id: UUID) -> None:
        thread = threading.Thread(target=self._run, args=(job_id,), daemon=True)
        thread.start()

    def cancel(self, job_id: UUID) -> JobRecord:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                raise KeyError(job_id)
            process = self._processes.get(job_id)
            if process is not None and process.poll() is None:
                process.terminate()
            record.state = JobState.CANCELLED
            record.stage = "cancelled"
            record.finished_at = _now()
            return record.model_copy(deep=True)

    def _run(self, job_id: UUID) -> None:
        with self._lock:
            record = self._jobs[job_id]
            if record.state == JobState.CANCELLED:
                return
            record.state = JobState.RUNNING
            record.stage = "launching"
            record.started_at = _now()
            request = record.request

        case_directory = self._case_directory(request.case_name)
        log_path = self.log_root / f"{job_id}.log"
        try:
            executable, arguments = self._command(request, case_directory)
            manifest = {
                "jobId": str(job_id),
                "adapter": request.adapter.value,
                "inputHash": request.input_hash,
                "executable": Path(executable).name,
                "arguments": arguments,
                "startedAt": _now().isoformat(),
            }
            (case_directory / "aerocel-job.json").write_text(
                json.dumps(manifest, indent=2), encoding="utf-8"
            )
            with log_path.open("w", encoding="utf-8") as log:
                process = subprocess.Popen(  # noqa: S603 - executable comes from fixed adapter map
                    [executable, *arguments],
                    cwd=case_directory,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    text=True,
                    shell=False,
                )
                with self._lock:
                    self._processes[job_id] = process
                    record = self._jobs[job_id]
                    record.stage = "solver"
                    record.log_path = str(log_path)
                exit_code = process.wait()
            with self._lock:
                record = self._jobs[job_id]
                if record.state != JobState.CANCELLED:
                    record.exit_code = exit_code
                    record.state = JobState.SUCCEEDED if exit_code == 0 else JobState.FAILED
                    record.stage = "complete" if exit_code == 0 else "solver_failed"
                    record.error_summary = (
                        None
                        if exit_code == 0
                        else f"Solver exited with code {exit_code}; inspect {log_path.name}"
                    )
                record.finished_at = _now()
        except Exception as exc:  # surfaced in the job record with its stage
            with self._lock:
                record = self._jobs[job_id]
                record.state = JobState.FAILED
                record.stage = "launch_failed"
                record.error_summary = str(exc)
                record.finished_at = _now()
        finally:
            with self._lock:
                self._processes.pop(job_id, None)

    def active_count(self) -> int:
        with self._lock:
            return sum(
                record.state in {JobState.QUEUED, JobState.RUNNING}
                for record in self._jobs.values()
            )


def redact_log_lines(lines: Iterable[str]) -> list[str]:
    redacted: list[str] = []
    for line in lines:
        sanitized = line.replace("PRIVATE KEY", "[REDACTED]")
        redacted.append(sanitized[:2_000])
    return redacted
