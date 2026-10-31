---
title: "e2e AD 第6章: loss調整を止めて、382セグメントのData v2と評価の作り直しへ"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

> **結論**: 52セグメントのvalidationを繰り返し見たので、これ以上のloss調整では汎化を判断できない。comma2k19のChunk_1+2から、route単位で分けた382セグメント(38,062行、437MB)のData v2を、ディスクを使い切らずに作れた。ただし、そのデータでの再学習と評価はまだこれからである。
>
> **読者が得るもの**: 小さなデータで実験を重ねたあとに、評価をどう作り直すか(route単位のtrain/dev/test、episode単位の評価、容量を抑えたstreaming方式のデータ作成)の具体的な手順と、途中でぶつかった制約。

## この章について

第5章で、現行の5 route・52セグメントのvalidationに合わせたloss調整を止めました。この章は、その後の方針と、最初に実装したData v2の土台をまとめます。全6章の最後ですが、モデルの結果はなく、データと評価の設計と実装の記録です。結果が出ていない部分は、そう書きます。

## 現在位置の整理

現在のモデルは、過去1秒の画像3枚と速度の系列から、1・2・3秒先のXY軌道を予測するResNet18です。Tesla、Wayve、comma.aiなども、カメラ映像から運動計画を学習する方向ですが、実際の開発では、大規模なfleetのデータ、複数カメラや長い時系列、ナビの指示、マルチタスク学習、シミュレータやworld modelを使ったclosed-loop学習などを持っています。今回のモデルは、そのうち「人間が走った軌道を画像から予測する」部分を、小さく実装したものです(off-policyのbehavior cloningの小型baseline)。

ここまでで得られたものは、モデルの数字より、評価の基盤でした。動画・CAN・poseの同期、route単位のholdout、将来軌道のtarget、3秒先targetの線形補間、ADE/FDEとtailの指標、速度・減速・セグメント別のslice、seedごとの再現性、失敗サンプルの可視化です。

## なぜ今の評価を続けないか

理由は第5章と同じで、3つあります。52セグメント(train 40 / val 12)・5 routeでは少ないこと。同じvalidation routeを何度もモデル選択に使ったため、もうtestではなく開発用のデータになっていること。強い減速のsliceが12行しかなく、隣接フレームのtargetは重なるので、独立した場面の数はもっと少ないことです。この小さなsliceに合わせてlossを調整し続けると、未知のrouteで再現しない可能性があります。

## Data v2の設計

comma2k19の全体は、2019個の1分セグメント(約33時間)です。まず300〜500セグメントに広げて、route単位で次の3つに分けます。

| split | 用途 |
|---|---|
| train | パラメータの学習 |
| development | アーキテクチャとlossの選択 |
| test | マイルストーンの終わりにだけ評価 |

同じrouteのセグメントは複数のsplitにまたがらせません。また、速度5m/s未満の一律除外は最終的にやめ、停止・発進・低速追従も学べるようにします(現時点のbaselineの条件は、第2章から続く速度5m/s以上のままです)。

評価は、行単位の平均だけでなく、連続した運転のepisodeを単位にします。対象は、強い減速、停止への接近、再発進、低速追従、カーブ進入、車線変更らしい動き、FDEが連続して悪化する区間などです。主な指標はADE/FDEに加えて、p95・p99、しきい値超過率、jerk、curvature、route別の結果とし、モデルの比較は3 seedで行って、routeまたはepisodeを単位にしたbootstrapで信頼区間を出す計画です。

## 実装1: Chunk_1のinventoryとsplit

まず、zipを全展開せずに、中央ディレクトリだけを見て、route・セグメントごとに必要なファイルがそろっているかを確認するツールを作りました。必須ファイルは、`video.hevc`、`global_pose` の `frame_times` と `frame_positions`、CANのspeedとsteering_angleの時刻と値です。選んだセグメントだけを展開するツールも作り、dry-runとlimit指定で、いきなり全展開しないようにしています。

手元にあった `Chunk_1.zip` の集計は、21 route・188セグメントで、188セグメントすべてが必須ファイルをそろえていました。route単位で割ると、train 16 route(130セグメント)、dev 2 route(28)、test 3 route(30)です。全展開すると約9.7GBで、現実的な大きさですが、300セグメントの目標には届かないので、ここでは学習に進みませんでした。

## 実装2: Chunk_2を足して382セグメントに

公式READMEによると、データは約10GBずつ10個のchunkに分かれ、Chunk 1-2が RAV4、Chunk 3以降が Civic の車両です。したがって、Chunk 1-2までではvehicle(車種)をまたいだ評価はできません。Hugging Faceのミラーから `Chunk_2.zip`(約9.05GB)を取得し、同じツールを再実行しました。

| 項目 | Chunk_1のみ | Chunk_1+2 |
|---|---:|---:|
| route | 21 | 42 |
| セグメント | 188 | 382 |
| 必須ファイルがそろったセグメント | 188 | 382 |
| 車両 | 1(RAV4) | 1(RAV4) |

