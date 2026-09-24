"""Acceptance checks for a genuine JaamSim process-model experiment and its economics."""
import copy
import os
import unittest
from pathlib import Path

from engine import route_length
from test_engine import BASE

class JaamSimComparisonTests(unittest.TestCase):
    def setUp(self):
        from jaamsim_engine import JaamSimUnavailable, run_comparison
        self.run_comparison = run_comparison
        self.unavailable = JaamSimUnavailable
        self.case = copy.deepcopy(BASE)
        self.case["workload"] = {"demandPerHour":60, "loadKg":80, "shiftHours":1}
        self.case["robot"].update(count=2, speedMps=1, loadSeconds=4, unloadSeconds=4, batteryWh=3000)
        self.inputs = {"baselineWorkers":1, "baselineTaskSeconds":82,
                       "baselineAnnualCostRub":2400000, "residualHumanCostAnnualRub":450000,
                       "robotUnitPriceRub":1000000, "installationRub":140000,
                       "infrastructureRub":90000, "chargersRub":65000,
                       "annualMaintenanceRub":120000, "electricityRubPerKwh":8,
                       "workdaysPerYear":250, "horizonYears":5, "discountRatePercent":12,
                       "annualRequiredJobs":10000, "marginRubPerAdditionalJob":150}
    def test_report_header_uses_pinned_release_when_version_field_is_missing(self):
        from jaamsim_engine import _validate_report_metadata
        header="Simulation\tSoftwareName\tJaamSim\t-\nSimulation\tConfigurationFile\trun.cfg\t-\n"
        self.assertEqual(_validate_report_metadata(header),"2026-05")

    def test_report_header_accepts_spaces_and_bom_without_weakening_version_check(self):
        from jaamsim_engine import _validate_report_metadata
        header="\ufeffSimulation\tSoftwareName\tJaamSim\t-\nSimulation    SoftwareVersion    2026-05    -\n"
        self.assertEqual(_validate_report_metadata(header),"2026-05")

    def test_report_header_rejects_a_different_declared_jaamsim_version(self):
        from jaamsim_engine import _validate_report_metadata, JaamSimUnavailable
        header="Simulation\tSoftwareName\tJaamSim\t-\nSimulation\tSoftwareVersion\t2025-01\t-\n"
        with self.assertRaisesRegex(JaamSimUnavailable,"2025-01"):
            _validate_report_metadata(header)

    def test_report_header_rejects_an_unidentified_engine(self):
        from jaamsim_engine import _validate_report_metadata, JaamSimUnavailable
        with self.assertRaises(JaamSimUnavailable):
            _validate_report_metadata("Simulation\tSoftwareName\tUnknownEngine\t-\n")

    def test_independent_baseline_and_robot_scenarios_use_real_jaamsim(self):
        from jaamsim_engine import JaamSimUnavailable
        out = self.run_comparison(self.case, self.inputs, [1,2,4])
        self.assertEqual(out["engine"],"JaamSim")
        self.assertEqual(out["engineVersion"],"2026-05")
        self.assertEqual(out["baseline"]["capacity"],1)
        self.assertEqual(out["baseline"]["arrived"],out["options"][0]["arrived"])
        self.assertEqual(len(out["options"]),3)
        self.assertGreater(out["options"][1]["completed"],out["baseline"]["completed"])
        self.assertLessEqual(out["baseline"]["completed"],out["baseline"]["arrived"])
        self.assertEqual(out["baseline"]["backlog"],out["baseline"]["arrived"]-out["baseline"]["completed"])
        self.assertTrue(all(x["engine"]=="JaamSim" for x in out["options"]))
        self.assertGreater(out["options"][1]["capexRub"],out["options"][0]["capexRub"])
        self.assertEqual(out["inputs"]["baselineTaskSeconds"],82)
        self.assertIn("modelLimitations",out)
    def test_same_inputs_are_reproducible(self):
        a=self.run_comparison(self.case,self.inputs,[1,2])
        b=self.run_comparison(copy.deepcopy(self.case),copy.deepcopy(self.inputs),[1,2])
        for side in ("baseline","options"):
            self.assertEqual(a[side],b[side])
    def test_annual_maintenance_scales_with_number_of_robots(self):
        from jaamsim_engine import _investment
        baseline={"completed":12}
        robot={"completed":12}
        small=_investment(baseline,robot,self.case,self.inputs,1,10)
        large=_investment(baseline,robot,self.case,self.inputs,4,10)
        self.assertAlmostEqual(large["annualOpexRub"]-small["annualOpexRub"],
                               self.inputs["annualMaintenanceRub"]*3)
        self.assertEqual(large["annualIncrementalJobs"],0)
    def test_absent_baseline_finances_never_produce_roi(self):
        from jaamsim_engine import _investment
        empty=dict(self.inputs,baselineAnnualCostRub=0)
        investment=_investment({"completed":12},{"completed":20},self.case,empty,2,10)
        self.assertIsNone(investment["roiPercent"])
        self.assertIsNone(investment["npvRub"])
    def test_stochastic_single_run_is_not_a_confirmed_investment_case(self):
        from jaamsim_engine import _investment
        case=copy.deepcopy(self.case);case["mode"]="poisson"
        investment=_investment({"completed":12},{"completed":20},case,self.inputs,2,10)
        self.assertIsNone(investment["roiPercent"])
        self.assertIsNone(investment["npvRub"])
    def test_infeasible_service_level_blocks_investment_verdict(self):
        finance=dict(self.inputs,annualRequiredJobs=100000000)
        with self.assertRaises(ValueError):
            self.run_comparison(self.case,finance,[1,2])
    def test_busy_professional_engine_rejects_without_spawning_java(self):
        import asyncio
        import app
        from fastapi import HTTPException
        payload=app.CompareInput.model_validate({"scenario":self.case,"finance":self.inputs,"robotCounts":[1,2]})
        prev=os.environ.get("SIMULATION_SERVICE_KEY")
        os.environ["SIMULATION_SERVICE_KEY"]="test-key"
        slot=app.jaamsim_slots
        self.assertTrue(slot.acquire(blocking=False))
        try:
            with self.assertRaises(HTTPException) as context:
                asyncio.run(app.compare_jaamsim(payload,"test-key"))
            self.assertEqual(context.exception.status_code,429)
        finally:
            slot.release()
            if prev is None:os.environ.pop("SIMULATION_SERVICE_KEY",None)
            else:os.environ["SIMULATION_SERVICE_KEY"]=prev
    def test_real_simulated_shortfall_blocks_roi_but_other_fleet_can_meet_plan(self):
        case=copy.deepcopy(self.case);case["robot"]["speedMps"]=0.3
        finance=dict(self.inputs,annualRequiredJobs=12000)
        comparison=self.run_comparison(case,finance,[1,4])
        small,large=comparison["options"]
        self.assertEqual(small["arrived"],large["arrived"])
        self.assertLess(small["completed"]*finance["workdaysPerYear"],finance["annualRequiredJobs"])
        self.assertIsNone(small["roiPercent"])
        self.assertIsNone(small["npvRub"])
        self.assertGreaterEqual(large["completed"]*finance["workdaysPerYear"],finance["annualRequiredJobs"])
        self.assertIsNotNone(large["roiPercent"])
    def test_stochastic_baseline_uses_identical_arrivals_and_withholds_roi(self):
        case=copy.deepcopy(self.case);case["mode"]="poisson"
        comparison=self.run_comparison(case,self.inputs,[1])
        self.assertEqual(comparison["baseline"]["arrived"],comparison["options"][0]["arrived"])
        self.assertEqual(comparison["peak"]["baseline"]["arrived"],comparison["peak"]["options"][0]["arrived"])
        self.assertIsNone(comparison["options"][0]["roiPercent"])
        self.assertTrue(any("случайного" in w for w in comparison["options"][0]["warnings"]))
    def test_unavailable_real_engine_fails_closed(self):
        previous=os.environ.get("RIS_JAAMSIM_JAR")
        try:
            os.environ["RIS_JAAMSIM_JAR"]=str(Path(__file__).parent/"missing-JaamSim.jar")
            with self.assertRaises(self.unavailable):
                self.run_comparison(self.case,self.inputs,[1])
        finally:
            if previous is None:os.environ.pop("RIS_JAAMSIM_JAR",None)
            else:os.environ["RIS_JAAMSIM_JAR"]=previous
