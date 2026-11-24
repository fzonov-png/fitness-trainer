/* ============================================================================
   Fitness Trainer — Bluetooth: тренажёр (FTMS) + запись результатов
   Сервис Fitness Machine (0x1826) по стандарту Bluetooth SIG (FTMS):
   - Treadmill Data (0x2ACD) — беговые дорожки;
   - Rower Data (0x2AD1) — гребной тренажёр (FTMS), сопротивление и темп;
   - Indoor Bike Data (0x2AD2) — велотренажёры;
   - Cross Trainer Data (0x2ACE) — кросстрейнеры.
   Control Point (0x2AD9): Request Control, Set Target Speed / Inclination /
   Resistance Level, Start/Resume, Stop/Pause, Reset. Ответы через уведомления.
   ============================================================================ */

const TM_UUID = (n) => '0000' + n.toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb';const TM_OPS = { REQUEST_CONTROL: 0x00, RESET: 0x01, SET_SPEED: 0x02, SET_INCLINE: 0x03, SET_RESISTANCE: 0x04, START: 0x07, STOP: 0x08, RESP_CODE: 0x80 };
const TM_RES_OK = 0x01;
const TM_RES_BAD = { 2: 'операция не поддерживается', 3: 'неверный параметр', 4: 'операция не выполнена', 5: 'нет контроля' };

function tmInit() {
  return {
    status: 'idle', // idle | connecting | binding | ready | diagnostic | unsupported | error
    error: '',
    capOk: false,
    device: null,
    server: null,
    cp: null,
    dataChar: null,
    machine: null, // treadmill | rower | indoorbike | cross | null
    cap: { avgSpeed: false, distance: false, incline: false, resistance: false, energy: false, hr: false, elapsed: false, targetSpeed: false, targetIncline: false, targetResist: false, pace: false },
    targets: { speed: 6, incline: 0, resistance: 5 },
    metrics: { speed: null, incline: null, distance: null, kcal: null, elapsed: null, hr: null, pace: null, cadence: null, resistance: null, power: null, stroke: null, strokeAvg: null, force: null },
    log: [],
    rec: null,
    diag: [],
    deviceName: ''
  };
}

let TM = tmInit();

/* --------------------------------- утилиты -------------------------------- */

function tmSupportedNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Treadmill);
}

function tmSupported() {
  if (tmSupportedNative()) return true;
  return !!(window.navigator && window.navigator.bluetooth && window.navigator.bluetooth.requestDevice);
}

async function tmNativeCall(method, arg) {
  const p = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins.Treadmill : null;
  if (!p || !p[method]) return null;
  const r = await p[method](arg);
  return r;
}

function tmNativeMetricsHandler(ev) {
  const m = (ev && ev.metrics) ? ev.metrics : (ev || {});
  tmOnSample(m);
  if (TM.rec && TM.rec.active) tmAccumulate(m, Date.now());
  tmPaintMetrics();
}

function tmNativeInit() {
  const p = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins.Treadmill : null;
  if (!p || !p.addListener) return;
  try {
    p.addListener('metrics', tmNativeMetricsHandler);
  } catch (e) {}
}

function tmHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += (bytes[i] & 0xff).toString(16).padStart(2, '0') + ' ';
  return out.trim();
}

function tmLog(msg) {
  TM.log.push(new Date().toLocaleTimeString('ru-RU') + ' · ' + msg);
  if (TM.log.length > 60) TM.log.shift();
}

function tmRead16(d, o) { return d[o] | (d[o + 1] << 8); }
function tmRd16(d, o) { const v = tmRead16(d, o); return (v & 0x8000) ? v - 0x10000 : v; }
function tmRd24(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >>> 0; }

function tmInt16FromView(v) { return tmRd16(v, 0); }

function tmBytesFromView(v) { return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength || v.buffer.byteLength); }

function tmFmt(n) { const v = Number(n); return v == null || !isFinite(v) ? '—' : String(v).replace('.', ','); }

