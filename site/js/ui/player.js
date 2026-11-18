// Плеер внизу экрана для рассказов: выбор голоса, скорость, караоке, «пауза для повтора».
//
// Использование:
//   App.player.show(story)                     — показать плеер для рассказа
//   App.player.onSentenceChange(index => ...)  — сообщает, какое предложение звучит (0 = заголовок)
//   App.player.playSentence(5)                 — проиграть с 5-го предложения
//   App.player.hide()
App.module("player", function () {
  "use strict";

  const { storage } = App;
  const box = document.getElementById("player");
  const audio = document.getElementById("playerAudio");
  const titleLine = document.getElementById("playerTitle");
  const voiceButtons = document.getElementById("playerVoices");
  const speedButtons = document.getElementById("playerSpeed");
  const karaokeToggle = document.getElementById("followToggle");
  const repeatToggle = document.getElementById("repeatToggle");

  let tracks = [];            // записи рассказа разными голосами
  let track = null;           // текущая запись { voice, src, timings: [[start, end], ...] }
  let currentSentence = -1;
  let sentenceListener = null;
  let errorListener = null;      // вызывается, если mp3 не загрузился
  let repeatTimer = null;
  let pausedAfterSentence = -1;

  // ---------- настройки (запоминаются) ----------
  let speed = storage.get("rate", 1);
  let karaoke = storage.get("follow", true);
  let repeatMode = storage.get("repeat", false);
  karaokeToggle.checked = karaoke;
  repeatToggle.checked = repeatMode;

  karaokeToggle.addEventListener("change", () => {
    karaoke = karaokeToggle.checked;
    storage.set("follow", karaoke);
    if (!karaoke) setCurrentSentence(-1);
  });
  repeatToggle.addEventListener("change", () => {
    repeatMode = repeatToggle.checked;
    storage.set("repeat", repeatMode);
  });
  speedButtons.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
    speed = Number(button.dataset.rate);
    storage.set("rate", speed);
    applySpeed();
  }));
  function applySpeed() {
    audio.playbackRate = speed;
    speedButtons.querySelectorAll("button").forEach(b => b.classList.toggle("active", Number(b.dataset.rate) === speed));
  }
  audio.addEventListener("loadedmetadata", applySpeed);
  applySpeed();

  // ---------- показать / скрыть ----------
  function show(story) {
    tracks = story.audio || [];
    if (!tracks.length) { hide(); return; }
    titleLine.textContent = "🔊 " + story.title;
    renderVoiceButtons();
    currentSentence = -1;
    selectTrack(storage.get("voice", tracks[0].voice), false);
    box.hidden = false;
    document.body.classList.add("has-player");
  }

  function hide() {
    clearTimeout(repeatTimer);
    audio.pause();
    track = null;
    sentenceListener = null;
    errorListener = null;
    box.hidden = true;
    document.body.classList.remove("has-player");
  }

  function renderVoiceButtons() {
    voiceButtons.innerHTML = "";
    tracks.forEach(t => {
      const button = App.dom.button("", t.label, () => {
        storage.set("voice", t.voice);
        selectTrack(t.voice, true);
      });
      button.dataset.voice = t.voice;
      voiceButtons.append(button);
    });
    voiceButtons.hidden = tracks.length < 2;
  }

  /** Переключить голос. При смене во время прослушивания продолжаем с того же предложения. */
  function selectTrack(voice, continuePlaying) {
    const next = tracks.find(t => t.voice === voice) || tracks[0];
    const wasPlaying = continuePlaying && !audio.paused;
    const sentence = currentSentence;
    track = next;

    if (audio.getAttribute("src") !== next.src) {
      audio.src = next.src;
      audio.addEventListener("loadedmetadata", function resume() {
        audio.removeEventListener("loadedmetadata", resume);
        if (continuePlaying && next.timings && sentence >= 0) audio.currentTime = next.timings[sentence][0];
        if (wasPlaying) audio.play().catch(() => {});
      });
    }
    voiceButtons.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.voice === next.voice));
    document.getElementById("followWrap").hidden = !next.timings;
    document.getElementById("repeatWrap").hidden = !next.timings;
  }

  // ---------- караоке ----------
  const hasTimings = () => Boolean(track && track.timings);

  /** Какое предложение звучит в момент time (-1, если до начала). */
  function sentenceAt(time) {
    const timings = track.timings;
    for (let i = 0; i < timings.length; i++) {
      const [start, end] = timings[i];
      if (time < start - 0.05) return i - 1;
      if (time <= end + 0.3) return i;
    }
    return timings.length - 1;
  }

  function setCurrentSentence(index) {
    if (index === currentSentence) return;
    currentSentence = index;
    if (sentenceListener) sentenceListener(index);
  }

  audio.addEventListener("timeupdate", () => {
    if (!hasTimings()) return;
    const index = sentenceAt(audio.currentTime);
    if (karaoke) setCurrentSentence(index);

    // «Пауза для повтора»: после каждого предложения — пауза такой же длины, чтобы повторить вслух
    if (repeatMode && index >= 1 && pausedAfterSentence !== index && audio.currentTime >= track.timings[index][1] - 0.05) {
      pausedAfterSentence = index;
      audio.pause();
      const [start, end] = track.timings[index];
      const waitMs = (end - start) / speed * 1000 + 600;
      const sameTrack = track;
      repeatTimer = setTimeout(() => { if (track === sameTrack) audio.play().catch(() => {}); }, waitMs);
    }
  });
  audio.addEventListener("seeking", () => { clearTimeout(repeatTimer); pausedAfterSentence = -1; });
  audio.addEventListener("ended", () => setCurrentSentence(-1));
  // Файл не найден / повреждён — сообщаем странице, чтобы она включила голос браузера
  audio.addEventListener("error", () => { if (track && errorListener) errorListener(); });

  function playSentence(index) {
    if (!hasTimings() || !track.timings[index]) return;
    clearTimeout(repeatTimer);
    pausedAfterSentence = -1;
    audio.currentTime = track.timings[index][0];
    audio.play().catch(() => {});
    setCurrentSentence(index);
  }

  return {
    show, hide, playSentence, hasTimings,
    onSentenceChange: listener => { sentenceListener = listener; },
    onAudioError: listener => { errorListener = listener; },
    isPlaying: () => !audio.paused,
    isKaraokeOn: () => karaoke,
    height: () => box.offsetHeight,
  };
});
