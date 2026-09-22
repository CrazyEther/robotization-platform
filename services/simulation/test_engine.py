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
  self.assertEqual(ENGINE_VERSION,"simpy-transport/0.3")

if __name__=="__main__":unittest.main()
