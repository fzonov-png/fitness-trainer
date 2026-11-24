/* ============================================================================
   Роутинг, обработчики, запуск приложения
   ============================================================================ */

function updateTopbar() {
  const info = infoFor(todayISO());
  const meta = P.weekMeta(clamp(info.rawWeek, 1, P.WEEK_COUNT));
  const sub = document.getElementById('brand-sub');
  if (sub) sub.textContent = 'неделя ' + clamp(info.rawWeek, 1, P.WEEK_COUNT) + ' · ' + meta.title.replace(' · ', ' · ');
  const pill = document.getElementById('ready-pill');
  if (pill) {
    const adv = readinessAdvice(state.readiness[todayISO()]);
    pill.textContent = adv.score != null ? adv.score + '/20' : 'готовность';
    pill.className = 'ready-pill ready-pill--' + adv.level;
  }
}

function render() {
  updateTopbar();
  const view = document.getElementById('view');
  let html = '';
  if (ui.tab === 'week') html = renderWeek();
  else if (ui.tab === 'progress') html = renderProgress();
  else if (ui.tab === 'guide') html = renderGuide();
  else html = renderToday();
  view.innerHTML = html;
  const tmHost = document.getElementById('tm-body');
  if (tmHost) tmRefresh();
  if (exTimer) markRowTiming();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tab === ui.tab);
  });
}

function refreshSessionProgress(dateISO, slot) {
  const session = sessionFor(dateISO, slot);
  const log = logFor(dateISO, slot);
  const p = calcProgress(session, log);
  const card = document.getElementById('sess-' + slot);
  if (!card) return;
  const c = card.querySelector('.js-count');
  const b = card.querySelector('.js-bar');
  if (c) c.textContent = p.done + '/' + p.total;
  if (b) b.style.width = p.pct + '%';
}

function applySetting(key, value) {
  if (key === 'name') {
    state.profile.name = value;
  } else if (key === 'age' || key === 'height' || key === 'weight') {
    const n = num(value);
    if (n) state.profile[key] = n;
  } else if (key === 'startDate') {
    if (!value) return;
    state.startDate = iso(mondayOf(parseISO(value)));
    ui.week = clamp(infoFor(todayISO()).rawWeek, 1, P.WEEK_COUNT);
  } else if (key === 'morningTime') {
    state.times.morning = value;
  } else if (key === 'eveningTime') {
    state.times.evening = value;
  }
  save();
  render();
}

function addWeight() {
  const kgEl = document.getElementById('w-kg');
  const waistEl = document.getElementById('w-waist');
  const kg = num(kgEl && kgEl.value);
  const waist = num(waistEl && waistEl.value);
  if (!kg || kg < 40 || kg > 250) {
    toast('Введи вес от 40 до 250 кг');
    return;
  }
  const date = todayISO();
  const bmi = calcBMI(kg, state.profile.height);
  const existing = (state.weights || []).filter((x) => x.date === date)[0];
  if (existing) {
    existing.kg = kg;
    existing.bmi = bmi;
    if (waist) existing.waist = waist;
  } else {
    state.weights.push({ date: date, kg: kg, waist: waist || null, bmi: bmi });
  }
  state.profile.weight = kg;
  if (waist) state.profile.waist = waist;
  save();
  render();
  toast('Вес ' + String(kg).replace('.', ',') + ' кг · ИМТ ' + fmtBMI(bmi));
}

function saveTest() {
  const get = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  const t = {
    date: todayISO(),
    cycle: state.cycle,
    pullups: get('t-pullups'),
    pushups: get('t-pushups'),
    row500: get('t-row500'),
    plank: get('t-plank'),
    press24: get('t-press24')
  };
  if (!t.pullups && !t.pushups && !t.row500 && !t.plank && !t.press24) {
    toast('Заполни хотя бы один тест');
    return;
  }
  const existing = (state.tests || []).filter((x) => x.date === t.date)[0];
  if (existing) Object.assign(existing, t);
  else state.tests.push(t);
  save();
  render();
  toast('Тест сохранён');
}

function filterLibrary(q) {
  const s = String(q || '').trim().toLowerCase();
  document.querySelectorAll('#library .lib').forEach((d) => {
    d.hidden = !!s && d.textContent.toLowerCase().indexOf(s) === -1;
  });
  document.querySelectorAll('#library .lib-group').forEach((g) => {
    const any = Array.prototype.some.call(g.querySelectorAll('.lib'), (d) => !d.hidden);
    g.hidden = !any;
  });
}

/* ------------------------------- Обработчики ------------------------------ */

