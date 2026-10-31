---
title: "e2e AD 第1章: 公開データcomma2k19で、動画とステアリングを同期してbaselineを通す"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "kaggle", "pytorch"]
published: false
---

> **結論**: comma2k19の1分セグメントなら、動画フレームとCANログを約9ms以内で同期でき、ResNet18のステアリング回帰まで通せる。ただしこの段階の検証MAE 0.46度は、同じセグメント内の隣接フレームを分けただけの値で、性能とは呼べない。
>
> **読者が得るもの**: comma2k19を最初に触る人が、フレーム抽出・時刻同期・最小baselineの順で、どこに落とし穴があるかを事前に知れる。

## この章について

「End-to-End自動運転」、つまりセンサー入力から走行計画や制御までを学習モデルで扱う方式を、公開モデルと公開データだけで一から勉強するシリーズの第1章です。全6章のうち、ここでは学習計画を立て、最初のデータを読み、最小のbaselineを動かすところまでを扱います。

最初から大規模モデルを再現するのは重すぎます。そこで、モデルの中身・学習方法・評価方法を順番に理解することを目的にして、実験環境は無料で使えるColabとKaggle Notebookを中心にしました。CARLAのようなclosed-loopシミュレーションは重いので後回しにして、公開データ上のopen-loop評価、つまり「人間が実際に走った軌道を予測できるか」から始めます。

## 学習計画

最終目標は、camera-onlyの小型E2Eモデルを自作して、公開データで評価できる状態にすることです。読む候補にしたのは、TCP(trajectoryとcontrolを組み合わせるシンプルなbaseline)、TransFuser(カメラとLiDARの融合)、UniAD(認識・予測・計画の統合)、VAD(ベクトル化したシーン表現)です。UniADやVADは依存関係も概念も重いので、TCPとTransFuserから入る方針にしました。

データは軽い順に、comma2k19、nuScenes、Argoverse 2、Waymo Open Dataset、nuPlanの順で眺めます。最初の実装はcomma2k19のcamera-onlyモデルにしました。理由は、前方カメラの動画と車両のCANログ(速度・ステアリング角)が1分単位のセグメントでそろっていて、手元のマシンで扱える大きさだからです。

最初のモデルはかなり小さくします。

```text
front camera image
        ↓
ResNet18 encoder
        ↓
MLP
        ↓
steering (後にfuture waypointsへ)
```

評価はopen-loopだけに絞り、ステアリングのMAE、軌道のADE/FDE、予測軌道の可視化を見ます。closed-loopは、Colab/Kaggleだけでは扱いにくいので後回しにしました。

## comma2k19の最初のデータ

公式リポジトリには1分のexample segmentが含まれています。中身で重要なのは次のファイルです。

```text
video.hevc                                 前方カメラの動画
global_pose/frame_times                    動画の各フレームの時刻
processed_log/CAN/speed/{t,value}          速度
processed_log/CAN/steering_angle/{t,value} ステアリング角
```

公式READMEでは速度が `car_speed` と説明されていますが、example segmentの実ファイルは `processed_log/CAN/speed` でした。Hugging Face版では `processed_log__CAN__speed__value` のようなキー名になります。ドキュメントと実ファイルが違うことがあるので、最初にディレクトリを見て確かめる必要があります。また、Hugging Faceのdemo splitには `preview` 画像と `log` はありますが、動画フレーム列の学習に必要な `video.hevc` は入っていません。学習用には公式リポジトリのexample segmentか、Academic Torrentsのchunkを使います。

## 動画フレームの取り出し

`video.hevc` は `ffmpeg` でJPEGにできます。画像は1164x874で、そのままだとColabやKaggleで学習するには大きいため、リサイズして10フレームおきに取り出します。動画は約20FPSなので、10フレームおきなら約2FPSです。

ここで1つ落とし穴がありました。raw HEVCに対して `ffmpeg -vf fps=2` のような時刻ベースの抽出を使うと、期待した枚数とずれることがあったのです。元のフレーム番号と対応させたいので、フレーム番号で選ぶ方法にしました。

