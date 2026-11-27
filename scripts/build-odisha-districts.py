"""Extract Odisha district polygons from geoBoundaries IND ADM2 (ODbL 1.0)."""

import argparse
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, shape

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("adm2", type=Path)
args = parser.parse_args()
dist = Path(__file__).resolve().parents[1] / "dist"
atlas = json.loads((dist / "atlas-boundaries.json").read_text("utf-8"))
odisha = MultiPolygon(next(state["polygons"] for state in atlas["states"] if state["name"] == "Odisha")).buffer(0)
official = json.loads(args.adm2.read_text("utf-8"))
aliases = {
    "Boudh": "Baudh",
    "Deogarh": "Debagarh",
    "Jajpur": "Jajapur",
    "Nabarangpur": "Nabarangapur",
    "Sonepur": "Subarnapur",
}
geometries = {}
for feature in official["features"]:
    geometry = shape(feature["geometry"])
    if odisha.covers(geometry.representative_point()):
        geometries[feature["properties"]["shapeName"]] = geometry

districts = []
for district in atlas["districts"]:
    name = district["name"]
    geometry = geometries[aliases.get(name, name)].simplify(0.003, preserve_topology=True)
    label = list(geometry.representative_point().coords[0])
    districts.append({
        "code": district["code"],
        "label": [round(value, 4) for value in label],
        "polygons": [
            [[[round(x, 4), round(y, 4)] for x, y in ring.coords] for ring in [part.exterior, *part.interiors]]
            for part in getattr(geometry, "geoms", [geometry])
        ],
    })

(dist / "odisha-district-polygons.json").write_text(
    json.dumps(districts, separators=(",", ":")) + "\n", "utf-8"
)
