"""Build the browser directory from the LGD village Parquet snapshot and its provenance."""
import hashlib
import json
from pathlib import Path
import sys

import duckdb

snapshot, metadata, output = map(Path, sys.argv[1:])
provenance = json.loads(metadata.read_text(encoding="utf-8"))["villages"]
if hashlib.sha256(snapshot.read_bytes()).hexdigest() != provenance["file"]["sha256"]:
    raise ValueError("Village source checksum does not match the LGD snapshot manifest.")

# Previously verified Bhulekh/BhuNaksha location labels. These IDs are distinct from LGD IDs.
crosswalk = {
    "396438": ("19-8-164", "17", "Chandola", ["Chandola", "ଚାନ୍ଦୋଳ"]),
    "396442": ("19-8-15", "17", "Chandola", ["Bhanagaan", "ଭଣଗାଁ"]),
    "399590": ("3-11-105", "8", "Kurujanga", ["କୁରୁଜଙ୍ଗା"]),
    "399591": ("3-11-111", "8", "Kurujanga", ["Sabalakana", "ସବଳକଣା"]),
    "399615": ("3-11-101", "8", "Kurujanga", ["ବନ୍ତଳା"]),
    "399616": ("3-11-102", "8", "Kurujanga", ["Bharatapada", "ଭରତପଡ଼ା", "ଭରତପଡ଼ା"]),
    "399779": ("3-15-13", "1", "Bishnupur", ["ପାରାସାଇଲୋ"]),
}
district_labels = {"Kataka": "Cuttack", "Kendrapada": "Kendrapara"}
villages = duckdb.read_parquet(str(snapshot)).filter("state_code=21")
rows = []
for code, name, local, district, tehsil in villages.project(
    "village_code,village_name,village_name_local,district_name,subdistrict_name"
).order("village_code").fetchall():
    if not all((code, name, district, tehsil)):
        raise ValueError("LGD snapshot has a village with incomplete administrative fields.")
    packed = [str(code), name.strip(), (local or "").strip(), district_labels.get(district, district), tehsil]
    if str(code) in crosswalk:
        packed.extend(crosswalk[str(code)])
    rows.append(packed)
# Two LGD villages share the same name and tehsil. Keep the verified portal record separate.
rows.append(["Bhulekh 3-11-106", "Kusunpur", "କୁସୁନପୁର", "Cuttack", "Mahanga", "3-11-106", "8", "Kurujanga", []])
data = {"state":"Odisha", "source":f"Odisha LGD directory · {provenance['observed_on']}", "provenance":provenance, "rows":rows}
output.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n", encoding="utf-8")
print(f"Generated {len(rows):,} Odisha village directory entries.")
