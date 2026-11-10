/* AI AGENT for the portfolio site: one file that adds the chat button, the chat window and the agent.
   Load it after the dashboard page script:  <script src="agent.js"></script>
   - With the backend running and ANTHROPIC_API_KEY set, questions go to Claude (via /api/agent).
   - Otherwise a built-in assistant answers by itself in the browser.
   It reads and filters the dashboard through window.Dashboard (defined in index.html). */
(function () {
  var D = window.Dashboard;
  if (!D) return;
  var API = D.api, data = null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var st = document.createElement('style');
  st.textContent = `/* AI agent chat */
.chat-fab{position:fixed;right:1rem;bottom:calc(1rem + env(safe-area-inset-bottom,0px));z-index:50;border:0;border-radius:999px;padding:.8rem 1.3rem;font-weight:700;font-size:1rem;color:#fff;background:linear-gradient(120deg,#7c3aed,#ec4899 60%,#f97316);box-shadow:0 10px 24px -8px rgba(124,58,237,.7);cursor:pointer}
.chat{padding:0;position:fixed;right:1rem;bottom:calc(4.6rem + env(safe-area-inset-bottom,0px));z-index:50;width:min(25rem,calc(100vw - 2rem));max-height:min(36rem,calc(100vh - 7rem));display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 50px -16px rgba(40,20,100,.55);overflow:hidden}
.chat[hidden]{display:none}
.chat-head{display:flex;align-items:center;gap:.6rem;padding:.8rem 1rem;color:#fff;background:linear-gradient(120deg,#6d28d9,#db2777)}
.chat-head small{opacity:.9;margin-left:auto}
.chat-head button{background:none;border:0;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1}
.log{padding:1rem;overflow-y:auto;display:grid;gap:.6rem;flex:1;min-height:8rem;align-content:start}
.msg{padding:.6rem .85rem;border-radius:14px;max-width:92%;font-size:.95rem;line-height:1.45}
.msg.bot{background:var(--track);justify-self:start}
.msg.me{background:linear-gradient(120deg,#7c3aed,#ec4899);color:#fff;justify-self:end}
.msg a{color:inherit;font-weight:700}
.sugg{display:flex;gap:.4rem;flex-wrap:wrap;padding:0 1rem .6rem}
.sugg button{font:600 .8rem Figtree,sans-serif;border:1.5px solid var(--pink);background:transparent;color:var(--ink);border-radius:999px;padding:.25rem .7rem;cursor:pointer}
.sugg button:hover{background:var(--pink);color:#fff}
.chat form{display:flex;gap:.5rem;padding:.7rem;border-top:1px solid var(--line)}
.chat input{flex:1;min-width:0;font:inherit;padding:.6rem .85rem;border-radius:999px;border:2px solid var(--line);background:var(--bg);color:var(--ink)}
.chat input:focus{border-color:var(--violet);outline:none}
.chat form button{border:0;border-radius:999px;padding:.6rem 1.1rem;font-weight:700;color:#fff;background:var(--violet);cursor:pointer}`;
  document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', `<button type="button" class="chat-fab" id="chat-open" aria-expanded="false" aria-controls="chat">Ask my AI agent</button>
<section class="chat" id="chat" hidden aria-label="AI agent chat">
<div class="chat-head"><b>AI agent</b><small id="agent-mode"></small><button type="button" id="chat-close" aria-label="Close chat">×</button></div>
<div class="log" id="chat-log" aria-live="polite"></div>
<div class="sugg" id="sugg"></div>
<form id="chat-form"><input id="chat-in" maxlength="300" placeholder="Ask about the data or my projects" aria-label="Your question" autocomplete="off"><button type="submit">Send</button></form>
</section>`);

  // ===== AI agent: asks the backend (Claude) first, falls back to a built-in assistant =====
  var chatLog = $('chat-log'), hist = [], agentMode = null, greeted = false;
  var FACTS = {
    projects: 'I have built 8 projects: <b>2 Tableau</b> dashboards (HR Analytics, Sales &amp; Customer), <b>4 Power BI</b> reports (My First Dashboard, Data Cleaning with Power Query, Data Modeling, Clean Model) and <b>2 SQL</b> projects (a data warehouse and a 13-script analytics project). <a href="#projects">See them here</a>.',
    sql: 'My SQL work is SQL Server (T-SQL). One project is a <b>data warehouse</b>: raw CRM and ERP files load into bronze, get cleaned in silver, and become a star schema in gold. The other has <b>13 analysis scripts</b>: ranking, running totals, year-over-year, segmentation and two report views. <a href="#warehouse">How the warehouse works</a>.',
    tableau: 'In Tableau I built an <b>HR Analytics</b> dashboard (headcount, attrition, salary, age and education breakdowns, a state map) and <b>Sales &amp; Customer</b> dashboards with KPIs and a filter panel that shows and hides on click.',
    powerbi: 'In Power BI I built four reports: a first dashboard with bar, line and donut charts and a slicer, plus work on <b>Power Query cleaning</b> and <b>data modeling</b> (related tables, cards and tables).',
    skills: 'My skills: <b>SQL</b> (CTEs, window functions, views, ETL), <b>Power BI</b>, <b>Tableau</b>, <b>Python</b> (pandas, NumPy) and <b>JavaScript</b> (this dashboard and agent). <a href="#skills">Skills section</a>.',
    contact: 'You can reach me by email at <a href="mailto:you@example.com">you@example.com</a> or use the contact form at the bottom of the page. <a href="#contact">Go to contact</a>.',
    data: 'The dashboard uses <b>8,950 synthetic employee records</b> I generated with a Python script (pandas and NumPy), so the figures demonstrate analysis, not a real company.',
    about: 'I am a data analyst who works across SQL, Power BI and Tableau, and this site shows that work. Ask about my projects or try filtering the data, for example "show terminated employees in Sales".'
  };
  function say(who, html) { var d = document.createElement('div'); d.className = 'msg ' + who; d.innerHTML = html; chatLog.appendChild(d); chatLog.scrollTop = chatLog.scrollHeight; return d; }
  function summary() {
    var d = data, t = d.terminated;
    return 'Showing <b>' + d.total.toLocaleString() + '</b> employees (' + (d.total - t).toLocaleString() + ' active, ' + t.toLocaleString() + ' terminated). Attrition ' +
      (d.total ? (t / d.total * 100).toFixed(1) : '0') + '%, average salary <b>$' + d.avg_salary.toLocaleString() + '</b>, average age ' + d.avg_age + '.';
  }
  function applyAction(a) { return D.apply(a).then(function () { data = D.data(); }); }
  function localAgent(text) {
    data = D.data();
    var q = text.toLowerCase(), f = {}, found = false, i;
    function add(k, n) { if (!f[k]) f[k] = []; if (f[k].indexOf(n) < 0) f[k].push(n); found = true; }
    if (/\b(reset|clear|start over|remove (all )?filters)\b/.test(q)) return applyAction({}).then(function () { return 'Filters cleared. ' + summary(); });
    if (!data) return Promise.resolve('The data is still loading. Please try again in a moment.');
    Object.keys(data.dims).forEach(function (k) {
      data.dims[k].forEach(function (x) {
        var n = x.name.toLowerCase();
        var hit = n === 'it' ? (/\bIT\b/.test(text) || /\bit (dept|department|team|staff|employees|people)\b/.test(q)) :
          new RegExp('(^|[^a-z0-9])' + n.replace(/[^a-z0-9 ]/g, '\\$&') + '($|[^a-z0-9])').test(q);
        if (hit) add(k, x.name);
      });
    });
    [[/\b(women|woman)\b/, 'gender', 'Female'], [/\b(men|man)\b/, 'gender', 'Male'], [/top performers?/, 'perf', 'Excellent'], [/low performers?|underperform/, 'perf', 'Needs Improvement'],
      [/under 25|young/, 'age', 'Under 25'], [/25 ?(-|to) ?34/, 'age', '25–34'], [/35 ?(-|to) ?44/, 'age', '35–44'], [/45 ?(-|to) ?54/, 'age', '45–54']]
      .forEach(function (a) { if (a[0].test(q)) add(a[1], a[2]); });
    var st = /\b(terminated|left|quit|resigned|departed)\b/.test(q) ? 'term' : /\b(active|current)\b/.test(q) ? 'active' : null;
    i = data.insight;
    if (/attrition|turnover/.test(q) && !found && !st)
      return applyAction({}).then(function () {   // compare departments across everyone, not just the filtered group
        var j = data.insight;
        return j.attrition ? 'Across all employees, <b>' + esc(j.attrition.name) + '</b> has the highest attrition at ' + j.attrition.rate + '%. ' + summary() : 'Not enough employees to compare departments.';
      });
    if (found || st) {
      f.status = st || 'all';
      return applyAction(f).then(function () {
        var names = []; Object.keys(data.dims).forEach(function (k) { names = names.concat(f[k] || []); });
        return (names.length ? 'Filtered to <b>' + esc(names.join(', ')) + '</b>' + (st ? ' (' + (st === 'term' ? 'terminated' : 'active') + ')' : '') + '. ' : (st === 'term' ? 'Showing terminated employees. ' : 'Showing active employees. ')) + summary() + ' The charts above are updated.';
      });
    }
    var out;
    if (/largest|biggest/.test(q) && /dep/.test(q)) out = i.largest ? 'The largest department in view is <b>' + esc(i.largest.name) + '</b> with ' + i.largest.count.toLocaleString() + ' employees.' : 'No employees in view.';
    else if (/(highest|best)[ -]?paid|highest salary|pays? (the )?most/.test(q)) {
      var b = data.dims.dept.slice().sort(function (x, y) { return y.avg - x.avg; })[0];
      out = 'The best-paid department in view is <b>' + esc(b.name) + '</b>, averaging $' + b.avg.toLocaleString() + '.';
    }
    else if (/salary|\bpay\b|paid/.test(q)) out = 'Average salary in the current view is <b>$' + data.avg_salary.toLocaleString() + '</b>. Try a group, like "average salary of PhD holders".';
    else if (/average age|how old/.test(q)) out = 'Average age in the current view is <b>' + data.avg_age + '</b>.';
    else if (/how many|headcount|number of|total/.test(q)) out = summary();
    else if (/sql|warehouse|etl|bronze|silver|gold/.test(q)) out = FACTS.sql;
    else if (/tableau/.test(q)) out = FACTS.tableau;
    else if (/power ?bi/.test(q)) out = FACTS.powerbi;
    else if (/project|built|portfolio|work/.test(q)) out = FACTS.projects;
    else if (/skill|tools?|stack|python/.test(q)) out = FACTS.skills;
    else if (/contact|hire|email|reach|resume/.test(q)) out = FACTS.contact;
    else if (/synthetic|dataset|where.*data|data.*from/.test(q)) out = FACTS.data;
    else if (/who|about|yourself|introduce/.test(q)) out = FACTS.about;
    else out = 'I can filter the dashboard (try "show IT employees with excellent performance"), answer questions about the data ("which department has the highest attrition?"), or tell you about my projects and skills.';
    return Promise.resolve(out);
  }
  function fmtReply(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }
  function setMood(m) { agentMode = m; $('agent-mode').textContent = m === 'claude' ? 'Powered by Claude' : 'Built-in assistant'; }
  function ask(text) {
    say('me', esc(text));
    var wait = say('bot', '…'), ctx = D.filters();
    var viaApi = agentMode === 'local' ? Promise.reject(new Error('local')) :
      fetch(API + '/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: hist.slice(-6), filters: ctx }) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    viaApi.then(function (j) {
      setMood('claude');
      hist.push({ role: 'user', content: text }, { role: 'assistant', content: j.reply });
      return (j.action ? applyAction(j.action) : Promise.resolve()).then(function () { wait.innerHTML = fmtReply(j.reply); });
    }, function () {
      setMood('local');
      return localAgent(text).then(function (html) { wait.innerHTML = html; });
    }).catch(function () { wait.textContent = 'Sorry, something went wrong. Please try again.'; })
      .then(function () { chatLog.scrollTop = chatLog.scrollHeight; });
  }
  var box = $('chat'), fab = $('chat-open');
  function setOpen(o) {
    box.hidden = !o; fab.setAttribute('aria-expanded', o);
    if (o) { $('chat-in').focus(); if (!greeted) { greeted = true; say('bot', 'Hi! I am the AI agent for this portfolio. Ask me about the data and I will filter the dashboard for you, or ask about my projects.'); } }
  }
  fab.addEventListener('click', function () { setOpen(box.hidden); });
  $('chat-close').addEventListener('click', function () { setOpen(false); fab.focus(); });
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setOpen(false); fab.focus(); } });
  ['Show IT employees with excellent performance', 'Which department has the highest attrition?', 'What projects have you built?', 'Average salary of PhD holders'].forEach(function (s) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.addEventListener('click', function () { ask(s); }); $('sugg').appendChild(b);
  });
  $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); var v = $('chat-in').value.trim(); if (v) { $('chat-in').value = ''; ask(v); } });
})();
