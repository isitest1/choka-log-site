# 釣果ログ サイト（chokalog.margheritaworks.com）

## 配信の仕組み

- GitHub Pages で配信している（`CNAME` と `.nojekyll` を使用。ビルドの工程はなく、ファイルをそのまま配信する）。
- 本番に反映されるのは `main` のブランチだけ。ほかのブランチへのプッシュは本番に反映されない。
- GitHub Pages には、ブランチごとのプレビューの仕組みはない。

## ブランチの決まり

- `android-launch` のブランチは、**本人の指示があるまで `main` にマージしない**。
  - マージは、Android 版のクローズドテストが Google の審査を通って公開され、テスト参加のリンク（`https://play.google.com/apps/testing/com.margheritaworks.chokalog`）が実際に開ける状態になってから、本人の指示で行う。作業者の判断ではマージしない。
  - 審査中にマージすると、`/android/` を見て参加しようとした人が手順2で止まってしまうため。
- `android-launch` の作業で別の名前のブランチ（`claude/...` など）を使った場合は、`android-launch` へのプルリクエストにする。`main` へのプルリクエストは作らない。
- 仕様は `docs/android-launch.md` を参照する。
