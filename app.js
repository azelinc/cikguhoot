// ============================================================
// Cikgu Hoot v2 — AI Tutor with Textbook Content + Progress
// ============================================================

const TUTOR_API = 'https://tutor.azelinc.tech/api/tutor';
const SUBJECTS_API = 'https://tutor.azelinc.tech/api/subjects';
const PROGRESS_API = 'https://tutor.azelinc.tech/api/progress';

const KIDS = [
  { id: 'alya',  name: 'Alya',  grade: 'Form 1 · 13 y/o', avatar: '👩', color: '#c084fc', year: '1' },
  { id: 'afeef', name: 'Afeef', grade: 'Year 6 · 11 y/o', avatar: '👦', color: '#60a5fa', year: '6' },
  { id: 'ayza',  name: 'Ayza',  grade: 'Year 4 · 10 y/o', avatar: '👧', color: '#f472b6', year: '4' },
];

let state = {
  kid: null,
  subject: null,
  year: null,
  unit: null,
  topic: null,
  lessonStep: 'teach',
  listening: false,
  speaking: false,
  convHistory: [],
  subjectsData: null,
  progress: {},
  stepOrder: ['teach', 'example', 'practice', 'review'],
  stepIndex: 0,
};

const $ = id => document.getElementById(id);

// ============ HOME SCREEN ============
function initHome() {
  const grid = $('kids-grid');
  grid.innerHTML = '<h2>👋 Who\'s learning today?</h2>';
  KIDS.forEach(k => {
    const card = document.createElement('div');
    card.className = 'kid-card';
    card.innerHTML = `
      <div class="kid-avatar" style="background:${k.color}22">${k.avatar}</div>
      <div class="kid-info">
        <div class="kid-name">${k.name}</div>
        <div class="kid-grade">${k.grade}</div>
      </div>
      <div class="kid-go">›</div>`;
    card.onclick = () => selectKid(k);
    grid.appendChild(card);
  });
}

function selectKid(kid) {
  state.kid = kid;
  showSubjects();
}

// ============ SUBJECTS SCREEN ============
async function showSubjects() {
  const panel = $('subject-panel');
  panel.style.display = 'flex';
  $('selected-kid-name').innerHTML = `${state.kid.avatar} ${state.kid.name} — Pick a subject`;

  // Load subjects from API
  try {
    const resp = await fetch(SUBJECTS_API);
    state.subjectsData = await resp.json();
  } catch(e) {
    state.subjectsData = { math: { name: 'Mathematics', icon: '🔢', years: {} }, science: { name: 'Science', icon: '🔬', years: {} } };
  }

  const list = $('subject-list');
  list.innerHTML = '';
  
  for (const [key, subj] of Object.entries(state.subjectsData)) {
    const card = document.createElement('div');
    card.className = 'subj-card';
    const hasYears = Object.keys(subj.years || {}).length > 0;
    card.innerHTML = `
      <span class="subj-icon">${subj.icon || '📘'}</span>
      <div class="subj-info">
        <div class="subj-name">${subj.name}</div>
        <div class="subj-desc">${hasYears ? Object.keys(subj.years).length + ' years available' : 'Loading...'}</div>
      </div>
      <span class="subj-arrow">›</span>`;
    card.onclick = () => { state.subject = key; showYears(); };
    list.appendChild(card);
  }
}

function backToKids() {
  $('subject-panel').style.display = 'none';
}

// ============ YEARS SCREEN ============
function showYears() {
  $('selected-kid-name').innerHTML = `${state.kid.avatar} ${state.kid.name} — Pick Year`;

  const subj = state.subjectsData[state.subject];
  const years = subj.years || {};

  // Find best year for this kid
  // Alya=Form1/year1, Afeef=Y6, Ayza=Y4
  const suggestedYear = state.kid.year;

  const list = $('subject-list');
  list.innerHTML = '';

  for (const [yearKey, yearData] of Object.entries(years)) {
    const card = document.createElement('div');
    card.className = 'subj-card';
    const suggested = yearKey === suggestedYear ? '⭐ ' : '';
    card.innerHTML = `
      <div class="subj-info">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="subj-name">${suggested}${yearData.name}</span>
          ${yearKey === suggestedYear ? '<span style="font-size:10px;color:#fbbf24;background:#1e293b;padding:2px 6px;border-radius:8px">Suggested</span>' : ''}
        </div>
        <div class="subj-desc">${Object.keys(yearData.units || {}).length} units</div>
      </div>
      <span class="subj-arrow">›</span>`;
    card.onclick = () => { state.year = yearKey; showUnits(); };
    list.appendChild(card);
  }
  
  // Back button
  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '← Back to subjects';
  back.onclick = showSubjects;
  list.appendChild(back);
}

