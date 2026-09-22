(() => {
  'use strict';

  const STORAGE_KEY = 'moodDiary.entries.v1';
  const MOOD_META = {
    5: { emoji: '😄', label: '很好', color: 'var(--mood-5)' },
    4: { emoji: '🙂', label: '不错', color: 'var(--mood-4)' },
    3: { emoji: '😐', label: '一般', color: 'var(--mood-3)' },
    2: { emoji: '😔', label: '低落', color: 'var(--mood-2)' },
    1: { emoji: '😣', label: '很糟', color: 'var(--mood-1)' },
  };

  // ---------- storage ----------
  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
  function addEntry(entry) {
    const entries = loadEntries();
    entries.push(entry);
    saveEntries(entries);
  }
  function deleteEntry(id) {
    const entries = loadEntries().filter(e => e.id !== id);
    saveEntries(entries);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function fmtShort(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function fmtFull(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  // ---------- navigation ----------
  const views = ['home', 'log', 'insight', 'care', 'history'];
  function showView(name) {
    views.forEach(v => {
      document.getElementById('view-' + v).classList.toggle('active', v === name);
    });
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === name);
    });
    if (name === 'home') renderHome();
    if (name === 'insight') renderInsight();
    if (name === 'care') renderCare();
    if (name === 'history') renderHistory();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) showView(navEl.dataset.nav);
  });

  // ---------- log form state ----------
  let selectedMood = null;
  const selectedTags = new Set();

  document.getElementById('moodPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.mood-opt');
    if (!btn) return;
    selectedMood = Number(btn.dataset.mood);
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.toggle('selected', el === btn));
  });

  document.getElementById('triggerPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-opt');
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (selectedTags.has(tag)) { selectedTags.delete(tag); btn.classList.remove('selected'); }
    else { selectedTags.add(tag); btn.classList.add('selected'); }
  });

  const intensityInput = document.getElementById('intensity');
  intensityInput.addEventListener('input', () => {
    document.getElementById('intensityVal').textContent = intensityInput.value;
  });

  document.getElementById('saveEntryBtn').addEventListener('click', () => {
    if (!selectedMood) {
      document.getElementById('moodPicker').style.outline = '2px solid var(--danger)';
      setTimeout(() => { document.getElementById('moodPicker').style.outline = ''; }, 900);
      return;
    }
    const entry = {
      id: uid(),
      ts: Date.now(),
      mood: selectedMood,
      intensity: Number(intensityInput.value),
      tags: Array.from(selectedTags),
      note: document.getElementById('note').value.trim(),
    };
    addEntry(entry);

    // reset form
    selectedMood = null;
    selectedTags.clear();
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.tag-opt').forEach(el => el.classList.remove('selected'));
    intensityInput.value = 3;
    document.getElementById('intensityVal').textContent = '3';
    document.getElementById('note').value = '';

    const confirmEl = document.getElementById('saveConfirm');
    confirmEl.hidden = false;
    confirmEl.textContent = '已记录，感谢你花时间关照自己的情绪 🌱';
    setTimeout(() => { confirmEl.hidden = true; }, 2200);

    showView('home');
  });

  // ---------- analytics helpers ----------
  function dailyAverages(numDays) {
    const entries = loadEntries();
    const today = startOfDay(Date.now());
    const days = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const dayStart = today - i * 86400000;
      const key = dayKey(dayStart);
      const dayEntries = entries.filter(e => dayKey(e.ts) === key);
      const avg = dayEntries.length
        ? dayEntries.reduce((s, e) => s + e.mood, 0) / dayEntries.length
        : null;
      days.push({ ts: dayStart, avg, count: dayEntries.length });
    }
    return days;
  }

  function moodColorForScore(score) {
    if (score == null) return null;
    const lo = Math.max(1, Math.min(5, Math.round(score)));
    return MOOD_META[lo].color;
  }

  // ---------- SVG line chart ----------
  function buildTrendSVG(days) {
    const W = Math.max(days.length * 34, 280);
    const H = 140;
    const padL = 18, padR = 18, padT = 14, padB = 22;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const stepX = days.length > 1 ? innerW / (days.length - 1) : 0;
    const yFor = (score) => padT + innerH - ((score - 1) / 4) * innerH;

    let gridLines = '';
    [1, 2, 3, 4, 5].forEach(v => {
      const y = yFor(v);
      gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
    });

    let pathD = '';
    let dots = '';
    let started = false;
    days.forEach((d, i) => {
      const x = padL + i * stepX;
      if (d.avg != null) {
        const y = yFor(d.avg);
        pathD += (started ? ' L ' : 'M ') + x + ' ' + y;
        started = true;
        const color = moodColorForScore(d.avg);
        dots += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="var(--card-bg)" stroke-width="1.5"/>`;
      } else {
        started = false;
      }
    });

    let labels = '';
    const labelEvery = days.length > 14 ? 5 : (days.length > 7 ? 2 : 1);
    days.forEach((d, i) => {
      if (i % labelEvery === 0 || i === days.length - 1) {
        const x = padL + i * stepX;
        labels += `<text x="${x}" y="${H - 6}" font-size="9" fill="var(--text-muted)" text-anchor="middle">${fmtShort(d.ts)}</text>`;
      }
    });

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet">
      ${gridLines}
      <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${labels}
    </svg>`;
  }

  // ---------- home ----------
  function renderHome() {
    const entries = loadEntries();
    const todayKey = dayKey(Date.now());
    const hasToday = entries.some(e => dayKey(e.ts) === todayKey);
    document.getElementById('todayStatus').textContent = hasToday
      ? '今天已经记录过心情啦，可以随时补充新的一次'
      : '今天还没有记录心情，花点时间关照一下自己吧';

    const days7 = dailyAverages(7);
    document.getElementById('homeTrend').innerHTML = buildTrendSVG(days7);

    // streak
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const key = dayKey(Date.now() - i * 86400000);
      const has = entries.some(e => dayKey(e.ts) === key);
      if (has) streak++;
      else { if (i === 0) continue; break; }
    }
    document.getElementById('statStreak').textContent = streak;
    document.getElementById('statTotal').textContent = entries.length;
    const withData = days7.filter(d => d.avg != null);
    const avg7 = withData.length ? (withData.reduce((s, d) => s + d.avg, 0) / withData.length) : null;
    document.getElementById('statAvg').textContent = avg7 ? avg7.toFixed(1) : '–';

    // recommend preview
    const recent = recentMoodScore();
    const rec = getRecommendations(recent);
    const previewEl = document.getElementById('homeRecommend');
    previewEl.innerHTML = rec.quick.map(r => `
      <div class="recommend-item"><span class="ri-emoji">${r.emoji}</span><span>${r.text}</span></div>
    `).join('');
  }

  function recentMoodScore() {
    const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts).slice(0, 3);
    if (!entries.length) return null;
    return entries.reduce((s, e) => s + e.mood, 0) / entries.length;
  }

  // ---------- insight ----------
  let trendRange = 7;
  document.getElementById('trendRange').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-opt');
    if (!btn) return;
    trendRange = Number(btn.dataset.range);
    document.querySelectorAll('#trendRange .seg-opt').forEach(el => el.classList.toggle('active', el === btn));
    document.getElementById('insightTrend').innerHTML = buildTrendSVG(dailyAverages(trendRange));
  });

  function renderInsight() {
    document.getElementById('insightTrend').innerHTML = buildTrendSVG(dailyAverages(trendRange));
    renderCalendar();
    renderTriggerAnalysis();
  }

  function renderCalendar() {
    const days = dailyAverages(35);
    const el = document.getElementById('moodCalendar');
    el.innerHTML = days.map(d => {
      if (d.avg == null) {
        return `<div class="cal-cell" title="${fmtShort(d.ts)}：无记录"></div>`;
      }
      const color = moodColorForScore(d.avg);
      const opacity = 0.35 + (d.avg / 5) * 0.65;
      return `<div class="cal-cell" style="background:${color};opacity:${opacity.toFixed(2)};border-color:transparent" title="${fmtShort(d.ts)}：平均情绪 ${d.avg.toFixed(1)}"></div>`;
    }).join('');
  }

  function renderTriggerAnalysis() {
    const entries = loadEntries();
    const el = document.getElementById('triggerAnalysis');
    if (!entries.length) {
      el.innerHTML = '<div class="history-empty">还没有足够的数据，记录几次心情后，这里会显示触发因素分析。</div>';
      return;
    }
    const stats = {};
    entries.forEach(e => {
      (e.tags || []).forEach(tag => {
        if (!stats[tag]) stats[tag] = { count: 0, sum: 0 };
        stats[tag].count++;
        stats[tag].sum += e.mood;
      });
    });
    const rows = Object.entries(stats)
      .map(([tag, s]) => ({ tag, count: s.count, avg: s.sum / s.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    if (!rows.length) {
      el.innerHTML = '<div class="history-empty">还没有记录触发因素标签。</div>';
      return;
    }
    const maxCount = Math.max(...rows.map(r => r.count));
    el.innerHTML = rows.map(r => `
      <div class="trigger-row">
        <div class="trigger-row-top">
          <span>${r.tag} · ${r.count}次</span>
          <span class="muted">平均情绪 ${r.avg.toFixed(1)}</span>
        </div>
        <div class="trigger-bar-bg">
          <div class="trigger-bar-fill" style="width:${(r.count / maxCount * 100).toFixed(0)}%;background:${moodColorForScore(r.avg)}"></div>
        </div>
      </div>
    `).join('');
  }

  // ---------- self-care recommendations ----------
  const MEDITATIONS = [
    { emoji: '🌬️', title: '5分钟正念呼吸', desc: '专注于呼吸的进出，留意念头飘走时轻轻把注意力带回来。', query: '5分钟正念冥想' },
    { emoji: '🌊', title: '身体扫描放松', desc: '从头到脚逐部位放松肌肉，释放身体里积攒的紧张感。', query: '身体扫描冥想' },
    { emoji: '🙏', title: '感恩练习', desc: '写下或默念今天让你感激的三件小事，哪怕很微小。', query: '感恩冥想' },
  ];
  const MUSIC = [
    { emoji: '🎧', title: '舒缓白噪音/自然音', desc: '雨声、海浪、森林白噪音，帮助大脑放慢下来。', query: '放松 白噪音 自然音' },
    { emoji: '🎹', title: '轻钢琴 / Lo-fi', desc: '节奏平稳、无歌词的背景音乐，适合专注或休息。', query: 'lofi 轻音乐 放松' },
    { emoji: '🎶', title: '疗愈歌单', desc: '别人精心整理的低落情绪疗愈歌单，找找共鸣。', query: '情绪疗愈 歌单' },
  ];
  const EXERCISES = [
    { emoji: '🚶', title: '10分钟散步', desc: '走出房间，哪怕只是楼下转一圈，让身体先动起来。' },
    { emoji: '🤸', title: '5分钟拉伸', desc: '肩颈、背部、腿部拉伸，缓解久坐带来的紧绷。' },
    { emoji: '🧘‍♀️', title: '15分钟瑜伽', desc: '跟随任意一套入门瑜伽序列，专注呼吸与身体的连接。' },
    { emoji: '⚡', title: '短时高强度运动', desc: '跳绳/开合跳3-5分钟，让积压的情绪能量有个出口。' },
  ];

  function musicLink(query) { return 'https://music.163.com/#/search/m/?s=' + encodeURIComponent(query); }
  function meditationLink(query) { return 'https://www.xiaoyuzhoufm.com/search/' + encodeURIComponent(query); }

  function getRecommendations(score) {
    // score: null | 1-5
    let tier;
    if (score == null) tier = 'none';
    else if (score <= 2) tier = 'low';
    else if (score < 4) tier = 'mid';
    else tier = 'high';

    const introMap = {
      none: '还没有记录，先去记录一次心情，我们会根据你的状态给出更贴合的建议。',
      low: '看起来最近的情绪有点低落。先别急着"解决"它，试试下面的呼吸练习或安静地听一段音乐，给自己一点缓冲的空间。',
      mid: '情绪状态平平，不好不坏。这正是适合做一点小事，主动照顾自己一下的时候。',
      high: '最近的状态还不错，试试用运动或感恩练习延续这份好心情，也给未来的自己攒点"情绪存款"。',
    };

    const quickMap = {
      none: [{ emoji: '✍️', text: '先记录一次今天的心情' }],
      low: [
        { emoji: '🫧', text: '3分钟箱式呼吸，平复神经紧张' },
        { emoji: '🌊', text: '听一段自然白噪音，让自己静下来' },
      ],
      mid: [
        { emoji: '🚶', text: '出门走10分钟，换个环境' },
        { emoji: '🙏', text: '写下今天值得感激的一件小事' },
      ],
      high: [
        { emoji: '⚡', text: '趁状态好，做一次短时运动' },
        { emoji: '🎶', text: '收藏一份能代表此刻心情的歌单' },
      ],
    };

    return { tier, intro: introMap[tier], quick: quickMap[tier] };
  }

  function renderCare() {
    const score = recentMoodScore();
    const rec = getRecommendations(score);
    document.getElementById('careIntro').textContent = rec.intro;

    document.getElementById('meditationList').innerHTML = MEDITATIONS.map(m => `
      <div class="care-item">
        <span class="ci-emoji">${m.emoji}</span>
        <div>
          <div class="ci-title">${m.title}</div>
          <div class="ci-desc">${m.desc}</div>
          <a href="${meditationLink(m.query)}" target="_blank" rel="noopener">找一段引导音频 →</a>
        </div>
      </div>
    `).join('');

    document.getElementById('musicList').innerHTML = MUSIC.map(m => `
      <div class="care-item">
        <span class="ci-emoji">${m.emoji}</span>
        <div>
          <div class="ci-title">${m.title}</div>
          <div class="ci-desc">${m.desc}</div>
          <a href="${musicLink(m.query)}" target="_blank" rel="noopener">去听听看 →</a>
        </div>
      </div>
    `).join('');

    document.getElementById('exerciseList').innerHTML = EXERCISES.map(m => `
      <div class="care-item">
        <span class="ci-emoji">${m.emoji}</span>
        <div>
          <div class="ci-title">${m.title}</div>
          <div class="ci-desc">${m.desc}</div>
        </div>
      </div>
    `).join('');
  }

  // ---------- breathing exercise ----------
  const BREATH_PATTERNS = {
    box: [
      { phase: '吸气', seconds: 4, scale: 1.3 },
      { phase: '屏息', seconds: 4, scale: 1.3 },
      { phase: '呼气', seconds: 4, scale: 0.85 },
      { phase: '屏息', seconds: 4, scale: 0.85 },
    ],
    '478': [
      { phase: '吸气', seconds: 4, scale: 1.3 },
      { phase: '屏息', seconds: 7, scale: 1.3 },
      { phase: '呼气', seconds: 8, scale: 0.85 },
    ],
  };
  let breathMode = 'box';
  let breathRunning = false;
  let breathTimer = null;
  let breathStepIndex = 0;

  document.getElementById('breathModes').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-opt');
    if (!btn) return;
    breathMode = btn.dataset.mode;
    document.querySelectorAll('#breathModes .seg-opt').forEach(el => el.classList.toggle('active', el === btn));
    stopBreathing();
  });

  function stepBreath() {
    const pattern = BREATH_PATTERNS[breathMode];
    const step = pattern[breathStepIndex % pattern.length];
    const circle = document.getElementById('breathCircle');
    const label = document.getElementById('breathLabel');
    circle.style.transitionDuration = step.seconds + 's';
    circle.style.transform = `scale(${step.scale})`;
    label.textContent = `${step.phase} ${step.seconds}s`;
    breathStepIndex++;
    breathTimer = setTimeout(stepBreath, step.seconds * 1000);
  }

  function startBreathing() {
    breathRunning = true;
    breathStepIndex = 0;
    document.getElementById('breathToggle').textContent = '结束练习';
    stepBreath();
  }
  function stopBreathing() {
    breathRunning = false;
    clearTimeout(breathTimer);
    const circle = document.getElementById('breathCircle');
    circle.style.transitionDuration = '0.6s';
    circle.style.transform = 'scale(1)';
    document.getElementById('breathLabel').textContent = '开始';
    document.getElementById('breathToggle').textContent = '开始练习';
  }
  document.getElementById('breathToggle').addEventListener('click', () => {
    if (breathRunning) stopBreathing();
    else startBreathing();
  });

  // ---------- history ----------
  function renderHistory(filter) {
    const q = (filter || document.getElementById('historySearch').value || '').trim().toLowerCase();
    const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts);
    const filtered = entries.filter(e => {
      if (!q) return true;
      const inNote = (e.note || '').toLowerCase().includes(q);
      const inTags = (e.tags || []).some(t => t.toLowerCase().includes(q));
      return inNote || inTags;
    });
    const el = document.getElementById('historyList');
    if (!filtered.length) {
      el.innerHTML = '<div class="history-empty">没有找到记录</div>';
      return;
    }
    el.innerHTML = filtered.map(e => {
      const meta = MOOD_META[e.mood];
      const tags = (e.tags || []).map(t => `<span class="history-tag">${t}</span>`).join('');
      return `
        <div class="history-item" data-id="${e.id}">
          <div class="history-item-top">
            <span class="hi-emoji">${meta.emoji}</span>
            <span>${meta.label} · 强度${e.intensity}</span>
            <span class="history-item-date">${fmtFull(e.ts)}</span>
            <button class="history-del" data-del="${e.id}">删除</button>
          </div>
          ${tags ? `<div class="history-tags">${tags}</div>` : ''}
          ${e.note ? `<div class="history-note">${escapeHtml(e.note)}</div>` : ''}
        </div>
      `;
    }).join('');
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  document.getElementById('historySearch').addEventListener('input', () => renderHistory());
  document.getElementById('historyList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    deleteEntry(btn.dataset.del);
    renderHistory();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const data = JSON.stringify(loadEntries(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mood-diary-export-${dayKey(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('确定要清空所有情绪记录吗？此操作无法撤销，建议先导出备份。')) {
      localStorage.removeItem(STORAGE_KEY);
      renderHistory();
      renderHome();
    }
  });

  // ---------- init ----------
  showView('home');
})();
