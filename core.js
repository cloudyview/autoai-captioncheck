/* CaptionCheck 1.0 — original code, MIT license. No network or dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaptionCheck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const PRESETS = {
    chinese: { maxChars: 22, maxLines: 2, minDuration: 0.7, maxCps: 10 },
    english: { maxChars: 42, maxLines: 2, minDuration: 0.7, maxCps: 20 }
  };
  const LABELS = {
    EMPTY_FILE: '文件为空', INVALID_BLOCK: '无法解析的字幕块',
    INVALID_TIME: '无效时间码', BAD_DURATION: '结束时间不晚于开始',
    EMPTY_TEXT: '空字幕', SEQUENCE: '编号不连续', OUT_OF_ORDER: '时间顺序异常',
    OVERLAP: '时间重叠', SHORT_CUE: '显示过短', TOO_FAST: '阅读速度过快',
    LONG_LINE: '单行过长', MANY_LINES: '行数过多', MARKUP: '含格式标签',
    VTT_LAYOUT: 'VTT样式或布局', LARGE_FILE: '超出安全处理上限'
  };
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
  const graphemes = text => segmenter ? Array.from(segmenter.segment(text), s => s.segment) : Array.from(text);
  const plain = text => text.replace(/<[^>]*>/g, '');
  const length = text => graphemes(plain(text).replace(/\s/g, '')).length;
  function issue(code, severity, cue, message, extra) {
    return Object.assign({ code, label: LABELS[code] || code, severity, cue, message }, extra || {});
  }
  function timeMs(value) {
    const m = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
    if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) return null;
    const ms = (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]);
    return Number.isSafeInteger(ms) ? ms : null;
  }
  function timestamp(ms, vtt) {
    const n = Math.round(ms);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('时间码必须是非负安全整数');
    const hours = Math.floor(n / 3600000);
    const minutes = Math.floor(n % 3600000 / 60000);
    const seconds = Math.floor(n % 60000 / 1000);
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0') + (vtt ? '.' : ',') + String(n % 1000).padStart(3, '0');
  }
  function parse(input) {
    const result = { format: 'srt', cues: [], issues: [], advancedVtt: false, blockCount: 0 };
    if (typeof input !== 'string') throw new Error('输入必须是字幕文本');
    if (input.length > 5 * 1024 * 1024) {
      result.issues.push(issue('LARGE_FILE', 'error', null, '最大5MB，请拆分后处理。'));
      return result;
    }
    const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!text) { result.issues.push(issue('EMPTY_FILE', 'error', null, '没有字幕内容。')); return result; }
    const blocks = text.split(/\n[\t ]*\n+/);
    if (blocks.length > 10001) {
      result.issues.push(issue('LARGE_FILE', 'error', null, '最多检查10000条字幕，请拆分后处理。'));
      return result;
    }
    const isVtt = /^WEBVTT(?:[\t ]|\n|$)/.test(blocks[0]);
    if (isVtt) {
      result.format = 'vtt';
      const header = blocks.shift().split('\n');
      if (header.length > 1) result.advancedVtt = true;
    }
    let blockNo = 0;
    for (const block of blocks) {
      if (isVtt && /^(NOTE|STYLE|REGION)(?:[\t ]|\n|$)/.test(block)) {
        result.advancedVtt = true; continue;
      }
      blockNo += 1;
      const lines = block.split('\n');
      let position = lines[0].includes('-->') ? 0 : 1;
      const id = position === 1 ? lines[0].trim() : '';
      const timing = lines[position];
      const match = timing && /^(\S+)[\t ]+-->[\t ]+(\S+)(.*)$/.exec(timing.trim());
      if (!match || (!isVtt && (!/^\d+$/.test(id) || position !== 1))) {
        result.issues.push(issue('INVALID_BLOCK', 'error', blockNo, '第' + blockNo + '块格式不完整；不会静默丢弃并导出。'));
        continue;
      }
      const start = timeMs(match[1]), end = timeMs(match[2]);
      const validSyntax = isVtt || (/^\d{2,}:\d{2}:\d{2},\d{3}$/.test(match[1]) && /^\d{2,}:\d{2}:\d{2},\d{3}$/.test(match[2]));
      if (start === null || end === null || !validSyntax) {
        result.issues.push(issue('INVALID_TIME', 'error', blockNo, '检查小时、分钟、秒和毫秒格式；SRT使用逗号。'));
        continue;
      }
      const settings = match[3].trim();
      if (settings) {
        if (isVtt) result.advancedVtt = true;
        else result.issues.push(issue('INVALID_BLOCK', 'error', blockNo, 'SRT时间行带有无法保留的附加字段。'));
      }
      const cue = { number: result.cues.length + 1, sourceBlock: blockNo, id, start, end, text: lines.slice(position + 1).join('\n'), settings };
      if (isVtt && /<(?!\/?(?:b|i|u)>)[^>]+>/i.test(cue.text)) result.advancedVtt = true;
      result.cues.push(cue);
      if (end <= start) result.issues.push(issue('BAD_DURATION', 'error', cue.number, '请核对原片；不会自动猜测正确时间。'));
      if (!isVtt && Number(id) !== cue.number) result.issues.push(issue('SEQUENCE', 'warning', cue.number, '源编号' + id + '，导出时将连续编号。'));
    }
    result.blockCount = blockNo;
    if (result.advancedVtt) result.issues.push(issue('VTT_LAYOUT', 'warning', null, '高级VTT可以检查和导出报告；字幕导出已关闭，避免丢失布局、注释或样式。'));
    if (!result.cues.length && !result.issues.some(x => x.severity === 'error')) result.issues.push(issue('EMPTY_FILE', 'error', null, '未找到可检查字幕。'));
    return result;
  }
  function options(config) {
    const out = Object.assign({}, PRESETS.chinese, config || {});
    for (const k of ['maxChars', 'maxLines', 'minDuration', 'maxCps']) {
      if (!Number.isFinite(out[k]) || out[k] <= 0) throw new Error('规则必须是正数：' + k);
    }
    if (!Number.isInteger(out.maxChars) || !Number.isInteger(out.maxLines)) throw new Error('每行字数和行数必须是整数');
    return out;
  }
  function analyze(input, config) {
    const rules = options(config), parsed = parse(input);
    const issues = parsed.issues.slice();
    let previousStart = -1, maxEnd = -1, maxEndCue = null;
    let characters = 0;
    for (const c of parsed.cues) {
      const duration = (c.end - c.start) / 1000;
      const chars = length(c.text);
      characters += chars;
      if (!plain(c.text).trim()) issues.push(issue('EMPTY_TEXT', 'warning', c.number, '请删除或补充内容；本工具保留原字幕。'));
      if (c.start < previousStart) issues.push(issue('OUT_OF_ORDER', 'error', c.number, '字幕开始时间早于前一条，需核对后再导出。'));
      previousStart = c.start;
      if (c.start < maxEnd) issues.push(issue('OVERLAP', 'warning', c.number, '与第' + maxEndCue + '条时间重叠' + ((maxEnd - c.start) / 1000).toFixed(3) + '秒，请核对是否有意同时显示。', { relatedCue: maxEndCue }));
      if (c.end > maxEnd) { maxEnd = c.end; maxEndCue = c.number; }
      if (duration > 0 && duration < rules.minDuration) issues.push(issue('SHORT_CUE', 'warning', c.number, '显示' + duration.toFixed(3) + '秒，低于' + rules.minDuration + '秒。'));
      if (duration > 0 && chars / duration > rules.maxCps) issues.push(issue('TOO_FAST', 'warning', c.number, (chars / duration).toFixed(1) + '字/秒，高于' + rules.maxCps + '字/秒。'));
      const lines = c.text.split('\n');
      const longest = Math.max(...lines.map(length));
      if (longest > rules.maxChars) issues.push(issue('LONG_LINE', 'warning', c.number, '最长一行' + longest + '字，阈值' + rules.maxChars + '字。'));
      if (lines.length > rules.maxLines) issues.push(issue('MANY_LINES', 'warning', c.number, lines.length + '行，阈值' + rules.maxLines + '行。'));
      if (/<[^>]*>/.test(c.text)) issues.push(issue('MARKUP', 'info', c.number, '格式标签会保留，自动折行跳过此条。'));
    }
    const priority = { error: 0, warning: 1, info: 2 };
    const categoryOrder = { OVERLAP: 0, SHORT_CUE: 1, TOO_FAST: 2, LONG_LINE: 3, MANY_LINES: 4, EMPTY_TEXT: 5, SEQUENCE: 6 };
    issues.sort((a, b) => priority[a.severity] - priority[b.severity] ||
      (categoryOrder[a.code] == null ? 10 : categoryOrder[a.code]) - (categoryOrder[b.code] == null ? 10 : categoryOrder[b.code]) ||
      (a.cue || 0) - (b.cue || 0));
    return {
      version: VERSION, format: parsed.format, cues: parsed.cues, issues, rules,
      advancedVtt: parsed.advancedVtt, canExport: !parsed.advancedVtt && !issues.some(x => x.severity === 'error'),
      summary: {
        cues: parsed.cues.length, blocks: parsed.blockCount, characters,
        durationSeconds: parsed.cues.length ? Math.max(...parsed.cues.map(x => x.end)) / 1000 : 0,
        errors: issues.filter(x => x.severity === 'error').length,
        warnings: issues.filter(x => x.severity === 'warning').length,
        affectedCues: new Set(issues.filter(x => x.cue !== null && x.severity !== 'info').map(x => x.cue)).size
      }
    };
  }
  function wrap(text, width) {
    if (!Number.isInteger(width) || width <= 0) throw new Error('折行宽度必须为正整数');
    if (/<[^>]*>/.test(text)) return text;
    const lines = [];
    for (const original of text.split('\n')) {
      if (length(original) <= width) { lines.push(original); continue; }
      // Greedy grapheme wrapping, preferring whitespace/punctuation near the limit.
      let rest = graphemes(original);
      while (rest.length) {
        if (length(rest.join('')) <= width) { lines.push(rest.join('')); break; }
        let visible = 0, cut = 0, preferred = 0;
        for (; cut < rest.length; cut++) {
          if (!/\s/.test(rest[cut])) visible++;
          if (visible > width) break;
          if ((/\s|[，。！？；、,.!?;]/.test(rest[cut])) && visible >= width * 0.55) preferred = cut + 1;
        }
        cut = preferred || Math.max(1, cut);
        lines.push(rest.slice(0, cut).join(''));
        rest = rest.slice(cut);
      }
    }
    return lines.join('\n');
  }
  function exportSubtitles(report, config) {
    if (!report.canExport) throw new Error('存在阻断错误或高级VTT；请先修正输入，报告仍可导出。');
    const cfg = Object.assign({ format: 'srt', offsetMs: 0, rewrap: false }, config || {});
    if (!['srt', 'vtt'].includes(cfg.format)) throw new Error('导出仅支持SRT或VTT');
    if (!Number.isSafeInteger(cfg.offsetMs)) throw new Error('偏移必须是整数毫秒');
    const vtt = cfg.format === 'vtt';
    const blocks = report.cues.map((c, i) => {
      const start = c.start + cfg.offsetMs, end = c.end + cfg.offsetMs;
      if (start < 0 || end < 0) throw new Error('偏移产生负时间；未导出，不裁切字幕。');
      const text = cfg.rewrap ? wrap(c.text, report.rules.maxChars) : c.text;
      const id = vtt ? c.id || String(i + 1) : String(i + 1);
      return id + '\n' + timestamp(start, vtt) + ' --> ' + timestamp(end, vtt) + '\n' + text;
    });
    return (vtt ? 'WEBVTT\n\n' : '') + blocks.join('\n\n') + '\n';
  }
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function exportCsv(report) {
    return '\uFEFF' + [['级别', '字幕序号', '检查项', '说明'], ...report.issues.map(x => [x.severity, x.cue, x.label, x.message])]
      .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
  }
  function exportHtml(report, filename) {
    const h = escapeHtml;
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>字幕交付检查报告</title><style>body{font:16px/1.6 system-ui;max-width:960px;margin:40px auto;padding:24px;color:#1b292e}h1{font-size:28px}table{border-collapse:collapse;width:100%}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}code,pre{white-space:pre-wrap}small{color:#52616a}@media print{body{margin:0}}</style>' +
      '<h1>字幕交付检查报告</h1><p>' + h(filename || '未命名字幕') + ' · CaptionCheck ' + VERSION + '</p><p>' +
      report.summary.cues + '条字幕 · ' + report.summary.errors + '项阻断错误 · ' + report.summary.warnings + '项提醒</p>' +
      '<p><small>规则：每行' + report.rules.maxChars + '字，最多' + report.rules.maxLines + '行；最短' + report.rules.minDuration + '秒；最大' + report.rules.maxCps + '字/秒。阈值是可调整的工作规则，不是平台认证。未核对音频、错别字、翻译或语义。</small></p>' +
      '<table><thead><tr><th>级别</th><th>字幕</th><th>问题</th><th>说明</th></tr></thead><tbody>' +
      report.issues.map(x => '<tr><td>' + h(x.severity) + '</td><td>' + h(x.cue == null ? '文件' : x.cue) + '</td><td>' + h(x.label) + '</td><td>' + h(x.message) + '</td></tr>').join('') +
      '</tbody></table><h2>原字幕内容</h2>' + report.cues.map(c => '<p><b>#' + c.number + ' ' + timestamp(c.start) + ' → ' + timestamp(c.end) + '</b></p><pre>' + h(c.text) + '</pre>').join('') + '</html>';
  }
  return { VERSION, PRESETS, LABELS, parse, analyze, options, timeMs, timestamp, length, wrap, exportSubtitles, exportCsv, exportHtml };
});
