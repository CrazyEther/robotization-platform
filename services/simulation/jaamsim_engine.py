"""Genuine JaamSim process-flow experiments; NOT a Gazebo physical/dynamic robot simulation."""
from __future__ import annotations
import hashlib
import math
import os
import re
import subprocess
import tempfile
from pathlib import Path
from engine import route_length

RELEASE="2026-05"
SHA256="be8229bbe0a545e1e4a10338aa66dfd3c9e23d933c6f65bc3baa904d6f8fceb9"
DEFAULT_JAR=(Path(__file__).resolve().parent/".."/".."/"vendor"/"jaamsim"/"JaamSim2026-05.jar").resolve()
class JaamSimUnavailable(RuntimeError):
    pass
def installed_jar():
    path=Path(os.getenv("RIS_JAAMSIM_JAR") or DEFAULT_JAR)
    if not path.is_file():raise JaamSimUnavailable("JaamSim JAR не установлен; результаты не подменяются другим движком.")
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if actual!=SHA256:raise JaamSimUnavailable("Контрольная сумма JaamSim не совпадает с проверенной версией.")
    return path
def _num(value):
    number=float(value)
    if not math.isfinite(number) or number<0:raise ValueError("Числовые параметры должны быть конечными и неотрицательными.")
    return number
def _cfg(demand_hour,shift_hours,service_seconds,capacity,seed,mode):
    count=math.ceil(demand_hour*shift_hours)
    if count<1 or count>15000:raise ValueError("Сценарий превышает лимит заявок для одного эксперимента.")
    dt=3600/demand_hour
    if not math.isfinite(dt) or dt<=0 or service_seconds<.001:raise ValueError("Некорректное время межприбытия или обслуживания.")
    lines=["RecordEdits","Define EntityGenerator { Generator }","Define Queue { WaitQueue }",
      "Define Seize { StartTransport }","Define Resource { Fleet }","Define EntityDelay { Transport }",
      "Define Release { EndTransport }","Define EntitySink { Sink }","Define SimEntity { Task }"]
    if mode=="poisson":
        lines+=["Define ExponentialDistribution { Arrival }",
                "Arrival UnitType { TimeUnit }","Arrival Mean { %.12g s }"%dt,
                "Arrival RandomSeed { 1 }","Generator InterArrivalTime { Arrival }"]
    else:lines+=["Generator InterArrivalTime { %.12g s }"%dt]
    lines+=["Generator NextComponent { StartTransport }","Generator PrototypeEntity { Task }",
        "Generator MaxNumber { %d }"%count,"StartTransport WaitQueue { WaitQueue }",
        "StartTransport ResourceList { Fleet }","StartTransport NextComponent { Transport }",
        "Fleet Capacity { %d }"%capacity,"Transport Duration { %.12g s }"%service_seconds,
        "Transport NextComponent { EndTransport }","EndTransport ResourceList { Fleet }",
        "EndTransport NextComponent { Sink }","Simulation RunDuration { %.12g s }"%(shift_hours*3600),
        "Simulation InitializationDuration { 0 s }","Simulation GlobalSubstreamSeed { %d }"%seed,
        "Simulation RealTime { FALSE }","Simulation PrintReport { TRUE }",
        "Simulation RunOutputList { { [Sink].NumberAdded } { [Generator].NumberGenerated } }"]
    return "\n".join(lines)+"\n"
def _report_number(report,entity,output):
    match=re.search(r"^"+re.escape(entity)+r"\t"+re.escape(output)+r"\t([^\t\r\n]+)",report,re.M)
    if not match:raise RuntimeError("JaamSim не вернул обязательную метрику "+entity+"."+output)
    return float(match.group(1))


