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

6章で作成したカスタムモデル（`ornith-1.0-9b-ctx32k`）を、`ollama/` プレフィックス付きで指定します。ベースモデルをそのまま使う場合は `--model ollama/ornith:9b`（5章の公式ライブラリ版）でも構いません。

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

## 実例：カルマンフィルタ／SVDタスクの全指示文

8章のベンチマークで紹介するカルマンフィルタ・SVDタスクで、実際にAiderへ渡した指示文（`--message`の中身）を掲載します。本シリーズの検証は「同一の指示文を各モデルに投げる」というルールを徹底しているため、以下はOrnith-1.0-9Bだけでなく、比較対象のgemma4:e2b・qwen3:14bにも共通して使ったものです（`--model`だけを差し替えています）。カルマンフィルタのStage1（計画）のみ当時のログが残っていないため、「依頼するならこう書く」という参考例として掲載しています。それ以外（カルマンフィルタStage2・3、SVD全3段階）は実際に使った原文そのものです。

### カルマンフィルタ：Stage1（計画・参考例）

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      PLAN.md \
      --message "1次元カルマンフィルタ（位置・速度を状態とする）の実装計画を、日本語で PLAN.md に書いてください。

対象: ノイズを含む観測値（位置のみ）から、真の位置と速度を推定する、状態遷移行列 F・観測行列 H を用いた標準的なカルマンフィルタ。

PLAN.md には以下を含めてください（コードは書かず、設計のみを日本語のMarkdownで記述、簡潔に）:
1. 状態遷移モデルと観測モデルの数式
2. predict/updateのアルゴリズム手順
3. KalmanFilterクラスの設計（メソッド名・入出力）
4. テスト戦略（何をどう検証するか）"
```

### カルマンフィルタ：Stage2（実装+テスト）

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      --test-cmd "python3 -m unittest test_kalman -v" --auto-test \
      kalman.py test_kalman.py PLAN.md \
      --message "PLAN.md の設計に従って、kalman.py にKalmanFilterクラスを実装し、test_kalman.py にテストを書いてください。

test_kalman.py は unittest.TestCase を継承したテストクラスにし、
test_ で始まるメソッドの中で self.assertXxx() を使って実際に検証すること
（printするだけのシミュレーションスクリプトにしないこと）。

含めるテストケース:
- test_converges_to_true_position: ノイズありセンサーデータに対して、十分な観測回数後に真値へ収束すること
- test_covariance_decreases: 初期不確実性（共分散）が時間とともに減少すること
- test_predict_only_no_observation: predictのみ（観測なし）でも正しく動作すること
- numpyを使って実装すること"
```

### カルマンフィルタ：Stage3（ドキュメント化）

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      slides.html kalman.py test_kalman.py \
      --message "kalman.py と test_kalman.py の内容を元に、カルマンフィルタの理論と実装をHTMLスライド形式で説明する slides.html を、必ずファイル名 slides.html に日本語で作成してください（他のファイル名を使わないこと）。

【絶対に守るルール】
- 内容はすべて日本語で書くこと
- HTMLタグのみ使用。バッククォート禁止。関数名・変数名は必ず <code> タグで囲む
- JavaScriptの alert() は禁止
- 外部CDN・外部フォントの参照は禁止（インラインのみ）
- 数式はLaTeX記法ではなく、プレーンテキストまたは<pre>で表現する

【機能要件】
- 矢印キー（ArrowLeft/ArrowRight）でスライド切り替え
- 現在枚数 / 総枚数を画面下部に表示

【スライド構成（6枚程度）】
1. タイトル
2. カルマンフィルタとは何か（このタスクの文脈で）
3. 状態遷移モデルと観測モデル（数式）
4. predict/updateアルゴリズム
5. 実装したクラス設計とテスト内容
6. まとめ"
```

### SVD：Stage1（計画）

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      PLAN.md \
      --message "べき乗法（power iteration）を用いて、行列の最大特異値と対応する特異ベクトル（ランク1近似）を求める実装計画を、日本語で PLAN.md に書いてください。

対象: 一般の実数値 m×n 行列 A に対して、最大特異値 sigma1 と、対応する左特異ベクトル u1・右特異ベクトル v1 を求める（A ≈ sigma1 * u1 * v1^T）。
numpyのlinalg.svdは使わず、べき乗法でアルゴリズム自体を実装する。デフレーションや複数階数は不要（ランク1のみ）。

PLAN.md には以下を含めてください（コードは書かず、設計のみを日本語のMarkdownで記述、簡潔に）:
1. べき乗法で最大特異値・特異ベクトルを求める数式とアルゴリズム
2. 実装する関数設計（関数名・入出力）
3. テスト戦略（何をどう検証するか）"
```

### SVD：Stage2（実装+テスト）

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      --test-cmd "python3 -m unittest test_svd -v" --auto-test \
      svd.py test_svd.py PLAN.md \
      --message "PLAN.md の設計に基づき、べき乗法（power iteration）でランク1近似のSVD（最大特異値と対応する特異ベクトル）を求める関数を svd.py に実装してください。関数名は power_iteration_svd、入力は実数値の m×n 行列（numpy.ndarray）、出力は (sigma1, u1, v1) のタプルです。実装内部では numpy.linalg.svd を使わないでください（べき乗法そのものを実装すること）。

続けて test_svd.py に unittest で以下4つのテストケースを実装してください（テスト内の検証用途に限り numpy.linalg.svd を使って正解値と比較してよい）:

