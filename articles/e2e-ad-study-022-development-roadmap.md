---
title: "e2e AD study22: loss調整の次に何を検証するか"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

ここまで、comma2k19を使って小型のE2E trajectory prediction modelを段階的に作ってきました。

現在のモデルは、過去1秒の画像と速度系列から1秒、2秒、3秒先のXY軌道を予測します。

Study20では、補間target、x residual、split heads、horizon weight、過去速度系列を組み合わせ、次の結果になりました。

```text
ADE:        0.8825 m
FDE@3s:     1.6890 m
FDE > 3m:  12.86%
FDE > 5m:   3.93%
```

一方で、強い減速場面のFDEは7.8243mありました。

Study21では減速sampleへ重みをかけ、強い減速FDEを7.1283mまで下げましたが、全体FDEは1.8012mへ悪化しました。

この結果から、次もlossの重みだけを調整するのか、それともデータや評価方法を変えるのかを整理します。

## 現在のモデルの位置づけ

現状は、camera-first E2E modelの中でも、off-policy behavior cloningの小型baselineです。

```text
past images + speed history
        ↓
ResNet18
        ↓
future XY trajectory
```

Tesla、Wayve、comma.aiもcamera/videoからmotion planを学習する方向ですが、実際の開発では次の要素を持っています。

- 大規模なfleet data
- 複数cameraまたは長い時系列
- navigation intent
- multi-task learning
- simulatorやworld modelでのclosed-loop学習
- fleet replay、HIL、実車を含む評価

今回のモデルは、このうち「人間が実際に走った軌道を画像から予測する」部分を小さく実装したものです。

## ここまでで得られたもの

モデルの数値以上に、評価基盤を作れたことが重要でした。

- video、CAN、poseの同期
- route単位holdout
- future trajectory target
- 3秒先target時刻の線形補間
- ADE/FDEとtail metric
- 速度・減速・segment別slice
- seed違いの再現性
- 失敗sampleの画像・軌道可視化

特に、future target生成に約50msの先送りがあり、旧targetの3秒先xが平均約1.3m長かった問題を修正できました。

また、低速failureは単純なCAN速度精度の問題ではなく、モデルが将来の減速を読めず、3秒先xを長く予測していることも確認しました。

## 今の評価を続けすぎない理由

現在のデータは52個の1分segmentです。

```text
train: 40 segments
validation: 12 segments
routes: 5
```

同じvalidation routeを複数のモデル選択に使ってきたため、このrouteは既にtestではなくdevelopment setです。

さらに、強い減速sliceは12行しかありません。
隣接frameのtargetも重なるため、12件の独立した運転場面があるわけではありません。

このままsegment 13/14が改善するようにlossを調整し続けると、未知routeでは再現しない可能性があります。

そこで、現在のdatasetではあと1つだけ診断実験を行い、その後はdata/evaluation v2へ移ります。

## 直近のStudy23

Study21ではsample weightが全targetへかかり、3秒xだけでなくyや短期horizonにも影響しました。

次は、低速・減速sampleの3秒x過大予測だけへ追加penaltyをかけます。

```text
error_x3 = predicted_x3 - true_x3
penalty = relu(error_x3)
```

つまり、減速すべき場面でモデルが前方へ長く出した場合だけ罰します。

確認する点は次の3つです。

- 強い減速FDEが改善するか
- Study21ほど全体FDEを悪化させないか
- y方向の誤差へ波及しないか

この実験後、現在のvalidation routeに対するloss tuningは停止します。

## Data v2

次の中心作業は、モデルではなくdataset splitです。

comma2k19全体は2019個の1分segment、約33時間あります。

まず300から500 segmentへ広げ、次の3 splitをroute単位で作ります。

| split | 用途 |
| --- | --- |
| train | parameter fitting |
| development | architectureとloss選択 |
| test | milestone終了時だけ評価 |

同じrouteのsegmentは複数splitへ跨がせません。

また、comma2k19にはRAV4とCivicのデータがあるため、通常のroute holdoutに加えてvehicle transferも評価します。

```text
train RAV4 -> test Civic
train Civic -> test RAV4
```

停止・発進・低速追従を学ぶため、最終datasetではspeed 5m/s未満の一律除外もやめます。

## 評価v2

行単位の平均だけでなく、連続した運転episodeを評価単位にします。

対象episodeは次のようなものです。

- strong deceleration
- stop approach
- restart
- low-speed following
- curve entry
- lane-change-like motion
- FDEが連続して悪化する区間

主要metricはADE/FDEに加えて、p95/p99、しきい値超過率、jerk、curvature、route別結果を使います。

モデル比較は3 seedsで行い、routeまたはepisode単位のbootstrap confidence intervalを出します。

## 目標モデル

comma2k19側の最終候補は、次のような小型motion plannerです。

```text
front video: past 2s, 5Hz
        ↓
FastViT / ConvNeXt-Tiny
        ↓
temporal Transformer
        + speed / acceleration history
        ↓
multi-hypothesis trajectory
        ↓
x, y, speed up to 5s
```

現在の3画像9ch結合を、frameごとのshared encoderとtemporal moduleへ変更します。

また、1本の平均軌道だけでなく、複数のtrajectoryとconfidenceを出す構成を試します。

ただしcomma2k19には一般的なnavigation commandがありません。
このため、このモデルの到達点は高速道路向けcamera-first motion plannerとします。

## closed-loop track

市街地やnavigationを含むE2E drivingは、Wayveが公開しているMILEとCARLAで別に学びます。

MILEはworld modelとdriving policyを組み合わせ、公開checkpointをCARLAで評価できます。

ここで確認したいのは、open-loop trajectory errorとclosed-loop driving scoreの違いです。

closed-loopでは次を評価します。

- route completion
- collision
- lane departure
- traffic-rule violation
- initial positionずれからの復帰
- frame/action noiseからの復帰
- steering/longitudinal jerk

comma.aiの公開研究でも、off-policy trajectory errorが良いモデルがclosed-loop testでは失敗する例が示されています。

そのため最終モデルは、ADE/FDEだけでは採用しません。

## 今後の順序

実施順は次の通りです。

1. 3秒x過大予測に限定したStudy23
2. 現行5-route系列をfreeze
3. comma2k19のroute/date/vehicle inventory
4. 300-500 segmentのData v2
5. episode単位のEvaluation v2
6. Study18/20/22を3 seedsで再評価
7. temporal Transformer比較
8. multi-hypothesis trajectory
9. Wayve MILEをCARLAで評価
10. 自作policyのclosed-loop接続

## おわりに

ここまでの実験で、画像と速度履歴からfuture trajectoryを学習できることは確認できました。

一方、現在の課題はResNet18の表現力だけではありません。

- データ分布が狭い
- validationを繰り返し見ている
- 強い減速episodeが少ない
- open-loopしか見ていない

次の段階では、lossを細かく調整するより、未知routeで再現するか、そして自分の誤差から復帰できるかを検証します。

これにより、小さなtrajectory predictorから、評価可能なE2E driving policyへ段階的に進めます。

## 参考

- [Tesla AI](https://www.tesla.com/AI)
- [Wayve: Emerging behaviour of our driving intelligence](https://wayve.ai/thinking/emerging-behaviour-of-our-driving-intelligence-with-end-to-end-deep-learning/)
- [Wayve MILE](https://github.com/wayveai/mile)
- [openpilot 0.11](https://blog.comma.ai/011release/)
- [Learning to Drive from a World Model](https://arxiv.org/abs/2504.19077)
- [comma2k19](https://github.com/commaai/comma2k19)
