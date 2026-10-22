#!/usr/bin/env python3
"""iPhone 版の素材（track-day.json・trips-2.json）を、サイトの航跡の動き用の軽い形に変換する。

使い方:
  python3 -I assets/data/convert-tracks.py <site-2.0-assets のフォルダ> assets/data

入力（FishingLog の release/2.0、docs/site-2.0-assets/）は読むだけ。
"""
import json
import sys
from datetime import datetime
from pathlib import Path


def ts(s):
    return datetime.fromisoformat(s).timestamp()


def convert_trip(trip):
    t0 = ts(trip["departureAt"])
    pts = []
    last_kept = None
    src = trip["points"]  # 1 秒に 1 点（全部の点）
    for i, p in enumerate(src):
        t = ts(p["t"])
        s = 1 if p["state"] == "fishing" else 0
        changed = i > 0 and src[i - 1]["state"] != p["state"]
        is_end = i == 0 or i == len(src) - 1
        # 5 秒ごとに間引く（最初と最後の点、移動中・釣り中が変わる点は残す）
        if last_kept is None or t - last_kept >= 5 or changed or is_end:
            pts.append([round(t - t0), round(p["lat"], 5), round(p["lon"], 5), s])
            last_kept = t
    catches = [
        {"t": round(ts(c["t"]) - t0), "lat": round(c["lat"], 5), "lon": round(c["lon"], 5),
         "species": c["species"]}
        for c in trip["catches"]
    ]
    out = {
        "date": trip["date"],
        "departureAt": trip["departureAt"],
        "returnAt": trip["returnAt"],
        "fields": ["秒（出港から）", "緯度", "経度", "0=移動中 1=釣り中"],
        "points": pts,
        "catches": catches,
    }
    if "color" in trip:
        out["color"] = trip["color"]
    return out


def dump(obj, path):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{path}: {path.stat().st_size / 1024:.0f}KB")


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    day = json.loads((src / "track-day.json").read_text(encoding="utf-8"))
    dump(convert_trip(day), dst / "track-day.json")
    two = json.loads((src / "trips-2.json").read_text(encoding="utf-8"))
    dump({"trips": [convert_trip(t) for t in two["trips"]]}, dst / "trips-2.json")


if __name__ == "__main__":
    main()
