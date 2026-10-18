---
title: "e2e AD study10: 大誤差segmentを画像と時系列で見る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、画像特徴にspeedを結合するbaselineを試しました。

全体MAEは少し改善しましたが、5deg以上のsteering binは悪化しました。

今回は、大誤差segmentを画像と時系列で確認します。

## 対象

対象は以下のsegmentです。

```text
b0c9d2329ad1606b|2018-08-03--10-35-16/14
```

speed fusionでのsegment MAEは以下でした。

```text
5.8009 deg
```

## 大誤差frame

誤差上位は以下です。

```text
frame_idx  speed_mps  true_deg  pred_deg  abs_error
1          6.3        25.6       0.3      25.3
411        6.2        26.2       1.3      24.9
11         7.2        25.6       1.1      24.5
21         8.0        13.4      -1.4      14.8
31         8.7        13.4      -1.2      14.6
421        6.5        16.3       1.7      14.6
```

画像を見ると、単一フレームだけでは25deg級のsteeringが必要な状況には見えにくいです。

## 時系列で見る

true steeringには急な山が2回あります。

- segment sample開始直後
- 約20秒付近

一方で、predictionはほぼ0deg付近に留まっています。

つまり、モデルは「曲がるべき状況」を画像1枚から読み切れていません。

## 考えられる原因

いくつか可能性があります。

- lane changeやmergeの途中で、過去の動きが必要
- steering angleは瞬間的な制御量なので、画像1枚から直接回帰するtargetとして不安定
- 人間の操作や制御器の履歴が効いていて、現在画像だけでは決まらない
- waypointやfuture trajectoryをtargetにした方が安定する可能性がある

## 次にやること

sample weightingやspeed fusionだけでは、大舵角binの問題は解けなさそうです。

次は、manifestにfuture path / curvature系のtargetを追加できるか調べます。
