from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from aerocel_service.models import AdapterId, JobRequest
from aerocel_service.runner import JobManager, redact_log_lines


class RunnerSecurityTests(unittest.TestCase):
    def test_case_name_rejects_traversal(self) -> None:
        with self.assertRaises(ValueError):
            JobRequest(
                adapter=AdapterId.OPENFOAM_CHECK,
                case_name="../escape",
                input_hash="a" * 64,
                resource_class="heavy",
            )

    def test_manager_keeps_cases_inside_runtime_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manager = JobManager(Path(directory))
            request = JobRequest(
                adapter=AdapterId.OPENFOAM_CHECK,
                case_name="safe-case",
                input_hash="a" * 64,
                resource_class="heavy",
            )
            with self.assertRaises(FileNotFoundError):
                manager.create(request)

    def test_diagnostic_log_redaction(self) -> None:
        lines = redact_log_lines(["-----BEGIN PRIVATE KEY-----", "solver diverged"])
        self.assertNotIn("PRIVATE KEY", " ".join(lines))
        self.assertIn("solver diverged", lines)


if __name__ == "__main__":
    unittest.main()