function tmSecText(sec) { const s = Math.max(0, Math.floor(sec || 0)); const m = Math.floor(s / 60); const r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
function tmDistText(m) { return (Math.max(0, m || 0) / 1000).toFixed(2).replace('.', ','); }

/* ------------------------------ декодирование ----------------------------- */

function tmDecode(data, machine) {
  const m = {};
  const d = data;
  const f = tmRead16(d, 0);
  let o = 2;
  if (machine === 'treadmill') {
    if (!(f & 0x0001)) { m.speed = tmRead16(d, o) * 0.01; o += 2; }
    if (f & 0x0002) o += 2;
    if (f & 0x0004) { m.distance = tmRd24(d, o); o += 3; }
    if (f & 0x0008) { m.incline = tmRd16(d, o) * 0.1; o += 4; }
    if (f & 0x0010) o += 4;
    if (f & 0x0020) o += 2;
    if (f & 0x0040) o += 2;
    if (f & 0x0080) { m.kcal = tmRead16(d, o); o += 5; }
    if (f & 0x0100) { m.hr = d[o]; o += 1; }
    if (f & 0x0200) o += 1;
    if (f & 0x0400) { m.elapsed = tmRead16(d, o); o += 2; }
    if (f & 0x0800) o += 2;
    if (f & 0x1000) o += 4;
    if (f & 0x2000) o += 4;
  } else if (machine === 'rower') {
    if (!(f & 0x0001)) { m.stroke = d[o]; m.strokeCount = tmRead16(d, o + 1); o += 3; }
    if (f & 0x0002) { m.strokeAvg = d[o]; o += 1; }
    if (f & 0x0004) { m.distance = tmRd24(d, o); o += 3; }
    if (f & 0x0008) { m.pace = tmRead16(d, o); o += 2; }
    if (f & 0x0010) { m.paceAvg = tmRead16(d, o); o += 2; }
    if (f & 0x0020) { m.power = tmRd16(d, o); o += 2; }
    if (f & 0x0040) { m.powerAvg = tmRd16(d, o); o += 2; }
    if (f & 0x0080) { m.resistance = d[o]; o += 1; }
    if (f & 0x0100) { m.kcal = tmRead16(d, o); o += 5; }
    if (f & 0x0200) { m.hr = d[o]; o += 1; }
    if (f & 0x0400) { m.elapsed = tmRead16(d, o); o += 2; }
    if (f & 0x0800) o += 2;
  } else if (machine === 'indoorbike') {
    if (!(f & 0x0001)) { m.speed = tmRead16(d, o) * 0.01; o += 2; }
    if (f & 0x0002) o += 2;
    if (f & 0x0004) { m.cadence = tmRead16(d, o) * 0.5; o += 2; }
    if (f & 0x0008) { m.cadenceAvg = tmRead16(d, o) * 0.5; o += 2; }
    if (f & 0x0010) { m.distance = tmRd24(d, o); o += 3; }
    if (f & 0x0020) { m.resistance = tmRd16(d, o); o += 2; }
    if (f & 0x0040) { m.power = tmRd16(d, o); o += 2; }
    if (f & 0x0080) { m.powerAvg = tmRd16(d, o); o += 2; }
    if (f & 0x0100) { m.kcal = tmRead16(d, o); o += 5; }
    if (f & 0x0200) { m.hr = d[o]; o += 1; }
    if (f & 0x0400) { m.elapsed = tmRead16(d, o); o += 2; }
    if (f & 0x0800) o += 2;
  } else if (machine === 'cross') {
    if (!(f & 0x0001)) { m.speed = tmRead16(d, o) * 0.01; o += 2; }
    if (f & 0x0002) o += 2;
    if (f & 0x0004) { m.distance = tmRd24(d, o); o += 3; }
    if (f & 0x0008) { o += 4; }
    if (f & 0x0010) { o += 4; }
    if (f & 0x0020) { o += 4; }
    if (f & 0x0040) { m.incline = tmRd16(d, o) * 0.1; o += 4; }
    if (f & 0x0080) { m.resistance = tmRd16(d, o); o += 2; }
    if (f & 0x0100) { m.power = tmRd16(d, o); o += 2; }
    if (f & 0x0200) { m.powerAvg = tmRd16(d, o); o += 2; }
    if (f & 0x0400) { m.kcal = tmRead16(d, o); o += 5; }
    if (f & 0x0800) { m.hr = d[o]; o += 1; }
    if (f & 0x1000) { m.met = d[o]; o += 1; }
    if (f & 0x2000) { m.elapsed = tmRead16(d, o); o += 2; }
    if (f & 0x4000) o += 2;
  }
  return m;
}

function tmOnSample(patch) {
  if (!patch) return;
  Object.keys(patch).forEach((k) => { TM.metrics[k] = patch[k]; });
}

/* ------------------------------ запись результата -------------------------- */

function tmRecSeconds() {
  const r = TM.rec;
  if (!r) return 0;
  const end = r.active ? Date.now() : (r.pausedAt || Date.now());
  const paused = r.paused ? r.pausedTotal : 0;
  return Math.max(0, Math.floor((end - r.startedAt - paused) / 1000));
}

function tmStartRec() {
  if (TM.rec && !TM.rec.stopped) return;
  TM.rec = {
    active: true, startedAt: Date.now(), lastAt: Date.now(), paused: false, pausedAt: 0, pausedTotal: 0,
    distM: 0, lastAbs: null, lastKcal: null, maxSpeed: 0, maxIncline: 0, kcal: 0
  };
}

function tmPauseRec() { if (TM.rec && TM.rec.active) { TM.rec.paused = true; TM.rec.pausedAt = Date.now(); } }
function tmResumeRec() { if (TM.rec && TM.rec.paused) { TM.rec.paused = false; TM.rec.pausedTotal += Date.now() - (TM.rec.pausedAt || Date.now()); TM.rec.lastAt = Date.now(); } }

function tmFinalizeRec() {
  const r = TM.rec;
  if (!r) return null;
  const seconds = tmRecSeconds();
  const meters = Math.max(0, Math.round(r.distM || 0));
  const avg = seconds > 3 ? Math.round((meters / seconds) * 3.6 * 10) / 10 : 0;
  const kcal = Math.round(r.kcal || 0);
  const entry = {
    id: 'tm-' + Date.now().toString(36),
    date: todayISO(),
    startAt: new Date(r.startedAt).toISOString(),
    seconds: seconds,
    meters: meters,
    avgSpeed: avg,
    maxSpeed: Math.round((r.maxSpeed || 0) * 10) / 10,
    kcal: kcal > 0 ? kcal : Math.round((num(state.profile.weight) || 93) * (meters / 1000) * 0.9),
    incline: Math.round((r.maxIncline || 0) * 10) / 10,
    source: TM.machine || 'manual'
  };
  TM.rec = { ...r, active: false, stopped: true };
  return entry;
}

function tmSaveEntry(e) {
  state.treadmill = state.treadmill || [];
  state.treadmill.push(e);
  save();
  return e;
}

function tmSaveManual() {
  const mins = Number((document.getElementById('tm-m-min') || {}).value) || 0;
  const km = Number((document.getElementById('tm-m-km') || {}).value) || 0;
  const seconds = Math.round(mins * 60);
  const meters = Math.round(km * 1000);
  const entry = {
    id: 'tm-' + Date.now().toString(36),
    date: todayISO(),
    startAt: new Date().toISOString(),
    seconds: seconds,
    meters: meters,
    avgSpeed: seconds > 3 ? Math.round((meters / seconds) * 3.6 * 10) / 10 : 0,
    maxSpeed: 0,
    kcal: 0,
    incline: 0,
    source: 'manual'
  };
  tmSaveEntry(entry);
  tmRefresh();
  toast('Треначок сохранён · ' + String(km).replace('.', ',') + ' км · ' + mins + ' мин');
}

function tmDeleteEntry(id) {
  state.treadmill = (state.treadmill || []).filter((x) => x.id !== id);
  save();
  tmRefresh();
}

function tmEntries(dateISO) {
  const arr = (state.treadmill || []).filter((x) => x && x.date === dateISO);
  return arr.slice().sort((a, b) => String(b.startAt || '').localeCompare(String(a.startAt || '')));
}

function tmTotals(n) {
  const arr = (state.treadmill || []).slice().sort((a, b) => String(b.date) < String(a.date) ? 1 : -1);
  const last = arr.slice(0, n || 10);
  const meters = last.reduce((s, x) => s + (Number(x.meters) || 0), 0);
  const kcal = last.reduce((s, x) => s + (Number(x.kcal) || 0), 0);
  const hours = last.reduce((s, x) => s + (Number(x.seconds) || 0) / 3600, 0);
  const best = last.reduce((b, x) => ((Number(x.avgSpeed) || 0) > (b ? Number(b.avgSpeed) || 0 : 0) ? x : b), null);
  return { n: last.length, meters: Math.round(meters), kcal: Math.round(kcal), hours: hours, best: best };
}

/* ------------------------------ BLE: подключение --------------------------- */

async function tmConnect() {
  if (TM.status === 'connecting' || TM.status === 'binding') return;
  if (tmSupportedNative()) {
    TM.status = 'connecting';
    TM.error = '';
    tmRefresh();
    try {
      const r = await tmNativeCall('connect');
      TM.status = 'ready';
      if (r && r.name) TM.deviceName = r.name;
      tmRefresh();
    } catch (err) {
      TM.status = 'error';
      TM.error = (err && err.message) ? err.message : String(err);
      tmRefresh();
    }
    return;
  }
  if (!tmSupported()) { TM.status = 'unsupported'; tmRefresh(); return; }
  TM.status = 'connecting';
  TM.error = '';
  tmStopNotifs();
  tmRefresh();
  try {
    const nav = window.navigator;
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['00001826-0000-1000-8000-00805f9b34fb', '0000180d-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb']
    });
    TM.device = device;
    device.addEventListener('gattserverdisconnected', function () { tmHandleDisconnect(); });
    const server = await device.gatt.connect();
    TM.server = server;
    let name = '';
    try {
      const diSvc = await server.getPrimaryService('0000180a-0000-1000-8000-00805f9b34fb');
      const diChars = await diSvc.getCharacteristics();
      for (const c of diChars) {
        if (c.uuid === TM_UUID(0x2a24) || c.uuid === 'device_name') {
          try {
            const v = await c.readValue();
            const b = tmBytesFromView(v);
            const s = '';
            for (let i = 0; i < b.length; i++) { const c2 = String.fromCharCode(b[i]); if (c2.charCodeAt(0) < 32 || c2.charCodeAt(0) > 126) break; s += c2; }
            name = s;
          } catch (e) {}
        }
      }
    } catch (e) { name = ''; }
    TM.deviceName = name || device.name || '';
    let ftms = null;
    try { ftms = await server.getPrimaryService('00001826-0000-1000-8000-00805f9b34fb'); } catch (e) { ftms = null; }
    if (ftms) {
      await tmBindFtms(ftms);
    } else {
      TM.status = 'diagnostic';
      tmRefresh();
    }
  } catch (err) {
    TM.status = 'error';
    TM.error = (err && err.message) ? err.message : String(err);
    tmRefresh();
  }
}