300〜500セグメントの目標には入りました。route単位の分割は、train 33 route(264セグメント)、dev 4 route(58)、test 5 route(60)です。ただし、車種がRAV4だけなので、車種をまたぐ評価は後回しです。

## 容量の制約と、streaming方式のbuilder

Chunk_1+2の全382セグメントを展開すると、展開後は約19.7GBです。Chunk_2を足した時点で空き容量は約20GiBでした。ここで全展開すると、空きをほぼ使い切り、フレームの抽出やmanifest、Kaggleに上げるdatasetの容量が足りなくなります。そこで、全展開をやめ、1セグメントずつ処理する方式のbuilderを実装しました。

```text
Chunk_*.zip
  ↓ 1セグメントだけ一時展開
  ↓ sample frameをdecode
  ↓ CANのspeed/steeringとglobal poseを読む
  ↓ future path targetを生成
  ↓ compactなframeとmanifestに保存
  ↓ 一時展開を削除
```

必要な容量は、「1セグメントの一時展開 + 圧縮済みのframe」に収まります。同期は、これまでの最近傍マッチに50msの許容範囲(tolerance)を明示しました。許容を超えた行は落とします。第1章で見た先頭フレームの約40msのズレへの対策でもあります。targetは、現在位置から1秒後の位置への方向をローカルの前向きの軸にして、2秒・3秒後の位置をその軸で表す定義にしました。このため、1秒先のyはほぼ0になります。第4〜5章の5 route系のtarget生成とは完全には同じではないため、Data v2のbaselineは作り直して比べる必要があります。

## 実行結果: smoke、pilot、full

段階的に3回実行しました。

| 実行 | セグメント | 行数 | 出力サイズ |
|---|---:|---:|---:|
| smoke test | 6(各split 2) | 523 | 7.4MB |
| pilot | 30(各split 10) | 3,131 | 33MB |
| full | 382 | 38,062 | 437MB |

fullの結果は、次の通りです。

| split | 行数 | route | セグメント | 速度の平均(m/s) | 3秒先xの平均(m) |
|---|---:|---:|---:|---:|---:|
| train | 26,616 | 33 | 262 | 25.52 | 77.19 |
| dev | 5,435 | 4 | 56 | 25.92 | 78.39 |
| test | 6,011 | 5 | 59 | 26.62 | 80.65 |

採用された行は、50msのtolerance内に収まっています(最大約50ms、p99は約9〜10ms)。行が落ちる主な理由は、セグメント末尾で3秒先のtargetが取れないことと、5m/s未満の低速を除いていることです。382セグメントのうち5つは、現在の条件では低速のためにほとんどの行が落ち、ゼロ行になりました。このため、split表のセグメント数は382ではなく377になっています。

target分布も確認しました。3秒先のyの最大は13.29mで、該当する行は、速度27.45m/s・ステアリング-25.2度の、実際の大きなカーブの場面でした。外れ値として除くのではなく、実際の運転として残しています。

## この章の結論と限界

- loss調整を止めたのは、結果が悪かったからではなく、小さなdevelopment setでは汎化の判断ができないからである
- Data v2は、route単位で分けた382セグメント、38,062行まで作れた。streaming方式で、全展開(約19.7GB)を避けられた
- この章では、Data v2での学習結果はまだない。Study20相当のbaselineを新しいsplitで再実行し、その結果が今後のモデル比較の基準になる
- 車両はRAV4だけで、車種をまたぐ評価はできない。Chunk 3以降(Civic)を足す必要がある
- target定義が旧系列と同一ではないため、旧モデルの数字との直接比較はできない

## 今後の順序

実施順は次の通りです。1. Data v2でStudy20相当のbaselineを再実行する。2. episode単位のEvaluation v2を作る。3. 旧モデルを3 seedで再評価する。4. temporal Transformerと比較する(frameごとの共有encoderと時間方向のモジュールへ)。5. 複数仮説の軌道出力を試す。6. Wayve MILEをCARLAで評価し、open-loopの軌道誤差とclosed-loopの走行スコアの違いを見る。comma.aiの公開研究では、off-policyの軌道誤差が良くてもclosed-loopで失敗する例が示されているため、最終モデルをADE/FDEだけで採用しない方針です。

## 参考

- [Tesla AI](https://www.tesla.com/AI)
- [Wayve: Emerging behaviour of our driving intelligence](https://wayve.ai/thinking/emerging-behaviour-of-our-driving-intelligence-with-end-to-end-deep-learning/)
- [Wayve MILE](https://github.com/wayveai/mile)
- [openpilot 0.11](https://blog.comma.ai/011release/)
- [Learning to Drive from a World Model](https://arxiv.org/abs/2504.19077)
- [comma2k19](https://github.com/commaai/comma2k19)

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