```bash
ffmpeg -hide_banner -loglevel error -y \
  -i video.hevc \
  -vf 'select=gte(n\,1)*not(mod(n-1\,10)),scale=582:-1' \
  -vsync vfr -q:v 4 frame_%06d.jpg
```

この例では同期の開始がフレーム1なので、1, 11, 21...を取り出します。開始フレームはセグメントごとに計算します。

## フレーム時刻とCANログの同期

`global_pose/frame_times` には1200件の時刻が入っていて、推定FPSは20.00028でした。1分で1200フレームなので、ほぼ20FPSです。一方CANは高頻度で、speedとsteeringが4974点ずつありました。そこで、各フレーム時刻に一番近いCANのタイムスタンプを割り当てます。

```python
def nearest_by_time(query_t, source_t, source_v):
    idx = np.searchsorted(source_t, query_t)
    idx = np.clip(idx, 1, len(source_t) - 1)
    left, right = idx - 1, idx
    choose_left = np.abs(source_t[left] - query_t) <= np.abs(source_t[right] - query_t)
    nearest = np.where(choose_left, left, right)
    return source_v[nearest], source_t[nearest], nearest
```

割り当てたときの時刻のズレは次の通りでした。

| 項目 | steering | speed |
|---|---:|---:|
| 中央値 | 約2.9ms | 約3.0ms |
| p99 | 約8.6ms | 約8.7ms |
| 最大 | 約37ms | 約42ms |

最大値の約40msは、フレーム0だけの境界値でした。動画の最初の `frame_time` がCANログの開始より約40ms早く、最初のCANサンプルに寄せられていたためです。通信の途絶ではなく、セグメント先頭の境界条件です。そこで、動画フレーム・speed・steeringのすべてが存在する区間だけを使います。

```python
sync_start_time = max(frame_times[0], speed_t[0], steer_t[0])
sync_end_time   = min(frame_times[-1], speed_t[-1], steer_t[-1])
```

この同期窓に切るとフレーム0は除外され、最大ズレは約9.5msになりました。以降のデータ作りでも、この考え方を踏襲します。

## 最初のbaseline: ResNet18でステアリングを回帰する

同期済みのデータ(frame_idx、frame_time、image_path、speed_mps、steering_angle_deg、速度とステアリングの時刻差)をCSV(manifest)にして、PyTorchのDatasetから読みます。モデルはResNet18の末端に線形の回帰headを付けただけで、ステアリング角を平均・標準偏差で正規化して学習します。目的は精度ではなく、Dataset・DataLoader・学習ループ・評価の可視化までを一通り通すことです。

Kaggleで実行するときに、最初の失敗がありました。GPUを有効にするとP100が割り当てられ、実行環境のPyTorchがP100の演算能力(sm_60)に対応していなかったため、次のエラーで止まりました。

```text
CUDA error: no kernel image is available for execution on the device
```

今回は120枚だけの小さな確認なのでGPUは不要です。GPUを切ってCPUで実行したところ完了しました。結果は次の通りです。

| 項目 | 値 |
|---|---:|
| 行数 | 120(train 96 / val 24) |
| フレーム範囲 | 1〜1191 |
| ステアリング範囲 | -3.0〜2.0度 |
| 最終validation MAE | 約0.464度 |

## この数字をどう読むか

0.464度は、1分のセグメントを時間順に前半・後半に分けた値です。隣接フレームはほとんど同じ画像なので、モデルが「近くのフレームを覚えている」だけでも小さい誤差が出ます。したがって、これは汎化性能ではなく、「同期済みmanifestからPyTorch学習まで通った」ことの確認値です。この区別が、第2章で評価方法を見直すきっかけになります。

## この章の結論と限界

- 1分セグメントのフレームとCANログは、同期窓を正しく切れば約9ms以内で対応づけられる
- ステアリング回帰のbaselineは動くが、単一セグメントの検証は性能の指標にならない
- 検証は1つのセグメントのみで、複数回の再現や別データでの確認はしていない

## 次の章

次の第2章では、複数セグメントを扱うmanifest builderを作り、評価をセグメント単位、さらにroute(走行ルート)単位に切り替えます。そこでMAEは0.46度から2.46度に「悪化」しますが、こちらが実力に近い値です。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