1. test_known_diagonal_matrix: 既知の対角行列（例: diag([3, 1])）に対して、最大特異値と特異ベクトルが正しく求まることを検証する。
2. test_vectors_normalized: 出力される u1, v1 の両方がノルム1（単位ベクトル）であることを検証する。
3. test_rank1_approximation_error: 真にランク1の行列（例: 2つのベクトルの外積 np.outer(a, b) で作った行列）に対して、power_iteration_svd の出力から再構成した sigma1*u1*v1^T が元の行列とほぼ一致する（誤差が非常に小さい）ことを検証する。
4. test_non_square_matrix: 正方行列でない（例: 4x2や2x4の）行列に対しても正しく動作することを検証する。

すべてのテストが通るように実装してください。"
```

### SVD：Stage3（ドキュメント化）

```sh
aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      slides.html svd.py \
      --message "svd.py の内容（べき乗法によるランク1 SVD近似の実装）を解説する、6枚構成のスライド形式HTMLを slides.html に作成してください。

要件:
- 単一のHTMLファイル（外部CDN・外部リンクなし、すべてインラインCSS/JS）
- 内容はすべて日本語
- 各スライドに現在のページ番号を示すフッター（例: 1/6）を表示し、スライド切り替え時にJSで正しく更新すること
- 矢印キー（ArrowLeft/ArrowRight）でスライドを前後に切り替えられるようにすること
- 数式はLaTeXではなく、テキストやUnicode記号で表現すること（MathJax等の外部ライブラリは使わない）
- alert()は使用しないこと
- 6枚の構成: 1)タイトル 2)べき乗法とは何か 3)アルゴリズムの数式と手順 4)power_iteration_svd関数の設計 5)テスト内容の解説 6)まとめ"
```

## プロンプトはどれくらいの量を入れられるか

`--message` に渡せる指示文の長さについて、実務上気にすべき制約は2種類あります。

### 1. シェル・OSのコマンドライン長制限（ほぼ気にしなくてよい）

`--message` はシェル経由でAiderに渡すコマンドライン引数です。macOS/Linuxの引数長上限（`ARG_MAX`）は数百KB〜数MB程度あり、上記のような数百〜1,000文字程度の指示文では全く問題になりません。数万文字クラスの指示文を1つの引数に詰め込むような極端なケースでない限り、意識する必要はない制約です。

### 2. モデルのコンテキスト長（num_ctx）：実質的にはこちらが本当の上限

本当に効いてくるのはこちらです。6章で扱った `num_ctx`（例: 32768トークン）は、**指示文＋渡したファイルの中身＋会話履歴＋モデルが生成する出力**を合計したトークン数の上限です。指示文だけがどれだけ長くても、渡すファイル（`kalman.py`や`test_kalman.py`など）が大きければ、その分だけ指示に使える余地は圧迫されます。

目安として、上記のSVD Stage2の指示文（テストケース4件の詳細仕様込み）はおよそ400〜500文字（日本語）で、トークン数に換算しても数百トークン程度です。`num_ctx 32768`の設定であれば、平均的なソースファイル（数百行程度）を同時に渡しても十分な余裕があります。逆に、`num_ctx`をデフォルトのまま拡張せずに使うと、指示文自体は短くても、ファイルの中身と合わせて上限を超え、指示の前半が「忘れられる」ような挙動につながることがあります（5章・6章参照）。

### 長い指示文は`--message-file`で渡す

指示文が数千文字を超える、あるいは改行や引用符を多用してシェルのクオート処理が煩雑になる場合は、`--message` の代わりに `--message-file <ファイルパス>` を使うと、テキストファイルから指示文を読み込ませられます。

```sh
cat > instruction.txt << 'EOF'
（長い指示文をここに書く）
EOF

aider --model ollama/ornith-1.0-9b-ctx32k \
      --edit-format whole --no-auto-commits --yes --no-stream \
      kalman.py test_kalman.py \
      --message-file instruction.txt
```

本書の指示文はすべて数百文字程度に収まる分量なので `--message` で十分ですが、複数タスクの指示をテンプレート化して使い回したい場合は `--message-file` の方が管理しやすくなります。

## 無人運用での注意点

Ornith-1.0-9Bは改竄・誤修正の実績こそありませんが、次の2点には注意してください（詳細は8章）。

1. **スコープ逸脱**：「計画だけ書いて」と指示しても、勢いで実装まで一気に生成しようとすることがあります。段階ごとにファイルを確認する運用にしてください
2. **出力ファイル名の指定違反**：指定したファイル名と異なる名前で保存されることがあります。実行後は必ず `ls` や `git status` で生成物を確認してください
3. **whole形式パーサーの誤爆によるゴミファイル生成**：長い出力の途中に、Markdownの見出しや説明文の断片がAiderのファイル区切りと誤認識され、意味不明な名前のファイルが生成されることがあります。本書の検証中にも、`PLAN.md` 生成中に本文中の「戻り値: (x, P)」という一節がファイル名と誤解釈され、同名のファイルが実際に作られました（8章で実例を掲載）。生成後は `ls -la` で見慣れないファイルが増えていないか確認してください

そして、モデルを問わず共通の鉄則として、**「テストがPASSした」という報告だけで判断しない**ことが重要です。`--auto-test` の実行前後で `git diff` を取り、テストファイル自体が書き換えられていないか必ず確認してください。

次章では、実際にOrnith-1.0-9Bを使って計測した速度・信頼性のベンチマーク結果を紹介します。
