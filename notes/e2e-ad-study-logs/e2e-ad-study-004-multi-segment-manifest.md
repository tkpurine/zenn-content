---
title: "e2e AD study4: 複数segment用のmanifest builderを作る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "データセット", "pytorch"]
published: false
---

## はじめに

前回は、comma2k19の1分example segmentを使ってResNet18のsteering予測baselineを回しました。

ただし、1つのsegmentだけでtrain/validationを分けても、隣接フレームの相関が強く、汎化評価にはなりません。次に必要なのはモデル改善ではなく、複数segmentを扱えるデータ作成パイプラインです。

そこで今回は、comma2k19のsegmentを探索し、動画フレームとCANログを同期して、学習用manifestを作るCLIを用意しました。

## 作ったもの

`build_comma2k19_manifest.py` というスクリプトを作りました。

できることは以下です。

- dataset root以下からvalidなsegmentを探索
- `video.hevc` からフレームを抽出
- `global_pose/frame_times` を基準にCAN speed/steeringを同期
- CANログが両方存在する同期開始frame以降だけを使う
- 時刻ズレが大きい行を除外する
- segment別CSVと結合CSVを出力する
- 複数segmentがある場合はsegment単位holdout splitを付ける

## 実行例

公式repoのexample segmentで動かす場合はこうです。

```bash
python3 build_comma2k19_manifest.py \
  --root /tmp/comma2k19_repo/Example_1 \
  --output-root /tmp/e2e_ad_manifest_builder_test \
  --sample-every 10 \
  --width 582 \
  --max-delta-sec 0.02
```

出力は以下です。

```text
manifest.csv
manifest_summary.csv
segment_manifests/*.csv
frames/*/frame_*.jpg
```

## example segmentでの結果

まずは公式repoに含まれる1分segmentで動作確認しました。

```text
segments: 1
rows: 120
first_frame_idx: 1
last_frame_idx: 1191
max_speed_delta: 0.00860 sec
max_steering_delta: 0.00873 sec
```

同期開始frameは前回と同じくframe 1になり、先頭frame 0の約40msズレは除外できています。

## なぜmanifest builderが必要か

前回のvalidation MAEは約 `0.464 deg` でしたが、これは1分segment内のchronological splitです。隣接フレームがかなり似ているので、実力を測る数字ではありません。

複数segmentに広げると、次のような評価に進めます。

- train segmentとvalidation segmentを分ける
- 別時間帯・別道路条件で評価する
- steering分布や速度分布の偏りを見る
- 将来のwaypoint predictionにも同じmanifestを流用する

## 次にやること

- comma2k19の小さなchunkを取得する
- 複数segmentでmanifestを作る
- ResNet18 baselineを `manifest.csv` 入力に変更する
- segment単位splitで再学習する
- speed入力を追加する

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。

