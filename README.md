# Lynn的小词窝

给 Lynn 的四级背单词小网站：内置四级词库 3,849 词和读音，先回想再对答案，按遗忘规律安排复习；也能导入自己的 PDF、照片或文字单词表。

在线使用：https://dreamdavidmit-glitch.github.io/lynn-words/

学习进度会先保存在自己的浏览器里，再通过 Cloudflare Worker 自动同步到专属 D1 数据库。断网时仍可学习，恢复网络后会自动补传；多台设备同时有新进度时，网站会先让 Lynn 选择保留哪一份。

首页还包含只属于 Lynn 的陪伴空间：每日心情会调整当天任务，管理员可以开启轻量陪伴、定时投递留言和准备“学完才能拆”的惊喜信；学习里程碑会自动进入私人纪念册，学习获得的星光可以解锁小紫怪房间。Lynn 从相册加入房间的照片会先在设备上压缩，再存入私有 Cloudflare D1 数据库，网页不会公开照片地址。

## 云端进度

- GitHub Pages 负责发布网页，Cloudflare Worker + D1 负责保存进度。
- 第一次使用专属初始化链接设置同步密码，并上传当前设备上的原有进度。
- 初始化链接打开后，必须先由管理员验证，再由 Lynn 设置她自己的同步密码。
- 新设备点击右下角云朵，输入同步密码即可继续。
- 管理员可以从云朵面板重置 Lynn 的同步密码；旧设备登录会立即失效，但云端学习进度会保留。
- Cloudflare 的密钥只保存在 Worker Secrets 中，不会进入 GitHub 仓库。

Cloudflare 配置在 `cloudflare/`。部署前需要在 Worker Secrets 中设置 `CLAIM_TOKEN`、`CLAIM_TOKEN_EXPIRES_AT`、`SESSION_SECRET`、`ADMIN_PASSWORD_SALT`、`ADMIN_PASSWORD_HASH` 与 `ADMIN_PASSWORD_ITERATIONS`，再运行 D1 migration 与 Worker deploy。`CLAIM_TOKEN_EXPIRES_AT` 使用未来的 Unix 秒数，初始化口令过期或成功使用一次后都会失效。管理员密码哈希使用六段连续的 PBKDF2-SHA256，每段 100,000 次（Cloudflare Workers 单次 PBKDF2 的上限），总计 600,000 次；升级旧部署时必须同时重新生成管理员盐值和哈希，并把 `ADMIN_PASSWORD_ITERATIONS` 设为 `600000`。不要把真实密码或密钥写进代码、说明文件或提交记录。

安全修复版会自动把 Lynn 的同步密码和陪伴端密码从旧的 100,000 次哈希升级到 600,000 次，不需要重置她的密码。普通设备凭证有效 12 小时，网页仍会在每次重新打开时要求输入同步密码；管理员重置和恢复进度则要求 5 分钟内刚刚完成的管理员验证。网站状态检查只接受 HTTPS 公网地址，并会逐次检查 DNS 与跳转目标。

## 节日主题

`festival.js` 会按上海日期自动识别立冬、冬至、元旦、春节、元宵、清明、端午、七夕、中秋和国庆。十个主题各有独立的小紫怪造型、页面配色、环境场景、悬浮纹样、学习步骤小道具和可领取的当日祝福；同一天领取后会在本机记住。可使用 `?festival-preview=lidong` 这类参数预览主题；圣诞周继续由 `christmas.js` 单独管理并优先显示。

圣诞周（12 月 24–30 日）包含独立圣诞树、彩灯、礼物、冬青、飘雪、圣诞学习道具、音乐和平安果互动；可使用 `?christmas-preview=day` 预览。

## 发布新版本

每次发布前都要更新 `release.js`：给 `id` 换一个从未使用过的值，并填写版本号、日期和本次改动。网站更新后，Lynn 第一次打开会看到版本更新信；看过以后，同一个版本不会重复弹出。

## 用到的开源项目

- [ECDICT](https://github.com/skywind3000/ECDICT)：英汉词典数据（MIT 许可，见 `ECDICT-LICENSE.txt`）
- [PDF.js](https://github.com/mozilla/pdf.js)：读取 PDF（Apache-2.0，见 `vendor/pdfjs-legacy/LICENSE`）
- [Tesseract.js](https://github.com/naptha/tesseract.js)：识别照片里的文字（Apache-2.0）
- 读音：微软 Edge 朗读的 Emma 美式神经语音（en-US-EmmaMultilingualNeural）
