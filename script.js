// ************ CONFIG ************
var GAS_URL = 'https://script.google.com/macros/s/AKfycbx2AC_cNpPndM772BH_DFG90Vzv8-Ahtp5PYjH0rOkcnwSWzYog0NLZU3Xa8c97tyJRKw/exec';

// 1) Fallback si pas d'id dans l'URL
var SHEET_TAB = 'Journal';

// 2) (Optionnel) Mapping id -> nom d'onglet (si tu veux décorréler)
var CLIENT_SHEETS = {
  // 'alban': 'ALBAN',
  // 'marvin': 'MARVIN',
  // 'christophe': 'CHRISTOPHE',
};

// 3) Lecture de l'id dans l'URL (ou depuis localStorage) et choix de la feuille
(function initClient(){
  try{
    const params = new URLSearchParams(location.search);
    const idRaw = params.get('id') || localStorage.getItem('client_id') || '';
    const id = (idRaw || '').trim();

    if (id){
      const key = id.toLowerCase();
      // Multi-clients = 1 fichier par client, onglet identique "Journal":
      SHEET_TAB = CLIENT_SHEETS[key] || SHEET_TAB; // on garde "Journal" par défaut
      localStorage.setItem('client_id', id);
    }

    window.__CLIENT_ID__ = id || '(par défaut)';
    const tag = document.getElementById('clientTag');
    if (tag) tag.textContent = window.__CLIENT_ID__;
  }catch(e){
    console.warn('initClient error', e);
  }
})();

var DURATION_AS_TIME_FRACTION = false; // false => "HH:MM", true => fraction de jour (format [h]:mm côté Sheet)
// ********************************


// Questions
var QUESTIONS = [
  { col: 'E', label: "Poids (kg) ?", type: "number", step: "0.1", validate: v => v !== '' },
  { col: 'F', label: "Sommeil (note sur 5)", type: "select", options:["1","2","3","4","5"], validate: v => ["1","2","3","4","5"].includes(v) },
  { col: 'G', label: "Heure du coucher ?", type: "time", step:"60", validate: isHHMM },
  { col: 'H', label: "Heure du lever ?",   type: "time", step:"60", validate: isHHMM },
  { col: 'J', label: "Énergie (note sur 5)", type: "select", options:["1","2","3","4","5"], validate: v => ["1","2","3","4","5"].includes(v) },
  { col: 'K', label: "Adhésion (note sur 5)", type: "select", options:["1","2","3","4","5"], validate: v => ["1","2","3","4","5"].includes(v) },
  { col: 'L', label: "Nutrition non trackée (texte libre)", type: "text", validate: v => v !== '' },
  { col: 'M', label: "Digestion (note sur 5)", type: "select", options:["1","2","3","4","5"], validate: v => ["1","2","3","4","5"].includes(v) },
  { col: 'N', label: "Séance", type: "select", options:["BOF","MOYEN","BIEN","SUPER","REPOS"], validate: v => ["BOF","MOYEN","BIEN","SUPER","REPOS"].includes(v) },
  { col: 'O', label: "Nombre de pas (steps)", type: "number", step:"1", min:"0", validate: v => String(v) !== '' },
  { col: 'P', label: "Cardio (durée min)", type: "number", step:"1", min:"0", validate: v => String(v) !== '' }
];

var state = { date:null, idx:0, currentInputEl:null, answers:{} };

// ---------- helpers ----------
const $ = s => document.querySelector(s);
function todayFR(){
  const d = new Date();
  return String(d.getDate()).padStart(2,'0') + '/'
       + String(d.getMonth()+1).padStart(2,'0') + '/'
       + d.getFullYear();
}
function refreshDateBadge(){
  const el = document.getElementById('todayDisplay');
  if (el) el.textContent = 'Date : ' + todayFR();
}
function isHHMM(v){ return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||'').trim()); }
function between(v,a,b){ const n=Number(v); return !Number.isNaN(n)&&n>=a&&n<=b; }
function toMinutes(hhmm){ const [h,m]=String(hhmm).split(':'); return (Number(h||0)*60+Number(m||0)); }
function diffMinutes(coucher,lever){ const g=toMinutes(coucher),h=toMinutes(lever); return (h-g+1440)%1440; }
function fmtHHMM(mins){ const H=String(Math.floor(mins/60)).padStart(2,'0'); const M=String(mins%60).padStart(2,'0'); return H+':'+M; }
function logDiag(msg, ok){ const d=$('#diag'); if(!d) return; d.textContent=msg; d.className=ok?'ok':'err'; }

