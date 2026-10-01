'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const cc = require('../core.js');
const { buildDelivery } = require('../delivery.cjs');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const valid = '1\n00:00:00,000 --> 00:00:03,000\n六个字的长句\n';

test('批量交付指纹、汇总与所有产物一致，原文件未变，重复交付拒绝覆盖', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-delivery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, '原字幕.srt'), output = path.join(dir, 'handoff');
  fs.writeFileSync(input, '\uFEFF' + valid);
  const before = fs.readFileSync(input);
  const manifest = buildDelivery([input, input], output, { rules: { maxChars: 3 }, demo: true });
  assert.equal(manifest.totals.files, 2);
  assert.equal(manifest.totals.warnings, 2);
  assert.equal(manifest.kind, 'self_authored_demo');
  assert.equal(manifest.rules.maxChars, 3);
  assert.deepEqual(fs.readFileSync(input), before);
  for (const artifact of manifest.artifacts) {
    const bytes = fs.readFileSync(path.join(output, artifact.path));
    assert.equal(digest(bytes), artifact.sha256);
    assert.equal(bytes.length, artifact.bytes);
  }
  assert.ok(!JSON.stringify(manifest).includes(dir));
  assert.equal(manifest.entries[0].input_sha256, digest(before));
  assert.equal(manifest.all_sources_unchanged, true);
  const after = cc.analyze(fs.readFileSync(path.join(output, manifest.entries[0].normalized_subtitle), 'utf8'));
  const original = cc.analyze(before.toString('utf8'));
  assert.deepEqual(after.cues.map(c => [c.text, c.start, c.end]), original.cues.map(c => [c.text, c.start, c.end]));
  assert.throws(() => buildDelivery([input], output), /拒绝覆盖/);
});

test('损坏字幕与高级VTT保留原副本和报告，阻断有损字幕；标题及文件名不执行HTML或CSV公式', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-delivery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const broken = path.join(dir, '=1+1.srt'), advanced = path.join(dir, '<img>.vtt'), output = path.join(dir, 'handoff');
  fs.writeFileSync(broken, valid + '\n2\n损坏内容');
  fs.writeFileSync(advanced, 'WEBVTT\n\n00:00.000 --> 00:03.000 position:50%\n内容\n');
  const result = buildDelivery([broken, advanced], output, { label: '<script>alert(1)</script>' });
  assert.equal(result.totals.subtitle_exports, 0);
  assert.equal(fs.readdirSync(path.join(output, 'normalized')).length, 0);
  assert.equal(result.entries[0].review_status, 'blocked');
  assert.equal(result.semantic_or_audio_review_performed, false);
  const page = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.ok(!page.includes('<script>') && !page.includes('<img>'));
  assert.ok(page.includes('&lt;img&gt;.vtt'));
  assert.ok(fs.readFileSync(path.join(output, 'summary.csv'), 'utf8').includes("\"'=1+1.srt\""));
});

test('CLI无效UTF8或未知规则字段不产出半份交付；自定义规则被应用并记录', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-delivery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bad = path.join(dir, 'bad.srt'), input = path.join(dir, 'good.srt'), rules = path.join(dir, 'rules.json');
  const cli = path.join(__dirname, '../delivery.cjs');
  fs.writeFileSync(bad, Buffer.from([255, 254]));
  fs.writeFileSync(input, valid);
  const run = (file, out, extra = []) => spawnSync(process.execPath, [cli, file, '--out', out, ...extra], { encoding: 'utf8' });
  const invalidOut = path.join(dir, 'invalid');
  assert.equal(run(bad, invalidOut).status, 1);
  assert.equal(fs.existsSync(invalidOut), false);
  fs.writeFileSync(rules, '{"maxChar":3}');
  assert.equal(run(input, invalidOut, ['--rules', rules]).status, 1);
  assert.equal(fs.existsSync(invalidOut), false);
  fs.writeFileSync(rules, '{"maxChars":3}');
  const output = path.join(dir, 'good');
  assert.equal(run(input, output, ['--rules', rules]).status, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
  assert.equal(manifest.rules.maxChars, 3);
  assert.equal(manifest.totals.warnings, 1);
});

test('标准SHA256清单覆盖原副本、全部交付文件与最终manifest，改动和缺件可检测', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-delivery-checksums-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, '中文字幕.srt'), output = path.join(dir, 'handoff');
  fs.writeFileSync(input, valid);
  const result = buildDelivery([input], output);
  const lines = fs.readFileSync(path.join(output, 'SHA256SUMS.txt'), 'utf8').trimEnd().split('\n');
  const expected = [...result.artifacts.map(item => item.path), 'manifest.json'].sort();
  const checks = lines.map(line => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, 'GNU/BSD SHA256 checksum line');
    return { digest: match[1], file: match[2] };
  });
  assert.deepEqual(checks.map(item => item.file).sort(), expected);
  assert.equal(new Set(expected).size, checks.length);
  const mismatches = () => checks.filter(item => {
    const target = path.join(output, item.file);
    return !fs.existsSync(target) || digest(fs.readFileSync(target)) !== item.digest;
  }).map(item => item.file);
  assert.deepEqual(mismatches(), []);
  const report = result.entries[0].reports.html;
  fs.appendFileSync(path.join(output, report), '\nchanged');
  assert.deepEqual(mismatches(), [report]);
  fs.unlinkSync(path.join(output, result.entries[0].original_copy));
  assert.deepEqual(mismatches().sort(), [report, result.entries[0].original_copy].sort());
});
