const TYPES = {homework:'ДЗ', lab:'Лаба', test:'КР', project:'Проект', quiz:'Квиз', exam:'Экзамен'};
const SRC = {wiki:'Вики', telegram:'Telegram', email:'Почта', hse_app_x:'HSE App X', other:'Другое'};
const ST = {not_started:'Не начато', done:'Сдано', cancelled:'Отменено'};
const SEED = ['Алгебра','Матан','Дискра','История','Английский','ВВП','ОРГ'];
const KEY = 'planner-v1', DIRTY = 'planner-dirty', AUTH = 'planner-auth';
const CFG = window.PLANNER_CONFIG || {};
const WD = ['вс','пн','вт','ср','чт','пт','сб'];
const NAV = [['all','Все'],['archive','Архив'],['subjects','Предметы']];

let data = load(), view = 'all', collapsed = {}, subjErr = '', editSubj = null;

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.subjects && d.tasks) return d; } catch (e) {}
  return {subjects: SEED.map((name, i) => ({id:'s'+i, name, color:i})), tasks: []};
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { alert('Не удалось сохранить данные в браузере.'); }
  localStorage.setItem(DIRTY, '1');
  schedulePush();
}

const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(x => x != null && e.append(x.nodeType ? x : document.createTextNode(x)));
  return e;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
function fmt(d, t) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return dd + '.' + m + '.' + y + ' ' + WD[new Date(+y, m-1, +dd).getDay()] + (t ? ' ' + t : '');
}
const subj = id => data.subjects.find(s => s.id === id);
const task = id => data.tasks.find(t => t.id === id);
const isEng = id => ((subj(id) || {}).name || '').trim().toLowerCase() === 'английский';
const colorVar = s => 'var(--c' + ((s ? s.color : 7) % 8) + ')';
const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
function cmp(a, b) {
  if (a.deadline_date !== b.deadline_date) {
    if (!a.deadline_date) return 1;
    if (!b.deadline_date) return -1;
    return a.deadline_date < b.deadline_date ? -1 : 1;
  }
  if (a.deadline_time !== b.deadline_time) {
    if (!a.deadline_time) return 1;
    if (!b.deadline_time) return -1;
    return a.deadline_time < b.deadline_time ? -1 : 1;
  }
  return 0;
}
function urgency(t) {
  if (t.status !== 'not_started' || !t.deadline_date) return '';
  if (t.deadline_date < today()) return 'over';
  if (t.deadline_date === today()) return 'now';
  return t.deadline_date <= plus(2) ? 'soon' : '';
}

/* ---------- списки ---------- */
function row(t, showSubject) {
  const s = subj(t.subject_id);
  return h('div', {class:'row', tabindex:'0', role:'button', style:'--c:' + colorVar(s),
      onclick:() => openCard(t.id), onkeydown:e => { if (e.key === 'Enter') openCard(t.id); }},
    h('div', {class:'ti'}, t.title + (showSubject && s ? ' (' + s.name + ')' : '')),
    h('span', {class:'tag', 'data-type':t.type}, TYPES[t.type]),
    h('div', {class:'dl ' + urgency(t)}, fmt(t.deadline_date, t.deadline_time)),
    h('div', {class:'mut late'}, t.late_date ? 'Поздний: ' + fmt(t.late_date, t.late_time) : ''),
    t.status === 'not_started'
      ? h('button', {class:'btn ok', onclick:e => { e.stopPropagation(); t.status = 'done'; t.updated = Date.now(); save(); render(); }}, 'Сдано')
      : h('span', {class:'tag ' + t.status}, ST[t.status]));
}