// ---------- tabs ----------
function switchTab(targetId, btn){
  document.querySelector('.tab-btn.active')?.classList.remove('active');
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(targetId)?.classList.add('active');
}
window.switchTab = switchTab;

// ---------- UI ----------
function buildInput(q){
  let el;
  if (q.type==='select'){
    el=document.createElement('select');
    (q.options||[]).forEach(o=>{
      const opt=document.createElement('option');
      opt.value=o; opt.textContent=o;
      el.appendChild(opt);
    });
  } else {
    el=document.createElement('input');
    el.type=q.type||'text';
    if (q.step) el.step=q.step;
    if (q.min) el.min=q.min;
    if (q.max) el.max=q.max;
    if (q.type==='time') el.placeholder='HH:MM';
  }
  el.id='answerInput';
  el.autocomplete='off';
  el.required=true;
  return el;
}

// ---------- Flow ----------
function startQA(){
  state.date = todayFR();
  state.idx = 0;
  state.answers = {};

  $('#startPanel').classList.add('hidden');
  $('#qaPanel').classList.remove('hidden');
  $('#donePanel').classList.add('hidden');

  // montrer Valider dès le début du Q&A
  const btn = document.getElementById('submitAnswer');
  if (btn) btn.style.display = 'block';

  refreshDateBadge();
  showQuestion();
}
window.startQA = startQA;

function showQuestion(){
  if (state.idx >= QUESTIONS.length){ return finishAndSend(); }

  const q = QUESTIONS[state.idx];
  document.getElementById('questionText').textContent =
    `${state.idx+1}/${QUESTIONS.length} · ${q.label}`;

  const slot = document.getElementById('inputSlot');
  slot.innerHTML = '';
  const input = buildInput(q);
  slot.appendChild(input);
  input.focus();

  document.getElementById('progress').textContent =
    `Question ${state.idx+1} sur ${QUESTIONS.length}`;

  state.currentInputEl = input;

  const btn = document.getElementById('submitAnswer');
  if (btn) btn.style.display = 'block';
}

function submitAnswer(){
  const q = QUESTIONS[state.idx];
  const input = document.getElementById('answerInput');
  const val = input ? input.value.trim() : '';

  if (typeof q.validate === 'function' && !q.validate(val)){
    alert('Valeur invalide. Merci de respecter le format.');
    if (input) input.focus();
    return;
  }

  state.answers[q.col] = val;

  // si G et H présents -> calcule I (durée)
  if (state.answers['G'] && state.answers['H']){
    const mins = diffMinutes(state.answers['G'], state.answers['H']);
    state.answers['I'] = DURATION_AS_TIME_FRACTION ? (mins/1440) : fmtHHMM(mins);
  }

  state.idx += 1;
  showQuestion();
}
window.submitAnswer = submitAnswer;

function finishAndSend(){
  $('#qaPanel').classList.add('hidden');
  $('#donePanel').classList.remove('hidden');

  const btn = document.getElementById('submitAnswer');
  if (btn) btn.style.display = 'none';

  const bulk = Object.keys(state.answers).map(col => ({ col, value: state.answers[col] }));
  sendBulk({ date: state.date, sheet: SHEET_TAB, bulk }, err=>{
    if (err) alert('Envoi au Google Sheet : ' + err);
  });
}

// ---------- réseau ----------
function sendBulk(payload, cb){
  const clientId = (window.__CLIENT_ID__ || '').trim();

  const params =
    'bulk=' + encodeURIComponent(JSON.stringify(payload.bulk)) +
    '&date=' + encodeURIComponent(payload.date) +
    (payload.sheet ? '&sheet=' + encodeURIComponent(payload.sheet) : '') +
    (clientId ? '&id=' + encodeURIComponent(clientId) : '');

  const xhr = new XMLHttpRequest();
  xhr.open('POST', GAS_URL, true);
  xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded;charset=UTF-8');
  xhr.onreadystatechange = function(){
    if (xhr.readyState!==4) return;
    if (xhr.status>=200 && xhr.status<300){
      try{
        const d=JSON.parse(xhr.responseText);
        if(d&&d.ok) return cb(null);
        return cb(d.error||'Réponse Apps Script invalide');
      } catch(e){
        return cb('JSON parse error: '+e.message);
      }
    }
    if (xhr.status===0){
      const url = GAS_URL + '?action=bulk'
        + '&date=' + encodeURIComponent(payload.date)
        + (payload.sheet ? '&sheet=' + encodeURIComponent(payload.sheet) : '')
        + (clientId ? '&id=' + encodeURIComponent(clientId) : '')
        + '&bulk=' + encodeURIComponent(JSON.stringify(payload.bulk));
      const x=new XMLHttpRequest();
      x.open('GET', url, true);
      x.onreadystatechange=function(){
        if (x.readyState!==4) return;
        if (x.status>=200 && x.status<300){
          try{
            const d=JSON.parse(x.responseText);
            if(d&&d.ok) return cb(null);
            return cb(d.error||'Réponse Apps Script invalide (GET)');
          } catch(e){
            return cb('JSON parse error (GET): '+e.message);
          }
        }
        return cb('HTTP '+x.status+' — '+(x.responseText||''));
      };
      x.send(null);
      return;
    }
    return cb('HTTP '+xhr.status+' — '+(xhr.responseText||''));
  };
  xhr.send(params);
}


