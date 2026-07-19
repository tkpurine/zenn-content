# study1-b（仮）計画メモ: Hugging Face オリジナル版 Gemma 4 の検証

> このファイルはZenn記事ではなく作業用メモです（`notes/`配下はZenn CLIの対象外）。
> 作成日: 2026-07-18

## 背景

study1-aで `gemma4:e2b`（通常版）と `gemma4:e2b-mlx` / `gemma4:e4b-mlx`（Apple Silicon向けMLXビルド）を比較した際、以下が判明した：

- Ollamaの通常版 `gemma4:e2b`/`e4b` タグは、2026年7月15日のHugging Face上でのGemma 4改善（FA4アテンション、チャットテンプレート修正等）を**まだ反映していない**（pull前後のdigest比較で完全一致を確認済み）
- Hugging Face上の「オリジナル」の重みは、Ollamaでは直接動かせない（GGUF変換・量子化を経由する必要がある）

このため、「Hugging Face上の最新オリジナル版は実際どうなのか」を検証する続編を、別記事（仮称 study1-b）として実施する方針とした。

**補足（ユーザー確認事項、未検証）**: 通常版・MLX版とは別に、量子化版の `e2b`/`e4b` も新たに公開されていそうとの情報あり。次セッション冒頭で要確認（下記チェックリスト参照）。

## 次セッション冒頭でやること（状況確認）

1. Hugging Face上のGemma 4リポジトリ（`google/gemma-4-*`想定）を確認し、7/15更新以降さらに動きがないか確認
2. Ollama側で該当タグの現状を再確認:
   ```bash
   ollama list | grep -i gemma4
   ollama pull gemma4:e2b   # digestが変化していないか再チェック
   ollama pull gemma4:e4b
   ```
3. ユーザー指摘の「量子化版のe2b/e4bも公開されていそう」の実体を特定する。候補:
   - Ollama公式ライブラリに新しい量子化タグ（例: `gemma4:e2b-q8_0`、`gemma4:e2b-qat`等）が追加されていないか `https://ollama.com/library/gemma4` で確認
   - Hugging Face上に公式の事前量子化版（GGUF/AWQ/GPTQ等）が公開されていないか確認
   - study1-aのMLX版（nvfp4量子化）との重複・別物かを整理する

## 検証したいこと（本編）

1. **Hugging Face オリジナル版を実際にロードして動かせるか**
   - `transformers` + PyTorch（または MLX の Python API）でロード
   - 9Bクラス非量子化はメモリ要件が厳しい可能性が高い（M4 16GBでは非量子化フル精度は現実的に困難と予想）→ 量子化オプション（bitsandbytes等）も併せて検討
2. **Aiderとの連携方法**
   - Ollama経由ではないため、OpenAI互換のローカルAPIサーバーを別途立てる必要がある（例: `text-generation-webui`、`vllm`、自前のFastAPIラッパー等）
   - Aider側の `--model` 設定をカスタムAPIエンドポイントに向ける方法を確認
3. **study1と同じ4タスクで比較**
   - コードレビュー／FizzBuzz／バグ検出／デコレーター説明
   - 通常版（study1）・MLX版（study1-a）・HFオリジナル版（本編）の3者比較表を作る
4. **もし量子化版タグが別途見つかった場合**
   - それも比較対象に加える（4者比較に拡張）
   - study1-aのMLX版（nvfp4）との違い（量子化方式・精度・速度）を明確に書き分ける

## 想定される結論の方向性（仮説、要検証）

- HFオリジナル版は環境構築のハードルが高く、「お手軽に試せる」というこのシリーズの前提（Ollama + Aiderで気軽に検証）から外れる可能性がある
- その場合、記事の主旨は「オリジナルは動かせるが実務ではOllama版で十分」という結論になるかもしれない（決め打ちしない、実測してから判断する）

## 記事の位置づけ・命名

- 仮称: `local-llm-study-001b-gemma4-huggingface-original.md`
- study1-a同様、`published: false` で開始
- 本編・番外編（study1-a）の続きとして「番外編その2」の位置づけ

## 進捗ログ（2026-07-18〜19セッション）

### 状況確認の結果
- `gemma4:e2b`のOllama digestは`7fbdbf8f5e45`のまま変化なし（再pull後も同じ）→ 通常版は引き続き未更新
- 「量子化版」の実体は `google/gemma-4-E2B-it-qat-q4_0-gguf`（公式QAT int4量子化GGUF、本体3.35GB + mmproj 987MB）と判明。study1-aのMLX版（nvfp4量子化）とは別物
- このQAT GGUF版は `ollama pull hf.co/google/gemma-4-E2B-it-qat-q4_0-gguf` では **`Error: 400`で失敗**（原因未特定。mmprojファイル同梱構成にOllama 0.31.2のhf.co直接pull機能が対応しきれていない可能性。要追加調査）

