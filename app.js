// ============================================================
// Cikgu Hoot - AI Virtual Tutor
// ============================================================

// --- Configuration ---
const TUTOR_API = 'http://172.16.2.1:8001/api/tutor';  // VPS proxy (add domain later)
const CONFIG = {
  kids: [
    { id: 'alya',  name: 'Alya',  grade: 'Form 1 · 13 y/o', avatar: '👩', color: '#c084fc', subjects: ['Math', 'Science'] },
    { id: 'afeef', name: 'Afeef', grade: 'Year 6 · 11 y/o', avatar: '👦', color: '#60a5fa', subjects: ['Math', 'Science'] },
    { id: 'ayza',  name: 'Ayza',  grade: 'Year 4 · 10 y/o', avatar: '👧', color: '#f472b6', subjects: ['Math', 'Science'] },
  ],
  subjects: {
    'Math':    { icon: '🔢', desc: 'Numbers, operations, shapes' },
    'Science': { icon: '🔬', desc: 'Living things, energy, matter' },
    'English': { icon: '📖', desc: 'Grammar, reading, writing' },
  }
};

// --- State ---
let state = {
  kid: null,
  subject: null,
  listening: false,
  speaking: false,
  convHistory: [],
  sessionKey: null,
};

// --- DOM refs ---
const $ = id => document.getElementById(id);

// --- Init Home ---
function initHome() {
  const grid = $('kids-grid');
  grid.innerHTML = '<h2>👋 Who\'s learning today?</h2>';
  CONFIG.kids.forEach(k => {
    const card = document.createElement('div');
    card.className = 'kid-card';
    card.innerHTML = `
      <div class="kid-avatar" style="background:${k.color}22">${k.avatar}</div>
      <div class="kid-info">
        <div class="kid-name">${k.name}</div>
        <div class="kid-grade">${k.grade}</div>
      </div>
      <div class="kid-go">›</div>`;
    card.onclick = () => showSubjects(k);
    grid.appendChild(card);
  });
}

function showSubjects(kid) {
  state.kid = kid;
  const panel = $('subject-panel');
  panel.style.display = 'flex';
  $('selected-kid-name').textContent = `${kid.avatar} ${kid.name} — Pick a subject`;

  const list = $('subject-list');
  list.innerHTML = '';
  kid.subjects.forEach(s => {
    const subj = CONFIG.subjects[s];
    const card = document.createElement('div');
    card.className = 'subj-card';
    card.innerHTML = `
      <span class="subj-icon">${subj.icon}</span>
      <div class="subj-info">
        <div class="subj-name">${s}</div>
        <div class="subj-desc">${subj.desc}</div>
      </div>
      <span class="subj-arrow">›</span>`;
    card.onclick = () => launchTutor(kid, s);
    list.appendChild(card);
  });
}

function backToKids() {
  $('subject-panel').style.display = 'none';
}

// --- Launch Tutor ---
function launchTutor(kid, subject) {
  state.kid = kid;
  state.subject = subject;
  state.convHistory = [];
  state.sessionKey = `${kid.id}-${subject}-${Date.now()}`;

  $('home-screen').style.display = 'none';
  $('tutor-screen').style.display = 'flex';
  $('tutor-subject').textContent = `${CONFIG.subjects[subject].icon} ${subject}`;
  $('tutor-student').textContent = `${kid.avatar} ${kid.name}`;
  $('tutor-status-badge').textContent = '🟢 Online';

  // Reset chat
  $('chat-msgs').innerHTML = `
    <div class="msg tutor-msg">
      Hoot hoot! 🦉 I'm Cikgu Hoot, your ${subject} tutor!<br><br>
      ${kid.name}, tap the mic and tell me what you want to learn today!
    </div>`;

  setCharState('idle', '🤓 Ready to teach!');

  // Auto-send first greeting to Hermes to start session
  greetTutor(kid, subject);
}

function exitTutor() {
  if (state.listening) stopListening();
  if (synth.speaking) synth.cancel();
  $('tutor-screen').style.display = 'none';
  $('home-screen').style.display = 'flex';
  state.convHistory = [];
}

// --- Greet Tutor ---
async function greetTutor(kid, subject) {
  const msg = `I'm ${kid.name}, a ${kid.grade} student. I want to learn ${subject} today. Can you teach me?`;
  await sendToTutor(msg, true);
}

