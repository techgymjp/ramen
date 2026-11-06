# 行列のできるラーメン店

カウンター越しにやってくるお客さんの注文どおりにラーメンを作って出す、ブラウザで遊べるゲームです。
`index.html` を開くだけで遊べます（GitHub Pages でそのまま公開できます。Web 版はビルド不要）。Android アプリ版もあります（下記）。
3D 描画に同梱の three.js（`vendor/three.min.js`、MIT License）を使っています。

## 遊び方（タップするもの）

1. 🥛 カウンター左の**コップ**をタップ → お水が必要なお客さんの左に、水の入ったコップを出す（ラーメンは熱いので、水がないと食べてくれません）。水を飲みほして空になったお客さんには、**コップかお客さんをタップで補充**
2. 🍜 厨房左の**麺茹で機**の空いている穴をタップで、てぼに麺を入れる（6玉まで同時に茹でられます）
3. 🥣 お客さんの数だけ厨房正面に空の**どんぶり**が出てきます。タップで**スープ**を入れる（スープがないと麺は入れられません）
4. 🔔 **ピピッ**と鳴ったてぼをタップ → チャッチャッと湯切りして、スープ入りのどんぶりへ
5. 🥩 厨房右の什器の**チャーシュー・ネギ**をタップ → 1タップで1人前が、選んでいるどんぶりへ飛んでいく
6. 🙋 ラーメンができあがると、**自動でお客さんのところへ飛んでいきます**

## メニュー

| メニュー | トッピング | 価格 |
|---|---|---|
| ラーメン | なし（そのまま） | ¥800 |
| チャーシューメン | チャーシューを1タップ | ¥1,100 |
| ネギラーメン | ネギを1タップ | ¥950 |
| ネギチャーシューメン | チャーシューとネギを1タップずつ | ¥1,250 |

## ゴミになるもの

- ピピッの後に放っておいた茹ですぎの麺
- 注文にないトッピングをのせたラーメン（例：ネギラーメンにチャーシュー）
- 麺を入れたまま、お客さんが帰ってしまったラーメン

## 3D表示

どんぶり・チャーシュー・ネギ・お客さんは Three.js（`vendor/three.min.js` を同梱）で3D表示します（WebGLが使えない環境では2D表示）。

## 英語対応 / English

端末の言語が日本語以外なら英語で表示します。トップ画面の「日本語 / English」で切りかえられます（`?lang=en` / `?lang=ja` でも指定可）。

## BGM

歌謡曲ふうのオリジナルBGMを Web Audio でその場で鳴らしています。画面上の「🎵 BGM」ボタン（または M キー）でオン・オフできます。

## キー操作（PC）

M BGM / G 水 / Q 麺を入れる / W 麺を出す / A チャーシュー / S ネギ / 1〜6 席1〜6の空のコップに水

## Android アプリ

[Capacitor](https://capacitorjs.com/) でゲームのファイルをアプリに同梱し、Android アプリにしています（オフラインで遊べます）。
構成は techgymjp/jet-fighter の `docs/ANDROID_PORTING.md`、techgymjp/jackal と同じです。

- パッケージ名: `jp.techgym.ramen`
- アプリ名: ホーム画面では「行列ラーメン」（英語の端末では Ramen Line）
- 縦画面固定・全画面・プレイ中は画面を消さない
- 戻るボタン: プレイ中は一時停止（一時停止中なら再開）、あそびかたはトップへ、トップ・結果画面ではアプリを終了
- 別アプリに切り替えると自動で一時停止して音を止める（上のバーの ⏸ でも一時停止できる。Web 版も同じ）
- シェアは Android の共有メニュー
- 広告（AdMob）
  - バナー: トップ・あそびかた・一時停止・結果画面の下中央（プレイ中は出さない）
  - 全画面広告（インタースティシャル）: 「開店！」（トップ・あそびかたから）、「トップへ」（あそびかた・一時停止・結果画面から）、一時停止からの「再開」、結果画面の「もう一度営業する」のたびに毎回
  - リワード広告（チート）: 待たせすぎてお客さんが怒って帰ったら「広告を見て呼び戻す」（1 回の営業で 3 回まで。帰っていく様子を見届けられるよう 2.5 秒後に出し、6 秒で自動的に消える）。
    見終わると、そのお客さんの評判の減点と「怒って帰った客」を取り消し、行列の先頭に戻ってもらう。使ったことは結果画面とシェア文に「呼び戻し N回」と出る
  - EU など同意が必要な地域ではトップ画面に「広告の設定」
- トップ画面にバージョン（ビルド番号）とプライバシーポリシーへのリンク

ビルドは GitHub Actions（`.github/workflows/android.yml`）で行います。

1. `npm ci` → `npm run build`（`www/` に Web ファイルをコピーし、`ads-config.js` と `build-info.js` を生成）→ `npx cap sync android` → `./gradlew assembleDebug`
2. 既定ブランチなら、Release `android-latest` の `ramen.apk` を差し替え（動作確認用・テスト広告）
   - リリース画面: `https://github.com/techgymjp/ramen/releases/tag/android-latest`（QR コード: `docs/apk-qr.png`）
   - APK 直接: `https://github.com/techgymjp/ramen/releases/latest/download/ramen.apk`
3. GitHub Secrets に署名鍵（`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`）があれば、本番広告で署名付き AAB を作り Artifact に上げる

![Android 版のリリース画面の QR コード](docs/apk-qr.png)

AdMob のアプリ ID は `android/app/src/main/res/values/strings.xml` の `admob_app_id`、本番の広告ユニット ID は `ads.js` の `UNITS.production` にあります。
今はどちらも未設定です（アプリ ID は Google 公式のテスト用、本番の広告ユニットは空なので Google Play 用のビルドでは広告を出さない）。AdMob に登録したら差し替えます。
動作確認用 APK はどれもテスト広告、Google Play 用の AAB は本番の広告です。

手元で試すとき: `npm install` → `npm run android:sync` → `npm run android:open`（Android Studio が必要）。
アイコンと起動画面は `assets/` の元画像から `npx @capacitor/assets generate --android` で生成しています。

## ライセンス

ソースコード・画像・音声・文章などの著作権はテックジム株式会社に帰属します（All rights reserved）。
許可なく複製・改変・再配布すること、Web サイトやアプリ（Google Play・App Store など）として公開・販売すること、名前・ロゴ・アイコン・画像を使うことを禁止します。
テックジムの受講生が学習目的で複製・改変することは許可しますが、アプリストアでの公開・広告の掲載・販売などの商用利用はできません。詳しくは `LICENSE` を見てください。
同梱の three.js は MIT License です（`vendor/three.LICENSE`）。

