# アンケート 3 問目（次の海域）の値と海域名

トップのアンケートの 3 問目（`q=chokyo-area-v1`）で、/poll に送る値（answer）と、画面に出す海域名の対応です。

- 受け取る側（api.margheritaworks.com/poll）は、英小文字・数字・ハイフンの値しか受け付けないため、英字の値で送る（2026-11-11）。
- 海域名は、アプリの「この海域を希望する」の候補と同じ。
- 「このどれでもない」は `other`。押すと、その場に海域の名前の欄が出る。書いた名前は /feedback に `{ app: "choka-log", type: "request", message: "海域の希望：（書いた名前）", source: "web" }` で送る（アプリの海域の希望と同じ形）。

| 送る値 | 海域名 |
|---|---|
| hokkaido-japansea | 北海道（日本海側） |
| hokkaido-pacific | 北海道（太平洋側） |
| hokkaido-okhotsk | 北海道（オホーツク） |
| aomori-mutsu | 青森・陸奥湾 |
| sanriku | 三陸 |
| sendai-fukushima | 仙台湾・福島 |
| akita-yamagata | 秋田・山形 |
| niigata-sado | 新潟・佐渡 |
| toyama-noto | 富山湾・能登 |
| sanin | 山陰 |
| kujukuri | 九十九里 |
| izu-islands | 伊豆諸島 |
| enshu | 遠州灘 |
| kumano | 熊野灘 |
| kii-wakayama | 紀伊水道・和歌山 |
| tosa | 土佐湾 |
| bungo-hyuga | 豊後水道・日向灘 |
| hibiki-yamaguchi | 響灘・山口北部 |
| nagasaki-goto | 長崎・五島 |
| ariake-yatsushiro | 有明海・八代海 |
| kagoshima | 鹿児島 |
| okinawa | 沖縄 |
| other | このどれでもない |
