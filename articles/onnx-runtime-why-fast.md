---
title: "生成AIに「ONNX Runtime」を聞いてみた（なぜCPUで軽く動く？）"
emoji: "⚙️"
type: "tech"
topics: ["ai", "onnx", "機械学習", "python", "onnxruntime"]
published: false
---

## はじめに

[rembg](https://github.com/danielgatis/rembg) の背景除去デモが、PyTorchを入れなくても**CPUでサクッと動いた**のが不思議でした。種を明かすと、モデルを **`.onnx` 形式で配って ONNX Runtime で動かしている**から。その仕組みを生成AIに教えてもらいながら深掘りした記録です。

## ONNX / ONNX Runtime とは（まず全体像）

- **ONNX（Open Neural Network Exchange）** ＝ 学習済みモデルの**共通フォーマット（ファイル形式）**。計算グラフ＋重みを保存した"設計図"
- **ONNX Runtime（ORT）** ＝ そのONNXを**高速に実行する推論エンジン**（Microsoft製・クロスプラットフォーム）

![一度学習してどこでも実行：学習→ONNX書き出し→ONNX Runtime→各ハード](/images/onnx-runtime/onnx-runtime-flow.png)

「PyTorch等で**学習** → ONNXに**書き出し** → ORTで**どこでも実行**」という流れ。実行先のハードは Execution Provider を差し替えるだけ、というのがキモです。

## 聞いてみた（Q&A）

### Q1. ONNX と ONNX Runtime の違いをはっきり

**A.** **ONNX＝ファイル形式（PDFそのもの）／ONNX Runtime＝それを動かすエンジン（PDFビューア）**。ONNXは"データ（名詞）"、ORTは"実行系"。rembgは `.onnx`（設計図）を ORT（エンジン）で動かしていた、という関係です。

### Q2. なぜPyTorchで動かすより軽く・速い？（"共通フォーマットなら遅そう"では？）

**A.** 直感は鋭いですが、遅くなりません。理由は「共通フォーマット＝**静的グラフ**」だからです。

- PyTorchの通常実行（eager）は、**1演算ずつPython経由で動的に**処理し、学習用の自動微分(autograd)の記録も抱える。柔軟だがオーバーヘッドが大きい
- ONNXは**モデル全体が固定されたグラフ**として分かっているので、ORTは**事前に最適化**できる：演算融合（Conv+ReLUを1つに）・定数畳み込み・不要ノード削除・メモリ配置最適化、自動微分なし・Pythonループなし

つまり共通フォーマットは実行を遅くするのではなく、**全体像が静的に見えるから事前最適化できる**のが速さの源。遅さの正体はPyTorchの"実行時の柔軟性"で、ORTはそれを削ぎ落とします（※PyTorchも `torch.compile` 等で速くできるので常にORTが勝つわけではない。配布・CPUでは特にORTが軽い）。

### Q3. Execution Provider は自動？手動？

**A.** **「手動で優先リストを指定 → 各ノードは自動割り当て」**のハイブリッド。

```python
ort.InferenceSession("model.onnx",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
```

使う候補と優先順位を渡すと、ORTは各演算を「対応する最優先EP」に割り当て、未対応の演算は自動でCPUにフォールバック。`onnxruntime`(CPU版)ならCPU EPのみ、`onnxruntime-gpu`でCUDAも使える——rembgの `[cpu]`/`[gpu]` はこれです。

### Q4. 量子化で精度はどれくらい落ちる？使う場面

**A.** 目安は **fp32→int8でサイズ約1/4、CPUで2〜4倍速**、精度低下は多くのCNNで**1%未満〜数%**（モデル・タスク依存）。

- **動的量子化**（重みだけint8・手軽、NLP/Transformer向き）／**静的量子化**（キャリブレーション要・CNNで高精度）
- 使うべき：CPU/エッジ配布で、サイズ・速度が欲しく、わずかな精度低下を許せるとき
- 避けたい：精度がシビアな用途。例えば背景除去の**髪の境界**のような繊細な部分は、量子化で粗くなることがある

### Q5. PyTorchとの詳細な違い・互換性（"レイヤーの捉え方"）

**A.** まさに**粒度（レイヤーの捉え方）が違います**。

- **PyTorch**：`nn.Module` の**階層構造**（`Conv2d` や自作クラスがネスト）。define-by-runで実行時にグラフが決まる
- **ONNX**：その階層を**平坦なオペレータのグラフ**に展開（`Conv`・`Relu`・`Add`…というノードの集合）。高レベルな"レイヤー/クラス"の概念は無く、ノードと辺だけ

`torch.onnx.export` がPyTorchコードをトレース／スクリプト化して静的グラフに変換します。互換性の注意点：

- **opsetバージョン**を合わせる必要がある
- **ONNXに対応する演算が無いケース**（自作op・動的な制御フロー・特殊な動的shape）はエクスポート失敗や要回避
- ORTは基本**推論特化**（学習用ORTもあるが別物）

### Q6. CPU版はNEON/SIMDで高速化してくれる？

**A.** します、自動で。ORTのCPU実行は **MLAS** という内製ライブラリを使い、CPUのSIMD命令を実行時に検出して使い分けます。

- **x86**：AVX2 / AVX-512
- **ARM（Apple Silicon・スマホ）**：NEON
- int8量子化時は、ドット積を高速化する命令（VNNI等）も活用

加えて**スレッド数**（`OMP_NUM_THREADS`、intra/inter-op）や**グラフ最適化レベル**（`ORT_ENABLE_ALL`）で調整可能。MacでrembgがそこそこのスピードなのはNEONが効いているから、と説明できます。

## まとめ

- ONNX＝モデルの共通フォーマット、ONNX Runtime＝それを動かす推論エンジン。
- 速さの源は「静的グラフだから事前最適化できる」こと。共通フォーマット＝遅い、ではない。
- Execution Providerの差し替えで、同じ.onnxをCPU/GPU/各OSで実行できる。CPUでもSIMD（AVX/NEON）で自動高速化。
- だからrembgはPyTorchなしのCPU環境（無料Spaces）でも動いた。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。図も生成AIで作成しました。最新の仕様は[ONNX Runtime公式](https://onnxruntime.ai/)もご確認ください。
