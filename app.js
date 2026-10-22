/* ============================================================================
   ТРЕНЕР 41 — состояние, расчёты, таймер, служебные функции
   ============================================================================ */
'use strict';

const P = window.PROGRAM;
const STORAGE_KEY = 'trainer41.v1';

/* ------------------------------- Утилиты ---------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseISO = (s) => {
  const p = String(s || '').split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
};
const dayNum = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const todayISO = () => iso(new Date());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v) => {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : null;
};
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WD_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const fmtDate = (s) => {
  const d = parseISO(s);
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
};
const fmtShort = (s) => {
  const d = parseISO(s);
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
};

/* ------------------------------- Состояние -------------------------------- */

function defaults() {
  return {
    v: 1,
    profile: { name: '', height: 183, weight: 93, age: 41 },
    startDate: iso(mondayOf(new Date())),
    cycle: 1,
    times: { morning: '05:30', evening: '21:20' },
    logs: {},
    weights: [],
    readiness: {},
    tests: [],
    last: {},
    settings: { sound: true, rest: 90, nutri: { activity: 1.75, deficit: 0.2 } },
    createdAt: todayISO()
  };
}

function loadState() {
  let base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    const merged = Object.assign(base, s);
    merged.profile = Object.assign(defaults().profile, s.profile || {});
    merged.times = Object.assign({ morning: '05:30', evening: '21:20' }, s.times || {});
    merged.settings = Object.assign(defaults().settings, s.settings || {});
    merged.settings.nutri = Object.assign({ activity: 1.75, deficit: 0.2 }, (s.settings || {}).nutri || {});
    return merged;
  } catch (e) {
    return base;
  }
}

let state = loadState();
let ui = { tab: 'today', date: todayISO(), week: 1 };

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Не удалось сохранить данные');
  }
}

function setState(next) {
  state = next;
  save();
}

/* --------------------------- Даты и тренировки ---------------------------- */

function infoFor(dateISO) {
  const d = parseISO(dateISO);
  const wd = (d.getDay() + 6) % 7;
  const diff = dayNum(d) - dayNum(parseISO(state.startDate));
  const rawWeek = Math.floor(diff / 7) + 1;
  return { date: dateISO, d: d, wd: wd, rawWeek: rawWeek, week: clamp(rawWeek, 1, P.WEEK_COUNT) };
}

function sessionsFor(dateISO) {
  const info = infoFor(dateISO);
  return {
    week: info.week,
    rawWeek: info.rawWeek,
    info: info,
    morning: P.buildSession(info.week, info.wd, 'morning'),
    evening: P.buildSession(info.week, info.wd, 'evening')
  };
}

function sessionFor(dateISO, slot) {
  return sessionsFor(dateISO)[slot];
}

/* -------------------------------- Дневник --------------------------------- */

function logFor(dateISO, slot) {
  const l = state.logs[dateISO] && state.logs[dateISO][slot];
  return l || { items: {}, done: false, rpe: '', note: '' };
}

function ensureLog(dateISO, slot) {
  state.logs[dateISO] = state.logs[dateISO] || {};
  state.logs[dateISO][slot] = state.logs[dateISO][slot] || { items: {}, done: false, rpe: '', note: '' };
  return state.logs[dateISO][slot];
}

function itemEntry(dateISO, slot, key) {
  const log = ensureLog(dateISO, slot);
  log.items[key] = log.items[key] || {};
  return log.items[key];
}

