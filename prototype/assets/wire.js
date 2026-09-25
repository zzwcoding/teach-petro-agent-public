/* Petro-Agent 低保真原型 · 共享假数据交互库（零依赖，data 属性驱动）
 * 用法示例：
 *   ① Tab 切换：容器加 data-tabs，按钮加 data-tab="x"，面板加 data-panel="x"
 *   ② 开关反馈：按钮加 data-toggle="目标id"，目标元素会被切 .on/.off 样式
 *   ③ 逐步点亮（状态机泳道/管线进度）：容器加 data-runflow，子节点按序点亮，
 *      每步可同时 reveal 一个详情面板（节点加 data-reveal="面板id"）
 *   ④ 模拟异步：data-runflow 容器可加 data-step-ms="600" 控制步间毫秒
 */
(function () {
  // ① Tab 切换
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var btns = box.querySelectorAll('[data-tab]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.toggle('on', x === b); });
        var scope = box.parentElement || document;
        scope.querySelectorAll('[data-panel]').forEach(function (p) {
          p.style.display = (p.getAttribute('data-panel') === b.getAttribute('data-tab')) ? '' : 'none';
        });
      });
    });
  });

  // ② 开关反馈
  document.querySelectorAll('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById(b.getAttribute('data-toggle'));
      if (t) t.classList.toggle('on');
      b.classList.toggle('on');
    });
  });

  // ③ 逐步点亮 + 面板揭示
  document.querySelectorAll('[data-runflow]').forEach(function (flow) {
    var steps = Array.prototype.slice.call(flow.querySelectorAll('[data-step]'));
    var ms = parseInt(flow.getAttribute('data-step-ms') || '700', 10);
    // 初始：全部未完成
    steps.forEach(function (s) { s.classList.add('todo'); });
    flow.addEventListener('click', function () {
      // 重跑：复位后逐步点亮
      steps.forEach(function (s) {
        s.classList.remove('done', 'fail', 'active', 'todo');
        s.classList.add('todo');
        var r = s.getAttribute('data-reveal');
        if (r) { var rp = document.getElementById(r); if (rp) rp.style.display = 'none'; }
      });
      var i = 0;
      (function next() {
        if (i > 0) {
          var prev = steps[i - 1];
          prev.classList.remove('active');
          prev.classList.add(prev.getAttribute('data-fail') ? 'fail' : 'done');
        }
        if (i >= steps.length) return;
        var s = steps[i++];
        s.classList.remove('todo');
        s.classList.add('active');
        var r = s.getAttribute('data-reveal');
        if (r) { var rp = document.getElementById(r); if (rp) rp.style.display = ''; }
        setTimeout(next, ms);
      })();
    });
  });

  // ④ 弹层（基于 details 的轻封装：点遮罩关闭）
  document.querySelectorAll('details.mock-modal').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) {
        var closer = function (e) {
          if (!d.contains(e.target)) { d.open = false; document.removeEventListener('click', closer); }
        };
        setTimeout(function () { document.addEventListener('click', closer); }, 0);
      }
    });
  });
})();
