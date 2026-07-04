---
title: "SAM切り抜きデモを『複数物体対応』に改善した（旧→新をフローで比較）"
emoji: "🧩"
type: "tech"
topics: ["ai", "gradio", "画像処理", "sam", "個人開発"]
published: true
---

## はじめに

クリックで対象を切り抜く [SAM デモ](https://huggingface.co/spaces/tkawano/click-to-segment) を作ったのですが、触っているうちに **「複数の物体を一度に取れない」** という課題にぶつかりました。集合写真で2人目を足すと、切り抜きが崩壊してしまうのです。この記事は、その原因と、どう直したか（＋UXの工夫）の記録です。

## 課題：なぜ複数物体が取れなかったか

SAM は **1つのプロンプト（点の集合）＝1つの物体** として、**1枚のマスク**を返します。同じ人に「頭＋胴＋脚」と点を足すと、その人全体に育ってうまくいきます。ところが**離れた2人目の点を足す**と、SAMは「与えた点すべてを1つの物体」として1枚のマスクにしようとするため、**飛び地の2人を1枚で表せず破綻**します。

つまり「複数物体が対象外」なのではなく、**1つずつ抽出して重ねる（union）** のが正しい使い方。旧デモはそこに対応していませんでした。

## 旧→新：アプリのフロー比較

![旧デモ（単一選択）と新デモ（複数物体union）のフロー比較](/images/sam-multi-object/before-after-flow.png)

- **旧**：点をクリック → SAM（1回）→ 1マスク表示。別物体を足すと混ざって破綻。
- **新**：対象に点（複数OK）→ **Add object** → SAM実行して**結果にunion合成** → 点をリセットして**次の対象へループ**。最後にすべてが合成された結果になる。

### 実際の抽出結果（複数人をunion）

![街並みの中の複数人を1体ずつ追加して合成した結果。確定点は青で残る](/images/sam-multi-object/sam-demo-multi.png)

群衆の中の人を1人ずつ **Add object** していくと、青い確定点が積み上がり、右側の結果に複数人がまとめて切り出されていきます。

## 解決の実装ポイント

### ① マスクを貯めて union（`gr.State` ＋ `np.maximum`）

「確定済みマスク（accum）」を `gr.State` で保持し、**Add object のたびにSAMを1回実行→そのアルファを既存とピクセル最大で合成**します。

```python
def add_object(image, base, points, accum, confirmed):
    alpha = _sam_alpha(base, points)          # 今の対象のマスク(H×W)
    accum = alpha if accum is None else np.maximum(accum, alpha)  # union
    union = _compose(base, accum)             # base に合成アルファを適用したRGBA
    confirmed = (confirmed or []) + points     # 確定点を貯める(表示用)
    return base, [], accum, confirmed, union   # 現在の点はクリア
```

1体ごとにSAMを1回だけ呼ぶので、クリックごとに待つこともありません。

### ② 確定した点は"青"で残す

Add object 後に点が全部消えると「どこを足したか」が分からなくなります。そこで**確定点を別Stateに移し、入力画像に青で描き続ける**ようにしました（選択中は緑＝追加/赤＝除外）。

### ③ 「Add object 中は右（結果）だけ処理中にする」

最初、Add object の出力に**入力画像も含めていた**ため、SAM処理の数秒間ずっと**左の入力画像までローディング**になっていました。そこで、**遅いSAM処理は結果画像だけを出力**にして、入力側の点の塗り直しは `.then()` の**軽い後処理**に分離しました。

```python
add_btn.click(
    add_object, inputs=[...], outputs=[base, points, accum, confirmed, out],  # 右だけ
).then(redraw_input, inputs=[base, confirmed], outputs=[inp])                 # 左は一瞬
```

これで「処理中スピナーは右だけ、左はそのまま見える」挙動になりました。

## まとめ

- SAMは **1プロンプト＝1物体**。複数物体は **1つずつ抽出して union** が正解。
- 実装は `gr.State` にマスクを貯めて `np.maximum` で合成するだけ。
- UXは「確定点を残す」「重い処理は片側だけに出す（`.then` で分離）」の2点で体験が大きく改善。

小さなデモでも、**"モデルの仕様（1プロンプト1マスク）"を理解して UI をそれに合わせる**と、ぐっと使いやすくなる、という学びでした。

デモ → https://huggingface.co/spaces/tkawano/click-to-segment

---

> 🤖 本記事は生成AIとの対話・実装をもとに構成しています。図も生成AIで作成しました。