async function tmBindFtms(service) {
  TM.status = 'binding';
  tmRefresh();
  const chars = await service.getCharacteristics();
  const byUuid = {};
  chars.forEach((c) => { byUuid[c.uuid] = c; });
  const logLine = (label, value) => { tmLog(label + ': ' + (value == null ? '—' : value)); };
  for (const c of chars) {
    const name = TM_UUID_NAME(c.uuid);
    TM.diag.push({ uuid: c.uuid, name: name, chars: [] });
    TM.diag[TM.diag.length - 1].chars.push({ uuid: c.uuid, name: name, readable: !!(c.properties && c.properties.read), writable: !!(c.properties && (c.properties.write || c.properties.writeWithoutResponse)), notifiable: !!(c.properties && (c.properties.notify || c.properties.indicate)) });
    if (c.properties && (c.properties.notify || c.properties.indicate)) {
      try { await c.startNotifications(); c.addEventListener('characteristicvaluechanged', function (e) { tmDiagValue(c, e); }); } catch (e) {}
    }
  }
  const feat = byUuid[TM_UUID(0x2acc)];
  if (feat) {
    try {
      const v = await feat.readValue();
      const b = tmBytesFromView(v);
      const mf = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
      const tf = b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24);
      TM.cap.avgSpeed = !!(mf & (1 << 0));
      TM.cap.cadence = !!(mf & (1 << 1));
      TM.cap.distance = !!(mf & (1 << 2));
      TM.cap.incline = !!(mf & (1 << 3));
      TM.cap.resistance = !!(mf & (1 << 7));
      TM.cap.energy = !!(mf & (1 << 9));
      TM.cap.hr = !!(mf & (1 << 10));
      TM.cap.elapsed = !!(mf & (1 << 12));
      TM.cap.pace = !!(mf & (1 << 5));
      TM.cap.targetSpeed = !!!(tf & 1);
      TM.cap.targetIncline = !!!(tf & 2);
      TM.cap.targetResist = !!!(tf & 4);
      tmLog('Возможности машины: усредн. скорость=' + TM.cap.avgSpeed + ', дистанция=' + TM.cap.distance + ', наклон=' + TM.cap.incline + ', сопр=' + TM.cap.resistance + ', энергия=' + TM.cap.energy + ', пульс=' + TM.cap.hr + ', время=' + TM.cap.elapsed + ', темп=' + TM.cap.pace);
      tmLog('Возможности команд: скорость=' + TM.cap.targetSpeed + ', наклон=' + TM.cap.targetIncline + ', сопр=' + TM.cap.targetResist);
    } catch (e) { tmLog('FTMS: не прочитал возможности: ' + (e && e.message ? e.message : e)); }
  }
  const dataUuid = TM_UUID(0x2acd);
  const dataChar = byUuid[dataUuid] || byUuid[TM_UUID(0x2ad1)] || byUuid[TM_UUID(0x2ad2)] || byUuid[TM_UUID(0x2ace)];
  TM.dataChar = dataChar || null;
  TM.machine = dataChar && dataChar.uuid === TM_UUID(0x2ad1) ? 'rower' : (dataChar && dataChar.uuid === TM_UUID(0x2ad2) ? 'indoorbike' : (dataChar && dataChar.uuid === TM_UUID(0x2ace) ? 'cross' : 'treadmill'));
  if (dataChar) {
    try { await dataChar.startNotifications(); dataChar.addEventListener('characteristicvaluechanged', function (e) { tmOnData(e); }); } catch (e) { tmLog('Данные: не подписались: ' + (e && e.message ? e.message : e)); }
  }
  const cp = byUuid[TM_UUID(0x2ad9)];
  TM.cp = cp || null;
  if (cp) {
    try { await cp.startNotifications(); cp.addEventListener('characteristicvaluechanged', function (e) { tmOnCp(e); }); } catch (e) {}
    try { await tmSendControl(new Uint8Array([TM_OPS.REQUEST_CONTROL])); } catch (e) {}
  }
  TM.status = 'ready';
  tmRefresh();
}

