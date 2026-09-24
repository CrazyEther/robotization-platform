"""Print safe JaamSim report metadata for diagnosing JVM/report-format mismatches.

No user scenario, personal model or secret is read or printed.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "simulation"))
from jaamsim_engine import RELEASE, JaamSimUnavailable, _cfg, _validate_report_metadata, installed_jar


def main():
    java = subprocess.run(["java", "--version"], capture_output=True, text=True, timeout=10)
    print("JAVA_VERSION:", (java.stdout or java.stderr).splitlines()[0] if java.returncode == 0 else "Java unavailable")
    jar = installed_jar()  # Checks the pinned SHA-256; never print private application inputs.
    print("JAAMSIM_JAR_SHA256: VERIFIED", RELEASE)
    with tempfile.TemporaryDirectory(prefix="ris-jaamsim-diag-") as directory:
        cfg = Path(directory) / "run.cfg"
        cfg.write_text(_cfg(12, 0.25, 15, 1, 42, "fixed"), encoding="utf-8")
        process = subprocess.run(
            ["java", "-Xmx512m", "-jar", str(jar), str(cfg), "-h"],
            cwd=directory, capture_output=True, text=True, timeout=25, check=False,
        )
        print("JAVA_EXIT_CODE:", process.returncode)
        report = cfg.with_suffix(".rep")
        print("JAAMSIM_REPORT_EXISTS:", report.is_file())
        if not report.is_file():
            print("JAVA_ERROR_TAIL:", (process.stderr or process.stdout)[-400:].encode("ascii", "backslashreplace").decode("ascii"))
            return 1
        content = report.read_bytes().decode("latin-1")
        for line in content.splitlines():
            columns = line.strip("\ufeff").split("\t")
            if len(columns) >= 3 and columns[0].strip() == "Simulation" and columns[1].strip() in ("SoftwareName", "SoftwareVersion"):
                print("REPORT_" + columns[1].strip() + ":", repr(columns[2][:80]))
        try:
            print("REPORT_VALIDATION:", _validate_report_metadata(content))
        except JaamSimUnavailable as exc:
            print("REPORT_VALIDATION_ERROR:", str(exc).encode("ascii", "backslashreplace").decode("ascii"))
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
