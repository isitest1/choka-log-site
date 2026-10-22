# assets/ の素材（2.0 の更新で足したもの）

サイトから、ほかのリポジトリを直接読まないため、2.0 の更新で使う素材はここに写してある（元のリポジトリは読むだけ）。

## 元の素材

| 置き場所 | 元 | 中身 |
|---|---|---|
| `img/2.0/*.webp`（画面の写真） | isitest1/fishing-log の `release/2.0`、`docs/site-2.0-assets/screens/` | 2.0 の画面のスクリーンショット（幅 750px の WebP をそのまま写した）。デバッグ版のデモのデータ（作り物の釣果・航跡）で撮ったもの |
| `img/2.0/map-1x.webp`・`map-2.0.webp` | 同 `docs/site-2.0-assets/compare/map-1x.png`・`map-2.0.png` | 1.x と 2.0 の地図の見比べ。元の PNG（1206×690px）から WebP（品質 80）に変換した |
| `map-anim/`（`{z}/{x}/{y}.webp`・`land.geojson`・`meta.json`） | isitest1/mw-bathymetry の `main`、`site-assets/map-anim/` | 航跡の動き用の地図のタイル（z11〜z15、322 枚）と陸の形。そのまま写した。範囲と作り方は `meta.json` と、mw-bathymetry の `site-assets/README.md` を参照 |
| `data/track-day.json` | fishing-log の `docs/site-2.0-assets/track-day.json` | 2026/10/3 の 1 日の航跡（航跡の節の動き）。下の手順で軽い形に変換した |
| `data/trips-2.json` | 同 `trips-2.json` | 過去の土曜 2 回分の航跡（地図の節の「あの日と、この日を重ねる。」の動き）。同じく変換した |
| `img/og.png` | 上の `recording-map`・`map-zoom` の画面 | 共有用の画像（1200×630）。HTML に並べて、Playwright で書き出した |

`trips-5.json` は古い素材なので使っていない。

## 航跡の JSON の変換

元の `track-day.json` は約 3MB（1 秒に 1 点）あるので、そのまま写さず、サイト用の軽い形に変換している。

```bash
python3 -I assets/data/convert-tracks.py <fishing-log の docs/site-2.0-assets のフォルダ> assets/data
```

変換の中身（`assets/data/convert-tracks.py`）:

1. 全部の点（`points`、1 秒に 1 点）から、5 秒ごとに 1 点を残す。最初と最後の点と、移動中・釣り中が変わる点は、5 秒たっていなくても残す。
2. 緯度・経度を小数 5 桁に丸める。
3. 残す項目は、時刻・緯度・経度・移動中か釣り中か・釣果だけにする。
   - 点は `[出港からの秒, 緯度, 経度, 状態]` の配列（状態は 0 = 移動中、1 = 釣り中）。
   - 釣果は `{ t: 出港からの秒, lat, lon, species }`。
   - ほかに、日付（`date`）・出港と帰港の時刻（`departureAt`・`returnAt`）・線の色（`color`）を残す。

できあがりの大きさ: `track-day.json` 約 143KB（5,146 点）、`trips-2.json` 約 190KB（2 回分）。

## 動きの部品

- `js/map-anim.js`：航跡の動き（2 つ）と、1.x と 2.0 の見比べの部品、地図の埋め込みの読み込み。Leaflet 1.9.4 は cdnjs から、その節に近づいたときに読み込む。
