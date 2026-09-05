"""Retrieve primary sources without treating retrieval as licensing or validation.

Input: data/source-plan.json; output: immutable data/raw, a public manifest,
and factual catalog records. Full bodies MUST remain ignored by version control.
Run: python scripts/collect-sources.py [--refresh] [--validate-only]
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FAMILIES = set("cleaning inventory transport storage assisted-picking unloading picking sortation conveyor packaging workcell inspection hospital baggage wms digital".split())


def require(condition: object, message: str = "Catalog contract violation") -> None:
    """Boundary validation remains active when Python runs with optimization."""
    if not condition:
        raise AssertionError(message)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def fetch(source: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    result = {"id": source["id"], "observedAt": now, "retrievalStatus": "unavailable", "rawLocator": None, "sha256": None}
    try:
        request = Request(source["url"], headers={"User-Agent": "RobotizationEvidenceCollector/1.0 (public primary source research)", "Accept": "text/html,application/pdf,text/plain"})
        with urlopen(request, timeout=22) as response:
            content = response.read(18_000_001)
            if len(content) > 18_000_000:
                raise ValueError("Source exceeds bounded 18 MB retrieval limit")
            mime = response.headers.get_content_type()
            final_url = response.geturl()
        if not content or (mime not in {"application/pdf", "text/html", "text/plain", "application/xhtml+xml"}):
            raise ValueError("Empty or unsupported source content")
        # Detect common successful-HTTP bot challenges; no attempt to bypass them.
        body_start = content[:8000].decode("utf-8", errors="ignore").lower()
        if mime != "application/pdf" and any(token in body_start for token in ["<title>just a moment", "<title>access denied", "<title>attention required"]):
            raise ValueError("Access challenge returned instead of primary content")
        digest = hashlib.sha256(content).hexdigest()
        extension = ".pdf" if mime == "application/pdf" else ".html"
        relative = Path("data/raw") / source["id"] / (digest + extension)
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError("Immutable artifact integrity failure")
        else:
            with target.open("xb") as stream:
                stream.write(content)
        result.update(retrievalStatus="retrieved", rawLocator=relative.as_posix(), sha256=digest,
                      bytes=len(content), contentType=mime, finalUrl=final_url)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def validate(catalog: dict, manifest: dict, require_raw: bool = False) -> dict:
    sources = {source["id"]: source for source in catalog["sources"]}
    require(len(sources) == len(catalog["sources"]), "Duplicate source IDs")
    products = catalog["products"]
    require(len(products) == 44, f"Expected 44 candidates, received {len(products)}")
    require(len({p["id"] for p in products}) == 44, "Duplicate products")
    require({p["familyId"] for p in products} == FAMILIES, "Family coverage mismatch")
    artifact_index = {artifact["id"]: artifact for artifact in manifest["artifacts"]}
    require(artifact_index.keys() == sources.keys(), "Manifest/source mismatch")
    for product in products:
        require(product["sourceIds"] and set(product["sourceIds"]) <= sources.keys(), product["id"])
        require(not any(product["readiness"][key] for key in ["economics", "simulation", "procurement"]))
        for claim in product["characteristics"]:
            require(claim["sourceId"] in product["sourceIds"])
            require(claim["status"] in ["vendor_claim", "operator_reported", "verified_primary"])
        if product["readiness"]["comparison"]:
            require(any(isinstance(c["value"], (int, float)) and sources[c["sourceId"]]["retrievalStatus"] == "retrieved" for c in product["characteristics"]))
            require(any(other["id"] != product["id"] and other["familyId"] == product["familyId"]
                       and any(isinstance(c["value"], (int, float)) and c["key"] == peer["key"] and c["unit"] == peer["unit"]
                               for c in product["characteristics"] for peer in other["characteristics"])
                       for other in products), "No shared numeric characteristic within family")
    for case in catalog["cases"]:
        require(set(case["sourceIds"]) <= sources.keys())
        require(set(case["familyIds"]) <= FAMILIES)
    checked = 0
    for source in sources.values():
        require(source["url"].startswith("https://"), "Non-HTTPS primary source")
        artifact = artifact_index[source["id"]]
        for field in ["sha256", "rawLocator", "observedAt", "retrievalStatus"]:
            require(source[field] == artifact[field], f"Manifest drift: {source['id']} {field}")
        if source["retrievalStatus"] == "retrieved":
            require(re.fullmatch("[0-9a-f]{64}", source["sha256"] or ""))
            path = ROOT / source["rawLocator"]
            require(path.resolve().is_relative_to((DATA / "raw").resolve()), "Raw locator leaves raw directory")
            if path.exists():
                require(hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"])
                checked += 1
            elif require_raw:
                raise AssertionError(f"Missing local source: {path}")
        else:
            require(source["sha256"] is None and source["rawLocator"] is None, "Unavailable source must not claim raw evidence")
    return {"products": len(products), "families": len(FAMILIES), "cases": len(catalog["cases"]), "sources": len(sources), "rawChecksumsVerified": checked,
            "retrieved": sum(s["retrievalStatus"] == "retrieved" for s in sources.values()), "unavailable": sum(s["retrievalStatus"] == "unavailable" for s in sources.values())}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--require-raw", action="store_true")
    parser.add_argument("--source-id", action="append", help="Only retrieve the specified ID(s); reuse all other manifest entries")
    args = parser.parse_args()
    catalog_path, manifest_path = DATA / "catalog.json", DATA / "source-manifest.json"
    if args.validate_only:
        print(json.dumps(validate(json.loads(catalog_path.read_text(encoding="utf-8")), json.loads(manifest_path.read_text(encoding="utf-8")), args.require_raw), ensure_ascii=False))
        return
    plan = json.loads((DATA / "source-plan.json").read_text(encoding="utf-8"))
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"artifacts": []}
    prior = {s["id"]: s for s in previous["artifacts"]}
    artifacts = []
    pending = []
    for source in plan["sources"]:
        old = prior.get(source["id"])
        if args.source_id and source["id"] not in args.source_id and old:
            artifacts.append(old)
        elif not args.refresh and old and old.get("retrievalStatus") == "retrieved" and old.get("requestedUrl") == source["url"] and (ROOT / old["rawLocator"]).exists():
            artifacts.append(old)
        else:
            pending.append(source)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        tasks = {pool.submit(fetch, source): source for source in pending}
        for task in concurrent.futures.as_completed(tasks):
            artifact = task.result()
            artifact["requestedUrl"] = tasks[task]["url"]
            artifacts.append(artifact)
            print(artifact["id"], artifact["retrievalStatus"], flush=True)
    artifacts.sort(key=lambda value: value["id"])
    manifest = {"schemaVersion": "1.0.0", "mappingVersion": "primary-reference-v1", "artifacts": artifacts,
                "rightsNotice": "Full raw bodies are local review evidence, excluded from publication. Reference-only records do not grant redistribution rights."}
    artifact_index = {value["id"]: value for value in artifacts}
    sources = []
    for source in plan["sources"]:
        artifact = artifact_index[source["id"]]
        sources.append({key: source[key] for key in ["id", "title", "url", "publisher", "publishedAt", "terms"]} | {key: artifact[key] for key in ["observedAt", "retrievalStatus", "rawLocator", "sha256"]})
    products = plan["products"]
    for product in products:
        if product["readiness"]["comparison"] and not all(artifact_index[c["sourceId"]]["retrievalStatus"] == "retrieved" for c in product["characteristics"]):
            product["readiness"]["comparison"] = False
        if not any(artifact_index[s]["retrievalStatus"] == "retrieved" for s in product["sourceIds"]):
            product["limitations"].append("Автоматическое сохранение источника недоступно; сведения требуют повторной проверки первичной страницы.")
    catalog = {"sources": sources, "products": products, "cases": plan["cases"]}
    extracts = []
    for source in plan["sources"]:
        evidence = source.get("evidence", {})
        quote = evidence.get("verbatim", "")
        if len(quote.split()) >= 25:
            raise ValueError(f"Quotation exceeds short-extract policy: {source['id']}")
        extracts.append({"sourceId": source["id"], "url": source["url"],
                         "snapshotSha256": artifact_index[source["id"]]["sha256"],
                         "locator": evidence.get("locator", "Primary page title and product description"),
                         "shortQuote": quote, "factualNote": evidence.get("note", source["title"]),
                         "numericMapping": [{"productId": p["id"], "characteristicKey": c["key"],
                                              "originalValue": c["value"], "originalUnit": c["unit"],
                                              "normalizedValue": c["value"], "normalizedUnit": c["unit"],
                                              "mappingRule": "identity", "conditions": c["conditions"]}
                                             for p in products for c in p["characteristics"] if c["sourceId"] == source["id"]]})
    try:
        result = validate(catalog, manifest, True)
    except AssertionError as error:
        print(f"VALIDATION FAILED: {error}", file=sys.stderr)
        sys.exit(1)
    # Validate the complete staged catalog before replacing its public snapshot.
    # The application consumes catalog.json as one atomic publication unit.
    write_json(manifest_path, manifest)
    write_json(DATA / "evidence-extracts.json", {"mappingVersion": "primary-reference-v1", "extracts": extracts})
    write_json(catalog_path, catalog)
    write_json(DATA / "validation-result.json", {"checkedAt": datetime.now(timezone.utc).isoformat(), **result})
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
