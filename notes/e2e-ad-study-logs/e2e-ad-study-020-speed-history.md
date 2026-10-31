---
title: "e2e AD study20: 過去速度系列を入れて減速予測を改善できるか"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、補間targetモデルをseed 0/1/2で再学習し、seedばらつきを確認しました。

全体のばらつきは小さめでした。

```text
Study19 seed sweep:
FDE@3s mean: 1.8491 m
FDE@3s std:  0.0771 m
```

一方で、低速・強い減速sliceは全seedで一貫して悪いままでした。

```text
0-10m/s FDE mean: 3.0311 m
strong deceleration FDE mean: 7.9292 m
```

現在のモデルは画像sequenceを使っていますが、速度入力は現在速度1点だけです。

そこで今回は、過去速度系列を入力に追加します。

## 変更点

Study18/19では、速度特徴は現在速度だけでした。

```text
speed feature:
speed(t)
```

Study20では、画像sequenceと同じ時間幅で速度も渡します。

```text
speed feature:
speed(t-1.0s), speed(t-0.5s), speed(t)
```

画像入力はこれまでと同じです。

```text
image sequence:
frame(t-1.0s), frame(t-0.5s), frame(t)
```

ResNet18 backbone後のfusion部を、`image feature + 1 scalar` から `image feature + 3 scalars` に変えました。

target、loss、epoch、補間manifestはStudy18と同じです。

## 全体結果

全体では改善しました。

| metric | Study18 seed42 | Study19 seed mean | Study20 |
| --- | ---: | ---: | ---: |
| ADE | 0.9540m | 0.9632m | 0.8825m |
| FDE@3s | 1.8321m | 1.8491m | 1.6890m |
| 1s L2 | 0.2055m | 0.2098m | 0.1952m |
| 2s L2 | 0.8244m | 0.8306m | 0.7633m |
| 3s L2 | 1.8321m | 1.8491m | 1.6890m |

Study19 seed平均から見ると、FDE@3sは0.1601m改善しました。

FDE>3m率も改善しています。

| metric | Study18 seed42 | Study19 seed mean | Study20 |
| --- | ---: | ---: | ---: |
| FDE p90 | 3.5895m | 3.6725m | 3.4611m |
| FDE p95 | 4.3676m | 4.5094m | 4.5872m |
| FDE > 3m | 15.97% | 17.47% | 12.86% |
| FDE > 5m | 2.87% | 3.58% | 3.93% |

中程度の失敗は減りました。

ただし、p95とFDE>5m率は悪化気味です。
最悪側のfailureは残っています。

## 低速slice

0-10m/sでは少し改善しました。

| metric | Study19 seed mean | Study20 |
| --- | ---: | ---: |
| FDE mean | 3.0311m | 2.9019m |
| FDE p90 | 7.1884m | 6.5191m |
| 3s x abs mean | 2.9518m | 2.7753m |

ただし、全体FDE@3sの1.6890mと比べるとまだかなり悪いです。

## 強い減速slice

今回一番見たかったのはここです。

```text
CAN speed - true average forward speed over 3s > 2 m/s
```

結果は、ほぼ改善していません。

| metric | Study19 seed mean | Study20 |
| --- | ---: | ---: |
| FDE mean | 7.9292m | 7.8243m |
| FDE p90 | 9.4557m | 8.9577m |
| 3s x abs mean | 7.9109m | 7.7476m |
| FDE > 3m | 100% | 100% |
| FDE > 5m | 100% | 100% |

過去速度系列を入れても、強い減速場面はほぼ解けませんでした。

つまり、過去速度から「すでに減速しているか」は多少読めても、「これから減速すべきか」は読めていない可能性が高いです。

## segment 13/14

問題のsegment 13/14も改善しませんでした。

| segment | Study19 seed mean FDE | Study20 FDE |
| --- | ---: | ---: |
| 14 | 3.6319m | 3.6463m |
| 13 | 2.6886m | 2.7305m |

全体平均が改善したぶん、segment 13/14の悪さはむしろ目立ちます。

## 判断

過去速度系列は全体性能には効きました。

```text
FDE@3s: 1.8491m -> 1.6890m
```

ただし、狙っていた強い減速・segment 13/14の改善は限定的でした。

次は、モデルに単に特徴を足すより、lossやsample weightingで難所を捨てないようにする方を試します。

候補は次のどちらかです。

- 強い減速/低速sliceにsample weightをかける
- 3s x residualの過大予測に効くlossを入れる

その前に、top failureの画像を見て、segment 13/14が車列追従なのか、カーブなのか、別の視覚要因なのかを確認します。

## top failureを見た印象

contact sheetを見ると、top failureはsegment 13/14が中心でした。

画像上は、前走車が近く、交通量が多い車列追従・停止接近に見える場面が多いです。

true軌道は3秒先xが短い一方で、モデルは現在速度を引きずって前方に長く出しています。

この見え方からも、過去速度だけでなく、画像中の前走車・車間を使えるようにする必要がありそうです。

次はまず、強い減速/低速sampleにweightをかけて、既存backboneのまま難所を学習できる余地があるか確認します。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
