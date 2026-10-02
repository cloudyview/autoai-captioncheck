#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cc = require('./core.js');
const args = process.argv.slice(2);
function help() {
  console.log('CaptionCheck ' + cc.VERSION + '\n用法: node cli.cjs FILE.srt [FILE.vtt ...] --out 新目录 [--preset chinese|english] [--fail-on error|warning]\n不改原字幕。输出JSON/CSV/HTML及可安全导出的标准化SRT；不会覆盖已有文件。\n退出码: 0完成；1命令或IO错误；2达到fail-on规则。');
}
if (!args.length || args.includes('--help')) { help(); process.exit(0); }
try {
  const files = []; let out = null, preset = 'chinese', failOn = 'error';
  for (let i = 0; i < args.length; i++) {
    if (['--out', '--preset', '--fail-on'].includes(args[i])) {
      const flag = args[i], value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('参数缺少值：' + flag);
      if (flag === '--out') out = value;
      if (flag === '--preset') preset = value;
      if (flag === '--fail-on') failOn = value;
    } else if (args[i].startsWith('--')) throw new Error('未知参数：' + args[i]);
    else files.push(args[i]);
  }
  if (!files.length || !out) throw new Error('必须给出输入文件与--out新目录');
  if (!cc.PRESETS[preset]) throw new Error('预设仅支持chinese或english');
  if (!['error', 'warning'].includes(failOn)) throw new Error('fail-on仅支持error或warning');
  const output = path.resolve(out);
  if (fs.existsSync(output)) throw new Error('输出目录已存在，请指定新目录以免覆盖');
  const prepared = files.map((file, index) => {
    const full = path.resolve(file);
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('输入必须是5MB以内的文件：' + file);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(full));
    const report = cc.analyze(text, cc.PRESETS[preset]);
    const prefix = String(index + 1).padStart(3, '0') + '-';
    const byteLimit = 255 - Buffer.byteLength(prefix + '.normalized.srt');
    let safe = '', bytes = 0, count = 0;
    for (const char of path.basename(full).replace(/[^\p{L}\p{N}._-]/gu, '_')) {
      const size = Buffer.byteLength(char);
      if (count === 100 || bytes + size > byteLimit) break;
      safe += char; bytes += size; count++;
    }
    return { file, report, name: prefix + safe };
  });
  fs.mkdirSync(output, { recursive: true });
  let failed = false;
  for (const { file, report, name } of prepared) {
    const write = (ext, text) => fs.writeFileSync(path.join(output, name + ext), text, { flag: 'wx' });
    write('.report.json', JSON.stringify(report, null, 2) + '\n');
    write('.report.csv', cc.exportCsv(report));
    write('.report.html', cc.exportHtml(report, path.basename(file)));
    if (report.canExport) write('.normalized.srt', cc.exportSubtitles(report));
    console.log(JSON.stringify({ file, cues: report.summary.cues, errors: report.summary.errors, warnings: report.summary.warnings, subtitleExported: report.canExport }));
    if (report.summary.errors || (failOn === 'warning' && report.summary.warnings)) failed = true;
  }
  process.exitCode = failed ? 2 : 0;
} catch (err) { console.error('CaptionCheck: ' + err.message); process.exitCode = 1; }
