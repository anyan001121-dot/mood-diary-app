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
    document.getElementById('autoRecommendText').textContent = plan.homeText;
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

  // ---------- 全状态个性化关怀文案：情绪(5档) × 关联因素(10种) ----------
  // 设计原则：情绪档位决定"要不要干预、语气多轻"；关联因素决定"关怀什么"；
  // 强度决定"能承受多复杂的行动"。很好/不错不做因素分层——正向情绪不该被"医疗化"。

  // 很好(5) / 不错(4)：独立文案，不叠加关联因素
  const MOOD_ONLY_PLANS = {
    5: {
      home: '今天的你看起来状态很好，把这一刻种下来吧。',
      title: '把今天的好心情留久一点',
      lead: '不用做什么特别的事。如果愿意，可以花 10 秒想一想：今天有什么小事，让你觉得"今天还不错"？',
      primaryLabel: '记下一件开心的小事',
      action: { type: 'note' },
      secondaryLabel: '就享受现在',
      secondaryBehavior: 'message',
      secondaryMessage: '好，那就好好享受这一刻。',
    },
    4: {
      home: '今天似乎还不错，希望这份轻松可以再停留一会儿。',
      title: '给今天留一个小小的标记',
      lead: '如果愿意，可以记下：今天有什么事情比预想中顺利一点？或者什么都不写。',
      primaryLabel: '记下一点',
      action: { type: 'note' },
      secondaryLabel: '继续逛花园',
      secondaryBehavior: 'navigate',
    },
  };

  // 一般(3) / 低落(2) / 很糟(1)：外层框架（标题、默认文案、次按钮语气）
  const MOOD_FRAME = {
    3: {
      home: '今天好像就是普普通通的一天，没有特别开心，也不一定需要有什么问题。',
      title: '普通的一天也值得被记录',
      defaultLead: '如果现在有一点累，可以休息。如果只是平静，那就让今天保持平静。',
      primaryLabel: '听一会儿音乐',
      action: { type: 'music', music: 'pad' },
      secondaryLabel: '不用做什么',
      secondaryBehavior: 'navigate',
    },
    2: {
      home: '今天好像有点难熬。不急着让自己马上好起来。',
      title: '现在先照顾一下自己',
      defaultLead: '不用解决今天所有的问题。我们只做一件很小的事情就好。',
      primaryLabel: '看看适合我的小方案',
      action: { type: 'breathing' },
      secondaryLabel: '我现在什么都不想做',
      secondaryBehavior: 'message',
      secondaryMessage: '那今天先休息也可以。你愿意把现在的感受记下来，已经足够了。',
    },
    1: {
      home: '今天可能真的很不好受。现在不用急着想清楚，也不用逼自己振作。',
      title: '先陪自己待一会儿',
      defaultLead: '今天可以把要求放低一点。喝一点水、坐下来、慢慢呼吸，或者什么都不做。',
      primaryLabel: '陪我缓一会儿',
      action: { type: 'breathing' },
      secondaryLabel: '现在不想做任何事',
      secondaryBehavior: 'message',
      secondaryMessage: '好。那我们今天就停在这里。花园会替你留住这次记录。',
    },
  };

  // 每个关联因素在 一般(3)/低落(2)/很糟(1) 三档下的具体文案——回答"为什么今天给我推荐这个"
  const FACTOR_COPY = {
    '工作学业': {
      3: { lead: '最近是不是有一些事情一直挂在脑子里？不一定要现在解决，可以先看看哪一件最占你的注意力。', primaryLabel: '整理一下脑子', action: { type: 'note' } },
      2: { lead: '工作或学习好像消耗了你不少能量。现在不用把整个任务完成，我们只找下一件最小的事。', steps: ['离开屏幕 1 分钟', '喝一点水', '写下"下一步只做什么"'], primaryLabel: '开始3分钟任务减压', action: { type: 'breathing' } },
      1: { lead: '今天的工作/学习可能已经超出了你现在能轻松承受的范围。如果可以，先把"必须全部完成"放到一边。今天的目标可以只是：让自己喘口气。', primaryLabel: '先停 3 分钟', action: { type: 'breathing' } },
    },
    '人际关系': {
      3: { lead: '最近和某个人的相处，好像占据了你一点注意力。这件事更像是让你困惑、失望，还是只是有点累？', primaryLabel: '整理一下感受', action: { type: 'note' } },
      2: { lead: '和人的关系有时候比事情本身更消耗人。你现在不需要马上决定谁对谁错。', steps: ['发生了什么？', '它让我有什么感觉？'], primaryLabel: '情绪整理', action: { type: 'note' } },
      1: { lead: '这段关系现在可能让你很不好受。今天不一定是解决关系的最好时候。可以先离开对话一会儿，把注意力放回自己身上。', primaryLabel: '陪我缓一缓', action: { type: 'breathing' } },
    },
    '家庭': {
      3: { lead: '家里的事情似乎让你有一点挂心。', primaryLabel: '写下这份挂心', action: { type: 'note' } },
      2: { lead: '家庭里的情绪有时候很复杂——因为越重要的人，越容易影响我们。今天不用急着处理所有人的感受。', primaryLabel: '先照顾自己的感受', action: { type: 'breathing' } },
      1: { lead: '如果家里的事情让你觉得很累，可以先给自己留一点空间。暂时不回应、出去走一会儿，或者找一个你信任的人说说，都可以。', primaryLabel: '陪我缓一会儿', action: { type: 'breathing' } },
    },
    '健康': {
      3: { lead: '身体的状态也会影响一天的感受。今天可以稍微留意一下身体需要什么。', primaryLabel: '留意一下身体', action: { type: 'note' } },
      2: { lead: '身体不舒服的时候，情绪跟着下降很正常。今天不用对自己的效率要求太高，今天先把照顾身体放在完成任务前面。', steps: ['喝水', '休息', '轻微活动', '放松'], primaryLabel: '照顾一下身体', action: { type: 'meditation', medIndex: 1, music: 'bowl' } },
      1: { lead: '如果身体的不适很明显，今天可以优先休息。如果症状严重、持续或让你担心，自我关怀工具不能代替专业医疗帮助，可以考虑寻求医生或专业人士的帮助。', primaryLabel: '先休息', action: { type: 'breathing' } },
    },
    '财务': {
      3: { lead: '钱的事情是不是最近偶尔会跑进脑子里？', primaryLabel: '写下具体的事', action: { type: 'note' } },
      2: { lead: '财务压力很容易让人产生一种"很多事情都失去控制"的感觉。现在先不用解决全部问题。', steps: ['今天只确认一个数字、一个账单，或下一件需要处理的事情'], primaryLabel: '把担心变具体', action: { type: 'note' } },
      1: { lead: '如果现在一想到钱就觉得压力很大，先不用逼自己立刻制定完整计划。今天只需要区分：今天必须处理的，和可以以后处理的。', primaryLabel: '先分个类', action: { type: 'note' } },
    },
    '睡眠': {
      3: { lead: '今天是不是没有完全睡够？今晚可以试着给自己留一点更安静的时间。', primaryLabel: '记下来', action: { type: 'note' } },
      2: { lead: '睡眠不足会让很多原本可以承受的事情变得更难。所以今天状态不好，不一定意味着今天发生的一切都真的那么糟。今晚的目标不是"必须睡着"，而是提前10分钟离开屏幕，让身体慢慢安静下来。', primaryLabel: '提前离开屏幕', action: { type: 'meditation', medIndex: 1, music: 'bowl' } },
      1: { lead: '如果你已经很累了，今天可能不适合继续逼自己想清楚所有问题。先让身体休息。', primaryLabel: '陪我安静 5 分钟', action: { type: 'meditation', medIndex: 1, music: 'bowl' } },
    },
    '社交媒体': {
      3: { lead: '今天刷手机之后，好像心情有一点变化？', primaryLabel: '留意一下', action: { type: 'note' } },
      2: { lead: '有时候我们只是想放松一下，却在不知不觉中开始比较、焦虑或者信息过载。不需要彻底戒掉手机，把手机放到够不到的地方，看看窗外、喝口水，或者什么都不做。', primaryLabel: '离开信息流5分钟', action: { type: 'breathing' } },
      1: { lead: '如果现在继续刷只会让自己越来越难受，可以暂时离开那些信息。世界不会因为你消失十分钟而发生什么。', primaryLabel: '离开一下', action: { type: 'breathing' } },
    },
    '天气': {
      3: { lead: '今天的天气好像也悄悄影响了一点状态。', primaryLabel: '记下来', action: { type: 'note' } },
      2: { lead: '阴雨、闷热或者长时间见不到阳光，有时候确实会让一天显得更沉。', steps: ['适合外出：去窗边或室外待 5 分钟', '不适合外出：打开灯、放一首喜欢的音乐，让环境亮一点'], primaryLabel: '调整一下环境', action: { type: 'music', music: 'pad' } },
      1: { lead: '今天外面的世界可能也显得灰灰的。不需要强迫自己"积极起来"。', steps: ['暖光', '热饮', '音乐', '洗澡'], primaryLabel: '给环境增加一点舒服的东西', action: { type: 'music', music: 'pad' } },
    },
    '独处': {
      3: { lead: '今天一个人待着的时间比较多。这种独处对你来说更像是舒服，还是有一点孤单？', primaryLabel: '说不上来也没关系', action: { type: 'note' } },
      2: { lead: '一个人待久了，好像有点想和世界重新连上。不一定需要进行一场很正式的聊天。', steps: ['给朋友发一个表情', '去便利店走走', '到有人的地方坐一会儿'], primaryLabel: '做一个很小的连接', action: { type: 'note' } },
      1: { lead: '如果现在一个人让你觉得越来越难受，可以考虑联系一个你信任的人。不需要解释很多，甚至只需要："你现在方便陪我说几句话吗？"', primaryLabel: '联系一个人', action: { type: 'note' } },
    },
    '其他': {
      3: { lead: '好像还有一些事情影响着今天。如果愿意，可以写下来；不想解释也完全可以。', primaryLabel: '写下来（选填）', action: { type: 'note' } },
      2: { lead: '有些难受可能很难归类。不需要先想明白原因，才能允许自己休息。', primaryLabel: '先休息一下', action: { type: 'breathing' } },
      1: { lead: '现在不知道为什么难受，也没关系。我们可以先不分析原因，只让这一刻稍微容易一点。', primaryLabel: '陪我缓一会儿', action: { type: 'breathing' } },
    },
  };

  // 多个关联因素同时出现时，不逐条列建议（信息负担太大），综合成一句话
  function buildCombinedLead(tags, mood) {
    const list = tags.join('、');
    return mood === 1
      ? `今天好像很多事情撞在了一起——${list}的事，都赶在了一起。现在不需要同时解决它们，先处理最容易影响状态的那一件：休息一下。`
      : `今天好像很多事情撞在了一起——${list}方面的事凑在了一起。现在不需要同时解决它们，先处理最容易影响身体状态的那一件：休息一下。等缓过来一点，我们再看接下来最需要处理的一件事。`;
  }

  // 情绪 × 强度 × 关联因素 → 最新一条记录决定"现在该给什么"（不是历史统计，是这一刻的真实状态）
  function determineCareTier() {
    const entries = loadEntries();
    if (!entries.length) return null;
    return entries.slice().sort((a, b) => b.ts - a.ts)[0];
  }

  function getCarePlan() {
    const latest = determineCareTier();
    if (!latest) {
      return {
        tier: 'none', title: '先记录一次此刻的心情', leadText: '记录之后，我们就能为你自动搭配合适的小方案。',
        steps: [], actionLabel: '去记录心情', action: { type: 'home' }, trigger: null,
        secondaryLabel: null, homeText: '先记录一次此刻的心情，我们就能根据你的状态和关联因素自动搭配方案。',
      };
    }

    const mood = latest.mood;
    const tags = latest.tags || [];
    const trigger = tags.length ? tags.join('/') : null;

    if (mood >= 4) {
      const p = MOOD_ONLY_PLANS[mood];
      return {
        tier: 'mood' + mood, title: p.title, leadText: p.lead, steps: [], trigger,
        actionLabel: p.primaryLabel, action: p.action,
        secondaryLabel: p.secondaryLabel, secondaryBehavior: p.secondaryBehavior, secondaryMessage: p.secondaryMessage,
        homeText: p.home,
      };
    }

    const frame = MOOD_FRAME[mood];
    let body;
    if (tags.length >= 2 && mood <= 2) {
      body = { lead: buildCombinedLead(tags, mood), steps: [], primaryLabel: frame.primaryLabel, action: frame.action };
    } else if (tags.length >= 1 && FACTOR_COPY[tags[0]] && FACTOR_COPY[tags[0]][mood]) {
      const fc = FACTOR_COPY[tags[0]][mood];
      body = { lead: fc.lead, steps: fc.steps || [], primaryLabel: fc.primaryLabel, action: fc.action };
    } else {
      body = { lead: frame.defaultLead, steps: [], primaryLabel: frame.primaryLabel, action: frame.action };
    }

    return {
      tier: 'mood' + mood, title: frame.title, leadText: body.lead, steps: body.steps, trigger,
      actionLabel: body.primaryLabel, action: body.action,
      secondaryLabel: frame.secondaryLabel, secondaryBehavior: frame.secondaryBehavior, secondaryMessage: frame.secondaryMessage,
      homeText: frame.home,
    };
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
    } else if (plan.action.type === 'music') {
      AmbientAudio.play(plan.action.music);
      syncMusicUI();
      document.getElementById('careMusicCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (plan.action.type === 'note') {
      const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts);
      if (entries.length) openEntryEditor(entries[0].id);
    } else {
      showView('home');
    }
  }

  document.getElementById('carePlanStartBtn').addEventListener('click', startCarePlanAction);
  document.getElementById('carePlanSkipBtn').addEventListener('click', () => {
    const plan = getCarePlan();
    if (plan.secondaryBehavior === 'navigate') {
      showView('home');
      return;
    }
    const restEl = document.getElementById('carePlanRest');
    restEl.textContent = plan.secondaryMessage || '那今天先休息也可以。你已经完成了一次记录，这就足够了。';
    restEl.hidden = false;
  });

  function renderCarePlanCard() {
    const plan = getCarePlan();
    document.getElementById('carePlanTitle').textContent = plan.title;
    document.getElementById('carePlanLead').textContent = plan.leadText;
    document.getElementById('carePlanSteps').innerHTML = plan.steps.length
      ? plan.steps.map((s, i) => `<div class="care-step"><span class="care-step-num">${i + 1}</span><span>${s}</span></div>`).join('')
      : '';
    document.getElementById('carePlanStartBtn').textContent = plan.actionLabel;
    const skipBtn = document.getElementById('carePlanSkipBtn');
    skipBtn.hidden = plan.tier === 'none' || !plan.secondaryLabel;
    skipBtn.textContent = plan.secondaryLabel || '';
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
