/* ============================================================================
   Экраны «Неделя», «Прогресс», «Гид» + питание и библиотека упражнений
   ============================================================================ */

/* --------------------------------- Неделя --------------------------------- */

function renderWeek() {
  const w = clamp(ui.week, 1, P.WEEK_COUNT);
  const meta = P.weekMeta(w);
  const start = addDays(parseISO(state.startDate), (w - 1) * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = iso(addDays(start, i));
    const plan = sessionsFor(date);
    const info = plan.info;
    const m = logFor(date, 'morning');
    const e = logFor(date, 'evening');
    days.push(
      '<button class="dayrow' + (date === todayISO() ? ' is-today' : '') + '" data-act="goto-day" data-date="' + date + '">' +
        '<span class="dayrow__date"><b>' + WD[info.wd] + '</b><span>' + info.d.getDate() + '</span></span>' +
        '<span class="dayrow__sessions">' +
          '<span class="dayrow__s' + (m.done ? ' is-done' : '') + '"><i></i>' + state.times.morning + ' · ' + esc(plan.morning.title) + '</span>' +
          '<span class="dayrow__s' + (e.done ? ' is-done' : '') + '"><i></i>' + state.times.evening + ' · ' + esc(plan.evening.title) + '</span>' +
        '</span>' +
      '</button>'
    );
  }
  return (
    '<div class="card weekhead">' +
      '<div class="weekhead__nav">' +
        '<button class="iconbtn" data-act="week-prev" aria-label="Предыдущая неделя">‹</button>' +
        '<div class="weekhead__center"><div class="kicker">Неделя</div><div class="weekhead__num">' + w + '<small>/' + P.WEEK_COUNT + '</small></div></div>' +
        '<button class="iconbtn" data-act="week-next" aria-label="Следующая неделя">›</button>' +
      '</div>' +
      '<div class="weekhead__title">' + esc(meta.title) + (meta.deload ? '<span class="badge badge--green">разгрузка</span>' : '') + (meta.test ? '<span class="badge badge--amber">тесты</span>' : '') + '</div>' +
      '<div class="weekhead__sub">' + esc(meta.sub) + '</div>' +
      '<p class="weekhead__text">' + esc(meta.text) + '</p>' +
      '<div class="focus focus--tight"><span>Фокус</span>' + esc(meta.focus) + '</div>' +
      '<button class="btn btn--primary btn--block" data-act="goto-current-week">Открыть сегодняшний день</button>' +
    '</div>' +
    '<div class="weeklist">' + days.join('') + '</div>' +
    '<p class="hint">Нажми на день, чтобы открыть тренировки и отметить выполнение. Неделя всегда начинается в понедельник.</p>'
  );
}

/* -------------------------------- Прогресс -------------------------------- */

function lineChart(points, unit) {
  if (!points.length) {
    return '<div class="empty">Пока нет замеров. Добавь первый — и здесь появится график.</div>';
  }
  if (points.length === 1) {
    return '<div class="chart-one"><b>' + points[0].y + '</b> ' + esc(unit || '') + '<span>замер ' + esc(points[0].label) + '</span></div>';
  }
  const W = 320;
  const H = 130;
  const padY = 14;
  const ys = points.map((p) => p.y);
  let min = Math.min.apply(null, ys);
  let max = Math.max.apply(null, ys);
  if (max - min < 0.5) {
    min -= 0.5;
    max += 0.5;
  }
  const x = (i) => 10 + (i * (W - 20)) / (points.length - 1);
  const y = (v) => padY + (H - 2 * padY) * (1 - (v - min) / (max - min));
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.y).toFixed(1)).join(' ');
  const area = line + ' L' + x(points.length - 1).toFixed(1) + ',' + (H - padY) + ' L' + x(0).toFixed(1) + ',' + (H - padY) + ' Z';
  const dots = points.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.y).toFixed(1) + '" r="3"></circle>').join('');
  const grid = [0.25, 0.5, 0.75].map((k) => '<line x1="10" x2="' + (W - 10) + '" y1="' + (padY + (H - 2 * padY) * k).toFixed(1) + '" y2="' + (padY + (H - 2 * padY) * k).toFixed(1) + '" class="chart__grid"></line>').join('');
  return (
    '<div class="chart-box">' +
      '<div class="chart-max">' + max.toFixed(1) + ' ' + esc(unit || '') + '</div>' +
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График">' +
        grid +
        '<path d="' + area + '" class="chart__area"></path>' +
        '<path d="' + line + '" class="chart__line"></path>' +
        dots +
      '</svg>' +
      '<div class="chart-labels"><span>' + esc(points[0].label) + '</span><span>' + esc(points[points.length - 1].label) + '</span></div>' +
    '</div>'
  );
}

