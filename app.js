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

  // 情绪植物图鉴 v1：强度>=4（盛开阶段）时，不再只看心情档位选花，
  // 还会结合当次记录的第一个关联因素，长出对应的"品种"——每个心情档位有
  // 一个默认品种（matchTag: null）和若干因素专属品种。素材目前用现有花朵
  // 做色相/明度变体，先把"品种系统"整体搭起来，以后可以逐步换成真实手绘素材。
  const PLANT_SPECIES = [
    { id: 'coral-tulip', name: '珊瑚郁金香', mood: 5, matchTag: null, asset: 'assets/flower-great-bloom.png', desc: '很好的日子里，最常陪着你的那一朵。' },
    { id: 'sunflower', name: '向日葵', mood: 5, matchTag: '健康', asset: 'assets/species-sunflower.png', desc: '身体状态也很好的日子，会开出这样热烈的花。' },
    { id: 'warm-tulip', name: '暖阳郁金香', mood: 5, matchTag: '社交媒体', asset: 'assets/species-warm-tulip.png', desc: '和朋友们热闹连接在一起时，长出的金色郁金香。' },
    { id: 'peach-tulip', name: '蜜桃郁金香', mood: 4, matchTag: null, asset: 'assets/flower-good-bloom.png', desc: '不错的日子里，最常见的那一朵。' },
    { id: 'pink-tulip', name: '粉色郁金香', mood: 4, matchTag: '人际关系', asset: 'assets/species-pink-tulip.png', desc: '和人之间温柔的联系，会长出粉色的郁金香。' },
    { id: 'sage-sprout', name: '鼠尾草嫩芽', mood: 3, matchTag: null, asset: 'assets/flower-okay-half.png', desc: '普普通通的日子，也在悄悄生长。' },
    { id: 'mist-sage', name: '晨雾鼠尾草', mood: 3, matchTag: '天气', asset: 'assets/species-mist-sage.png', desc: '阴天或雨天，也会长出这样安静的颜色。' },
    { id: 'bluebell-mist', name: '雾蓝铃兰', mood: 2, matchTag: null, asset: 'assets/flower-low-2.png', desc: '低落的日子，也会长出自己的花。' },
    { id: 'moonflower', name: '月光花', mood: 2, matchTag: '睡眠', asset: 'assets/species-moonflower.png', desc: '没睡好的低落时刻，会开出这样安静发白的花。' },
    { id: 'bluebell', name: '蓝铃花', mood: 2, matchTag: '工作学业', asset: 'assets/species-bluebell.png', desc: '工作压得喘不过气的低落里，长出的深蓝色小花。' },
    { id: 'night-rose', name: '深夜玫瑰', mood: 1, matchTag: null, asset: 'assets/flower-awful-1.png', desc: '很糟的时刻，也被好好地留在了这里。' },
    { id: 'rain-bud', name: '雨夜蓓蕾', mood: 1, matchTag: '睡眠', asset: 'assets/flower-awful-2.png', desc: '疲惫到极点的夜晚，蜷缩成的一朵花苞。' },
    { id: 'lavender-night', name: '静夜薰衣草', mood: 1, matchTag: '独处', asset: 'assets/species-lavender-night.png', desc: '一个人很难熬的时刻，也开出了深紫色的花。' },
  ];

  function resolveSpecies(entry) {
    const tierSpecies = PLANT_SPECIES.filter(s => s.mood === entry.mood);
    const tags = entry.tags || [];
    const specific = tierSpecies.find(s => s.matchTag && tags.includes(s.matchTag));
    return specific || tierSpecies.find(s => !s.matchTag) || null;
  }

  function spriteFor(entry) {
    const stage = entry.intensity >= 4 ? 1 : 0;
    if (stage === 1) {
      const species = resolveSpecies(entry);
      if (species) return species.asset;
    }
    return MOOD_SPRITES[entry.mood][stage];
  }

  const SEEN_SPECIES_KEY = 'moodDiary.seenSpecies.v1';
  function loadSeenSpecies() {
    try { return JSON.parse(localStorage.getItem(SEEN_SPECIES_KEY)) || []; } catch (e) { return []; }
  }
  function markSpeciesSeen(id) {
    const seen = loadSeenSpecies();
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(SEEN_SPECIES_KEY, JSON.stringify(seen));
    }
  }
  function computeDiscoveredSpecies() {
    const set = new Set();
    loadEntries().filter(e => e.intensity >= 4).forEach(e => {
      const sp = resolveSpecies(e);
      if (sp) set.add(sp.id);
    });
    return set;
  }

  // 发现新品种的庆祝时刻：只在第一次长出某个品种时出现一次，之后同一品种
  // 再次出现不会重复打扰——这是一种轻量的、不会破坏治愈感的变量奖励。
  function showSpeciesDiscovery(species) {
    document.getElementById('speciesDiscoverImg').src = species.asset;
    document.getElementById('speciesDiscoverName').textContent = species.name;
    document.getElementById('speciesDiscoverDesc').textContent = species.desc;
    const backdrop = document.getElementById('speciesBackdrop');
    const card = document.getElementById('speciesDiscoverCard');
    backdrop.hidden = false;
    card.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      card.classList.add('show');
    });
  }
  function closeSpeciesDiscovery() {
    document.getElementById('speciesBackdrop').classList.remove('show');
    document.getElementById('speciesDiscoverCard').classList.remove('show');
    setTimeout(() => {
      document.getElementById('speciesBackdrop').hidden = true;
      document.getElementById('speciesDiscoverCard').hidden = true;
    }, 300);
  }
  function checkSpeciesDiscovery(entry) {
    if (entry.intensity < 4) return;
    const species = resolveSpecies(entry);
    if (!species) return;
    if (loadSeenSpecies().includes(species.id)) return;
    markSpeciesSeen(species.id);
    showSpeciesDiscovery(species);
  }
  document.getElementById('speciesDiscoverCloseBtn').addEventListener('click', closeSpeciesDiscovery);
  document.getElementById('speciesDiscoverViewBtn').addEventListener('click', () => {
    closeSpeciesDiscovery();
    showView('species');
  });
  document.getElementById('speciesBackdrop').addEventListener('click', closeSpeciesDiscovery);

  function renderSpeciesLinks() {
    const discovered = computeDiscoveredSpecies();
    document.querySelectorAll('.species-link-count').forEach(el => {
      el.textContent = `植物图鉴 · 已发现 ${discovered.size}/${PLANT_SPECIES.length} 种`;
    });
  }

  function renderSpeciesGuide() {
    const discovered = computeDiscoveredSpecies();
    document.getElementById('speciesProgressText').textContent = `已发现 ${discovered.size}/${PLANT_SPECIES.length} 种`;
    document.getElementById('speciesGrid').innerHTML = PLANT_SPECIES.map(sp => {
      if (discovered.has(sp.id)) {
        return `<div class="species-cell found">
          <img src="${sp.asset}" alt="${sp.name}">
          <div class="species-cell-name">${sp.name}</div>
        </div>`;
      }
      return `<div class="species-cell locked">
        <div class="species-cell-silhouette">?</div>
        <div class="species-cell-name">${MOOD_META[sp.mood].label}的日子里</div>
      </div>`;
    }).join('');
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

  // 延迟回访：记下哪些低落记录已经被"回访"过（回答了或明确不想回答），
  // 避免同一条记录被反复追问。这是 Before → Intervention → After 数据链路的第一步。
  const DELAYED_CHECKIN_KEY = 'moodDiary.delayedCheckins.v1';
  function loadDelayedCheckins() {
    try {
      return JSON.parse(localStorage.getItem(DELAYED_CHECKIN_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function markDelayedCheckin(entryId, response) {
    const map = loadDelayedCheckins();
    map[entryId] = { ts: Date.now(), response };
    localStorage.setItem(DELAYED_CHECKIN_KEY, JSON.stringify(map));
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
  const views = ['home', 'log', 'insight', 'care', 'history', 'species', 'ai-chat'];
  function showView(name) {
    views.forEach(v => {
      document.getElementById('view-' + v).classList.toggle('active', v === name);
    });
    // 植物图鉴和小萤陪聊都是子页面，不在底部导航里，切过去时保留"花园"的高亮状态
    if (name !== 'species' && name !== 'ai-chat') {
      document.querySelectorAll('.tab-item').forEach(el => {
        el.classList.toggle('active', el.dataset.nav === name);
      });
    }
    if (name === 'home') renderHome();
    if (name === 'insight') renderInsight();
    if (name === 'care') renderCare();
    if (name === 'history') { renderHistory(); renderAiSettingsUI(); }
    if (name === 'species') renderSpeciesGuide();
    if (name === 'ai-chat') renderAiChat();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) showView(navEl.dataset.nav);
  });

  // ---------- log form state：渐进式 check-in（强度 → 关联 → 一句话）----------
  let selectedMood = null;
  let selectedIntensity = 3;
  const selectedTags = new Set();
  let checkinStep = 1;

  document.getElementById('moodPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.mood-opt');
    if (!btn) return;
    selectedMood = Number(btn.dataset.mood);
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.toggle('selected', el === btn));
    updateCheckinQuestions();
  });

  document.getElementById('triggerPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-opt');
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (selectedTags.has(tag)) { selectedTags.delete(tag); btn.classList.remove('selected'); }
    else { selectedTags.add(tag); btn.classList.add('selected'); }
  });

  document.getElementById('intensityDots').addEventListener('click', (e) => {
    const btn = e.target.closest('.intensity-dot');
    if (!btn) return;
    selectedIntensity = Number(btn.dataset.value);
    document.querySelectorAll('.intensity-dot').forEach(el => el.classList.toggle('selected', el === btn));
    setTimeout(() => showCheckinStep(2), 220);
  });

  // 关联因素问题 / 一句话占位符都根据当前心情动态变化，而不是一句固定文案
  function factorQuestionFor(mood) {
    if (mood >= 4) return '今天这份好心情，好像跟什么有关？';
    if (mood === 3) return '今天的感觉，好像更多和什么有关？';
    return '今天的不舒服，好像更多来自哪里？';
  }
  function notePlaceholderFor(mood, tags) {
    if (mood <= 2) {
      return tags.length ? '今天最让你累的是什么？' : '不需要整理好语言，想到什么就写什么。';
    }
    if (mood >= 4) return '今天有什么开心的瞬间？';
    return '有什么想记下的吗？';
  }
  function updateCheckinQuestions() {
    if (!selectedMood) return;
    document.getElementById('checkinFactorQuestion').textContent = factorQuestionFor(selectedMood);
    document.getElementById('note').placeholder = notePlaceholderFor(selectedMood, Array.from(selectedTags));
  }

  function showCheckinStep(n) {
    checkinStep = n;
    [1, 2, 3].forEach(i => {
      document.getElementById('checkinStep' + i).hidden = i !== n;
    });
    document.querySelectorAll('.checkin-step-dot').forEach(dot => {
      const step = Number(dot.dataset.step);
      dot.classList.toggle('active', step === n);
      dot.classList.toggle('done', step < n);
    });
    if (n === 2 || n === 3) updateCheckinQuestions();
  }

  document.getElementById('checkinStep2Back').addEventListener('click', () => showCheckinStep(1));
  document.getElementById('checkinStep2Skip').addEventListener('click', () => showCheckinStep(3));
  document.getElementById('checkinStep2Next').addEventListener('click', () => showCheckinStep(3));
  document.getElementById('checkinStep3Back').addEventListener('click', () => showCheckinStep(2));
  document.getElementById('checkinStep3Skip').addEventListener('click', () => saveCheckinEntry());

  function resetLogForm() {
    selectedMood = null;
    selectedIntensity = 3;
    selectedTags.clear();
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.tag-opt').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.intensity-dot').forEach(el => el.classList.remove('selected'));
    document.getElementById('note').value = '';
    document.getElementById('note').placeholder = '发生了什么？此刻脑子里在想什么？';
    showCheckinStep(1);
  }

  function openEntryEditor(entryId) {
    const entry = loadEntries().find(e => e.id === entryId);
    if (!entry) return;
    editingEntryId = entryId;
    selectedMood = entry.mood;
    selectedIntensity = entry.intensity;
    selectedTags.clear();
    (entry.tags || []).forEach(t => selectedTags.add(t));
    document.querySelectorAll('.mood-opt').forEach(el => el.classList.toggle('selected', Number(el.dataset.mood) === entry.mood));
    document.querySelectorAll('.tag-opt').forEach(el => el.classList.toggle('selected', selectedTags.has(el.dataset.tag)));
    document.querySelectorAll('.intensity-dot').forEach(el => el.classList.toggle('selected', Number(el.dataset.value) === entry.intensity));
    document.getElementById('note').value = entry.note || '';
    document.getElementById('logDeleteBtn').hidden = false;
    showCheckinStep(1);
    updateCheckinQuestions();
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

  function saveCheckinEntry() {
    if (!selectedMood) {
      showCheckinStep(1);
      document.getElementById('checkinMoodPill').style.outline = '2px solid var(--danger)';
      setTimeout(() => { document.getElementById('checkinMoodPill').style.outline = ''; }, 900);
      return;
    }
    const fields = {
      mood: selectedMood,
      intensity: selectedIntensity,
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
    checkSpeciesDiscovery(fields);
    if (checkSafetyRisk(fields.note)) showSafetyFlow();
  }

  document.getElementById('saveEntryBtn').addEventListener('click', saveCheckinEntry);

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

  // 即时风险检测：窄而准的短语匹配，不是诊断，也不是全面的风险识别系统。
  // 只能抓住明确、直接的自伤/自杀意图表达，抓不住间接的求助信号（比如"感觉很累""撑不下去了"
  // 这类话不会触发）。宁可漏掉一些，也不用单字匹配（比如"死"）——那样"笑死了""累死了"这种
  // 日常夸张说法也会被算进来，误报只会让用户觉得被过度反应，反而失去信任。
  // 全程只在本地做字符串匹配，不发送到任何地方，和"数据不上传"的承诺不冲突。
  const SAFETY_RISK_PHRASES = [
    '不想活了', '不想活下去', '活着没有意义', '活着没意思', '活着没有意思',
    '我想自杀', '我要自杀', '想要自杀', '计划自杀',
    '结束自己的生命', '结束生命', '了结自己',
    '我想死', '好想死', '死了算了', '死掉算了', '不如死了', '真的想死',
    '想要离开这个世界', '不想在这个世界上了',
    '轻生',
    '想伤害自己', '想自残', '开始自残', '割腕', '割手',
    '没有人会在意我死了', '没人会在意我消失',
  ];

  function checkSafetyRisk(text) {
    if (!text) return false;
    return SAFETY_RISK_PHRASES.some(phrase => text.includes(phrase));
  }

  function showSafetyFlow() {
    const backdrop = document.getElementById('safetyFlowBackdrop');
    const card = document.getElementById('safetyFlowCard');
    backdrop.hidden = false;
    card.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      card.classList.add('show');
    });
  }
  function closeSafetyFlow() {
    document.getElementById('safetyFlowBackdrop').classList.remove('show');
    document.getElementById('safetyFlowCard').classList.remove('show');
    setTimeout(() => {
      document.getElementById('safetyFlowBackdrop').hidden = true;
      document.getElementById('safetyFlowCard').hidden = true;
    }, 300);
  }
  document.getElementById('safetyFlowCloseBtn').addEventListener('click', closeSafetyFlow);
  document.getElementById('safetyFlowBackdrop').addEventListener('click', closeSafetyFlow);

  // ---------- 小萤：花园里的小伙伴（BYOK：用户自己的 API Key，直连服务商，不经过我们的服务器） ----------
  // 架构上刻意选这条路：静态站点没有后端，任何我们自己的 API Key 放进前端都会被扒走；
  // 让用户用自己的 Key 直接从浏览器调用服务商的 API，我们完全看不到 Key 也看不到对话内容，
  // "数据不上传到我们的服务器"这句承诺不受影响。
  // 服务商不只 Anthropic 一家——逐个用 curl 实测过 CORS 预检响应，只留下真的能直连成功的：
  // Anthropic（官方专门开放的 anthropic-dangerous-direct-browser-access 头）、DeepSeek、
  // 智谱 GLM、通义千问（阿里云百炼兼容模式），这几家的 API 都会在预检响应里正常回
  // access-control-allow-origin。OpenAI 官方明确不开放浏览器直连（会被拦在 CDN 层），
  // 所以没有放进来——放一个用不了的选项比不放更糟。
  // "小萤"只是一个更自然的呈现方式（花园里的一只萤火虫，而不是一个生硬的"AI聊天"功能入口），
  // 设置页和隐私说明里始终清楚写着它的话是 AI 生成的，不是刻意隐瞒。
  const AI_SETTINGS_KEY = 'moodDiary.aiSettings.v1';
  const AI_CHAT_MODEL = 'claude-haiku-4-5-20251001';
  const AI_PROVIDERS = {
    anthropic: { label: 'Anthropic（Claude）', keyPlaceholder: 'sk-ant-...' },
    deepseek: { label: 'DeepSeek', keyPlaceholder: 'sk-...' },
    zhipu: { label: '智谱 GLM', keyPlaceholder: 'API Key' },
    qwen: { label: '通义千问（阿里云百炼）', keyPlaceholder: 'sk-...' },
  };
  // DeepSeek / 智谱 / 通义千问都是 OpenAI 兼容的 chat/completions 格式，共用一套请求逻辑
  const OPENAI_COMPAT_PROVIDERS = {
    deepseek: { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
    qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo' },
  };
  const AI_CHAT_SYSTEM_PROMPT = [
    '你是"小萤"，一只住在用户情绪花园里的小萤火虫，性格温和、有耐心，说话自然、口语化，像朋友一样。',
    '- 只做共情式的陪伴和倾听，不诊断任何心理或精神状态，不给医疗或药物建议，不自称心理咨询师、治疗师或AI',
    '- 每次回复最多 2-3 句话，不要长篇分析，不要列点，不要用书面语',
    '- 可以温和地提出一个开放式问题，帮助用户说出还没想清楚或不太愿意直接说出口的感受，但每次最多问一个问题，不追问隐私细节',
    '- 语气：不评判、不说教、不强行积极、不说"你应该"',
    '- 如果内容让你觉得用户可能有自伤或自杀的风险，只回复"这句话我想认真对待，请先等一下。"然后不要再说别的——应用会接管后续的安全引导，这部分不需要你处理',
  ].join('\n');

  function loadAiSettings() {
    try { return JSON.parse(localStorage.getItem(AI_SETTINGS_KEY)) || { enabled: false, provider: 'anthropic', apiKey: '' }; }
    catch (e) { return { enabled: false, provider: 'anthropic', apiKey: '' }; }
  }
  function saveAiSettings(settings) {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  }

  function renderAiSettingsUI() {
    const settings = loadAiSettings();
    const statusEl = document.getElementById('aiKeyStatus');
    const openBtn = document.getElementById('aiOpenChatBtn');
    const providerSelect = document.getElementById('aiProviderSelect');
    const keyInput = document.getElementById('aiApiKeyInput');
    if (!statusEl || !openBtn) return;
    const provider = settings.provider || 'anthropic';
    if (providerSelect) providerSelect.value = provider;
    if (keyInput) keyInput.placeholder = (AI_PROVIDERS[provider] || AI_PROVIDERS.anthropic).keyPlaceholder;
    if (settings.enabled && settings.apiKey) {
      statusEl.textContent = `小萤醒着（${(AI_PROVIDERS[provider] || AI_PROVIDERS.anthropic).label}），随时可以聊`;
      openBtn.disabled = false;
    } else {
      statusEl.textContent = '小萤还在睡觉';
      openBtn.disabled = true;
    }
  }

  document.getElementById('aiProviderSelect').addEventListener('change', (e) => {
    const keyInput = document.getElementById('aiApiKeyInput');
    keyInput.placeholder = (AI_PROVIDERS[e.target.value] || AI_PROVIDERS.anthropic).keyPlaceholder;
  });
  document.getElementById('aiSaveKeyBtn').addEventListener('click', () => {
    const input = document.getElementById('aiApiKeyInput');
    const key = input.value.trim();
    if (!key) return;
    const provider = document.getElementById('aiProviderSelect').value;
    saveAiSettings({ enabled: true, provider, apiKey: key });
    input.value = '';
    renderAiSettingsUI();
  });
  document.getElementById('aiClearKeyBtn').addEventListener('click', () => {
    const provider = document.getElementById('aiProviderSelect').value;
    saveAiSettings({ enabled: false, provider, apiKey: '' });
    document.getElementById('aiApiKeyInput').value = '';
    renderAiSettingsUI();
  });
  document.getElementById('aiOpenChatBtn').addEventListener('click', () => {
    showView('ai-chat');
  });

  // 聊天记录只保存在内存里，离开这个视图/刷新页面就清空——不把可能很私密的对话
  // 写进 localStorage，进一步降低共享设备上的暴露风险。
  let aiChatHistory = [];

  function appendAiChatMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-msg ' + (role === 'user' ? 'ai-chat-msg-user' : 'ai-chat-msg-ai');
    let textTarget = bubble;
    if (role !== 'user') {
      const avatar = document.createElement('img');
      avatar.className = 'ai-chat-avatar';
      avatar.src = 'assets/sprite-firefly-avatar.png';
      avatar.alt = '';
      bubble.appendChild(avatar);
      const span = document.createElement('span');
      bubble.appendChild(span);
      textTarget = span;
    }
    textTarget.textContent = text;
    const wrap = document.getElementById('aiChatMessages');
    wrap.appendChild(bubble);
    wrap.scrollTop = wrap.scrollHeight;
    return textTarget;
  }

  function renderAiChat() {
    aiChatHistory = [];
    document.getElementById('aiChatMessages').innerHTML = '';
    appendAiChatMessage('assistant', '我是小萤，一直在你的花园里飞。想说什么，我都在听。');
  }

  async function callFirefly(messages) {
    const settings = loadAiSettings();
    const provider = settings.provider || 'anthropic';

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: AI_CHAT_MODEL,
          max_tokens: 300,
          system: AI_CHAT_SYSTEM_PROMPT,
          messages,
        }),
      });
      if (!res.ok) throw new Error('API error ' + res.status);
      const data = await res.json();
      return (data.content && data.content[0] && data.content[0].text) || '（没有收到回复）';
    }

    // DeepSeek / 智谱 GLM / 通义千问：都是 OpenAI 兼容格式
    const cfg = OPENAI_COMPAT_PROVIDERS[provider];
    if (!cfg) throw new Error('未知的服务商: ' + provider);
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 300,
        messages: [{ role: 'system', content: AI_CHAT_SYSTEM_PROMPT }, ...messages],
      }),
    });
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '（没有收到回复）';
  }

  async function sendAiChatMessage() {
    const input = document.getElementById('aiChatInput');
    const text = input.value.trim();
    if (!text) return;

    // 本地关键词检测是第一道、也是最主要的一道防线：命中的话直接不发给 AI。
    if (checkSafetyRisk(text)) {
      input.value = '';
      showSafetyFlow();
      return;
    }

    const settings = loadAiSettings();
    if (!settings.enabled || !settings.apiKey) {
      appendAiChatMessage('assistant', '小萤还没醒，去"我的"页唤醒它吧。');
      return;
    }

    appendAiChatMessage('user', text);
    aiChatHistory.push({ role: 'user', content: text });
    input.value = '';

    const sendBtn = document.getElementById('aiChatSendBtn');
    sendBtn.disabled = true;
    const placeholderEl = appendAiChatMessage('assistant', '……');

    try {
      const reply = await callFirefly(aiChatHistory);
      placeholderEl.textContent = reply;
      aiChatHistory.push({ role: 'assistant', content: reply });
      // 第二道防线：万一 AI 自己的措辞里出现了风险表达，同样触发安全引导。
      if (checkSafetyRisk(reply)) showSafetyFlow();
    } catch (err) {
      placeholderEl.textContent = '小萤好像没听清，可能是网络问题或者 API Key 不对，可以去"我的"页检查一下。';
    } finally {
      sendBtn.disabled = false;
    }
  }

  document.getElementById('aiChatSendBtn').addEventListener('click', sendAiChatMessage);
  document.getElementById('aiChatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAiChatMessage();
    }
  });

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

  // 延迟回访：情绪低落的记录发生 2~8 小时后、用户再次打开产品时，主动问一句"现在呢？"
  // 而不是只在做完呼吸练习那一刻问一次——这样才能攒出 Before → Intervention → After 的数据。
  const DELAYED_CHECKIN_MIN_MS = 2 * 3600000;
  const DELAYED_CHECKIN_MAX_MS = 8 * 3600000;

  function findDelayedCheckinCandidate() {
    const now = Date.now();
    const done = loadDelayedCheckins();
    const candidates = loadEntries()
      .filter(e => e.mood <= 2 && !done[e.id])
      .filter(e => {
        const age = now - e.ts;
        return age >= DELAYED_CHECKIN_MIN_MS && age <= DELAYED_CHECKIN_MAX_MS;
      })
      .sort((a, b) => b.ts - a.ts);
    return candidates[0] || null;
  }

  function timeGreeting() {
    const h = new Date().getHours();
    if (h < 11) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function buildDelayedCheckinText(entry) {
    const hoursAgo = Math.max(1, Math.round((Date.now() - entry.ts) / 3600000));
    const tag = (entry.tags || [])[0];
    const moodWord = entry.mood === 1 ? '很不好受' : '有点低落';
    const base = tag
      ? `${hoursAgo}小时前你说「${tag}」的事让你${moodWord}`
      : `${hoursAgo}小时前你记录到「${MOOD_META[entry.mood].label}」的心情`;
    return `${base}。现在呢？`;
  }

  function renderDelayedCheckin() {
    const card = document.getElementById('delayedCheckinCard');
    if (!card) return;
    const entry = findDelayedCheckinCandidate();
    if (!entry) { card.hidden = true; return; }
    document.getElementById('delayedCheckinGreeting').textContent = timeGreeting() + '。';
    document.getElementById('delayedCheckinText').textContent = buildDelayedCheckinText(entry);
    card.dataset.entryId = entry.id;
    card.hidden = false;
  }

  document.querySelectorAll('.delayed-checkin-card .care-feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = document.getElementById('delayedCheckinCard');
      const entryId = card.dataset.entryId;
      if (entryId) markDelayedCheckin(entryId, btn.dataset.value);
      card.hidden = true;
      if (btn.dataset.value !== 'skip') {
        showToast(btn.dataset.value === 'better' ? '好的，谢谢你告诉我们。' : '好，我们知道了。');
      }
    });
  });

  // ---------- home ----------
  function renderHome() {
    const entries = loadEntries();
    const todayKey = dayKey(Date.now());
    const hasToday = entries.some(e => dayKey(e.ts) === todayKey);
    document.getElementById('todayStatus').textContent = hasToday
      ? '今天已经记录过啦，随时都能再说说现在的感觉'
      : '今天还没有记录心情，来看看你的花园吧';

    renderGarden();
    renderSpeciesLinks();
    const days7 = dailyAverages(7);

    // 这是情绪关怀产品，不是打卡类应用："连续 X 天"这种一断就归零的计数，
    // 断签那天打开只会看到"0"，潜台词是"你失败了"，和产品调性冲突。
    // 换成"这个月照顾了自己几天"——按自然月计数，不会因为某天没记录就清零。
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const careDaysThisMonth = new Set(entries.filter(e => e.ts >= monthStart).map(e => dayKey(e.ts))).size;
    document.getElementById('careDaysLine').textContent = careDaysThisMonth > 0
      ? `这个月，你已经照顾了自己 ${careDaysThisMonth} 天`
      : '这个月还没有记录，现在开始也不晚';
    document.getElementById('statTotal').textContent = entries.length;
    const withData = days7.filter(d => d.avg != null);
    const avg7 = withData.length ? (withData.reduce((s, d) => s + d.avg, 0) / withData.length) : null;
    document.getElementById('statAvg').textContent = avg7 ? avg7.toFixed(1) : '–';

    renderHomeCareCard();
    renderDelayedCheckin();

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

  // 每日花园事件：进入花园时，有一定概率发生一件轻量的小事——不是签到奖励，
  // 也不需要用户做任何事才能"赢"，只是让每天打开花园这件事多一点不确定性。
  const GARDEN_EVENTS = [
    { id: 'butterfly', message: '今天来了一只蝴蝶。', detail: '', notePrompt: '今天有什么事情，让你觉得轻松了一点？', actionLabel: '说说看', action: 'note' },
    { id: 'rain', message: '花园今天下雨了。', detail: '有些日子不用开花，喝一点水也很好。', action: 'none' },
    { id: 'snail', message: '草地上出现一只小蜗牛。', detail: '今天要不要慢一点？', actionLabel: '陪我慢下来', action: 'breathing' },
    { id: 'sprout', message: '发现一株陌生的嫩芽。', detail: '再记录几次，看看它会长成什么样子。', action: 'none' },
  ];
  const GARDEN_EVENT_KEY = 'moodDiary.gardenEvent.v1';
  const GARDEN_EVENT_CHANCE = 0.45;

  function loadGardenEventState() {
    try { return JSON.parse(localStorage.getItem(GARDEN_EVENT_KEY)) || null; } catch (e) { return null; }
  }
  function saveGardenEventState(state) {
    localStorage.setItem(GARDEN_EVENT_KEY, JSON.stringify(state));
  }
  function rollGardenEvent() {
    const today = dayKey(Date.now());
    let state = loadGardenEventState();
    if (state && state.date === today) return state;
    state = { date: today, eventId: null, dismissed: false };
    if (Math.random() < GARDEN_EVENT_CHANCE) {
      state.eventId = GARDEN_EVENTS[Math.floor(Math.random() * GARDEN_EVENTS.length)].id;
    }
    saveGardenEventState(state);
    return state;
  }

  function renderGardenEvent(isCurrentPlot) {
    const card = document.getElementById('gardenEvent');
    const state = rollGardenEvent();
    const event = isCurrentPlot && state.eventId && !state.dismissed
      ? GARDEN_EVENTS.find(e => e.id === state.eventId)
      : null;
    if (!event) { card.hidden = true; return; }
    document.getElementById('gardenEventMessage').textContent = event.message;
    document.getElementById('gardenEventDetail').textContent = event.detail || '';
    document.getElementById('gardenEventDetail').hidden = !event.detail;
    const actionBtn = document.getElementById('gardenEventActionBtn');
    if (event.action !== 'none') {
      actionBtn.textContent = event.actionLabel;
      actionBtn.hidden = false;
      actionBtn.dataset.eventId = event.id;
    } else {
      actionBtn.hidden = true;
    }
    card.hidden = false;
  }

  function dismissGardenEvent() {
    const state = loadGardenEventState();
    if (state) {
      state.dismissed = true;
      saveGardenEventState(state);
    }
    document.getElementById('gardenEvent').hidden = true;
  }
  document.getElementById('gardenEventDismissBtn').addEventListener('click', dismissGardenEvent);
  document.getElementById('gardenEventActionBtn').addEventListener('click', (e) => {
    const eventId = e.currentTarget.dataset.eventId;
    const event = GARDEN_EVENTS.find(ev => ev.id === eventId);
    dismissGardenEvent();
    if (!event) return;
    if (event.action === 'note') {
      const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts);
      const todayEntry = entries.find(x => dayKey(x.ts) === dayKey(Date.now()));
      if (todayEntry) {
        openEntryEditor(todayEntry.id);
        showCheckinStep(3);
        document.getElementById('checkinNoteQuestion').textContent = event.notePrompt;
        document.getElementById('note').placeholder = event.notePrompt;
      }
    } else if (event.action === 'breathing') {
      showView('care');
      document.getElementById('breathingCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!breathRunning) startBreathing();
    }
  });

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
    renderGardenEvent(isCurrentPlot);

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

  // 花园里的每一朵花都是一条可以打开的情绪记忆：轻点打开详情卡片，
  // 长按看看这朵花陪了你多少天——花园从"打卡记录"变成"情绪数据本身"。
  let sheetEntryId = null;
  let flowerPressTimer = null;
  let flowerLongPressFired = false;
  let flowerPressEntryId = null;

  function fmtSheetDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function showSheet() {
    const backdrop = document.getElementById('flowerSheetBackdrop');
    const sheet = document.getElementById('flowerSheet');
    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      sheet.classList.add('show');
    });
  }

  function closeFlowerSheet() {
    document.getElementById('flowerSheetBackdrop').classList.remove('show');
    document.getElementById('flowerSheet').classList.remove('show');
    setTimeout(() => {
      document.getElementById('flowerSheetBackdrop').hidden = true;
      document.getElementById('flowerSheet').hidden = true;
    }, 300);
  }

  // 轻点花园里一朵花：打开这一条记录的只读详情
  function openFlowerSheet(entryId) {
    const entry = loadEntries().find(e => e.id === entryId);
    if (!entry) return;
    sheetEntryId = entryId;
    document.getElementById('flowerSheetDate').textContent = `${fmtSheetDate(entry.ts)} · ${MOOD_META[entry.mood].label}`;
    const moodEl = document.getElementById('flowerSheetMood');
    moodEl.innerHTML = `<img src="${MOOD_META[entry.mood].icon}" alt="">情绪强度 ${entry.intensity}/5`;
    moodEl.hidden = false;
    const tagsEl = document.getElementById('flowerSheetTags');
    if (entry.tags && entry.tags.length) {
      tagsEl.textContent = entry.tags.join(' · ');
      tagsEl.hidden = false;
    } else {
      tagsEl.hidden = true;
    }
    const noteEl = document.getElementById('flowerSheetNote');
    if (entry.note) {
      noteEl.textContent = `"${entry.note}"`;
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
    }
    document.getElementById('flowerSheetList').hidden = true;
    document.getElementById('flowerSheetViewBtn').hidden = false;
    showSheet();
  }

  // 点日历里的一天：如果那天有不止一条记录，先展示一条时间轴，
  // 点其中一条再进入上面那个只读详情——"一天只是一个格子"变成"一天是一条轨迹"。
  function openDaySheet(dayEntries) {
    const list = dayEntries.slice().sort((a, b) => a.ts - b.ts);
    if (list.length === 1) { openFlowerSheet(list[0].id); return; }
    sheetEntryId = null;
    document.getElementById('flowerSheetDate').textContent = fmtSheetDate(list[0].ts);
    document.getElementById('flowerSheetMood').hidden = true;
    document.getElementById('flowerSheetTags').hidden = true;
    document.getElementById('flowerSheetNote').hidden = true;
    document.getElementById('flowerSheetViewBtn').hidden = true;
    const listEl = document.getElementById('flowerSheetList');
    listEl.innerHTML = list.map(e => `
      <button type="button" class="sheet-list-row" data-entry-id="${e.id}">
        <span class="sheet-list-time">${fmtTime(e.ts)}</span>
        <img class="sheet-list-sprite" src="${spriteFor(e)}" alt="">
        <span class="sheet-list-label">${MOOD_META[e.mood].label}</span>
      </button>
    `).join('');
    listEl.hidden = false;
    showSheet();
  }

  document.getElementById('flowerSheetList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-entry-id]');
    if (row) openFlowerSheet(row.dataset.entryId);
  });

  document.getElementById('flowerSheetBackdrop').addEventListener('click', closeFlowerSheet);
  document.getElementById('flowerSheetViewBtn').addEventListener('click', () => {
    const id = sheetEntryId;
    closeFlowerSheet();
    if (id) openEntryEditor(id);
  });

  function showToast(text) {
    const toast = document.getElementById('flowerToast');
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.hidden = true; }, 250);
    }, 2600);
  }

  function showFlowerCompanionToast(entryId) {
    const entry = loadEntries().find(e => e.id === entryId);
    if (!entry) return;
    const days = Math.floor((startOfDay(Date.now()) - startOfDay(entry.ts)) / 86400000);
    showToast(days <= 0 ? '这朵花是今天刚种下的。' : `这朵花已经陪你 ${days} 天了。`);
  }

  const gardenTimelineEl = document.getElementById('gardenTimeline');
  gardenTimelineEl.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('[data-entry-id]');
    if (!slot) return;
    flowerPressEntryId = slot.dataset.entryId;
    flowerLongPressFired = false;
    clearTimeout(flowerPressTimer);
    flowerPressTimer = setTimeout(() => {
      flowerLongPressFired = true;
      showFlowerCompanionToast(flowerPressEntryId);
    }, 550);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
    gardenTimelineEl.addEventListener(evt, (e) => {
      clearTimeout(flowerPressTimer);
      if (evt === 'pointerup' && !flowerLongPressFired && flowerPressEntryId) {
        const slot = e.target.closest('[data-entry-id]');
        if (slot && slot.dataset.entryId === flowerPressEntryId) {
          openFlowerSheet(flowerPressEntryId);
        }
      }
      flowerPressEntryId = null;
    });
  });

  document.getElementById('plotPrevBtn').addEventListener('click', () => {
    gardenViewOffset++;
    renderGarden();
  });
  document.getElementById('plotNextBtn').addEventListener('click', () => {
    gardenViewOffset = 0;
    renderGarden();
  });

  // 记录情绪 = 种下一朵花：这是产品最有仪式感的一次交互，反馈需要配得上这个隐喻，
  // 而不是一句轻描淡写的"记下了"。
  const PLANT_MESSAGES = {
    5: '今天的好心情，已经种下来了。',
    4: '今天这份不错的心情，也被好好记在这里了。',
    3: '普通的一天，也值得留下一点痕迹。',
    2: '今天的低落，也被好好放在这里了。',
    1: '今天不用急着变好，先把这一刻放在这里。',
  };

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
      setTimeout(() => todaySlot.classList.remove('just-grown'), 700);
    }

    // 低落/很糟：用户已经明确说了"我现在不舒服"，产品不该还要求用户继续填表——
    // 立即原地给出关怀 sheet，而不是一句轻描淡写的"记下了"。
    if (score === 1 || score === 2) {
      openCareFlow(entry.id, score);
    } else {
      const bubble = document.getElementById('detailBubble');
      document.getElementById('detailBubbleText').textContent = PLANT_MESSAGES[score];
      bubble.hidden = false;
      bubble.classList.remove('anim');
      void bubble.offsetWidth; // 强制重排，让淡入动画每次都能重新播放
      bubble.classList.add('anim');
      clearTimeout(quickLogMood._hideTimer);
      quickLogMood._hideTimer = setTimeout(() => { bubble.hidden = true; }, 9000);
    }

    if (total > 0 && total % GARDEN_MILESTONE === 0) {
      celebrateMilestone();
    }
  }

  document.getElementById('quickMoodRow').addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-mood-btn');
    if (!btn) return;
    quickLogMood(Number(btn.dataset.mood));
  });

  // ---------- Adaptive Care Flow：负面情绪的即时关怀 ----------
  // 核心原则：先回应，再询问，再行动；状态越差，交互负担越小。
  // 全程在一个原地展开的 bottom sheet 里完成，不跳转页面——背后的花园始终都在。
  const CF_INTRO = {
    2: {
      lead: '今天好像有点难熬。\n不急着让自己马上好起来。\n我先陪你缓一下。',
      primary: { label: '和我待一会儿', action: 'breathing' },
      secondary: { label: '我想说说发生了什么', action: 'reasonL1' },
      tertiary: { label: '先记下来就好', action: 'close' },
    },
    1: {
      lead: '今天可能真的很不好受。\n现在不用解释发生了什么，也不用逼自己马上振作。\n先让这一刻稍微容易一点。',
      primary: { label: '陪我缓 1 分钟', action: 'breathing' },
      secondary: { label: '我想说一点', action: 'reasonL1' },
      tertiary: { label: '现在什么都不想做', action: 'refusal' },
    },
  };

  const CF_REASONS_L1 = [
    { key: '工作学业', label: '工作 / 学业' },
    { key: '人际关系', label: '和人的关系' },
    { key: '睡眠', label: '身体 / 睡眠' },
    { key: '财务', label: '钱' },
    { key: '独处', label: '一个人待着' },
    { key: '说不上来', label: '说不上来' },
  ];

  const CF_RELATIONSHIP_L2 = [
    { label: '朋友', reasonKey: '人际关系' },
    { label: '伴侣', reasonKey: '人际关系' },
    { label: '家庭', reasonKey: '家庭' },
    { label: '同事', reasonKey: '人际关系' },
    { label: '其他', reasonKey: '人际关系' },
  ];

  const CF_RESPONSES = {
    '工作学业': {
      lead: '最近是不是被事情压得有点满？\n现在不用把整个问题解决。我们只找下一件最小的事情。',
      primary: { label: '帮我把事情拆小', action: 'note', notePrompt: '下一件最小的事情是什么？' },
      secondary: { label: '我现在只想休息', action: 'breathing' },
    },
    '人际关系': {
      lead: '和人的事情，有时候真的很消耗。\n现在不用急着判断谁对谁错。可以先照顾一下自己的感受。',
      primary: { label: '帮我理一理', action: 'note', notePrompt: '发生了什么？它让你有什么感觉？' },
      secondary: { label: '我想先离开这件事', action: 'breathing' },
    },
    '家庭': {
      lead: '越重要的人，有时候越容易让我们难受。\n今天不用同时处理自己的情绪和所有人的情绪。',
      primary: { label: '让我缓一下', action: 'breathing' },
      secondary: { label: '我想写下来', action: 'note', notePrompt: '想写下来的话，就写在这里。' },
    },
    '睡眠': {
      lead: '你可能真的有点累了。\n没休息好的时候，很多原本能承受的事情都会变得更难。',
      primary: { label: '陪我放松 2 分钟', action: 'breathing' },
      secondary: { label: '今晚早点停下来', action: 'acknowledge', message: '好，那今晚早点让自己躺下。' },
    },
    '财务': {
      lead: '钱的事情很容易让很多问题一起涌上来。\n先不用解决全部。我们只分清楚一件今天必须处理的事。',
      primary: { label: '帮我理一下', action: 'note', notePrompt: '今天必须处理的一件事是什么？' },
      secondary: { label: '今天先不处理', action: 'acknowledge', message: '好，今天先不处理，也没关系。' },
    },
    '说不上来': {
      lead: '不知道为什么难受，也没关系。\n我们不一定要找到原因，才能允许自己休息。',
      primary: { label: '陪我缓一下', action: 'breathing' },
    },
  };

  let careFlowEntryId = null;
  let careFlowMood = null;
  let careFlowTrigger = null;
  const careFlowTimers = [];

  function clearCareFlowTimers() {
    careFlowTimers.forEach(t => clearTimeout(t));
    careFlowTimers.length = 0;
  }

  function openCareFlow(entryId, mood) {
    careFlowEntryId = entryId;
    careFlowMood = mood;
    careFlowTrigger = null;
    showCareFlowIntro();
    const backdrop = document.getElementById('careFlowBackdrop');
    const sheet = document.getElementById('careFlowSheet');
    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      sheet.classList.add('show');
    });
  }

  function closeCareFlow() {
    clearCareFlowTimers();
    document.getElementById('careFlowBackdrop').classList.remove('show');
    document.getElementById('careFlowSheet').classList.remove('show');
    setTimeout(() => {
      document.getElementById('careFlowBackdrop').hidden = true;
      document.getElementById('careFlowSheet').hidden = true;
    }, 300);
  }

  function setCareFlowBody(html) {
    clearCareFlowTimers();
    document.getElementById('careFlowBody').innerHTML = html;
  }

  function updateCareFlowTag(tag) {
    if (!careFlowEntryId || !tag) return;
    const entries = loadEntries();
    const idx = entries.findIndex(e => e.id === careFlowEntryId);
    if (idx === -1) return;
    const tags = new Set(entries[idx].tags || []);
    tags.add(tag);
    entries[idx].tags = Array.from(tags);
    saveEntries(entries);
    careFlowTrigger = tag;
  }

  function showCareFlowIntro() {
    const cfg = CF_INTRO[careFlowMood];
    const aiSettings = loadAiSettings();
    const aiBtn = (aiSettings.enabled && aiSettings.apiKey)
      ? `<button type="button" class="btn btn-ghost btn-block" data-cf="ai-chat">去找小萤说说</button>`
      : '';
    setCareFlowBody(`
      <p class="cf-lead">${cfg.lead}</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-primary btn-block" data-cf="${cfg.primary.action}">${cfg.primary.label}</button>
        <button type="button" class="btn btn-ghost btn-block" data-cf="${cfg.secondary.action}">${cfg.secondary.label}</button>
        ${aiBtn}
        <button type="button" class="cf-btn-text" data-cf="${cfg.tertiary.action}">${cfg.tertiary.label}</button>
      </div>
    `);
  }

  function showCareFlowReasonL1() {
    setCareFlowBody(`
      <button type="button" class="cf-back" data-cf="back-intro">‹ 返回</button>
      <p class="cf-question">今天的不舒服，更像来自哪里？</p>
      <div class="cf-reason-grid">
        ${CF_REASONS_L1.map(r => `<button type="button" class="cf-reason-btn" data-cf="reason" data-key="${r.key}">${r.label}</button>`).join('')}
      </div>
    `);
  }

  function showCareFlowRelationshipL2() {
    setCareFlowBody(`
      <button type="button" class="cf-back" data-cf="reasonL1">‹ 返回</button>
      <p class="cf-question">和谁之间的事？</p>
      <div class="cf-reason-grid">
        ${CF_RELATIONSHIP_L2.map(o => `<button type="button" class="cf-reason-btn" data-cf="reason" data-key="${o.reasonKey}" data-tag="${o.reasonKey}">${o.label}</button>`).join('')}
      </div>
    `);
  }

  function showCareFlowAloneSub() {
    setCareFlowBody(`
      <button type="button" class="cf-back" data-cf="reasonL1">‹ 返回</button>
      <p class="cf-question">今天一个人待着，更像是？</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-ghost btn-block" data-cf="alone" data-key="lonely">有点孤单</button>
        <button type="button" class="btn btn-ghost btn-block" data-cf="alone" data-key="comfortable">其实挺舒服</button>
        <button type="button" class="btn btn-ghost btn-block" data-cf="alone" data-key="unsure">说不上来</button>
      </div>
    `);
  }

  function showCareFlowAloneResponse(key) {
    updateCareFlowTag('独处');
    if (key === 'lonely') {
      setCareFlowBody(`
        <p class="cf-lead">要不要和世界产生一个很小的连接？\n比如，给朋友发一个表情。</p>
        <div class="cf-actions">
          <button type="button" class="btn btn-primary btn-block" data-cf="acknowledge" data-message="好，希望这个小小的连接，能让你感觉好一点。">就这样试试</button>
          <button type="button" class="cf-btn-text" data-cf="close">先不了</button>
        </div>
      `);
    } else {
      const message = key === 'comfortable' ? '那就好好享受这段自己的时间。' : '说不清楚也没关系，不是所有感觉都需要被解释。';
      setCareFlowBody(`
        <p class="cf-lead">${message}</p>
        <div class="cf-actions">
          <button type="button" class="btn btn-ghost btn-block" data-cf="close">回到花园</button>
        </div>
      `);
    }
  }

  function showCareFlowResponse(reasonKey) {
    const cfg = CF_RESPONSES[reasonKey];
    if (!cfg) { closeCareFlow(); return; }
    const secondaryHtml = cfg.secondary
      ? `<button type="button" class="btn btn-ghost btn-block" data-cf="${cfg.secondary.action}" data-prompt="${cfg.secondary.notePrompt || ''}" data-message="${cfg.secondary.message || ''}">${cfg.secondary.label}</button>`
      : '';
    setCareFlowBody(`
      <p class="cf-lead">${cfg.lead}</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-primary btn-block" data-cf="${cfg.primary.action}" data-prompt="${cfg.primary.notePrompt || ''}" data-message="${cfg.primary.message || ''}">${cfg.primary.label}</button>
        ${secondaryHtml}
      </div>
    `);
  }

  function showCareFlowNote(prompt) {
    setCareFlowBody(`
      <p class="cf-question">${prompt}</p>
      <textarea class="cf-note-textarea" id="cfNoteInput" placeholder="想到什么就写什么"></textarea>
      <div class="cf-actions">
        <button type="button" class="btn btn-primary btn-block" data-cf="save-note">保存</button>
        <button type="button" class="cf-btn-text" data-cf="close">先不写了</button>
      </div>
    `);
  }

  function showCareFlowAcknowledge(message) {
    setCareFlowBody(`
      <p class="cf-lead">${message}</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-ghost btn-block" data-cf="close">回到花园</button>
      </div>
    `);
  }

  function showCareFlowRefusal() {
    setCareFlowBody(`
      <p class="cf-lead">好。\n那今天不用做什么。\n你愿意告诉我现在不好受，已经是一次照顾自己了。\n花园会替你把今天留在这里。</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-ghost btn-block" data-cf="close">回到花园</button>
      </div>
    `);
  }

  function showCareFlowBreathing() {
    setCareFlowBody(`
      <div class="cf-orb-wrap">
        <div class="cf-orb"></div>
        <p class="cf-orb-phase" id="cfOrbPhase">先不用想发生了什么。</p>
      </div>
    `);
    careFlowTimers.push(setTimeout(() => {
      const el = document.getElementById('cfOrbPhase');
      if (el) el.textContent = '慢慢吸气……\n慢慢呼气……';
    }, 10000));
    careFlowTimers.push(setTimeout(() => {
      const el = document.getElementById('cfOrbPhase');
      if (el) el.textContent = '放松一下肩膀。\n今天不用把所有事情解决。';
    }, 30000));
    careFlowTimers.push(setTimeout(showCareFlowFeedback, 60000));
  }

  function showCareFlowFeedback() {
    setCareFlowBody(`
      <p class="cf-question">现在呢？</p>
      <div class="cf-actions">
        <button type="button" class="btn btn-ghost btn-block" data-cf="feedback" data-value="better">好一点</button>
        <button type="button" class="btn btn-ghost btn-block" data-cf="feedback" data-value="same">还是差不多</button>
        <button type="button" class="btn btn-ghost btn-block" data-cf="feedback" data-value="worse">更难受了</button>
        <button type="button" class="cf-btn-text" data-cf="close">不想回答</button>
      </div>
    `);
  }

  function showCareFlowFeedbackResponse(value) {
    addCareLogEntry({ id: uid(), ts: Date.now(), kind: 'microcare', tier: careFlowMood, trigger: careFlowTrigger, feedback: value });
    if (value === 'better') {
      setCareFlowBody(`
        <p class="cf-lead">那就停在这里也很好。\n不用因为好了一点，就马上继续努力。</p>
        <div class="cf-actions">
          <button type="button" class="btn btn-ghost btn-block" data-cf="close">先到这里</button>
        </div>
      `);
    } else if (value === 'same') {
      setCareFlowBody(`
        <p class="cf-lead">没关系。\n有时候一分钟并不会改变什么。至少这一分钟，你没有要求自己解决所有事情。</p>
        <div class="cf-actions">
          <button type="button" class="btn btn-ghost btn-block" data-cf="reasonL1">换一种方式</button>
          <button type="button" class="cf-btn-text" data-cf="close">今天就到这里</button>
        </div>
      `);
    } else {
      setCareFlowBody(`
        <p class="cf-lead">看起来这个方法现在不太适合你。\n我们先不继续了。</p>
        <div class="cf-actions">
          <button type="button" class="btn btn-ghost btn-block" data-cf="acknowledge" data-message="希望身边那个人能接住你此刻的感受。">找一个信任的人</button>
          <button type="button" class="btn btn-ghost btn-block" data-cf="music">换一个更安静的方法</button>
          <button type="button" class="cf-btn-text" data-cf="close">今天先到这里</button>
        </div>
      `);
    }
  }

  document.getElementById('careFlowBackdrop').addEventListener('click', closeCareFlow);
  document.getElementById('careFlowBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cf]');
    if (!btn) return;
    const action = btn.dataset.cf;
    if (action === 'close') { closeCareFlow(); return; }
    if (action === 'refusal') { showCareFlowRefusal(); return; }
    if (action === 'reasonL1') { showCareFlowReasonL1(); return; }
    if (action === 'back-intro') { showCareFlowIntro(); return; }
    if (action === 'breathing') { showCareFlowBreathing(); return; }
    if (action === 'ai-chat') { closeCareFlow(); showView('ai-chat'); return; }
    if (action === 'alone') { showCareFlowAloneResponse(btn.dataset.key); return; }
    if (action === 'note') { showCareFlowNote(btn.dataset.prompt || '想到什么就写什么。'); return; }
    if (action === 'acknowledge') { showCareFlowAcknowledge(btn.dataset.message || '好，那就先这样。'); return; }
    if (action === 'music') { AmbientAudio.play('pad'); syncMusicUI(); showCareFlowAcknowledge('放了一段安静的声音，会一直在背景陪着你。'); return; }
    if (action === 'feedback') { showCareFlowFeedbackResponse(btn.dataset.value); return; }
    if (action === 'save-note') {
      const input = document.getElementById('cfNoteInput');
      const val = input ? input.value.trim() : '';
      if (val && careFlowEntryId) {
        const entries = loadEntries();
        const idx = entries.findIndex(x => x.id === careFlowEntryId);
        if (idx !== -1) {
          entries[idx].note = entries[idx].note ? entries[idx].note + '\n' + val : val;
          saveEntries(entries);
        }
      }
      if (checkSafetyRisk(val)) {
        closeCareFlow();
        showSafetyFlow();
      } else {
        showCareFlowAcknowledge('写下来了。谢谢你愿意花这一点时间陪自己。');
      }
      return;
    }
    if (action === 'reason') {
      const key = btn.dataset.key;
      if (key === '人际关系' && !btn.dataset.tag) { showCareFlowRelationshipL2(); return; }
      if (key === '独处') { showCareFlowAloneSub(); return; }
      const tag = btn.dataset.tag || (key === '说不上来' ? null : key);
      if (tag) updateCareFlowTag(tag);
      showCareFlowResponse(key);
    }
  });

  document.getElementById('detailBubbleMoreBtn').addEventListener('click', () => {
    document.getElementById('detailBubble').hidden = true;
    if (lastQuickEntryId) openEntryEditor(lastQuickEntryId);
  });
  document.getElementById('detailBubbleDoneBtn').addEventListener('click', () => {
    document.getElementById('detailBubble').hidden = true;
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
      const countNote = d.count > 1 ? `（${d.count} 条）` : '';
      return `<button type="button" class="cal-cell has-data" data-day="${dayKey(d.ts)}" style="background:${color};opacity:${opacity.toFixed(2)};border-color:transparent" title="${fmtShort(d.ts)}：平均情绪 ${d.avg.toFixed(1)}${countNote}"></button>`;
    }).join('');
  }

  document.getElementById('moodCalendar').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell.has-data');
    if (!cell) return;
    const dayEntries = loadEntries().filter(en => dayKey(en.ts) === cell.dataset.day);
    if (dayEntries.length) openDaySheet(dayEntries);
  });

  function renderTriggerAnalysis() {
    const entries = loadEntries();
    const el = document.getElementById('triggerAnalysis');
    if (!entries.length) {
      el.innerHTML = '<div class="history-empty">还没有足够的数据，记录几次心情后，这里会显示情绪关联分析。</div>';
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
      el.innerHTML = '<div class="history-empty">还没有记录和情绪相关的标签。</div>';
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

  // 一键开始：无论从首页还是"关怀"页触发，都直接落到具体的干预动作上，
  // 中间不再需要"关怀页 → 找到方案 → 选呼吸模式 → 开始练习"这几步手动操作。
  function startCarePlanAction() {
    const plan = getCarePlan();
    const needsCareView = plan.action.type === 'breathing' || plan.action.type === 'meditation' || plan.action.type === 'music';
    if (needsCareView && !document.getElementById('view-care').classList.contains('active')) {
      showView('care');
    }
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

  // 首页直接展示完整的个性化关怀卡（而不是一句预览文案 + "查看今天的小方案"跳转），
  // 让"一键开始"真正只需要一次点击。
  function renderHomeCareCard() {
    const plan = getCarePlan();
    document.getElementById('homeCareTitle').textContent = plan.title;
    document.getElementById('homeCareLead').textContent = plan.leadText;
    document.getElementById('homeCareStartBtn').textContent = plan.actionLabel;
    const skipBtn = document.getElementById('homeCareSkipBtn');
    skipBtn.hidden = plan.tier === 'none' || !plan.secondaryLabel;
    skipBtn.textContent = plan.secondaryLabel || '';
    document.getElementById('homeCareRest').hidden = true;
    document.getElementById('homeCareMoreBtn').hidden = plan.tier === 'none';
  }

  document.getElementById('homeCareStartBtn').addEventListener('click', startCarePlanAction);
  document.getElementById('homeCareSkipBtn').addEventListener('click', () => {
    const plan = getCarePlan();
    const restEl = document.getElementById('homeCareRest');
    restEl.textContent = plan.secondaryMessage || '好，那就先这样，慢慢来。';
    restEl.hidden = false;
  });

  function renderFireflyCareCard() {
    const settings = loadAiSettings();
    const textEl = document.getElementById('fireflyCareText');
    const btnEl = document.getElementById('fireflyCareBtn');
    if (!textEl || !btnEl) return;
    if (settings.enabled && settings.apiKey) {
      textEl.textContent = '花园里的一只小萤火虫，想聊聊的时候随时可以找它。';
      btnEl.textContent = '去找小萤聊聊';
    } else {
      textEl.textContent = '花园里住着一只小萤火虫，不过它还在睡觉——去"我的"页设置一下才能叫醒它。';
      btnEl.textContent = '去唤醒小萤';
    }
  }
  document.getElementById('fireflyCareBtn').addEventListener('click', () => {
    const settings = loadAiSettings();
    if (settings.enabled && settings.apiKey) {
      showView('ai-chat');
    } else {
      showView('history');
    }
  });

  function renderCare() {
    renderCarePlanCard();
    renderFireflyCareCard();
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
  let historyExpanded = false;
  const HISTORY_PAGE_SIZE = 8;

  function renderHistory(filter) {
    renderSpeciesLinks();
    const q = (filter || document.getElementById('historySearch').value || '').trim().toLowerCase();
    const entries = loadEntries().slice().sort((a, b) => b.ts - a.ts);
    const filtered = entries.filter(e => {
      if (!q) return true;
      const inNote = (e.note || '').toLowerCase().includes(q);
      const inTags = (e.tags || []).some(t => t.toLowerCase().includes(q));
      return inNote || inTags;
    });
    const el = document.getElementById('historyList');
    const toggleBtn = document.getElementById('historyToggleBtn');
    if (!filtered.length) {
      el.innerHTML = '<div class="history-empty">没有找到记录</div>';
      toggleBtn.hidden = true;
      return;
    }
    const showAll = historyExpanded || filtered.length <= HISTORY_PAGE_SIZE;
    const visible = showAll ? filtered : filtered.slice(0, HISTORY_PAGE_SIZE);
    if (filtered.length <= HISTORY_PAGE_SIZE) {
      toggleBtn.hidden = true;
    } else {
      toggleBtn.hidden = false;
      toggleBtn.textContent = showAll ? '收起' : `展开全部（还有 ${filtered.length - HISTORY_PAGE_SIZE} 条）`;
    }
    el.innerHTML = visible.map(e => {
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

  document.getElementById('historySearch').addEventListener('input', () => {
    historyExpanded = false;
    renderHistory();
  });
  document.getElementById('historyList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    deleteEntry(btn.dataset.del);
    renderHistory();
  });
  document.getElementById('historyToggleBtn').addEventListener('click', () => {
    historyExpanded = !historyExpanded;
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
