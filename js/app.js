document.addEventListener("DOMContentLoaded", () => {
  const genreContainer = document.getElementById("genre-buttons");
  const phraseBox = document.getElementById("phrase-box");
  const nextBtn = document.getElementById("next-btn");

  let phrases = {};
  let currentGenre = null;
  let currentIndex = 0;

  fetch("data/phrases.json")
    .then(res => res.json())
    .then(data => {
      phrases = data;
      createGenreButtons();
    })
    .catch(err => {
      console.error("Ошибка загрузки JSON:", err);
      phraseBox.textContent = "Не удалось загрузить фразы.";
    });

  function createGenreButtons() {
    for (const genre in phrases) {
      const btn = document.createElement("button");
      btn.textContent = genre;
      btn.className = "genre-btn";
      btn.addEventListener("click", () => selectGenre(genre, btn));
      genreContainer.appendChild(btn);
    }
  }

  function selectGenre(genre, btn) {
    currentGenre = genre;
    currentIndex = 0;
    document.querySelectorAll(".genre-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    showPhrase();
    nextBtn.style.display = "inline-block";
  }

  nextBtn.addEventListener("click", showPhrase);

  function showPhrase() {
    const arr = phrases[currentGenre];
    if (!arr) return;
    phraseBox.textContent = arr[currentIndex];
    currentIndex = (currentIndex + 1) % arr.length;
  }
});
