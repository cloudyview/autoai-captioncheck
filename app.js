(function () {
  'use strict';
  const cc = window.CaptionCheck;
  const $ = id => document.getElementById(id);
  let report = null, currentName = 'captioncheck', reportInput = '';
  const demo = '1\n00:00:00,000 --> 00:00:02,800\n字幕生成以后，还需要最后一道检查。\n\n3\n00:00:02,600 --> 00:00:02,950\n这一条闪得太快，而且还与上一条重叠。\n\n4\n00:00:03,000 --> 00:00:07,800\n如果一整句话挤在同一行，手机上的观众就很难一眼看完这段内容。\n\n5\n00:00:08,000 --> 00:00:12,000\n把问题逐条列出来\n才知道哪里需要改\n哪里值得回看原片\n\n6\n00:00:12,200 --> 00:00:15,200\n检查完成后，导出报告交付给客户。\n';
  function message(text, error) { $('message').textContent = text; $('message').classList.toggle('error', Boolean(error)); }
  function getRules() {
    return cc.options(Object.fromEntries(['maxChars', 'maxLines', 'minDuration', 'maxCps'].map(k => [k, Number($(k).value)])));
  }
  function invalidate() {
    report = null;
    for (const id of ['htmlReport', 'csvReport', 'jsonReport', 'subtitleExport']) $(id).disabled = true;
    for (const id of ['cueCount', 'errorCount', 'warningCount']) $(id).textContent = '—';
    $('reportTag').textContent = '内容已更新，待检查'; $('reportTag').className = 'report-tag';
    $('results').replaceChildren();
    const p = document.createElement('p'); p.className = 'small-note'; p.textContent = '请点击“检查字幕”，旧报告已作废。'; $('results').append(p);
  }
  function renderIssues() {
    if (!report) return;
    $('results').replaceChildren();
    const selected = report.issues.filter(x => $('filter').value === 'all' || x.severity === $('filter').value);
    if (!selected.length) {
      const box = document.createElement('div'); box.className = 'empty-state';
      const title = document.createElement('h3'); title.textContent = report.issues.length ? '当前筛选下没有问题。' : '未触发当前检查规则。';
      const p = document.createElement('p'); p.textContent = '仍需人工核对文字、语义和原片同步。'; box.append(title, p); $('results').append(box); return;
    }
    for (const item of selected) {
      const el = document.createElement('article'); el.className = 'issue';
      const top = document.createElement('div'); top.className = 'issue-top';
      const level = document.createElement('span'); level.className = 'severity ' + item.severity;
      level.textContent = { error: '阻断', warning: '提醒', info: '说明' }[item.severity];
      const label = document.createElement('strong'); label.textContent = item.label;
      const cue = document.createElement('span'); cue.className = 'cue-ref'; cue.textContent = item.cue == null ? '文件' : '#' + item.cue;
      top.append(level, label, cue);
      const detail = document.createElement('p'); detail.textContent = item.message; el.append(top, detail);
      const c = report.cues.find(c => c.number === item.cue);
      if (c) { const preview = document.createElement('div'); preview.className = 'cue-preview'; preview.textContent = c.text; el.append(preview); }
      $('results').append(el);
    }
  }
  function analyze() {
    try {
      reportInput = $('input').value; report = cc.analyze(reportInput, getRules());
      $('cueCount').textContent = report.summary.cues;
      $('errorCount').textContent = report.summary.errors;
      $('warningCount').textContent = report.summary.warnings;
      const tag = $('reportTag'); tag.className = 'report-tag';
      if (report.summary.errors) { tag.textContent = '先修正阻断错误'; tag.classList.add('error'); }
      else if (report.summary.warnings) { tag.textContent = '有提醒需要核对'; tag.classList.add('warning'); }
      else tag.textContent = '未触发当前规则';
      for (const id of ['htmlReport', 'csvReport', 'jsonReport']) $(id).disabled = false;
      $('subtitleExport').disabled = !report.canExport; renderIssues();
      message(report.canExport ? '报告已生成。字幕导出保留原文字和时间；折行与时间偏移需要你选择。' : '报告已生成。字幕导出已关闭，请先修正阻断错误或改用普通字幕文件。');
    } catch (err) { invalidate(); message(err.message, true); }
  }
  async function loadFile(file) {
    if (!file) return;
    invalidate();
    if (!/\.(srt|vtt)$/i.test(file.name)) { message('请选择 .srt 或 .vtt 文件。', true); return; }
    if (file.size > 5 * 1024 * 1024) { message('文件超过5MB，请拆分后检查。', true); return; }
    try {
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      currentName = file.name.replace(/\.(srt|vtt)$/i, ''); $('filename').textContent = file.name;
      $('input').value = text; analyze();
    } catch (err) { message('无法读取UTF-8字幕，请先在原软件转存为UTF-8。', true); }
  }
  function download(content, extension, type) {
    if (!report || reportInput !== $('input').value) { invalidate(); message('字幕已改变，请重新检查。', true); return; }
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = currentName.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 100) + extension;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('analyze').addEventListener('click', analyze);
  $('loadDemo').addEventListener('click', () => { $('input').value = demo; currentName = '问题样品'; $('filename').textContent = '自创问题样品.srt'; analyze(); });
  $('file').addEventListener('change', e => loadFile(e.target.files[0]));
  $('input').addEventListener('input', invalidate);
  for (const id of ['maxChars', 'maxLines', 'minDuration', 'maxCps']) $(id).addEventListener('input', invalidate);
  $('preset').addEventListener('change', () => { for (const [key, val] of Object.entries(cc.PRESETS[$('preset').value])) $(key).value = val; invalidate(); });
  $('filter').addEventListener('change', renderIssues);
  const zone = $('dropzone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); loadFile(e.dataTransfer.files[0]); });
  $('htmlReport').addEventListener('click', () => download(cc.exportHtml(report, currentName), '.report.html', 'text/html;charset=utf-8'));
  $('csvReport').addEventListener('click', () => download(cc.exportCsv(report), '.report.csv', 'text/csv;charset=utf-8'));
  $('jsonReport').addEventListener('click', () => download(JSON.stringify(report, null, 2), '.report.json', 'application/json'));
  $('subtitleExport').addEventListener('click', () => {
    try {
      const format = $('exportFormat').value;
      const text = cc.exportSubtitles(report, { format, offsetMs: Number($('offset').value), rewrap: $('rewrap').checked });
      download(text, '.normalized.' + format);
      message('已导出。请在原剪辑软件检查；结构检查不能替代原片核对。');
    } catch (err) { message(err.message, true); }
  });
})();
