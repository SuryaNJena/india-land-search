"""Build simplified browser village maps from the open NWDP Odisha boundary ZIP."""

import argparse
import hashlib
import json
import re
import unicodedata
import zipfile
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import shape

SHA256 = "d66dce51db780ca890cfcb0ff7fa5a7e786117ba4330f0c442b6b62cad8729a2"
ENTRY = "vb_soi_or.GeoJSON"
PRECISION = 10_000
OGC_SCALE = 140
ORIGIN = (810_000, 170_000)
PROJECTION = Transformer.from_crs("EPSG:7755", "EPSG:4326", always_xy=True)
ADMIN_ALIASES = {
    "anugul": "angul", "baleshwar": "balasore", "baudh": "boudh", "boudh": "boudh",
    "debagarh": "deogarh", "jajapur": "jajpur", "kendujhar": "keonjhar",
    "khorda": "khordha", "sonapur": "subarnapur", "sonepur": "subarnapur",
    "subarnapur": "subarnapur", "sundargarh": "sundergarh",
}


def comparison(value):
    return "".join(c for c in unicodedata.normalize("NFC", value.casefold()) if c.isalnum())


def district_key(value):
    key = comparison(value)
    return ADMIN_ALIASES.get(key, key)


def serialize_integer(value):
    number = ~(value << 1) if value < 0 else value << 1
    result = []
    while number >= 32:
        result.append(chr((number & 31) + 95))
        number >>= 5
    result.append(chr(number + 63))
    return "".join(result)


def encode_ring(ring):
    sx, sy = ring.xy
    longitudes, latitudes = PROJECTION.transform(sx, sy)
    points = []
    for lon, lat in zip(longitudes, latitudes, strict=True):
        if not 81 <= lon <= 89 or not 17 <= lat <= 24:
            raise ValueError(f"Odisha reprojection out of range: {(lon, lat)}")
        point = (round(lon * PRECISION), round(lat * PRECISION))
        if not points or points[-1] != point:
            points.append(point)
    if points and points[0] == points[-1]:
        points.pop()
    if len(set(points)) < 3:
        return ""
    last_x, last_y = ORIGIN
    result = []
    for x, y in points:
        result.extend((serialize_integer(x - last_x), serialize_integer(y - last_y)))
        last_x, last_y = x, y
    return "".join(result)


def encode_polygon(polygon):
    exterior = encode_ring(polygon.exterior)
    if not exterior:
        return ""
    return "!".join([exterior, *(encoded for ring in polygon.interiors if (encoded := encode_ring(ring)))])


def label_properties(props, directory):
    district, tehsil, village = (str(props.get(key) or "").strip() for key in ("district", "subdistric", "village"))
    village_code = str(props.get("vlcode") or "").strip()
    match = directory.get(village_code)
    # Validate the district, tehsil and village name/alias before passing through portal codes.
    if match:
        ident, name, local, lgd_district, lgd_tehsil, *other = match
        same_district = district_key(district) == district_key(lgd_district)
        if same_district:
            district = lgd_district
            portal, ri_code, ri, aliases = (other + ["", "", "", []])[:4]
            names = {comparison(label) for label in [name, local, *(aliases or [])] if label}
            if comparison(village) in names and comparison(tehsil) == comparison(lgd_tehsil):
                extra = [portal, ri_code, ri] if portal and ri_code else []
                return district, [str(ident), name, lgd_tehsil], extra
    return district, [village_code if village_code.isdecimal() and int(village_code) else "", village, tehsil], []


def collect(path, directory):
    groups = {}
    matched = 0
    with path.open("rb") as file:
        if hashlib.file_digest(file, "sha256").hexdigest() != SHA256:
            raise ValueError("Use the pinned NWDP Odisha GeoJSON archive documented in the repository")
    with zipfile.ZipFile(path) as archive, archive.open(ENTRY) as source:
        for line in source:
            if not line.startswith(b'{ "type": "Feature"'):
                continue
            record = json.loads(line.rstrip(b",\r\n"))
            district, labels, extra = label_properties(record["properties"], directory)
            if not district or not labels[1] or not record["geometry"]:
                continue
            geometry = shape(record["geometry"]).simplify(OGC_SCALE, preserve_topology=True)
            polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
            outlines = [outline for polygon in polygons if (outline := encode_polygon(polygon))]
            if not outlines:
                continue
            representative = max(polygons, key=lambda item: item.area).representative_point()
            lon, lat = PROJECTION.transform(representative.x, representative.y)
            row = [*labels, round(lon * PRECISION), round(lat * PRECISION), ":".join(outlines)]
            if extra:
                matched += 1
                row.extend(extra)
            groups.setdefault(district_key(district), {"name": district, "rows": []})["rows"].append(row)
    return groups, matched


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--directory", type=Path, default=Path("dist/villages.json"))
    parser.add_argument("--output", type=Path, default=Path("dist"))
    args = parser.parse_args()
    directory = {str(row[0]): row for row in json.loads(args.directory.read_text(encoding="utf-8"))["rows"]}
    args.output.mkdir(parents=True, exist_ok=True)
    groups, matched = collect(args.archive, directory)
    districts = []
    for slug, group in sorted(groups.items()):
        if not re.fullmatch("[a-z]+", slug):
            raise ValueError(f"Unexpected Odisha district code: {slug}")
        rows = sorted(group["rows"], key=lambda row: (row[1].casefold(), row[2], row[0], row[3:5]))
        write_json(args.output / f"odisha-boundaries-{slug}.json", rows)
        districts.append([slug, group["name"], len(rows)])
    write_json(args.output / "odisha-boundary-districts.json", districts)
    print(f"Rendered {sum(row[2] for row in districts):,} shapes across {len(districts)} districts, with {matched} verified Bhulekh mappings")


if __name__ == "__main__":
    main()
