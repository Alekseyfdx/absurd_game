"use strict";

const genres = {
  absurd: "Абсурд",
  horror: "Ужасы",
  kids: "Детское",
  romance: "Романтика",
  sex: "18+",
  street: "Улица"
};

const genreButtonsDiv = document.getElementById("genre-buttons");
const phraseBox = document.getElementById("phrase-box");
const nextBtn = document.getElementById("next-btn");

let phrases = [];
let currentIndex = 0;

Object.entries(genres).forEach(([key, label]) => {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className = "genre-btn";
  btn.addEventListener("click", () => loadGenre(key));
  genreButtonsDiv.appendChild(btn);
});

function setActiveGenreButton(key) {
  document.querySelectorAll(".genre-btn").forEach(b => {
    b.classList.toggle("active", b.textContent.trim() === genres[key]);
  });
}

function revealPhrase(text) {
  phraseBox.innerHTML = `<span class="typewriter"><span class="typewriter-text">${text}</span></span>`;
  phraseBox.classList.remove("reveal");
  void phraseBox.offsetWidth;
  phraseBox.classList.add("reveal");
  if (navigator.vibrate) navigator.vibrate(10);
}

async function loadGenre(genreKey) {
  try {
    setActiveGenreButton(genreKey);
    const res = await fetch(`data/${genreKey}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Неверный формат JSON");
    phrases = data;
    currentIndex = 0;
    revealPhrase(phrases[currentIndex]);
    nextBtn.style.display = "inline-block";
  } catch (err) {
    phraseBox.textContent = `Ошибка: ${err.message}`;
    console.error("Fetch error:", err);
  }
}

nextBtn.addEventListener("click", () => {
  if (!phrases.length) return;
  currentIndex = (currentIndex + 1) % phrases.length;
  revealPhrase(phrases[currentIndex]);
});
