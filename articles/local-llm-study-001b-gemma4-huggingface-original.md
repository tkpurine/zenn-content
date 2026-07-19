---
title: "ローカルLLM study1-b: Hugging Faceオリジナル版Gemma 4を動かしてみた"
emoji: "🤗"
type: "tech"
topics: ["llm", "huggingface", "ai", "python", "transformers"]
published: false
---

## この記事について

[study1](https://zenn.dev/) では `gemma4:e2b`・`gemma4:e4b`（Ollama通常版）を、[study1-a](https://zenn.dev/) ではMLX版を検証しました。その過程で、2026年7月15日にGoogleがHugging Face上でGemma 4ファミリーの改善（FA4アテンション、チャットテンプレート修正など）を発表したにもかかわらず、**Ollama配布版にはまだ反映されていない**ことが分かりました。

では「本家」であるHugging Face上のオリジナル重みを直接動かすとどうなるのか？ Ollamaを経由せず`transformers`ライブラリで直接ロードして、study1と同じ4タスクで検証しました。番外編その2、「study1-b」の位置づけです。

## TL;DR

- **HFオリジナル版（`google/gemma-4-E2B-it`、bf16非量子化）は実際にApple SiliconのMPSでロード・推論できる**（transformers最新版が必要）
- ただし**環境構築のハードルは高い**。標準のtransformersリリース版はまだ`gemma4`アーキテクチャに対応しておらず、GitHub最新版のインストールが必須
- 速度は**Ollama通常版（量子化済み）と同等かやや遅く**、MLX版と比べると3倍以上遅い
- **重大な品質問題を発見**：デフォルトのsampling設定（`temperature=1.0`）で生成すると、出力に無関係な多言語トークンが混入する。しかもコードブロック内で発生すると**構文が壊れて動かないコードが生成される**（後述）。`do_sample=False`（greedy）にすると解消する
- Aiderとの連携は`transformers serve`コマンド（OpenAI互換APIサーバー）で実現できた
- 「量子化版のe2b/e4bも公開されていそう」という情報は、公式QAT int4量子化GGUF（`google/gemma-4-E2B-it-qat-q4_0-gguf`）のことだったが、**Ollamaのhf.co直接pull機能では現状動かせなかった**（`Error: 400`、原因未特定）

## 検証環境

| 項目 | 内容 |
|---|---|
| チップ | Apple M4 |
| メモリ | 16GB（統合メモリ） |
| OS | macOS 26.5.2 |
| transformers | 5.15.0.dev0（GitHub最新版、リリース版は`gemma4`未対応） |
| torch | 2.13.0（MPS対応） |
| Python | 3.11（arm64ネイティブ） |

**ここが一番ハマったポイント：** 検証機はApple Silicon（arm64）なのに、Homebrew・pyenv・デフォルトのPython3.13が軒並みIntel(x86_64)ビルドで、Rosetta経由で動いていました。最近のtorchのmacOS向けwheelはarm64専用のため、そのままでは`pip install torch`が「該当バージョンなし」で失敗します。既存のHomebrew/pyenvには手を加えず、[micromamba](https://mamba.readthedocs.io/)でarm64ネイティブのPython 3.11環境を別途作ることで解決しました。ハードウェアと実際に動いているツールチェーンのアーキテクチャが一致しているか、`python3 -c "import platform; print(platform.machine())"` で確認する価値があります。

## 検証方法

### 環境構築

```bash
# arm64ネイティブのPython環境を作成（micromamba）
micromamba create -p ./mmenv -c conda-forge python=3.11

# torch・transformers（GitHub最新版）・周辺ライブラリ
./mmenv/bin/pip install torch accelerate pillow torchvision
./mmenv/bin/pip install "git+https://github.com/huggingface/transformers.git"
./mmenv/bin/pip install "transformers[serving]"  # Aider連携用
```

素のtransformersリリース版（4.57.6時点）では `KeyError: 'gemma4'` でロードに失敗します。GitHub最新版（5.15.0.dev0）で初めて`Gemma4Config`として認識されました。また`Gemma4Processor`が画像処理の依存として`pillow`・`torchvision`を要求するため、追加インストールが必要でした。

### モデルのロード

```python
from transformers import AutoProcessor, AutoModelForCausalLM
import torch

MODEL_ID = "google/gemma-4-E2B-it"
processor = AutoProcessor.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=torch.bfloat16).to("mps")
```

**注意点：** `device_map="auto"`を指定すると、MPS環境では正しくGPUを認識できず「モデル全体をディスクにオフロードしようとする」謎のエラー（`ValueError: You are trying to offload the whole model to the disk`）で失敗しました。`model.to("mps")`で明示的にデバイスを指定することで回避できます。

ロード時間は約50〜56秒、bf16のまま約10.2GBのモデルがM4のMPS上で問題なく動作しました。

### 4タスクの実行

study1・study1-aと同じ4タスクを、`transformers serve`で立てたOpenAI互換APIサーバー（後述）経由で、それぞれ独立したリクエストとして実行しました。

## 結果：速度

| タスク | e2b（通常版、study1） | e2b-mlx（study1-a） | HFオリジナル（bf16） |
|---|---:|---:|---:|
| コードレビュー | - | 28秒 | 41.6秒 |
| FizzBuzz | 36.5秒 | **8秒** | 39.7秒 |
| バグ検出 | 35.6秒 | **13秒** | 41.8秒 |
| デコレーター説明 | 32.4秒 | **15秒** | 39.9秒 |
| **3タスク平均** | 34.8秒 | **12.0秒** | 40.5秒 |

HFオリジナル版（bf16非量子化）は、**Ollama通常版（量子化済み）とほぼ同等かやや遅く**、MLX版と比べると3倍以上遅いという結果になりました。非量子化のぶん理論上は精度で有利なはずですが、今回の4タスクの範囲では速度面のメリットは見られませんでした。

## 結果：内容の質 — 無関係なトークンが混入する問題

内容の正確さ自体は悪くありませんでした。バグ検出タスクでは「今回のコードでは`results`が5要素あるためZeroDivisionErrorは発生しないが、関数単体としては空リストに対する防御がない」という、study1で高評価だった通常版と同水準の文脈理解を示しました。

しかし、**デフォルトのgeneration設定（`do_sample=True`, `temperature=1.0`, `top_p=0.95`, `top_k=64`）で生成すると、出力に無関係な多言語トークンが混入する現象が4タスク中4タスクすべてで発生しました。**

具体例（FizzBuzzタスク、実際の生成コードより抜粋）：

```python
if num % এসেছিলেন == 0:   # 本来は "if num % 3 == 0:"
    output += "Fizz"
```

`3`という数字がベンガル語の単語（エセチロ、「来た」の意）に置き換わっており、**このコードは構文エラーで実行できません**。同様の現象はバグ検出タスクでも発生し、`total`がスペイン語の`delgado`（「痩せた」）に、`results`がポルトガル語の`Escola`（「学校」）に置き換わって、生成されたコード例が壊れていました。単なる見た目の乱れではなく、**実用上のリスクとして無視できないレベル**です。

原因切り分けのため`do_sample=False`（greedy decoding）で同じFizzBuzzタスクを再実行したところ、混入は発生せず、正確でクリーンなコードが生成されました。

```python
def fizzbuzz_basic(n):
    for i in range(1, n + 1):
        if i % 3 == 0 and i % 5 == 0:
            print("FizzBuzz")
        elif i % 3 == 0:
            print("Fizz")
        elif i % 5 == 0:
            print("Buzz")
        else:
            print(i)
```

つまり今回観測した混入は、モデル自体の破損ではなく、**温度1.0でのサンプリングが引き当てた低確率トークンが偶然コードの一部を置き換えてしまう**現象だと考えられます。study1・study1-aでのOllama実行時にはここまで顕著な混入は報告されておらず、量子化版（GGUF/MLX）とbf16非量子化版とで、同じsampling設定でも実際の出力分布に差が出ている可能性があります（この点は本記事の検証だけでは断定できず、追加調査が必要です）。

**実務上の教訓：** HFオリジナル版をコード生成用途で使う場合、デフォルト設定のままでは信頼できません。`do_sample=False`にするか、生成後に構文チェックを挟むことを推奨します。

## Aiderとの連携

Ollamaを経由しないため、OpenAI互換のAPIサーバーを別途立てる必要があります。今回は`transformers`パッケージに同梱されている`transformers serve`コマンドを使いました。

```bash
pip install "transformers[serving]"
transformers serve google/gemma-4-E2B-it --device mps --port 8008
```

これで`http://localhost:8008/v1/chat/completions`にOpenAI互換のエンドポイントが立ち上がります。Aider側は次のように指定するだけで接続できました。

```bash
aider --openai-api-base http://localhost:8008/v1 \
      --openai-api-key dummy \
      --model openai/google/gemma-4-E2B-it
```

実際にFizzBuzzコードの生成・ファイル書き込みまで問題なく動作しました（685トークン送信、220トークン受信）。`vllm`や`text-generation-webui`のような重量級のサーバーを別途セットアップしなくても、transformers単体でAider連携が完結する点は評価できます。

## 「量子化版」の正体とOllamaでの現状

計画段階でユーザーから「量子化版のe2b/e4bも新たに公開されていそう」という情報がありましたが、調査の結果、これは公式のQAT（Quantization-Aware Training）int4量子化GGUF版 `google/gemma-4-E2B-it-qat-q4_0-gguf`（本体3.35GB + マルチモーダル用mmproj 987MB）のことだと判明しました。study1-aで扱ったMLX版（nvfp4量子化）とは別の量子化方式です。

Ollama v0.31.2は`hf.co/...`形式でHugging Face上のGGUFを直接pullする機能を持っていますが、このQAT版を試したところ`Error: 400`で失敗しました。

```bash
$ ollama pull hf.co/google/gemma-4-E2B-it-qat-q4_0-gguf
pulling manifest
pulling fa401b55b07e: 100% ▕██████████████████▏ 3.3 GB
Error: 400:
```

サーバーログを確認しても具体的なエラー内容は得られず、原因は特定できていません。リポジトリにメインのGGUFファイルに加えてマルチモーダル用の`mmproj`ファイルが同梱されている構成に、現行のOllamaのhf.co直接pull機能が対応しきれていない可能性があります。llama.cpp本体を直接使う、あるいはunsloth/bartowskiなど他の提供元のGGUFを試すといった回避策は今回未検証です。

## まとめ

| 観点 | 評価 |
|---|---|
| ロード・推論の可否 | ✅ 可能（transformers最新版 + arm64ネイティブ環境が必要） |
| 環境構築の難易度 | ⚠️ 高い（アーキテクチャ不一致、依存パッケージ、GitHub最新版が必須） |
| 速度 | Ollama通常版と同等〜やや遅い。MLX版より3倍以上遅い |
| 生成品質（内容） | 通常版と同水準の文脈理解 |
| 生成品質（安定性） | ⚠️ デフォルト設定でトークン混入・コード破損のリスクあり |
| Aider連携 | ✅ `transformers serve`で実現可能 |
| 量子化版（QAT GGUF） | 存在は確認できたが、Ollamaでは現状動かせず |

計画段階で立てた仮説「HFオリジナル版は環境構築のハードルが高く、お手軽に試せるというシリーズの前提から外れる可能性がある」は、実測の結果**裏付けられました**。動かすこと自体はできますが、そこに至るまでの環境構築コスト（arm64ネイティブ環境の用意、GitHub最新版transformersのビルド、周辺パッケージの補完）は、Ollamaの`ollama pull`一発とは比較にならないほど高く、しかも動かした後も速度面のメリットがなく、デフォルト設定では生成品質に無視できない不安定さがあります。

## study1〜1-bを通した結論

study1（通常版）・study1-a（MLX版）・本記事（HFオリジナル版）と3本にわたってGemma 4を検証してきましたが、**Apple SiliconでGemma 4を使うなら、素直にMLX版（`gemma4:e2b-mlx` / `e4b-mlx`）を選ぶのが最善**というのが最終的な結論です。

| | 通常版 | MLX版 | HFオリジナル |
|---|---|---|---|
| 速度 | 基準 | **2〜5倍速い** | 同等〜やや遅い |
| 品質 | 基準 | 同等以上 | 同水準だが混入リスクあり |
| 手軽さ | `ollama pull`一発 | `ollama pull`一発 | 環境構築だけで一苦労 |

MLX版は「速い・正確・`ollama pull`一発」と三拍子揃っており、実測で明確な弱点が見つかったのはデコレーター説明タスクでの解釈の違い（曖昧なプロンプトへの既定解釈）くらいでした。HFオリジナル版は非量子化ゆえの精度面の期待に反し、速度でもMLX版に劣り、デフォルト設定での生成品質にも課題が見つかりました。

ただし、この3本はいずれも各タスク1回ずつの実行結果であり、統計的な裏付けを伴う厳密な比較ではありません。特に今回発見したトークン混入がHFオリジナル版（bf16非量子化）特有の現象なのか、MLX版でも条件次第で起こり得るのかは、同条件での複数回試行による追加検証をしていないため断定できません。「傾向としての比較」として読んでいただくのが安全です。

**実務での結論：** 普段使いはMLX版一択で問題ありません。HFオリジナル版は、最新の学術的な改善（FA4アテンション等）をいち早く検証したい場合や、`transformers`エコシステムのツール（量子化、ファインチューニングなど）と組み合わせたい場合に限って選択する価値がある、というのが今回の検証を通じた実感です。

---

> 🤖 本記事は、生成AIとの対話（Claude Code）をもとに、実際にHugging Face・transformers・Ollama・Aiderを操作しての検証結果を構成・編集しています。
