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

## 再開時プロンプト（次セッションの冒頭でそのまま使う）

```
study1-b（Hugging Face オリジナル版 Gemma 4 の検証）を進めたいです。
/Users/tkawano/dev/zenn-content/notes/study1b-huggingface-original-plan.md
を読んで、計画に沿って進めてください。
```
