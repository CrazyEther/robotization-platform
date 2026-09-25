# RIS — acceptance matrix after Digital Twin migration

This matrix describes the current implementation, not marketing promises.

| Requirement | Implemented now | Remaining evidence / work |
|---|---|---|
| One coherent workflow | object → robot → Digital Twin → replay → baseline comparison → economics/export | persistence and authenticated project lifecycle |
| User facility plan | image underlay + JSON geometry | automatic PDF/DXF/DWG/BIM extraction and scale calibration |
| Editable 2D facility | blocking walls/racks; door/charger/station/elevator objects; A/B zones | richer geometry, multi-floor and semantic topology |
| Actual robot visualization | robot positions recorded by the same execution that generates KPI | calibrated footprint, turning dynamics and sensor/safety zones |
| Multiple robots | task dispatch, exclusive internal cells, traffic waits | multi-route planner, intersection reservations and fleet interoperability |
| Charging | battery depletion, charger-channel contention; charger capacity from scene | physical charger placement/reachability and battery calibration |
| Warehouse | pallet-delivery preset | site-specific resources/process validation |
| Hospital | medication-delivery preset | elevators, automatic doors, people, sterile/restricted zones |
| Airport | baggage-transfer preset | conveyors, security zones, multiple baggage processes |
| Factory | inter-operation delivery preset | machine handshakes, buffers, failures and production calendars |
| Baseline vs automation | same geometry and workload class; separate execution | baseline calibration from measured operational data |
| KPI | completed/backlog, throughput, queue, job time/P95, utilization, energy, traffic wait, distances | confidence intervals/replications and field error bounds |
| 2D replay | full trajectory-frame replay | trace compression and very large scenarios |
| 3D | Three.js view using same geometry and robot positions | detailed robot assets, physics and collision geometry |
| CAPEX/OPEX/TCO/ROI/NPV | linked to baseline/robot outputs; blocked when common annual plan is not met | quotations, taxes/financing, commissioning schedule, uncertainty |
| AnyLogic integration | versioned, fail-closed REST contract and local PLE/MCP development setup | actual published RIS model; end-to-end live execution proof |
| Extensibility | sector process presets separated from core engine | plug-in scenario/resources schema rather than code-only extension |
| Public preview | local browser twin works; protected server APIs blocked | auth, DB persistence, tenant security, production monitoring |

## Non-negotiable interpretation

A successful browser run proves only that the implemented model executed consistently for the supplied assumptions. It does not prove real-site throughput, safety, vendor compatibility or financial return. Those claims require calibration and independent engineering/financial evidence.
