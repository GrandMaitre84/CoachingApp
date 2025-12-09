// ─────────🔊 AUDIO GLOBAL (Web Audio) ─────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ⚠️ Débloquer l'audio au premier tap sur mobile
document.addEventListener('touchstart', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}, { once: true });

document.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}, { once: true });

// Fichiers son (dossier "sounds")
const SFX_FILES = {
  click:     'sounds/click.mp3',
  clickTab:  'sounds/click-tab.mp3'
};

const sfxBuffers = {};

// Charge un son en mémoire
async function loadSfx(name, url) {
  try {
    const resp = await fetch(url);
    const buf  = await resp.arrayBuffer();
    sfxBuffers[name] = await audioCtx.decodeAudioData(buf);
  } catch (e) {
    console.warn(`Erreur chargement SFX "${name}" :`, e);
  }
}

// Préchargement
Promise.all(
  Object.entries(SFX_FILES).map(([n, u]) => loadSfx(n, u))
);

// Joue un son par son nom
function playSfx(name) {
  const buf = sfxBuffers[name];
  if (!buf) return; // pas encore chargé
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start(0);
}

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

// 🔗 Mapping ID client -> URL du Google Sheet (programme training)
const TRAINING_SHEETS = {
  test:  "https://docs.google.com/spreadsheets/d/1ILwT2oiQkTL17HgCDvK_LyCqQ720TO5RQzhpKaanzBk/edit?gid=1782220140#gid=1782220140",
  zrzka: "https://docs.google.com/spreadsheets/d/1UlRO3GuZB8MzA1J9bC06lZk4ifWgeMpHazbnk7JGhuY/edit?gid=1782220140#gid=1782220140"
};




// 3) Lecture de l'id dans l'URL OU depuis localStorage (+ fallback PWA)
(function initClient() {
  try {
    const params   = new URLSearchParams(location.search);
    const urlIdRaw = params.get('id') || '';
    const urlId    = (urlIdRaw || '').trim();

    // 1) On commence par l'id dans l'URL
    let id = urlId;

    // 2) Sinon on tente ce qu'on a déjà en localStorage
    if (!id) {
      const stored = localStorage.getItem('client_id') || '';
      id = stored.trim();
    }

    // 3) ⚠️ Cas PWA : start_url = ?source=pwa → jamais d'id dans l'URL
    //    Si on est dans ce mode et qu'on ne connaît pas encore le client,
    //    on affichera l'écran de connexion (loginBox) plus tard.
    if (!id && location.search.includes('source=pwa')) {
      window.__NEED_LOGIN__ = true;
    }


    // 4) Finalisation
    if (id) {
      const key = id.toLowerCase();
      SHEET_TAB = CLIENT_SHEETS[key] || SHEET_TAB;

      window.__CLIENT_ID__ = id;
      localStorage.setItem('client_id', id);
    } else {
      window.__CLIENT_ID__ = '(par défaut)';
    }

    // Badge visuel dans l'UI
    const tag = document.getElementById('clientTag');
    if (tag) tag.textContent = window.__CLIENT_ID__;

    // Debug visible
    const dbg = document.getElementById('debugClient');
    if (dbg) {
      dbg.textContent =
        `client_id = "${window.__CLIENT_ID__}", search = "${location.search}"`;
    }

  } catch (e) {
    console.warn('initClient error', e);
  }
})();





var DURATION_AS_TIME_FRACTION = false; // false => "HH:MM", true => fraction de jour (format [h]:mm côté Sheet)
// ********************************

// ───────── PROFIL : chargement des données depuis Apps Script ─────────

function formatProfileDateFR(raw) {
  if (!raw) return '—';

  // Si c'est déjà au format JJ/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(raw))) {
    return String(raw);
  }

  // Si c'est un ISO genre "2025-11-14T23:00:00.000Z"
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (e) {
    return String(raw);
  }
}

async function loadProfileData() {
  try {
    const clientId = (window.__CLIENT_ID__ || '').trim();
    let url = GAS_URL + '?action=profile';
    if (clientId) url += '&id=' + encodeURIComponent(clientId);

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Réponse Apps Script invalide');

    const p = json.data || {};

    // 🔹 On récupère les éléments du DOM
    const nameEl   = document.getElementById('profileNameBadge');

    const ageEl    =
      document.getElementById('profileAgeValue') ||
      document.getElementById('profileAge');

    const startEl  =
      document.getElementById('profileStartDateValue') ||
      document.getElementById('profileStartDate');

    const scoreEl  =
      document.getElementById('profileHealthScoreValue') ||
      document.getElementById('profileHealthScore') ||
      document.getElementById('profileScore');

    const ptsTextEl =
      document.getElementById('profileHealthPoints') ||
      document.getElementById('profilePoints');

    const barEl = document.getElementById('healthBar');

    // 🔹 Remplissage basique (nom, âge, début coaching)
    if (nameEl)  nameEl.textContent  = p.name || '—';

    if (ageEl) {
      const rawAge = (p.age ?? '').toString().trim();
      ageEl.textContent = rawAge === '' ? '—' : rawAge;
    }

    if (startEl) {
      startEl.textContent = formatProfileDateFR(p.startDate);
    }


    // 🔹 Puis on va chercher le total de points santé côté Apps Script
    await loadProfileHealthPoints(scoreEl, ptsTextEl, barEl);


  } catch (err) {
    console.error('loadProfileData error:', err);
    const badge = document.getElementById('profileNameBadge');
    if (badge) badge.textContent = 'Erreur profil';
  }
}





async function loadProfileStepsTotal() {
  try {
    const clientId = (window.__CLIENT_ID__ || '').trim();

    // même endpoint que ton test :
    // https://.../exec?action=steps_total&id=test
    let url = GAS_URL + '?action=steps_total';
    if (clientId) url += '&id=' + encodeURIComponent(clientId);

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Réponse Apps Script invalide');

    // totalSteps vient directement du Apps Script
    const total = Number(json.totalSteps || 0);

    const stepsEl = document.getElementById('profileStepsTotal');
    const distEl  = document.getElementById('profileDistanceKm');

    // 👉 Affichage des steps
    if (stepsEl) {
      stepsEl.textContent = total.toLocaleString('fr-FR');
    }

    // 👉 Conversion en km (0,8 m par pas → 0,0008 km)
    if (distEl) {
      if (total > 0) {
        const km = total * 0.000635; // 0.635 m par pas (calibré sur données iPhone)
        distEl.textContent = km.toFixed(1).replace('.', ',') + ' km';
      } else {
        distEl.textContent = '0 km';
      }
    }

  } catch (err) {
    console.error('loadProfileStepsTotal error:', err);
    const distEl = document.getElementById('profileDistanceKm');
    if (distEl) distEl.textContent = '—';
  }
}