function render() {
  if (!CFG.url || !CFG.key) {
    $('#nav').replaceChildren(); $('#new').hidden = true;
    $('#main').replaceChildren(h('h1', {}, 'Синхронизация не настроена'), h('p', {class:'sub'}, 'Заполните файл config.js по инструкции из README.'));
    return;
  }
  if (!session) return loginScreen();
  $('#new').hidden = false;
  $('#nav').replaceChildren(...NAV.map(([k, name]) =>
    h('button', {'aria-current': view === k ? 'page' : false, onclick:() => { view = k; render(); }}, name)));
  const m = $('#main'); m.replaceChildren();
  if (view === 'all') {
    const act = data.tasks.filter(t => t.status === 'not_started');
    m.append(h('h1', {}, 'Все'), h('p', {class:'sub'}, 'Несданные задания по предметам. Всего: ' + act.length));
    const groups = [...data.subjects].sort(byName).filter(s => act.some(t => t.subject_id === s.id));
    if (!groups.length) m.append(h('div', {class:'empty'}, 'Активных заданий нет.'));
    groups.forEach(s => {
      const list = act.filter(t => t.subject_id === s.id).sort(cmp);
      m.append(h('section', {class:'grp', style:'--c:' + colorVar(s)},
        h('button', {class:'gh', 'aria-expanded': !collapsed[s.id], onclick:() => { collapsed[s.id] = !collapsed[s.id]; render(); }},
          h('i', {class:'ch'}), s.name, h('span', {class:'n'}, list.length)),
        collapsed[s.id] ? null : list.map(t => row(t))));
    });
  } else if (view === 'archive') {
    const list = data.tasks.filter(t => t.status !== 'not_started').sort((a, b) => -cmp(a, b));
    m.append(h('h1', {}, 'Архив'), h('p', {class:'sub'}, 'Сданные и отменённые задания.'));
    m.append(list.length ? h('section', {class:'grp'}, list.map(t => row(t, true))) : h('div', {class:'empty'}, 'Архив пуст.'));
  } else subjectsPage(m);
}

/* ---------- предметы ---------- */
function nameError(v, selfId) {
  if (!v) return 'Введите название предмета.';
  if (data.subjects.some(s => s.id !== selfId && s.name.toLowerCase() === v.toLowerCase())) return 'Предмет с таким названием уже есть.';
  return '';
}
function subjectsPage(m) {
  m.append(h('h1', {}, 'Предметы'), h('p', {class:'sub'}, 'Список предметов можно менять в любой момент.'));
  const inp = h('input', {'aria-label':'Название нового предмета', maxlength:'100', placeholder:'Название предмета'});
  const add = () => {
    const v = inp.value.trim(), e = nameError(v);
    if (e) { subjErr = e; render(); return; }
    data.subjects.push({id:uid(), name:v, color:data.subjects.length % 8}); subjErr = ''; save(); render();
  };
  m.append(h('div', {class:'add'}, inp, h('button', {class:'btn p', onclick:add}, 'Добавить')));
  if (subjErr) m.append(h('div', {class:'err', style:'margin:-8px 0 12px'}, subjErr));
  const box = h('div', {class:'box'});
  [...data.subjects].sort(byName).forEach(s => {
    const total = data.tasks.filter(t => t.subject_id === s.id).length;
    const active = data.tasks.filter(t => t.subject_id === s.id && t.status === 'not_started').length;
    if (editSubj === s.id) {
      const i = h('input', {value:s.name, maxlength:'100', 'aria-label':'Новое название'});
      box.append(h('div', {class:'srow', style:'--c:' + colorVar(s)}, h('div', {class:'nm'}, i),
        h('button', {class:'btn p', onclick:() => {
          const v = i.value.trim(), e = nameError(v, s.id);
          if (e) { subjErr = e; render(); return; }
          s.name = v; editSubj = null; subjErr = ''; save(); render();
        }}, 'Сохранить'),
        h('button', {class:'btn', onclick:() => { editSubj = null; subjErr = ''; render(); }}, 'Отмена')));
    } else {
      box.append(h('div', {class:'srow', style:'--c:' + colorVar(s)},
        h('div', {class:'nm'}, s.name), h('span', {class:'mut'}, 'Активных: ' + active),
        h('button', {class:'btn', onclick:() => { editSubj = s.id; render(); }}, 'Переименовать'),
        h('button', {class:'btn d', onclick:() => {
          if (total) { subjErr = 'Нельзя удалить «' + s.name + '»: у предмета заданий ' + total + '.'; render(); return; }
          data.subjects = data.subjects.filter(x => x.id !== s.id); subjErr = ''; save(); render();
        }}, 'Удалить')));
    }
  });
  m.append(box);
  if (!data.subjects.length) m.append(h('div', {class:'empty'}, 'Предметов пока нет. Добавьте первый.'));
  const file = h('input', {type:'file', accept:'application/json', hidden:true, onchange:importData});
  m.append(h('h2', {style:'font-size:18px;margin:24px 0 8px'}, 'Резервная копия'),
    h('p', {class:'mut', style:'margin-top:0'}, 'Данные синхронизируются между устройствами. Копия в файл нужна на случай, если захотите сохранить данные отдельно.'),
    h('div', {class:'acts', style:'border:0;margin:0;padding:0'},
      h('button', {class:'btn', onclick:exportData}, 'Скачать копию'),
      h('button', {class:'btn', onclick:() => file.click()}, 'Загрузить копию'), file),
    h('h2', {style:'font-size:18px;margin:24px 0 8px'}, 'Аккаунт'),
    h('button', {class:'btn', onclick:logout}, 'Выйти'));
}
function exportData() {
  const a = h('a', {href:URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'})), download:'planner-' + today() + '.json'});
  document.body.append(a); a.click(); a.remove();
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.subjects || !d.tasks) throw 0;
      if (!confirm('Заменить текущие данные данными из файла?')) return;
      data = d; save(); render();
    } catch (x) { alert('Файл не подходит: это не копия планировщика.'); }
  };
  r.readAsText(f);
}

