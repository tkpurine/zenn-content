---
title: "e2e AD study26: 全展開せずにData v2 manifestを作る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "データセット"]
published: false
---

## はじめに

前回はcomma2k19の `Chunk_2.zip` を追加し、Chunk_1+2でData v2用のinventoryを作りました。

結果は382 segmentでした。

これは初期baselineを作るには十分です。

ただし、全展開のdry-runでは約19.7GBが必要でした。

さらにそこからframe抽出、manifest生成、Kaggle dataset化をするので、全展開を前提にすると作業が重くなります。

今回は、segment単位で一時展開しながらcompact datasetを作るbuilderを実装し、smoke testまで行いました。

## 方針

全体の処理はこうです。

```text
Chunk_*.zip
  ↓
1 segmentだけ一時展開
  ↓
sample frameをdecode
  ↓
CAN speed / steering と global poseを読む
  ↓
future path targetを生成
  ↓
compact framesとmanifestへ保存
  ↓
一時segmentを削除
```

これなら、必要なdisk容量は「1 segmentの一時展開 + compact frames」に抑えられます。

## 実装したscript

```text
~/e2e_ad_study_work/tools/build_compact_future_path_manifest_from_inventory.py
```

syntax check:

```bash
python3 -m py_compile ~/e2e_ad_study_work/tools/build_compact_future_path_manifest_from_inventory.py
```

manifestには、画像path、segment、split、速度、操舵角、同期ずれ、future path targetを出します。

target列は以下です。

```text
future_1s_x_m, future_1s_y_m
future_2s_x_m, future_2s_y_m
future_3s_x_m, future_3s_y_m
```

target生成方法:

```text
linear_interpolation_path_aligned_1s_forward
```

global poseを線形補間し、現在位置から1秒後の位置への方向をlocal forward axisにします。

そのため、`future_1s_y_m` はほぼ0になります。

2秒後、3秒後の横方向成分は、その初期進行方向に対する曲がりとして表れます。

これはData v2用のtarget定義です。

過去の5-route manifestと完全同一のtarget generatorとは限りません。

## smoke test

まずはtrain/dev/testから2 segmentずつ、合計6 segmentで試しました。

```bash
python3 ~/e2e_ad_study_work/tools/build_compact_future_path_manifest_from_inventory.py \
  --inventory ~/datasets/comma2k19/manifests/data_v2_inventory_chunk1_2/segment_inventory.csv \
  --out-dir ~/datasets/comma2k19/manifests/data_v2_chunk1_2_compact_smoke_balanced \
  --temp-dir ~/datasets/comma2k19/tmp \
  --splits train,dev,test \
  --limit-segments-per-split 2 \
  --sample-every 10 \
  --image-width 320
```

出力:

```text
~/datasets/comma2k19/manifests/data_v2_chunk1_2_compact_smoke_balanced
```

サイズ:

```text
7.4M
```

## 結果

| item | value |
| --- | ---: |
| selected segments | 6 |
| routes | 3 |
| kept rows | 523 |
| sample_every | 10 |
| image_width | 320 |
| min speed | 5.0 m/s |
| max abs steer | 30.0 deg |

splitごとの行数:

| split | rows | routes | segments |
| --- | ---: | ---: | ---: |
| dev | 227 | 1 | 2 |
| test | 119 | 1 | 2 |
| train | 177 | 1 | 2 |

test/trainの一部segmentは行数が少なめでした。

summaryを見ると、主な理由は速度フィルタです。

たとえば `2018-07-31--20-50-28/6` は、120 candidate framesのうち `speed >= 5.0 m/s` を満たしたのが51 framesで、そのまま51 rowsが残っています。

低速域を除外する今のbaseline方針とは整合しています。

## 同期ずれ

今回もCANの最近傍マッチには明示的なtoleranceを入れています。

```text
sync_tolerance_s = 0.05
```

kept rowsで見るとこうでした。