// ---------- ping ----------
function pingScript(){
  const out=$('#pingResult'); out.textContent='Ping...';
  const xhr=new XMLHttpRequest(); xhr.open('GET', GAS_URL, true);
  xhr.onreadystatechange=function(){
    if (xhr.readyState!==4) return;
    if (xhr.status>=200 && xhr.status<300){
      try{ out.textContent=JSON.stringify(JSON.parse(xhr.responseText),null,2); }
      catch(e){ out.textContent=xhr.responseText; }
      logDiag('Ping OK', true);
    } else {
      out.textContent='Erreur HTTP '+xhr.status+' — '+(xhr.responseText||'');
      logDiag('Ping KO', false);
    }
  };
  xhr.send(null);
}
window.pingScript = pingScript;

// ---------- init ----------
logDiag('JS chargé', true);
document.addEventListener('DOMContentLoaded', refreshDateBadge);

// ───────── Sous-onglets onglet 2 ─────────
function openTab2View(name){
  // Masquer le menu et les vues
  document.getElementById('tab2-menu')?.classList.add('hidden');
  document.getElementById('tab2-sleep')?.classList.add('hidden');
  document.getElementById('tab2-weight')?.classList.add('hidden');

  // Afficher la vue demandée
  const target = document.getElementById('tab2-' + name);
  if (target) target.classList.remove('hidden');

  // Lazy-load : ne charge le graphe que quand la vue est ouverte
  if (name === 'sleep')  loadSleepChart();
  if (name === 'weight') loadWeightChart();
}

function backFromTab2(){
  document.getElementById('tab2-menu')?.classList.remove('hidden');
  document.getElementById('tab2-sleep')?.classList.add('hidden');
  document.getElementById('tab2-weight')?.classList.add('hidden');
}

// ───────── Graphique poids ─────────
let weightChart = null;

async function loadWeightChart(){
  try{
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const url = GAS_URL + '?action=weights'
      + (SHEET_TAB ? ('&sheet=' + encodeURIComponent(SHEET_TAB)) : '')
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');
    const res = await fetch(url);
    let data = [];
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data)) data = json.data;
    }
    renderWeightChart(data);
  }catch(err){
    console.error('loadWeightChart error:', err);
    renderWeightChart([]);
  }
}


function renderWeightChart(points){
  const badge  = document.getElementById('lastWeightBadge');
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // aucune donnée -> badge vide + canvas nettoyé
  if (!points || !points.length){
    if (badge) badge.textContent = '—';
    if (weightChart){ weightChart.destroy(); weightChart = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.weight));

  if (badge){
    const last = values[values.length - 1];
    badge.textContent = `${last.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`;
  }

  if (weightChart) weightChart.destroy();
  weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 4,
        borderColor: '#4da6ff',
        pointBackgroundColor: '#52e0c8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: v => v.toLocaleString('fr-FR') },
          grid: { color: 'rgba(0,0,0,.08)' }
        }
      }
    }
  });
}

// ───────── Graphique sommeil (durée en heures) ─────────
let sleepChart = null;

