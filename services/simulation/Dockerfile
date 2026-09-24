FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENV RIS_JAAMSIM_JAR=/opt/jaamsim/JaamSim2026-05.jar
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home ris
RUN mkdir -p /opt/jaamsim && python -c "import urllib.request,hashlib,pathlib; url='https://github.com/jaamsim/jaamsim/releases/download/v2026-05/JaamSim2026-05.jar'; p=pathlib.Path('/opt/jaamsim/JaamSim2026-05.jar'); blob=urllib.request.urlopen(url,timeout=90).read(); assert hashlib.sha256(blob).hexdigest()=='be8229bbe0a545e1e4a10338aa66dfd3c9e23d933c6f65bc3baa904d6f8fceb9','JaamSim binary mismatch';p.write_bytes(blob)"
COPY engine.py jaamsim_engine.py app.py ./
RUN python -c "import app,jaamsim_engine;assert jaamsim_engine.installed_jar().is_file()"
USER ris
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=2)"
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--workers","1"]
