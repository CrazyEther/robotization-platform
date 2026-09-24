# Simulation engines and financial evidence

## Implemented and executable

**JaamSim 2026-05:** actual third-party Apache-2.0 discrete-event process-flow simulator. The server generates resource-constrained JaamSim models for the baseline with existing personnel and several alternative robot fleets. It executes Java JAR in headless mode, reads the engine's actual reports, and generates separate peak-load experiments with 125% incoming demand. It NEVER substitutes Python calculations when JaamSim is unavailable. JaamSim version, model hash, binary hash, assumptions and limitations accompany the results.

**SimPy 4.1.1:** separate existing simplified transport process/charging model, with replicated experiments and approximate uncertainty. Its finance screen and JaamSim comparative finance screen do not quietly mix measurements from different model classes.

## Installation / launch

Install Java 17+, Python 3.11+, Node 24+. Run from the repository root: npm ci ; python -m pip install -r services/simulation/requirements.txt ; npm run jaamsim:install ; npm run start:full. Open the local URL printed by the launcher. The downloaded JaamSim binary must match SHA256 be8229bbe0a545e1e4a10338aa66dfd3c9e23d933c6f65bc3baa904d6f8fceb9. It is NOT committed to Git. Upstream: https://github.com/jaamsim/jaamsim/releases/tag/v2026-05 ; license Apache-2.0.

Docker backend: docker build -t ris-simulation:jaamsim services/simulation . Its image includes OpenJDK 17 and pinned JaamSim, fails the build if importing the API or verifying the actual JAR fails. The computational backend is separate from the Cloudflare Worker, and it is not published on Cloudflare.

## Engineering and economic semantics

The baseline uses user-configured worker count and seconds per existing-process task. The alternative uses chosen robot count, a route on a 1-meter grid and approximate per-task cycle time = twice route distance divided by speed + loading and unloading times. Both run against the SAME incoming task stream. The separately simulated 125% peak is only a stress hypothesis, not a demand forecast.

ROI/NPV/TCO reflect each simulated output, alternative-specific robot CAPEX and per-robot annual maintenance, annual baseline cash cost, residual personnel expense, electricity estimated from completed trips, and user-specified contribution from incremental completed tasks. Additional throughput generates cash only if the user explicitly supplies contribution margin. Missing baseline cost/robot price, insufficient annual throughput, or a single Poisson run block ROI/NPV. Annual cash flows are simplified; neither model proves the customer's price, ability to sell additional throughput, taxes, commissioning schedule or machine downtime.

The JaamSim model DOES NOT calculate 3D geometry, full-size robot motion, dynamics, collisions, doors, elevators, battery charging, conveyor handshakes or multi-fleet traffic. Four sector templates are single-level transport examples, not validated full hospital/airport/factory digital twins. Energy is an estimate, NOT an output of Gazebo/JaamSim physics. The same infrastructure and charger costs are assumed for all compared robot fleet sizes unless the user runs separate projects.

## Future physical adapter: Gazebo / Open-RMF

Open-RMF provides real demo worlds for clinics, airports, manufacturing/logistics and interacting robot fleets, doors and elevators: https://github.com/open-rmf/rmf_demos . None of these worlds is yet linked to the product. Gazebo/ROS2 are not installed in the verified Windows host; its registered Ubuntu WSL distro fails to mount. Connecting physical telemetry into the JaamSim process model/financial calculator requires a pinned physical simulator, reproducible geometry/robot model, timed tasks, energy, trajectories, traffic-conflict results, measured baseline and field validation. A picture or an SDF export is not evidence of a working physics adapter.

AnyLogic Cloud REST is not configured. A student/PLE license and privileged user gating do not automatically authorize multiple users of this website. Obtain explicit contractual rights before any hosted integration. No claim of AnyLogic-equivalent fidelity is made for the new process DES.
