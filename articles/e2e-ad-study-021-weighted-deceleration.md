---
title: "e2e AD study21: 減速sampleに重みをかけると何が改善するか"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、過去速度系列を入力に追加しました。

全体性能は改善しました。

```text
Study20:
ADE:    0.8825 m
FDE@3s: 1.6890 m
```

一方で、狙っていた強い減速sliceはほぼ解けませんでした。

```text
strong deceleration FDE mean:
7.9292 m -> 7.8243 m
```

top failureを見ると、前走車ありの混雑・車列追従/停止接近に見える場面が多く、true 3s xは短いのにモデルは前方へ長く出していました。

今回は、強い減速/低速sampleへ学習時weightをかけます。

## 実験設定

土台はStudy20です。

```text
image: [t-1.0s, t-0.5s, t]
speed feature: [speed(t-1.0s), speed(t-0.5s), speed(t)]
target: linear-interpolated future XY
loss: smooth L1 + axis/horizon weights
epochs: 5
seed: 42
```

sample weightは学習時だけ使います。
validationのADE/FDEは非weightedのままなので、Study20と同じ指標で比較できます。

weight設計はこうしました。

| condition | weight |
| --- | ---: |
| default | 1.0 |
| speed < 10m/s | 2.0 |
| CAN speed - true avg 3s speed > 1m/s | 2.0 |
| CAN speed - true avg 3s speed > 2m/s | 5.0 |

複数条件に該当した場合は最大weightを使います。

sequence化後のtrain weightはこうなりました。

| sample weight | train rows |
| ---: | ---: |
| 1.0 | 3670 |
| 2.0 | 194 |
| 5.0 | 48 |

## 全体結果

全体平均は悪化しました。

| metric | Study20 | Study21 | diff |
| --- | ---: | ---: | ---: |
| ADE | 0.8825m | 0.9330m | +0.0505m |
| FDE@3s | 1.6890m | 1.8012m | +0.1121m |
| FDE p90 | 3.4611m | 3.6244m | +0.1633m |
| FDE p95 | 4.5872m | 4.5338m | -0.0534m |
| FDE > 3m | 12.86% | 16.54% | +3.69pt |
| FDE > 5m | 3.93% | 3.28% | -0.66pt |

平均とFDE>3m率は悪化しています。

ただし、p95とFDE>5m率は少し改善しています。
tailの一部には効いたが、中程度の失敗が増えた、という見え方です。

## 低速slice

0-10m/sは改善しました。

| metric | Study20 | Study21 | diff |
| --- | ---: | ---: | ---: |
| FDE mean | 2.9019m | 2.4738m | -0.4281m |
| FDE p90 | 6.5191m | 5.9323m | -0.5867m |
| 3s x abs mean | 2.7753m | 2.3304m | -0.4449m |

低速sampleへweightをかける方向自体は効いています。

## 強い減速slice

強い減速sliceも改善しました。

```text
CAN speed - true avg forward speed over 3s > 2m/s
```

| metric | Study20 | Study21 | diff |
| --- | ---: | ---: | ---: |
| FDE mean | 7.8243m | 7.1283m | -0.6959m |
| FDE p90 | 8.9577m | 8.5134m | -0.4442m |
| 3s x abs mean | 7.7476m | 7.0624m | -0.6852m |

ただし、FDE mean 7.1283mはまだかなり大きいです。

「改善はしたが解けていない」という結果です。

## segment別

segment 14は大きく改善しました。

| segment | Study20 FDE | Study21 FDE | diff |
| --- | ---: | ---: | ---: |
| 14 | 3.6463m | 2.9228m | -0.7235m |
| 13 | 2.7305m | 2.8312m | +0.1007m |
| 4 | 1.9283m | 2.0712m | +0.1429m |
| 11 | 1.8862m | 2.0192m | +0.1331m |
| 12 | 1.7695m | 1.9416m | +0.1721m |

segment 14には効きました。

一方で、segment 13や他のsegmentは悪化しました。

## 判断

sample weightingの方向性は有効です。

理由は、狙ったsliceが下がっているからです。

```text
0-10m/s FDE mean:        2.9019m -> 2.4738m
strong decel FDE mean:   7.8243m -> 7.1283m
segment 14 FDE mean:     3.6463m -> 2.9228m
```

ただし、weightが強すぎる、または対象が広すぎる可能性があります。

```text
overall FDE@3s: 1.6890m -> 1.8012m
FDE > 3m:       12.86%  -> 16.54%
```

今回のweightは全targetにかかっています。
つまり、3s x過大予測を抑えたいのに、yや短期horizonにも影響が出ます。

次は、全target sample weightingではなく、3s x residualの過大予測に絞ったlossを試すのがよさそうです。

低速/強い減速sampleで `predicted 3s x > true 3s x` の場合だけ追加penaltyをかける、という方向です。