async function loadProfileHealthPoints(scoreEl, ptsTextEl, barEl) {
  try {
    const clientId = (window.__CLIENT_ID__ || '').trim();

    // ✅ nouveau endpoint unifié
    let url = GAS_URL + '?action=healthpoints';
    if (clientId) url += '&id=' + encodeURIComponent(clientId);

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const json = await res.json();
    console.log('healthPoints JSON = ', json);  // debug

    if (!json.ok) throw new Error(json.error || 'Réponse Apps Script invalide');

    // 🧮 Total points = base (journal) + bonus TODO list
    const totalNum = Number(json.totalHealthPoints ?? json.total ?? 0);
    if (!Number.isFinite(totalNum)) {
      console.warn('totalHealthPoints invalide :', json.totalHealthPoints);
      return;
    }

    // Pour debug : détail des sources
    console.log(
      'HP calculés => base =', json.basePoints,
      'todoBonus =', json.todoBonus,
      'total =', totalNum
    );

    // 🔢 Score santé = total // 100
    const level = Math.floor(totalNum / 100);

    // 🎯 Points santé = reste (0–99)
    const remainder = totalNum % 100;

    if (scoreEl) {
      scoreEl.textContent = String(level);
    }

    if (ptsTextEl) {
      ptsTextEl.textContent = `${remainder} / 100`;
    }

    if (barEl) {
      const pct = Math.max(0, Math.min(100, remainder));
      barEl.style.width = pct + '%';
    }

  } catch (err) {
    console.error('loadProfileHealthPoints error:', err);
    // On laisse les anciennes valeurs si erreur
  }
}









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
  { col: 'O', label: "Nombre de pas (steps)", type: "number", step:"1", min:"0", validate: v => String(v) !== '' }
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

function yesterdayFR() {
  const d = new Date();
  d.setDate(d.getDate() - 1); // hier
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

function openDailyCheckin() {
  const stored = localStorage.getItem('bilan_done');
  const today  = todayFR(); // ←✔️ OBLIGATOIRE

  // 🔒 1) Vérifier si le bilan a déjà été fait aujourd’hui
  if (stored === today) {
    alert("Le bilan du jour a déjà été complété.");

    const btn = document.getElementById('bilanBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('disabled');
    }
    return;
  }

  // 🔓 2) Sinon : ouverture normale du bilan
  document.getElementById('bilanPanel')?.classList.add('hidden');
  document.getElementById('startPanel')?.classList.remove('hidden');

  // 🎬 Animation douce du panneau de démarrage
  animatePanel('startPanel');

  // 👇 On masque aussi le dashboard d’hier pendant le bilan
  document.getElementById('yesterdaySummary')?.classList.add('hidden');
}



function backToHome() {
  // Réaffiche le panneau BILAN
  document.getElementById('bilanPanel')?.classList.remove('hidden');

  // Cache tous les panneaux du flow bilan
  document.getElementById('startPanel')?.classList.add('hidden');
  document.getElementById('qaPanel')?.classList.add('hidden');
  document.getElementById('donePanel')?.classList.add('hidden');

  // 🔙 On cache aussi le bouton "modifier la réponse précédente"
  const backBtn = document.getElementById('goBackAnswer');
  if (backBtn) backBtn.style.display = 'none';

  // On ré-affiche la carte "Résumé d’hier"
  document.getElementById('yesterdaySummary')?.classList.remove('hidden');
}




function openProfile() {
  // On cache tous les panneaux liés au bilan / accueil
  document.getElementById('bilanPanel')?.classList.add('hidden');
  document.getElementById('startPanel')?.classList.add('hidden');
  document.getElementById('qaPanel')?.classList.add('hidden');
  document.getElementById('donePanel')?.classList.add('hidden');
  document.getElementById('yesterdaySummary')?.classList.add('hidden');

  // On affiche le panneau profil
  document.getElementById('profilePanel')?.classList.remove('hidden');

  // 🎬 Animation douce
  animatePanel('profilePanel');

  // On recharge les données
  loadProfileData();
  loadProfileStepsTotal();
}




function closeProfile() {
  // On cache le panneau profil
  document.getElementById('profilePanel')?.classList.add('hidden');

  // On ré-affiche les éléments de l'accueil
  document.getElementById('yesterdaySummary')?.classList.remove('hidden');
  document.getElementById('bilanPanel')?.classList.remove('hidden');   // 👈 IMPORTANT

  // Et on revient sur l’onglet "Suivi" dans la nav du bas
  const tab2Btn = document.querySelector('.tab-btn[data-tab="tab2"]');
  switchTab('tab2', tab2Btn);
}



// On expose les fonctions pour les onclick dans le HTML
window.openProfile  = openProfile;
window.closeProfile = closeProfile;

function openTodo() {
  // On garde l’onglet "Suivi" actif dans la barre du bas
  const suiviBtn = document.querySelector('.tab-btn[data-tab="tab2"]');
  switchTab('tab2-todo', suiviBtn);
}

function returnFromTodo() {
  const tab2Btn = document.querySelector('.tab-btn[data-tab="tab2"]');
  switchTab('tab2', tab2Btn);
}


function addTodo() {
  const text = prompt("Nouvelle tâche :");
  if (!text) return;

  const wrap = document.getElementById("todoContent");
  const div = document.createElement("div");
  div.className = "todo-item";

  const id = "todo-" + Math.random().toString(36).slice(2);

  div.innerHTML = `
    <input type="checkbox" id="${id}">
    <label for="${id}" class="todo-text">${text}</label>
  `;

  wrap.appendChild(div);
}


function openTrainingPage() {
  switchTab('tab2-training');
}

function backFromTraining() {
  switchTab('tab1', document.querySelector('.tab-btn[data-tab="tab1"]'));
}

function openTrainingSheet() {
  const id = (window.__CLIENT_ID__ || '').trim().toLowerCase();

  // On récupère l'URL correspondant à cet ID
  const url = TRAINING_SHEETS[id];

  if (!url) {
    alert("Ton programme training n'est pas encore relié à ton compte. Contacte ton coach 😊");
    return;
  }

  // Ouvre le Google Sheet dans le navigateur / app Google Sheets
  window.open(url, '_blank');
}

// On l’expose pour le HTML
window.openTrainingSheet = openTrainingSheet;

function openProfileFromSuivi() {
  // 👉 On affiche seulement le contenu de tab1
  goToTab(1);  // ne touche PAS à la nav du bas

  // 👉 Puis on ouvre le panel profil
  openProfile();
}

window.openProfileFromSuivi = openProfileFromSuivi;


// ───────── Lottie – TODO list (style Scratch Mouse) ─────────
let todoAnim = null;

function initTodoAnim() {
  const container = document.getElementById('todoAnimation');
  if (!container || typeof lottie === 'undefined') {
    console.warn('TODO Lottie : pas de container ou lottie pas dispo');
    return;
  }

  // On initialise UNE SEULE FOIS
  if (!todoAnim) {
    todoAnim = lottie.loadAnimation({
      container: container,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: './animations/validate.json'
    });

    todoAnim.addEventListener('complete', () => {
      container.classList.remove('visible');
    });
  }
}



function playTodoAnimation() {
  const animContainer = document.getElementById('todoAnimation');
  if (!animContainer) return;

  // On rend le conteneur visible
  animContainer.classList.add('visible');

  // On joue l'anim depuis le début (comme le badge dans ScratchMouse)
  if (todoAnim) {
    todoAnim.goToAndPlay(0, true);
  }
}




function completeTodo(checkbox) {
  if (!checkbox.checked) return;

  // Disparition animée
  const item = checkbox.closest(".todo-item");
  if (item) {
    item.style.opacity = "0";
    item.style.transform = "scale(0.95)";
    setTimeout(() => item.remove(), 200);
  }

  // ⚡ Ajout de +5 pts santé immédiatement
  const ptsEl = document.getElementById("profileHealthPoints");
  const barEl = document.getElementById("healthBar");

  if (ptsEl) {
    let current = Number(ptsEl.textContent.split("/")[0]) || 0;
    current += 5;

    // Si on dépasse 100 → +1 score santé et reset à 0
    const scoreEl = document.getElementById("profileHealthScore");
    if (current >= 100) {
      current -= 100;
      if (scoreEl) {
        let score = Number(scoreEl.textContent) || 0;
        scoreEl.textContent = score + 1;
      }
    }

    ptsEl.textContent = `${current} / 100`;

    if (barEl) {
      barEl.style.width = current + "%";
    }
  }
}

const TODO_POINTS_PER_TASK = 5;

const todoWrap = document.getElementById('todoContent');
if (todoWrap) {
  todoWrap.addEventListener('change', async (e) => {
    const cb = e.target;
    if (!cb.matches('input[type="checkbox"]')) return;
    if (!cb.checked) return;

    const item = cb.closest('.todo-item');
    if (!item) return;

    // 🔹 1) Mise à jour instantanée de l’UI (ex- logique completeTodo)
    const ptsEl = document.getElementById("profileHealthPoints");
    const barEl = document.getElementById("healthBar");
    if (ptsEl) {
      let current = Number(ptsEl.textContent.split("/")[0]) || 0;
      current += TODO_POINTS_PER_TASK;

      const scoreEl = document.getElementById("profileHealthScore");
      if (current >= 100) {
        current -= 100;
        if (scoreEl) {
          let score = Number(scoreEl.textContent) || 0;
          scoreEl.textContent = score + 1;
        }
      }

      ptsEl.textContent = `${current} / 100`;
      if (barEl) {
        barEl.style.width = current + "%";
      }
    }

    // 🔹 2) Animation Lottie immédiate
    playTodoAnimation();

    // 🔹 3) Effet visuel + disparition
    item.classList.add('done');
    setTimeout(() => {
      item.remove();
    }, 450);

    // 🔹 4) Appel Apps Script (en arrière-plan, sans bloquer l’anim)
    try {
      const clientId = (window.__CLIENT_ID__ || '').trim();

      let url = GAS_URL + '?action=todo_add'
        + '&points=' + encodeURIComponent(TODO_POINTS_PER_TASK);

      if (clientId) url += '&id=' + encodeURIComponent(clientId);

      const res  = await fetch(url);
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        console.error('todo_add error', json.error || ('HTTP ' + res.status));
      }
    } catch (err) {
      console.error('todo_add fetch error', err);
    }
  });
}






