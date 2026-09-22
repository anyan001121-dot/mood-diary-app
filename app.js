(() => {
  'use strict';

  const STORAGE_KEY = 'moodDiary.entries.v1';
  const MOOD_META = {
    5: { icon: 'assets/icon-mood-5.png', label: '很好', color: 'var(--mood-5)' },
    4: { icon: 'assets/icon-mood-4.png', label: '不错', color: 'var(--mood-4)' },
    3: { icon: 'assets/icon-mood-3.png', label: '一般', color: 'var(--mood-3)' },
    2: { icon: 'assets/icon-mood-2.png', label: '低落', color: 'var(--mood-2)' },
    1: { icon: 'assets/icon-mood-1.png', label: '很糟', color: 'var(--mood-1)' },
  };
  // stage 1 = intensity 1-3, stage 2 = intensity 4-5
  const MOOD_SPRITES = {
    5: ['assets/flower-great-bud.png', 'assets/flower-great-bloom.png'],
    4: ['assets/flower-good-bud.png', 'assets/flower-good-bloom.png'],
    3: ['assets/flower-okay-bud.png', 'assets/flower-okay-half.png'],
    2: ['assets/flower-low-1.png', 'assets/flower-low-2.png'],
    1: ['assets/flower-awful-1.png', 'assets/flower-awful-2.png'],
  };
  function spriteFor(entry) {
    const stage = entry.intensity >= 4 ? 1 : 0;
    return MOOD_SPRITES[entry.mood][stage];
  }
  let editingEntryId = null;
  let lastQuickEntryId = null;

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

  function resetLogForm() {
    selectedMood = null;
    selectedTags.clear();
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.tag-opt').forEach(el => el.classList.remove('selected'));
    intensityInput.value = 3;
    document.getElementById('intensityVal').textContent = '3';
    document.getElementById('note').value = '';
  }

  function openEntryEditor(entryId) {
    const entry = loadEntries().find(e => e.id === entryId);
    if (!entry) return;
    editingEntryId = entryId;
    selectedMood = entry.mood;
    selectedTags.clear();
    (entry.tags || []).forEach(t => selectedTags.add(t));
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.toggle('selected', Number(el.dataset.mood) === entry.mood));
    document.querySelectorAll('.tag-opt').forEach(el => el.classList.toggle('selected', selectedTags.has(el.dataset.tag)));
    intensityInput.value = entry.intensity;
    document.getElementById('intensityVal').textContent = entry.intensity;
    document.getElementById('note').value = entry.note || '';
    document.getElementById('logTitle').textContent = '补充细节';
    document.getElementById('logDeleteBtn').hidden = false;
    showView('log');
  }

  document.getElementById('logCancelBtn').addEventListener('click', () => {
    editingEntryId = null;
    resetLogForm();
    showView('home');
  });

  document.getElementById('logDeleteBtn').addEventListener('click', () => {
    if (!editingEntryId) return;
    if (confirm('确定删除这条记录吗？')) {
      deleteEntry(editingEntryId);
      editingEntryId = null;
      resetLogForm();
      showView('home');
    }
  });

  document.getElementById('saveEntryBtn').addEventListener('click', () => {
    if (!selectedMood) {
      document.getElementById('moodPicker').style.outline = '2px solid var(--danger)';
      setTimeout(() => { document.getElementById('moodPicker').style.outline = ''; }, 900);
      return;
    }
    const fields = {
      mood: selectedMood,
      intensity: Number(intensityInput.value),
      tags: Array.from(selectedTags),
      note: document.getElementById('note').value.trim(),
    };

    if (editingEntryId) {
      const entries = loadEntries();
      const idx = entries.findIndex(e => e.id === editingEntryId);
      if (idx !== -1) Object.assign(entries[idx], fields);
      saveEntries(entries);
      editingEntryId = null;
    } else {
      addEntry({ id: uid(), ts: Date.now(), ...fields });
    }

    resetLogForm();
    document.getElementById('logDeleteBtn').hidden = true;

    const confirmEl = document.getElementById('saveConfirm');
    confirmEl.hidden = false;
    confirmEl.textContent = '已记录，感谢你花时间关照自己的情绪';
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

    renderGarden();
    const days7 = dailyAverages(7);

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
      <div class="recommend-item"><img class="ri-emoji" src="${r.icon}" alt=""><span>${r.text}</span></div>
    `).join('');
  }

  function recentMoodScore() {
    const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts).slice(0, 3);
    if (!entries.length) return null;
    return entries.reduce((s, e) => s + e.mood, 0) / entries.length;
  }

  // ---------- garden ----------
  // 每条记录都在花园里种下一朵新花（而不是按天覆盖），每种满 GARDEN_MILESTONE 朵算种满一片花园
  const GARDEN_MILESTONE = 12;
  const GARDEN_RENDER_CAP = 80; // 只渲染最近的N朵，避免记录很多之后时间轴过长影响性能

  function renderGarden() {
    const entries = loadEntries().slice().sort((a, b) => a.ts - b.ts);
    const total = entries.length;
    const el = document.getElementById('gardenTimeline');

    if (!total) {
      el.innerHTML = '<div class="garden-empty-hint">这里还没有花，点下面的花苞种下第一朵</div>';
    } else {
      const recent = entries.slice(-GARDEN_RENDER_CAP);
      const lastId = entries[total - 1].id;
      el.innerHTML = recent.map(e => {
        const classes = ['day-slot'];
        if (e.id === lastId) classes.push('today-slot');
        return `<button type="button" class="${classes.join(' ')}" data-entry-id="${e.id}" title="${fmtShort(e.ts)} · ${MOOD_META[e.mood].label}"><img src="${spriteFor(e)}" alt="${MOOD_META[e.mood].label}"></button>`;
      }).join('');
      el.scrollLeft = el.scrollWidth;
    }

    const hasToday = entries.some(e => dayKey(e.ts) === dayKey(Date.now()));
    document.getElementById('gardenPrompt').textContent = hasToday
      ? '今天已经记录过了，还想再说说现在的感觉吗？'
      : '此刻，你感觉怎么样？点一下就好';

    renderGardenProgress(total);
  }

  function renderGardenProgress(total) {
    const filledInPlot = total === 0 ? 0 : (total % GARDEN_MILESTONE === 0 ? GARDEN_MILESTONE : total % GARDEN_MILESTONE);
    const remaining = GARDEN_MILESTONE - filledInPlot;
    const plotNumber = total === 0 ? 1 : Math.ceil(total / GARDEN_MILESTONE);

    document.getElementById('gardenProgressFill').style.width = (filledInPlot / GARDEN_MILESTONE * 100) + '%';
    document.getElementById('gardenProgressText').textContent = total === 0
      ? '种下第一朵，开始这片花园'
      : (remaining === 0
          ? `第 ${plotNumber} 片花园种满啦`
          : `第 ${plotNumber} 片花园 · 已种 ${filledInPlot}/${GARDEN_MILESTONE} 朵 · 再种 ${remaining} 朵集满`);
  }

  function celebrateMilestone() {
    const el = document.getElementById('gardenProgress');
    const textEl = document.getElementById('gardenProgressText');
    el.classList.add('celebrate');
    textEl.textContent = '这片花园种满啦，新的一片已经开始';
    setTimeout(() => {
      el.classList.remove('celebrate');
      renderGardenProgress(loadEntries().length);
    }, 3200);
  }

  document.getElementById('gardenTimeline').addEventListener('click', (e) => {
    const slot = e.target.closest('[data-entry-id]');
    if (!slot) return;
    openEntryEditor(slot.dataset.entryId);
  });

  function quickLogMood(score) {
    const entry = { id: uid(), ts: Date.now(), mood: score, intensity: 3, tags: [], note: '' };
    addEntry(entry);
    lastQuickEntryId = entry.id;
    const total = loadEntries().length;

    renderHome();

    const todaySlot = document.querySelector('.day-slot.today-slot');
    if (todaySlot) {
      todaySlot.classList.add('just-grown');
      setTimeout(() => todaySlot.classList.remove('just-grown'), 650);
    }
    const bubble = document.getElementById('detailBubble');
    document.getElementById('detailBubbleText').textContent = `记下了「${MOOD_META[score].label}」，感谢你花时间关照自己`;
    bubble.hidden = false;
    clearTimeout(quickLogMood._hideTimer);
    quickLogMood._hideTimer = setTimeout(() => { bubble.hidden = true; }, 6000);

    if (total > 0 && total % GARDEN_MILESTONE === 0) {
      celebrateMilestone();
    }
  }

  document.getElementById('quickMoodRow').addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-mood-btn');
    if (!btn) return;
    quickLogMood(Number(btn.dataset.mood));
  });

  document.getElementById('detailBubbleBtn').addEventListener('click', () => {
    document.getElementById('detailBubble').hidden = true;
    if (lastQuickEntryId) openEntryEditor(lastQuickEntryId);
  });

  document.getElementById('breathOrbFab').addEventListener('click', () => {
    showView('care');
  });

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
    {
      title: '5分钟正念呼吸', desc: '专注于呼吸的进出，留意念头飘走时轻轻把注意力带回来。',
      guidance: ['留意此刻的呼吸，不用刻意改变它', '吸气时，感受空气缓缓进入身体', '呼气时，让肩膀和下颌自然放松', '如果念头飘走了，轻轻把注意力带回呼吸就好'],
    },
    {
      title: '身体扫描放松', desc: '从头到脚逐部位放松肌肉，释放身体里积攒的紧张感。',
      guidance: ['把注意力带到头顶，感受那里的重量', '慢慢向下，留意肩颈是否在不自觉地紧绷', '继续向下，感受手臂、后背的松紧', '最后来到双脚，感受它们与地面的接触'],
    },
    {
      title: '感恩练习', desc: '写下或默念今天让你感激的三件小事，哪怕很微小。',
      guidance: ['想一件今天发生的、让你感到一点点温暖的小事', '它可以很微小，一杯热水、一句问候都算', '感受一下，此刻身体里有没有一点点放松', '不用完美，能想起一件已经很好了'],
    },
  ];
  const EXERCISES = [
    { title: '10分钟散步', desc: '走出房间，哪怕只是楼下转一圈，让身体先动起来。' },
    { title: '5分钟拉伸', desc: '肩颈、背部、腿部拉伸，缓解久坐带来的紧绷。' },
    { title: '15分钟瑜伽', desc: '跟随任意一套入门瑜伽序列，专注呼吸与身体的连接。' },
    { title: '短时高强度运动', desc: '跳绳/开合跳3-5分钟，让积压的情绪能量有个出口。' },
  ];

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
      none: [{ icon: 'assets/icon-tool-journal.png', text: '先记录一次今天的心情' }],
      low: [
        { icon: 'assets/icon-tool-meditation.png', text: '3分钟箱式呼吸，平复神经紧张' },
        { icon: 'assets/icon-tool-music.png', text: '听一段自然白噪音，让自己静下来' },
      ],
      mid: [
        { icon: 'assets/icon-tool-exercise.png', text: '出门走10分钟，换个环境' },
        { icon: 'assets/icon-tool-journal.png', text: '写下今天值得感激的一件小事' },
      ],
      high: [
        { icon: 'assets/icon-tool-exercise.png', text: '趁状态好，做一次短时运动' },
        { icon: 'assets/icon-tool-music.png', text: '收藏一份能代表此刻心情的歌单' },
      ],
    };

    return { tier, intro: introMap[tier], quick: quickMap[tier] };
  }

  function renderCare() {
    const score = recentMoodScore();
    const rec = getRecommendations(score);
    document.getElementById('careIntro').textContent = rec.intro;

    document.getElementById('meditationList').innerHTML = MEDITATIONS.map((m, i) => `
      <div class="care-item">
        <div>
          <div class="ci-title">${m.title}</div>
          <div class="ci-desc">${m.desc}</div>
          <button type="button" class="med-start-btn" data-med-index="${i}">开始冥想 →</button>
        </div>
      </div>
    `).join('');

    syncMusicUI();

    document.getElementById('exerciseList').innerHTML = EXERCISES.map(m => `
      <div class="care-item">
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

  // ---------- background music ----------
  function syncMusicUI() {
    const current = window.AmbientAudio ? window.AmbientAudio.current() : null;
    document.querySelectorAll('.music-track-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.track === current);
    });
    const dot = document.getElementById('musicBtnDot');
    if (dot) dot.hidden = !current;
  }

  document.querySelectorAll('.music-track-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.music-track-btn');
      if (!btn || !window.AmbientAudio) return;
      const track = btn.dataset.track;
      if (window.AmbientAudio.current() === track) {
        window.AmbientAudio.stop();
      } else {
        window.AmbientAudio.play(track);
      }
      syncMusicUI();
    });
  });

  const musicVolumeInput = document.getElementById('musicVolume');
  if (musicVolumeInput) {
    musicVolumeInput.addEventListener('input', () => {
      if (window.AmbientAudio) window.AmbientAudio.setVolume(Number(musicVolumeInput.value) / 100);
    });
  }

  const musicStopBtn = document.getElementById('musicStopBtn');
  if (musicStopBtn) {
    musicStopBtn.addEventListener('click', () => {
      if (window.AmbientAudio) window.AmbientAudio.stop();
      syncMusicUI();
    });
  }

  document.getElementById('musicBtn').addEventListener('click', () => {
    const panel = document.getElementById('musicPanel');
    panel.hidden = !panel.hidden;
  });

  // ---------- meditation session ----------
  let medTimerInterval = null;
  let medGuidanceInterval = null;
  let medElapsedSeconds = 0;

  function openMeditationSession(index) {
    const med = MEDITATIONS[index];
    if (!med) return;
    document.getElementById('meditationCard').hidden = true;
    document.getElementById('meditationSession').hidden = false;

    medElapsedSeconds = 0;
    document.getElementById('medTimer').textContent = '00:00';

    let gi = 0;
    const guidanceEl = document.getElementById('medGuidance');
    guidanceEl.textContent = med.guidance[0];
    guidanceEl.style.opacity = 1;
    clearInterval(medGuidanceInterval);
    medGuidanceInterval = setInterval(() => {
      gi = (gi + 1) % med.guidance.length;
      guidanceEl.style.opacity = 0;
      setTimeout(() => {
        guidanceEl.textContent = med.guidance[gi];
        guidanceEl.style.opacity = 1;
      }, 400);
    }, 6000);

    clearInterval(medTimerInterval);
    medTimerInterval = setInterval(() => {
      medElapsedSeconds++;
      const mm = String(Math.floor(medElapsedSeconds / 60)).padStart(2, '0');
      const ss = String(medElapsedSeconds % 60).padStart(2, '0');
      document.getElementById('medTimer').textContent = `${mm}:${ss}`;
    }, 1000);

    if (window.AmbientAudio && !window.AmbientAudio.isPlaying()) {
      window.AmbientAudio.play('pad');
      syncMusicUI();
    }
  }

  function closeMeditationSession() {
    clearInterval(medTimerInterval);
    clearInterval(medGuidanceInterval);
    document.getElementById('meditationSession').hidden = true;
    document.getElementById('meditationCard').hidden = false;
  }

  document.getElementById('meditationList').addEventListener('click', (e) => {
    const btn = e.target.closest('.med-start-btn');
    if (!btn) return;
    openMeditationSession(Number(btn.dataset.medIndex));
  });

  document.getElementById('medEndBtn').addEventListener('click', closeMeditationSession);

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
            <img class="hi-emoji" src="${meta.icon}" alt="${meta.label}">
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
