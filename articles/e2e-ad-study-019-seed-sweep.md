---
title: "e2e AD study19: seed違いで補間targetモデルの安定性を見る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、future targetを線形補間に変え、Study17と同じ構成を再学習しました。

結果として、補間target上ではbaselineと旧Study17 prediction再評価を上回りました。

```text
Study18:
ADE:    0.9540 m
FDE@3s: 1.8321 m
```

ただし、これはseed 42の単発結果です。

今回はseed 0/1/2で同じ構成を再実行し、改善やfailureがseed依存かどうかを確認します。

## 実験設定

モデルとtargetはStudy18と同じです。

```text
target: linear-interpolated 1s/2s/3s future XY
model: temporal ResNet18 + speed fusion
target head: x residual + y
loss: x=1.0, y=1.5, horizon weight 1s=1.0, 2s=1.25, 3s=1.75
epochs: 5
seeds: 0, 1, 2
```

Kaggleでは、1つのscript内でseed 0/1/2を順番に実行しました。

最初はwrapperから別ファイルのrunnerをimportする形にしましたが、Kaggle script実行時に同梱py fileをimportできず失敗しました。

最終的には、runner本体とseed sweep処理を1つのcode fileにまとめています。

## seed別結果

seed別の結果です。

| seed | ADE | FDE@3s | 1s L2 | 2s L2 | 3s L2 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.9817m | 1.8829m | 0.2159m | 0.8464m | 1.8829m |
| 1 | 0.9188m | 1.7609m | 0.2021m | 0.7934m | 1.7609m |
| 2 | 0.9890m | 1.9036m | 0.2115m | 0.8519m | 1.9036m |

集約するとこうです。

| metric | mean | std | min | max |
| --- | ---: | ---: | ---: | ---: |
| ADE | 0.9632m | 0.0386m | 0.9188m | 0.9890m |
| FDE@3s | 1.8491m | 0.0771m | 1.7609m | 1.9036m |
| 1s L2 | 0.2098m | 0.0071m | 0.2021m | 0.2159m |
| 2s L2 | 0.8306m | 0.0323m | 0.7934m | 0.8519m |

Study18 seed42のFDE@3sは1.8321mでした。

seed 0/1/2の平均1.8491m、標準偏差0.0771mの中に収まっているので、Study18は外れseedではなさそうです。

## 低速binを見る

次に、前回から問題になっている低速binを見ます。

0-10m/sの結果です。

| seed | rows | FDE mean | FDE p90 | FDE p95 | FDE > 3m | FDE > 5m |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 73 | 2.8891m | 6.4188m | 8.3410m | 31.51% | 19.18% |
| 1 | 73 | 2.9722m | 7.5241m | 8.9868m | 35.62% | 17.81% |
| 2 | 73 | 3.2320m | 7.6222m | 8.1046m | 36.99% | 19.18% |

全体FDE@3sの平均は1.8491mですが、0-10m/sでは3.0311mまで悪化します。

seed間のばらつきはありますが、どのseedでも悪いです。

## 強い減速sliceを見る

さらに、現在CAN速度が3秒先の平均前進速度より2m/s以上大きいsliceを見ます。

```text
CAN speed - true average forward speed over 3s > 2 m/s
```

これは、現在速度から見るとこの先かなり減速する場面です。

| seed | rows | FDE mean | FDE p90 | FDE p95 | FDE > 3m | FDE > 5m |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 12 | 8.0085m | 8.9306m | 9.0831m | 100% | 100% |
| 1 | 12 | 7.9633m | 9.9504m | 10.3710m | 100% | 100% |
| 2 | 12 | 7.8159m | 9.4860m | 9.6316m | 100% | 100% |

これはかなりはっきりしています。

全seedでFDE>5m率が100%です。

つまり、強い減速場面はseedの問題ではなく、現在の入力とモデルでは一貫して読めていません。

## segment別

worst segmentもseed間でほぼ同じでした。

| seed | worst segment | FDE mean | second worst | FDE mean |
| ---: | --- | ---: | --- | ---: |
| 0 | 14 | 3.3940m | 13 | 2.7906m |
| 1 | 14 | 3.9355m | 13 | 2.4889m |
| 2 | 14 | 3.5661m | 13 | 2.7864m |

segment 13/14はどのseedでもworst上位に残ります。

これも、単なるseed運ではなく、データ・入力特徴・モデル構造の問題として扱うべきです。

## 判断

全体指標のseedばらつきは小さめでした。

```text
FDE@3s mean: 1.8491 m
FDE@3s std:  0.0771 m
```

そのため、補間target + Study18構成を現時点の安定baselineとして固定します。

一方で、低速・強い減速sliceはseedによらず悪いです。

次の改善では、全体ADE/FDEだけでなく次のsliceを必ず見るようにします。

- 0-10m/s FDE mean / p90 / FDE>3m
- `CAN speed - true avg forward speed over 3s > 2m/s` のFDE mean
- segment 13/14のFDE mean

モデル側の次の候補は、過去速度系列または過去pose deltaを入力に追加することです。

現在速度だけでは、この先の減速を読めません。
少なくとも過去1秒程度の速度変化を入れて、車列追従や停止接近を拾えるかを試します。


---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