function weekBars() {
  const nowWeek = infoFor(todayISO()).rawWeek;
  let html = '';
  for (let w = 1; w <= P.WEEK_COUNT; w++) {
    const s = weekStats(w);
    const future = w > nowWeek + 1;
    const h = future ? 0 : s.pct;
    html +=
      '<div class="wbar' + (w === nowWeek ? ' is-now' : '') + (future ? ' is-future' : '') + '">' +
        '<div class="wbar__track"><div class="wbar__fill" style="height:' + h + '%"></div></div>' +
        '<div class="wbar__label">' + w + '</div>' +
      '</div>';
  }
  return '<div class="wbars">' + html + '</div><div class="wbars__legend"><span>выполнено, %</span><span>' + P.WEEK_COUNT + ' недель</span></div>';
}

function testRow(label, cur, prev, lowerBetter) {
  let delta = '';
  if (cur != null && prev != null && cur !== '' && prev !== '') {
    const a = typeof cur === 'number' ? cur : timeToSec(cur);
    const b = typeof prev === 'number' ? prev : timeToSec(prev);
    if (a != null && b != null && !isNaN(a) && !isNaN(b)) {
      const d = a - b;
      if (d !== 0) {
        const good = lowerBetter ? d < 0 : d > 0;
        delta = '<span class="delta ' + (good ? 'up' : 'down') + '">' + (d > 0 ? '+' : '') + (typeof cur === 'number' ? d : Math.round(d) + ' с') + '</span>';
      }
    }
  }
  return '<tr><td>' + label + '</td><td>' + (cur == null || cur === '' ? '—' : esc(cur)) + '</td><td>' + (prev == null || prev === '' ? '—' : esc(prev)) + '</td><td>' + delta + '</td></tr>';
}

