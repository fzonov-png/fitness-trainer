/* ============================================================================
   Экран «Сегодня»: карточки тренировок, упражнения, готовность
   ============================================================================ */

function rpeOptions(value) {
  let out = '<option value="">RPE —</option>';
  [5, 6, 7, 8, 9, 10].forEach((n) => {
    out += '<option value="' + n + '"' + (String(value) === String(n) ? ' selected' : '') + '>' + n + '</option>';
  });
  return out;
}

function itemFields(item, entry, dateISO, slot, key, exId) {
  const f = [];
  const attrs = 'data-date="' + dateISO + '" data-slot="' + slot + '" data-key="' + key + '" data-ex="' + esc(exId || '') + '"';
  if (item.weight) {
    f.push('<label class="num"><input type="number" inputmode="decimal" min="0" step="0.5" placeholder="кг" aria-label="рабочий вес, кг" value="' + esc(entry.weight || '') + '" data-ifield="weight" ' + attrs + '></label>');
  }
  if (item.reps) {
    f.push('<label class="num"><input type="number" inputmode="numeric" min="0" step="1" placeholder="повт" aria-label="повторы" value="' + esc(entry.reps || '') + '" data-ifield="reps" ' + attrs + '></label>');
  }
  if (item.minutes) {
    f.push('<label class="num"><input type="number" inputmode="decimal" min="0" step="0.5" placeholder="мин" aria-label="минуты" value="' + esc(entry.minutes || '') + '" data-ifield="minutes" ' + attrs + '></label>');
  }
  if (item.meters) {
    f.push('<label class="num"><input type="number" inputmode="numeric" min="0" step="10" placeholder="метры" aria-label="дистанция, метры" value="' + esc(entry.meters || '') + '" data-ifield="meters" ' + attrs + '></label>');
  }
  return f.length ? '<div class="item__fields">' + f.join('') + '</div>' : '';
}

function renderItem(item, bi, ii, dateISO, slot, log) {
  const key = bi + '-' + ii;
  const entry = (log.items && log.items[key]) || {};
  const tracked = item.track !== false;
  const done = !!entry.done && tracked;
  const hasEx = item.ex && P.EX[item.ex];
  const name = hasEx
    ? '<button class="exlink" data-act="ex" data-ex="' + esc(item.ex) + '">' + esc(item.name) + '<i>i</i></button>'
    : '<span>' + esc(item.name) + '</span>';
  const last = hasEx ? lastText(item.ex) : '';
  return (
    '<div class="item' + (done ? ' is-done' : '') + (tracked ? '' : ' item--soft') + '" data-row="' + key + '">' +
      (tracked
        ? '<button class="check" data-act="toggle" data-date="' + dateISO + '" data-slot="' + slot + '" data-key="' + key + '" aria-checked="' + done + '" aria-label="Отметить выполненным">✓</button>'
        : '<span class="check check--ghost" aria-hidden="true">·</span>') +
      '<div class="item__main">' +
        '<div class="item__top">' + name + '<span class="item__dose">' + esc(item.dose) + '</span></div>' +
        (item.load ? '<div class="item__load">' + esc(item.load) + '</div>' : '') +
        (item.note ? '<div class="item__note">' + esc(item.note) + '</div>' : '') +
        (last ? '<div class="item__last">прошлый раз: ' + esc(last) + '</div>' : '') +
        itemFields(item, entry, dateISO, slot, key, item.ex) +
      '</div>' +
    '</div>'
  );
}

function renderSessionCard(session, dateISO, slot, log) {
  const prog = calcProgress(session, log);
  const time = slot === 'morning' ? state.times.morning : state.times.evening;
  const blocks = session.blocks
    .map((b, bi) =>
      '<div class="block">' +
        '<div class="block__title">' + esc(b.title) + '</div>' +
        b.items.map((it, ii) => renderItem(it, bi, ii, dateISO, slot, log)).join('') +
      '</div>'
    )
    .join('');
  return (
    '<section class="card session session--' + session.type + (log.done ? ' is-done' : '') + '" id="sess-' + slot + '">' +
      '<header class="session__head">' +
        '<div class="session__emoji" aria-hidden="true">' + session.emoji + '</div>' +
        '<div class="session__titles">' +
          '<div class="session__kicker">' + (slot === 'morning' ? 'Утро' : 'Вечер') + ' · ' + time + ' · ' + session.duration + ' мин</div>' +
          '<h2 class="session__title">' + esc(session.title) + '</h2>' +
          '<div class="session__sub">' + esc(session.subtitle) + '</div>' +
        '</div>' +
        '<div class="session__stat">' +
          '<span class="js-count">' + prog.done + '/' + prog.total + '</span>' +
          '<span class="bar"><i class="js-bar" style="width:' + prog.pct + '%"></i></span>' +
        '</div>' +
      '</header>' +
      '<div class="session__blocks">' + blocks + '</div>' +
      (session.note ? '<div class="session__note">' + esc(session.note) + '</div>' : '') +
      '<div class="session__foot">' +
        '<label class="rpe">RPE <select data-srpe data-date="' + dateISO + '" data-slot="' + slot + '">' + rpeOptions(log.rpe) + '</select></label>' +
        '<div class="rests">' +
          '<button class="btn btn--small" data-act="timer" data-sec="60">60 с</button>' +
          '<button class="btn btn--small" data-act="timer" data-sec="90">90 с</button>' +
          '<button class="btn btn--small" data-act="timer" data-sec="120">120 с</button>' +
        '</div>' +
        (log.done
          ? '<span class="done-label">✓ Выполнено</span><button class="btn btn--ghost btn--small" data-act="unfinish" data-date="' + dateISO + '" data-slot="' + slot + '">Отменить</button>'
          : '<button class="btn btn--primary" data-act="finish" data-date="' + dateISO + '" data-slot="' + slot + '">Завершить</button>') +
      '</div>' +
      '<textarea class="note" rows="2" placeholder="Заметки: самочувствие, что поменять" data-snote data-date="' + dateISO + '" data-slot="' + slot + '">' + esc(log.note || '') + '</textarea>' +
    '</section>'
  );
}

