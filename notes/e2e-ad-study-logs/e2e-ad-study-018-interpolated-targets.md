---
title: "e2e AD study18: 補間targetで3秒先軌道を再学習する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回はhorizon別loss weightを入れて、3秒先の軌道誤差を少し改善しました。

```text
Study17:
ADE:    1.0761 m
FDE@3s: 1.8517 m
```

ただし、segment 13/14の低速・減速場面で3秒先のxを長く予測しすぎる問題が残りました。

今回はモデルを変える前に、評価targetそのものを確認しました。

## target生成の問題

これまでfuture targetは、指定時刻以上の次frameを使っていました。

```python
future_indices = np.searchsorted(frame_times, frame_times[frame_idx] + horizon_sec)
```

この方法だと、3.0秒ちょうどではなく、3.0秒より少し先のframeをtargetにすることがあります。

今回のvalidationで確認すると、3秒horizonの時刻誤差はp95で約50msありました。

50msは小さく見えますが、速度によっては無視できません。

```text
10 m/s: 約0.5 m
30 m/s: 約1.5 m
```

そこで `global_pose/frame_positions` を時刻線形補間して、正確な1s/2s/3s targetを作りました。

## 補間targetで何が変わったか

旧targetと補間targetを比較すると、3秒先xは平均で1.30m短くなりました。

| horizon | interp - old x mean |
| --- | ---: |
| 1s | -1.1326m |
| 2s | -1.2589m |
| 3s | -1.2974m |

これは旧targetが少し未来側にずれていたことと整合します。

constant-speed baselineも、補間targetではかなり良くなりました。

| metric | old target | interpolated target |
| --- | ---: | ---: |
| baseline ADE | 2.3250m | 1.4047m |
| baseline FDE@3s | 3.3478m | 2.5568m |

一方、旧targetで学習済みのStudy17 predictionを補間targetで評価すると悪化しました。

```text
Study17 on interpolated target:
ADE:    1.8759 m
FDE@3s: 2.5025 m
```

これはモデルが旧target、つまり少し長いxを学習していたためです。

## Study18

Study18では、Study17と同じモデル構成のまま、補間targetで再学習しました。

```text
model: temporal ResNet18 + speed fusion
target: x residual + y
head: x/y split heads
loss: x=1.0, y=1.5, horizon weight 1s=1.0, 2s=1.25, 3s=1.75
epochs: 5
target strategy: linear_interpolation
```

Kaggle datasetには補間manifestを追加しました。
最初は `frames/` ディレクトリがKaggle uploadでskipされ、画像path解決で失敗しました。

そのため、`frames/` の中身を `frames.zip` にして、Kaggle上で次の形に展開されるよう直しました。

```text
frames/<segment_id>/frame_000001.jpg
```

## 結果

Study18の結果です。

| metric | value |
| --- | ---: |
| ADE | 0.9540m |
| FDE@3s | 1.8321m |
| 1s L2 | 0.2055m |
| 2s L2 | 0.8244m |
| 3s L2 | 1.8321m |
| 3s x MAE | 1.0490m |
| 3s y MAE | 1.1599m |

補間target上で比較すると、Study18はbaselineと旧Study17再評価を上回りました。

| model/eval | target | ADE | FDE@3s |
| --- | --- | ---: | ---: |
| constant-speed baseline | interpolated | 1.4047m | 2.5568m |
| old Study17 prediction | interpolated | 1.8759m | 2.5025m |
| Study18 retrain | interpolated | 0.9540m | 1.8321m |

旧targetのStudy17 FDE@3sは1.8517mでした。
ただしtarget定義が違うので、Study18の1.8321mとは直接比較しません。

重要なのは、補間targetで再学習すれば性能が戻り、baselineより明確に良いことです。

## まだ残っている問題

低速・減速場面のfailureは残りました。

速度bin別に見ると、0-10m/sが最も悪いです。

| speed bin | rows | FDE mean | FDE p90 | 3s x abs mean |
| --- | ---: | ---: | ---: | ---: |
| 0-10m/s | 73 | 2.8415m | 6.2357m | 2.7577m |
| 10-20m/s | 218 | 1.7719m | 4.2204m | 1.6034m |
| 20-30m/s | 490 | 1.6464m | 3.1375m | 0.8680m |
| 30+m/s | 440 | 1.9012m | 3.5514m | 0.6922m |

低速binのpose-CAN速度差は平均0.0897m/sでした。

このため、センサー間の速度不一致だけで8-9m級のFDEを説明するのは難しそうです。

特に、現在CAN速度が3秒先の平均前進速度より2m/s以上大きい場面では、FDE meanが7.2843mまで悪化しました。

```text
CAN speed - true avg forward speed over 3s > 2m/s:
rows: 12
FDE mean: 7.2843 m
```

これは減速や車列追従を、現在速度だけでは読めていない可能性が高いです。

## 判断

今後のtrajectory targetは、線形補間targetを標準にします。

理由は次の通りです。

- 1s/2s/3sの意味が正確になる
- constant-speed baselineと物理的に比較しやすい
- 旧targetの50ms先送りによるx方向の上振れを避けられる
- 補間targetで再学習すればbaselineより良い性能が出る

次は、補間targetを固定したうえでseed 0/1/2を回し、性能のばらつきを測ります。

その後、低速・減速binを主要評価指標として固定し、過去速度系列や過去pose deltaを入力に入れる方向を試します。


---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