// --- Send to Hermes API ---
async function sendToTutor(text, quiet=false) {
  if (!quiet) {
    addMsg(text, 'kid');
    setCharState('thinking', '🤔 Thinking...');
    $('typing-ind').style.display = 'flex';
  }

  const systemPrompt = `You are Cikgu Hoot 🦉, a friendly and patient AI tutor for Malaysian KSSR students.
You are currently teaching ${state.subject} to ${state.kid.name}, who is ${state.kid.grade}.

RULES:
- Be warm, encouraging, and use emojis
- Explain concepts step by step like a real tutor
- Give examples the student can relate to
- Ask questions to check understanding
- If the student gets it wrong, explain why kindly
- Use SIMPLE English suitable for the student's age
- Keep responses concise (2-4 sentences typically)
- NEVER give answers directly — guide the student to figure it out
- Reference the KSSR syllabus where relevant
- At the end of a lesson, suggest what to learn next`;

  try {
    const resp = await fetch(TUTOR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [
          ...state.convHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: text }
        ],
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API ${resp.status}: ${errText.slice(0,100)}`);
    }

    const data = await resp.json();
    const reply = data.content || 'Hoot! I had trouble with that. Try again?';

    state.convHistory.push({ role: 'user', content: text });
    state.convHistory.push({ role: 'assistant', content: reply });
    $('typing-ind').style.display = 'none';

    // Show reply
    addMsg(reply, 'tutor');
    setCharState('talking', '🗣️ Teaching...');

    // Speak it aloud
    speakText(reply);

  } catch (err) {
    $('typing-ind').style.display = 'none';
    const fallback = `Hoot! I'm having trouble connecting to my brain right now 🫤. Please check your internet and try again.`;
    addMsg(fallback, 'tutor');
    setCharState('idle', '🤓 Ready');
    console.error('Tutor API error:', err);
  }
}

// --- Add Message to Chat ---
function addMsg(text, type) {
  const msgs = $('chat-msgs');
  const div = document.createElement('div');
  div.className = `msg ${type}-msg`;

  if (type === 'kid') {
    div.innerHTML = `<span class="transcribed">🎤 You said:</span>${escapeHtml(text)}`;
  } else {
    // Render emojis and line breaks
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

// ============================================================
// VOICE: Speech-to-Text (STT)
// ============================================================
let recognition = null;
let recognitionRestartTimer = null;

function initSpeechRec() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $('mic-label').innerHTML = '❌ Voice not supported on this browser';
    $('mic-btn').style.opacity = '0.4';
    $('mic-btn').disabled = true;
    return false;
  }

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    $('mic-label').textContent = final || '🎤 Listening...';
    if (final) {
      stopListening();
      sendToTutor(final.trim());
    }
  };

  recognition.onerror = (e) => {
    console.error('STT error:', e.error);
    stopListening();
    if (e.error === 'no-speech') {
      $('mic-label').innerHTML = '👆 <span class="tap">Tap & speak</span>';
    } else {
      $('mic-label').textContent = '⚠️ Try again';
    }
  };

  recognition.onend = () => {
    if (state.listening) {
      // Auto-restart if still supposed to be listening
      try { recognition.start(); } catch(e) {}
    }
  };

  return true;
}

function toggleMic() {
  if (state.listening) {
    stopListening();
  } else {
    startListening();
  }
}

function startListening() {
  if (!recognition) { $('mic-label').textContent = '❌ Voice not supported'; return; }
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

// ============================================================
// VOICE: Text-to-Speech (TTS)
// ============================================================
const synth = window.speechSynthesis;
let ttsQueue = [];

function speakText(text) {
  if (!synth) return;

  // Cancel any existing speech
  if (synth.speaking) synth.cancel();

  // Strip emojis from TTS (they sound weird)
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 0.9;
  utterance.pitch = 1.1;
  utterance.volume = 1;

  // Try to find a good English voice
  const voices = synth.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
                 || voices.find(v => v.lang.startsWith('en'))
                 || voices[0];
  if (preferred) utterance.voice = preferred;

  utterance.onstart = () => {
    state.speaking = true;
    setCharState('talking', '🗣️ Teaching...');
  };

  utterance.onend = () => {
    state.speaking = false;
    setCharState('idle', '🤓 Your turn!');
  };

  utterance.onerror = () => {
    state.speaking = false;
    setCharState('idle', '🤓 Ready');
  };

  synth.speak(utterance);
}

// ============================================================
// Character Animation
// ============================================================
function setCharState(st, label) {
  const c = $('char-container');
  c.classList.remove('talking', 'listening', 'thinking', 'happy', 'idle');
  if (st !== 'idle') c.classList.add(st);
  $('char-state').textContent = label;
}

// ============================================================
// Bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initHome();
  initSpeechRec();

  // Load voices async
  if (synth) {
    synth.getVoices(); // trigger load
    synth.onvoiceschanged = () => synth.getVoices();
  }
});
