// Android アプリに同梱する Web ファイルを www/ にコピーする
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of [
  'index.html', 'style.css',
  'game.js', 'bowl3d.js', 'bgm.js', 'ads.js', 'vendor',
]) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, item), { recursive: true });
}
// Web 版だけの部分（// web-only:start 〜 // web-only:end、<!-- web-only --> 〜 <!-- /web-only -->）をアプリから取り除く。
// ストアへのリンクや、端末で出し分ける処理がアプリに残ると、ストアの審査で問題になるため
for (const f of ['index.html', 'style.css', 'game.js', 'bowl3d.js', 'bgm.js', 'ads.js']) {
  const p = path.join(out, f);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end[^\n]*\n?/g, '');
  s = s.replace(/<!-- web-only -->[\s\S]*?<!-- \/web-only -->/g, '');
  if (/play\.google\.com|apps\.apple\.com/.test(s)) {
    console.error(`${f} にストアへのリンクが残っています。web-only の目印で囲んでください`);
    process.exit(1);
  }
  fs.writeFileSync(p, s);
}
// Google Play 用のビルドでは本番の広告を使う
const mode = process.env.ADMOB_MODE === 'production' ? 'production' : 'test';
fs.writeFileSync(path.join(out, 'ads-config.js'), `// ビルド時に生成\nwindow.AD_MODE = '${mode}';\n`);
// タイトル画面に出すバージョン（CI では VERSION_NAME / VERSION_CODE を使う）
const version = process.env.VERSION_CODE
  ? `v${process.env.VERSION_NAME || require('../package.json').version} (build ${process.env.VERSION_CODE})`
  : 'dev';
fs.writeFileSync(path.join(out, 'build-info.js'), `// ビルド時に生成\nwindow.APP_VERSION = '${version}';\n`);
console.log(`built web assets into www/ (ads: ${mode}, version: ${version})`);