// ---------- Flow ----------
function startQA(){
  state.date = todayFR();
  state.idx = 0;
  state.answers = {};

  $('#startPanel').classList.add('hidden');
  $('#qaPanel').classList.remove('hidden');
  $('#donePanel').classList.add('hidden');

  // 🎬 Animation d’entrée du panneau Q&A
  animatePanel('qaPanel');

  // montrer Valider dès le début du Q&A
  const btn = document.getElementById('submitAnswer');
  if (btn) btn.style.display = 'block';

  refreshDateBadge();
  showQuestion();
}
window.startQA = startQA;


function showQuestion() {
  const total = QUESTIONS.length;

  // Si on a fini toutes les questions
  if (state.idx >= total) {
    const bar = document.getElementById('questionProgressInner');
    if (bar) bar.style.width = '100%';
    const progressTextEl = document.getElementById('progress');
    if (progressTextEl) {
      progressTextEl.textContent = `Question ${total} sur ${total}`;
    }
    return finishAndSend();
  }

  const q = QUESTIONS[state.idx];

  // Titre de la question
  const titleEl = document.getElementById('questionText');
  if (titleEl) titleEl.textContent = q.label;

  // Petit texte en haut : on le désactive
  const stepEl = document.getElementById('questionStep');
  if (stepEl) stepEl.textContent = '';


  // Zone input
  const slot = document.getElementById('inputSlot');
  if (slot) {
    slot.innerHTML = '';
    const input = buildInput(q);
    slot.appendChild(input);
    input.focus();
    state.currentInputEl = input;
  }

  // Texte "Question X sur Y"
  const progressTextEl = document.getElementById('progress');
  if (progressTextEl) {
    progressTextEl.textContent = `Question ${state.idx + 1} sur ${total}`;
  }

  // ✅ Barre de progression
  const bar = document.getElementById('questionProgressInner');
  if (bar) {
    const pct = Math.round((state.idx) / total * 100); // 0% à la Q1, etc.
    bar.style.width = pct + '%';
  }

  const btn = document.getElementById('submitAnswer');
  if (btn) btn.style.display = 'block';

   // 🔙 Bouton retour
    const backBtn = document.getElementById('goBackAnswer');
    if (backBtn) {
      backBtn.style.display = state.idx > 0 ? 'block' : 'none';
    }
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

function finishAndSend() {
  // 1) UI : on affiche l'écran "c'est fini"
  $('#qaPanel').classList.add('hidden');
  $('#donePanel').classList.remove('hidden');

  // 🎬 Animation d’entrée du panneau de fin
  animatePanel('donePanel');

  const btn = document.getElementById('submitAnswer');
  if (btn) btn.style.display = 'none';

  // 🔙 NEW : cacher le bouton "modifier la réponse précédente"
  const backBtn = document.getElementById('goBackAnswer');
  if (backBtn) backBtn.style.display = 'none';

  // 2) Envoi des réponses au Google Sheet
  const bulk = Object.keys(state.answers).map(col => ({ col, value: state.answers[col] }));
  sendBulk({ date: state.date, sheet: SHEET_TAB, bulk }, err => {
    if (err) alert('Envoi au Google Sheet : ' + err);
  });

  // 3) 🔒 Marquer le bilan comme FAIT pour aujourd'hui
  const today = todayFR();                     // ex : "21/11/2025"
  localStorage.setItem('bilan_done', today);

  // 4) 🔒 Désactiver immédiatement le bouton "BILAN DU JOUR"
  const bilanBtn = document.getElementById('bilanBtn');
  if (bilanBtn) {
    bilanBtn.disabled = true;
    bilanBtn.classList.add('disabled'); // tu as déjà le CSS pour ça
  }
}


 function goBackQuestion() {
   // On ne peut pas remonter avant la première question
   if (state.idx <= 0) return;

   // On revient à la question précédente
   state.idx -= 1;

   // On recharge la question
   showQuestion();

   // On remet la réponse déjà donnée si elle existe
   const q = QUESTIONS[state.idx];
   const prevVal = state.answers[q.col];
   const input = document.getElementById('answerInput');
   if (input && prevVal !== undefined) {
     input.value = prevVal;
   }

   // Bouton retour visible seulement si on n'est pas sur la première question
   const backBtn = document.getElementById('goBackAnswer');
   if (backBtn) {
     backBtn.style.display = state.idx > 0 ? 'block' : 'none';
   }
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

function checkBilanStatusAtStartup() {
  const btn = document.getElementById('bilanBtn');
  if (!btn) return;

  const storedDate = localStorage.getItem("bilan_done"); // ex : "20/11/2025"
  const today = todayFR();

  // 🔒 Si la date stockée = aujourd'hui → on bloque
  if (storedDate === today) {
    btn.disabled = true;
    btn.classList.add('disabled');
  } else {
    // 🔓 Sinon = jour différent → on réactive
    btn.disabled = false;
    btn.classList.remove('disabled');
  }
}

async function loadYesterdaySummary() {
  console.log('loadYesterdaySummary: start');

  const card      = document.getElementById('yesterdaySummary');
  const dateEl    = document.getElementById('yesterdayDate');
  const weightEl  = document.getElementById('yesterdayWeight');
  const sleepEl   = document.getElementById('yesterdaySleep');
  const stepsEl   = document.getElementById('yesterdaySteps');
  const energyEl  = document.getElementById('yesterdayEnergy');

  // Juste pour debug visuel
  console.log('loadYesterdaySummary: elements =', {
    card, dateEl, weightEl, sleepEl, stepsEl, energyEl
  });

  if (!card || !dateEl || !weightEl || !sleepEl || !stepsEl || !energyEl) {
    console.warn('loadYesterdaySummary: au moins un élément est introuvable (mais on ne quitte pas)');
    return;
  }

  // 🔹 Date d’hier
  const yDate = yesterdayFR();
  dateEl.textContent = yDate;

  // 🔹 Reset des valeurs pendant le chargement
  weightEl.textContent = '—';
  sleepEl.textContent  = '—';
  stepsEl.textContent  = '—';
  energyEl.textContent = '—';

  try {
    const clientId = (window.__CLIENT_ID__ || '').trim();

    let url = GAS_URL
      + '?action=day_summary'
      + '&date=' + encodeURIComponent(yDate);

    if (clientId) {
      url += '&id=' + encodeURIComponent(clientId);
    }

    console.log('loadYesterdaySummary: fetch URL =', url);

    const res = await fetch(url);
    console.log('loadYesterdaySummary: HTTP status =', res.status);

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const json = await res.json();
    console.log('loadYesterdaySummary: JSON =', json);

    if (!json.ok || !json.exists) {
      console.log('loadYesterdaySummary: aucune donnée pour hier');
      return; // on laisse les "—"
    }

    // 🟦 Poids
    if (typeof json.weight === 'number' && !isNaN(json.weight)) {
      weightEl.textContent =
        json.weight.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' kg';
    }

    // 😴 Sommeil
    if (typeof json.sleepHours === 'number' && !isNaN(json.sleepHours)) {
      if (typeof hoursToLabel === 'function') {
        sleepEl.textContent = hoursToLabel(json.sleepHours);
      } else {
        const hh = Math.floor(json.sleepHours);
        const mm = Math.round((json.sleepHours - hh) * 60);
        sleepEl.textContent = `${hh}h${String(mm).padStart(2, '0')}`;
      }
    }

    // 👟 Pas
    if (typeof json.steps === 'number' && !isNaN(json.steps)) {
      stepsEl.textContent = json.steps.toLocaleString('fr-FR') + ' pas';
    }

    // ⚡ Énergie
    if (typeof json.energy === 'number' && !isNaN(json.energy)) {
      energyEl.textContent = json.energy.toLocaleString('fr-FR') + ' / 5';
    }

  } catch (err) {
    console.error('loadYesterdaySummary error:', err);
  }
}






// ---------- init ----------
logDiag('JS chargé', true);

// 🔁 Petite animation quand un panneau apparaît
function animatePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;

  // Si le panneau contient une "carte" principale, on anime celle-là
  const mainCard =
    el.querySelector('.card') ||
    el.querySelector('.panel') ||
    el; // fallback

  mainCard.classList.remove('panel-anim');
  void mainCard.offsetWidth; // force reflow
  mainCard.classList.add('panel-anim');
}


function submitClientLogin() {
  const input = document.getElementById('loginInput');
  const raw   = (input && input.value ? input.value : '').trim();

  if (!raw) {
    alert("Merci d’entrer ton code client 😊");
    if (input) input.focus();
    return;
  }

  const id = raw.toLowerCase();


  
  // 🔐 1) Vérifier que l'ID existe bien dans TRAINING_SHEETS
  const knownIds = Object.keys(TRAINING_SHEETS || {});
  if (!knownIds.includes(id)) {
    alert("Ce code client n'existe pas. Vérifie l'orthographe ou demande à ton coach 🙂");
    if (input) input.focus();
    return;
  }

  // 🧠 2) Enregistrer l'ID client
  window.__CLIENT_ID__ = id;
  localStorage.setItem('client_id', id);

  // 🆕 Recharger toutes les données dynamiques
  refreshDateBadge();
  checkBilanStatusAtStartup();
  loadYesterdaySummary();   // <-- 👍 parfait ici

  // 🎭 4) Cacher l'écran de login + afficher l'app
  const panel = document.getElementById('loginPanel');
  if (panel) panel.classList.add('hidden');

  const main = document.querySelector('main');
  if (main) main.classList.remove('hidden');

  console.log('Client connecté :', id);
}



// 🧠 Initialisation "logique" (UI, bouton bilan...)
document.addEventListener('DOMContentLoaded', () => {
  refreshDateBadge();
  checkBilanStatusAtStartup();

  // 🆕 On tente de charger le résumé d’hier dès le démarrage
  loadYesterdaySummary();

  // 🔐 Si aucun client n'est connecté → afficher l'écran de connexion
  if (window.__NEED_LOGIN__) {
    document.getElementById('loginPanel')?.classList.remove('hidden');
    document.querySelector('main')?.classList.add('hidden');
  }

  // 🆕 Met à jour l’affichage de la version au démarrage
  updateVersionVisibility();
});



// 🌀 Initialisation des loaders Lottie (quand TOUT est chargé, y compris lottie.min.js)
window.addEventListener('load', () => {

  // 🔹 Debug
  const dbg = document.getElementById('debugClient');
  if (dbg) dbg.textContent = 'YS load → ' + yesterdayFR();

  if (typeof lottie === 'undefined') {
    console.warn('Lottie non chargé');
    return;
  }

  initSleepLoader();
  initWeightLoader();
  initStepsLoader();
  initEnergyLoader();
  initNutriLoader();
  initTodoAnim();
});






// ───────── Sous-onglets onglet 2 ─────────
function openTab2View(name){
  // 1) On cache le menu principal de l’onglet Suivi
  const menu = document.getElementById('tab2-menu');
  if (menu) menu.classList.add('hidden');

  // 2) On cache les vues détaillées déjà connues
  document.getElementById('tab2-sleep')?.classList.add('hidden');
  document.getElementById('tab2-weight')?.classList.add('hidden');

  // 3) On affiche la vue demandée
  const targetId = 'tab2-' + name;
  const target   = document.getElementById(targetId);
  if (target) {
    target.classList.remove('hidden');

    // 🎬 animation d’apparition, comme pour le bilan/profil
    animatePanel(targetId);
  }

  // 4) Lazy-load du graphe selon la vue ouverte
  if (name === 'sleep')  loadSleepChart();
  if (name === 'weight') loadWeightChart();
}


window.openTab2View = openTab2View;


function backFromTab2(){
  document.getElementById('tab2-menu')?.classList.remove('hidden');
  document.getElementById('tab2-sleep')?.classList.add('hidden');
  document.getElementById('tab2-weight')?.classList.add('hidden');
}

// ───────── Graphique poids ─────────
let weightChart = null;
let weightLoaderAnim = null; // animation Lottie du poids


async function loadWeightChart(){
  // ✅ Si le graphique existe déjà, on ne recharge rien
  if (weightChart) {
    return;
  }

  const loader = document.getElementById('weightLoader');

  // 👀 Afficher le loader avant la requête
  if (loader) loader.classList.add('visible');
  if (weightLoaderAnim) weightLoaderAnim.play();

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

  // 🧹 Cacher le loader une fois le graphe prêt (ou en erreur)
  if (loader) loader.classList.remove('visible');
  if (weightLoaderAnim) weightLoaderAnim.stop();
}





function renderWeightChart(points){
  const badge     = document.getElementById('lastWeightBadge');
  const canvas    = document.getElementById('weightChart');
  const avgValue  = document.getElementById('weightAvgValue');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // aucune donnée -> badge vide + canvas nettoyé + texte par défaut
  if (!points || !points.length){
    if (badge)    badge.textContent = '—';
    if (avgValue) avgValue.textContent = 'Pas assez de données';

    if (weightChart){ weightChart.destroy(); weightChart = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.weight));

  // Badge dernier poids
  if (badge){
    const last = values[values.length - 1];
    badge.textContent = `${last.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`;
  }

  // 🆕 Moyenne sur les 7 derniers points (max)
  if (avgValue){
    const last7 = values.slice(-7).filter(v => Number.isFinite(v));
    if (last7.length){
      const sum = last7.reduce((acc, v) => acc + v, 0);
      const avg = sum / last7.length;
      avgValue.textContent = `${avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`;
    } else {
      avgValue.textContent = '—';
    }
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
let sleepLoaderAnim = null; // animation Lottie du sommeil


function initSleepLoader() {
  const container = document.getElementById('sleepAnim');
  if (!container || typeof lottie === 'undefined') return;

  sleepLoaderAnim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: './animations/loading.json' // ton fichier JSON
  });
}

// ===========================
//  Loader Lottie – Poids
// ===========================
function initWeightLoader() {
  const container = document.getElementById('weightAnim');
  if (!container || typeof lottie === 'undefined') return;

  weightLoaderAnim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: './animations/loading.json'
  });
}



