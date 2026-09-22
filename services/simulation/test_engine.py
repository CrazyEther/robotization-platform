import copy
import unittest
from engine import run_model,route_length

BASE={"sector":"warehouse","layout":{"width":20,"height":12,"pickup":{"x":1,"y":1},"dropoff":{"x":18,"y":10},"obstacles":[{"x":8,"y":0,"w":2,"h":9}]},
"workload":{"demandPerHour":40,"loadKg":120,"shiftHours":8},
"robot":{"count":2,"payloadKg":250,"speedMps":.8,"loadSeconds":50,"unloadSeconds":50,"batteryWh":1400,"chargeW":900,"whPerMeter":.3,"chargerCount":1},
"mode":"fixed","seed":42}

class TransportTests(unittest.TestCase):
 def test_reproducibility(self):
  a=run_model(copy.deepcopy(BASE));b=run_model(copy.deepcopy(BASE))
  for key in ("completed","created","backlog","distanceMeters","energyKwh","routeMeters","meanQueueMinutes"):
   self.assertEqual(a[key],b[key],key)
  self.assertEqual(a["completed"]+a["backlog"],a["created"])
 def test_additional_robot(self):
  few=copy.deepcopy(BASE);few["robot"]["count"]=1
  many=copy.deepcopy(BASE);many["robot"]["count"]=5
  self.assertGreaterEqual(run_model(many)["completed"],run_model(few)["completed"])
 def test_impassable_route(self):
  bad=copy.deepcopy(BASE);bad["layout"]["obstacles"]=[{"x":9,"y":0,"w":2,"h":12}]
  with self.assertRaisesRegex(ValueError,"маршрута"):route_length(bad["layout"])
 def test_overweight(self):
  bad=copy.deepcopy(BASE);bad["workload"]["loadKg"]=500
  with self.assertRaisesRegex(ValueError,"грузоподъёмность"):run_model(bad)
 def test_infeasible_battery(self):
  bad=copy.deepcopy(BASE);bad["robot"]["batteryWh"]=10
  with self.assertRaisesRegex(ValueError,"заряда"):run_model(bad)

 def test_delivered_before_empty_return_and_partial_energy(self):
  case=copy.deepcopy(BASE)
  case["layout"]={"width":40,"height":10,"pickup":{"x":1,"y":1},"dropoff":{"x":31,"y":1},"obstacles":[]}
  case["workload"]={"demandPerHour":1,"loadKg":20,"shiftHours":.25}
  case["robot"].update(count=1,speedMps=.05,loadSeconds=0,unloadSeconds=0,batteryWh=1000,whPerMeter=1)
  result=run_model(case)
  self.assertEqual(result["created"],1)
  self.assertEqual(result["completed"],1)
  self.assertAlmostEqual(result["distanceMeters"],45)
  self.assertAlmostEqual(result["loadedMeters"],30)
  self.assertAlmostEqual(result["emptyMeters"],15)
  self.assertAlmostEqual(result["energyKwh"],.045)
  self.assertAlmostEqual(result["meanJobSeconds"],600)
  self.assertAlmostEqual(result["p95JobSeconds"],600)

 def test_queue_wait_includes_robot_charging_before_task_service(self):
  case=copy.deepcopy(BASE)
  case["layout"]={"width":8,"height":8,"pickup":{"x":1,"y":1},"dropoff":{"x":2,"y":1},"obstacles":[]}
  case["workload"]={"demandPerHour":8,"loadKg":1,"shiftHours":.25}
  case["robot"].update(count=1,payloadKg=5,speedMps=1,loadSeconds=0,unloadSeconds=0,batteryWh=10,chargeW=240,whPerMeter=4,chargerCount=1)
  measured=run_model(case)
  self.assertEqual(measured["created"],2)
  self.assertEqual(measured["completed"],2)
  self.assertAlmostEqual(measured["meanQueueMinutes"],1,places=6)
  no_charging=copy.deepcopy(case)
  no_charging["robot"]["batteryWh"]=1000
  self.assertAlmostEqual(run_model(no_charging)["meanQueueMinutes"],0,places=6)

 def test_fixed_arrivals_match_requested_shift_volume(self):
  case=copy.deepcopy(BASE)
  case["workload"]["demandPerHour"]=500
  case["workload"]["shiftHours"]=24
  self.assertEqual(run_model(case)["created"],12000)

 def test_engine_revision_and_health_consistency(self):
  import asyncio
  from app import health
  from engine import ENGINE_VERSION
  self.assertEqual(asyncio.run(health())["version"],ENGINE_VERSION)
  self.assertEqual(ENGINE_VERSION,"simpy-transport/0.5")

 def test_experiment_summary_contract(self):
  import engine
  runner=getattr(engine,"run_experiment",None)
  self.assertIsNotNone(runner,"run_experiment must exist for replicated experiments")
  case=copy.deepcopy(BASE)
  case["mode"]="fixed"
  experiment=runner(case,5)
  self.assertEqual(experiment["replications"],5)
  self.assertEqual(experiment["engineVersion"],engine.ENGINE_VERSION)
  completed=experiment["metrics"]["completed"]
  self.assertEqual(completed["mean"],completed["low95"])
  self.assertEqual(completed["mean"],completed["high95"])
  self.assertIn("created",experiment["metrics"])
  self.assertIn("loadedMeters",experiment["metrics"])
  self.assertIn("emptyMeters",experiment["metrics"])
  self.assertIn("distanceMeters",experiment["metrics"])
  self.assertEqual(experiment["metrics"]["loadedMeters"]["mean"],experiment["runs"][0]["loadedMeters"])
  self.assertEqual(len(experiment["seeds"]),5)

 def test_poisson_experiment_is_reproducible_and_reports_uncertainty(self):
  import engine
  runner=getattr(engine,"run_experiment",None)
  self.assertIsNotNone(runner,"run_experiment must exist for replicated experiments")
  case=copy.deepcopy(BASE)
  case["mode"]="poisson"
  first=runner(case,12);second=runner(copy.deepcopy(case),12)
  self.assertEqual(first["seeds"],second["seeds"])
  self.assertEqual(first["metrics"],second["metrics"])
  throughput=first["metrics"]["throughputPerHour"]
  self.assertLessEqual(throughput["low95"],throughput["mean"])
  self.assertGreaterEqual(throughput["high95"],throughput["mean"])
  self.assertGreaterEqual(throughput["stddev"],0)
  self.assertEqual(first["replications"],12)

 def test_replicated_output_covers_all_visible_kpis(self):
  from engine import run_experiment
  run=run_experiment(copy.deepcopy(BASE),3)
  for key in ("completed","backlog","throughputPerHour","robotUtilization","chargerUtilization","energyKwh","p95JobSeconds","loadedMeters","emptyMeters"):
   self.assertIn(key,run["metrics"],f"UI depends on metric {key}")
   self.assertEqual(run["metrics"][key]["samples"],3)
   self.assertAlmostEqual(run["metrics"][key]["mean"],sum(r[key] for r in run["runs"])/3)

if __name__=="__main__":unittest.main()
