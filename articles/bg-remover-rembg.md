---
title: "rembgで背景除去アプリを作ってHugging Face Spacesに無料公開した"
emoji: "🪄"
type: "tech"
topics: ["python", "gradio", "huggingface", "機械学習", "画像処理"]
published: false
---

## この記事でやること

AI画像処理を学ぶ第一歩として、**画像の背景を除去するWebアプリ**を作り、Hugging Face Spacesに無料で公開しました。サーバー構築は不要、コードは約100行、CPUだけで動きます。

- 🔗 デモ：https://huggingface.co/spaces/tkawano/bg-remover
- 🔗 コード：https://github.com/tkpurine/bg-remover

![背景を好きな色に置き換えられる](/images/bg-remover/demo_curly.png)

## なぜ背景除去から始めたか

AI画像処理には生成・超解像・認識などいろいろな分野がありますが、最初の題材に背景除去を選んだ理由は3つです。

- **CPUで動く** — 無料のHugging Face Spaces（CPU環境）でそのまま公開できる。GPUがいらない
- **結果が一目で分かる** — ビフォーアフターが明確で、デモとして見栄えがする
- **実用性がある** — EC商品画像やアイコン作成など、実際に使われる場面が多い

## 使った技術

- [rembg](https://github.com/danielgatis/rembg)：背景除去ライブラリ。内部で **U2Net** という深層学習モデルを使う
- [Gradio](https://www.gradio.app/)：数行でWeb UIが作れるライブラリ。Hugging Face Spacesと相性が良い

## コード

`app.py` の核となる部分はこれだけです。

```python
from rembg import remove, new_session
from PIL import Image

_SESSION = new_session("u2net")  # モデルは起動時に1度だけロード

def remove_background(image, output_mode="Transparent (PNG)", bg_color="#ffffff"):
    if image is None:
        return None
    cutout = remove(image.convert("RGB"), session=_SESSION)  # RGBAが返る
    if output_mode == "Transparent (PNG)":
        return cutout
    # 単色背景に合成する場合
    color = (255, 255, 255) if output_mode == "White background" else _parse_color(bg_color)
    background = Image.new("RGB", cutout.size, color)
    background.paste(cutout, mask=cutout.split()[-1])  # アルファをマスクに
    return background
```

ポイントは2つ。

1. **`new_session` でモデルを使い回す** — 毎回ロードすると遅いので、起動時に1度だけ。
2. **透過の合成** — `paste` の `mask` にアルファチャンネルを渡すと、被写体だけを別の背景に貼れる。

出力は「透過PNG」「白背景」「指定色背景」から選べるようにしました。

## 実際に試してみた

**きれいに抜けた例（ストレートヘア・公園の背景）**

![ストレートヘアの例](/images/bg-remover/demo_clean.png)

輪郭がはっきりした被写体なら、ほぼ完璧に切り抜けました。EC用の商品写真やプロフィール画像なら十分実用的です。

**難しい例（巻き毛・にぎやかな街並み）**

![巻き毛の例](/images/bg-remover/demo_curly.png)

人通りの多いごちゃついた背景からでも、被写体だけをしっかり分離できたのは驚きでした。一方で、**細かいほつれ毛の輪郭にはわずかに縁取り（ハロー）が残る**のが分かります。ここがU2Netの限界で、髪の毛一本一本のような細部は苦手です。

## つまずいた点 / 学び

- **Hugging Face Spacesのバージョン地獄**：最初 `gradio==4.44.1` を固定したら、Spaceの新しい環境と噛み合わず `audioop` 不在・`HfFolder` 削除・スキーマ解析バグと3連続でエラーに。**Gradioを新しめの安定版（5.x）にしたら一発で解決**した。古いライブラリを最新環境に載せると壊れやすい、という教訓。
- **ColorPickerの戻り値**：Gradioの `ColorPicker` は `#rrggbb` ではなく `rgba(...)` 形式を返すことがあり、16進数前提で解析すると失敗して白背景になってしまった。`#rgb`/`rgb()`/`rgba()` を全部受けるパーサにして解決。
- **精度の調整**：人物なら `new_session("u2net_human_seg")` に変えると髪の境界がより自然になることがある（次回試したい）。

## まとめ

100行ほどのコードで、実用的な背景除去ツールを無料で公開できました。AI画像処理は「重い・難しい」イメージがありましたが、既存モデルを組み合わせれば想像よりずっと手軽に形にできます。次は**超解像（画像のアップスケール）**あたりに挑戦してみる予定です。

- デモ：https://huggingface.co/spaces/tkawano/bg-remover
- コード：https://github.com/tkpurine/bg-remover

> 本記事のデモ用画像は生成AI（Google Gemini）で作成しました。