function hoursToLabel(h){
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${String(mm).padStart(2,'0')}`;
}

async function loadSleepChart(){
  try{
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const url = GAS_URL + '?action=sleep'
      + (SHEET_TAB ? ('&sheet=' + encodeURIComponent(SHEET_TAB)) : '')
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');
    const res = await fetch(url);
    let data = [];
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data)) data = json.data;
    }
    renderSleepChart(data);
  }catch(err){
    console.error('loadSleepChart error:', err);
    renderSleepChart([]);
  }
}


function renderSleepChart(points){
  const badge  = document.getElementById('lastSleepBadge');
  const canvas = document.getElementById('sleepChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (!points || !points.length){
    if (badge) badge.textContent = '—';
    if (sleepChart){ sleepChart.destroy(); sleepChart = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.sleep)); // heures décimales

  if (badge){
    const last = values[values.length - 1];
    badge.textContent = hoursToLabel(last);
  }

  if (sleepChart) sleepChart.destroy();
  sleepChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 4,
        borderColor: '#8b5cf6',
        pointBackgroundColor: '#a78bfa'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: v => hoursToLabel(v) },
          grid: { color: 'rgba(0,0,0,.08)' }
        }
      }
    }
  });
}

// ───────── Graphique pas (barres) ─────────
let stepsChart = null;

async function loadStepsChart(){
  try{
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const url = GAS_URL + '?action=steps'
      + (SHEET_TAB ? ('&sheet=' + encodeURIComponent(SHEET_TAB)) : '')
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');
    const res = await fetch(url);
    let data = [];
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data)) data = json.data;
    }
    renderStepsChart(data);
  }catch(err){
    console.error('loadStepsChart error:', err);
    renderStepsChart([]);
  }
}

function renderStepsChart(points){
  const badge  = document.getElementById('lastStepsBadge');
  const canvas = document.getElementById('stepsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // aucune donnée -> badge vide + canvas nettoyé
  if (!points || !points.length){
    if (badge) badge.textContent = '—';
    if (stepsChart){ stepsChart.destroy(); stepsChart = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.steps || 0));

  if (badge){
    const last = values[values.length - 1];
    badge.textContent = `${last.toLocaleString('fr-FR')} pas`;
  }

  if (stepsChart) stepsChart.destroy();
  stepsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 0,
        barPercentage: 0.8,
        categoryPercentage: 0.8,
        backgroundColor: '#10b981' // vert doux; on peut ajuster si tu veux
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: v => v.toLocaleString('fr-FR') },
          grid: { color: 'rgba(0,0,0,.08)' }
        }
      }
    }
  });
}

// Helper manquant : échappe le HTML pour l'affichage sécurisé
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// ---------- helper pour Nutrition : normaliser les entêtes ----------
window.normalizeHeaders = window.normalizeHeaders || function(headers){
  // ex: "Portion (g)" -> "portion_g"
  return (headers || []).map(h => {
    if (!h) return "";
    return String(h)
      .trim()
      .toLowerCase()
      .replace(/[()]/g, "")     // enlève parenthèses
      .replace(/\s+/g, "_");    // espaces -> _
  });
};


// ───────── Nutrition : chargement + rendu par repas (cartes) ─────────
let nutrLoaded = false;

async function loadNutrition(){
  const box  = document.getElementById('nutriContent');
  const meta = document.getElementById('nutriMeta');
  if (!box) return;
  box.innerHTML = '<p class="note">Chargement…</p>';

  try{
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const nutrTab  = 'Nutrition';

    const url = GAS_URL + '?action=nutrition'
      + '&nsheet=' + encodeURIComponent(nutrTab)
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Réponse Apps Script invalide');

    const { headers, rows } = json;

    // helpers
    const headersNorm = normalizeHeaders(headers);
    const stripAcc = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const headersAscii = headersNorm.map(stripAcc);
    const idx = {
      alim: headersAscii.indexOf('aliments'),
      portion: headersAscii.findIndex(h => h.startsWith('portion')),
      kcal: headersAscii.indexOf('calories'),
      pro: headersAscii.indexOf('proteines'),
      glu: headersAscii.indexOf('glucides'),
      lip: headersAscii.indexOf('lipides')
    };
    const toNum = v => {
      const n = Number(String(v??'').replace(',', '.').trim());
      return Number.isFinite(n) ? n : NaN;
    };
    const fmt = n => Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—';

    // 1) parser lignes -> repas + objectifs
    const meals = [];
    let current = { items: [], total: null };
    let mealIndex = 1;
    let objectives = null;

    const hasWord = (row, word) =>
      row.some(c => String(c||'').toUpperCase().includes(word.toUpperCase()));

    for (let i = 0; i < rows.length; i++){
      const r = rows[i] || [];

      // fin des repas : bloc OBJECTIF
      if (hasWord(r, 'OBJECTIF')){
        // format observé : ligne "OBJECTIF", ligne labels, ligne valeurs
        const vals = rows[i+2] || [];
        objectives = {
          kcal: toNum(vals[idx.kcal]),
          pro:  toNum(vals[idx.pro]),
          glu:  toNum(vals[idx.glu]),
          lip:  toNum(vals[idx.lip]),
        };
        break;
      }

      const a = String(r[idx.alim] || '').trim();
      // ligne Total => clôt le repas
      if (a.toLowerCase() === 'total'){
        const tot = {
          kcal: toNum(r[idx.kcal]),
          pro:  toNum(r[idx.pro]),
          glu:  toNum(r[idx.glu]),
          lip:  toNum(r[idx.lip]),
        };
        const hasItems = current.items.length > 0;
        // on n'ajoute que si repas non vide
        if (hasItems){
          current.total = tot;
          current.name  = `Repas ${mealIndex}`;
          meals.push(current);
          mealIndex += 1;
        }
        current = { items: [], total: null };
        continue;
      }

      // ligne aliment (non vide et pas "Total")
      if (a && a.toLowerCase() !== 'total'){
        current.items.push({
          name: a,
          portion: toNum(r[idx.portion]),
          kcal: toNum(r[idx.kcal]),
          pro:  toNum(r[idx.pro]),
          glu:  toNum(r[idx.glu]),
          lip:  toNum(r[idx.lip]),
        });
      }
    }

    // 2) rendu HTML
    let html = '';
    if (meals.length === 0 && !objectives){
      html = '<p class="note">Aucun repas défini pour le moment.</p>';
    } else {
      meals.forEach(m => {
        html += `
          <div class="meal-card">
            <div class="meal-header">
              <h3>${escapeHtml(m.name)}</h3>
            </div>

            <div class="meal-body">
              ${m.items.map(it => `
                <div class="meal-row">
                  <div class="food">
                    <div class="food-name">${escapeHtml(it.name)}</div>
                    <div class="food-portion">${Number.isFinite(it.portion) ? fmt(it.portion) : '—'} g</div>
                  </div>
                  <div class="macros">
                    <span class="mc-kcal">${fmt(it.kcal)} kcal</span>
                    <span class="mc-pro">${fmt(it.pro)}P</span>
                    <span class="mc-glu">${fmt(it.glu)}G</span>
                    <span class="mc-lip">${fmt(it.lip)}L</span>
                  </div>
                </div>`).join('')}
            </div>

            ${m.total ? `
              <div class="meal-total below">
                <span class="pill">
                  ⚡ ${fmt(m.total.kcal)}<br><small>kcal</small>
                </span>
                <span class="pill">
                  🥩 ${fmt(m.total.pro)}<br><small>P</small>
                </span>
                <span class="pill">
                  🍞 ${fmt(m.total.glu)}<br><small>G</small>
                </span>
                <span class="pill">
                  🧈 ${fmt(m.total.lip)}<br><small>L</small>
                </span>
              </div>` : ''
            }

          </div>`;
      });

      if (objectives){
        html += `
          <div class="meal-card objectives">
            <div class="meal-header">
              <h3>🎯 Objectifs quotidiens</h3>
            </div>
            <div class="obj-grid">
              <div class="obj"><div class="lbl">Calories</div><div class="val">${fmt(objectives.kcal)}</div></div>
              <div class="obj"><div class="lbl">Protéines</div><div class="val">${fmt(objectives.pro)} g</div></div>
              <div class="obj"><div class="lbl">Glucides</div><div class="val">${fmt(objectives.glu)} g</div></div>
              <div class="obj"><div class="lbl">Lipides</div><div class="val">${fmt(objectives.lip)} g</div></div>
            </div>
          </div>`;
      }
    }


    box.innerHTML = html;
    if (meta) meta.textContent = `Nutrition · ${rows?.length || 0} lignes`;
    nutrLoaded = true;

  }catch(err){
    console.error('loadNutrition error:', err);
    box.innerHTML = `<p class="err">Erreur nutrition : ${String(err.message || err)}</p>`;
  }
}




// ───────── Navigation + lazy-load des graphes (sous-pages de l’onglet 2) ─────────
(function(){
  const baseSwitch = window.switchTab || function(targetId, btn){
    document.querySelector('.tab-btn.active')?.classList.remove('active');
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.getElementById(targetId)?.classList.add('active');
  };

  window.switchTab = function(targetId, btn){
    baseSwitch(targetId, btn);
    if (targetId === 'tab2-weight') loadWeightChart();
    if (targetId === 'tab2-sleep')  loadSleepChart();
    if (targetId === 'tab2-steps')  loadStepsChart();
    if (targetId === 'tab2-nutrition')  loadNutrition();
    // Sur 'tab2' (menu), on ne charge rien.
  };
})();


// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(reg => console.log("✅ Service Worker enregistré :", reg))
      .catch(err => console.error("❌ Service Worker erreur :", err));
  });
}
