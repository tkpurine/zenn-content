---
title: "e2e AD study17: horizon別lossで3秒先の軌道誤差を改善する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、`x residual` headと `y` headを分け、横方向 `y` のloss weightを上げました。

結果としてy MAEは改善しましたが、2秒先・3秒先のx residualが悪化し、2D軌道全体の改善は小さめでした。

```text
Study16:
1s L2:   0.4424 m
2s L2:   0.9338 m
3s L2:   1.9676 m
mean L2: 1.1146 m
```

今回は、長いhorizonの誤差をより強く見るため、horizon別のloss weightを入れます。

## ADE/FDEとして整理する

これまで `mean_l2_m` と `final_3s_l2_m` と呼んでいた指標を、trajectory予測でよく使われる名前へ寄せます。

```text
ADE = average displacement error over 1s/2s/3s
FDE = final displacement error at 3s
```

今回の実験では、実体はこれまでと同じです。

```text
ADE     = mean_l2_m
FDE@3s  = final_3s_l2_m
```

## loss weight

モデルは前回と同じsplit-headです。

```text
9ch temporal image -> ResNet18 backbone
speed_mps -> normalized scalar
[image feature, speed] -> shared trunk
shared trunk -> x residual head -> 1s/2s/3s x residual
shared trunk -> y head          -> 1s/2s/3s y
```

axis weightは前回と同じです。

```text
x: 1.0
y: 1.5
```

今回は、これにhorizon weightを掛けます。

```text
1s: 1.00
2s: 1.25
3s: 1.75
```

targetごとの最終weightはこうなります。

```text
future_1s_x_residual_m: 1.000
future_1s_y_m:          1.500
future_2s_x_residual_m: 1.250
future_2s_y_m:          1.875
future_3s_x_residual_m: 1.750
future_3s_y_m:          2.625
```

## 結果

Kaggleで5 epoch実行しました。

```text
rows: 5133
train rows: 3912
val rows: 1221
best epoch: 5
```

結果です。

```text
1s x MAE: 0.3989 m
1s y MAE: 0.1360 m
2s x MAE: 0.6027 m
2s y MAE: 0.4784 m
3s x MAE: 1.1130 m
3s y MAE: 1.0904 m

1s L2:  0.4636 m
2s L2:  0.9130 m
FDE@3s: 1.8517 m
ADE:    1.0761 m
```

## Study16との比較

| metric | Study16 | Study17 | 改善 |
| --- | ---: | ---: | ---: |
| 1s L2 | 0.4424m | 0.4636m | -4.8% |
| 2s L2 | 0.9338m | 0.9130m | 2.2% |
| FDE@3s | 1.9676m | 1.8517m | 5.9% |
| ADE | 1.1146m | 1.0761m | 3.5% |

1秒先は悪化しましたが、2秒先・3秒先は改善しました。

狙っていた3秒先のx residualも改善しています。

| target | Study16 | Study17 |
| --- | ---: | ---: |
| 1s x MAE | 0.3726m | 0.3989m |
| 2s x MAE | 0.6069m | 0.6027m |
| 3s x MAE | 1.2156m | 1.1130m |

3秒先のyも改善しました。

| target | Study16 | Study17 |
| --- | ---: | ---: |
| 1s y MAE | 0.1391m | 0.1360m |
| 2s y MAE | 0.5084m | 0.4784m |
| 3s y MAE | 1.1529m | 1.0904m |

## segment別に見る

全体平均は改善しましたが、悪いsegmentはまだ残っています。

```text
segment 14:
ADE:    2.1100 m
FDE@3s: 3.8149 m
3s x MAE: 3.7939 m

segment 13:
ADE:    1.7058 m
FDE@3s: 2.8640 m
3s x MAE: 2.7712 m
```

特にsegment 14は、Study16より3秒先のx errorが悪化しました。

つまり、horizon weightは平均的には効いていますが、難しいsegmentを安定して改善できているわけではありません。

## 判断

horizon別loss weightは有効でした。

```text
ADE:    1.1146 -> 1.0761 m
FDE@3s: 1.9676 -> 1.8517 m
```

ただし、単純に長いhorizonを強くするだけでは、1秒先の精度や難所segmentとのトレードオフが出ます。

次はlossをさらに調整する前に、segment 13/14で何が起きているかを可視化します。画像・速度・true/pred trajectoryを並べて、3秒先のx residualが外れる場面を定性的に見たいです。
