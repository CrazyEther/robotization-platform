"""Transport-task discrete event model. SimPy drives resources, queues and charging; not a physics simulator."""
import hashlib
import heapq
import json
import math
import random
import time
import simpy

ENGINE_VERSION = "simpy-transport/0.3"

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
    rng=random.Random(request["seed"]); result={"created":0,"completed":0,"distanceMeters":0.0,"loadedMeters":0.0,"emptyMeters":0.0,"energyKwh":0.0,"chargingHours":0.0}
    queue_times=[]; lead_times=[]; busy_seconds=[0.0]*robot["count"]; battery=[robot["batteryWh"]]*robot["count"]
    active=[None]*robot["count"]; active_charge=[None]*robot["count"]; traveling=[None]*robot["count"]
    interval=3600/workload["demandPerHour"]
    def generate():
        if request["mode"]=="fixed":
            for index in range(math.ceil(workload["demandPerHour"]*hours)):
                arrival=index*interval
                if arrival>=horizon:break
                if index:yield env.timeout(max(0,arrival-env.now))
                yield tasks.put(env.now);result["created"]+=1
        else:
            while env.now<horizon:
                yield tasks.put(env.now);result["created"]+=1
                yield env.timeout(rng.expovariate(1/interval))
    def drive(number,kind):
        start=env.now
        traveling[number]=(kind,start)
        yield env.timeout(distance/robot["speedMps"])
        traveling[number]=None
        result["distanceMeters"]+=distance
        result[kind+"Meters"]+=distance
        energy_wh=distance*robot["whPerMeter"]
        result["energyKwh"]+=energy_wh/1000
        battery[number]-=energy_wh

    def worker(number):
        while True:
            created=yield tasks.get()
            start=env.now;queue_times.append(start-created)
            if battery[number] < consumption:
                with chargers.request() as ticket:
                    yield ticket
                    delta=robot["batteryWh"]-battery[number]
                    charge_sec=delta/robot["chargeW"]*3600
                    active_charge[number]=env.now
                    yield env.timeout(charge_sec)
                    result["chargingHours"]+=charge_sec/3600
                    active_charge[number]=None
                    battery[number]=robot["batteryWh"]
            busy_begin=env.now;active[number]=busy_begin
            yield env.timeout(robot["loadSeconds"])
            yield from drive(number,"loaded")
            yield env.timeout(robot["unloadSeconds"])
            result["completed"]+=1
            lead_times.append(env.now-created)
            yield from drive(number,"empty")
            busy_seconds[number]+=env.now-busy_begin
            active[number]=None
    env.process(generate())
    for number in range(robot["count"]):env.process(worker(number))
    env.run(until=horizon)
    for number,start in enumerate(active):
        if start is not None:busy_seconds[number]+=max(0,horizon-start)
    for number,motion in enumerate(traveling):
        if motion is not None:
            kind,start=motion
            traversed=min(distance,max(0,horizon-start)*robot["speedMps"])
            result["distanceMeters"]+=traversed
            result[kind+"Meters"]+=traversed
            result["energyKwh"]+=traversed*robot["whPerMeter"]/1000
    for start in active_charge:
        if start is not None:result["chargingHours"]+=max(0,horizon-start)/3600
    completed=result["completed"]
    ordered=sorted(lead_times)
    mean_job=sum(ordered)/len(ordered) if ordered else None
    p95_job=ordered[math.ceil(.95*len(ordered))-1] if ordered else None
    return {"status":"complete","engine":"SimPy","engineVersion":ENGINE_VERSION,"routeMeters":distance,
       **result,"backlog":result["created"]-completed,"throughputPerHour":completed/hours,
       "meanQueueMinutes":sum(queue_times)/len(queue_times)/60 if queue_times else 0,
       "meanJobSeconds":mean_job,"p95JobSeconds":p95_job,
       "chargerUtilization":result["chargingHours"]/(hours*robot["chargerCount"]),
       "robotUtilization":sum(busy_seconds)/(horizon*robot["count"]),
       "warnings":["Дискретно-событийная транспортная модель: динамические столкновения, лифты, двери, безопасность и кинематика не моделируются."],
       "inputHash":hashlib.sha256(json.dumps(request,sort_keys=True).encode()).hexdigest(),
       "wallTimeMs":round((time.perf_counter()-begin)*1000,2)}
