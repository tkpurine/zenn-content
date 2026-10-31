---
title: "e2e AD study9: speedを画像特徴に結合する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回はsteering bin別のweighted lossを試しましたが、全体としては悪化しました。

今回は別の方向として、画像特徴にCAN speedを結合します。

## なぜspeedを入れるか

steeringとspeedの単純相関は弱いです。

```text
train corr(speed, steering): -0.0872
val corr(speed, steering):   -0.0925
```

それでも、同じ舵角でも速度によって意味は変わります。そこで、画像だけのResNet18 baselineにspeedを1次元特徴として追加します。

## モデル

構成はシンプルです。

```text
image -> ResNet18 backbone -> image feature
speed_mps -> train mean/stdで正規化 -> scalar feature
[image feature, speed feature] -> MLP head -> steering angle
```

speedの正規化値:

```text
speed_mean: 24.3060 m/s
speed_std: 7.5529 m/s
```

## 実行条件

```text
device: cpu
pretrained: true
epochs: 5
image_size: 112
train rows: 1030
val rows: 1302
```

## 結果

```text
epoch  train MAE  val MAE
1      2.7902     2.5202
2      1.7215     2.4867
3      1.3638     2.3466
4      1.2806     2.3139
5      1.0831     2.4012
```

final validation MAE:

```text
2.4012 deg
```

best validation MAE:

```text
2.3139 deg at epoch 4
```

画像のみのroute holdout baselineは `2.4568 deg` だったので、全体では少し改善しました。

今回からbest checkpointも保存するようにしました。final epochだけを見ると `2.4012 deg` ですが、best modelとしてはepoch 4の `2.3139 deg` を使えます。

## bin別に見る

```text
bin      image-only  speed-fusion
0-1      1.2851      1.1612
1-3      2.0740      1.7199
3-5      3.2191      2.7486
5-10     4.6582      5.6734
10-30   14.2132     14.4515
```

0-5degでは改善しました。一方で、5deg以上では悪化しています。

speedは通常走行域の補助特徴として効いている可能性がありますが、大舵角問題を解決するものではなさそうです。

## 判断

speed fusionは採用候補です。weighted lossよりは良い結果でした。

ただし、大舵角binの改善には別アプローチが必要です。

次は大誤差segmentの画像を確認し、5deg以上のbinが崩れる原因を見ます。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
