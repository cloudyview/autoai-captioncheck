# CaptionCheck · 字幕交付检查器

检查 SRT/VTT 的时间结构、重叠、短显示、阅读速度和行长，导出 HTML / CSV / JSON 交付报告。浏览器和批处理版本使用同一套检查核心。无依赖、无账户、无字幕上传。

**[立即试用问题样品](https://htmlpreview.github.io/?https://github.com/cloudyview/autoai-captioncheck/blob/b03246529b6a03e00061c95916b18cf8cbdc35d8/standalone.html)** · **[下载免费离线工具](https://github.com/cloudyview/autoai-captioncheck/releases/latest)**

打开预览后点击“试试问题样品”，无需准备文件即可看到5条字幕的9项提醒，并下载检查报告。预览依赖第三方 HTML Preview 与 GitHub；需要处理私人字幕时，下载 `standalone.html` 在本机打开。

单文件版 `standalone.html` 可直接打开，无需保留其他文件。项目的 GitHub Pages 构建已完成，但继承的自定义域名证书暂不能通过验证，因此不把该地址当成可用的在线入口。

## 离线使用

下载 Release 工具包，解压，用浏览器打开 `standalone.html` 即可；或者打开 `index.html`，并将 `core.js`、`app.js`、`styles.css` 保留在同一目录。使用现代 Chrome、Edge、Firefox 或 Safari。

点击“试试问题样品”可以直接看到：不连续编号、时间重叠、短显示、阅读速度、行长和行数提醒。样品是本项目自创内容，不是真实客户案例。

## 查看完整交付样品

[下载自创交付样品包](https://github.com/cloudyview/autoai-captioncheck/releases/download/v1.1.1/captioncheck-demo-delivery.zip)，解压后打开 index.html。两份输入、逐文件报告和总览都在包内；manifest.json 记录工作规则、原始SHA256和每份交付文件的指纹。SHA256SUMS.txt 可用于收件校验，覆盖输入副本、报告、总览及最终manifest。样品不代表客户订单或收入。

## 生成可核对的批量交付

已有多个字幕文件时，使用同一个检查核心生成完整交付包，而不用手工收集零散报告：

~~~sh
node delivery.cjs samples/demo.srt samples/clean.vtt --out handoff-new --demo
node delivery.cjs chapter-1.srt chapter-2.srt --out team-handoff --rules team-rules.json
node --test tests/delivery.test.cjs
~~~

team-rules.json 可包含 {"maxChars":22,"maxLines":2,"minDuration":0.7,"maxCps":10}，只接受这四项工作规则。每次最多20份UTF-8输入，每份仍限5MB/10000条字幕。输出目录必须是新目录。

交付包包含逐字节输入副本、原文件是否变化的复核、规则记录、按错误/提醒排序的离线总览、汇总CSV、逐文件HTML/CSV/JSON报告，以及可以安全导出的标准化SRT。标准化只处理连续编号和格式，保留文字与时间，不自动解决重叠或阅读速度问题；高级VTT或损坏输入保留报告并阻断字幕导出。无提醒不等于人工审核通过。

收件后，在解压后的交付目录内执行以下一种校验命令。文件改动或缺失会返回非零退出码：

~~~sh
# macOS
shasum -a 256 -c SHA256SUMS.txt
# Linux（macOS安装GNU coreutils后命令名为gsha256sum）
sha256sum --check SHA256SUMS.txt
~~~

此检查确认清单中各文件的内容一致，不检查额外未列入的文件，也不证明发布者身份或字幕正确性。清单自身不做循环校验；完整下载包的指纹可与Release资产记录另行核对。

## 批处理

需要 Node.js 20+，不需要 npm install。

```sh
node cli.cjs samples/demo.srt samples/clean.vtt --out reports-new
node cli.cjs input.srt --out english-reports --preset english --fail-on warning
node --test tests/core.test.cjs
node build-standalone.cjs
```

输出目录必须是新目录；不覆盖原字幕或已有报告。每份输入输出 `.report.html`、`.report.csv`、`.report.json`；可以安全导出的输入再输出 `.normalized.srt`。退出码：0 完成，1 输入或 IO 错误，2 字幕触发指定阻断级别。中文默认阈值：每行22字、最多2行、最短0.7秒、最大10字/秒。英文默认42字/行、20字/秒。这些是可调整的工作预设，不是某个平台的认证规范。

## 检查与导出边界

- 不做语音转录、翻译、错字校对、语义断句或音频同步。
- 时间重叠、阅读速度过快等是核对提醒；同时讲话的字幕可能有意重叠。
- 阻断错误不会静默丢弃。存在损坏块、非法时间或乱序时，只导出报告。
- 导出保留原文本和时间。网页的整体偏移和折行需单独选择；折行只按字数，不判断语义。
- 负时间偏移直接拒绝，不截断、不猜测正确时间。
- 高级 VTT 的样式、注释、区域、定位和说话人标签暂不导出字幕，避免有损转换；报告仍可用。
- CSV 处理公式注入；HTML报告和页面以纯文字显示字幕内容。
- 输入限 UTF-8、5MB、10000条字幕以内。

## 商业使用

MIT许可允许个人或商业使用。工具免费；字幕交付包 **¥199 / 最多10分钟现成字幕** 是当前报价实验，尚未开放付款或接受订单。包含问题清单、标准化文件、格式处理及一次规则调整后的复检，不包含听音校对、翻译或剪辑。

[登记批量检查或规则适配需求](https://github.com/cloudyview/autoai-captioncheck/issues/new?template=service-request.yml)

GitHub Issue公开可见，仅登记工作范围，不上传未发布字幕、视频或私人联系方式。登记不收费，不构成订单。没有用演示、访问量或报价宣称成交。

## 隐私

本项目的检查代码不调用网络接口、不含遥测、不将输入写入持久化浏览器存储。公开预览由第三方 HTML Preview 加载 GitHub 文件，访问时会向这些服务发送正常 HTTP 请求，第三方托管行为不由本项目控制。私人字幕请使用下载后的离线版。HTML报告含字幕全文，请按自己的资料权限分享。

Copyright (c) 2026 AutoAI contributors. MIT.
