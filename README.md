# Lynn的小词窝

给 Lynn 的四级背单词小网站：内置四级词库 3,849 词和读音，先回想再对答案，按遗忘规律安排复习；也能导入自己的 PDF、照片或文字单词表。

在线使用：https://dreamdavidmit-glitch.github.io/lynn-words/

学习进度会先保存在自己的浏览器里，再通过 Cloudflare Worker 自动同步到专属 D1 数据库。断网时仍可学习，恢复网络后会自动补传；多台设备同时有新进度时，网站会先让 Lynn 选择保留哪一份。

## 云端进度

- GitHub Pages 负责发布网页，Cloudflare Worker + D1 负责保存进度。
- 第一次使用专属初始化链接设置同步密码，并上传当前设备上的原有进度。
- 初始化链接打开后，必须先由管理员验证，再由 Lynn 设置她自己的同步密码。
- 新设备点击右下角云朵，输入同步密码即可继续。
- 管理员可以从云朵面板重置 Lynn 的同步密码；旧设备登录会立即失效，但云端学习进度会保留。
- Cloudflare 的密钥只保存在 Worker Secrets 中，不会进入 GitHub 仓库。

Cloudflare 配置在 `cloudflare/`。部署前需要在 Worker Secrets 中设置 `CLAIM_TOKEN`、`SESSION_SECRET`、`ADMIN_PASSWORD_SALT` 与 `ADMIN_PASSWORD_HASH`，再运行 D1 migration 与 Worker deploy。不要把真实密码或密钥写进代码、说明文件或提交记录。

## 节日主题

`festival.js` 会按上海日期自动识别立冬、冬至、元旦、春节、元宵、清明、端午、七夕、中秋和国庆。可使用 `?festival-preview=lidong` 这类参数预览主题；圣诞周继续由 `christmas.js` 单独管理。

## 发布新版本

每次发布前都要更新 `release.js`：给 `id` 换一个从未使用过的值，并填写版本号、日期和本次改动。网站更新后，Lynn 第一次打开会看到版本更新信；看过以后，同一个版本不会重复弹出。

## 用到的开源项目

- [ECDICT](https://github.com/skywind3000/ECDICT)：英汉词典数据（MIT 许可，见 `ECDICT-LICENSE.txt`）
- [PDF.js](https://github.com/mozilla/pdf.js)：读取 PDF（Apache-2.0，见 `vendor/pdfjs-legacy/LICENSE`）
- [Tesseract.js](https://github.com/naptha/tesseract.js)：识别照片里的文字（Apache-2.0）
- 读音：微软 Edge 朗读的 Emma 美式神经语音（en-US-EmmaMultilingualNeural）
