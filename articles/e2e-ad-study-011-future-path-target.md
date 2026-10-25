---
title: "e2e AD study11: steeringではなくfuture pathを予測する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回まで、画像からsteering angleを直接回帰していました。

しかし、大誤差segmentを見ると、単一画像から瞬間steeringを読むのは難しそうでした。そこで今回は、steeringではなくfuture pathをtargetにします。

## targetの作り方

comma2k19には `global_pose/frame_positions` と `global_pose/frame_velocities` があります。

今回はquaternionの解釈に依存しないよう、速度方向からローカル座標を作りました。

```text
current position -> up axis
current velocity projected to tangent plane -> forward axis
up x forward -> left axis
```

このローカル座標で、1/2/3秒後の位置差分を見ます。

targetは以下です。

```text
future_1s_y_m
future_2s_y_m
future_3s_y_m
```

つまり、将来のlateral offsetです。

## targetの性質

steering angleとはかなり相関があります。

```text
train corr(steering, future_1s_y_m): 0.9129
train corr(steering, future_2s_y_m): 0.8850
train corr(steering, future_3s_y_m): 0.8521

val corr(steering, future_1s_y_m): 0.8232
val corr(steering, future_2s_y_m): 0.7986
val corr(steering, future_3s_y_m): 0.7742
```

steering直接回帰の代替targetとしては妥当に見えます。

## 学習

モデルはResNet18 + speed fusionです。

```text
image -> ResNet18 backbone
speed_mps -> normalized scalar
[image feature, speed] -> MLP -> future lateral offsets
```

Kaggle Kernel:

```text
taikikawano/e2e-ad-study11-future-path-resnet18
```

## 結果

```text
epoch  1s MAE  2s MAE  3s MAE  mean
1      0.2244  0.8826  1.9266  1.0112
2      0.2266  0.8523  1.8966  0.9918
3      0.1999  0.7536  1.6500  0.8679
4      0.2255  0.8426  1.8514  0.9732
5      0.1903  0.7266  1.6200  0.8456
```

final MAE:

```text
1s lateral: 0.1903 m
2s lateral: 0.7266 m
3s lateral: 1.6200 m
mean:       0.8456 m
```

## naive baselineとの比較

zero lateralを常に予測するbaseline:

```text
1s lateral: 0.2031 m
2s lateral: 0.7671 m
3s lateral: 1.6793 m
mean:       0.8832 m
```

train meanを常に予測するbaseline:

```text
1s lateral: 0.2182 m
2s lateral: 0.8347 m
3s lateral: 1.8433 m
mean:       0.9654 m
```

モデルはnaive baselineより良いです。ただし、改善幅はまだ小さいです。

## 判断

future path targetは作れました。steeringとも相関が高く、targetとしては良さそうです。

一方で、今のデータは直進が多く、zero lateral baselineがかなり強いです。

次はfuture path予測の可視化と、3秒先lateralの大誤差segment確認を進めます。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