function TM_UUID_NAME(u) {
  const map = { '0000180a-0000-1000-8000-00805f9b34fb': 'device_information', '0000180d-0000-1000-8000-00805f9b34fb': 'heart_rate', '00001812-0000-1000-8000-00805f9b34fb': 'cycling_speed_and_cadence', '00001814-0000-1000-8000-00805f9b34fb': 'running_speed_and_cadence', '00001825-0000-1000-8000-00805f9b34fb': 'glucose', '00002a37-0000-1000-8000-00805f9b34fb': 'heart_rate_measurement', '00002a39-0000-1000-8000-00805f9b34fb': 'heart_rate_control_point', '00002a5a-0000-1000-8000-00805f9b34fb': 'digital_output', '00002a66-0000-1000-8000-00805f9b34fb': 'digital_input', '00002acc-0000-1000-8000-00805f9b34fb': 'fitness_machine_feature', '00002acd-0000-1000-8000-00805f9b34fb': 'treadmill_data', '00002ad1-0000-1000-8000-00805f9b34fb': 'rower_data', '00002ad2-0000-1000-8000-00805f9b34fb': 'indoor_bike_data', '00002ad3-0000-1000-8000-00805f9b34fb': 'training_status', '00002ad4-0000-1000-8000-00805f9b34fb': 'supported_speed_range', '00002ad5-0000-1000-8000-00805f9b34fb': 'supported_inclination_range', '00002ad6-0000-1000-8000-00805f9b34fb': 'supported_resistance_range', '00002ad7-0000-1000-8000-00805f9b34fb': 'fitness_machine_status', '00002ad9-0000-1000-8000-00805f9b34fb': 'fitness_machine_control_point' };
  const names = { '00001826-0000-1000-8000-00805f9b34fb': 'fitness_machine', '0000fee0-0000-1000-8000-00805f9b34fb': 'mi_band_proprietary' };
  return names[u] || map[u] || u;
}

async function tmDiagServices(server) {
  TM.status = 'diagnostic';
  TM.machine = null;
  TM.cap = tmInit().cap;
  try {
    const services = await server.getPrimaryServices();
    TM.diag = [];
    for (const s of services) {
      const chars = await s.getCharacteristics();
      const charList = [];
      for (const c of chars) {
        const info = { uuid: c.uuid, name: TM_UUID_NAME(c.uuid), readable: !!(c.properties && c.properties.read), writable: !!(c.properties && (c.properties.write || c.properties.writeWithoutResponse)), notifiable: !!(c.properties && (c.properties.notify || c.properties.indicate)) };
        if (info.notifiable) {
          try { await c.startNotifications(); c.addEventListener('characteristicvaluechanged', function (e) { tmDiagValue(c, e); }); } catch (e) {}
        }
        charList.push(info);
      }
      TM.diag.push({ uuid: s.uuid, name: TM_UUID_NAME(s.uuid), chars: charList });
    }
  } catch (e) {
    TM.diag.push({ uuid: 'error', name: 'error', chars: [{ uuid: '', name: String(e) }] });
  }
  tmRefresh();
}

function tmDiagValue(char, e) {
  try {
    const bytes = tmBytesFromView(e.target.value);
    tmLog(TM_UUID_NAME(char.uuid) + ' ← ' + tmHex(bytes));
  } catch (e) {}
}

