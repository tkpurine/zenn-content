---
title: "e2e AD study2: comma2k19の動画とステアリングを同期する"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "colab", "データセット"]
published: false
---

## はじめに

E2E自動運転学習の最初のデータとして、[comma2k19](https://github.com/commaai/comma2k19) を触り始めました。

前回はロードマップを作ったので、今回は実際にデータを読みます。目標は、カメラ動画のフレームとCANログのspeed/steeringを同期して、camera-only baseline用のmanifestを作れる状態にすることです。

## comma2k19で最初に見るファイル

公式repoには1分のexample segmentが含まれています。

```text
Example_1/b0c9d2329ad1606b|2018-08-02--08-34-47/40
```

中には以下のようなファイルがあります。

```text
video.hevc
preview.png
processed_log/CAN/speed/t
processed_log/CAN/speed/value
processed_log/CAN/steering_angle/t
processed_log/CAN/steering_angle/value
global_pose/frame_times
```

`video.hevc` がroad-facing cameraの動画、`processed_log/CAN/*` が車両側のログ、`global_pose/frame_times` が動画フレームの時刻です。

## 動画フレームを取り出す

`video.hevc` は `ffmpeg` でJPEGへ抽出できました。

```bash
ffmpeg -hide_banner -loglevel error \
  -i video.hevc \
  -frames:v 5 \
  frame_%03d.jpg
```

抽出された画像は `1164x874` でした。Colab/Kaggleで学習するにはそのままだと大きいので、最初のbaselineではリサイズして、10フレームおきに抽出するつもりです。約20FPSの動画なので、10フレームおきなら約2FPSです。

raw HEVCでは `ffmpeg -vf fps=2` のようなtimestampベースの抽出が期待枚数とずれることがあったため、元フレームindexと対応しやすい方法にします。

```bash
ffmpeg -hide_banner -loglevel error -y \
  -i video.hevc \
  -vf 'select=gte(n\,1)*not(mod(n-1\,10)),scale=582:-1' \
  -vsync vfr \
  -q:v 4 \
  frame_%06d.jpg
```

この例では同期開始がframe 1なので、frame 1, 11, 21...を抽出します。同期開始frameはセグメントごとに計算して使います。

## フレーム時刻とCANログを合わせる

`global_pose/frame_times` を読むと、1200件の時刻が入っていました。

```text
shape: (1200,)
estimated fps: 20.00028
```

1分で1200フレームなので、ほぼ20FPSです。

CAN側のsteeringとspeedは以下の形でした。

```text
processed_log/CAN/steering_angle/value  (4974,)
processed_log/CAN/speed/value           (4974, 1)
```

CANログは動画より高頻度なので、各frame timeに一番近いCAN timestampを割り当てます。

```python
def nearest_by_time(query_t, source_t, source_v):
    idx = np.searchsorted(source_t, query_t)
    idx = np.clip(idx, 1, len(source_t) - 1)
    left = idx - 1
    right = idx
    choose_left = np.abs(source_t[left] - query_t) <= np.abs(source_t[right] - query_t)
    nearest = np.where(choose_left, left, right)
    return source_v[nearest], source_t[nearest], nearest
```

この方法で、動画フレームごとにspeedとsteeringを付けられました。

```text
steering time delta median: about 0.0029 sec
steering time delta p99:    about 0.0086 sec
steering time delta max:    about 0.037 sec

speed time delta median: about 0.0030 sec
speed time delta p99:    about 0.0087 sec
speed time delta max:    about 0.042 sec
```

最大値だけ見ると40ms程度あり少し大きく見えますが、これはframe 0だけの境界値でした。動画の最初の `frame_time` がCANログ開始より約40ms早いため、最初のCANサンプルへ寄せられています。

通信途絶というより、セグメント先頭の境界条件として扱うのがよさそうです。学習用manifestでは、CAN speedとsteeringの両方が存在する最初の時刻から使います。

```python
sync_start_time = max(frame_times[0], speed_t[0], steer_t[0])
sync_end_time = min(frame_times[-1], speed_t[-1], steer_t[-1])
```

この同期窓に切るとframe 0は除外され、最大ズレは約9.5msでした。そのうえで `abs(delta) > 10〜20ms` の行を除外候補にします。

## 作るmanifest

次の実装では、以下のようなCSVを作ります。

```text
frame_idx
frame_time
image_path
speed_mps
steering_angle_deg
speed_time_delta
steering_time_delta
```

これをPyTorch Datasetで読み、まずは画像からsteering angleを予測する小さなbaselineを作ります。

## 注意点

公式READMEではspeedの説明が `car_speed` になっていますが、example segmentの実ファイルは `processed_log/CAN/speed` でした。Hugging Face版では `processed_log__CAN__speed__value` のようなキー名になります。

また、Hugging Faceのdemo splitには `preview` 画像と `log` はありますが、動画フレーム列の学習には `video.hevc` が必要です。学習用には公式repoのexample segmentか、Academic Torrentsのchunkを使うことになります。

## 次にやること

- Colab/Kaggleで同期Notebookを実行する
- 10フレームおきのdownsample manifestを作る
- PyTorch Dataset classを作る
- ResNet18でsteering予測baselineを学習する

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
