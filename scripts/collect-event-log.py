"""Reproducible, non-random excerpt of a CC BY 4.0 observed ServiceNow log."""
import csv
import hashlib
import io
import json
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://archive.ics.uci.edu/static/public/498/incident+management+process+enriched+event+log.zip'
raw = urllib.request.urlopen(URL, timeout=60).read()
digest = hashlib.sha256(raw).hexdigest()
raw_path = ROOT / 'data' / 'raw' / 'uci-incidents' / (digest + '.zip')
raw_path.parent.mkdir(parents=True, exist_ok=True)
raw_path.write_bytes(raw)
archive = zipfile.ZipFile(io.BytesIO(raw))
member = next(name for name in archive.namelist() if name.endswith('.csv'))
groups = {}
with archive.open(member) as stream:
    for row_number, row in enumerate(csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8')), start=2):
        groups.setdefault(row['number'], []).append({key: row[key] for key in ['number', 'incident_state', 'sys_updated_at', 'opened_at', 'closed_at']} | {'rawRow': row_number})
selected = []
for case_id in sorted(groups):
    rows = groups[case_id]
    try:
        for row in rows:
            datetime.strptime(row['sys_updated_at'], '%d/%m/%Y %H:%M')
    except ValueError:
        continue
    if not any(row['incident_state'] == 'Closed' for row in rows):
        continue
    selected.extend(rows)
    if len({row['number'] for row in selected}) == 8:
        break
output = {
    'schemaVersion': 'observed-digital-log/1',
    'source': {
        'id': 'uci-incidents-498',
        'title': 'Incident management process enriched event log',
        'url': 'https://archive.ics.uci.edu/dataset/498/incident+management+process+enriched+event+log',
        'doi': '10.24432/C57S4H',
        'attribution': 'Amaral, C., Fantinato, M., & Peres, S. (2018). UCI Machine Learning Repository.',
        'license': 'CC BY 4.0',
        'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
        'observedAt': datetime.now(timezone.utc).isoformat(),
        'sha256': digest,
        'rawLocator': raw_path.relative_to(ROOT).as_posix(),
        'rawMember': member,
        'mappingVersion': 'uci-digital-excerpt/1',
        'selection': 'First eight lexicographically ordered case identifiers containing Closed and parseable update timestamps; all rows retained, only five source columns projected plus original CSV row locator.',
        'limitations': ['Historical anonymized incident handling, not document OCR/RPA performance.', 'Local clock timestamps; source timezone unspecified. No conversion to UTC.', 'State elapsed time is not active employee work time.', 'No prices, staffing costs or automation outcome are present.', 'Equal timestamps and repeated states are retained; no intermediate events are generated.']
    },
    'rows': selected
}
target = ROOT / 'data' / 'observations' / 'uci-incidents.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'cases': len({r['number'] for r in selected}), 'events': len(selected), 'sha256': digest, 'path': str(target)}))