async function tmSendControl(bytes) {
  const cp = TM.cp;
  if (!cp) return false;
  try {
    if (cp.properties) {
      if (cp.properties.write) { try { await cp.writeValue(bytes); return true; } catch (e) {} }
      if (cp.properties.writeWithoutResponse) { try { await cp.writeValueWithoutResponse(bytes); return true; } catch (e) {} }
    }
  } catch (e) { return false; }
  return false;
}

async function tmApplyControl(op, param) {
  const ok = await tmSendControl(new Uint8Array([op, (param || 0) & 0xff, ((param || 0) >> 8) & 0xff]));
  return ok;
}

async function tmSend(op, param) {
  const ok = await tmSendControl(new Uint8Array([op, (param || 0) & 0xff, ((param || 0) >> 8) & 0xff]));
  if (ok) tmLog('Отправлено: опкод 0x' + op.toString(16) + (param != null ? ' · параметр ' + param : ''));
  return ok;
}

function tmOnCp(e) {
  try {
    const bytes = tmBytesFromView(e.target.value);
    if (bytes.length < 1) return;
    if (bytes[0] !== TM_OPS.RESP_CODE) {
      tmLog('Статус машины (0x' + bytes[0].toString(16) + ') — нет ответа на команду');
      return;
    }
    const req = bytes[1];
    const res = bytes[2];
    tmLog('Ответ на опкод 0x' + req.toString(16) + ' → ' + (TM_RES_BAD[res] || 'код ' + res));
    if (res === TM_RES_OK) {
      if (req === TM_OPS.REQUEST_CONTROL) TM.capOk = true;
      if (req === TM_OPS.START) tmLog('Машина: старт/возобновление');
    }
  } catch (e) { tmLog('Ошибка ответа'); }
}

function tmHandleDisconnect() {
  const wasRec = TM.rec && TM.rec.active;
  TM.status = 'idle';
  TM.error = '';
  TM.device = null;
  TM.server = null;
  TM.cp = null;
  TM.dataChar = null;
  TM.machine = null;
  TM.cap = tmInit().cap;
  TM.metrics = tmInit().metrics;
  TM.rec = null;
  if (wasRec) {
    const entry = tmFinalizeRec();
    if (entry) { tmSaveEntry(entry); toast('Треначок отключился · результат сохранён'); }
  }
}

async function tmDisconnect() {
  try { if (TM.server) { await TM.server.disconnect(); } } catch (e) {}
  TM.server = null;
  TM.device = null;
  TM.cp = null;
  TM.dataChar = null;
  TM.machine = null;
  TM.cap = tmInit().cap;
  TM.metrics = tmInit().metrics;
  TM.rec = null;
  tmRefresh();
}

/* ------------------------------ обработка данных ---------------------------- */

function tmOnData(e) {
  try {
    const bytes = tmBytesFromView(e.target.value);
    const machine = TM.machine;
    const patch = tmDecode(bytes, machine);
    tmOnSample(patch);
    if (machine === 'treadmill') tmLog('Данные FTMS: скорость ' + tmFmt(patch.speed) + ' км/ч · наклон ' + tmFmt(patch.incline) + ' % · дистанция ' + tmFmt(patch.distance) + ' м');
    if (machine === 'rower') tmLog('Данные Rower: гребки ' + tmFmt(patch.stroke) + '/мин · сопр ' + tmFmt(patch.resistance) + ' · дистанция ' + tmFmt(patch.distance) + ' м');
    if (TM.rec && TM.rec.active) tmAccumulate(patch, Date.now());
    tmPaintMetrics();
  } catch (e) { tmLog('Ошибка декодирования данных'); }
}

function tmAccumulate(patch, now) {
  const r = TM.rec;
  if (!r || !r.active) return;
  const dt = Math.min(5, Math.max(0.1, (now - (r.lastAt || now)) / 1000));
  r.lastAt = now;
  if (patch.speed != null) { r.maxSpeed = Math.max(r.maxSpeed || 0, patch.speed); }
  if (patch.incline != null) { r.maxIncline = Math.max(r.maxIncline || 0, patch.incline); }
  if (patch.kcal != null) { r.kcal = Math.max(0, patch.kcal - (r.lastKcal == null ? (TM.metrics.kcal || 0) : r.lastKcal)); r.lastKcal = patch.kcal; }
  if (patch.distance != null) {
    if (r.lastAbs != null) r.distM = Math.max(0, r.distM + Math.max(0, patch.distance - r.lastAbs));
    r.lastAbs = patch.distance;
  } else if (patch.speed) {
    r.distM = Math.max(0, r.distM + (patch.speed / 3.6) * dt * 1000);
  }
}

/* --------------------------------- рендер --------------------------------- */

function tmLogText() { return TM.log.join('\n'); }

function tmMetricsKeys() {
  const m = TM.metrics;
  const keys = [];
  const push = (k) => { if (m[k] != null && keys.indexOf(k) === -1) keys.push(k); };
  if (TM.machine === 'treadmill') { push('speed'); push('incline'); push('distance'); push('elapsed'); push('kcal'); push('hr'); push('power'); push('pace'); }
  else if (TM.machine === 'rower') { push('pace'); push('distance'); push('elapsed'); push('kcal'); push('hr'); push('resistance'); push('power'); push('stroke'); }
  else if (TM.machine === 'indoorbike') { push('speed'); push('cadence'); push('distance'); push('elapsed'); push('kcal'); push('hr'); push('resistance'); push('power'); }
  else if (TM.machine === 'cross') { push('speed'); push('distance'); push('elapsed'); push('kcal'); push('hr'); push('incline'); push('resistance'); push('power'); }
  if (keys.length === 0) { ['speed', 'incline', 'distance', 'elapsed', 'kcal', 'hr'].forEach(push); }
  if (keys.length > 6) keys.length = 6;
  return keys;
}

