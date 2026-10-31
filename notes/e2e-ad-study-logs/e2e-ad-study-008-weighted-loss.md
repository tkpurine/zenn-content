---
title: "e2e AD study8: steering bin別のweighted lossを試す"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回のroute holdout評価では、大舵角ほど誤差が大きいことが分かりました。

```text
0-1 deg:    1.2851
1-3 deg:    2.0740
3-5 deg:    3.2191
5-10 deg:   4.6582
10-30 deg: 14.2132
```

今回は、steering angleの絶対値binごとにsample weightを付け、大舵角を少し重く学習してみます。

## weightの作り方

train splitのbin countは以下でした。

```text
0-1:   401
1-3:   263
3-5:   167
5-10:  161
10-30:  38
30+:     0
```

頻度の少ないbinほど重くし、weightは `0.5` から `5.0` にclipしました。

```text
0-1:   0.5137
1-3:   0.7833
3-5:   1.2335
5-10:  1.2795
10-30: 5.0000
30+:   1.0000
```

## 実行条件

```text
device: cpu
pretrained: true
epochs: 5
image_size: 112
weighted_loss: true
train rows: 1030
val rows: 1302
```

## 結果

```text
epoch  train MAE  val MAE
1      2.7390     2.9073
2      2.0778     2.6444
3      1.7529     2.6504
4      1.6004     2.5772
5      1.4371     2.8667
```

final validation MAE:

```text
2.8667 deg
```

best validation MAE:

```text
2.5772 deg at epoch 4
```

前回のunweighted route holdoutは `2.4568 deg` だったので、全体としては悪化しました。

## bin別に見る

```text
bin      unweighted  weighted
0-1      1.2851      1.9579
1-3      2.0740      2.8100
3-5      3.2191      3.4775
5-10     4.6582      4.0439
10-30   14.2132     13.7351
```

大舵角binは少し改善しています。ただし、小舵角側の悪化が大きすぎます。

予測分布は少し広がりました。

```text
unweighted pred steering std: 1.6031 deg
weighted pred steering std:   2.1138 deg
true steering std:            3.8343 deg
```

ただ、真値の分散にはまだ届いていません。

## 判断

今回のweighted lossは採用しません。

大舵角への効果はありますが、全体MAEを悪化させています。weightが強すぎる可能性もありますが、まずは別の方向を試します。

次は、画像だけでなくspeedも入力に入れるbaselineに進みます。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
