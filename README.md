# Lynn的小词窝

给 Lynn 的四级背单词小网站：内置四级词库 3,849 词和读音，先回想再对答案，按遗忘规律安排复习；也能导入自己的 PDF、照片或文字单词表。

在线使用：https://dreamdavidmit-glitch.github.io/lynn-words/

学习进度会先保存在自己的浏览器里，再通过 Cloudflare Worker 自动同步到专属 D1 数据库。打开网站时需要联网验证同步密码。登录后暂时断网，可以留在当前页面继续学习，恢复网络后会自动补传；多台设备同时有新进度时，网站会先让 Lynn 选择保留哪一份。

首页还包含只属于 Lynn 的陪伴空间：每日心情会调整当天任务，管理员可以开启轻量陪伴、定时投递留言和准备“学完才能拆”的惊喜信；学习里程碑会自动进入私人纪念册，在 3D 房间可以切换灯光、坐在沙发上看窗景，也可以提交家具愿望。Lynn 从相册加入房间的照片会先在设备上压缩，再存入私有 Cloudflare D1 数据库，网页不会公开照片地址。

## 云端进度

- GitHub Pages 负责发布网页，Cloudflare Worker + D1 负责保存进度。
- 第一次使用专属初始化链接设置同步密码，并上传当前设备上的原有进度。
- 初始化链接打开后，必须先由管理员验证，再由 Lynn 设置她自己的同步密码。
- 每次打开网站都需要输入同步密码，验证后就能继续上次的学习。
- 管理员可以从云朵面板重置 Lynn 的同步密码；旧设备登录会立即失效，但云端学习进度会保留。
- Cloudflare 的密钥只保存在 Worker Secrets 中，不会进入 GitHub 仓库。

Cloudflare 配置在 `cloudflare/`。部署前需要在 Worker Secrets 中设置 `CLAIM_TOKEN`、`CLAIM_TOKEN_EXPIRES_AT`、`SESSION_SECRET`、`ADMIN_PASSWORD_SALT`、`ADMIN_PASSWORD_HASH` 与 `ADMIN_PASSWORD_ITERATIONS`，再运行 D1 migration 与 Worker deploy。`CLAIM_TOKEN_EXPIRES_AT` 使用未来的 Unix 秒数，初始化口令过期或成功使用一次后都会失效。管理员密码哈希使用六段连续的 PBKDF2-SHA256，每段 100,000 次（Cloudflare Workers 单次 PBKDF2 的上限），总计 600,000 次；升级旧部署时必须同时重新生成管理员盐值和哈希，并把 `ADMIN_PASSWORD_ITERATIONS` 设为 `600000`。不要把真实密码或密钥写进代码、说明文件或提交记录。

安全修复版会自动把 Lynn 的同步密码和陪伴端密码从旧的 100,000 次哈希升级到 600,000 次，不需要重置她的密码。普通设备凭证有效 12 小时，网页仍会在每次重新打开时要求输入同步密码；管理员重置和恢复进度则要求 5 分钟内刚刚完成的管理员验证。网站状态检查只接受 HTTPS 公网地址，并会逐次检查 DNS 与跳转目标。

## 节日主题

`festival.js` 会按上海日期自动识别立冬、冬至、元旦、春节、元宵、清明、端午、七夕、中秋和国庆。十个主题各有独立的小紫怪造型、页面配色、环境场景、悬浮纹样、学习步骤小道具和可领取的当日祝福；同一天领取后会在本机记住。可使用 `?festival-preview=lidong` 这类参数预览主题；圣诞周继续由 `christmas.js` 单独管理并优先显示。

圣诞周（12 月 24–30 日）包含独立圣诞树、彩灯、礼物、冬青、飘雪、圣诞学习道具、音乐和平安果互动；可使用 `?christmas-preview=day` 预览。

## 3D 房间和照片

灯光和沙发视角按房间主题保存在当前浏览器。点击画框或照片墙中的缩略图可打开回忆册。回忆册按拍摄顺序翻阅，缺少拍摄时间的照片使用上传时间，拍摄日期可以在照片墙补填。新照片会在压缩前读取原图中记录的拍摄时间。

发布回忆册功能时，先应用 `cloudflare/migrations/0012_room_photo_taken_at.sql`，再部署 Worker 和前端。旧照片可以直接浏览，补填后会更新顺序。

日常和节日共用原版圣诞房间的 4K 雪谷全景，窗外的山脊、树林和小镇位置保持一致。节日会调整天气、天光和灯火。日常房间的窗景支持从夕阳播放到夜色，也可以拖动进度条。日常、元宵和冬至可以独立打开环境声。环境声适合低音量循环，每段都截取、滤波并处理了接缝。

- 日常风声取自 Anya_Media 的林间录音，使用 CC0。 [Forest, close up of trees rustling in the wind](https://freesound.org/people/Anya_Media/sounds/523389/)
- 元宵水声取自 sterferny 的溪流录音，使用 CC0。 [Stream.wav](https://freesound.org/people/sterferny/sounds/382322/)
- 冬至炉火声取自 Glaneur de sons 的木火录音，使用 CC BY 3.0。 [Campfire sound ambience](https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg) · [授权条款](https://creativecommons.org/licenses/by/3.0/)

## 发布新版本

每次发布前都要更新 `release.js`：给 `id` 换一个从未使用过的值，并填写版本号、日期和本次改动。网站更新后，Lynn 第一次打开会看到版本更新信；看过以后，同一个版本不会重复弹出。

## 用到的开源项目

- [ECDICT](https://github.com/skywind3000/ECDICT)：英汉词典数据（MIT 许可，见 `ECDICT-LICENSE.txt`）
- [PDF.js](https://github.com/mozilla/pdf.js)：读取 PDF（Apache-2.0，见 `vendor/pdfjs-legacy/LICENSE`）
- [Tesseract.js](https://github.com/naptha/tesseract.js)：识别照片里的文字（Apache-2.0）
- 读音：微软 Edge 朗读的 Emma 美式神经语音（en-US-EmmaMultilingualNeural）