function hoursToLabel(h){
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${String(mm).padStart(2,'0')}`;
}

async function loadSleepChart() {
  // ⛔ Si le graphique existe déjà, on ne relance ni fetch ni animation
  if (sleepChart) {
    return;
  }

  const loader = document.getElementById('sleepLoader');

  // 🌀 Si l’animation n’est pas encore initialisée, on tente maintenant
  if (!sleepLoaderAnim && typeof lottie !== 'undefined') {
    initSleepLoader();
  }

  // 👀 Afficher le loader seulement au premier chargement
  if (loader) loader.classList.add('visible');
  if (sleepLoaderAnim) sleepLoaderAnim.play();

  try {
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
  } catch (err) {
    console.error('loadSleepChart error:', err);
    renderSleepChart([]);
  }

  // 🧹 Cacher le loader une fois le graphe prêt (ou en erreur)
  if (loader) loader.classList.remove('visible');
  if (sleepLoaderAnim) sleepLoaderAnim.stop();
}







function renderSleepChart(points){
  const badge      = document.getElementById('lastSleepBadge');
  const canvas     = document.getElementById('sleepChart');
  const avgTextEl  = document.getElementById('sleepAvgText');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Pas de données : on reset tout proprement
  if (!points || !points.length){
    if (badge)     badge.textContent = '—';
    if (avgTextEl) avgTextEl.textContent = '—';
    if (sleepChart){
      sleepChart.destroy();
      sleepChart = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.sleep)); // heures décimales

  // Badge dernier sommeil (dernier point)
  if (badge){
    const last = values[values.length - 1];
    badge.textContent = hoursToLabel(last);
  }

  // 🆕 Calcul moyenne sur les 7 derniers jours (calendaires)
  if (avgTextEl) {
    const parseFRDate = (s) => {
      const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return null;
      return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    };

    const today = new Date();
    today.setHours(0,0,0,0);
    const sevenDaysAgo = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 6
    );

    let sum = 0;
    let count = 0;

    points.forEach(p => {
      const d = parseFRDate(p.date);
      if (!d) return;
      d.setHours(0,0,0,0);

      if (d >= sevenDaysAgo && d <= today) {
        const h = Number(p.sleep);
        if (!Number.isNaN(h)) {
          sum += h;
          count++;
        }
      }
    });

    if (count > 0) {
      const avg = sum / count;
      const label = hoursToLabel(avg);  // ex: "7h30"
      avgTextEl.textContent = label;    // ✅ juste la moyenne
    } else {
      avgTextEl.textContent = '—';
    }
  }

  // Graphique
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

// ───────── Graphique énergie (ligne) ─────────
let energyChart = null;
let energyLoaderAnim = null; // animation Lottie énergie

function initEnergyLoader() {
  const container = document.getElementById('energyAnim');
  if (!container || typeof lottie === 'undefined') return;

  energyLoaderAnim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: './animations/loading.json'
  });
}





// ───────── Loader Lottie – Pas ─────────
let stepsLoaderAnim = null;

function initStepsLoader() {
  const container = document.getElementById('stepsAnim');
  if (!container || typeof lottie === 'undefined') return;

  stepsLoaderAnim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: './animations/loading.json'
  });
}

async function loadStepsChart() {

  // ⛔ Empêche la recréation d’un graphique déjà existant
  if (stepsChart) {
    return;
  }

  const loader = document.getElementById('stepsLoader');

  // Affiche l’animation uniquement au premier chargement
  if (loader) loader.classList.add('visible');
  if (stepsLoaderAnim) stepsLoaderAnim.play();

  try {
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const url = GAS_URL + '?action=steps'
      + (SHEET_TAB ? ('&sheet=' + encodeURIComponent(SHEET_TAB)) : '')
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');

    const res = await fetch(url);

    let data = [];
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data)) {
        data = json.data;
      }
    }

    // Rend le graphique (crée stepsChart)
    renderStepsChart(data);

  } catch (err) {
    console.error('loadStepsChart error:', err);
    renderStepsChart([]);
  }

  // On coupe le loader une fois terminé
  if (loader) loader.classList.remove('visible');
  if (stepsLoaderAnim) stepsLoaderAnim.stop();
}



function renderStepsChart(points){
  const badge     = document.getElementById('lastStepsBadge');
  const canvas    = document.getElementById('stepsChart');
  const avgValue  = document.getElementById('stepsAvgValue');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // aucune donnée -> badge vide + canvas nettoyé + message par défaut
  if (!points || !points.length){
    if (badge)    badge.textContent = '—';
    if (avgValue) avgValue.textContent = 'Pas assez de données';

    if (stepsChart){ stepsChart.destroy(); stepsChart = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.steps));

  // Badge dernier total de pas
  if (badge){
    const last = values[values.length - 1];
    badge.textContent = `${last.toLocaleString('fr-FR')} pas`;
  }

  // 🆕 Moyenne sur les 7 derniers jours
  if (avgValue){
    const last7 = values.slice(-7).filter(v => Number.isFinite(v));
    if (last7.length){
      const sum = last7.reduce((acc, v) => acc + v, 0);
      const avg = Math.round(sum / last7.length);
      avgValue.textContent = `${avg.toLocaleString('fr-FR')} pas`;
    } else {
      avgValue.textContent = '—';
    }
  }

  // Affichage du graphe
  stepsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 0,
        backgroundColor: '#4da6ff'   // couleur barre
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: {
            callback: v => v.toLocaleString('fr-FR')
          },
          grid: { color: 'rgba(0,0,0,.08)' }
        }
      }
    }
  });

}

async function loadEnergyChart() {
  // ⛔ Si le graphique existe déjà, on ne relance rien
  if (energyChart) {
    return;
  }

  const loader = document.getElementById('energyLoader');

  // 👀 Afficher le loader seulement au premier chargement
  if (loader) {
    loader.classList.add('visible');
  }
  if (energyLoaderAnim) {
    energyLoaderAnim.play();
  }

  try {
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const url = GAS_URL + '?action=energy'
      + (SHEET_TAB ? ('&sheet=' + encodeURIComponent(SHEET_TAB)) : '')
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');
    const res = await fetch(url);
    let data = [];
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok && Array.isArray(json.data)) data = json.data;
    }
    renderEnergyChart(data);
  } catch (err) {
    console.error('loadEnergyChart error:', err);
    renderEnergyChart([]);
  }

  // 🧹 Cacher le loader après
  if (loader) {
    loader.classList.remove('visible');
  }
  if (energyLoaderAnim) {
    energyLoaderAnim.stop();
  }
}


function renderEnergyChart(points) {
  const badge    = document.getElementById('lastEnergyBadge');
  const canvas   = document.getElementById('energyChart');
  const avgValue = document.getElementById('energyAvgValue');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Pas de données → reset propre
  if (!points || !points.length) {
    if (badge)    badge.textContent = '—';
    if (avgValue) avgValue.textContent = 'Pas assez de données';

    if (energyChart) {
      energyChart.destroy();
      energyChart = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.date);
  const values = points.map(p => Number(p.energy));

  // Badge dernier point
  if (badge) {
    const last = values[values.length - 1];
    badge.textContent = `${last.toLocaleString('fr-FR')} / 5`;
  }

  // Moyenne sur les 7 derniers points
  if (avgValue) {
    const last7 = values.slice(-7).filter(v => Number.isFinite(v));
    if (last7.length) {
      const sum = last7.reduce((acc, v) => acc + v, 0);
      const avg = sum / last7.length;
      avgValue.textContent = `${avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5`;
    } else {
      avgValue.textContent = '—';
    }
  }

  if (energyChart) energyChart.destroy();

  energyChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 4,
        borderColor: '#f59e0b',        // jaune énergie
        pointBackgroundColor: '#facc15'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: 1,
          max: 5,
          ticks: {
            stepSize: 1,
            callback: v => v.toLocaleString('fr-FR')
          },
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

// Ouvre la page Nutrition en gérant 1 jour / plusieurs jours
async function openNutritionPage(){
  const box   = document.getElementById('nutriContent');
  const meta  = document.getElementById('nutriMeta');
  const days  = document.getElementById('nutriDays');
  const loader = document.getElementById('nutriLoader');
  if (!box) return;

  // 🔥 1) Afficher le loader IMMÉDIATEMENT à la première ouverture
  if (loader) {
    loader.classList.add('visible');
  }
  // Si l’anim Lottie n’est pas encore prête, on tente de l’init
  if (!nutriLoaderAnim && typeof lottie !== 'undefined') {
    initNutriLoader();
  }
  if (nutriLoaderAnim) {
    nutriLoaderAnim.play();
  }

  try {
    // Si pas de barre de jours, on charge juste l’onglet par défaut
    if (!days) {
      await loadNutrition('Nutrition'); // loadNutrition gère toujours le hide du loader
      return;
    }

    // Charger la liste des onglets Nutrition une seule fois
    if (!nutrTabsLoaded) {
      const clientId = (window.__CLIENT_ID__ || '').trim();
      let url = GAS_URL + '?action=nutrition_tabs';
      if (clientId) url += '&id=' + encodeURIComponent(clientId);

      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Réponse Apps Script invalide');

      nutrTabs = Array.isArray(json.tabs) ? json.tabs : [];
      nutrTabsLoaded = true;
    }

    // Aucun onglet Nutrition
    if (!nutrTabs || nutrTabs.length === 0){
      days.innerHTML = '';
      box.innerHTML = '<p class="note">Aucun onglet Nutrition trouvé.</p>';
      if (meta) meta.textContent = '0 jour';
      return;
    }

    // Un seul onglet
    if (nutrTabs.length === 1){
      days.innerHTML = '';
      if (meta) meta.textContent = '1 jour';
      await loadNutrition(nutrTabs[0]);  // loadNutrition cache le loader
      return;
    }

    // Plusieurs onglets -> boutons Jour 1 / Jour 2 / ...
    let html = '';
    nutrTabs.forEach((name, idx) => {
      const label = 'Jour ' + (idx + 1);
      const safe = name.replace(/"/g, '&quot;');
      html += `
        <button
          class="nutri-day-btn"
          data-sheet="${safe}"
          onclick="selectNutritionDay('${safe}')">
          ${label}
        </button>`;
    });
    days.innerHTML = html;
    if (meta) meta.textContent = nutrTabs.length + ' jours';

    // Sélection par défaut → va appeler loadNutrition() et gérer la fin du loader
    if (nutrTabs[0]) {
      window.selectNutritionDay(nutrTabs[0]);
    }

  } catch (err) {
    console.error('openNutritionPage error:', err);
    box.innerHTML = '<p class="note err">Erreur lors du chargement de la nutrition.</p>';
    if (meta) meta.textContent = 'Erreur';
  }
}



// Fonction globale pour changer de jour
window.selectNutritionDay = function(sheetName){
  currentNutritionSheet = sheetName || 'Nutrition';

  // mettre à jour les boutons actifs
  const btns = document.querySelectorAll('.nutri-day-btn');
  btns.forEach(btn => {
    const isActive = btn.dataset.sheet === sheetName;
    if (isActive) btn.classList.add('active');
    else         btn.classList.remove('active');
  });

  // charger le bon onglet
  loadNutrition(sheetName);
};

// ===========================
//  Loader Lottie – Nutrition
// ===========================
let nutriLoaderAnim = null;

function initNutriLoader() {
  const container = document.getElementById('nutriAnim');
  if (!container || typeof lottie === 'undefined') return;

  nutriLoaderAnim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    path: './animations/loading.json' // même fichier que les autres loaders
  });
}


// ───────── Nutrition : chargement + rendu par repas (cartes) ─────────
// Pour gérer plusieurs onglets "Nutrition", "Nutrition 2", etc.
let nutrTabs = [];
let nutrTabsLoaded = false;
let nutrLoaded = false;
let currentNutritionSheet = 'Nutrition'; // onglet par défaut

async function loadNutrition(sheetName){
  const box    = document.getElementById('nutriContent');
  const meta   = document.getElementById('nutriMeta');
  const loader = document.getElementById('nutriLoader');
  if (!box) return;

  // 🌀 Afficher le loader
  if (loader) loader.classList.add('visible');
  if (nutriLoaderAnim) nutriLoaderAnim.play();

  // On vide le contenu pendant le chargement
  box.innerHTML = '';

  // Si on appelle loadNutrition('Nutrition 2'), on met à jour l’onglet courant
  if (sheetName) {
    currentNutritionSheet = sheetName;
  }

  try{
    const clientId = (window.__CLIENT_ID__ || '').trim();
    const nutrTab  = currentNutritionSheet || 'Nutrition';

    const url = GAS_URL + '?action=nutrition'
      + '&nsheet=' + encodeURIComponent(nutrTab)
      + (clientId ? ('&id=' + encodeURIComponent(clientId)) : '');

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Réponse Apps Script invalide');

    const { headers, rows } = json;

    
    // helpers
    const headersNorm  = normalizeHeaders(headers);
    const stripAcc     = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const headersAscii = headersNorm.map(stripAcc);
    const idx = {
      alim:    headersAscii.indexOf('aliments'),
      portion: headersAscii.findIndex(h => h.startsWith('portion')),
      kcal:    headersAscii.indexOf('calories'),
      pro:     headersAscii.indexOf('proteines'),
      glu:     headersAscii.indexOf('glucides'),
      lip:     headersAscii.indexOf('lipides')
    };
    const toNum = v => {
      const n = Number(String(v??'').replace(',', '.').trim());
      return Number.isFinite(n) ? n : NaN;
    };
    const fmt = n => Number.isFinite(n)
      ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
      : '—';

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
      if (a.toLowerCase() === 'total'){
        const tot = {
          kcal: toNum(r[idx.kcal]),
          pro:  toNum(r[idx.pro]),
          glu:  toNum(r[idx.glu]),
          lip:  toNum(r[idx.lip]),
        };
        const hasItems = current.items.length > 0;
        if (hasItems){
          current.total = tot;
          current.name  = `Repas ${mealIndex}`;
          meals.push(current);
          mealIndex += 1;
        }
        current = { items: [], total: null };
        continue;
      }

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
                  <div class="meal-row-top">
                    <div class="food-name">${escapeHtml(it.name)}</div>
                  </div>
                  <div class="meal-row-bottom">
                    <div class="food-portion">
                      ${Number.isFinite(it.portion) ? fmt(it.portion) : '—'} g
                    </div>
                    <div class="macros">
                      <span class="mc-kcal">${fmt(it.kcal)} kcal</span>
                      <span class="mc-pro">${fmt(it.pro)}P</span>
                      <span class="mc-glu">${fmt(it.glu)}G</span>
                      <span class="mc-lip">${fmt(it.lip)}L</span>
                    </div>
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
    // 🎬 Animation sur le contenu uniquement
    animatePanel('nutriContent');
    nutrLoaded = true;

  } catch(err){
    console.error('loadNutrition error:', err);
    box.innerHTML = `<p class="err">Erreur nutrition : ${String(err.message || err)}</p>`;
  } finally {
    // 🧹 On coupe le loader quoi qu’il arrive
    if (loader) loader.classList.remove('visible');
    if (nutriLoaderAnim) nutriLoaderAnim.stop();
  }
}



// ───────── Navigation + lazy-load des graphes (sous-pages de l’onglet 2) ─────────
(function () {
  const baseSwitch = window.switchTab || function (targetId, btn) {
    // nav bas (onglets principaux)
    document.querySelector('.tab-btn.active')?.classList.remove('active');
    if (btn) btn.classList.add('active');

    // on masque tous les gros panneaux
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    // on active le bon
    const panel = document.getElementById(targetId);
    if (panel) panel.classList.add('active');
  };

  window.switchTab = function (targetId, btn) {
    // logique de base
    baseSwitch(targetId, btn);

    // ⚡ animation douce sur le panneau ouvert (tab2, tab2-sleep, tab2-weight, etc.)
    animatePanel(targetId);

    // lazy-load des graphes
    if (targetId === 'tab2-weight') loadWeightChart();
    if (targetId === 'tab2-sleep')  loadSleepChart();
    if (targetId === 'tab2-steps')  loadStepsChart();
    if (targetId === 'tab2-energy') loadEnergyChart();
  };
})();



function goToTab(n) {
  const targetId = 'tab' + n;

  // Active uniquement l'onglet ciblé
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(targetId)?.classList.add('active');

  // Si on revient à l'accueil, on remet TOUT propre
  if (n === 1) {
    // Boutons de l'accueil
    document.getElementById('bilanPanel')?.classList.remove('hidden');

    // On cache les panneaux du flow bilan / profil
    document.getElementById('startPanel')?.classList.add('hidden');
    document.getElementById('qaPanel')?.classList.add('hidden');
    document.getElementById('donePanel')?.classList.add('hidden');
    document.getElementById('profilePanel')?.classList.add('hidden');

    // ✅ On ré-affiche le dashboard "Résumé d’hier"
    document.getElementById('yesterdaySummary')?.classList.remove('hidden');
  }
  // 🔄 MAJ de l’affichage de la version
  updateVersionVisibility();
}

window.goToTab = goToTab;


// 🔹 Ouvrir la page Nutrition depuis l'accueil (tab1)
function goToNutrition() {
  // On cache l'écran d'accueil
  document.getElementById('tab1')?.classList.remove('active');

  // On affiche la page Nutrition (ancienne tab2-nutrition)
  document.getElementById('tab2-nutrition')?.classList.add('active');

  // On laisse la nav du bas sur "Accueil" (on ne touche PAS aux .tab-btn)
  // On charge les données nutrition
  openNutritionPage();
}

function backFromNutrition() {
  // 1) Nav du bas : on repasse sur "Accueil"
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) activeBtn.classList.remove('active');

  const homeBtn = document.querySelector('.tab-btn[data-tab="tab1"]');
  if (homeBtn) homeBtn.classList.add('active');

  // 2) Onglets principaux : on masque tout, on affiche tab1
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab1')?.classList.add('active');

  // 3) On remet l'écran d'accueil dans son état "normal"
  document.getElementById('bilanPanel')?.classList.remove('hidden');
  document.getElementById('startPanel')?.classList.add('hidden');
  document.getElementById('qaPanel')?.classList.add('hidden');
  document.getElementById('donePanel')?.classList.add('hidden');
  document.getElementById('profilePanel')?.classList.add('hidden');
}


// On expose les fonctions pour le HTML
window.goToNutrition = goToNutrition;
window.backFromNutrition = backFromNutrition;


// ===== MODE TEST : Reset complet si on appuie sur la touche A =====
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'x') {

    // 🔄 Reset : bilan du jour
    localStorage.removeItem('bilan_done');

    // 🚪 Déconnexion test : suppression du client_id
    localStorage.removeItem('client_id');
    window.__CLIENT_ID__ = null;

    // UI : réactiver bouton bilan
    const btn = document.getElementById('bilanBtn');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('disabled');
    }

    // Afficher l'écran de login
    document.getElementById('loginPanel')?.classList.remove('hidden');

    // Cacher l'app
    document.querySelector('main')?.classList.add('hidden');

    alert("🔄 Reset + déconnexion effectués !");
  }
});


function openNutritionFromHome() {
  // 1) On active l’onglet "Suivi" dans la nav du bas
  const tab2Btn = document.querySelector('.tab-btn[data-tab="tab2"]');
  if (tab2Btn) {
    switchTab('tab2', tab2Btn);
  }

  // 2) On affiche directement la sous-page Nutrition
  // (pas de bouton dans la nav pour ça, donc pas de second argument)
  switchTab('tab2-nutrition');
}


function updateVersionVisibility() {
  const version = document.getElementById("appVersion");
  if (!version) return;

  const isTab1 = document.querySelector("#tab1")?.classList.contains("active");

  const bilanVisible   = !document.getElementById("bilanPanel")?.classList.contains("hidden");
  const profileVisible = !document.getElementById("profilePanel")?.classList.contains("hidden");
  const qaVisible      = !document.getElementById("qaPanel")?.classList.contains("hidden");
  const todoVisible    = document.getElementById("tab2-todo")
                        ? document.querySelector("#tab2-todo")?.classList.contains("active")
                        : false;

  const shouldShow =
    isTab1 &&
    bilanVisible &&
    !profileVisible &&
    !qaVisible &&
    !todoVisible;

  version.style.display = shouldShow ? "block" : "none";
}



// 🔊 CLICK SOUND + effet visuel "tap"
document.addEventListener("click", (e) => {
  // Boutons de la barre du bas
  const tabBtn = e.target.closest(".bottom-nav .tab-btn");

  // Gros boutons / tuiles / retour / primary / secondary
  const mainBtn = e.target.closest(
    "button, .primary, .secondary, #tab2-menu button.tile"
  );

  // 🎵 Son
  if (tabBtn) {
    playSfx("clickTab");
  } else if (mainBtn) {
    playSfx("click");
  }

  // ✨ Effet "tap" visuel (sur les éléments qui ont la classe .tap)
  const tapEl = e.target.closest(".tap");
  if (tapEl) {
    tapEl.classList.add("tapped");
    setTimeout(() => tapEl.classList.remove("tapped"), 120);
  }
});



function openSleepTile(el) {
  // 1) On change d'onglet comme avant
  const navBtn = document.querySelector('.tab-btn[data-tab="tab2"]');
  switchTab('tab2-sleep', navBtn);

  // 2) On force l'animation du panneau Sommeil (même effet que les onglets)
  setTimeout(() => {
    animatePanel('tab2-sleep');
  }, 0);
}