def run_one(jar,case,capacity,service_seconds,seed=42):
    demand_hour=case["demandPerHour"];shift_hours=case["shiftHours"]
    cfg=_cfg(demand_hour,shift_hours,service_seconds,capacity,seed,case["mode"])
    with tempfile.TemporaryDirectory(prefix="ris-jaamsim-") as tmp:
        path=Path(tmp)/"run.cfg"
        path.write_text(cfg,encoding="utf-8")
        try:
            result=subprocess.run(["java","-Xmx512m","-jar",str(jar),str(path),"-h"],
                cwd=tmp,capture_output=True,text=True,timeout=22,check=False)
        except (FileNotFoundError,subprocess.TimeoutExpired) as exc:
            raise JaamSimUnavailable("Не удалось выполнить Java JaamSim: "+str(exc)) from exc
        report=path.with_suffix(".rep")
        if result.returncode!=0 or not report.exists():
            raise JaamSimUnavailable("JaamSim завершился без отчёта: "+(result.stderr or result.stdout)[-500:])
        text=report.read_bytes().decode("latin-1")  # JaamSim system-locale report; metric keys/values are ASCII.
        if "Simulation\tSoftwareVersion\t"+RELEASE not in text:
            raise JaamSimUnavailable("Получен отчёт неподдерживаемой версии JaamSim.")
        created=int(_report_number(text,"Generator","NumberAdded"))
        completed=int(_report_number(text,"Sink","NumberAdded"))
        waiting=_report_number(text,"WaitQueue","AverageQueueTime")*60
        occupancy=_report_number(text,"Fleet","UnitsInUseAverage")
        return {"engine":"JaamSim","engineVersion":RELEASE,"modelHash":hashlib.sha256(cfg.encode()).hexdigest(),
                "arrived":created,"completed":completed,"backlog":created-completed,
                "queueMeanMinutes":waiting,"utilization":occupancy/capacity,
                "capacity":capacity,"serviceSeconds":service_seconds,
                "completedPerHour":completed/shift_hours}
def _investment(baseline,robot,scenario,finance,unit_count,route):
    days=int(finance["workdaysPerYear"]);horizon=int(finance["horizonYears"])
    required=_num(finance["annualRequiredJobs"])
    baseline_cost=_num(finance["baselineAnnualCostRub"])
    residual=_num(finance["residualHumanCostAnnualRub"])
    price=_num(finance["robotUnitPriceRub"])
    capex=price*unit_count+_num(finance["installationRub"])+_num(finance["infrastructureRub"])+_num(finance["chargersRub"])
    annual_energy_kwh=robot["completed"]*days*2*route*scenario["robot"]["whPerMeter"]/1000
    electricity=annual_energy_kwh*_num(finance["electricityRubPerKwh"])
    opex=_num(finance["annualMaintenanceRub"])*unit_count+electricity+residual
    incremental_jobs=(robot["completed"]-baseline["completed"])*days
    additional_contribution=incremental_jobs*_num(finance["marginRubPerAdditionalJob"])
    annual_benefit=baseline_cost-opex+additional_contribution
    rate=_num(finance["discountRatePercent"])/100
    if rate>1:raise ValueError("Ставка дисконтирования выше 100%.")
    baseline_tco=baseline_cost*horizon
    robot_tco=capex+opex*horizon
    feasible=robot["completed"]*days>=required and baseline_cost>0 and baseline_cost>=residual and price>0 and capex>0 and scenario["mode"]=="fixed"
    roi=(annual_benefit*horizon-capex)/capex*100 if feasible else None
    npv=-capex+sum(annual_benefit/(1+rate)**t for t in range(1,horizon+1)) if feasible else None
    return {"capexRub":capex,"annualOpexRub":opex,"annualBaselineCostRub":baseline_cost,
        "baselineTcoRub":baseline_tco,"robotTcoRub":robot_tco,
        "annualEnergyKwhEstimated":annual_energy_kwh,"annualIncrementalJobs":incremental_jobs,
        "annualAdditionalContributionRub":additional_contribution,
        "annualNetBenefitRub":annual_benefit,"roiPercent":roi,"npvRub":npv,
        "paybackYears":capex/annual_benefit if feasible and annual_benefit>0 else None,
        "meetsDemand":robot["completed"]*days>=required,
        "warnings":["Энергия является оценкой по выполненным заданиям и удельному расходу; JaamSim не рассчитывает физическую траекторию, зарядку и потери энергии.",
           *([] if scenario["mode"]=="fixed" else ["Для случайного входного потока один прогон недостаточен для инвестиционного вывода; ROI/NPV скрыты до серии независимых репликаций."]),
           *([] if baseline_cost>0 and price>0 else ["Для ROI необходимы подтверждённые годовые расходы текущего процесса и цена приобретаемого робота."])]}