### 環境構築（完了）
- ディスクが16GBしか空いてなかったため、study1系と無関係なOllamaモデルを削除して78GB解放（devstral, deepseek-r1:14b, qwen3:14b, qwen2.5-coder:14b, ornith:9b/Ornith-1.0-9B, qwythos-9b, gemma4-e4b-precise/ctx32k）
- **重要な環境上の発見**: このマシンのHomebrew/pyenv/デフォルトpython3.13はすべてIntel(x86_64)ビルド（Rosetta経由）。ハードウェアはApple Silicon(arm64)なのに、torch等のarm64専用wheelが見つからず`pip install torch`が失敗する原因になっていた
- 対処: micromambaで arm64ネイティブの Python 3.11 環境を新規構築（`~/dev/zenn-content/notes/study1b-env/mmenv`）。torch 2.13.0 + MPS利用可能を確認
- `pip install transformers`のリリース版はまだ`gemma4`アーキテクチャ非対応（`KeyError: 'gemma4'`）。GitHub最新版（`pip install git+https://github.com/huggingface/transformers.git`、5.15.0.dev0）で解決
- 追加で `pillow`, `torchvision` が必要（Gemma4Processor/画像処理の依存）

### HFオリジナル版のロード・推論（成功、ただし品質要検証）
- `google/gemma-4-E2B-it` を transformers(source) + torch 2.13 + MPSでロード成功（ロード56秒、bf16、約10GB）
- `device_map='auto'`はMPS環境で誤ってディスクオフロードを試みて失敗する（`ValueError: You are trying to offload the whole model to the disk`）→ `model.to('mps')`を明示的に使うことで回避
- FizzBuzz生成タスクを実行したところ、**出力に不自然なトークン混入**（`for i rescat in range`、`print(f понимаю{i}...`など、ロシア語断片や意味不明な単語が混入）を確認。デフォルトのgeneration_config（temperature=1.0, top_p=0.95, top_k=64, do_sample=True）で発生
- 原因切り分けのため `do_sample=False`（greedy）で再実行を試みたが、**MPS上でgenerate()がハングする事象**が発生（33分経過してCPU使用時間2分程度、プロセス状態`UN`）。ユーザー環境で別途Aider+Ollama(gemma4:e4b-mlx)のセッションが同時に動いており、Metal/GPUリソース競合の可能性がある。切り分けには他プロセスが完全に空いた状態での再実行が必要
- ユーザー判断でここまでの検証を一時中断（2026-07-19）

## 進捗ログ（続き、2026-07-19セッション後半）

- greedy生成 (`do_sample=False`) では前回の混入は再現せず、クリーンなFizzBuzzコードが得られた → 混入はsamplingのランダム性由来と判断
- Aiderとの連携は `transformers serve google/gemma-4-E2B-it --device mps --port 8008` でOpenAI互換APIサーバーを立て、`aider --openai-api-base http://localhost:8008/v1 --model openai/google/gemma-4-E2B-it` で接続確認済み（`transformers[serving]`の追加インストールが必要）
- study1と同じ4タスク（コードレビュー・FizzBuzz・バグ検出・デコレーター説明）をすべて実行。**デフォルトのtemperature=1.0サンプリングで4タスク全てに無関係な多言語トークンの混入が発生**し、FizzBuzz・バグ検出タスクではコードブロック内で発生してコードが構文的に壊れる事例を確認（ベンガル語・スペイン語・ポルトガル語の単語がコード中の変数名/数値に混入）
- 速度: HFオリジナル(bf16)はOllama通常版とほぼ同等〜やや遅く（平均40.5秒 vs 34.8秒）、MLX版（平均12.0秒）より3倍以上遅い
- 記事下書きを `articles/local-llm-study-001b-gemma4-huggingface-original.md`（`published: false`）として完成

## 未解決事項（次回追加調査があれば）

- QAT量子化GGUF版（`google/gemma-4-E2B-it-qat-q4_0-gguf`）がOllama v0.31.2の`hf.co`直接pullで`Error: 400`になる原因は未特定。llama.cpp直接利用や他のGGUF提供元（unsloth/bartowski等）での回避を試すのは今後の課題（記事内でも未解決事項として明記済み）
- トークン混入が「bf16非量子化特有」なのか「gemma4アーキテクチャ全般」なのかは、GGUF/MLX版との同条件比較をしていないため断定できていない（記事内でも明記済み）

## 再開時プロンプト（次セッションの冒頭でそのまま使う）

```
study1-b（Hugging Face オリジナル版 Gemma 4 の検証）を進めたいです。
/Users/tkawano/dev/zenn-content/notes/study1b-huggingface-original-plan.md
を読んで、「進捗ログ」と「次回再開時にやること」を踏まえて計画に沿って進めてください。
```