function calcProgress(session, log) {
  let total = 0;
  let done = 0;
  session.blocks.forEach((b, bi) => {
    b.items.forEach((it, ii) => {
      if (it.track === false) return;
      total++;
      const e = log.items[bi + '-' + ii];
      if (e && e.done) done++;
    });
  });
  return { total: total, done: done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function countDoneItems(session, log) {
  return calcProgress(session, log).done;
}

function lastText(exId) {
  const l = state.last[exId];
  if (!l) return '';
  const bits = [];
  if (l.weight) bits.push(l.weight + ' кг');
  if (l.reps) bits.push('× ' + l.reps);
  if (l.minutes) bits.push(l.minutes + ' мин');
  if (l.meters) bits.push(l.meters + ' м');
  if (l.rpe) bits.push('RPE ' + l.rpe);
  return bits.join(' · ') + (l.date ? '  (' + fmtShort(l.date) + ')' : '');
}

function rememberLast(exId, dateISO, slot, entry) {
  if (!exId) return;
  const log = logFor(dateISO, slot);
  const has = entry.weight || entry.reps || entry.minutes || entry.meters;
  if (!has) return;
  state.last[exId] = {
    date: dateISO,
    weight: entry.weight || '',
    reps: entry.reps || '',
    minutes: entry.minutes || '',
    meters: entry.meters || '',
    rpe: log.rpe || ''
  };
}

/* --------------------------------- Статы ---------------------------------- */

function hasDoneSession(dateISO) {
  const d = state.logs[dateISO];
  if (!d) return false;
  return !!(d.morning && d.morning.done) || !!(d.evening && d.evening.done);
}

function streakDays() {
  let d = parseISO(todayISO());
  if (!hasDoneSession(todayISO())) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 120; i++) {
    if (!hasDoneSession(iso(d))) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function weekStats(week) {
  const start = addDays(parseISO(state.startDate), (week - 1) * 7);
  let planned = 0;
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const date = iso(addDays(start, i));
    const plan = sessionsFor(date);
    ['morning', 'evening'].forEach((slot) => {
      const s = plan[slot];
      if (!s || s.type === 'rest') return;
      planned++;
      if (logFor(date, slot).done) done++;
    });
  }
  return { planned: planned, done: done, pct: planned ? Math.round((done / planned) * 100) : 0 };
}

function overallStats() {
  const start = parseISO(state.startDate);
  const end = parseISO(todayISO());
  let planned = 0;
  let done = 0;
  if (dayNum(start) <= dayNum(end)) {
    for (let i = 0; i < 400; i++) {
      const d = addDays(start, i);
      if (dayNum(d) > dayNum(end)) break;
      const plan = sessionsFor(iso(d));
      if (plan.rawWeek < 1 || plan.rawWeek > P.WEEK_COUNT) continue;
      ['morning', 'evening'].forEach((slot) => {
        if (!plan[slot] || plan[slot].type === 'rest') return;
        planned++;
        if (logFor(iso(d), slot).done) done++;
      });
    }
  }
  let meters = 0;
  Object.keys(state.logs).forEach((date) => {
    ['morning', 'evening'].forEach((slot) => {
      const l = state.logs[date] && state.logs[date][slot];
      if (!l || !l.items) return;
      Object.keys(l.items).forEach((k) => {
        const e = l.items[k];
        if (e && e.meters) meters += Number(e.meters) || 0;
      });
    });
  });
  return { planned: planned, done: done, pct: planned ? Math.round((done / planned) * 100) : 0, km: meters / 1000, streak: streakDays() };
}

function latestWeights(n) {
  const arr = (state.weights || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return n ? arr.slice(-n) : arr;
}

/* ------------------------------- Готовность -------------------------------- */

function readinessAdvice(r) {
  if (!r || r.energy == null) {
    return {
      score: null,
      level: 'none',
      title: 'Отметь самочувствие',
      text: 'Утром оцени сон, энергию, крепатуру и стресс — программа подскажет, снижать ли нагрузку.'
    };
  }
  const sleepH = num(r.sleepHours);
  let sleepQ = 3;
  if (sleepH != null) sleepQ = sleepH >= 7.5 ? 5 : sleepH >= 7 ? 4 : sleepH >= 6 ? 3 : sleepH >= 5 ? 2 : 1;
  const soreness = r.soreness == null ? 3 : r.soreness;
  const stress = r.stress == null ? 3 : r.stress;
  const score = sleepQ + r.energy + (6 - soreness) + (6 - stress);
  let level = 'ok';
  let title = 'Можно работать';
  let text = 'Держи RPE 7–8, оставляй 2 повтора в запасе.';
  if (score >= 16) {
    level = 'good';
    title = 'Готов к полной версии';
    text = 'Хорошее состояние. Работай по плану, но без рекордов «на зло».';
  }
  if (score <= 11) {
    level = 'low';
    title = 'Снизь нагрузку';
    text = 'Убери 1 подход в базовых упражнениях, в интервалах — 2 отрезка. Сегодня восстановление важнее плана.';
  }
  if (sleepH != null && sleepH < 6) {
    level = 'low';
    title = 'Мало сна';
    text = 'Меньше 6 часов сна — не гонись за объёмом. Сделай лёгкую версию и ложись спать раньше.';
  }
  return { score: score, level: level, title: title, text: text };
}

/* --------------------------------- Таймер --------------------------------- */

let timer = { left: 0, id: null, total: 0 };

function startRest(sec) {
  stopRest();
  timer.total = sec;
  timer.left = sec;
  renderTimer();
  timer.id = setInterval(() => {
    timer.left--;
    if (timer.left <= 0) {
      stopRest();
      beep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      toast('Отдых закончен');
      return;
    }
    renderTimer();
  }, 1000);
}

function stopRest() {
  if (timer.id) clearInterval(timer.id);
  timer.id = null;
  timer.left = 0;
  const el = document.getElementById('timer');
  if (el) {
    el.hidden = true;
    el.innerHTML = '';
  }
}

function renderTimer() {
  let el = document.getElementById('timer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'timer';
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.innerHTML =
    '<span class="timer__label">Отдых</span>' +
    '<strong class="timer__time">' + pad(Math.floor(timer.left / 60)) + ':' + pad(timer.left % 60) + '</strong>' +
    '<button class="btn btn--ghost" data-act="timer-stop">Стоп</button>';
}

function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.start();
    o.stop(ctx.currentTime + 0.85);
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1200);
  } catch (e) {}
}

/* --------------------------------- Тост ----------------------------------- */

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2400);
}