function tmMetricsHtml() {
  const m = TM.metrics;
  const defs = {
    speed: { label: 'Скорость', unit: 'км/ч', get: (x) => x.speed == null ? '—' : Number(x.speed).toFixed(1).replace('.', ',') },
    incline: { label: 'Наклон', unit: '%', get: (x) => x.incline == null ? '—' : Number(x.incline).toFixed(1).replace('.', ',') },
    distance: { label: 'Дистанция', unit: 'км', get: (x) => x.distance == null ? '—' : tmDistText(x.distance) },
    elapsed: { label: 'Время', unit: 'мин', get: (x) => x.elapsed == null ? '—' : tmSecText(x.elapsed) },
    kcal: { label: 'Энергия', unit: 'ккал', get: (x) => x.kcal == null ? '—' : String(Math.round(x.kcal)) },
    hr: { label: 'Пульс', unit: 'уд/мин', get: (x) => x.hr == null ? '—' : String(Math.round(x.hr)) },
    pace: { label: 'Темп /500 м', unit: 'с', get: (x) => x.pace == null ? '—' : tmSecText(x.pace) },
    cadence: { label: 'Каденс', unit: 'в/мин', get: (x) => x.cadence == null ? '—' : Number(x.cadence).toFixed(0).replace('.', ',') },
    resistance: { label: 'Сопротивление', unit: 'уровень', get: (x) => x.resistance == null ? '—' : String(Math.round(x.resistance)) },
    power: { label: 'Мощность', unit: 'Вт', get: (x) => x.power == null ? '—' : String(Math.round(x.power)) },
    stroke: { label: 'Гребки', unit: '/мин', get: (x) => x.stroke == null ? '—' : String(Math.round(x.stroke * 2)) }
  };
  const tiles = tmMetricsKeys().map((k) => {
    const d = defs[k];
    return '<div class="tm-metric' + (TM.metrics[k] == null ? ' tm-metric--hide' : '') + '"><b id="tm-v-' + k + '">' + esc(d.get(m)) + '</b><span class="tm-metric__label">' + esc(d.label) + '</span><span class="tm-metric__unit">' + esc(d.unit) + '</span></div>';
  });
  return '<div class="tm-metrics">' + tiles.join('') + '</div>';
}

function tmMetricsPaint() {
  const cont = document.getElementById('tm-metrics');
  if (!cont) return;
  const html = tmMetricsHtml();
  if (cont.dataset.keys !== html) { cont.innerHTML = html; cont.dataset.keys = html; }
  tmMetricsKeys().forEach((k) => {
    const el = document.getElementById('tm-v-' + k);
    if (!el) return;
    const def = { speed: { label: 'Скорость', unit: 'км/ч', get: (x) => x.speed == null ? '—' : Number(x.speed).toFixed(1).replace('.', ',') }, incline: { label: 'Наклон', unit: '%', get: (x) => x.incline == null ? '—' : Number(x.incline).toFixed(1).replace('.', ',') }, distance: { label: 'Дистанция', unit: 'км', get: (x) => x.distance == null ? '—' : tmDistText(x.distance) }, elapsed: { label: 'Время', unit: 'мин', get: (x) => x.elapsed == null ? '—' : tmSecText(x.elapsed) }, kcal: { label: 'Энергия', unit: 'ккал', get: (x) => x.kcal == null ? '—' : String(Math.round(x.kcal)) }, hr: { label: 'Пульс', unit: 'уд/мин', get: (x) => x.hr == null ? '—' : String(Math.round(x.hr)) }, pace: { label: 'Темп /500 м', unit: 'с', get: (x) => x.pace == null ? '—' : tmSecText(Number(x.pace) / 2) }, cadence: { label: 'Каденс', unit: 'в/мин', get: (x) => x.cadence == null ? '—' : Number(x.cadence).toFixed(0).replace('.', ',') }, resistance: { label: 'Сопротивление', unit: 'уровень', get: (x) => x.resistance == null ? '—' : String(Math.round(x.resistance)) }, power: { label: 'Мощность', unit: 'Вт', get: (x) => x.power == null ? '—' : String(Math.round(x.power)) }, stroke: { label: 'Гребки', unit: '/мин', get: (x) => x.stroke == null ? '—' : String(Math.round(x.stroke * 2)) } }[k];
    if (el) el.textContent = def.get(TM.metrics);
  });
}

function tmSessionHtml() {
  const r = TM.rec;
  const running = r && r.active;
  const paused = r && r.paused;
  const stopped = r && r.stopped;
  let stats = '';
  if (running) {
    const sec = tmRecSeconds();
    stats = '<div class="tm-recstats"><span><b id="tm-rec-time">' + tmSecText(sec) + '</b> мин</span><span>дистанция <b>' + tmDistText(r.distM || 0) + '</b> км</span><span>макс <b>' + (Number(r.maxSpeed || 0)).toFixed(1).replace('.', ',') + '</b> км/ч</span></div>';
  }
  let actions = '';
  if (running) {
    actions = '<div class="tm-actions">' +
      '<button class="btn" data-act="tm-pause">' + (paused ? 'Продолжить' : '⏸ Пауза') + '</button>' +
      '<button class="btn btn--danger" data-act="tm-stop">⏹ Стоп</button>' +
    '</div>' + stats;
  } else if (stopped) {
    actions = '<div class="tm-actions"><button class="btn btn--primary" data-act="tm-start">▶ Новая тренировка</button></div>';
  } else {
    actions = '<div class="tm-actions"><button class="btn btn--primary" data-act="tm-start">▶ Старт</button></div>';
  }
  return '<div class="tm-session">' + actions + '</div>';
}

