"""Build state discovery assets from the open NWDP Survey of India GeoJSON ZIPs."""

import argparse
import hashlib
import json
import zipfile
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import shape

PROJECTION = Transformer.from_crs("EPSG:7755", "EPSG:4326", always_xy=True)
ORIGIN = (810000, 170000)
PILOT = {"cg", "br", "jh", "rj", "up"}
INVALID_CODES = {"", "0", "999999"}


def features(path):
    with zipfile.ZipFile(path) as archive:
        [entry] = [name for name in archive.namelist() if name.lower().endswith(".geojson")]
        with archive.open(entry) as source:
            for line in source:
                if line.startswith(b'{ "type": "Feature"'):
                    yield json.loads(line.rstrip(b",\r\n"))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def records(geometry):
    return [geometry] if geometry.geom_type == "Polygon" else geometry.geoms


def lonlat(point):
    return [round(value * 10000) for value in PROJECTION.transform(point.x, point.y)]


def ring_points(ring):
    x, y = PROJECTION.transform(*ring.xy)
    return [[round(lon * 10000), round(lat * 10000)] for lon, lat in zip(x, y, strict=True)]


def encode_ring(points):
    path = []
    prev = ORIGIN
    for point in points[:-1]:
        if point == prev:
            continue
        for value in (point[0] - prev[0], point[1] - prev[1]):
            n = ~(value << 1) if value < 0 else value << 1
            while n >= 32:
                path.append(chr((n & 31) + 95))
                n >>= 5
            path.append(chr(n + 63))
        prev = point
    return "".join(path) if len({tuple(p) for p in points[:-1]}) >= 3 else ""


def district_layers(source, output):
    groups = defaultdict(list)
    for feature in features(source):
        p = feature["properties"]
        code = p["state"].strip().lower()
        if code == "od":
            continue  # Retain the Odisha crosswalk shared with its existing village shapes.
        geometry = shape(feature["geometry"]).simplify(650, preserve_topology=True)
        polygons = []
        for part in records(geometry):
            rings = [ring_points(ring) for ring in [part.exterior, *part.interiors]]
            polygons.append([[[x / 10000, y / 10000] for x, y in ring] for ring in rings])
        label = [value / 10000 for value in lonlat(geometry.representative_point())]
        groups[code].append({"code":p["dtcode"],"name":p["district"],"label":label,"polygons":polygons})
    for code, districts in groups.items():
        write(output / f"region-{code}-districts.json", sorted(districts, key=lambda district: district["name"]))
    return sum(map(len, groups.values()))


def village_layers(code, source, output):
    outlines = defaultdict(list)
    villages = {}
    for feature in features(source):
        p = feature["properties"]
        ident, village, district, tehsil, district_code = [
            str(p.get(field) or "").strip() for field in ("vlcode", "village", "district", "subdistric", "dtcode")
        ]
        if ident in INVALID_CODES or not ident.isdecimal() or not village or not district or not feature["geometry"]:
            continue
        geometry = shape(feature["geometry"]).simplify(140, preserve_topology=True)
        if geometry.is_empty or geometry.geom_type not in {"Polygon","MultiPolygon"}:
            continue
        parts = records(geometry)
        center = lonlat(max(parts, key=lambda part: part.area).representative_point())
        villages[(district_code, ident, village)] = [ident, village, district, tehsil, district_code, *center]
        if code == "cg":
            polygons = []
            for part in parts:
                exterior = encode_ring(ring_points(part.exterior))
                if exterior:
                    holes = [encoded for ring in part.interiors if (encoded := encode_ring(ring_points(ring)))]
                    polygons.append("!".join([exterior, *holes]))
            if polygons:
                outlines[district_code].append([ident, village, tehsil, *center, ":".join(polygons)])
    for code_id, rows in outlines.items():
        write(output / f"region-{code}-boundaries-{code_id}.json", sorted(rows))
    write(output / f"region-{code}-villages.json", {"rows":sorted(villages.values())})
    return len(villages)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", type=Path)
    parser.add_argument("--output", type=Path, default=Path("dist"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for source in sorted(args.archives.glob("*.zip")):
        code = source.stem
        if code == "district":
            count = district_layers(source, args.output)
        elif code in PILOT:
            count = village_layers(code, source, args.output)
        else:
            continue
        with source.open("rb") as stream:
            print(f"{code}: {count:,} rows, SHA-256 {hashlib.file_digest(stream, 'sha256').hexdigest()}", flush=True)


if __name__ == "__main__":
    main()
