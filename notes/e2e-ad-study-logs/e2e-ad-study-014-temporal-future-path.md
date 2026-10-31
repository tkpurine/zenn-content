---
title: "e2e AD study14: 過去フレームを入れるとfuture path予測はどれだけ改善するか"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、train routeを増やすとfuture path予測が改善することを確認しました。

ただし、まだ急なカーブでは外れが残っていました。単一画像 + speedでは、直前の車両運動やカーブ進入中の文脈が不足している可能性があります。

今回は、過去2フレーム + 現在フレームを使う最小の時系列モデルを試します。

## 入力

画像は約0.5秒間隔でsampleされています。

今回は以下の3枚を使います。

```text
t-1.0s
t-0.5s
t
```

3枚のRGB画像をchannel方向に結合し、9ch画像としてResNet18へ入れます。

```text
3 RGB frames -> 9ch image
speed_mps -> normalized scalar
9ch image -> ResNet18 backbone
[image feature, speed] -> MLP
output -> future_1s_y_m, future_2s_y_m, future_3s_y_m
```

ResNet18の最初のconvは、ImageNet pretrainedの3ch重みを3フレーム分に分配して初期化しました。

## データ

5route future path datasetを使いました。

```text
original rows: 5243
sequence rows: 5133
train rows: 3912
val rows: 1221
```

sequence化により、各segmentの先頭2frameは落ちます。

## 結果

```text
epoch  1s MAE  2s MAE  3s MAE  mean
1      0.1653  0.5938  1.3409  0.7000
2      0.1408  0.5152  1.1076  0.5878
3      0.1341  0.4992  1.0664  0.5666
4      0.1362  0.4906  1.1085  0.5784
5      0.1254  0.4557  0.9706  0.5172
```

best epochは5です。

```text
1s lateral: 0.1254 m
2s lateral: 0.4557 m
3s lateral: 0.9706 m
mean:       0.5172 m
```

## 単一画像版との比較

sequence化によりvalidation frameが少し減るため、単一画像版も同じ1221 frameへ絞って比較しました。

| target | single image | temporal | 改善 |
| --- | ---: | ---: | ---: |
| 1s lateral | 0.1639m | 0.1254m | 23.5% |
| 2s lateral | 0.5954m | 0.4557m | 23.5% |
| 3s lateral | 1.3108m | 0.9706m | 26.0% |
| mean | 0.6900m | 0.5172m | 25.0% |

過去フレームを入れる効果はかなり大きいです。

## 誤差分布

3秒先lateral offsetの誤差分布です。

```text
single image:
mean 1.2984m
p90  3.3449m
corr true/pred 0.7550

temporal:
mean 0.9706m
p90  2.5795m
corr true/pred 0.8595
```

平均だけでなく、p90も改善しています。

## segment別

3秒先MAEは多くのsegmentで改善しました。

```text
segment 4:  2.1747 -> 1.6824 m
segment 5:  1.7850 -> 1.2164 m
segment 8:  1.3923 -> 0.7935 m
segment 10: 1.5449 -> 1.2397 m
segment 11: 1.9457 -> 1.6804 m
```

segment 10は特に改善が分かりやすく、カーブ区間の追従がかなり良くなりました。

一方で、segment 5後半の急な左カーブではまだ浅い予測が残っています。

## 判断

future path予測では、単一画像よりも過去フレームを入れる価値が高いです。

次は、yだけでなくx/y両方のfuture pathを予測します。横方向だけでは、前方進行距離や速度方向の誤差を評価できないためです。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
