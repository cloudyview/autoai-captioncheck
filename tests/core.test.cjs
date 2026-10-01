'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const cc = require('../core.js');
const cue = (id, start, end, text) => id + '\n' + start + ' --> ' + end + '\n' + text;
const valid = cue(1, '00:00:00,000', '00:00:03,000', '你好，世界。');
const codes = r => r.issues.map(x => x.code);

test('正常中文字幕往返：文字与时间保持相同', () => {
  const r = cc.analyze(valid);
  assert.equal(r.summary.errors, 0); assert.equal(r.summary.warnings, 0);
  const after = cc.analyze(cc.exportSubtitles(r));
  assert.deepEqual(after.cues, r.cues);
});
test('BOM、CRLF可读且连续导出编号', () => {
  const r = cc.analyze('\uFEFF' + valid.replace('1\n', '7\n').replace(/\n/g, '\r\n'));
  assert.ok(codes(r).includes('SEQUENCE'));
  assert.ok(cc.exportSubtitles(r).startsWith('1\n')); assert.equal(r.cues[0].text, '你好，世界。');
});
test('完整检测样品中的重叠、闪字幕、阅读速度、行长和行数', () => {
  const r = cc.analyze(fs.readFileSync(path.join(__dirname, '../samples/demo.srt'), 'utf8'));
  for (const code of ['SEQUENCE', 'OVERLAP', 'SHORT_CUE', 'TOO_FAST', 'LONG_LINE', 'MANY_LINES']) assert.ok(codes(r).includes(code), code);
  assert.equal(r.cues.length, 5);
});
test('跨两条以上的长区间重叠仍然检测到', () => {
  const r = cc.analyze([
    cue(1, '00:00:00,000', '00:00:10,000', '第一条'),
    cue(2, '00:00:01,000', '00:00:02,000', '第二条'),
    cue(3, '00:00:03,000', '00:00:04,000', '第三条')
  ].join('\n\n'));
  assert.equal(r.issues.filter(x => x.code === 'OVERLAP').length, 2);
  assert.equal(r.issues.find(x => x.code === 'OVERLAP' && x.cue === 3).relatedCue, 1);
});
test('非法块不静默丢弃；部分可解析也阻止导出', () => {
  const r = cc.analyze(valid + '\n\n2\n这是一条损坏字幕\n不可以消失');
  assert.equal(r.cues.length, 1); assert.equal(r.canExport, false);
  assert.ok(codes(r).includes('INVALID_BLOCK')); assert.throws(() => cc.exportSubtitles(r));
});
test('无效分钟、零或负时长、乱序均阻断', () => {
  for (const source of [
    cue(1, '00:99:00,000', '00:99:03,000', '不合法'),
    cue(1, '00:00:03,000', '00:00:03,000', '零时长'),
    cue(1, '00:00:03,000', '00:00:02,000', '负时长'),
    cue(1, '00:00:04,000', '00:00:06,000', '第一条') + '\n\n' + cue(2, '00:00:01,000', '00:00:02,000', '第二条')
  ]) assert.equal(cc.analyze(source).canExport, false);
});
test('空文件、非字幕、超限文件均阻断', () => {
  for (const input of ['', '普通文本', 'x'.repeat(5 * 1024 * 1024 + 1)]) assert.equal(cc.analyze(input).canExport, false);
  assert.equal(cc.analyze((valid + '\n\n').repeat(10002)).canExport, false);
});
test('字幕可以为空但显式提醒并保留', () => {
  const r = cc.analyze(cue(1, '00:00:00,000', '00:00:03,000', ''));
  assert.ok(codes(r).includes('EMPTY_TEXT')); assert.equal(r.cues.length, 1);
});
test('VTT短时间码和具名cue可检查并转换', () => {
  const r = cc.analyze('WEBVTT\n\nopening\n00:00.000 --> 00:03.000\n你好');
  assert.equal(r.canExport, true); assert.equal(r.format, 'vtt');
  assert.equal(cc.analyze(cc.exportSubtitles(r)).cues[0].text, '你好');
  assert.ok(cc.exportSubtitles(r, { format: 'vtt' }).includes('opening\n00:00:00.000'));
});
test('VTT样式、注释、设置、发言人标签禁止有损导出', () => {
  const inputs = [
    'WEBVTT\n\nNOTE 注释\n重要\n\n00:00.000 --> 00:03.000\n你好',
    'WEBVTT\n\nSTYLE\n::cue{color:red}\n\n00:00.000 --> 00:03.000\n你好',
    'WEBVTT\n\n00:00.000 --> 00:03.000 position:50%\n你好',
    'WEBVTT\n\n00:00.000 --> 00:03.000\n<v 说话人>你好'
  ];
  for (const input of inputs) {
    const r = cc.analyze(input); assert.equal(r.canExport, false); assert.equal(r.cues.length, 1);
    assert.ok(codes(r).includes('VTT_LAYOUT')); assert.throws(() => cc.exportSubtitles(r));
  }
});
test('合法偏移准确；负时间不会截断或修改报告', () => {
  const r = cc.analyze(valid), before = JSON.stringify(r);
  assert.equal(cc.analyze(cc.exportSubtitles(r, { offsetMs: 123 })).cues[0].start, 123);
  assert.throws(() => cc.exportSubtitles(r, { offsetMs: -1 }));
  assert.throws(() => cc.exportSubtitles(r, { offsetMs: 0.5 }));
  assert.equal(JSON.stringify(r), before);
});
test('中文和Unicode字符折行不丢内容，标签不拆开', () => {
  const input = '中文👨‍👩‍👧‍👦abcdef 这是一个很长的中文句子。';
  const wrapped = cc.wrap(input, 5);
  assert.equal(wrapped.replace(/\n/g, ''), input);
  assert.equal(cc.length('👨‍👩‍👧‍👦'), 1);
  assert.ok(wrapped.includes('👨‍👩‍👧‍👦'));
  assert.equal(cc.wrap('<i>这是很长的文字</i>', 2), '<i>这是很长的文字</i>');
});
test('HTML报告中的注入与文件名均转义；CSV公式转义', () => {
  const r = cc.analyze(cue(1, '00:00:00,000', '00:00:03,000', '<script>alert(1)</script>'));
  const html = cc.exportHtml(r, '<img src=x onerror=alert(2)>');
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x'));
  r.issues.push({ severity: 'warning', cue: 1, label: '=cmd()', message: '+danger' });
  const csv = cc.exportCsv(r); assert.ok(csv.includes("'=cmd()")); assert.ok(csv.includes("'+danger"));
});
test('预设和规则输入的负数、非整数和无穷值被拒绝', () => {
  for (const config of [{ maxCps: 0 }, { maxChars: 1.5 }, { maxLines: -1 }, { minDuration: Infinity }]) assert.throws(() => cc.analyze(valid, config));
});
test('批处理产出四类文件，保留原片且拒绝覆盖', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-test-'));
  try {
    const input = path.join(temp, '输入.srt'), output = path.join(temp, 'reports');
    fs.writeFileSync(input, valid);
    const result = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), input, '--out', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(fs.readdirSync(output).length, 4);
    assert.equal(fs.readFileSync(input, 'utf8'), valid);
    const again = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), input, '--out', output], { encoding: 'utf8' });
    assert.equal(again.status, 1); assert.match(again.stderr, /已存在/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('批处理损坏输入导出问题报告但不导出缺失字幕', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-test-'));
  try {
    const input = path.join(temp, 'broken.srt'), output = path.join(temp, 'reports');
    fs.writeFileSync(input, valid + '\n\n损坏块');
    const result = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), input, '--out', output], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(fs.readdirSync(output).length, 3);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('非法编码与重复文件名批处理行为明确', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-test-'));
  try {
    const input = path.join(temp, 'bad.srt'), output = path.join(temp, 'reports');
    fs.writeFileSync(input, Buffer.from([0xff, 0xfe]));
    const bad = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), input, '--out', output], { encoding: 'utf8' });
    assert.equal(bad.status, 1); assert.equal(fs.existsSync(output), false);
    fs.writeFileSync(input, valid);
    const good = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), input, input, '--out', output], { encoding: 'utf8' });
    assert.equal(good.status, 0); assert.equal(fs.readdirSync(output).length, 8);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