function segments(k, value) {
  let out = '';
  for (let v = 1; v <= 5; v++) {
    out += '<button class="seg' + (Number(value) === v ? ' is-on' : '') + '" data-act="ready" data-k="' + k + '" data-v="' + v + '" aria-label="' + v + '">' + v + '</button>';
  }
  return out;
}

function renderReadiness() {
  const d = todayISO();
  const r = state.readiness[d] || {};
  const adv = readinessAdvice(r);
  return (
    '<section class="card ready ready--' + adv.level + '">' +
      '<div class="ready__head">' +
        '<div>' +
          '<div class="kicker">Готовность · ' + fmtDate(d) + '</div>' +
          '<div class="ready__title">' + esc(adv.title) + '</div>' +
        '</div>' +
        '<div class="ready__score">' + (adv.score != null ? adv.score + '<small>/20</small>' : '—') + '</div>' +
      '</div>' +
      '<div class="ready__grid">' +
        '<label class="ready__sleep">Сон, ч' +
          '<input type="number" inputmode="decimal" min="0" max="14" step="0.5" value="' + esc(r.sleepHours != null ? r.sleepHours : '') + '" data-ready="sleep">' +
        '</label>' +
        '<div class="ready__row"><span>Энергия</span><div class="segs">' + segments('energy', r.energy) + '</div></div>' +
        '<div class="ready__row"><span>Крепатура</span><div class="segs">' + segments('soreness', r.soreness == null ? 3 : r.soreness) + '</div></div>' +
        '<div class="ready__row"><span>Стресс</span><div class="segs">' + segments('stress', r.stress == null ? 3 : r.stress) + '</div></div>' +
      '</div>' +
      '<div class="ready__text">' + esc(adv.text) + '</div>' +
      '<div class="ready__legend">1 — минимум · 5 — максимум. Для крепатуры и стресса 1 = «нет», 5 = «очень много».</div>' +
    '</section>'
  );
}

function renderToday() {
  const plan = sessionsFor(ui.date);
  const info = plan.info;
  const meta = P.weekMeta(plan.week);
  const isToday = ui.date === todayISO();
  const logM = logFor(ui.date, 'morning');
  const logE = logFor(ui.date, 'evening');

  let banner = '';
  if (plan.rawWeek < 1) {
    banner = '<div class="banner banner--info">Цикл начинается ' + fmtDate(state.startDate) + '. Пока показана неделя 1. Дату старта можно изменить в «Прогресс → Настройки».</div>';
  } else if (plan.rawWeek > P.WEEK_COUNT) {
    banner = '<div class="banner banner--done"><b>12 недель позади.</b> Сравни тесты, затем запусти новый цикл — история и рабочие веса сохранятся.<button class="btn btn--primary btn--small" data-act="newcycle">Новый цикл</button></div>';
  }

  const adv = readinessAdvice(state.readiness[todayISO()]);
  const lowReady = isToday && adv.level === 'low'
    ? '<div class="banner banner--warn"><b>' + esc(adv.title) + '.</b> ' + esc(adv.text) + '</div>'
    : '';

  return (
    '<div class="daybar">' +
      '<button class="iconbtn" data-act="day-prev" aria-label="Предыдущий день">‹</button>' +
      '<div class="daybar__main">' +
        '<div class="daybar__date">' + WD_FULL[info.wd] + ', ' + info.d.getDate() + ' ' + MONTHS[info.d.getMonth()] + '</div>' +
        '<div class="daybar__meta">Неделя ' + plan.week + ' из ' + P.WEEK_COUNT + ' · ' + esc(meta.title) + (meta.deload ? ' · разгрузка' : '') + '</div>' +
      '</div>' +
      '<button class="iconbtn" data-act="day-next" aria-label="Следующий день">›</button>' +
    '</div>' +
    '<div class="daybar__actions">' +
      (isToday ? '<span class="chip chip--live">Сегодня</span>' : '<button class="chip" data-act="today">← К сегодня</button>') +
      '<span class="chip">' + (plan.rawWeek < 1 ? 'старт ' + fmtShort(state.startDate) : meta.deload ? 'разгрузка' : 'RPE ≤ 8') + '</span>' +
      '<span class="chip">сон 7–8 ч</span>' +
    '</div>' +
    banner +
    lowReady +
    (isToday ? renderReadiness() : '') +
    '<div class="focus"><span>Фокус недели</span>' + esc(meta.focus) + '</div>' +
    renderSessionCard(plan.morning, ui.date, 'morning', logM) +
    renderSessionCard(plan.evening, ui.date, 'evening', logE) +
    '<p class="disclaimer">Это не заменяет врача. При боли в груди, головокружении, нехватке дыхания — остановись. Боль в суставах больше 3/10 — замени упражнение.</p>'
  );
}
