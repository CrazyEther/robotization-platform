"""Compute service. Run separately from Cloudflare Workers."""
import os
from fastapi import FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from engine import ENGINE_VERSION, run_experiment, run_model

app=FastAPI(title="RIS simulation service",docs_url=None,redoc_url=None)
class Point(BaseModel):
    x:int=Field(ge=0,le=300)
    y:int=Field(ge=0,le=300)
class Rect(Point):
    w:int=Field(ge=1,le=300)
    h:int=Field(ge=1,le=300)
class Layout(BaseModel):
    width:int=Field(ge=8,le=300)
    height:int=Field(ge=8,le=300)
    pickup:Point
    dropoff:Point
    obstacles:list[Rect]=Field(max_length=30)
class Workload(BaseModel):
    demandPerHour:float=Field(gt=0,le=10000)
    loadKg:float=Field(gt=0,le=20000)
    shiftHours:float=Field(ge=.25,le=24)
class Robot(BaseModel):
    count:int=Field(ge=1,le=100)
    payloadKg:float=Field(gt=0,le=20000)
    speedMps:float=Field(ge=.05,le=10)
    loadSeconds:float=Field(ge=0,le=3600)
    unloadSeconds:float=Field(ge=0,le=3600)
    batteryWh:float=Field(ge=10,le=200000)
    chargeW:float=Field(ge=1,le=100000)
    whPerMeter:float=Field(ge=.01,le=500)
    chargerCount:int=Field(ge=1,le=100)
class SimulationInput(BaseModel):
    sector:str=Field(pattern="^(warehouse|factory|hospital|airport)$")
    layout:Layout
    workload:Workload
    robot:Robot
    mode:str=Field(default="fixed",pattern="^(fixed|poisson)$")
    seed:int=Field(default=42,ge=1,le=2147483647)

class ExperimentInput(BaseModel):
    scenario:SimulationInput
    replications:int=Field(ge=1,le=100)

@app.get("/health")
async def health():
    return {"status":"ok","engine":"SimPy","version":ENGINE_VERSION}

@app.post("/simulations")
async def simulate(body:SimulationInput,x_simulation_key:str|None=Header(default=None)):
    expected=os.environ.get("SIMULATION_SERVICE_KEY")
    if not expected or x_simulation_key!=expected:
        raise HTTPException(status_code=403,detail="Неавторизованный вызов вычислительного сервиса.")
    try:
        return await run_in_threadpool(run_model,body.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=422,detail=str(err)) from err

@app.post("/experiments")
async def experiment(body:ExperimentInput,x_simulation_key:str|None=Header(default=None)):
    expected=os.environ.get("SIMULATION_SERVICE_KEY")
    if not expected or x_simulation_key!=expected:
        raise HTTPException(status_code=403,detail="Неавторизованный вызов вычислительного сервиса.")
    try:
        return await run_in_threadpool(run_experiment,body.scenario.model_dump(),body.replications)
    except ValueError as err:
        raise HTTPException(status_code=422,detail=str(err)) from err
