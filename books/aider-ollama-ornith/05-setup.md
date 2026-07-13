---
title: "環境構築"
---

## 必要なスペック

Ornith-1.0-9B（Ollama配布サイズ6.9GB）を快適に動かすための目安です。

| 項目 | 目安 |
|---|---|
| メモリ（統合メモリ／VRAM） | 16GB以上を推奨 |
| ディスク空き容量 | モデル本体（6.9GB）＋作業用に10GB程度の余裕 |
| チップ | Apple Silicon（M1以降）を推奨 |
| OS | macOS（Windows/Linuxでも動作しますが本書はmacOSで検証） |

本書の検証環境は以下の通りです。

| 項目 | 内容 |
|---|---|
| チップ | Apple M4 |
| メモリ | 16GB（統合メモリ） |
| OS | macOS 26.5.1 |

### Intel Macでも使えるか

Ollama自体はIntel Macでも動作します。ただし、Apple SiliconのGPUコア（Metalによる高速化）を活用できないため、CPU中心の実行になり大幅に遅くなります。一部のIntel Mac（MacBook Pro 15/16インチの一部モデルなど）はディスクリートGPUを搭載していますが、VRAMが4〜8GB程度と小さく、Ornith-1.0-9Bのような9Bクラスのモデルは載り切らないことが多いです。Intel Macをお持ちの場合は、まず軽量な `qwen2.5-coder:7b` あたりから試すことをおすすめします。

## インストール手順

### 1. Ollamaのインストール

```sh
brew install ollama
ollama serve
```

`ollama serve` はバックグラウンドで動かし続ける必要があります。別ターミナルタブや `&` で常駐させておいてください。

### 2. Ornith-1.0-9Bのダウンロード

```sh
ollama pull ornith-1.0-9b
```

ダウンロードが完了すると、`ollama list` でモデル一覧に表示されます。

```sh
ollama list
```

### 3. Aiderのインストール

Python 3.9以上が必要です。

```sh
pip install aider-chat
aider --version   # aider 0.82.3 のように表示されればOK
```

### 4. 動作確認

まずはAiderを介さず、Ollama単体でモデルが正しく応答するか確認します。

```sh
ollama run ornith-1.0-9b "こんにちは。あなたは何ができますか？"
```

日本語で応答が返ってくれば、環境構築は完了です。

## GPU使用状況の確認（つまずきやすいポイント）

「遅い」と感じたら、まずApple SiliconのGPUが実際に使われているか確認しましょう。アクティビティモニタの「GPU」タブで `ollama` プロセスのGPU使用率が上がっているかを見ます。0%近辺のまま推移している場合、他の常駐プロセスがGPUメモリを圧迫している可能性があるため、不要なアプリを終了してから再試行してください。

次章では、Ornith-1.0-9Bのコンテキスト長を拡張するための `Modelfile` の作成方法を扱います。
