---
title: "e2e AD study15: future pathのxは速度からの残差として予測する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、過去フレームを入れることでfuture pathの横方向予測が大きく改善しました。

今回は、横方向 `y` だけでなく、前方方向 `x` も含めた2D軌道点を予測します。

## 直接x/yを予測してみた

まず、1/2/3秒先の `x/y` を直接予測しました。

```text
future_1s_x_m
future_1s_y_m
future_2s_x_m
future_2s_y_m
future_3s_x_m
future_3s_y_m
```

結果は良くありませんでした。

```text
direct XY:
1s L2: 2.2415 m
2s L2: 4.2559 m
3s L2: 6.5526 m
```

現在速度を維持すると仮定しただけのbaselineにも負けました。

```text
constant speed + zero y:
1s L2: 1.4465 m
2s L2: 2.1808 m
3s L2: 3.3478 m
```

`future_x` は現在速度だけでかなり説明できます。なので、絶対値を直接学習するのは筋が悪そうです。

## residualにする

そこで、`x` は現在速度からの残差として予測します。

```text
future_1s_x_residual_m = future_1s_x_m - speed_mps * 1
future_2s_x_residual_m = future_2s_x_m - speed_mps * 2
future_3s_x_residual_m = future_3s_x_m - speed_mps * 3
```

モデルの出力は以下です。

```text
future_1s_x_residual_m
future_1s_y_m
future_2s_x_residual_m
future_2s_y_m
future_3s_x_residual_m
future_3s_y_m
```

prediction時に、以下で `x` へ戻します。

```text
pred_future_x_m = speed_mps * horizon_sec + pred_x_residual_m
```

## 結果

residual版の結果です。

```text
1s x MAE: 0.4010 m
1s y MAE: 0.1567 m
2s x MAE: 0.5888 m
2s y MAE: 0.6037 m
3s x MAE: 1.0710 m
3s y MAE: 1.2986 m

1s L2: 0.4756 m
2s L2: 0.9852 m
3s L2: 1.9744 m
```

constant speed baselineとの比較です。

| horizon | constant speed | residual model | 改善 |
| --- | ---: | ---: | ---: |
| 1s | 1.4465m | 0.4756m | 67.1% |
| 2s | 2.1808m | 0.9852m | 54.8% |
| 3s | 3.3478m | 1.9744m | 41.0% |

direct XYと比べると、かなり改善しました。

| horizon | direct XY | residual XY | 改善 |
| --- | ---: | ---: | ---: |
| 1s | 2.2415m | 0.4756m | 78.8% |
| 2s | 4.2559m | 0.9852m | 76.8% |
| 3s | 6.5526m | 1.9744m | 69.9% |

## 残った問題

一方で、y-onlyのモデルと比べると横方向の精度は落ちています。

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

6 targetを同時に学習したことで、横方向の性能が犠牲になっていそうです。

## 次にやること

`x` はresidualとして扱う方が良いことは確認できました。

次は、x residual headとy headを分けるか、loss weightを調整します。また、best checkpointを物理的な2D L2で選べるようrunnerも直します。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
