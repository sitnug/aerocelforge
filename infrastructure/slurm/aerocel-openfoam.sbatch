#!/usr/bin/env bash
#SBATCH --job-name=aerocel-openfoam
#SBATCH --nodes=1
#SBATCH --ntasks-per-node=16
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --output=slurm-%j.out
#SBATCH --error=slurm-%j.err

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: sbatch aerocel-openfoam.sbatch CASE_DIR SOLVER" >&2
  exit 64
fi

case_dir="$(realpath "$1")"
solver="$2"
allowed_root="/srv/aerocel/cases"

case "$case_dir" in
  "$allowed_root"/*) ;;
  *) echo "case directory is outside $allowed_root" >&2; exit 65 ;;
esac

case "$solver" in
  simpleFoam|pimpleFoam|rhoSimpleFoam) ;;
  *) echo "unsupported solver: $solver" >&2; exit 66 ;;
esac

cd "$case_dir"
checkMesh -allGeometry -allTopology
srun "$solver" -case "$case_dir"