function tmHistoryHtml() {
  const entries = tmEntries(ui.date);
  if (!entries.length) return '<div class="tm-note" style="margin-top:10px">Сегодня ещё нет результатов.</div>';
  return '<div class="tm-history">' + entries.map((x) => (
    '<div class="tm-entry">' +
      '<div><b>' + new Date(x.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</b> · ' + String(Math.round((Number(x.seconds) || 0) / 60)) + ' мин · ' + String(Math.round((Number(x.meters) || 0) / 1000 * 10) / 10) + ' км · ' + String(Number(x.avgSpeed || 0)).replace('.', ',') + ' км/ч' + (x.kcal ? ' · ' + Math.round(x.kcal) + ' ккал' : '') + '</div>' +
      '<button class="btn btn--ghost btn--small tm-del" data-act="tm-delete" data-id="' + x.id + '">удалить</button>' +
    '</div>'
  )).join('') + '</div>';
}

function tmManualDetails() {
  return '<details class="lib" style="margin-top:10px"><summary>Записать результат вручную</summary><div class="lib__body">' +
    '<div class="rowform">' +
      '<label class="num"><input id="tm-m-min" type="number" inputmode="decimal" min="0" step="0.5" placeholder="мин" aria-label="минуты"></label>' +
      '<label class="num"><input id="tm-m-km" type="number" inputmode="decimal" min="0" step="0.1" placeholder="км" aria-label="километры"></label>' +
      '<button class="btn btn--primary btn--small" data-act="tm-save-manual">Записать</button>' +
    '</div>' +
    '<p class="hint">Вручную — если Bluetooth не подключился. Записывай время и дистанцию (бег, ходьба). Наклон и мощность на вручную не считаем.</p>' +
    '</div></details>';
}

function tmBody() {
  if (!tmSupported()) {
    return '<div class="tm-note tm-note--warn"><b>Этот браузер не даёт Bluetooth.</b> Web Bluetooth доступен в Chrome и Edge на Android и на компьютере. На iPhone в приложении Bluetooth-устройств браузера нет — там только ручная запись результата.</div>' + tmManualDetails();
  }
  if (TM.status === 'connecting') {
    return '<div class="tm-note">Ищем тренажёр… Открой список устройств Bluetooth и выбери нужный (например UNIX Fit / Techno Rower). Нажми «Отмена», если список не показывает устройство.</div>';
  }
  if (TM.status === 'idle') {
    return '<div class="tm-note">Подключи тренажёр по Bluetooth: беговая дорожка, гребной тренажёр, велотренажёр — любой с сервисом <b>Fitness Machine (FTMS)</b>. Телефон включи в Bluetooth, тренажёр — в режиме сопряжения.</div>' +
      '<button class="btn btn--primary btn--block" data-act="tm-connect">📡 Подключить тренажёр</button>' +
      '<p class="hint">Web Bluetooth требует Chrome и HTTPS (у тебя GitHub Pages — ок). На iPhone этот путь в Safari не работает.</p>' + tmManualDetails();
  }
  if (TM.status === 'error') {
    return '<div class="tm-note tm-note--warn"><b>Не удалось подключиться.</b><br>' + esc(TM.error) + '</div><button class="btn btn--primary btn--block" data-act="tm-connect">Повторить подключение</button>' + tmManualDetails();
  }
  if (TM.status === 'diagnostic') {
    return '<div class="tm-note">Сервис <b>Fitness Machine (0x1826 / FTMS)</b> не найден. Возможно, у тренажёра свой протокол. Вот что увидел поиск:</div>' +
      '<button class="btn btn--ghost btn--block" data-act="tm-connect">Найти устройство ещё раз</button>' +
      '<details class="lib"><summary>Журнал Bluetooth</summary><div class="lib__body"><pre id="tm-log" class="tm-log">' + esc(tmLogText()) + '</pre><button class="btn btn--small" data-act="tm-log-copy">Скопировать в буфер обмена</button></div></details>' +
      '<p class="hint">Если сервис есть, но не распознался, скопируй журнал и пришли его мне — добавлю протокол под твой тренажёр.</p>' + tmManualDetails();
  }
  // ready
  const capRows = [
    ['Скорость', TM.cap.targetSpeed],
    ['Наклон', TM.cap.targetIncline],
    ['Сопротивление / мощность', TM.cap.targetResist]
  ];
  const controls = capRows.map((r) => {
    const label = r[0], on = r[1];
    if (TM.machine === 'rower') {
      if (!on) return '';
      return '<div class="tm-ctrl"><label class="field"><span>Сопротивление гребли (уровень)</span><input type="number" min="0" max="16" step="1" inputmode="numeric" value="' + esc(TM.targets.resistance) + '" data-tm-field="resistance" aria-label="сопротивление, уровень"></label><button class="btn btn--small" data-act="tm-apply" data-field="resistance">Задать</button></div>';
    }
    if (!on) return '';
    if (r[0] === 'Скорость') {
      return '<div class="tm-ctrl"><label class="field"><span>Целевая скорость</span><input type="number" min="0" max="25" step="0.5" inputmode="decimal" value="' + esc(TM.targets.speed) + '" data-tm-field="speed" aria-label="целевая скорость, км/ч"></label><button class="btn btn--small" data-act="tm-apply" data-field="speed">Задать</button></div>';
    }
    return '<div class="tm-ctrl"><label class="field"><span>Целевой наклон</span><input type="number" min="-5" max="15" step="0.5" inputmode="decimal" value="' + esc(TM.targets.incline) + '" data-tm-field="incline" aria-label="наклон, %"></label><button class="btn btn--small" data-act="tm-apply" data-field="incline">Задать</button></div>';
  }).filter(Boolean).join('');
  const machineLabel = TM.machine === 'rower' ? 'FTMS · гребной тренажёр' : TM.machine === 'indoorbike' ? 'FTMS · велотренажёр' : TM.machine === 'cross' ? 'FTMS · кросстрейнер' : 'FTMS · беговая дорожка';
  return '<div class="tm-head">' +
    '<span class="tm-dot' + ((TM.rec && TM.rec.active) ? ' tm-dot--on' : '') + '"></span>' +
    '<div class="tm-head__main"><b>' + esc(TM.deviceName || 'Треначок') + '</b><span class="tm-badge">' + esc(machineLabel) + '</span></div>' +
    '<button class="btn btn--ghost btn--small" data-act="tm-disconnect">Отключить</button>' +
  '</div>' +
  '<div id="tm-metrics" class="tm-metrics">' + tmMetricsHtml() + '</div>' +
  (controls ? '<div class="tm-ctrls">' + controls + '</div>' : '') +
  '<p class="hint">Безопасность: надев на треначок страховку / удерживай направляющую, треначок должен быть в безопасности. Код приложения — вспомогательный, а не замена кнопок на треначке. До начала: целевая скорость и наклон выставляй кнопками или селекторами.</p>' +
  tmSessionHtml() +
  '<div class="tm-lastrun"><span>Последние тренировки:</span>' + tmLastRuns() + '</div>' +
  tmManualDetails();
}

function tmLastRuns() {
  const arr = (state.treadmill || []).slice().sort((a, b) => String(b.date) < String(a.date) ? 1 : -1).slice(0, 3);
  if (!arr.length) return '<b>—</b>';
  return arr.map((x) => {
    const d = new Date(x.startAt);
    const time = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    return '<span>' + time + ' · ' + String(Math.round((Number(x.seconds) || 0) / 60)) + ' мин · ' + String(Math.round((Number(x.meters) || 0) / 1000 * 10) / 10) + ' км · ' + String(Number(x.avgSpeed || 0)).replace('.', ',') + ' км/ч</span>';
  }).join(' &nbsp;·&nbsp; ');
}

function tmRefresh() {
  const body = document.getElementById('tm-body');
  const card = document.getElementById('tm-card');
  if (!card || !body) return;
  body.innerHTML = tmBody();
  tmSetText('tm-name', TM.deviceName || (TM.status === 'ready' ? 'Треначок' : ''));
  const metrics = document.getElementById('tm-metrics');
  if (metrics) { tmMetricsPaint(); }
  const session = document.getElementById('tm-session');
  if (session) session.innerHTML = tmSessionHtml();
  const hist = document.getElementById('tm-history');
  if (hist) hist.innerHTML = tmHistoryHtml();
  const logEl = document.getElementById('tm-log');
  if (logEl) logEl.textContent = tmLogText();
}

function tmSetText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt == null ? '—' : String(txt); }

