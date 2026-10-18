---
title: "e2e AD study5: comma2k19のChunk_1から複数segment manifestを作る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "データセット", "pytorch"]
published: false
---

## はじめに

前回は、複数segmentを扱うためのmanifest builderを作りました。

今回は実際にcomma2k19のraw chunkを取得し、1本のexample segmentではなく、10 segment分の同期済みmanifestを作ります。

ここで確認したいのはモデル精度ではなく、複数segment学習に進むためのデータ作成パイプラインです。

## データ取得

Hugging Faceのcomma2k19 raw dataから `Chunk_1.zip` を取得しました。

```text
Chunk_1.zip: 8.1G
```

zip内は以下のような構造でした。

```text
Chunk_1/<route>/<segment>/
  video.hevc
  global_pose/frame_times
  processed_log/CAN/speed/{t,value}
  processed_log/CAN/steering_angle/{t,value}
```

`video.hevc` を持つsegmentは188個あります。

## まずは10 segmentだけ抽出

いきなり全展開するとディスク使用量が大きいので、まずは10 segmentだけ抽出しました。

```text
extracted size: 488M
segments: 10
```

対象は同じroute内のsegment 6から15です。これは実装確認としては十分ですが、厳密な汎化評価としてはまだ弱いです。

## manifest生成

作成済みの `build_comma2k19_manifest.py` を使います。

```bash
python3 build_comma2k19_manifest.py \
  --root /Users/tkawano/datasets/comma2k19/extracted/chunk1_sample/Chunk_1 \
  --output-root /Users/tkawano/datasets/comma2k19/manifests/chunk1_sample_10seg \
  --sample-every 10 \
  --width 582 \
  --max-delta-sec 0.02 \
  --limit 10
```

出力は以下です。

```text
manifest.csv
manifest_summary.csv
segment_manifests/*.csv
frames/*/frame_*.jpg
```

## 結果

manifestは1200行になりました。

```text
rows: 1200
segments: 10
train rows: 960
val rows: 240
split_strategy: segment_holdout
```

train/validationはframe単位ではなく、segment単位で分けています。これで、前回の「1分segment内で隣接フレームを分けるだけ」の評価よりは少し前進しました。

## 同期ズレ

CAN speedとsteering angleを、画像frame timeへ最近傍同期しています。

今回の10 segmentでは、同期ズレは以下でした。

```text
abs(speed_time_delta) mean: 0.00222 sec
abs(speed_time_delta) p99: 0.00756 sec
abs(speed_time_delta) max: 0.00875 sec

abs(steering_time_delta) mean: 0.00228 sec
abs(steering_time_delta) p99: 0.00753 sec
abs(steering_time_delta) max: 0.00852 sec
```

以前、最大約40msのズレが見えていましたが、これはCANログ開始前の先頭frameを評価対象に含めていた影響でした。

今はCAN speedとsteering angleの両方が存在する同期開始frame以降だけを使っているため、最大でも約9ms未満に収まっています。

## 教師信号の分布

steering angleは以下の分布でした。

```text
mean: -1.1029 deg
std: 4.7367 deg
min: -25.3 deg
p50: -0.1 deg
p95: 5.1 deg
max: 12.8 deg
```

直進に近いframeが多い一方で、片側に大きめのsteeringも含まれています。今後は単純なMAEだけでなく、steering binごとの誤差も見た方がよさそうです。

## ここまでの位置づけ

今回の作業で、example segmentからraw chunkへ進めました。

ただし、今回のvalidationは同じroute内の別segmentです。これを汎化性能として強く主張するのはまだ早いです。

## 短縮学習も通す

最後に、このmanifestを使ってResNet18 baselineを1 epochだけ回しました。

ローカルCPUでの確認なので、224pxでは遅く、`image_size=112` に落としています。また、pretrainedなしのrandom initです。

```text
rows: 1200
train rows: 960
val rows: 240
image_size: 112
device: cpu
train MAE: 2.8786 deg
val MAE: 2.8967 deg
```

この数字はモデル性能としてはまだ見ません。目的は、複数segment manifestから学習、metrics保存、model保存まで通ることの確認です。

次は以下に進みます。

- KaggleまたはGPU環境で、この10 segment manifestをpretrained ResNet18/複数epochで再学習する
- 別routeを含むvalidation splitにする
- steering分布の偏りを見ながら評価指標を追加する
- speedを画像特徴に結合する軽量baselineを試す