| metric | speed abs delta | steering abs delta |
| --- | ---: | ---: |
| max | 0.042299 s | 0.034032 s |
| p99 | 0.009207 s | 0.009555 s |

candidate frame全体では、segment端のframeなどで50msを超えるずれもありました。

ただし、それを無条件に使わず、toleranceで落とす設計にしています。

これは以前の「最近傍なら最大40ms程度ずれる可能性がある」という懸念への対策でもあります。

## future path targetの分布

kept rowsのtarget分布です。

| metric | 1s x | 2s x | 3s x | 2s y | 3s y |
| --- | ---: | ---: | ---: | ---: | ---: |
| mean | 22.9928 | 45.8178 | 68.4412 | 0.0202 | 0.0690 |
| p50 | 22.2962 | 44.5991 | 66.8834 | 0.0004 | 0.0044 |
| p95 | 31.6706 | 63.3321 | 94.9536 | 1.1107 | 3.2379 |
| min | 4.3516 | 6.8067 | 7.7023 | -1.0803 | -3.1396 |
| max | 31.7954 | 63.5366 | 95.2147 | 1.3919 | 4.0070 |

高速のdev routeでは3秒後xが約95mまで伸びます。

一方、train/testには低速から加速しているsegmentもあり、3秒後xは短くなります。

これは速度分布を考えると自然です。

## 30 segment pilot

smoke testが通ったので、次に10 segment per split、合計30 segmentでも実行しました。

```bash
python3 ~/e2e_ad_study_work/tools/build_compact_future_path_manifest_from_inventory.py \
  --inventory ~/datasets/comma2k19/manifests/data_v2_inventory_chunk1_2/segment_inventory.csv \
  --out-dir ~/datasets/comma2k19/manifests/data_v2_chunk1_2_compact_pilot30 \
  --temp-dir ~/datasets/comma2k19/tmp \
  --splits train,dev,test \
  --limit-segments-per-split 10 \
  --sample-every 10 \
  --image-width 320
```

出力サイズ:

```text
33M
```

結果:

| item | value |
| --- | ---: |
| selected segments | 30 |
| routes | 5 |
| kept rows | 3131 |

split別:

| split | rows | routes | segments | speed mean | speed p05 | speed p95 | 3s x mean | abs 3s y p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dev | 1131 | 1 | 10 | 28.5219 | 17.9014 | 31.3063 | 86.3427 | 4.0649 |
| test | 938 | 2 | 10 | 23.4737 | 8.8164 | 33.2412 | 71.0704 | 3.6570 |
| train | 1062 | 2 | 10 | 26.2484 | 12.2952 | 32.6132 | 79.4526 | 4.8857 |

filter通過率:

| split | candidate frames | valid CAN | future valid | speed keep | steer keep | kept |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dev | 1202 | 0.9925 | 0.9484 | 1.0000 | 1.0000 | 0.9409 |
| test | 1201 | 0.9983 | 0.9492 | 0.8185 | 1.0000 | 0.7810 |
| train | 1201 | 0.9925 | 0.9484 | 0.9317 | 1.0000 | 0.8843 |

kept rowsの同期ずれ:

| metric | speed abs delta | steering abs delta |
| --- | ---: | ---: |
| max | 0.042299 s | 0.040678 s |
| p99 | 0.009213 s | 0.009391 s |

30 segmentでも、同期ずれはp99で約9msに収まっています。

最大値は40ms台ですが、tolerance 50msの内側です。

また、行数が落ちる主因はCAN同期ではなく、segment末尾で3秒先targetが取れないことと、低速frameを落としていることでした。

## 判断

compact builderのsmoke testは通りました。

確認できたこと:

- segment単位のzip抽出ができる
- 一時展開dirが残らない
- sampled frame decodeができる
- route-disjoint splitを保持できる
- CAN同期toleranceを適用できる
- future path targetが有限で妥当な範囲に入る
- 出力サイズが小さく、反復しやすい

30 segment pilotも通りました。