def run_comparison(scenario,finance,robot_counts):
    """Compare resource-constrained existing and robotic processes in the same JaamSim model type."""
    jar=installed_jar()
    if not isinstance(robot_counts,list) or not 1<=len(robot_counts)<=4:
        raise ValueError("Для сравнения необходимо от одного до четырёх вариантов парка.")
    if any(type(n)!=int or n<1 or n>30 for n in robot_counts) or len(set(robot_counts))!=len(robot_counts):
        raise ValueError("Каждый размер парка должен быть уникальным целым числом от 1 до 30.")
    if scenario["workload"]["loadKg"]>scenario["robot"]["payloadKg"]:
        raise ValueError("Груз превышает грузоподъёмность выбранного робота.")
    baseline_workers=int(finance["baselineWorkers"])
    if baseline_workers<1 or baseline_workers>100:raise ValueError("Число текущих сотрудников должно быть от 1 до 100.")
    baseline_task=_num(finance["baselineTaskSeconds"])
    if baseline_task<=0:raise ValueError("Время выполнения задания существующим процессом должно быть положительным.")
    route=route_length(scenario["layout"])
    robot= scenario["robot"]
    robot_task=2*route/robot["speedMps"]+robot["loadSeconds"]+robot["unloadSeconds"]
    if not math.isfinite(robot_task) or robot_task<=0:raise ValueError("Недопустимое время работы робота.")
    hours=scenario["workload"]["shiftHours"]
    demand=scenario["workload"]["demandPerHour"]
    days=_num(finance["workdaysPerYear"]);horizon=_num(finance["horizonYears"])
    if not (1<=days<=366 and days.is_integer() and 1<=horizon<=30 and horizon.is_integer()):
        raise ValueError("Число смен и горизонт инвестиций должны быть целыми в допустимых границах.")
    if _num(finance["annualRequiredJobs"])>demand*hours*days+1e-7:
        raise ValueError("Годовой план не может превышать заданное число поступающих заявок.")
    if demand*hours>3000 or demand*hours*1.25>3000:
        raise ValueError("Слишком много заявок для интерактивного эксперимента JaamSim.")
    basic={"shiftHours":hours,"mode":scenario["mode"],"demandPerHour":demand}
    seed=scenario["seed"]
    baseline=run_one(jar,basic,baseline_workers,baseline_task,seed)
    options=[]
    for count in robot_counts:
        measured=run_one(jar,basic,count,robot_task,seed)
        if measured["arrived"]!=baseline["arrived"]:
            raise RuntimeError("Различаются входные потоки базового и роботизированного сценариев.")
        options.append({**measured,**_investment(baseline,measured,scenario,finance,count,route),"robotCount":count})
    peak={**basic,"demandPerHour":demand*1.25}
    peak_base=run_one(jar,peak,baseline_workers,baseline_task,seed)
    peak_options=[]
    for count in robot_counts:
        result=run_one(jar,peak,count,robot_task,seed)
        if result["arrived"]!=peak_base["arrived"]:raise RuntimeError("Несопоставимые входные потоки в пиковом сценарии.")
        peak_options.append({**result,**_investment(peak_base,result,scenario,finance,count,route),"robotCount":count})
    limitations=[
        "JaamSim выполняет реальную дискретно-событийную модель потока, очереди и занятой мощности; геометрия, скорость и времена операций преобразованы в скалярное время обслуживания.",
        "Пиковый сценарий задаёт 125% исходного потока, а не прогноз фактической сезонности.",
        "Нет физической кинематики, препятствий во время движения, перегонов на зарядку, деградации батареи, лифтов или взаимодействия с людьми.",
        "Показатели энергозатрат являются оценкой; физически их в JaamSim не моделировали.",
        "Денежные суммы являются пользовательскими предположениями, а не проверенным коммерческим предложением."]
    return {"engine":"JaamSim","engineVersion":RELEASE,"simulationClass":"DES_PROCESS_FLOW",
        "routeMeters":route,"robotTaskSeconds":robot_task,"baseline":baseline,"options":options,
        "peak":{"demandMultiplier":1.25,"baseline":peak_base,"options":peak_options},
        "inputs":finance,"modelLimitations":limitations,
        "provenance":{"software":"JaamSim","release":RELEASE,"sha256":SHA256,"reproducibleSeed":seed}}
