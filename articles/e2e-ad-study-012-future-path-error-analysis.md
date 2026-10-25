---
title: "e2e AD study12: future path予測の失敗例を可視化する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

## はじめに

前回は、steering angleの代わりにfuture pathを予測しました。

1/2/3秒先のlateral offsetをtargetにして、3秒先のMAEは約1.62mでした。zero lateral baselineよりは良かったものの、改善幅は小さめでした。

今回は、3秒先lateral offsetの失敗例を可視化します。

## 全体統計

validationは1247 frameです。

```text
mean abs error 3s:   1.6200 m
median abs error 3s: 0.9275 m
p90 abs error 3s:    4.2660 m
p95 abs error 3s:    5.1064 m
max abs error 3s:    7.5739 m
corr true/pred 3s:   0.5695
```

平均だけ見ると1.62mですが、p90は4.27mあります。つまり、普通のframeではそこそこ合う一方で、大きく外す区間があります。

## segment別に見る

3秒先lateral offsetのsegment平均誤差上位です。

```text
segment 10: 2.6825 m
segment 4:  2.5119 m
segment 8:  2.2382 m
segment 11: 2.2354 m
segment 5:  2.1104 m
```

segment 5と10を時系列で見ると、真値は数m単位で大きく曲がります。しかし予測は0m付近に寄りがちでした。

## 大誤差frame

誤差上位は以下です。

```text
segment  frame  speed  steering  true_3s_y  pred_3s_y  error
5        1112   33.6   -6.9      -6.85      0.72       7.57
5        962    33.7   -10.6     -7.54     -0.38       7.16
5        1052   33.7   -7.2      -6.54      0.31       6.85
4        901    34.8   -7.0      -6.74      0.10       6.84
4        891    34.9   -4.9      -6.71      0.10       6.81
10       312    28.4   -7.8      -6.42      0.35       6.77
```

画像を確認すると、左カーブや車線形状の変化があるframeで外しています。

## 何が起きていそうか

散布図で見ると、真値は `-6m` から `+5m` くらいまで広がっています。一方で、予測はそれより狭い範囲に収まります。

segment別の標準偏差でも同じ傾向でした。

```text
segment 10 true std: 4.0933, pred std: 1.3604
segment 5  true std: 2.8173, pred std: 0.6529
```

つまり、モデルは曲がり量を浅く見積もっています。

今のデータは直進が多く、zero lateral baselineが強いです。そのため、モデルも「大きく曲がる」と強く予測するより、0m付近へ寄せる方に倒れているように見えます。

## 次にやること

future path target自体は使えそうです。ただし、2routeだけではカーブの分布が足りません。

次は、Chunk_1からroute数を増やしたmanifestを作り、route holdoutのままfuture pathモデルを再学習します。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
