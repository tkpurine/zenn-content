---
title: "e2e AD study13: route数を増やすとfuture path予測は改善するか"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、future path予測の失敗例を見ました。

2route版では、3秒先lateral offsetの大きなカーブで予測が0m付近に寄っていました。これは、モデル構造の問題だけでなく、train側にカーブ分布が足りない可能性があります。

今回は、同じvalidation routeを使ったまま、train routeを増やして再学習します。

## データ

Chunk_1から5routeを使いました。

```text
train routes: 4
val routes:   1
segments:     52
```

future path target追加後の行数です。

```text
rows: 5243
train rows: 3996
val rows: 1247
```

validation routeは前回と同じ `2018-08-03--10-35-16` です。これにより、2route版と直接比較できます。

## 学習条件

モデルは前回と同じです。

```text
image -> ResNet18 backbone
speed_mps -> normalized scalar
[image feature, speed] -> MLP
output -> future_1s_y_m, future_2s_y_m, future_3s_y_m
```

Kaggle Kernel:

```text
taikikawano/e2e-ad-study12-future-path-5route-resnet18
```

GPU session上限に当たったため、CPUで実行しました。

## 結果

```text
epoch  1s MAE  2s MAE  3s MAE  mean
1      0.1890  0.7058  1.5798  0.8248
2      0.1877  0.7293  1.5424  0.8198
3      0.1751  0.6572  1.4343  0.7555
4      0.1631  0.5907  1.2984  0.6841
5      0.1731  0.6531  1.4428  0.7563
```

best epochは4でした。

## 2route版との比較

| target | 2route | 5route best | 改善 |
| --- | ---: | ---: | ---: |
| 1s lateral | 0.1903m | 0.1631m | 14.3% |
| 2s lateral | 0.7266m | 0.5907m | 18.7% |
| 3s lateral | 1.6200m | 1.2984m | 19.9% |
| mean | 0.8456m | 0.6841m | 19.1% |

route数を増やすだけで、かなり改善しました。

## 誤差分布

3秒先lateral offsetの誤差分布も改善しています。

```text
2route:
mean 1.6200m
p90  4.2660m
max  7.5739m
corr true/pred 0.5695

5route best:
mean 1.2984m
p90  3.3449m
max  6.6367m
corr true/pred 0.7550
```

特にtrue/predの相関が上がりました。

## まだ残る問題

segment 10は大きく改善しました。2route版では予測が0m付近に潰れていましたが、5route版では左右変化をかなり追えるようになりました。

一方で、segment 5や11ではまだ6m級の外れが残っています。急なカーブや変化点では、単一画像 + speedだけでは不足していそうです。

## 次にやること

route追加で改善することは確認できました。

次は、過去数frameを入力に入れる時系列モデルを試します。単一画像ではなく、直前の動きも使えるようにして、急なカーブ前後の予測が改善するかを見ます。