// ============ UNITS SCREEN ============
async function showUnits() {
  $('selected-kid-name').innerHTML = `${state.kid.avatar} ${state.kid.name} — Pick a Unit`;

  const subj = state.subjectsData[state.subject];
  const units = subj.years[state.year].units || {};

  // Load progress
  try {
    const resp = await fetch(`${PROGRESS_API}?child=${state.kid.id}`);
    state.progress = await resp.json();
  } catch(e) { state.progress = {}; }

  const list = $('subject-list');
  list.innerHTML = '';

  for (const [uk, unit] of Object.entries(units)) {
    const card = document.createElement('div');
    card.className = 'subj-card';
    
    // Calculate unit progress
    let done = 0;
    const total = unit.topics.length;
    unit.topics.forEach(([tk, tn]) => {
      const p = state.progress[tk];
      if (p && p.score > 0) done++;
    });
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const pctColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#64748b';

    card.innerHTML = `
      <div class="subj-info" style="flex:1">
        <div class="subj-name">Unit ${uk}: ${unit.name}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <div style="flex:1;height:4px;background:#1e293b;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:4px;transition:width 0.5s"></div>
          </div>
          <span style="font-size:11px;color:${pctColor}">${done}/${total}</span>
        </div>
      </div>
      <span class="subj-arrow">›</span>`;
    card.onclick = () => { state.unit = uk; showTopics(); };
    list.appendChild(card);
  }

  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '← Back to years';
  back.onclick = showYears;
  list.appendChild(back);
}

