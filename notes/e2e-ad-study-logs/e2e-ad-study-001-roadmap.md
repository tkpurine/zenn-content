---
title: "e2e AD study1: 公開モデルから始めるE2E自動運転学習計画"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "colab", "深層学習"]
published: false
---

## はじめに

End-to-End autonomous driving、つまりセンサー入力から走行計画や制御までを学習モデルで扱う自動運転モデルを勉強していきます。

最初から大規模モデルを再現するのは重いので、まずは公開モデルと公開データを使いながら、モデルの中身・学習方法・評価方法を順番に理解する方針にしました。

学習環境は、できるだけColabやKaggle Notebookを使います。CARLAのようなclosed-loopシミュレーションは重いため、最初は公開データ上のopen-loop評価から始めます。

## 目標

最終的には、camera-onlyの小型E2Eモデルを自作し、公開データで評価できる状態を目指します。

大きくは次の順番で進めます。

- E2E自動運転モデルの全体像を理解する
- 公開モデルの構造を読む
- 公開データをColab/Kaggleで扱う
- 小さなbaselineモデルを自作する
- open-loop評価を実装する
- 余力があればCARLAやBench2Driveでclosed-loop評価を試す

## まず見る公開モデル

最初に読む候補は次のモデルです。

- [TCP](https://github.com/OpenDriveLab/TCP): trajectory predictionとcontrol predictionを組み合わせるシンプルで強いbaseline
- [TransFuser](https://github.com/autonomousvision/transfuser): cameraとLiDARをTransformerで融合する代表的なE2Eモデル
- [UniAD](https://github.com/OpenDriveLab/UniAD): perception、prediction、planningを統合するplanning-orientedなモデル
- [VAD](https://github.com/hustvl/VAD): vectorized scene representationを使うE2Eモデル

いきなりUniADやVADに入ると依存関係も概念も重いので、最初はTCPやTransFuserから入るのがよさそうです。

## 使う公開データ

軽い順に試します。

- [comma2k19](https://github.com/commaai/comma2k19): camera-onlyの実装練習に使いやすい
- [nuScenes](https://www.nuscenes.org/): multi-view camera、LiDAR、3D認識、planning系の理解に使える
- [Argoverse 2](https://argoverse.github.io/user-guide/): motion forecastingや地図付きシナリオの理解に使える
- [Waymo Open Dataset](https://waymo.com/open/): 大規模データセット。最初は眺める程度
- [nuPlan](https://www.nuscenes.org/nuplan): planning benchmark

最初の実装は、comma2k19を使ったcamera-onlyモデルにします。

## 最初のbaseline

最初に作るモデルはかなり小さくします。

```text
front camera image
        ↓
ResNet18 encoder
        ↓
MLP
        ↓
future waypoints or steering
```

最初から「画像から直接steering」にしてもよいですが、最近のE2Eモデルの流れを考えると、future waypointsを出してから制御に変換する構成のほうが学びが多そうです。

## 評価

最初はopen-loop評価だけにします。

- waypoint L1 error
- ADE / FDE
- steering MAE
- temporal smoothness
- 予測軌道の可視化
- 動画へのオーバーレイ

closed-loop評価はCARLAやBench2Driveが必要になり、Colab/Kaggleだけでは扱いにくいので後回しにします。

## 直近のTODO

- comma2k19のデータ構造を確認する
- Colabで最小データローダを作る
- 画像、速度、ステアリングを可視化する
- ResNet18 baselineを学習する
- TCPのREADMEと論文を読む

## まとめ

まずは「公開モデルを読む」と「小さな自作モデルを動かす」を並行して進めます。

最初の実装テーマは、comma2k19を使ったcamera-only waypoint predictionです。ここでデータローダ、時系列サンプリング、学習ループ、評価指標、可視化までを一通り作ります。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。

