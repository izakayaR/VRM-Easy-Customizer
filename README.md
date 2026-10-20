# VRM Easy Customizer

## GitHub に配置するファイル

GitHub リポジトリの公開ルートに、次の2ファイルを同じ階層で配置してください。

```text
リポジトリ/
├── index.html   # VRM Easy Customizer 本体（トップページ）
├── guide.html   # VRM Easy Customizer 使い方ガイド
└── README.md    # この説明
```

- `index.html` は GitHub Pages のトップページとして開かれます。
- 本体の左側メニュー最下部にある「使い方ガイドを開く ↗」から `guide.html` を開けます。
- リンクは相対パス `./guide.html` なので、リポジトリ名が付く GitHub Pages のURLでも動作します。
- HTML 内で参照している外部ライブラリやフォントは、引き続きインターネット接続が必要です。

## GitHub Pages の公開設定

1. このフォルダー内のファイルをリポジトリのルートへアップロードします。
2. GitHub のリポジトリで **Settings → Pages** を開きます。
3. 公開元を **Deploy from a branch**、ブランチを `main`、フォルダーを `/(root)` に設定して保存します。
4. 公開後、リポジトリの GitHub Pages URL を開いて確認します。


## ファビコンとURLサムネイル

- `favicon.png`：ブラウザのタブなどに表示するファビコン（32×32 PNG）
- `og-image.png`：SNSやチャットでURLを共有した際のサムネイル（OGP画像、1200×630 PNG）
- `index.html`：ファビコン、OGP、Twitterカード用メタ情報を設定済みです。

GitHub Pagesで公開する場合は、これらのファイルを `index.html` と同じリポジトリ直下に置いてください。OGP画像のURLは公開後に絶対URLで指定するのが確実です。公開URLが決まったら、`index.html` 内の `og:image` と `twitter:image` を `https://ユーザー名.github.io/リポジトリ名/og-image.png` のような実際の公開URLに置き換えてください。
