"""Build geographic state outlines and the Odisha district extent index for the location atlas.

Pass the geoBoundaries gbOpen IND ADM1 GeoJSON (DataMeet India, CC BY 2.5 IN).
The Odisha inputs are the existing simplified Survey of India release in dist.
"""
import argparse
import json
import unicodedata
from pathlib import Path

from shapely.geometry import shape

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("adm1", type=Path)
args = parser.parse_args()
dist = Path(__file__).resolve().parents[1] / "dist"
states = []
for feature in json.loads(args.adm1.read_text("utf-8"))["features"]:
    name = unicodedata.normalize("NFKD", feature["properties"]["shapeName"])
    name = "".join(c for c in name if not unicodedata.combining(c))
    geometry = shape(feature["geometry"]).simplify(0.025, preserve_topology=True)
    polygons = getattr(geometry, "geoms", [geometry])
    rings = [[[[round(x, 3), round(y, 3)] for x, y in ring.coords]
              for ring in [p.exterior, *p.interiors]] for p in polygons]
    states.append(dict(name=name, bounds=list(geometry.bounds), polygons=rings))

def positions(encoded):
    """Decode village ring deltas in units of 1/10000 degrees."""
    for polygon in encoded.split(":"):
        for ring in polygon.split("!"):
            point, axis, value, shift = [810000, 170000], 0, 0, 0
            for char in ring:
                part = ord(char) - 63
                value += (part & 31) << shift
                if part >= 32:
                    shift += 5
                    continue
                point[axis] += -(value + 1) // 2 if value & 1 else value // 2
                axis ^= 1
                if axis == 0:
                    yield point[0] / 10000, point[1] / 10000
                shift = value = 0

districts = []
for code, name, count in json.loads((dist / "odisha-boundary-districts.json").read_text("utf-8")):
    rows = json.loads((dist / f"odisha-boundaries-{code}.json").read_text("utf-8"))
    points = (p for row in rows for p in positions(row[5]))
    x0 = y0 = float("inf")
    x1 = y1 = float("-inf")
    for x, y in points:
        x0, y0 = min(x, x0), min(y, y0)
        x1, y1 = max(x, x1), max(y, y1)
    districts.append(dict(code=code, name=name, bounds=[x0, y0, x1, y1]))
(dist / "atlas-boundaries.json").write_text(
    json.dumps(dict(states=states, districts=districts), separators=(",", ":")) + "\n", "utf-8")
