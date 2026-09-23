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

  // 自我关怀行动记录：每次呼吸/冥想练习完成后，记录做了什么、用户反馈如何，
  // 用于之后生成"行为反馈"洞察（比如"呼吸练习对你有帮助的比例"）
  const CARE_LOG_KEY = 'moodDiary.careLog.v1';
  function loadCareLog() {
    try {
      const raw = localStorage.getItem(CARE_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveCareLog(log) {
    localStorage.setItem(CARE_LOG_KEY, JSON.stringify(log));
  }
  function addCareLogEntry(entry) {
    const log = loadCareLog();
    log.push(entry);
    saveCareLog(log);
    return entry;
  }

  // 洞察确认：用户对"这个发现符合你的感觉吗"的回应，key 形如 assoc:工作学业 / time:1-上午
  const INSIGHT_FEEDBACK_KEY = 'moodDiary.insightFeedback.v1';
  function loadInsightFeedback() {
    try {
      return JSON.parse(localStorage.getItem(INSIGHT_FEEDBACK_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  // countAtConfirm 记录确认时的样本量：同一个结论确认过之后就"退休"，
  // 除非又积累了明显更多的新证据（见 RESURFACE_GROWTH），否则不会反复念叨同一句话。
  function setInsightFeedback(key, value, countAtConfirm) {
    const fb = loadInsightFeedback();
    fb[key] = { value, countAtConfirm: countAtConfirm || 0 };
    localStorage.setItem(INSIGHT_FEEDBACK_KEY, JSON.stringify(fb));
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

  function budSpriteForScore(score) {
    const lvl = Math.max(1, Math.min(5, Math.round(score)));
    return MOOD_SPRITES[lvl][0];
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

  // ---------- safety ----------
  // 产品定位是自我关怀工具，不是诊断工具：不判断抑郁/焦虑症，不给风险等级，
  // 只在"单次很糟"和"连续多日低落"时给低压力的陪伴提示和求助方向。
  function checkConsecutiveLowDays() {
    const entries = loadEntries();
    if (!entries.length) return 0;
    const today = startOfDay(Date.now());
    // 从"最近一次有记录的那天"开始往回数，而不是死板要求今天必须已经记录
    let startOffset = -1;
    for (let i = 0; i < 14; i++) {
      const key = dayKey(today - i * 86400000);
      if (entries.some(e => dayKey(e.ts) === key)) { startOffset = i; break; }
    }
    if (startOffset === -1) return 0;
    let consecutiveDays = 0;
    for (let i = startOffset; i < startOffset + 14; i++) {
      const dayStart = today - i * 86400000;
      const key = dayKey(dayStart);
      const dayEntries = entries.filter(e => dayKey(e.ts) === key);
      if (!dayEntries.length) break;
      const avg = dayEntries.reduce((s, e) => s + e.mood, 0) / dayEntries.length;
      if (avg <= 2) consecutiveDays++;
      else break;
    }
    return consecutiveDays;
  }

  function renderSafetyBanner() {
    const banner = document.getElementById('safetyBanner');
    if (!banner) return;
    const consecutive = checkConsecutiveLowDays();
    const dismissedDate = localStorage.getItem('moodDiary.safetyPromptDate');
    const todayStr = dayKey(Date.now());
    banner.hidden = !(consecutive >= 3 && dismissedDate !== todayStr);
  }

  const safetyDismissBtn = document.getElementById('safetyDismissBtn');
  if (safetyDismissBtn) {
    safetyDismissBtn.addEventListener('click', () => {
      localStorage.setItem('moodDiary.safetyPromptDate', dayKey(Date.now()));
      document.getElementById('safetyBanner').hidden = true;
    });
  }

  // 数据只存在本地浏览器，记录积累到一定量后主动提醒备份，而不是靠用户自己想起来。
  // 每种满一片花园（每 GARDEN_MILESTONE 条）提醒一次，避免频繁打扰。
  function renderBackupReminder() {
    const banner = document.getElementById('backupReminder');
    if (!banner) return;
    const total = loadEntries().length;
    const lastPromptAt = Number(localStorage.getItem('moodDiary.backupPromptAt') || 0);
    const milestoneReached = total > 0 && total % GARDEN_MILESTONE === 0;
    banner.hidden = !(milestoneReached && total !== lastPromptAt);
  }

  const backupExportBtn = document.getElementById('backupExportBtn');
  if (backupExportBtn) {
    backupExportBtn.addEventListener('click', () => {
      exportBackup();
      document.getElementById('backupReminder').hidden = true;
    });
  }
  const backupDismissBtn = document.getElementById('backupDismissBtn');
  if (backupDismissBtn) {
    backupDismissBtn.addEventListener('click', () => {
      localStorage.setItem('moodDiary.backupPromptAt', String(loadEntries().length));
      document.getElementById('backupReminder').hidden = true;
    });
  }

  // 首次使用引导：只在从没关闭过的时候显示，不做成强制新手教程
  function renderOnboarding() {
    const card = document.getElementById('onboardingCard');
    if (!card) return;
    card.hidden = !!localStorage.getItem('moodDiary.onboarded');
  }
  const onboardingDismissBtn = document.getElementById('onboardingDismissBtn');
  if (onboardingDismissBtn) {
    onboardingDismissBtn.addEventListener('click', () => {
      localStorage.setItem('moodDiary.onboarded', '1');
      document.getElementById('onboardingCard').hidden = true;
    });
  }

  // ---------- home ----------
  function renderHome() {
    const entries = loadEntries();
    const todayKey = dayKey(Date.now());
    const hasToday = entries.some(e => dayKey(e.ts) === todayKey);
    document.getElementById('todayStatus').textContent = hasToday
      ? '今天已经记录过啦，随时都能再说说现在的感觉'
      : '今天还没有记录心情，来看看你的花园吧';

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

    // 自动推荐（首页预览，完整的小方案在"关怀"页）
    const plan = getCarePlan();
    document.getElementById('autoRecommendText').textContent = plan.leadText;
    document.getElementById('autoRecommendBtn').textContent = plan.tier === 'none' ? '去记录心情' : '查看今天的小方案';

    renderSafetyBanner();
    renderBackupReminder();
    renderOnboarding();
  }

  function recentMoodScore() {
    const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts).slice(0, 3);
    if (!entries.length) return null;
    return entries.reduce((s, e) => s + e.mood, 0) / entries.length;
  }

  // ---------- garden ----------
  // 每条记录都在花园里种下一朵新花（而不是按天覆盖）。每种满 GARDEN_MILESTONE 朵，
  // 这片花园就算种满了，会开启一片新的花园和新背景；旧花园可以用箭头往回翻看。
  const GARDEN_MILESTONE = 12;

  // 每种满一片花园就换一张真实背景（白天→黄昏→雨后→夜晚）；再往后新增背景图，
  // 直接往数组里加一项即可。数组用完的花园会在最后一张背景上循环叠加色调滤镜。
  const GARDEN_BACKGROUNDS = ['assets/bg-day.jpg', 'assets/bg-dusk.jpg', 'assets/bg-rain.jpg', 'assets/bg-night.jpg'];
  const GARDEN_TINTS = [
    'none',
    'hue-rotate(25deg) saturate(1.12)',
    'hue-rotate(-22deg) brightness(1.05)',
    'hue-rotate(60deg) saturate(0.92)',
    'sepia(0.22) hue-rotate(-8deg) saturate(1.15)',
  ];

  let gardenViewOffset = 0; // 0 = 当前花园；1 = 往回翻一片，以此类推

  function currentPlotNumber(total) {
    return total === 0 ? 1 : Math.ceil(total / GARDEN_MILESTONE);
  }

  function applyGardenBackground(plotNumber) {
    const scene = document.getElementById('gardenScene');
    const bgIdx = Math.min(plotNumber - 1, GARDEN_BACKGROUNDS.length - 1);
    scene.style.backgroundImage = `url('${GARDEN_BACKGROUNDS[bgIdx]}')`;
    // 真实背景图不叠加滤镜；只有超出背景图数量、复用最后一张时才循环叠加色调
    const overflow = plotNumber - GARDEN_BACKGROUNDS.length;
    scene.style.filter = overflow >= 0 ? GARDEN_TINTS[overflow % GARDEN_TINTS.length] : 'none';
  }

  // 种满的花园留下一句小结，而不只是换个背景——让每片花园成为有记忆点的"章节"
  function summarizePlotEntries(plotEntries) {
    const avg = plotEntries.reduce((s, e) => s + e.mood, 0) / plotEntries.length;
    const tagCounts = {};
    plotEntries.forEach(e => (e.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTagEntry = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
    const half = Math.floor(plotEntries.length / 2);
    const firstAvg = plotEntries.slice(0, half).reduce((s, e) => s + e.mood, 0) / half;
    const secondAvg = plotEntries.slice(half).reduce((s, e) => s + e.mood, 0) / (plotEntries.length - half);
    const trend = secondAvg - firstAvg;

    const moodDesc = avg >= 3.8 ? '整体比较愉悦' : (avg <= 2.3 ? '整体偏低落' : '情绪起伏比较平稳');
    const trendDesc = trend >= 0.6 ? '，而且是越种越好' : (trend <= -0.6 ? '，不过后半程有点往下走' : '');
    const tagDesc = topTagEntry ? `，「${topTagEntry[0]}」出现得最多` : '';
    return `${moodDesc}${trendDesc}${tagDesc}。`;
  }

  function renderGarden() {
    const entries = loadEntries().slice().sort((a, b) => a.ts - b.ts);
    const total = entries.length;
    const current = currentPlotNumber(total);
    gardenViewOffset = Math.min(gardenViewOffset, Math.max(0, current - 1));
    const displayedPlot = current - gardenViewOffset;
    const isCurrentPlot = gardenViewOffset === 0;

    const startIdx = (displayedPlot - 1) * GARDEN_MILESTONE;
    const plotEntries = entries.slice(startIdx, startIdx + GARDEN_MILESTONE);

    applyGardenBackground(displayedPlot);

    const el = document.getElementById('gardenTimeline');
    if (!plotEntries.length) {
      el.innerHTML = '<div class="garden-empty-hint">种下你的第一朵花吧～这片花园会因为你，一点一点长满</div>';
    } else {
      const lastEntryId = entries[total - 1].id;
      el.innerHTML = plotEntries.map(e => {
        const classes = ['day-slot'];
        if (isCurrentPlot && e.id === lastEntryId) classes.push('today-slot');
        return `<button type="button" class="${classes.join(' ')}" data-entry-id="${e.id}" title="${fmtShort(e.ts)} · ${MOOD_META[e.mood].label}"><img src="${spriteFor(e)}" alt="${MOOD_META[e.mood].label}"></button>`;
      }).join('');
      if (isCurrentPlot) el.scrollLeft = el.scrollWidth;
    }

    const hasToday = entries.some(e => dayKey(e.ts) === dayKey(Date.now()));
    document.getElementById('gardenPrompt').textContent = !isCurrentPlot
      ? '正在回顾这片花园，点右边的箭头回到今天'
      : (hasToday ? '今天已经和你一起记录过啦，想再聊聊现在的心情吗？' : '嗨，这一刻的你，感觉怎么样？点一下就好');

    const summaryEl = document.getElementById('gardenPlotSummary');
    if (plotEntries.length === GARDEN_MILESTONE) {
      summaryEl.textContent = summarizePlotEntries(plotEntries);
      summaryEl.hidden = false;
    } else {
      summaryEl.hidden = true;
    }

    renderGardenProgress(total, displayedPlot, current);
    document.getElementById('plotPrevBtn').disabled = displayedPlot <= 1;
    document.getElementById('plotNextBtn').hidden = isCurrentPlot;
  }

  function renderGardenProgress(total, displayedPlot, current) {
    displayedPlot = displayedPlot || currentPlotNumber(total);
    current = current || displayedPlot;
    const filledInPlot = displayedPlot < current
      ? GARDEN_MILESTONE
      : (total === 0 ? 0 : (total % GARDEN_MILESTONE === 0 ? GARDEN_MILESTONE : total % GARDEN_MILESTONE));
    const remaining = GARDEN_MILESTONE - filledInPlot;

    document.getElementById('gardenProgressFill').style.width = (filledInPlot / GARDEN_MILESTONE * 100) + '%';
    document.getElementById('gardenProgressText').textContent = total === 0
      ? `第 ${displayedPlot} 片花园 · 种下第一朵开始吧`
      : (remaining === 0
          ? `第 ${displayedPlot} 片花园种满啦`
          : `第 ${displayedPlot} 片花园 · 已种 ${filledInPlot}/${GARDEN_MILESTONE} 朵 · 再种 ${remaining} 朵集满`);
  }

  function celebrateMilestone() {
    const el = document.getElementById('gardenProgress');
    const textEl = document.getElementById('gardenProgressText');
    el.classList.add('celebrate');
    textEl.textContent = '这片花园被你种满啦！新的花园已经悄悄准备好，等你来种下第一朵';
    setTimeout(() => {
      el.classList.remove('celebrate');
      renderGardenProgress(loadEntries().length);
    }, 3400);
  }

  document.getElementById('gardenTimeline').addEventListener('click', (e) => {
    const slot = e.target.closest('[data-entry-id]');
    if (!slot) return;
    openEntryEditor(slot.dataset.entryId);
  });

  document.getElementById('plotPrevBtn').addEventListener('click', () => {
    gardenViewOffset++;
    renderGarden();
  });
  document.getElementById('plotNextBtn').addEventListener('click', () => {
    gardenViewOffset = 0;
    renderGarden();
  });

  function quickLogMood(score) {
    const entry = { id: uid(), ts: Date.now(), mood: score, intensity: 3, tags: [], note: '' };
    addEntry(entry);
    lastQuickEntryId = entry.id;
    const total = loadEntries().length;
    gardenViewOffset = 0;

    renderHome();

    const todaySlot = document.querySelector('.day-slot.today-slot');
    if (todaySlot) {
      todaySlot.classList.add('just-grown');
      setTimeout(() => todaySlot.classList.remove('just-grown'), 650);
    }
    const bubble = document.getElementById('detailBubble');
    document.getElementById('detailBubbleText').textContent = score === 1
      ? '这一刻很难熬吧。不需要马上解决所有事，先陪自己待一会儿'
      : `记下了「${MOOD_META[score].label}」，感谢你花时间关照自己`;
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

  // ---------- discover：主动发现规律，而不是让用户自己看图 ----------
  const DOW_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function timeBucketName(hour) {
    if (hour < 6) return '凌晨';
    if (hour < 12) return '上午';
    if (hour < 18) return '下午';
    return '晚上';
  }

  // ① 事件关联：只描述"同时出现"，不说"导致"
  function analyzeEventAssociation() {
    const entries = loadEntries().filter(e => e.ts >= Date.now() - 14 * 86400000);
    if (entries.length < 5) return null;
    const stats = {};
    entries.forEach(e => (e.tags || []).forEach(tag => {
      if (!stats[tag]) stats[tag] = { count: 0, sum: 0, lowCount: 0 };
      stats[tag].count++;
      stats[tag].sum += e.mood;
      if (e.mood <= 2) stats[tag].lowCount++;
    }));
    const overallAvg = entries.reduce((s, e) => s + e.mood, 0) / entries.length;
    let best = null;
    Object.entries(stats).forEach(([tag, s]) => {
      if (s.count < 3) return;
      const avg = s.sum / s.count;
      if (avg < overallAvg - 0.4 && (!best || s.count > best.count)) {
        best = { tag, count: s.count, lowCount: s.lowCount, avg };
      }
    });
    return best;
  }

  // ② 时间规律：哪个"周几+时段"的平均情绪明显低于整体
  function analyzeTimePattern() {
    const entries = loadEntries().filter(e => e.ts >= Date.now() - 30 * 86400000);
    if (entries.length < 10) return null;
    const groups = {};
    entries.forEach(e => {
      const d = new Date(e.ts);
      const key = d.getDay() + '-' + timeBucketName(d.getHours());
      (groups[key] = groups[key] || []).push(e.mood);
    });
    const overallAvg = entries.reduce((s, e) => s + e.mood, 0) / entries.length;
    let worst = null;
    Object.entries(groups).forEach(([key, moods]) => {
      if (moods.length < 3) return;
      const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
      const diff = overallAvg - avg;
      if (diff >= 0.8 && (!worst || diff > worst.diff)) {
        const [dow, bucket] = key.split('-');
        worst = { diff, avg, count: moods.length, dow: Number(dow), bucket };
      }
    });
    return worst;
  }

  // ③ 行为反馈：基于用户对自我关怀行动的真实反馈，而不是假设所有人都适合同一种方式
  const CARE_KIND_LABELS = { breathing: '呼吸练习', meditation: '冥想练习' };
  function analyzeBehaviorFeedback() {
    const log = loadCareLog().filter(e => e.feedback && e.feedback !== 'skip');
    const byKind = {};
    log.forEach(e => {
      if (!byKind[e.kind]) byKind[e.kind] = { total: 0, better: 0 };
      byKind[e.kind].total++;
      if (e.feedback === 'better') byKind[e.kind].better++;
    });
    let best = null;
    Object.entries(byKind).forEach(([kind, s]) => {
      if (s.total < 3) return;
      if (!best || s.total > best.total) best = { kind, total: s.total, pct: Math.round((s.better / s.total) * 100) };
    });
    return best;
  }

  // 已确认过的发现不会一直重复念叨——除非样本量比确认时又明显增长了，才会带着新证据再出现一次
  const RESURFACE_GROWTH = 5;
  function isRetired(fb, key, currentCount) {
    const prior = fb[key];
    if (!prior || typeof prior !== 'object') return false;
    return (currentCount - (prior.countAtConfirm || 0)) < RESURFACE_GROWTH;
  }

  function renderDiscoveryCards() {
    const el = document.getElementById('discoveryCards');
    if (!el) return;
    const fb = loadInsightFeedback();
    const cards = [];
    let retiredCount = 0;

    const assoc = analyzeEventAssociation();
    if (assoc) {
      const key = 'assoc:' + assoc.tag;
      if (isRetired(fb, key, assoc.count)) {
        retiredCount++;
      } else {
        cards.push({
          key,
          count: assoc.count,
          text: `最近两周，「${assoc.tag}」出现在 ${assoc.count} 次记录里，其中 ${assoc.lowCount} 次情绪偏低。涉及「${assoc.tag}」的记录，平均情绪比其他记录更低。`,
          confirmable: true,
          value: fb[key] && fb[key].value,
        });
      }
    }

    const timePattern = analyzeTimePattern();
    if (timePattern) {
      const key = `time:${timePattern.dow}-${timePattern.bucket}`;
      if (isRetired(fb, key, timePattern.count)) {
        retiredCount++;
      } else {
        cards.push({
          key,
          count: timePattern.count,
          text: `最近一个月，你${DOW_NAMES[timePattern.dow]}${timePattern.bucket}的情绪，通常比其他时间更低一些。`,
          confirmable: true,
          value: fb[key] && fb[key].value,
        });
      }
    }

    const behavior = analyzeBehaviorFeedback();
    if (behavior) {
      cards.push({
        key: 'behavior:' + behavior.kind,
        text: `在完成${CARE_KIND_LABELS[behavior.kind] || behavior.kind}后，你有 ${behavior.pct}% 的记录反馈"好一点"。`,
        confirmable: false,
      });
    }

    if (!cards.length) {
      el.innerHTML = retiredCount > 0
        ? '<div class="history-empty">你已经确认过目前发现的规律，继续记录会帮你发现新的变化。</div>'
        : '<div class="history-empty">继续记录几次，我们就能帮你发现更多关于自己的小规律。</div>';
      return;
    }

    el.innerHTML = cards.map(c => `
      <div class="discovery-card">
        <p>${c.text}</p>
        ${c.confirmable ? `
          <div class="discovery-confirm" data-key="${c.key}" data-count="${c.count}">
            <button type="button" class="discovery-btn ${c.value === 'yes' ? 'selected' : ''}" data-value="yes">符合</button>
            <button type="button" class="discovery-btn ${c.value === 'unsure' ? 'selected' : ''}" data-value="unsure">不确定</button>
            <button type="button" class="discovery-btn ${c.value === 'no' ? 'selected' : ''}" data-value="no">不符合</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    el.querySelectorAll('.discovery-confirm').forEach(row => {
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('.discovery-btn');
        if (!btn) return;
        setInsightFeedback(row.dataset.key, btn.dataset.value, Number(row.dataset.count));
        row.querySelectorAll('.discovery-btn').forEach(b => b.classList.toggle('selected', b === btn));
      });
    });
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
    renderDiscoveryCards();
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
          <div class="trigger-bar-fill" style="width:${(r.count / maxCount * 100).toFixed(0)}%;background:${moodColorForScore(r.avg)}">
            <img class="trigger-bar-flower" src="${budSpriteForScore(r.avg)}" alt="">
          </div>
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

  const MUSIC_LABELS = { pad: '暖光序曲', rain: '雨声白噪音', bowl: '颂钵回响' };

  // 找出最近记录里，情绪低落时最常同时出现的标签。
  // 注意：这只说明"同时出现"，不代表因果——文案上也只说"常常伴随"，不说"导致"。
  function analyzeTopTrigger() {
    const entries = loadEntries();
    if (!entries.length) return null;
    const recentWindow = entries.filter(e => e.ts >= Date.now() - 30 * 86400000);
    const pool = recentWindow.length ? recentWindow : entries;
    const lowEntries = pool.filter(e => e.mood <= 2);
    const source = lowEntries.length ? lowEntries : pool;

    const counts = {};
    source.forEach(e => (e.tags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length ? sorted[0][0] : null;
  }

  // 根据当前状态判断"情境层级"：不是所有低落都一样，极度耗竭 / 紧绷焦虑 / 疲惫，
  // 需要的小行动不同——这是"情境化微干预"的核心判断。
  function determineCareTier() {
    const entries = loadEntries();
    if (!entries.length) return { tier: 'none', trigger: null, latest: null };
    const latest = entries.slice().sort((a, b) => b.ts - a.ts)[0];
    const topTrigger = analyzeTopTrigger();
    if (topTrigger === '睡眠' || topTrigger === '健康') return { tier: 'tired', trigger: topTrigger, latest };
    if (latest.mood <= 2 && latest.intensity >= 4) return { tier: 'depleted', trigger: topTrigger, latest };
    if (latest.mood <= 2) return { tier: 'anxious', trigger: topTrigger, latest };
    if (latest.mood >= 4) return { tier: 'positive', trigger: topTrigger, latest };
    return { tier: 'neutral', trigger: topTrigger, latest };
  }

  const CARE_PLANS = {
    depleted: {
      title: '现在不用解决所有事情',
      lead: () => '看起来这一刻消耗很大，先别急着振作。',
      steps: ['跟着练习，完成4轮慢呼吸', '离开屏幕3分钟，喝一点水', '只写下明天最小需要做的一件事'],
      action: { type: 'breathing' },
      actionLabel: '开始呼吸练习',
    },
    anxious: {
      title: '先让自己稳下来一点',
      lead: (trigger) => trigger ? `最近的记录里，「${trigger}」常常伴随着这样的心情，先不用急着解决它。` : '看起来这一刻有点紧绷。',
      steps: ['跟随呼吸练习，做4轮慢呼吸', '说出3件你此刻能看到的东西，把注意力拉回身边', '把下一步拆成一个最小的动作'],
      action: { type: 'breathing' },
      actionLabel: '开始呼吸练习',
    },
    tired: {
      title: '先歇一歇，别急着振作',
      lead: () => '最近的记录里，疲惫感比较明显。',
      steps: ['花几分钟做一次身体扫描放松', '放一段舒缓的音乐', '今晚尽量早一点让自己躺下'],
      action: { type: 'meditation', medIndex: 1, music: 'bowl' },
      actionLabel: '开始身体扫描',
    },
    positive: {
      title: '今天感觉不错',
      lead: () => '要不要记下一件让你开心的小事？',
      steps: ['留意此刻是什么让你感觉好', '写下这件小事，哪怕很小', '这会成为你的情绪存款'],
      action: { type: 'note' },
      actionLabel: '写下这件小事',
    },
    neutral: {
      title: '花几分钟，陪陪自己',
      lead: () => '不好不坏，也是很真实的状态。',
      steps: ['跟随一次正念呼吸', '留意此刻身体的感觉', '不用急着评价这一刻'],
      action: { type: 'meditation', medIndex: 0, music: 'pad' },
      actionLabel: '开始正念呼吸',
    },
    none: {
      title: '先记录一次此刻的心情',
      lead: () => '记录之后，我们就能为你自动搭配合适的小方案。',
      steps: [],
      action: { type: 'home' },
      actionLabel: '去记录心情',
    },
  };

  function getCarePlan() {
    const ctx = determineCareTier();
    const plan = CARE_PLANS[ctx.tier];
    return Object.assign({}, plan, { tier: ctx.tier, trigger: ctx.trigger, leadText: plan.lead(ctx.trigger) });
  }

  let pendingCareContext = null;

  function showCareFeedback() {
    if (!pendingCareContext) return;
    const card = document.getElementById('careFeedbackCard');
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.querySelectorAll('.care-feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pendingCareContext) {
        addCareLogEntry({
          id: uid(), ts: Date.now(),
          kind: pendingCareContext.kind, tier: pendingCareContext.tier, trigger: pendingCareContext.trigger,
          feedback: btn.dataset.value,
        });
      }
      document.getElementById('careFeedbackCard').hidden = true;
      pendingCareContext = null;
    });
  });

  function startCarePlanAction() {
    const plan = getCarePlan();
    if (plan.action.type === 'breathing') {
      pendingCareContext = { tier: plan.tier, trigger: plan.trigger, kind: 'breathing' };
      document.getElementById('breathingCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!breathRunning) startBreathing();
    } else if (plan.action.type === 'meditation') {
      openMeditationSession(plan.action.medIndex, plan.action.music);
    } else if (plan.action.type === 'note') {
      const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts);
      if (entries.length) openEntryEditor(entries[0].id);
    } else {
      showView('home');
    }
  }

  document.getElementById('carePlanStartBtn').addEventListener('click', startCarePlanAction);
  document.getElementById('carePlanSkipBtn').addEventListener('click', () => {
    document.getElementById('carePlanRest').hidden = false;
  });

  function renderCarePlanCard() {
    const plan = getCarePlan();
    document.getElementById('carePlanTitle').textContent = plan.title;
    document.getElementById('carePlanLead').textContent = plan.leadText;
    document.getElementById('carePlanSteps').innerHTML = plan.steps.length
      ? plan.steps.map((s, i) => `<div class="care-step"><span class="care-step-num">${i + 1}</span><span>${s}</span></div>`).join('')
      : '';
    document.getElementById('carePlanStartBtn').textContent = plan.actionLabel;
    document.getElementById('carePlanSkipBtn').hidden = plan.tier === 'none';
    document.getElementById('carePlanRest').hidden = true;
    return plan;
  }

  document.getElementById('autoRecommendBtn').addEventListener('click', () => showView('care'));

  function renderCare() {
    renderCarePlanCard();
    document.getElementById('careFeedbackCard').hidden = true;

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
    stopBreathing({ silent: true });
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
    if (!pendingCareContext) {
      const ctx = determineCareTier();
      pendingCareContext = { tier: ctx.tier, trigger: ctx.trigger, kind: 'breathing' };
    }
    stepBreath();
  }
  function stopBreathing(opts) {
    const wasRunning = breathRunning;
    breathRunning = false;
    clearTimeout(breathTimer);
    const circle = document.getElementById('breathCircle');
    circle.style.transitionDuration = '0.6s';
    circle.style.transform = 'scale(1)';
    document.getElementById('breathLabel').textContent = '开始';
    document.getElementById('breathToggle').textContent = '开始练习';
    if (wasRunning && (!opts || !opts.silent)) {
      showCareFeedback();
    }
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

  function openMeditationSession(index, music) {
    const med = MEDITATIONS[index];
    if (!med) return;
    document.getElementById('meditationCard').hidden = true;
    document.getElementById('meditationSession').hidden = false;

    if (!pendingCareContext) {
      const ctx = determineCareTier();
      pendingCareContext = { tier: ctx.tier, trigger: ctx.trigger, kind: 'meditation' };
    }

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
      window.AmbientAudio.play(music || 'pad');
      syncMusicUI();
    }
  }

  function closeMeditationSession() {
    clearInterval(medTimerInterval);
    clearInterval(medGuidanceInterval);
    document.getElementById('meditationSession').hidden = true;
    document.getElementById('meditationCard').hidden = false;
    showCareFeedback();
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
          <img class="history-pressed-flower" src="${spriteFor(e)}" alt="">
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

  function exportBackup() {
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
    localStorage.setItem('moodDiary.backupPromptAt', String(loadEntries().length));
  }

  document.getElementById('exportBtn').addEventListener('click', exportBackup);

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
