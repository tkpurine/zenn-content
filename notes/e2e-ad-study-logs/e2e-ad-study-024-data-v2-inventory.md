---
title: "e2e AD study24: loss調整を止めてData v2の分割を作る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "データセット"]
published: false
---

## はじめに

Study23では、3秒先xの過大予測だけを罰するlossを試しました。

結果は、採用しない判断でした。

```text
Study20 FDE@3s: 1.6890m
Study23 FDE@3s: 1.9242m
```

これで、現行5-route validation setに対するloss tuningは止めます。

次はモデルではなく、Data v2です。

## なぜData v2へ進むか

現行の評価は52 segmentです。

```text
train: 40 segments
val:   12 segments
```

このvalidation routeは何度も見ています。

そのため、もうtest setではありません。

さらに、強い減速sliceは12行しかありません。

この小さいsliceに合わせてlossを調整すると、未知routeに効くか判断できません。

そこで、まずはroute単位でtrain/dev/testを作り直します。

## 今回作ったもの

Data v2の最初の作業として、comma2k19のzipを全展開せずにinventoryを作るツールを作りました。

```text
build_comma2k19_data_v2_inventory.py
```

このツールは `Chunk_*.zip` の中央ディレクトリを見て、route/segmentごとに必要ファイルが揃っているかを確認します。

見ている主な必須ファイルは次です。

```text
video.hevc
global_pose/frame_times
global_pose/frame_positions
processed_log/CAN/speed/t
processed_log/CAN/speed/value
processed_log/CAN/steering_angle/t
processed_log/CAN/steering_angle/value
```

また、inventoryから選んだsegmentだけを展開するツールも作りました。

```text
extract_comma2k19_segments_from_inventory.py
```

いきなり全展開しないように、dry-runとlimit指定を入れています。

## Chunk_1のinventory

手元にあったのは `Chunk_1.zip` です。

```text
~/datasets/comma2k19/downloads/Chunk_1.zip
```

集計結果はこうでした。

| item | count |
| --- | ---: |
| routes | 21 |
| segments | 188 |
| complete required segments | 188 |
| vehicles | 1 |

188 segmentすべてで、今回のtrajectory pipelineに必要なファイルは揃っていました。

ただし、Data v2の目標にしていた300-500 segmentには届いていません。

## route-disjoint split

次にroute単位でtrain/dev/testを割りました。

```text
strategy: route_disjoint_greedy_segment_balance
seed: 42
ratio: train/dev/test = 0.70/0.15/0.15
```

結果はこうです。

| split | routes | segments |
| --- | ---: | ---: |
| train | 16 | 130 |
| dev | 2 | 28 |
| test | 3 | 30 |

重要なのは、同じrouteを複数splitへ跨がせないことです。

過去の5-route validationとは別物として、Data v2のsplitを新しく作っています。

## 展開dry-run

全188 segmentを展開する場合の見積もりも出しました。

| item | value |
| --- | ---: |
| selected segments | 188 |
| zip members | 11186 |
| uncompressed bytes | 9685151662 |

約9.7GBです。

現実的に展開できるサイズですが、まだ300-500 segmentに届かないので、この時点でKaggle dataset化までは進めません。

## smoke test

展開ツールの動作確認として、dev splitから1 segmentだけ展開しました。

```text
Chunk_1/b0c9d2329ad1606b|2018-08-14--20-41-07/4/
```

展開された主なファイル:

```text
video.hevc
raw_log.bz2
preview.png
global_pose/frame_times
global_pose/frame_positions
global_pose/frame_orientations
global_pose/frame_velocities
```

zipから必要segmentだけ取り出すところまでは動きました。

## 今回の判断

まだData v2学習には進みません。

理由は3つあります。

- Chunk_1だけだと188 segmentで、300-500 segment目標に足りない
- vehicleは1つだけで、vehicle OOD評価ができない
- 今ここで188 segment版を作るより、Chunkを追加してからsplitを作り直す方がよい

現時点の成果は、Data v2を作るためのinventory/split/extractの土台です。

## 次にやること

次は、追加の `Chunk_*.zip` を用意します。

その後、同じツールを再実行します。

```text
downloads/Chunk_*.zip
        ↓
segment_inventory.csv
route_inventory.csv
route_split.csv
        ↓
selected segment extraction
        ↓
frame/path manifest
        ↓
Study20 baseline retrain
```

300 segment以上になった段階で、Study20相当のbaselineを新splitで再実行します。

その結果を、今後のtemporal Transformerやmulti-hypothesis trajectoryの基準にします。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
