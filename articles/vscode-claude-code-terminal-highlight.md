---
title: "VSCodeのターミナルでClaude Codeがハイライトされて見づらい問題を調査した"
emoji: "🖍️"
type: "tech"
topics: ["claude", "vscode", "terminal", "tmux", "screen"]
published: false
---

## はじめに

VSCodeの統合ターミナルで [Claude Code](https://docs.anthropic.com/ja/docs/claude-code) を使っていると、出力の一部が赤字に白背景・水色のベタ塗りブロックのようにハイライトされ、非常に見づらくなる現象に遭遇しました。原因を切り分けていくと、VSCode側の設定と `screen` の端末エミュレーションという、2つの異なる要因が絡んでいたので調査の記録を残します。

## 症状

`claude` の `/resume` セッション一覧や、通常のチャット表示で、本来は素のテキストで表示されるはずの行が丸ごと赤や水色でベタ塗りされた背景ブロックとして描画され、文字とのコントラストが低く読みにくい状態でした。

## 原因1: VSCodeの「最小コントラスト比」自動調整

VSCodeの統合ターミナルには `terminal.integrated.minimumContrastRatio` という設定があります。これは、**文字色と背景色のコントラストが低いと判断した場合に、VSCodeが自動で背景に色を塗って読みやすくしようとする**アクセシビリティ機能です。

ところがこの自動調整が、Claude CodeのようなTUI（テキストUI）アプリの独自配色とかみ合わず、逆に「行全体がベタ塗りされて読みにくい」という状態を作り出してしまっていました。

### 対処法

`settings.json` に以下を追加して、自動コントラスト調整を無効化します。

```json
{
  "terminal.integrated.minimumContrastRatio": 1
}
```

**ポイント**: この設定は既存のターミナルセッションには反映されません。ターミナルタブを閉じて開き直すだけでは不十分で、**VSCodeを完全に再起動（`Cmd+Q` → 再度起動）** する必要がありました。

これで、ターミナルから直接 `claude` を起動するケースは改善しました。

## 原因2: `screen` 経由だと再発する

ところが、`screen` コマンドを実行してからその中で `claude` を起動すると、同じハイライト現象が再発しました。VSCode側の設定は変えていないのに、なぜ再発するのか？

### truecolorが通っていなかった

原因は、**GNU screenの端末エミュレーション層がtruecolor（24bitカラー）を通さない**ことでした。

1. 通常、VSCodeのターミナルは `COLORTERM=truecolor` を子プロセスに渡しており、Claude Codeはこれを見て24bitカラーで描画します。
2. `screen` を起動すると、`TERM` が `screen` や `screen-256color` に書き換えられ、`COLORTERM` は子プロセスに伝播されません（screenのデフォルト設定はtruecolor非対応が前提のため）。
3. その結果、screen配下のClaude Codeは「truecolor非対応」と判定し、256色パレットへの近似色にフォールバックします。
4. この近似色が本来の色と微妙にずれることで、VSCode側のコントラスト計算が再び「読みにくい」と誤判定し、背景ブロックの描画が復活してしまう、という流れです。

つまり、`minimumContrastRatio: 1` の設定自体は生きているのに、**screenが色情報そのものを劣化させてしまう**ため、根本的な見た目の問題が再発していました。

### 対処の選択肢

- `~/.screenrc` にtruecolorを通す設定を追加する（screen 4.6以降が必要）
- screenをやめて `tmux` に乗り換える

## tmuxという選択肢

`tmux` は `screen` と同じ「ターミナルマルチプレクサ」で、1つのターミナルの中で複数の仮想端末セッションを開き、分割・切り替え・デタッチ（切断してもプロセスは裏で動き続ける）ができるツールです。

### 主な特徴

- **セッションの永続化**: SSH接続が切れたりターミナルを閉じても、セッション内のプロセスは動き続ける。あとで `tmux attach` すれば元の画面に戻れる
- **画面分割**: 1つのウィンドウを縦横に分割して複数の作業を並行表示
- **truecolor対応が良好**: 設定ファイルに数行書くだけで、色情報を劣化させずに子プロセスへ渡せる

### screenとの違い（今回の本題）

screenは古く、デフォルト設定がtruecolor非対応を前提にしているのに対し、tmuxは以下のように設定するだけで正しくtruecolorを通せます。

```bash
# ~/.tmux.conf
set -ga terminal-overrides ",xterm-256color:Tc"
set -g default-terminal "tmux-256color"
```

これでtmux配下でもClaude Codeが正しい色を検出でき、VSCode側の誤ハイライトも起きにくくなります。

導入は以下のとおりです。

```bash
brew install tmux
```

基本操作:
- `tmux` — 新規セッション開始
- `Ctrl+b d` — デタッチ（セッションは裏で継続）
- `tmux attach` — 再アタッチ
- `Ctrl+b %` / `Ctrl+b "` — 縦/横分割

## まとめ

- VSCodeの `terminal.integrated.minimumContrastRatio` は、TUIアプリの配色と衝突して逆に読みにくくなることがある。`1` にして無効化すると解消するケースがある（設定反映にはVSCode完全再起動が必要）
- `screen` はデフォルトでtruecolorを通さないため、色情報が劣化してVSCode側のコントラスト自動調整が再び誤発動することがある
- ターミナルマルチプレクサを使うなら、truecolor対応の設定がしやすい `tmux` の方が今回のようなトラブルには強い

---

> 🤖 本記事は、Claude Codeとの対話をもとに構成・編集しています。内容は公開時点で筆者が確認していますが、環境やバージョンによって挙動が異なる場合があります。
