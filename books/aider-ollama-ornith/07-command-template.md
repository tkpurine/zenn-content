---
title: "Aider実行コマンドの雛形"
---

## 基本形

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole \
      --no-auto-commits \
      --yes \
      対象ファイル.py \
      --message "指示内容"
```

6章で作成したカスタムモデル（`ornith-1.0-9b-ctx32k`）を、`ollama/` プレフィックス付きで指定します。ベースモデルをそのまま使う場合は `--model ollama/ornith-1.0-9b` でも構いません。

## 主なオプション

| オプション | 説明 |
|---|---|
| `--model ollama/<モデル名>` | 使用するモデル。`ollama/` プレフィックスが必要 |
| `--edit-format whole` | ファイル全体を書き換える形式（ローカルモデルには必須。3章参照） |
| `--no-auto-commits` | 変更を自動でコミットしない |
| `--yes` | 確認プロンプトをすべて自動承認（非対話実行に必須） |
| `--no-stream` | ストリーミングせず完成してから出力（ログの扱いが楽になる） |
| `--test-cmd` / `--auto-test` | テストコマンドを指定し、失敗時に自動で再修正ループへ入る |
| `--message "<指示>"` | 指示をコマンドラインから渡す |

## バグ修正＋自律テストの例

テストコマンドを指定し、失敗時にOrnith-1.0-9B自身に原因調査から再修正まで任せる例です。

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      --test-cmd "python3 -m unittest test_calc -v" --auto-test \
      calc.py test_calc.py \
      --message "テストが失敗しています。原因を特定して修正してください。"
```

`--auto-test` を付けると、指定したテストコマンドが失敗する限りAiderが自律的に修正を繰り返します。無人で回す場合は、後述の注意点を必ず踏まえてください。

## テスト・スライド作成を段階的に任せる例

複雑なタスクをいきなり丸投げすると失敗しやすいため、段階を分けて依頼するのがおすすめです（8章のベンチマークでもこの方式を採用しています）。

```sh
# 1. まず設計だけ書かせる（コードは書かせない）
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      PLAN.md \
      --message "○○の実装計画を、コードは書かずPLAN.mdに日本語で書いてください。"

# 2. 計画に基づいて実装+テストを書かせる
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      --test-cmd "python3 -m unittest test_foo -v" --auto-test \
      foo.py test_foo.py PLAN.md \
      --message "PLAN.mdの設計に基づいて実装し、unittestでテストも書いてください。"
```

## 無人運用での注意点

Ornith-1.0-9Bは改竄・誤修正の実績こそありませんが、次の2点には注意してください（詳細は8章）。

1. **スコープ逸脱**：「計画だけ書いて」と指示しても、勢いで実装まで一気に生成しようとすることがあります。段階ごとにファイルを確認する運用にしてください
2. **出力ファイル名の指定違反**：指定したファイル名と異なる名前で保存されることがあります。実行後は必ず `ls` や `git status` で生成物を確認してください

そして、モデルを問わず共通の鉄則として、**「テストがPASSした」という報告だけで判断しない**ことが重要です。`--auto-test` の実行前後で `git diff` を取り、テストファイル自体が書き換えられていないか必ず確認してください。

次章では、実際にOrnith-1.0-9Bを使って計測した速度・信頼性のベンチマーク結果を紹介します。
