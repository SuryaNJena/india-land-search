"""Build a browser spelling dictionary from the pinned Aksharantar Odia archive."""

import argparse
import ast
import hashlib
import json
import re
import unicodedata
import zipfile
from pathlib import Path

ARCHIVE_SHA256 = "690ce007173d9d185082e86a27497592a643d020349c2bf1d95162877740165e"
SOURCE_PRIORITY = {"Wikidata": 2, "Samanantar": 1, "IndicCorp": 0}
ROMAN_WORD = re.compile(r"[a-z]{2,30}")
ODIA_WORD = re.compile(r"[\u0b01-\u0b63]{2,40}")


def dictionary_from(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("Expected the pinned Aksharantar Odia archive")
    entries = {}
    with zipfile.ZipFile(path) as archive:
        for filename in ("ori/ori_train.json", "ori/ori_valid.json"):
            with archive.open(filename) as data:
                for line in data:
                    if not line.strip():
                        continue
                    # This archive stores Python literals. Each line is parsed as data.
                    row = ast.literal_eval(line.decode("utf-8"))
                    source = SOURCE_PRIORITY.get(row["source"])
                    if source is None:
                        continue
                    score = row["score"]
                    if source == SOURCE_PRIORITY["IndicCorp"] and (score is None or score < -0.065):
                        continue
                    english = row["english word"].casefold()
                    odia = unicodedata.normalize("NFC", row["native word"])
                    if not ROMAN_WORD.fullmatch(english) or not ODIA_WORD.fullmatch(odia):
                        continue
                    choices = entries.setdefault(english, {})
                    rank = (source, score if score is not None else 0)
                    choices[odia] = max(rank, choices.get(odia, rank))
    return {
        english: sorted(choices, key=lambda odia: (-choices[odia][0], -choices[odia][1], odia))[:3]
        for english, choices in sorted(entries.items())
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=Path("dist/name-dictionary-or.json"))
    args = parser.parse_args()
    dictionary = dictionary_from(args.archive)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(dictionary, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")
    print(f"{len(dictionary):,} lookup keys and {sum(map(len, dictionary.values())):,} spelling pairs")


if __name__ == "__main__":
    main()
