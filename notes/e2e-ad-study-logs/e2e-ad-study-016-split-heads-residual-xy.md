---
title: "e2e AD study16: x残差とyのheadを分けて2D軌道予測を改善する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、future pathの `x` を直接予測せず、現在速度からの残差として予測すると2D軌道誤差が大きく改善することを確認しました。

ただし、横方向 `y` の精度は、y-onlyモデルより悪化していました。

```text
y-only:
1s y MAE: 0.1254 m
2s y MAE: 0.4557 m
3s y MAE: 0.9706 m

residual XY:
1s y MAE: 0.1567 m
2s y MAE: 0.6037 m
3s y MAE: 1.2986 m
```

6 targetを1つのheadで同時に出しているため、横方向の表現が犠牲になっている可能性があります。

今回は、shared backboneの後で `x residual` headと `y` headを分けます。

## モデル

入力は前回と同じです。

```text
t-1.0s, t-0.5s, t -> 9ch image
speed_mps -> normalized scalar
```

出力headだけを分けました。

```text
9ch temporal image -> ResNet18 backbone
speed_mps -> normalized scalar
[image feature, speed] -> shared trunk
shared trunk -> x residual head -> 1s/2s/3s x residual
shared trunk -> y head          -> 1s/2s/3s y
```

出力は以下の順序へ戻します。

```text
future_1s_x_residual_m
future_1s_y_m
future_2s_x_residual_m
future_2s_y_m
future_3s_x_residual_m
future_3s_y_m
```

`x` はprediction時に復元します。

```text
pred_future_x_m = speed_mps * horizon_sec + pred_x_residual_m
```

## loss

横方向を少し優先するため、loss weightを入れました。

```text
x: 1.0
y: 1.5
```

また、best checkpointはvalidation lossではなく、復元後の物理XY mean L2で選びます。

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
1s x MAE: 0.3726 m
1s y MAE: 0.1391 m
2s x MAE: 0.6069 m
2s y MAE: 0.5084 m
3s x MAE: 1.2156 m
3s y MAE: 1.1529 m

1s L2: 0.4424 m
2s L2: 0.9338 m
3s L2: 1.9676 m
mean L2: 1.1146 m
```

## single-headとの比較

前回のsingle-head residual XYと比較します。

| horizon | single head | split heads | 改善 |
| --- | ---: | ---: | ---: |
| 1s L2 | 0.4756m | 0.4424m | 7.0% |
| 2s L2 | 0.9852m | 0.9338m | 5.2% |
| 3s L2 | 1.9744m | 1.9676m | 0.3% |
| mean L2 | 1.1451m | 1.1146m | 2.7% |

改善は小さいですが、全体としては良くなりました。

横方向だけを見ると、改善はもう少し明確です。

| horizon | single head | split heads | 改善 |
| --- | ---: | ---: | ---: |
| 1s y MAE | 0.1567m | 0.1391m | 11.2% |
| 2s y MAE | 0.6037m | 0.5084m | 15.8% |
| 3s y MAE | 1.2986m | 1.1529m | 11.2% |

head分離とy loss weightは効いています。

## まだy-onlyには届かない

ただし、y-onlyモデルにはまだ届いていません。

| horizon | y-only | split heads |
| --- | ---: | ---: |
| 1s y MAE | 0.1254m | 0.1391m |
| 2s y MAE | 0.4557m | 0.5084m |
| 3s y MAE | 0.9706m | 1.1529m |

特に3秒先では、y-onlyより18.8%悪いです。

## 何が起きているか

今回、yは改善しました。一方で、x residualは2秒先と3秒先で悪化しました。

```text
x MAE:
1s: 0.4010 -> 0.3726 m
2s: 0.5888 -> 0.6069 m
3s: 1.0710 -> 1.2156 m
```

つまり、split head化による改善は主に横方向で出ています。mean L2の改善幅が小さいのは、長いhorizonのx residual悪化で相殺されたためです。

segment別に見ると、悪いsegmentでは3秒先のx residualが大きく外れるケースがありました。

```text
segment 14:
3s x MAE: 3.5552 m
3s L2:    3.5894 m

segment 13:
3s x MAE: 2.7130 m
3s L2:    2.8866 m
```

## 判断

split head + y loss weightは有効でした。

ただし、これだけでは大きな改善にはなりません。今のボトルネックは、3秒先の `x residual` と、y-onlyからまだ落ちている横方向精度です。

次は、horizonごとのloss weightを入れるか、`x` のtarget表現をもう少し見直します。たとえば、3秒先のx residualを強める、あるいは速度変化・加速度に近いtargetへ変える方向です。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
