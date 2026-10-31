---
title: "e2e AD study25: comma2k19 Chunk_2を追加してData v2を382 segmentへ広げる"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "データセット"]
published: false
---

## はじめに

前回は、Data v2のためにcomma2k19のinventoryとroute-disjoint splitを作りました。

ただし、手元にあったのは `Chunk_1.zip` だけでした。

```text
Chunk_1:
routes: 21
segments: 188
```

目標にしていた300-500 segmentには足りません。

今回は `Chunk_2.zip` を追加し、Data v2 splitを作り直します。

## 公式情報の確認

comma2k19の公式READMEでは、datasetは約33時間、2019個の1分segmentで構成されると説明されています。

また、datasetは約10GBずつ10個のchunkに分かれています。

重要なのは、vehicleです。

```text
Chunk 1-2: RAV4
Chunk 3以降: Civic
```

つまり、Chunk 1-2まで増やしてもvehicle OOD評価はできません。

ただし、Data v2の初期baselineを作るには十分なsegment数に届く可能性があります。

## Chunk_2の取得

Hugging Face mirrorから `Chunk_2.zip` を取得しました。

```text
https://huggingface.co/datasets/commaai/comma2k19/resolve/main/raw_data/Chunk_2.zip
```

保存先:

```text
~/datasets/comma2k19/downloads/Chunk_2.zip
```

サイズ:

```text
9054474112 bytes
```

zipの中央ディレクトリも読めました。

```text
entries: 11700
first: Chunk_2/
```

Academic Torrentsのtorrent metadataも保存しました。

```text
~/datasets/comma2k19/downloads/comma2k19.torrent
```

## Chunk_1+2のinventory

前回作ったinventory toolをそのまま使いました。

```bash
python3 build_comma2k19_data_v2_inventory.py \
  --dataset-root ~/datasets/comma2k19 \
  --out-dir ~/datasets/comma2k19/manifests/data_v2_inventory_chunk1_2 \
  --seed 42
```

結果はこうです。

| item | value |
| --- | ---: |
| zip files | 2 |
| routes | 42 |
| segments | 382 |
| complete required segments | 382 |
| vehicles | 1 |

300-500 segmentの初期目標には入りました。

ただし、vehicleはまだRAV4だけです。

## route-disjoint split

route単位でtrain/dev/testへ分割しました。

```text
strategy: route_disjoint_greedy_segment_balance
seed: 42
ratio: train/dev/test = 0.70/0.15/0.15
```

結果:

| split | routes | segments |
| --- | ---: | ---: |
| train | 33 | 264 |
| dev | 4 | 58 |
| test | 5 | 60 |

このsplitでは、同じrouteは複数splitに跨がりません。

旧5-route validation setとは別の、Data v2用splitです。

## 展開容量の問題

全382 segmentを展開するdry-runも確認しました。

| item | value |
| --- | ---: |
| zip members | 22864 |
| uncompressed bytes | 19736181019 |

約19.7GBです。

Chunk_2を追加した後の空き容量は約20GiBでした。

つまり、全展開するとほぼ空き容量を使い切ります。

さらにframe抽出、manifest、Kaggle dataset化の容量も必要です。

そのため、ここで全展開するのはやめます。

## 判断

Data v2のsegment数は足りました。

しかし、次の処理は全展開方式ではなく、segment単位のstreaming方式にします。

方針はこうです。

```text
zip
  ↓
1 segmentだけ一時展開
  ↓
sample frame抽出
  ↓
CAN/poseを読んでtarget生成
  ↓
compact datasetへ書き出し
  ↓
一時segmentを削除
```

これなら、disk使用量は「1 segmentの一時展開 + compact frames」に抑えられます。

## 次にやること

次は、Data v2 compact manifest builderを作ります。

出力目標:

```text
~/datasets/comma2k19/manifests/data_v2_chunk1_2_compact/
  manifest_speed5_steer30_route_holdout_future_path_interp.csv
  frames/
  summary.json
```

まずは10 segment程度のsmoke testで、同期、future path補間、split反映、frame抽出を確認します。

それが通ったら、382 segment全体のcompact datasetを作ります。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