この時点で、full compact buildへ進めます。

## full build

そのままChunk_1+2の全382 segmentをcompact化しました。

```bash
python3 ~/e2e_ad_study_work/tools/build_compact_future_path_manifest_from_inventory.py \
  --inventory ~/datasets/comma2k19/manifests/data_v2_inventory_chunk1_2/segment_inventory.csv \
  --out-dir ~/datasets/comma2k19/manifests/data_v2_chunk1_2_compact \
  --temp-dir ~/datasets/comma2k19/tmp \
  --splits train,dev,test \
  --sample-every 10 \
  --image-width 320
```

結果:

| item | value |
| --- | ---: |
| selected segments | 382 |
| routes | 42 |
| kept rows | 38062 |
| output size | 437M |
| manifest size | 27M |
| summary size | 204K |
| decoded frame files | 45795 |

split別:

| split | rows | routes | segments | speed mean | speed p05 | speed p95 | abs steer p95 | 3s x mean | abs 3s y p95 | abs 3s y p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dev | 5435 | 4 | 56 | 25.9181 | 8.7213 | 32.9426 | 7.5 | 78.3888 | 3.9890 | 4.6565 |
| test | 6011 | 5 | 59 | 26.6156 | 12.5976 | 32.7677 | 7.4 | 80.6466 | 3.9587 | 4.6573 |
| train | 26616 | 33 | 262 | 25.5161 | 10.2156 | 32.9306 | 8.7 | 77.1949 | 4.3832 | 5.9784 |

kept rowsの同期ずれ:

| metric | speed abs delta | steering abs delta |
| --- | ---: | ---: |
| max | 0.049751 s | 0.049943 s |
| p99 | 0.009409 s | 0.009693 s |

full buildでも、kept rowは50ms tolerance内に収まりました。

p99は約10ms未満です。

filter通過率:

| split | candidate frames | valid CAN | future valid | speed keep | steer keep | kept |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dev | 6964 | 0.9938 | 0.9495 | 0.8290 | 0.9944 | 0.7804 |
| test | 7205 | 0.9971 | 0.9492 | 0.8811 | 0.9996 | 0.8343 |
| train | 31626 | 0.9967 | 0.9492 | 0.8943 | 0.9890 | 0.8416 |

落ちる理由は、主に速度条件とsegment末尾のfuture horizon不足です。

zero-row segmentは5個あり、いずれも現在の条件ではほぼ `speed < 5.0 m/s` で説明できます。

target分布:

| metric | 1s x | 2s x | 3s x | 2s y | 3s y |
| --- | ---: | ---: | ---: | ---: | ---: |
| mean | 26.0004 | 51.9791 | 77.9105 | 0.0224 | 0.0681 |
| p50 | 28.3616 | 56.7145 | 85.0420 | 0.0015 | 0.0037 |
| p95 | 33.2804 | 66.5534 | 99.7811 | 1.2835 | 3.8101 |
| p99 | 34.3015 | 68.5714 | 102.7987 | 1.6750 | 4.9434 |
| p99.9 | 36.1061 | 72.1292 | 108.0813 | 2.9352 | 8.5357 |
| min | 3.9046 | 5.3665 | 5.5438 | -4.1466 | -12.2577 |
| max | 36.9553 | 73.8173 | 110.5951 | 4.6031 | 13.2917 |

3秒後yの最大は13.2917mでした。

該当rowは以下です。

```text
segment: b0c9d2329ad1606b|2018-10-05--22-20-31/7
split: train
frame_idx: 870
speed: 27.45 m/s
steering: -25.2 deg
future_3s_x_m: 79.8972
future_3s_y_m: 13.2917
```

強めのカーブとしてはあり得る値ですが、学習前に画像と軌跡の可視化確認をした方がよさそうです。

## 次にやること

次は、このfull compact datasetをKaggle datasetとしてuploadします。

その後、Study20の設定をData v2に載せ替え、baseline trainingを実行します。
