# Third-party software and licenses

Aerocel Forge does not bundle the external scientific solvers listed below. This
inventory separates locked application dependencies from tools discovered on a
user-managed machine. Always verify the license shipped with the exact version
you install.

## Locked application dependencies

Versions below are resolved by `package-lock.json` or `Cargo.lock` at this commit.
Transitive notices remain in the corresponding package metadata and source tree.

| Component          |     Locked version | License           | Purpose                     |
| ------------------ | -----------------: | ----------------- | --------------------------- |
| React / React DOM  |             19.2.7 | MIT               | user interface              |
| Three.js           |            0.185.1 | MIT               | engineering 3D rendering    |
| React Three Fiber  |              9.6.1 | MIT               | React/Three integration     |
| Drei               |             10.7.7 | MIT               | camera and viewport helpers |
| Zustand            |             5.0.14 | MIT               | local UI state              |
| Zod                |              4.4.3 | MIT               | runtime project validation  |
| Tauri API / CLI    |    2.11.1 / 2.11.4 | MIT or Apache-2.0 | native host and build       |
| Vite / Vitest      |     8.1.5 / 4.1.10 | MIT               | build and tests             |
| TypeScript         |              6.0.3 | Apache-2.0        | strict static typing        |
| ESLint / Prettier  |     9.39.5 / 3.9.5 | MIT               | code quality                |
| Tauri Rust crate   |             2.11.5 | MIT or Apache-2.0 | native command host         |
| serde / serde_json |  1.0.229 / 1.0.150 | MIT or Apache-2.0 | typed serialization         |
| sysinfo            |             0.38.3 | MIT               | system diagnostics          |
| which              |              8.0.5 | MIT               | executable detection        |
| FastAPI            | 0.128+ constrained | MIT               | orchestration API           |
| Pydantic           |  2.11+ constrained | MIT               | job contract validation     |
| Uvicorn            |  0.35+ constrained | BSD-3-Clause      | local service host          |
| Ruff / mypy        |    dev constraints | MIT               | Python quality gates        |

## External scientific tools: not bundled

| Tool                             | License                                                                                                 | Invocation boundary                                                      | Typical platform                   | Important limitation                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------- |
| OpenFOAM Foundation distribution | [GPLv3](https://openfoam.org/licence/)                                                                  | adapter stages such as `blockMesh`, `snappyHexMesh`, `checkMesh`, solver | Linux; Linux VM/container on macOS | distribution/version command names differ; mesh and convergence must be inspected |
| SU2                              | [LGPL-2.1](https://github.com/su2code/SU2/blob/master/LICENSE.md)                                       | future typed CFD adapter                                                 | Linux/macOS                        | no production adapter in this revision                                            |
| OpenVSP / VSPAERO                | [NASA Open Source Agreement 1.3](https://github.com/OpenVSP/OpenVSP/blob/main/LICENSE)                  | future geometry/aero service                                             | Linux/macOS                        | not invoked by the current build; confirm NOSA obligations for intended use       |
| JSBSim                           | [LGPL-2.1](https://github.com/JSBSim-Team/jsbsim/blob/master/COPYING)                                   | future FDM comparison adapter                                            | Linux/macOS                        | generated model fidelity depends on supplied coefficients                         |
| PX4 Autopilot                    | [BSD-3-Clause](https://github.com/PX4/PX4-Autopilot/blob/main/LICENSE)                                  | SITL adapter and MAVLink bridge                                          | Linux/macOS                        | live bridge is capability-gated and version-sensitive                             |
| Gazebo Sim                       | [Apache-2.0](https://github.com/gazebosim/gz-sim/blob/main/LICENSE)                                     | external process/transport bridge                                        | Linux; supported macOS setups vary | live bridge is not bundled; PX4/Gazebo release pairing matters                    |
| QGroundControl                   | [Apache-2.0](https://github.com/mavlink/qgroundcontrol/blob/master/COPYING.md)                          | user-launched GCS through MAVLink                                        | macOS/Linux                        | independent application and release lifecycle                                     |
| OpenCascade                      | [LGPL-2.1 with exception](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt) | planned STEP/IGES service                                                | Linux/macOS                        | required for real B-rep import; not bundled                                       |

Aerocel Forge communicates with external programs as separate processes or remote
services. Nothing in this file changes their licenses, trademark policies, export
controls, or the obligations of anyone who redistributes them.