// ============ TOPICS SCREEN ============
function showTopics() {
  $('selected-kid-name').innerHTML = `${state.kid.avatar} ${state.kid.name} — Pick a Topic`;

  const subj = state.subjectsData[state.subject];
  const unit = subj.years[state.year].units[state.unit];
  const topics = unit.topics || [];

  const list = $('subject-list');
  list.innerHTML = '';

  topics.forEach(([tk, tn]) => {
    const p = state.progress[tk] || {};
    const score = p.score || 0;
    const stars = score >= 80 ? '★★★' : score >= 60 ? '★★☆' : score >= 1 ? '★☆☆' : '☆☆☆';
    const starColor = score >= 80 ? '#fbbf24' : score >= 60 ? '#fbbf24' : score >= 1 ? '#fbbf24' : '#334155';

    const card = document.createElement('div');
    card.className = 'subj-card';
    card.style.flexDirection = 'column';
    card.style.alignItems = 'stretch';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="subj-name">${tk} ${tn}</div>
        <span style="font-size:13px;letter-spacing:2px;color:${starColor}">${stars}</span>
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">
        ${score > 0 ? `Best: ${score}%` : 'Not started'}
        ${p.status === 'mastered' ? ' · ✅ Mastered' : ''}
      </div>`;
    card.onclick = () => launchTutor(tk, tn);
    list.appendChild(card);
  });

  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '← Back to units';
  back.onclick = showUnits;
  list.appendChild(back);
}

// ============ TUTOR SCREEN ============
function launchTutor(topicId, topicName) {
  state.topic = topicId;
  state.topicName = topicName;
  state.convHistory = [];
  state.stepIndex = 0;
  state.lessonStep = 'teach';

  $('home-screen').style.display = 'none';
  $('tutor-screen').style.display = 'flex';
  $('tutor-subject').innerHTML = `${state.subjectsData[state.subject].icon || '📘'} Unit ${state.unit}.${topicId}`;
  $('tutor-student').textContent = `${state.kid.avatar} ${state.kid.name} · ${topicName}`;
  $('tutor-status-badge').textContent = '🟢 Teaching';

  // Show lesson step bar
  $('lesson-steps').innerHTML = state.stepOrder.map((s, i) => 
    `<span class="step ${i === 0 ? 'active' : ''}">${i === 0 ? '📖' : i === 1 ? '💡' : i === 2 ? '✏️' : '📊'} ${s.charAt(0).toUpperCase()+s.slice(1)}</span>`
  ).join(' › ');

  $('chat-msgs').innerHTML = `
    <div class="msg tutor-msg" id="welcome-msg">
      Hoot hoot! 🦉 Let's learn <strong>${topicName}</strong>!<br><br>
      Tap the mic and say "I'm ready to learn!" 🎤
    </div>`;

  setCharState('idle', '📖 Ready to teach!');
}

function exitTutor() {
  if (state.listening) stopListening();
  if (synth.speaking) synth.cancel();
  $('tutor-screen').style.display = 'none';
  $('home-screen').style.display = 'flex';
  $('subject-panel').style.display = 'none';
  state.convHistory = [];
}

// ============ LESSON FLOW ============
async function startLesson() {
  showThinking();
  const textbook = state.topic ? await loadTopicTextbook(state.topic) : '';
  await callTutor(state.lessonStep, textbook);
}

async function nextStep() {
  state.stepIndex++;
  if (state.stepIndex >= state.stepOrder.length) {
    // Lesson complete
    addMsg('🎉 Great job! You finished this topic!', 'tutor');
    setCharState('happy', '🎉 Well done!');
    
    // Save progress
    saveProgress(100, 'mastered');
    
    // Show options
    setTimeout(() => {
      addMsg('What would you like to do next?', 'tutor');
      setTimeout(() => addActionButtons(), 500);
    }, 1000);
    return;
  }
  
  state.lessonStep = state.stepOrder[state.stepIndex];
  
  // Update step bar
  document.querySelectorAll('.step').forEach((el, i) => {
    el.className = `step ${i === state.stepIndex ? 'active' : i < state.stepIndex ? 'done' : ''}`;
  });
  
  showThinking();
  const textbook = state.topic ? await loadTopicTextbook(state.topic) : '';
  await callTutor(state.lessonStep, textbook);
}

function showThinking() {
  setCharState('thinking', '🤔 Teaching...');
  $('typing-ind').style.display = 'flex';
  $('chat-msgs').scrollTop = $('chat-msgs').scrollHeight;
}

async function loadTopicTextbook(topicId) {
  try {
    const resp = await fetch(`${SUBJECTS_API}?topic=${topicId}`);
    // We'll use textbook content from the API via the tutor endpoint
    return '';
  } catch(e) { return ''; }
}

async function callTutor(step, textbook='') {
  try {
    const resp = await fetch(TUTOR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        child_name: state.kid.name,
        child_grade: state.kid.grade,
        subject: state.subject,
        topic_id: state.topic,
        step: step,
        textbook: textbook,
        messages: state.convHistory.slice(-10).map(m => ({ role: m.role, content: m.content }))
      })
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);

    const data = await resp.json();
    const reply = data.content || 'Hoot! I had trouble. Try again?';

    state.convHistory.push({ role: 'user', content: `[${step.toUpperCase()} step] Continue the lesson.` });
    state.convHistory.push({ role: 'assistant', content: reply });
    
    $('typing-ind').style.display = 'none';
    addMsg(reply, 'tutor');
    setCharState('talking', '🗣️ Teaching...');
    speakText(reply);

    // After the tutor speaks, show the next-step button
    showNextStepButton();

  } catch (err) {
    $('typing-ind').style.display = 'none';
    addMsg(`Hoot! I'm having trouble connecting 🫤 Check your internet and try again.`, 'tutor');
    setCharState('idle', '🤓 Ready');
    console.error('Tutor API error:', err);
  }
}

function showNextStepButton() {
  // Remove old button if exists
  const old = document.getElementById('next-step-btn');
  if (old) old.remove();

  const isLast = state.stepIndex >= state.stepOrder.length - 1;
  const container = document.createElement('div');
  container.id = 'next-step-btn';
  container.style.cssText = 'padding:8px 16px 4px;display:flex;gap:8px;justify-content:center;flex-shrink:0';

  if (!isLast) {
    container.innerHTML = `<button class="action-btn primary" onclick="nextStep()">
      ➡️ Next: ${capitalize(state.stepOrder[state.stepIndex + 1])}</button>`;
  }
  
  // Also add mic button stub for continuing the conversation
  container.innerHTML += `<button class="action-btn" onclick="continueChat()">🎤 Continue talking</button>`;
  
  $('chat-area').appendChild(container);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function addActionButtons() {
  const container = document.createElement('div');
  container.id = 'next-step-btn';
  container.style.cssText = 'padding:8px 16px 4px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;flex-shrink:0';
  container.innerHTML = `
    <button class="action-btn primary" onclick="showTopics()">📋 More topics</button>
    <button class="action-btn" onclick="location.reload()">🔄 Retry</button>
    <button class="action-btn" onclick="continueChat()">🎤 Ask a question</button>`;
  $('chat-area').appendChild(container);
}

function continueChat() {
  const btn = document.getElementById('next-step-btn');
  if (btn) btn.style.display = 'none';
  startListening();
}

// ============ SEND MESSAGE (voice or text) ============
async function sendToTutor(text) {
  addMsg(text, 'kid');
  
  // Hide next step button if visible
  const btn = document.getElementById('next-step-btn');
  if (btn) btn.style.display = 'none';
  
  showThinking();
  
  try {
    const resp = await fetch(TUTOR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        child_name: state.kid.name,
        child_grade: state.kid.grade,
        subject: state.subject,
        topic_id: state.topic,
        step: state.lessonStep,
        messages: state.convHistory.slice(-10).map(m => ({ role: m.role, content: m.content })).concat([{ role: 'user', content: text }])
      })
    });

    if (!resp.ok) throw new Error(`API ${resp.status}`);

    const data = await resp.json();
    const reply = data.content || 'Hoot! I had trouble. Try again?';

    state.convHistory.push({ role: 'user', content: text });
    state.convHistory.push({ role: 'assistant', content: reply });
    
    $('typing-ind').style.display = 'none';
    addMsg(reply, 'tutor');
    setCharState('talking', '🗣️ Teaching...');
    speakText(reply);
    
    showNextStepButton();

  } catch (err) {
    $('typing-ind').style.display = 'none';
    addMsg(`Hoot! Trouble connecting 🫤 Try again.`, 'tutor');
    setCharState('idle', '🤓 Ready');
  }
}

