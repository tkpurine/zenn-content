---
title: "e2e AD study3: ResNet18でステアリング予測baselineを作る"
emoji: "🚗"
type: "tech"
topics: ["自動運転", "機械学習", "python", "pytorch", "colab"]
published: false
---

## はじめに

前回は [comma2k19](https://github.com/commaai/comma2k19) の `video.hevc` とCANログを同期し、カメラフレームにspeed/steeringを割り当てるところまで確認しました。

今回は、その同期済みmanifestを使って、画像からsteering angleを予測する最小baselineを作ります。

目的は高精度なモデルを作ることではなく、PyTorch Dataset、DataLoader、ResNet18回帰head、学習ループ、評価可視化まで一通り通すことです。

## 入力と教師信号

入力は、同期開始frameから10フレームおきに抽出したroad-facing camera画像です。

教師信号はCANログの `steering_angle` です。

```text
image_path
frame_idx
frame_time
speed_mps
steering_angle_deg
speed_time_delta
steering_time_delta
```

同期開始時刻は、動画フレーム、speed、steeringのすべてが存在する最初の時刻にします。

```python
sync_start_time = max(frame_times[0], speed_t[0], steer_t[0])
sync_end_time = min(frame_times[-1], speed_t[-1], steer_t[-1])
```

これで、前回見つけたframe 0の約40msズレを評価対象から外します。

## モデル

最初のモデルはシンプルにします。

```text
camera image 224x224
        ↓
ResNet18
        ↓
Linear regression head
        ↓
steering_angle_deg
```

ImageNet pretrained weightsが使える環境では使い、使えない場合はランダム初期化に落とします。

## Dataset

PyTorch Datasetは、画像を開いてtransformし、steering angleを正規化して返すだけです。

```python
class SteeringDataset(Dataset):
    def __init__(self, df, transform=None, target_mean=None, target_std=None):
        self.df = df.reset_index(drop=True)
        self.transform = transform
        self.target_mean = float(target_mean)
        self.target_std = float(target_std) if target_std > 0 else 1.0

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        image = Image.open(row["image_path"]).convert("RGB")
        if self.transform is not None:
            image = self.transform(image)
        target = (float(row["steering_angle_deg"]) - self.target_mean) / self.target_std
        return image, torch.tensor([target], dtype=torch.float32)
```

## 評価の注意

今回は公式repoに含まれる1分のexample segmentだけを使います。そのため、validation MAEは汎化性能ではありません。

特に隣接フレームはかなり似ているので、train/validationを分けても独立な評価にはなりません。今回はパイプライン確認用のsmoke testとして扱います。

本格評価では、route単位・segment単位でsplitする必要があります。

## Kaggleで実行した結果

Kaggle CLIでNotebookをpushし、Kaggle Kernelとして実行しました。

最初はGPU有効で実行しましたが、Kaggle側でP100が割り当てられ、実行環境のPyTorch CUDA buildがP100の `sm_60` をサポートしていなかったため失敗しました。

```text
CUDA error: no kernel image is available for execution on the device
```

今回は120枚だけの小さなsmoke testなので、GPUは不要です。GPUを無効化してCPUで再実行したところ、完了しました。

manifest:

```text
rows: 120
train: 96
val: 24
frame range: 1 to 1191
steering range: -3.0 to 2.0 deg
max abs speed_time_delta: 0.00860 sec
max abs steering_time_delta: 0.00873 sec
```

学習結果:

```text
epoch  train_mae_deg  val_mae_deg
1      0.5762         0.4797
2      0.3179         0.4869
3      0.2502         0.4839
4      0.2284         0.4655
5      0.1809         0.4656
6      0.2107         0.4793
7      0.1934         0.4792
8      0.2129         0.4637
```

最終validation MAEは約 `0.464 deg` でした。

ただし、これは1分のexample segmentをchronological splitしただけの値です。モデルの汎化性能ではなく、「同期済みmanifestからPyTorch学習まで通った」ことの確認値として扱います。

## 次にやること

- 複数segment対応のmanifest builderを作る
- speedを追加入力にする
- steering予測からfuture waypoint予測へ進む

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、最新情報は各公式リポジトリ・論文もあわせてご確認ください。
