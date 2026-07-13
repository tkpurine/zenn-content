---
title: "Ollamaとは"
---

## Ollamaの役割

**Ollama**は、大規模言語モデル（LLM）をローカルマシン上で手軽に実行するためのツールです。モデルのダウンロード・量子化済みバイナリの管理・推論サーバーの起動までを、シンプルなCLIコマンドで完結させてくれます。

裏側ではllama.cppをベースにした推論エンジンが動いており、GGUF形式に量子化されたモデルをMacのAppleSiliconやNVIDIA GPU上で効率よく動かせます。

## できること

- `ollama pull <モデル名>` でモデルをダウンロード
- `ollama run <モデル名>` で対話的にチャット
- `ollama serve` でOpenAI互換のAPIサーバーを起動し、他のツール（Aiderなど）から利用可能にする
- `Modelfile` を使って、既存モデルにパラメータ（コンテキスト長・温度など）を追加したカスタムモデルを作成

本書で扱うAiderは、このOllamaのAPIサーバー経由でOrnith-1.0-9Bにアクセスします。つまり、Aider自体はOllamaが立てたローカルサーバーと通信しているだけで、外部にデータが送信されることはありません。

## なぜOllamaを選ぶか

ローカルLLMの実行環境にはLM StudioやGPT4Allなど他の選択肢もありますが、Ollamaは以下の理由でAiderとの相性が良く、本書でもOllamaを前提とします。

- CLIベースで自動化・スクリプト化しやすい
- OpenAI互換APIを標準で提供しており、Aiderをはじめ多くのツールが `ollama/<モデル名>` の形式でそのまま対応している
- `Modelfile` によるカスタムモデル作成が簡単（6章で扱います）

## インストール

Macの場合はHomebrew経由が簡単です。

```sh
brew install ollama
```

インストール後、バックグラウンドでサーバーを起動しておきます。

```sh
ollama serve
```

これで `http://localhost:11434` にOllamaのAPIサーバーが立ち上がります。以降、Aiderからはこのサーバー経由でモデルにアクセスします。

次章では、このOllama上のモデルを実際にコーディング作業へ組み込むための道具「Aider」について見ていきます。