// ============ SAVE PROGRESS ============
async function saveProgress(score, status) {
  try {
    await fetch(PROGRESS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        child: state.kid.id,
        topic: state.topic,
        score: score,
        status: status || 'attempted',
        steps: state.stepOrder.slice(0, state.stepIndex + 1)
      })
    });
  } catch(e) {
    console.log('Progress save failed (offline?):', e.message);
  }
}

// ============ ADD MESSAGE ============
function addMsg(text, type) {
  const msgs = $('chat-msgs');
  const div = document.createElement('div');
  div.className = `msg ${type}-msg`;
  if (type === 'kid') {
    div.innerHTML = `<span class="transcribed">🎤 You said:</span>${escapeHtml(text)}`;
  } else {
    div.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  }
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ============ VOICE: STT ============
let recognition = null;

function initSpeechRec() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $('mic-label').innerHTML = '❌ Voice not supported';
    $('mic-btn').style.opacity = '0.4';
    $('mic-btn').disabled = true;
    return false;
  }

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (e) => {
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
    }
    $('mic-label').textContent = final || '🎤 Listening...';
    if (final) {
      stopListening();
      sendToTutor(final.trim());
    }
  };

  recognition.onerror = (e) => {
    stopListening();
    $('mic-label').innerHTML = e.error === 'no-speech' ? '👆 <span class="tap">Tap & speak</span>' : '⚠️ Try again';
  };

  recognition.onend = () => {
    if (state.listening) { try { recognition.start(); } catch(e) {} }
  };
  return true;
}

function toggleMic() {
  if (state.listening) stopListening();
  else startListening();
}

function startListening() {
  if (!recognition) return;
  if (synth.speaking) synth.cancel();
  state.listening = true;
  $('mic-btn').classList.add('listening');
  $('voice-wave').classList.add('active');
  $('mic-label').innerHTML = '🎤 <span class="tap">Listening...</span>';
  setCharState('listening', '👂 Listening...');
  try { recognition.start(); } catch(e) {}
}

function stopListening() {
  state.listening = false;
  $('mic-btn').classList.remove('listening');
  $('voice-wave').classList.remove('active');
  $('mic-label').innerHTML = '👆 <span class="tap">Tap & speak</span>';
  try { recognition.stop(); } catch(e) {}
}

// ============ VOICE: TTS ============
const synth = window.speechSynthesis;

function speakText(text) {
  if (!synth) return;
  if (synth.speaking) synth.cancel();
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 0.9;
  utterance.pitch = 1.1;
  const voices = synth.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en')) || voices[0];
  if (preferred) utterance.voice = preferred;
  utterance.onstart = () => setCharState('talking', '🗣️ Teaching...');
  utterance.onend = () => setCharState('idle', '🤓 Your turn!');
  utterance.onerror = () => setCharState('idle', '🤓 Ready');
  synth.speak(utterance);
}

// ============ CHARACTER ============
function setCharState(st, label) {
  const c = $('char-container');
  c.classList.remove('talking', 'listening', 'thinking', 'happy');
  if (st !== 'idle') c.classList.add(st);
  $('char-state').textContent = label;
}

// ============ BOOTSTRAP ============
document.addEventListener('DOMContentLoaded', () => {
  initHome();
  initSpeechRec();
  if (synth) {
    synth.getVoices();
    synth.onvoiceschanged = () => synth.getVoices();
  }
});
