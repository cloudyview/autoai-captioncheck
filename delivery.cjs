#!/usr/bin/env node
'use strict';
// MIT. Build an auditable handoff using the existing CaptionCheck core.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cc = require('./core.js');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function safeName(name) {
  let kept = '', bytes = 0, count = 0;
  // Preserve whole Unicode characters and leave space for the index and report suffix.
  for (const char of name.replace(/[^\p{L}\p{N}._-]/gu, '_')) {
    const size = Buffer.byteLength(char);
    if (count === 100 || bytes + size > 240) break;
    kept += char; bytes += size; count++;
  }
  return kept;
}
const html = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = value => {
  let text = String(value);
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};

function buildDelivery(files, output, config = {}) {
  if (!files.length || files.length > 20) throw new Error('一次需要1至20份字幕');
  if (fs.existsSync(output)) throw new Error('输出目录已存在，拒绝覆盖');
  const rules = cc.options(config.rules);
  const label = config.label || 'CaptionCheck 字幕交付包';
  if (typeof label !== 'string' || !label.trim() || label.length > 100) throw new Error('标题需要1至100字');
  // Prepare every input before creating an output, so an unreadable input does not produce a misleading partial handoff.
  const prepared = files.map((file, i) => {
    const full = path.resolve(file), stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('输入必须是5MB以内的文件');
    const bytes = fs.readFileSync(full);
    if (bytes.length > 5 * 1024 * 1024) throw new Error('读取时输入超过5MB');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const originalName = path.basename(full);
    const stem = String(i + 1).padStart(3, '0') + '-' + safeName(originalName);
    return { full, bytes, originalName, stem, sha256: hash(bytes), report: cc.analyze(text, rules) };
  });
  fs.mkdirSync(output, { recursive: true });
  for (const dir of ['originals', 'reports', 'normalized']) fs.mkdirSync(path.join(output, dir));
  const artifacts = [];
  function write(relative, data) {
    fs.writeFileSync(path.join(output, relative), data, { flag: 'wx' });
    artifacts.push({ path: relative, bytes: Buffer.byteLength(data), sha256: hash(data) });
  }
  const entries = prepared.map(item => {
    const base = 'reports/' + item.stem;
    const entry = {
      original_name: item.originalName,
      original_copy: 'originals/' + item.stem,
      input_sha256: item.sha256,
      source_unchanged: false,
      format: item.report.format,
      summary: item.report.summary,
      can_export_subtitle: item.report.canExport,
      review_status: item.report.summary.errors ? 'blocked' : item.report.summary.warnings ? 'review_required' : 'no_rule_flags',
      reports: { html: base + '.html', csv: base + '.csv', json: base + '.json' },
      normalized_subtitle: item.report.canExport ? 'normalized/' + item.stem + '.srt' : null
    };
    write(entry.original_copy, item.bytes);
    write(entry.reports.html, cc.exportHtml(item.report, item.originalName));
    write(entry.reports.csv, cc.exportCsv(item.report));
    write(entry.reports.json, JSON.stringify(item.report, null, 2) + '\n');
    if (entry.normalized_subtitle) write(entry.normalized_subtitle, cc.exportSubtitles(item.report));
    return entry;
  });
  entries.forEach((entry, i) => {
    try { entry.source_unchanged = hash(fs.readFileSync(prepared[i].full)) === entry.input_sha256; }
    catch { entry.source_unchanged = false; }
  });
  const totals = entries.reduce((all, e) => {
    all.files++; all.cues += e.summary.cues; all.errors += e.summary.errors;
    all.warnings += e.summary.warnings; all.subtitle_exports += Number(e.can_export_subtitle);
    all.duration_seconds += e.summary.durationSeconds;
    return all;
  }, { files: 0, cues: 0, errors: 0, warnings: 0, subtitle_exports: 0, duration_seconds: 0 });
  const allUnchanged = entries.every(e => e.source_unchanged);
  const lines = [
    ['文件', '字幕条数', '错误', '提醒', '字幕可导出', '源文件未变', '原始SHA256', 'HTML报告'].map(csv).join(','),
    ...entries.map(e => [e.original_name, e.summary.cues, e.summary.errors, e.summary.warnings,
      e.can_export_subtitle, e.source_unchanged, e.input_sha256, e.reports.html].map(csv).join(','))
  ];
  write('summary.csv', '\uFEFF' + lines.join('\r\n') + '\r\n');
  const link = (url, label) => '<a href="' + url.split('/').map(encodeURIComponent).join('/') + '">' + html(label) + '</a>';
  const rows = entries.slice().sort((a, b) => b.summary.errors - a.summary.errors || b.summary.warnings - a.summary.warnings)
    .map(e => '<tr><td>' + html(e.original_name) + '</td><td>' + e.summary.cues + '</td><td>' + e.summary.errors +
      '</td><td>' + e.summary.warnings + '</td><td>' + (e.source_unchanged ? '未变' : '已变或无法复核') +
      '</td><td>' + link(e.reports.html, '查看问题') + ' · ' +
      (e.normalized_subtitle ? link(e.normalized_subtitle, '标准化字幕') : '字幕导出已阻断') + '</td></tr>').join('');
  write('index.html', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + html(label) + '</title><body><h1>' + html(label) + '</h1>' +
    (config.demo ? '<p><strong>本包全部使用自创样品，属于交付演示，不是客户订单或成交证明。</strong></p>' : '') +
    '<p>' + totals.files + '份文件 · ' + totals.cues + '条字幕 · ' + totals.errors + '项错误 · ' + totals.warnings +
    '项提醒。源文件指纹复核：' + (allUnchanged ? '全部未变' : '有变化，不能认定原文件未变') + '。</p>' +
    '<p>优先检查错误与提醒最多的文件。无提醒只代表未触发工作规则；语义、错字和音频同步未审核。标准化字幕未修正重叠、阅读速度或语义问题。</p>' +
    '<p>规则：每行' + rules.maxChars + '字，最多' + rules.maxLines + '行，最短' + rules.minDuration + '秒，最大' + rules.maxCps + '字/秒。不是平台认证。</p>' +
    '<p>' + link('summary.csv', '汇总CSV') + ' · ' + link('manifest.json', '输入指纹与交付文件清单') + ' · ' + link('SHA256SUMS.txt', '收件SHA256校验清单') + '</p>' +
    '<p>收件校验：在交付目录内运行 <code>shasum -a 256 -c SHA256SUMS.txt</code>（macOS）或 <code>sha256sum --check SHA256SUMS.txt</code>（Linux）。缺件或文件改动返回非零退出码。只核对清单内的文件，不证明发布者身份或字幕正确性。</p>' +
    '<table border="1" cellpadding="8"><thead><tr><th>输入文件</th><th>字幕</th><th>错误</th><th>提醒</th><th>原文件</th><th>交付</th></tr></thead><tbody>' +
    rows + '</tbody></table><p>originals/保存逐字节输入副本，reports/保存各文件的三种报告，normalized/仅保存可保守导出的SRT。报告与原文件含字幕全文，请按资料权限分享。</p></body></html>');
  const manifest = {
    schema: 'captioncheck-delivery-v1',
    core_version: cc.VERSION,
    generated_at: new Date().toISOString(),
    kind: config.demo ? 'self_authored_demo' : 'local_handoff',
    label, rules, totals, all_sources_unchanged: allUnchanged,
    semantic_or_audio_review_performed: false,
    subtitle_transform: 'continuous numbering and SRT format only; text and timing preserved',
    checksum_file: 'SHA256SUMS.txt',
    entries, artifacts
  };
  const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(path.join(output, 'manifest.json'), manifestBytes, { flag: 'wx' });
  // Include the final manifest without a circular checksum of this checksum file itself.
  const sums = [...artifacts, { path: 'manifest.json', sha256: hash(manifestBytes) }]
    .map(item => item.sha256 + '  ' + item.path).join('\n') + '\n';
  fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), sums, { flag: 'wx' });
  return manifest;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('用法: node delivery.cjs FILE.srt [FILE.vtt ...] --out 新目录 [--preset chinese|english] [--rules rules.json] [--label 标题] [--demo]\n输出输入副本、SHA256清单、离线总览、汇总CSV和逐文件报告；不覆盖原字幕或旧交付。\n规则JSON仅支持maxChars、maxLines、minDuration、maxCps。退出码0生成、1输入或IO错误、2有字幕错误。');
  } else {
    try {
      const files = []; let output, preset = 'chinese', ruleFile, label, demo = false;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--demo') { demo = true; continue; }
        if (['--out', '--preset', '--rules', '--label'].includes(arg)) {
          const value = args[++i];
          if (!value || value.startsWith('--')) throw new Error('参数缺少值：' + arg);
          if (arg === '--out') output = value;
          if (arg === '--preset') preset = value;
          if (arg === '--rules') ruleFile = value;
          if (arg === '--label') label = value;
        } else if (arg.startsWith('--')) throw new Error('未知参数：' + arg);
        else files.push(arg);
      }
      if (!output || !cc.PRESETS[preset]) throw new Error('需要--out新目录与有效预设');
      let custom = {};
      if (ruleFile) {
        const stat = fs.statSync(ruleFile);
        if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('规则文件需要64KB以内JSON');
        custom = JSON.parse(fs.readFileSync(ruleFile, 'utf8'));
        if (!custom || Array.isArray(custom) || typeof custom !== 'object' ||
          Object.keys(custom).some(key => !['maxChars', 'maxLines', 'minDuration', 'maxCps'].includes(key))) throw new Error('规则JSON含不支持的字段');
      }
      const result = buildDelivery(files, path.resolve(output), { rules: Object.assign({}, cc.PRESETS[preset], custom), label, demo });
      console.log(JSON.stringify({ totals: result.totals, source_unchanged: result.all_sources_unchanged, output: path.resolve(output) }));
      process.exitCode = !result.all_sources_unchanged ? 1 : result.totals.errors ? 2 : 0;
    } catch (err) { console.error('CaptionCheck交付：' + err.message); process.exitCode = 1; }
  }
}
module.exports = { buildDelivery };