/* ---------- окна ---------- */
function closeModal() { const o = $('.ov'); if (o) o.remove(); }
function modal(content, color) {
  closeModal();
  const ov = h('div', {class:'ov', onclick:e => { if (e.target === ov) closeModal(); }},
    h('div', {class:'pn', role:'dialog', 'aria-modal':'true', style:'--c:' + color}, content));
  document.body.append(ov);
  return ov;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function kv(label, value) { return [h('div', {}, label), h('div', {}, value)]; }

function openCard(id) {
  const t = task(id), s = subj(t.subject_id);
  const sel = h('select', {'aria-label':'Статус', onchange:e => { t.status = e.target.value; t.updated = Date.now(); save(); render(); }},
    Object.entries(ST).map(([k, v]) => h('option', {value:k, selected:k === t.status}, v)));
  const link = t.material_url && /^https?:\/\//i.test(t.material_url)
    ? h('a', {href:t.material_url, target:'_blank', rel:'noopener noreferrer'}, 'Открыть материалы') : null;
  modal([
    h('h1', {}, t.title),
    h('div', {class:'kv'},
      kv('Предмет', s ? s.name : '—'),
      kv('Тип', h('span', {class:'tag', 'data-type':t.type}, TYPES[t.type])),
      kv('Дедлайн', h('span', {class:'dl ' + urgency(t)}, fmt(t.deadline_date, t.deadline_time))),
      t.late_date ? kv('Поздний дедлайн', fmt(t.late_date, t.late_time)) : null,
      kv('Источник', SRC[t.source] || '—'),
      kv('Статус', sel),
      kv('Описание', t.description ? h('div', {class:'desc'}, t.description) : '—'),
      link ? kv('Материалы', link) : null),
    h('div', {class:'acts'},
      h('button', {class:'btn p', onclick:() => openForm(id)}, 'Редактировать'),
      h('button', {class:'btn', onclick:closeModal}, 'Закрыть'))
  ], colorVar(s));
}

function openForm(id) {
  const t = id ? task(id) : {type:'homework', status:'not_started', subject_id:(data.subjects[0] || {}).id};
  const field = (fid, label, el, extra) => h('div', extra || {}, h('label', {for:fid}, label), el, h('div', {class:'err', id:'e-' + fid}));
  const opts = (o, val, blank) => [blank ? h('option', {value:''}, '—') : null,
    Object.entries(o).map(([k, v]) => h('option', {value:k, selected:k === val}, v))];
  const sSel = h('select', {id:'f-subj', onchange:syncLate},
    data.subjects.sort(byName).map(s => h('option', {value:s.id, selected:s.id === t.subject_id}, s.name)));
  const lateBox = h('div', {class:'g2', id:'late'},
    field('f-ld', 'Поздний дедлайн', h('input', {id:'f-ld', type:'date', value:t.late_date || ''})),
    field('f-lt', 'Время', h('input', {id:'f-lt', type:'time', value:t.late_time || ''})));
  function syncLate() { lateBox.hidden = !isEng(sSel.value); }
  const v = x => $('#' + x).value.trim();
  const submit = () => {
    const f = {title:v('f-title'), subject_id:v('f-subj'), type:v('f-type'), deadline_date:v('f-dd'), deadline_time:v('f-dt'),
      late_date:'', late_time:'', source:v('f-src'), description:$('#f-desc').value, material_url:v('f-url')};
    if (isEng(f.subject_id)) { f.late_date = v('f-ld'); f.late_time = v('f-lt'); }
    const E = {};
    if (!f.title) E['f-title'] = 'Введите название.';
    if (!f.subject_id) E['f-subj'] = 'Выберите предмет.';
    if (f.deadline_time && !f.deadline_date) E['f-dt'] = 'Время нельзя указать без даты.';
    if (f.late_date && !f.deadline_date) E['f-ld'] = 'Поздний дедлайн нельзя задать без обычного.';
    else if (f.late_date && f.late_date < f.deadline_date) E['f-ld'] = 'Поздний дедлайн не может быть раньше обычного.';
    if (f.late_time && !f.late_date) E['f-lt'] = 'Время нельзя указать без даты.';
    if (f.description.length > 10000) E['f-desc'] = 'Не более 10 000 символов.';
    if (f.material_url && !/^https?:\/\//i.test(f.material_url)) E['f-url'] = 'Допустимы только адреса http и https.';
    document.querySelectorAll('.err').forEach(e => e.textContent = '');
    Object.entries(E).forEach(([k, m]) => $('#e-' + k).textContent = m);
    if (Object.keys(E).length) return;
    let cur = t;
    if (id) Object.assign(t, f, {updated:Date.now()});
    else { cur = {id:uid(), ...f, status:'not_started', created:Date.now()}; data.tasks.push(cur); }
    save(); render(); openCard(cur.id);
  };
  modal([
    h('h1', {}, id ? 'Редактирование' : 'Новое задание'),
    field('f-title', 'Название', h('input', {id:'f-title', maxlength:'200', value:t.title || ''})),
    h('div', {class:'g2'}, field('f-subj', 'Предмет', sSel), field('f-type', 'Тип', h('select', {id:'f-type'}, opts(TYPES, t.type)))),
    h('div', {class:'g2'},
      field('f-dd', 'Дедлайн', h('input', {id:'f-dd', type:'date', value:t.deadline_date || ''})),
      field('f-dt', 'Время', h('input', {id:'f-dt', type:'time', value:t.deadline_time || ''}))),
    lateBox,
    field('f-src', 'Источник', h('select', {id:'f-src'}, opts(SRC, t.source, true))),
    field('f-desc', 'Описание', h('textarea', {id:'f-desc', maxlength:'10000'}, t.description || '')),
    field('f-url', 'Материалы: ссылка', h('input', {id:'f-url', type:'url', placeholder:'https://', value:t.material_url || ''})),
    h('div', {class:'acts'},
      h('button', {class:'btn p', onclick:submit}, 'Сохранить'),
      h('button', {class:'btn', onclick:() => id ? openCard(id) : closeModal()}, 'Отмена'),
      id ? h('button', {class:'btn d', onclick:() => {
        if (!confirm('Удалить задание «' + t.title + '»? Это нельзя отменить.')) return;
        data.tasks = data.tasks.filter(x => x.id !== id); save(); render(); closeModal();
      }}, 'Удалить') : null)
  ], colorVar(subj(t.subject_id)));
  syncLate();
  $('#f-title').focus();
}

/* ---------- синхронизация (Supabase) ---------- */
let session = JSON.parse(localStorage.getItem(AUTH) || 'null'), pushTimer = null;
const setSync = t => { $('#sync').textContent = t; };
function setSession(j) {
  session = {access_token:j.access_token, refresh_token:j.refresh_token, user_id:j.user.id};
  localStorage.setItem(AUTH, JSON.stringify(session));
}
async function refresh() {
  try {
    const r = await fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', {method:'POST',
      headers:{apikey:CFG.key, 'Content-Type':'application/json'}, body:JSON.stringify({refresh_token:session.refresh_token})});
    if (!r.ok) return false;
    setSession(await r.json()); return true;
  } catch (e) { return false; }
}
async function api(path, opts = {}, retry = true) {
  const r = await fetch(CFG.url + path, {...opts, headers:{apikey:CFG.key, 'Content-Type':'application/json',
    Authorization:'Bearer ' + session.access_token, ...(opts.headers || {})}});
  if (r.status === 401 && retry) {
    if (await refresh()) return api(path, opts, false);
    logout(); throw new Error('auth');
  }
  if (!r.ok) throw new Error(await r.text());
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}
async function push() {
  clearTimeout(pushTimer);
  if (!session) return;
  setSync('Сохранение…');
  try {
    await api('/rest/v1/planner?on_conflict=user_id', {method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({user_id:session.user_id, data, updated_at:new Date().toISOString()})});
    localStorage.removeItem(DIRTY); setSync('Синхронизировано');
  } catch (e) { if (session) setSync('Нет связи: изменения сохранены на устройстве и отправятся позже'); }
}
function schedulePush() {
  if (!session) return;
  setSync('Сохранение…'); clearTimeout(pushTimer); pushTimer = setTimeout(push, 600);
}
async function pull() {
  const rows = await api('/rest/v1/planner?select=data&user_id=eq.' + session.user_id);
  if (rows.length && rows[0].data && rows[0].data.subjects && rows[0].data.tasks) {
    data = rows[0].data; localStorage.setItem(KEY, JSON.stringify(data)); setSync('Синхронизировано');
  } else await push();
}
function logout() {
  session = null; localStorage.removeItem(AUTH);
  if (!localStorage.getItem(DIRTY)) localStorage.removeItem(KEY);
  setSync(''); data = load(); render();
}
async function boot() {
  render();
  if (!session) return;
  try {
    if (localStorage.getItem(DIRTY)) await push(); else await pull();
    render();
  } catch (e) { if (session) setSync('Нет связи: показаны данные с этого устройства'); }
}
function refreshFromServer() {
  if (!session || document.hidden || localStorage.getItem(DIRTY) || $('.ov')) return;
  pull().then(render).catch(() => {});
}
document.addEventListener('visibilitychange', refreshFromServer);
window.addEventListener('focus', refreshFromServer);