function timeToSec(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d+)[:.,](\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

function renderProgress() {
  const weights = latestWeights();
  const lastW = weights[weights.length - 1];
  const stats = overallStats();
  const tests = state.tests.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lastT = tests[tests.length - 1];
  const prevT = tests[tests.length - 2];
  const points = weights.slice(-14).map((x) => ({ y: Number(x.kg), label: fmtShort(x.date) }));
  const lastBMI = lastW ? calcBMI(lastW.kg, state.profile.height) : null;
  const lastCat = bmiCategory(lastBMI);
  const todayW = todayWeight();
  const hist = weights.slice(-7).reverse();
  const waistLast = weights.filter((x) => x.waist).slice(-1)[0];
  const waistFirst = weights.filter((x) => x.waist)[0];
  const waistDelta = waistLast && waistFirst && waistLast !== waistFirst ? Math.round((waistLast.waist - waistFirst.waist) * 10) / 10 : null;

  return (
    '<div class="tiles">' +
      '<div class="tile"><span>Вес</span><b>' + (lastW ? lastW.kg + ' <small>кг</small>' : '—') + '</b><i>' + (lastBMI != null ? 'ИМТ ' + fmtBMI(lastBMI) + ' · ' + lastCat.label : 'нет замеров') + '</i></div>' +
      '<div class="tile"><span>Талия</span><b>' + (waistLast ? waistLast.waist + ' <small>см</small>' : '—') + '</b><i>' + (waistDelta == null ? 'добавь замер' : (waistDelta > 0 ? '+' : '') + waistDelta + ' см') + '</i></div>' +
      '<div class="tile"><span>Тренировки</span><b>' + stats.done + '<small>/' + stats.planned + '</small></b><i>' + stats.pct + '% плана</i></div>' +
      '<div class="tile"><span>Гребля</span><b>' + (stats.km ? Math.round(stats.km * 10) / 10 : 0) + ' <small>км</small></b><i>всего в дневнике</i></div>' +
      '<div class="tile"><span>Серия</span><b>' + stats.streak + ' <small>дн</small></b><i>подряд с тренировкой</i></div>' +
      '<div class="tile"><span>Цикл</span><b>' + state.cycle + '</b><i>неделя ' + clamp(infoFor(todayISO()).rawWeek, 1, P.WEEK_COUNT) + ' из ' + P.WEEK_COUNT + '</i></div>' +
    '</div>' +

    '<section class="card">' +
      '<div class="card__head"><h2>Вес и талия</h2><span class="kicker">утром, натощак</span></div>' +
      lineChart(points, 'кг') +
      '<div class="rowform">' +
        '<label class="num"><input id="w-kg" type="number" inputmode="decimal" min="40" max="250" step="0.1" placeholder="вес, кг" aria-label="вес, кг" value="' + (todayW ? esc(todayW.kg) : '') + '"></label>' +
        '<label class="num"><input id="w-waist" type="number" inputmode="decimal" min="50" max="200" step="0.5" placeholder="талия, см" aria-label="талия, см" value="' + (todayW && todayW.waist ? esc(todayW.waist) : '') + '"></label>' +
        '<button class="btn btn--primary" data-act="weight-add">' + (todayW ? 'Обновить' : 'Записать') + '</button>' +
      '</div>' +
      '<div class="weigh__bmi" id="bmi-live">' + bmiMarkup(todayW ? todayW.kg : '', state.profile.height) + '</div>' +
      '<p class="hint">Взвешивайся каждый день, утром натощак, после туалета. Записывай даже небольшие колебания: важна средняя за неделю, а не одна цифра. Вес может скакать на 1–2 кг из-за воды и соли — это нормально.</p>' +
      (hist.length
        ? '<table class="tests weight-hist"><thead><tr><th>Дата</th><th>Вес</th><th>ИМТ</th></tr></thead><tbody>' +
          hist.map((x) => {
            const b = x.bmi != null ? x.bmi : calcBMI(x.kg, state.profile.height);
            const c = bmiCategory(b);
            return '<tr><td>' + fmtDate(x.date) + '</td><td>' + String(x.kg).replace('.', ',') + ' кг</td><td><span class="bmi bmi--' + c.tone + '">' + fmtBMI(b) + '</span></td></tr>';
          }).join('') +
          '</tbody></table>' +
          '<p class="hint">ИМТ = вес / рост². Это ориентир, а не диагноз: у тренированного человека с широкой костью он может завышать риск. Смотри вместе с талией и самочувствием.</p>'
        : '<p class="hint">ИМТ = вес / рост². После первого взвешивания здесь появится история с ИМТ для каждой записи.</p>') +
    '</section>' +

    '<section class="card">' +
      '<div class="card__head"><h2>Выполнение по неделям</h2><span class="kicker">% сессий</span></div>' +
      weekBars() +
      '<p class="hint">Норма — 80–90%. 100% каждая неделя при двух тренировках в день не нужны: восстановление важнее галочек.</p>' +
    '</section>' +

    '<section class="card">' +
      '<div class="card__head"><h2>Тесты</h2><span class="kicker">недели 1, 6, 12</span></div>' +
      '<div class="testform">' +
        '<label>Подтягивания, раз<input id="t-pullups" type="number" inputmode="numeric" min="0" step="1" value="' + (lastT ? esc(lastT.pullups || '') : '') + '"></label>' +
        '<label>Отжимания, раз<input id="t-pushups" type="number" inputmode="numeric" min="0" step="1" value="' + (lastT ? esc(lastT.pushups || '') : '') + '"></label>' +
        '<label>Гребля 500 м, мм:сс<input id="t-row500" type="text" inputmode="numeric" placeholder="1:45" value="' + (lastT ? esc(lastT.row500 || '') : '') + '"></label>' +
        '<label>Планка, с<input id="t-plank" type="number" inputmode="numeric" min="0" step="1" value="' + (lastT ? esc(lastT.plank || '') : '') + '"></label>' +
        '<label>Жим гири 24 кг, раз<input id="t-press24" type="number" inputmode="numeric" min="0" step="1" value="' + (lastT ? esc(lastT.press24 || '') : '') + '"></label>' +
        '<button class="btn btn--primary btn--block" data-act="test-save">Сохранить тест</button>' +
      '</div>' +
      (tests.length
        ? '<table class="tests"><thead><tr><th>Тест</th><th>Сейчас</th><th>Прошлый</th><th>Δ</th></tr></thead><tbody>' +
          testRow('Подтягивания', lastT.pullups, prevT && prevT.pullups, false) +
          testRow('Отжимания', lastT.pushups, prevT && prevT.pushups, false) +
          testRow('Гребля 500 м', lastT.row500, prevT && prevT.row500, true) +
          testRow('Планка, с', lastT.plank, prevT && prevT.plank, false) +
          testRow('Жим 24 кг', lastT.press24, prevT && prevT.press24, false) +
          '</tbody></table>' +
          '<p class="hint">Последний тест: ' + fmtDate(lastT.date) + '. Тест — не тренировка: делай его после разминки, без «добивания».</p>'
        : '<p class="hint">Пройди тесты на 1-й неделе — будет с чем сравнивать.</p>') +
    '</section>' +

    '<section class="card">' +
      '<div class="card__head"><h2>Настройки</h2></div>' +
      '<div class="settings">' +
        '<label class="field"><span>Имя</span><input type="text" value="' + esc(state.profile.name || '') + '" data-setting="name" placeholder="как обращаться"></label>' +
        '<div class="settings__grid">' +
          '<label class="field"><span>Возраст</span><input type="number" min="14" max="90" value="' + esc(state.profile.age) + '" data-setting="age"></label>' +
          '<label class="field"><span>Рост, см</span><input type="number" min="120" max="230" value="' + esc(state.profile.height) + '" data-setting="height"></label>' +
          '<label class="field"><span>Вес, кг</span><input type="number" min="40" max="250" step="0.1" value="' + esc(state.profile.weight) + '" data-setting="weight"></label>' +
        '</div>' +
        '<label class="field"><span>Старт цикла (понедельник)</span><input type="date" value="' + esc(state.startDate) + '" data-setting="startDate"></label>' +
        '<div class="settings__grid">' +
          '<label class="field"><span>Утро</span><input type="time" value="' + esc(state.times.morning) + '" data-setting="morningTime"></label>' +
          '<label class="field"><span>Вечер</span><input type="time" value="' + esc(state.times.evening) + '" data-setting="eveningTime"></label>' +
        '</div>' +
        '<div class="settings__actions">' +
          '<button class="btn" data-act="export">Экспорт данных</button>' +
          '<button class="btn" data-act="import">Импорт</button>' +
          '<button class="btn" data-act="newcycle">Новый цикл</button>' +
          '<button class="btn btn--danger" data-act="reset">Сбросить всё</button>' +
        '</div>' +
        '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<p class="hint">Данные живут в этом браузере (localStorage). Раз в месяц делай экспорт — это резервная копия. При смене телефона перенеси JSON через импорт.</p>' +
      '</div>' +
    '</section>' +
    '<p class="disclaimer">Программа — тренировочный план, а не медицинская рекомендация. При 41 годе и ИМТ ≥ 27 раз в год: давление, липиды, глюкоза/HbA1c, креатинин, витамин D. При боли или сомнениях — к врачу.</p>'
  );
}
