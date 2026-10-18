---
title: "e2e AD study7: filtered manifestとroute holdoutで評価を見直す"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、10 segmentのResNet18 steering baselineをKaggleで回しました。

今回は2-route sampleへ広げ、低速時の大舵角を除いたfiltered manifestで再学習します。さらに、segment holdoutとroute holdoutの違いを見ます。

## filtered manifest

2-route sampleは22 segment、2640行でした。

ただし、低速時に大きなsteering angleが含まれていました。

```text
min: -111.8 deg
max: 54.5 deg
```

時刻同期ズレは大きくなかったので、通信途絶というより低速時の実舵角と見ています。

今回は通常走行中のcamera-to-steering baselineを見たいので、以下でfilterしました。

```text
speed_mps >= 5.0
abs(steering_angle_deg) <= 30.0
```

結果:

```text
rows: 2332
train rows: 1852
val rows: 480
```

## segment holdout

まずはsegment holdoutです。

```text
train segments: 18
val segments: 4
device: cpu
pretrained: true
epochs: 5
image_size: 112
```

結果:

```text
epoch  train MAE  val MAE
1      2.5438     2.1782
2      1.6147     2.1661
3      1.3398     2.2515
4      1.1866     2.3164
5      1.0719     2.2657
```

final validation MAE:

```text
2.2657 deg
```

## route holdout

次に、manifest builderへ `--split-strategy route_holdout` を追加しました。

route holdoutでは、1つ目のrouteをtrain、2つ目のrouteをvalidationにします。

```text
train: 2018-07-30--13-44-30  1030 rows
val:   2018-08-03--10-35-16  1302 rows
```

結果:

```text
epoch  train MAE  val MAE
1      2.6148     2.6727
2      1.6698     2.5191
3      1.4133     2.6778
4      1.3102     2.4520
5      1.1762     2.4568
```

final validation MAE:

```text
2.4568 deg
```

segment holdoutより少し悪化しましたが、評価としてはroute holdoutの方が意味があります。

## bin別MAE

route holdoutのbin別MAEです。

```text
0-1 deg:    1.2851
1-3 deg:    2.0740
3-5 deg:    3.2191
5-10 deg:   4.6582
10-30 deg: 14.2132
```

大舵角ほど誤差が大きい傾向は残っています。

予測分布も真値より狭いです。

```text
true steering std: 3.8343 deg
pred steering std: 1.6031 deg
```

まだ直進寄りに潰れています。

## 今回の位置づけ

1 segment内のchronological splitで出ていた `0.46 deg` という数字は、かなり甘い評価でした。

今回のroute holdoutでは `2.46 deg` です。こちらの方が今のbaselineの実力に近い値として扱えます。

次は以下を試します。

- steering bin別にsample weightを入れる
- speedを画像特徴に結合する
- 大誤差segmentを画像で確認する
- 低速・大舵角を別タスクとして扱うか検討する