function tmCopyLog() {
  const text = tmLogText();
  const done = function () { toast('Журнал скопирован ✓'); };
  const fail = function () { toast('Не удалось скопировать журнал'); };
  if (window.navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fail);
    return;
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch (e) { fail(); }
}

function tmTick() {
  if (TM.rec && TM.rec.active) {
    const el = document.getElementById('tm-rec-time');
    if (el) el.textContent = tmSecText(tmRecSeconds());
  }
}

function tmStopNotifs() { /* подписки чистятся с подключением; отписка здесь для перехода */ }

/* --------------------------------- действия -------------------------------- */

async function tmApply(field) {
  const t = TM.targets;
  let ok = false;
  if (field === 'speed') { t.speed = Number(t.speed); ok = await tmSend(TM_OPS.SET_SPEED, Math.round(t.speed * 100)); }
  else if (field === 'incline') { t.incline = Number(t.incline); ok = await tmSend(TM_OPS.SET_INCLINE, Math.round(t.incline * 10)); }
  else if (field === 'resistance') { t.resistance = Number(t.resistance); ok = await tmSend(TM_OPS.SET_RESISTANCE, Math.round(t.resistance * 10)); }
  tmLog('Команда ' + field + ': ' + (ok ? 'отправлена' : 'ошибка отправки'));
}

async function tmStart() {
  if (TM.rec && TM.rec.stopped) TM.rec = null;
  tmStartRec();
  tmResumeRec();
  let started = false;
  if (TM.cp) { try { started = await tmSend(TM_OPS.START, 0); } catch (e) { started = false; } }
  tmLog('Тренировка начата · отправка старт/возобновление: ' + (started ? 'ok' : 'нет ответа'));
}

function tmPause() { tmPauseRec(); tmRefresh(); }
function tmResume() { tmResumeRec(); tmRefresh(); }

function tmStop() {
  if (!TM.rec) { return; }
  const r = TM.rec;
  const entry = tmFinalizeRec();
  TM.rec = { ...r, active: false, stopped: true };
  if (entry) {
    if (Number(entry.seconds) >= 20 && Number(entry.meters) > 0) tmSaveEntry(entry);
    tmRefresh();
    toast('Результат сохранён · ' + String(Math.round((Number(entry.meters) || 0) / 1000 * 10) / 10) + ' км · ' + String(Math.round((Number(entry.seconds) || 0) / 60)) + ' мин');
  }
}

function tmSetTarget(field, value) {
  const t = TM.targets;
  const v = Number(value);
  if (!isFinite(v)) return;
  t[field] = v;
}

setInterval(function () { tmTick(); }, 1000);
window.addEventListener('beforeunload', function () {
  if (TM.rec && TM.rec.active) {
    const e = tmFinalizeRec();
    if (e) tmSaveEntry(e);
    TM.rec = { ...TM.rec, active: false, stopped: true };
  }
});