function loginScreen() {
  $('#nav').replaceChildren(); $('#new').hidden = true; setSync('');
  const em = h('input', {type:'email', id:'em', autocomplete:'username'});
  const pw = h('input', {type:'password', id:'pw', autocomplete:'current-password'});
  const err = h('div', {class:'err'});
  const go = async () => {
    err.textContent = '';
    try {
      const r = await fetch(CFG.url + '/auth/v1/token?grant_type=password', {method:'POST',
        headers:{apikey:CFG.key, 'Content-Type':'application/json'}, body:JSON.stringify({email:em.value.trim(), password:pw.value})});
      if (!r.ok) { err.textContent = 'Неверная почта или пароль.'; return; }
      setSession(await r.json()); boot();
    } catch (e) { err.textContent = 'Нет связи с сервером. Проверьте интернет и повторите.'; }
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  $('#main').replaceChildren(h('div', {style:'max-width:360px;margin:6vh auto 0'},
    h('h1', {}, 'Вход'), h('p', {class:'sub'}, 'Войдите, чтобы увидеть свои задания.'),
    h('label', {for:'em'}, 'Почта'), em, h('label', {for:'pw'}, 'Пароль'), pw, err,
    h('div', {class:'acts', style:'border:0;padding:0'}, h('button', {class:'btn p', onclick:go}, 'Войти'))));
}

$('#new').onclick = () => openForm();
boot();
