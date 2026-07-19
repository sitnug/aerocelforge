# Remote solver setup

Remote execution is intended for a user-controlled Linux workstation or cluster.
The Mac remains the control surface and stores the project/result manifest.

## Host preparation

1. Create a non-root account with a dedicated case root such as
   `/srv/aerocel/cases` and a resource quota.
2. Install the exact solver versions you have validated. Record `--version`
   output and environment modules in every result manifest.
3. Install the scientific orchestrator in a virtual environment, or use the
   provided container image.
4. Bind it to loopback and reach it through an SSH tunnel. Do not publish the
   unauthenticated development service to a network.
5. Use SSH keys loaded into an agent. Do not put credentials in `.aerocel.json`
   projects, command arguments, logs, or repository files.

Example tunnel:

```bash
ssh -N -L 8765:127.0.0.1:8765 aerocel-solver
```

Then configure the app endpoint as `http://127.0.0.1:8765`. The host alias belongs
in `~/.ssh/config`, outside the project.

## Run the orchestrator

```bash
cd services/scientific-orchestrator
../../.venv/bin/uvicorn aerocel_service.main:app \
  --host 127.0.0.1 --port 8765
```

Set `AEROCEL_RUNTIME_ROOT` to a dedicated runtime directory before launch. Cases
must exist below its `cases/` child; submitted names are resolved and contained
there. Jobs use adapter-owned
executable/argument arrays, stream stdout/stderr over WebSocket, and support
cancellation. No arbitrary shell string endpoint exists.

## Slurm

`infrastructure/slurm/aerocel-openfoam.sbatch` is a conservative template. Pin the
module, CPU count, memory, wall time, and partition for the cluster. The adapter
must capture the Slurm job ID, `sacct` status, module list, solver version, and
case hash. Cancellation maps to `scancel` for that exact recorded job ID.

## Transfer and integrity

- Transfer an immutable case archive and verify its SHA-256 on the remote host.
- Write outputs to a new job directory; never reuse a completed result directory.
- Return a manifest first, then selected fields/logs. Verify hashes after transfer.
- Treat interrupted transfers and incomplete solver time directories as failed or
  partial, never successful.
- Enforce storage retention outside the desktop app for large field data.

## Security boundary

The current FastAPI service is a local/reference implementation without user
authentication. For shared infrastructure, put it behind an authenticated reverse
proxy or build a mutually authenticated transport and complete a security review.
