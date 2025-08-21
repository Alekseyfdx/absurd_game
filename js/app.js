/* YuGame Ц main script
   ------------------------------------------------------
   ? Gmail Sign-In (Google Identity Services)
   ? Lazy-загрузка json-фраз по жанрам
   ? Ћокальное сохранение последнего жанра
   ? јнимаци¤ по¤влени¤ фразы
   ? PWA / sw регистраци¤
   ? ћини-чат с Gemini API (абсурд-режим)
------------------------------------------------------*/
(() => {
  'use strict';

  /* ---------- DOM refs ---------- */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const categoryGrid = $('#categoryGrid');
  const phraseTxt    = $('#phraseText');
  const nextBtn      = $('#nextBtn');
  const signinPanel  = $('#signinPanel');
  const userBox      = $('#userBox');

  /* ---------- App state ---------- */
  const STATE = {
    genres : [
      'absurd','adult','horror','kids','movies',
      'romance','sport','street','tiktok','wisdom'
    ],
    dataCache : {},          // { genre : [phrases] }
    current   : null,        // выбранный жанр
    jwt       : null         // учЄтка Google
  };

  /* ---------- 1. Build category buttons ---------- */
  function buildCategories () {
    const frag = document.createDocumentFragment();
    STATE.genres.forEach(g => {
      const btn = document.createElement('button');
      btn.textContent = g;
      btn.className   = `category-btn ${g}`;
      btn.setAttribute('role','listitem');
      btn.dataset.genre = g;
      btn.addEventListener('click', onGenreClick);
      frag.append(btn);
    });
    categoryGrid.append(frag);

    // restore last
    const last = localStorage.getItem('yg_lastGenre');
    if (last && STATE.genres.includes(last)) selectGenre(last);
  }

  /* ---------- 2. Genre selection ---------- */
  function onGenreClick (e) {
    const genre = e.currentTarget.dataset.genre;
    selectGenre(genre);
  }

  function selectGenre (genre) {
    // aria-pressed
    $$('[data-genre]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.genre === genre)
    );
    STATE.current = genre;
    localStorage.setItem('yg_lastGenre', genre);
    phraseTxt.textContent = '∆ми Ђ—ледующа¤ фразаї!';
  }

  /* ---------- 3. Load phrases JSON ---------- */
  async function loadPhrases (genre) {
    if (STATE.dataCache[genre]) return STATE.dataCache[genre];
    try {
      const res = await fetch(`/data/phrases_${genre}.json`);
      const json = await res.json();
      STATE.dataCache[genre] = json;
      return json;
    } catch {
      console.error('Cannot load phrases JSON');
      return ['ќшибка загрузки фраз, ой-ой.'];
    }
  }

  /* ---------- 4. Next phrase ---------- */
  nextBtn.addEventListener('click', async () => {
    if (!STATE.current) { alert('—начала выберите жанр'); return; }
    const arr = await loadPhrases(STATE.current);
    const phrase = arr[Math.floor(Math.random()*arr.length)];
    phraseTxt.classList.remove('show');   // reset anim
    void phraseTxt.offsetWidth;           // reflow
    phraseTxt.textContent = phrase;
    phraseTxt.classList.add('show');
  });

  /* ---------- 5. Google Sign-In ---------- */
  window.onGoogleCredential = async ({ credential }) => {
    // simple decode base64 payload
    const payload = JSON.parse(atob(credential.split('.')[1]));
    STATE.jwt = credential;
    signinPanel.classList.add('hidden');
    userBox.innerHTML = `
      <img src="${payload.picture}" alt="${payload.name}" width="28" height="28" style="border-radius:50%">
      <span>${payload.given_name || payload.name}</span>
    `;
    $('#gameUI').classList.remove('hidden');
  };

  /* ---------- 6. PWA Service Worker ---------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }

  /* ---------- 7. Chat w/ Gemini ---------- */
  const chat = {
    btn   : $('#chatBtn'),
    win   : $('#chatWindow'),
    close : $('#chatClose'),
    form  : $('#chatForm'),
    input : $('#chatInput'),
    log   : $('#chatLog')
  };

  chat.btn.onclick  = () => chat.win.classList.toggle('hidden');
  chat.close.onclick = () => chat.win.classList.add('hidden');

  chat.form.addEventListener('submit', async e => {
    e.preventDefault();
    const txt = chat.input.value.trim();
    if (!txt) return;
    appendMsg('user', txt);
    chat.input.value = '';

    appendMsg('bot', '...');
    const botP = chat.log.lastElementChild;

    try {
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+window.GEMINI_API_KEY,
        {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            contents:[
              {parts:[{text:"You are ABSURD GPT. Answer absurdly in max 25 words."}]},
              {parts:[{text:txt}]}
            ]
          })
        });
      const json = await resp.json();
      const answer = json.candidates?.[0]?.content?.parts?.[0]?.text || '??Етишина абсурда';
      botP.textContent = answer;
    } catch(err){
      botP.textContent = '?? ошибка св¤зи с вселенной.';
      console.error(err);
    }
  });

  function appendMsg(role,text){
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;
    chat.log.append(div);
    chat.log.scrollTop = chat.log.scrollHeight;
  }

  /* ---------- 8. Intro ---------- */
  buildCategories();
})();