document.addEventListener('click', function (e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab;
    if (ui.tab === 'week') ui.week = clamp(infoFor(todayISO()).rawWeek, 1, P.WEEK_COUNT);
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.id === 'sheet') closeExercise();
    return;
  }
  const act = el.dataset.act;

  if (act === 'day-prev' || act === 'day-next') {
    ui.date = iso(addDays(parseISO(ui.date), act === 'day-prev' ? -1 : 1));
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (act === 'today') {
    ui.date = todayISO();
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (act === 'goto-day') {
    ui.date = el.dataset.date;
    ui.tab = 'today';
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (act === 'week-prev' || act === 'week-next') {
    ui.week = clamp(ui.week + (act === 'week-prev' ? -1 : 1), 1, P.WEEK_COUNT);
    render();
    return;
  }
  if (act === 'goto-current-week') {
    ui.week = clamp(infoFor(todayISO()).rawWeek, 1, P.WEEK_COUNT);
    ui.tab = 'today';
    ui.date = todayISO();
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (act === 'toggle') {
    const dateISO = el.dataset.date;
    const slot = el.dataset.slot;
    const key = el.dataset.key;
    const entry = itemEntry(dateISO, slot, key);
    entry.done = !entry.done;
    entry.at = entry.done ? new Date().toISOString() : '';
    save();
    const row = el.closest('.item');
    if (row) row.classList.toggle('is-done', entry.done);
    el.setAttribute('aria-checked', String(entry.done));
    refreshSessionProgress(dateISO, slot);
    return;
  }
  if (act === 'finish') {
    stopExerciseTimer();
    stopRest();
    const log = ensureLog(el.dataset.date, el.dataset.slot);
    log.done = true;
    log.finishedAt = new Date().toISOString();
    save();
    render();
    toast('Тренировка отмечена ✓');
    return;
  }
  if (act === 'unfinish') {
    const log = ensureLog(el.dataset.date, el.dataset.slot);
    log.done = false;
    save();
    render();
    return;
  }
  if (act === 'timer') {
    startRest(Number(el.dataset.sec) || 90);
    return;
  }
  if (act === 'timer-stop') {
    stopRest();
    return;
  }
  if (act === 'ex-start') {
    startExerciseTimer(el.dataset.date, el.dataset.slot, el.dataset.key);
    return;
  }
  if (act === 'ex-set') {
    finishExerciseSet();
    return;
  }
  if (act === 'ex-skip') {
    skipRestPhase();
    return;
  }
  if (act === 'ex-stop') {
    stopExerciseTimer();
    return;
  }
  if (act === 'ready') {
    const d = todayISO();
    state.readiness[d] = state.readiness[d] || {};
    state.readiness[d][el.dataset.k] = Number(el.dataset.v);
    save();
    render();
    return;
  }
  if (act === 'nutri') {
    state.settings.nutri[el.dataset.kind] = Number(el.dataset.v);
    save();
    render();
    return;
  }
  if (act === 'weight-add') {
    addWeight();
    return;
  }
  if (act === 'test-save') {
    saveTest();
    return;
  }
  if (act === 'ex') {
    openExercise(el.dataset.ex);
    return;
  }
  if (act === 'close-sheet') {
    closeExercise();
    return;
  }
  if (act === 'tm-connect') {
    tmConnect().then(function () { tmRefresh(); });
    return;
  }
  if (act === 'tm-disconnect') {
    tmDisconnect();
    tmRefresh();
    return;
  }
  if (act === 'tm-apply') {
    tmApply(el.dataset.field);
    return;
  }
  if (act === 'tm-start') {
    tmStart();
    return;
  }
  if (act === 'tm-pause') {
    tmPause();
    return;
  }
  if (act === 'tm-resume') {
    tmResume();
    return;
  }
  if (act === 'tm-stop') {
    tmStop();
    return;
  }
  if (act === 'tm-save-manual') {
    tmSaveManual();
    return;
  }
  if (act === 'tm-delete') {
    tmDeleteEntry(el.dataset.id);
    return;
  }
  if (act === 'tm-log-copy') {
    tmCopyLog();
    return;
  }
  if (act === 'export') {
    exportData();
    return;
  }
  if (act === 'import') {
    const f = document.getElementById('import-file');
    if (f) f.click();
    return;
  }
  if (act === 'newcycle') {
    if (!confirm('Начать новый 12-недельный цикл? История и рабочие веса сохранятся.')) return;
    state.startDate = iso(mondayOf(new Date()));
    state.cycle = (Number(state.cycle) || 1) + 1;
    ui.date = todayISO();
    ui.week = 1;
    save();
    render();
    toast('Новый цикл начат');
    return;
  }
  if (act === 'reset') {
    if (!confirm('Удалить все данные: дневник, замеры, тесты?')) return;
    if (!confirm('Точно удалить? Это необратимо. Сначала лучше сделать экспорт.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaults();
    ui.date = todayISO();
    ui.week = 1;
    save();
    render();
    toast('Данные сброшены');
  }
});

document.addEventListener('input', function (e) {
  const el = e.target;
  if (el.id === 'lib-search') {
    filterLibrary(el.value);
    return;
  }
  if (el.id === 'w-kg') {
    const live = document.getElementById('bmi-live');
    if (live) live.innerHTML = bmiMarkup(el.value, state.profile.height);
    return;
  }
  if (el.hasAttribute('data-snote')) {
    const log = ensureLog(el.dataset.date, el.dataset.slot);
    log.note = el.value;
    save();
    return;
  }
  if (el.hasAttribute('data-ifield')) {
    const dateISO = el.dataset.date;
    const slot = el.dataset.slot;
    const key = el.dataset.key;
    const entry = itemEntry(dateISO, slot, key);
    entry[el.dataset.ifield] = el.value;
    rememberLast(el.dataset.ex, dateISO, slot, entry);
    save();
  }
  if (el.hasAttribute && el.hasAttribute('data-tm-field')) {
    tmSetTarget(el.dataset.tmField, el.value);
    return;
  }
});

document.addEventListener('change', function (e) {
  const el = e.target;
  if (el.hasAttribute('data-srpe')) {
    const log = ensureLog(el.dataset.date, el.dataset.slot);
    log.rpe = el.value;
    save();
    return;
  }
  if (el.hasAttribute('data-ready') && el.dataset.ready === 'sleep') {
    const d = todayISO();
    state.readiness[d] = state.readiness[d] || {};
    state.readiness[d].sleepHours = num(el.value);
    save();
    render();
    return;
  }
  if (el.hasAttribute('data-setting')) {
    applySetting(el.dataset.setting, el.value);
    return;
  }
  if (el.id === 'import-file') {
    if (el.files && el.files[0]) importData(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeExercise();
});

/* --------------------------------- Запуск --------------------------------- */

ui.week = clamp(infoFor(todayISO()).rawWeek, 1, P.WEEK_COUNT);
if (!localStorage.getItem(STORAGE_KEY)) save();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
