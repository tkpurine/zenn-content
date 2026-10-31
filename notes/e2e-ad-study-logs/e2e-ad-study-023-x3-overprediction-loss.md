---
title: "e2e AD study23: 3秒先xの過大予測だけを罰すると改善するか"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、loss調整を続けすぎず、次はData v2と評価v2へ進む方針を整理しました。

ただし、その前に1つだけ診断実験を入れることにしました。

Study21では、低速・減速sampleへweightをかけると狙ったsliceは改善しました。

一方で、sample全体のweightなので、3秒先xだけでなくy方向や短期horizonにも影響し、全体FDEは悪化しました。

今回は、3秒先xの過大予測だけへ追加penaltyをかけます。

## 実験設定

土台はStudy20です。

```text
image: [t-1.0s, t-0.5s, t]
speed feature: [speed(t-1.0s), speed(t-0.5s), speed(t)]
target: linear-interpolated future XY
x target: current speedからのresidual
loss: smooth L1 + axis/horizon weights
epochs: 5
seed: 42
```

追加したpenaltyはこうです。

```text
x3_error = pred_future_3s_x_residual - true_future_3s_x_residual
penalty = smooth_l1(relu(x3_error), 0)
loss = base_loss + 0.25 * penalty
```

つまり、モデルが3秒先xを真値より長く出した場合だけ罰します。

このpenaltyは全sampleにはかけません。

低速または減速sampleだけを対象にしました。

| condition | x3 penalty weight |
| --- | ---: |
| default | 0.0 |
| speed < 10m/s | 0.5 |
| speed - future_3s_x / 3 > 1m/s | 1.0 |
| speed - future_3s_x / 3 > 2m/s | 2.0 |

sequence化後のtrain rowsはこうでした。

| x3 penalty weight | train rows |
| ---: | ---: |
| 0.0 | 3670 |
| 0.5 | 89 |
| 1.0 | 105 |
| 2.0 | 48 |

validation metricはこれまで通り非weightedです。

## 全体結果

結果として、Study23は採用できる改善ではありませんでした。

| study | ADE | FDE@3s | p95 | FDE>3m | FDE>5m | x3 over mean | x3 over rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Study20 | 0.8825 | 1.6890 | 4.5872 | 12.86% | 3.93% | 0.7849 | 65.85% |
| Study21 | 0.9330 | 1.8012 | 4.5338 | 16.54% | 3.28% | 0.8550 | 69.70% |
| Study23 | 1.0133 | 1.9242 | 4.2082 | 16.54% | 2.70% | 0.9146 | 77.89% |

p95とFDE>5mは改善しました。

しかし、平均ADE/FDEとFDE>3mは悪化しました。

さらに、抑えたかったx3過大予測のoverall平均と発生率も悪化しました。

## 低速slice

低速sliceでは一部のtail指標は改善しました。

| study | rows | FDE@3s | p90 | p95 | FDE>3m | FDE>5m | x3 err mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Study20 | 73 | 2.9019 | 6.5191 | 7.9093 | 36.99% | 19.18% | 1.5075 |
| Study21 | 73 | 2.4738 | 5.9323 | 6.7324 | 32.88% | 16.44% | 0.8924 |
| Study23 | 73 | 2.8586 | 6.6178 | 8.3832 | 31.51% | 15.07% | 1.3802 |

FDE>3mとFDE>5mはStudy20より下がりました。

一方でFDE平均はStudy20とほぼ同程度で、Study21ほどは改善していません。

## 強い減速slice

強い減速sliceも、まだ解けていません。

```text
speed - future_3s_x / 3 > 2m/s
```

| study | rows | FDE@3s | p90 | p95 | FDE>3m | FDE>5m | x3 err mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Study20 | 12 | 7.8243 | 8.9577 | 8.9734 | 100.00% | 100.00% | 7.7476 |
| Study21 | 12 | 7.1283 | 8.5134 | 8.5844 | 100.00% | 100.00% | 7.0624 |
| Study23 | 12 | 7.4708 | 8.9895 | 9.2353 | 100.00% | 83.33% | 7.3527 |

FDE>5mは少し改善しました。

しかし、FDE平均は7.4708mでまだ大きく、Study21より悪いです。

## 学習曲線

best epochは4でした。

| epoch | train loss | train base loss | train x3 penalty | val ADE | val FDE@3s |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.7155 | 0.5633 | 0.6085 | 1.2111 | 2.3406 |
| 2 | 0.3447 | 0.3112 | 0.1342 | 1.0479 | 2.0458 |
| 3 | 0.2410 | 0.2203 | 0.0829 | 1.0361 | 1.9909 |
| 4 | 0.1866 | 0.1767 | 0.0396 | 1.0133 | 1.9242 |
| 5 | 0.1565 | 0.1411 | 0.0615 | 1.0371 | 2.0244 |

train側のx3 penaltyは下がっています。

つまり、実装したloss自体は効いています。

ただし、validationではStudy20を超えられませんでした。

## 解釈

今回の結果から、少なくとも今の52 segment dev setでは、3秒先xの過大予測だけを罰するlossは採用しません。

理由は単純です。

狙ったtailの一部は下がりましたが、全体の軌道予測が壊れています。

```text
Study20 FDE@3s: 1.6890m
Study23 FDE@3s: 1.9242m
```

さらに、overallのx3 over rateも悪化しました。

小さいsliceのためのlossが、共有表現を動かしすぎている可能性があります。

現時点では、lossだけで減速場面を解くより、データと評価を広げるべきです。

## 判断

Study23は採用しません。

現在の基準モデルは引き続きStudy20です。

```text
ADE:    0.8825 m
FDE@3s: 1.6890 m
```

Study21とStudy23は失敗ではなく、診断として使います。

- 低速・減速sampleには学習可能な信号がある
- ただし、現行dev routeに合わせたloss tuningでは汎化の判断ができない
- 強い減速sliceは12行しかなく、ここに合わせると過学習しやすい

## 次にやること

ここで現行5-route系列のloss tuningは止めます。

次はモデルをいじる前に、Data v2とEvaluation v2へ進みます。

1. 現行5-route実験をfreezeする
2. comma2k19のroute/date/vehicle inventoryを作る
3. 300-500 segmentのroute-disjoint splitを作る
4. Study20相当のbaselineを再実行する
5. strong decel、stop approach、low-speed followingをepisode単位で評価する

次の実装作業は、lossではなくsplit generatorと評価基盤です。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
