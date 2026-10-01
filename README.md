# CaptionCheck · 字幕交付检查器

检查 SRT/VTT 的时间结构、重叠、短显示、阅读速度和行长，导出 HTML / CSV / JSON 交付报告。浏览器和批处理版本使用同一套检查核心。无依赖、无账户、无字幕上传。

在线使用：https://cloudyview.github.io/autoai-captioncheck/

## 离线使用

下载 Release 工具包，解压，用浏览器打开 `index.html`。`core.js`、`app.js`、`styles.css` 与 HTML 必须保留在同一目录。使用现代 Chrome、Edge、Firefox 或 Safari。

点击“试试问题样品”可以直接看到：不连续编号、时间重叠、短显示、阅读速度、行长和行数提醒。样品是本项目自创内容，不是真实客户案例。

## 批处理

需要 Node.js 20+，不需要 npm install。

```sh
node cli.cjs samples/demo.srt samples/clean.vtt --out reports-new
node cli.cjs input.srt --out english-reports --preset english --fail-on warning
node --test tests/core.test.cjs
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

需求登记：https://github.com/cloudyview/autoai-captioncheck/issues/new?template=service-request.yml

GitHub Issue公开可见，仅登记工作范围，不上传未发布字幕、视频或私人联系方式。登记不收费，不构成订单。没有用演示、访问量或报价宣称成交。

## 隐私

产品代码不调用网络接口、不含遥测、不将输入写入持久化浏览器存储。在线工具由GitHub Pages提供，访问页面仍会向托管方发送正常HTTP请求；只有字幕内容在设备内处理。HTML报告含字幕全文，请按自己的资料权限分享。

Copyright (c) 2026 AutoAI contributors. MIT.
