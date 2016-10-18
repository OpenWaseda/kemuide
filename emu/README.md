kuechip2emu
====
教育用マイコン[KUE-CHIP2](http://www.metsa.astem.or.jp/kue2/kue-chip2/)の動作をエミュレートする、HTML5アプリケーションです。

## Usage

 - `index.html`をHTML5対応ウェブブラウザで起動するだけです。
  - jQueryなどの一部ライブラリをCDNから読み込んでいるため、オンラインでないと動作しません
  - 該当バージョンをローカルに配置してHTMLの記述を変更すれば、スタンドアロンで動作します。
  
  
 - 実行バイナリをファイルから読み込むor直接入力したのち、ボタンを操作して実行してください。
  - 画面内のアップロードエリアに、16進テキストで書かれたファイルをドラッグ&ドロップすることで、バイナリをプログラム領域に読み込むことができます。

## Spec

- 現在はまだα版のため、実装されていない命令があります。

### 未実装の命令一覧
- OUT
- IN
- Ssm （シフト演算）
- Rsm （ローテート演算）

### 実装済みの命令一覧
- NOP
- HLT
- RCF
- SCF
- Bcc （分岐命令すべて）
- 算術・論理演算命令すべてと比較演算

## Licence

[MIT Licence](https://github.com/tcnksm/tool/blob/master/LICENCE)

## Author

[hikalium](https://github.com/hikalium)