/* -------------------------------- Шторка ---------------------------------- */

function openExercise(id) {
  const ex = P.EX[id];
  if (!ex) return;
  const sheet = document.getElementById('sheet');
  const cues = (ex.cues || []).map((c) => '<li>' + esc(c) + '</li>').join('');
  const mistakes = (ex.mistakes || []).map((c) => '<li>' + esc(c) + '</li>').join('');
  sheet.innerHTML =
    '<div class="sheet__panel" role="dialog" aria-modal="true" aria-label="' + esc(ex.name) + '">' +
      '<button class="sheet__close" data-act="close-sheet" aria-label="Закрыть">✕</button>' +
      '<div class="sheet__kicker">' + esc(ex.group || '') + (ex.eq ? ' · ' + esc(ex.eq) : '') + '</div>' +
      '<h2 class="sheet__title">' + esc(ex.name) + '</h2>' +
      (ex.target ? '<p class="sheet__target">' + esc(ex.target) + '</p>' : '') +
      (cues ? '<h3>Как делать</h3><ul>' + cues + '</ul>' : '') +
      (mistakes ? '<h3>Частые ошибки</h3><ul class="sheet__bad">' + mistakes + '</ul>' : '') +
      '<div class="sheet__grid">' +
        (ex.easier ? '<div><span>Проще</span>' + esc(ex.easier) + '</div>' : '') +
        (ex.harder ? '<div><span>Сложнее</span>' + esc(ex.harder) + '</div>' : '') +
      '</div>' +
      '<p class="sheet__hint">Боль больше 3/10, хруст с болью, онемение — остановись и замени упражнение. Это не «преодоление».</p>' +
    '</div>';
  sheet.hidden = false;
  document.body.classList.add('no-scroll');
}

function closeExercise() {
  const sheet = document.getElementById('sheet');
  if (sheet) {
    sheet.hidden = true;
    sheet.innerHTML = '';
  }
  document.body.classList.remove('no-scroll');
}

/* ------------------------------ Экспорт/импорт ---------------------------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trainer41-backup-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  toast('Резервная копия скачана');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || typeof data !== 'object' || !data.profile) throw new Error('bad');
      const next = Object.assign(defaults(), data);
      next.profile = Object.assign(defaults().profile, data.profile || {});
      next.times = Object.assign({ morning: '05:30', evening: '21:20' }, data.times || {});
      next.settings = Object.assign(defaults().settings, data.settings || {});
      next.settings.nutri = Object.assign({ activity: 1.75, deficit: 0.2 }, (data.settings || {}).nutri || {});
      setState(next);
      ui.date = todayISO();
      ui.week = clamp(infoFor(ui.date).rawWeek, 1, P.WEEK_COUNT);
      render();
      toast('Данные загружены');
    } catch (e) {
      toast('Файл не подходит');
    }
  };
  reader.readAsText(file);
}
