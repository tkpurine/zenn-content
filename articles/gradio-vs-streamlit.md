---
title: "生成AIに「Gradio」を聞いてみた（Streamlitとの違い・自動API化）"
emoji: "💬"
type: "tech"
topics: ["ai", "gradio", "streamlit", "python", "機械学習"]
published: true
---

## はじめに

前回、[rembg](https://github.com/danielgatis/rembg) の背景除去を **Gradio** で包んで[デモアプリ](https://huggingface.co/spaces/tkawano/bg-remover)にしました。手軽に作れた一方で「Streamlitと何が違うの？」「なぜデモがそのままAPIになるの？」が気になったので、生成AIに教えてもらいながら深掘りした記録です。

## Gradioとは（まず全体像）

一言でいうと、**Pythonだけで機械学習モデルのWeb UIを数行で作れる**ライブラリです（Hugging Faceが開発）。HTML/CSS/JSは不要。Pythonの「関数」をラップするだけで、入力→関数→出力のインタラクティブなアプリになります。

- 作り方は2段階：`gr.Interface`（高レベル・最短）と `gr.Blocks`（自由レイアウト）
- 起動するとローカルWebサーバーとUIが自動生成され、`share=True` で一時公開URLも出せる
- Hugging Face Spacesの公式SDK。コードを置くだけで公開できる

## 聞いてみた（Q&A）

### Q1. Streamlitとの違いは？

**A.** どちらも「Pythonだけでwebアプリ」ですが、**設計思想と実行モデルが根本的に違います**。

- **Gradio**：「関数をデモに包む」発想。MLモデルのデモが得意。部品（コンポーネント）中心。
- **Streamlit**：「スクリプトをデータアプリにする」発想。上から下へ流れるスクリプトがそのままダッシュボードになる。データ可視化中心。

一番の違いは**実行モデル**です。

![実行モデルの違い：Streamlit（全体を再実行）と Gradio（該当関数だけ実行）](/images/gradio/gradio-vs-streamlit.png)

- **Streamlit**：何か操作するたび、**スクリプト全体を上から下まで再実行**する。状態は `st.session_state`、重い処理は `@st.cache` でキャッシュ。
- **Gradio**：**イベント駆動**。「このボタンが押されたらこの関数」と紐づけ（`btn.click`）、操作時に走るのは**その関数だけ**。

| 観点 | Gradio | Streamlit |
|---|---|---|
| 得意分野 | MLモデルのデモ・公開 | データ分析ダッシュボード |
| 書き方 | 部品＋イベント | 上から下へのスクリプト |
| 実行モデル | イベント駆動（該当関数だけ） | 操作のたび全体を再実行 |
| API化 | 自動でREST API化 | 基本なし |
| 主なホスティング | Hugging Face Spaces | Streamlit Community Cloud |

ざっくり「**モデルのデモ＝Gradio／データ可視化アプリ＝Streamlit**」。今回背景除去デモにGradioを選んだのは、(1) モデルのデモだった、(2) HF Spacesにそのまま乗る、(3) APIにもなる、が噛み合ったからです。

### Q2. Interface と Blocks の使い分けは？

**A.** `gr.Interface` は「1つの関数（入力→出力）」を渡すだけでUIを自動生成する最短ルート。単機能の即席デモ向き。

```python
import gradio as gr
gr.Interface(fn=remove_background, inputs="image", outputs="image").launch()
```

`gr.Blocks` は、部品の配置・複数ボタン・部品の連動・状態保持を自分で組める自由版。私たちの背景除去デモがBlocksだったのは「ボタン＋ラジオ＋カラーピッカー＋サンプル」を並べて `btn.click(...)` で結ぶ構成だったからです。

- **Interface** … 入力→出力が1往復のシンプルなデモ
- **Blocks** … レイアウト作り込み／複数操作／部品の連動
- **gr.ChatInterface** … LLMチャットUI専用の高レベル版

### Q3. デモが自動でAPIになるって、どういうこと？

**A.** `launch()` すると裏で **FastAPIサーバー**が立ち上がり、`btn.click(fn, ...)` で紐づけた関数が**そのままHTTPエンドポイント**として公開されます。UIのボタンも外部APIも、同じ関数です。

```python
from gradio_client import Client
client = Client("tkawano/bg-remover")
result = client.predict("input.png", "White background", "#ffffff", api_name="/remove_background")
```

仕組みとしては、Gradioが**各コンポーネントの型からAPIスキーマ（JSON Schema）を生成**しています。余談ですが、デモ構築中に出た `get_api_info` の `TypeError` は、まさにこの**APIスキーマを組み立てる処理**が古いバージョンでコケていたものでした。「デモを自動API化する裏方」が原因だったわけです。

### Q4. ローカルでも動く？

**A.** はい、同じように動きます。HF Spacesは「同じものを常時ホストしている」だけです。

- `python app.py`（中で `demo.launch()`）→ `http://127.0.0.1:7860` でUIが起動
- 自動API化もローカルで機能（`Client("http://127.0.0.1:7860")` で叩ける）
- `demo.launch(share=True)` で一時的な公開URL（約72時間）も発行できる

「localhostで動かすか、公開サーバーで動かすか」が違うだけで、UIもAPIも仕組みは同じです。

## 使ってみた感想 / 学び

- 「全体再実行のStreamlit」と「イベント駆動のGradio」という実行モデルの違いが一番の腹落ちポイント。
- 「デモを作る＝APIもできる」は、あとから他のアプリに組み込むとき強い。
- バージョン差で壊れやすいので、**新しめの安定版を使う**のが安全（今回は5.x）。

## まとめ

- Gradio＝モデルのデモを関数から数行で。Streamlit＝データアプリをスクリプトで。
- 実行モデルが本質的な違い（該当関数だけ vs 全体再実行）。
- Gradioのデモは自動でAPIにもなり、ローカルでもSpacesでもAPIでも同じ関数が動く。

---

> 🤖 本記事は、生成AIとの対話をもとに構成・編集しています。図も生成AIで作成しました。内容は公開時点で筆者が確認していますが、最新の仕様は[公式サイト](https://www.gradio.app/)もあわせてご確認ください。
