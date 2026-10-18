---
title: "e2e AD study6: 10 segmentでResNet18 steering baselineを回す"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、comma2k19の `Chunk_1` から10 segment分のmanifestを作りました。

今回はそのmanifestをKaggle Datasetとしてアップロードし、ResNet18でsteering angleを予測するbaselineを回します。

## Kaggle Dataset化

10 segment分のmanifestとJPEG frameをKaggle Datasetにしました。

```text
taikikawano/comma2k19-chunk1-sample-10seg
```

中身は以下です。

```text
manifest.csv
manifest_summary.csv
segment_manifests/
frames/
```

ただし、Kaggle CLIで `--dir-mode zip` を使ったため、Kaggle上では `frames.zip` として配置されます。runner側で展開してから画像を読みます。

## Kaggle実行で詰まったところ

最初のversionはERRORでした。

原因は2つです。

1つ目はDataset mount pathです。想定では `/kaggle/input/comma2k19-chunk1-sample-10seg` でしたが、実際には以下でした。

```text
/kaggle/input/datasets/taikikawano/comma2k19-chunk1-sample-10seg
```

そこで、`/kaggle/input/**/manifest.csv` を探索してDataset rootを決めるようにしました。

2つ目はGPUです。KaggleがTesla P100を割り当てましたが、現在のPyTorch buildは `sm_60` に対応していませんでした。

```text
Tesla P100-PCIE-16GB with CUDA capability sm_60 is not compatible
```

そのため、GPU capabilityが `sm_70` 未満ならCPUへfallbackするようにしました。

## 実行条件

version 2はCOMPLETEしました。

```text
device: cpu
pretrained: true
epochs: 5
image_size: 112
rows: 1200
train rows: 960
val rows: 240
train segments: 8
val segments: 2
```

GPUは使えませんでしたが、ImageNet pretrained weightは使えました。

## 結果

学習履歴です。

```text
epoch  train MAE  val MAE
1      2.7086     3.0738
2      1.7067     3.4565
3      1.4520     3.1523
4      1.1922     2.9062
5      1.1219     2.8298
```

最終validation MAEは以下でした。

```text
2.8298 deg
```

以前、1 segment内のchronological splitではMAEが約0.46degでした。今回それより悪くなっていますが、これは自然です。

前回は同じ1分segment内の近いframeをtrain/validationに分けていました。今回はsegment単位holdoutなので、近傍frame記憶では評価できなくなっています。

## どこで外しているか

segment別に見ると差があります。

```text
segment 8: 2.1931 deg
segment 9: 3.4666 deg
```

真値steeringの絶対値bin別に見ると、大舵角ほど誤差が大きいです。

```text
0-1 deg:   0.9525
1-3 deg:   1.9169
3-5 deg:   4.2340
5-10 deg:  6.3190
10+ deg:  10.1568
```

また、予測分布は真値よりかなり狭くなっていました。

```text
true steering std: 3.8363 deg
pred steering std: 1.2655 deg
```

つまり、モデルが直進寄りの予測に潰れています。これはsteering予測baselineではよく起きる挙動で、MAEだけ見ていると見落としやすいです。

## 次にやること

次は以下を進めます。

- 別routeを含むvalidation splitにする
- steering bin別MAEをtraining scriptの標準出力に入れる
- speedを画像特徴に結合するbaselineを作る
- KaggleでT4など `sm_70` 以上のGPUを使える設定を探る
