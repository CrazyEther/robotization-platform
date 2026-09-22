"""Transport-task discrete event model. SimPy drives resources, queues and charging; not a physics simulator."""
import hashlib
import heapq
import json
import math
import random
import time
import simpy

ENGINE_VERSION = "simpy-transport/0.2"

def route_length(layout):
    width, height = layout["width"], layout["height"]
    a, b = layout["pickup"], layout["dropoff"]
    def blocked(x,y):
        return any(r["x"] <= x < r["x"]+r["w"] and r["y"] <= y < r["y"]+r["h"] for r in layout["obstacles"])
    for p in (a,b):
        if p["x"] >= width or p["y"] >= height or blocked(p["x"],p["y"]):
            raise ValueError("Начальная или конечная точка недоступна.")
    origin=(a["x"],a["y"]); target=(b["x"],b["y"]); queue=[(0,0,origin)]
    dist={origin:0}
    while queue:
        _, cost, node=heapq.heappop(queue)
        if node==target:return cost
        if cost!=dist[node]:continue
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            x,y=node[0]+dx,node[1]+dy
            if not (0<=x<width and 0<=y<height) or blocked(x,y):continue
            nxt=(x,y); new=cost+1
            if new<dist.get(nxt,math.inf):
                dist[nxt]=new;heapq.heappush(queue,(new+abs(target[0]-x)+abs(target[1]-y),new,nxt))
    raise ValueError("Между станциями нет проходимого маршрута.")

def run_model(request):
    begin=time.perf_counter()
    robot=request["robot"]; workload=request["workload"]; hours=workload["shiftHours"]; horizon=hours*3600
    if workload["loadKg"]>robot["payloadKg"]:raise ValueError("Масса груза превышает грузоподъёмность робота.")
    if workload["demandPerHour"]*hours>15000:raise ValueError("Слишком много заявок для одного вычислительного эксперимента.")
    distance=route_length(request["layout"]); round_trip=2*distance
    consumption=round_trip*robot["whPerMeter"]
    if consumption>=robot["batteryWh"]:raise ValueError("Одного заряда недостаточно для полного транспортного задания.")
    env=simpy.Environment(); tasks=simpy.Store(env); chargers=simpy.Resource(env,capacity=robot["chargerCount"])
    rng=random.Random(request["seed"]); result={"created":0,"completed":0,"distanceMeters":0.0,"energyKwh":0.0,"chargingHours":0.0}
    queue_times=[]; busy_seconds=[0.0]*robot["count"]; battery=[robot["batteryWh"]]*robot["count"]; active=[None]*robot["count"]
    interval=3600/workload["demandPerHour"]
    def generate():
        while env.now<horizon:
            yield tasks.put(env.now); result["created"]+=1
            delay=rng.expovariate(1/interval) if request["mode"]=="poisson" else interval
            yield env.timeout(delay)
    def worker(number):
        while True:
            created=yield tasks.get()
            start=env.now;queue_times.append(start-created)
            if battery[number] < consumption:
                with chargers.request() as ticket:
                    yield ticket
                    delta=robot["batteryWh"]-battery[number]
                    charge_sec=delta/robot["chargeW"]*3600
                    yield env.timeout(charge_sec)
                    result["chargingHours"]+=charge_sec/3600
                    battery[number]=robot["batteryWh"]
            duration=round_trip/robot["speedMps"]+robot["loadSeconds"]+robot["unloadSeconds"]
            busy_begin=env.now;active[number]=busy_begin
            yield env.timeout(duration)
            busy_seconds[number]+=min(horizon,busy_begin+duration)-busy_begin if busy_begin<horizon else 0
            active[number]=None
            if env.now<=horizon:
                result["completed"]+=1;result["distanceMeters"]+=round_trip
                result["energyKwh"]+=consumption/1000
            battery[number]-=consumption
    env.process(generate())
    for number in range(robot["count"]):env.process(worker(number))
    env.run(until=horizon)
    for number,start in enumerate(active):
        if start is not None:busy_seconds[number]+=max(0,horizon-start)
    completed=result["completed"]
    return {"status":"complete","engine":"SimPy","engineVersion":ENGINE_VERSION,"routeMeters":distance,
       **result,"backlog":result["created"]-completed,"throughputPerHour":completed/hours,
       "meanQueueMinutes":sum(queue_times)/len(queue_times)/60 if queue_times else 0,
       "robotUtilization":sum(busy_seconds)/(horizon*robot["count"]),
       "warnings":["Дискретно-событийная транспортная модель: динамические столкновения, лифты, двери, безопасность и кинематика не моделируются."],
       "inputHash":hashlib.sha256(json.dumps(request,sort_keys=True).encode()).hexdigest(),
       "wallTimeMs":round((time.perf_counter()-begin)*1000,2)}
