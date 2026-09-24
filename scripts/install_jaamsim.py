"""Install a pinned, hash-verified Apache-2.0 JaamSim binary without checking it into Git."""
from __future__ import annotations
import hashlib
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

VERSION="2026-05"
NAME=f"JaamSim{VERSION}.jar"
SHA256="be8229bbe0a545e1e4a10338aa66dfd3c9e23d933c6f65bc3baa904d6f8fceb9"
URL=f"https://github.com/jaamsim/jaamsim/releases/download/v{VERSION}/{NAME}"
TARGET=Path(__file__).resolve().parents[1]/"vendor"/"jaamsim"/NAME
def ensure_installed():
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    if TARGET.exists() and hashlib.sha256(TARGET.read_bytes()).hexdigest()==SHA256:
        print("JAAMSIM_VERIFIED",TARGET,VERSION);return TARGET
    with tempfile.NamedTemporaryFile(dir=TARGET.parent,prefix="jaamsim-",suffix=".part",delete=False) as handle:
        temporary=Path(handle.name)
        try:
            with urllib.request.urlopen(URL,timeout=50) as response:
                while block:=response.read(1024*1024):handle.write(block)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    actual=hashlib.sha256(temporary.read_bytes()).hexdigest()
    if actual!=SHA256:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("JaamSim checksum mismatch; refusing to install "+actual)
    os.replace(temporary,TARGET)
    print("JAAMSIM_VERIFIED",TARGET,VERSION)
    return TARGET
if __name__=="__main__":
    try:ensure_installed()
    except Exception as exc:print(str(exc),file=sys.stderr);raise SystemExit(1) from exc
