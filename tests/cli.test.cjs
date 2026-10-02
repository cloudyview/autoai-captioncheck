'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const cc = require('../core.js');
const valid = '1\n00:00:00,000 --> 00:00:03,000\n六个字的长句\n';
const suffixes = ['.report.json', '.report.csv', '.report.html', '.normalized.srt'];

for (const [label, name] of [
  ['253字节中文文件名', '测'.repeat(83) + '.srt'],
  ['截断位置含扩展汉字的文件名', 'a' + '𠮷'.repeat(62) + '.srt']
]) {
  test('普通批处理支持' + label + '，输出名字完整且原字幕未变', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'captioncheck-cli-filenames-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const input = path.join(dir, name), output = path.join(dir, 'reports');
    fs.writeFileSync(input, valid);
    const result = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), input, '--out', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const names = fs.readdirSync(output);
    assert.equal(names.length, 4);
    const stems = suffixes.map(suffix => {
      const file = names.find(value => value.endsWith(suffix));
      assert.ok(file, suffix);
      assert.ok(Buffer.byteLength(file) <= 255, '输出名不能超过255字节');
      assert.ok(!file.includes('\uFFFD'), '截断不能把完整字符变成替代符');
      assert.doesNotThrow(() => encodeURIComponent(file));
      return file.slice(0, -suffix.length);
    });
    assert.equal(new Set(stems).size, 1);
    assert.equal(fs.readFileSync(input, 'utf8'), valid);
    const before = cc.analyze(valid);
    const normalized = cc.analyze(fs.readFileSync(path.join(output, stems[0] + '.normalized.srt'), 'utf8'));
    assert.deepEqual(normalized.cues.map(c => [c.text, c.start, c.end]), before.cues.map(c => [c.text, c.start, c.end]));
    assert.ok(fs.readFileSync(path.join(output, stems[0] + '.report.html'), 'utf8').includes(name));
  });
}
