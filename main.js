let config = null;

// DOM Elements
const itemsStrip = document.getElementById('items-strip');
const rollButton = document.getElementById('roll-button');
const modal = document.getElementById('winner-modal');
const closeModal = document.getElementById('close-modal');
const winnerImg = document.getElementById('winner-img');
const winnerName = document.getElementById('winner-name');
const caseContainer = document.querySelector('.case-container');

// UI Elements for Config
const uiLogo = document.getElementById('ui-logo');
const uiModalTitle = document.getElementById('ui-modal-title');

// Settings Elements
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const prizesContainer = document.getElementById('prizes-container');
const addPrizeBtn = document.getElementById('add-prize-btn');

// State
let isRolling = false;
let currentTranslate = 0;
let mainAudio = null;
let lastTickIndex = -1;
let lastTickTime = 0;
let audioCtx = null;
let tickBuffer = null;
let currentTickSource = null;
let inactivityTimer = null;
let isScreensaverVisible = false;
let isScreensaverFading = false;
const screensaverOverlay = document.getElementById('screensaver');

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);

  if (isScreensaverVisible) {
    hideScreensaver();
  }

  const isActivelySpinning = isRolling && modal.classList.contains('hidden');
  if (isActivelySpinning) return;

  if (config && config.screensaver && config.screensaver.timeout > 0) {
    inactivityTimer = setTimeout(showScreensaver, config.screensaver.timeout * 1000);
  }
}

function showScreensaver() {
  if (!config || !config.screensaver || !config.screensaver.mediaPath) return;

  if (!modal.classList.contains('hidden')) {
    closeWinnerModal();
  }
  if (!settingsModal.classList.contains('hidden')) {
    settingsModal.classList.add('hidden');
  }

  screensaverOverlay.innerHTML = '';
  const path = config.screensaver.mediaPath.toLowerCase();

  if (path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.ogg')) {
    const video = document.createElement('video');
    video.src = config.screensaver.mediaPath;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    screensaverOverlay.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = config.screensaver.mediaPath;
    screensaverOverlay.appendChild(img);
  }

  isScreensaverVisible = true;
  screensaverOverlay.classList.remove('hidden');
}

function hideScreensaver() {
  isScreensaverVisible = false;
  isScreensaverFading = true;
  screensaverOverlay.classList.add('hidden');
  setTimeout(() => {
    isScreensaverFading = false;
    if (!isScreensaverVisible) {
      screensaverOverlay.innerHTML = '';
    }
  }, 1000);
}

// Activity listeners
['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    const wasVisible = isScreensaverVisible;
    resetInactivityTimer();

    if (evt === 'keydown' && e.code === 'Enter' && wasVisible) {
      e.stopImmediatePropagation();
      setTimeout(() => {
        if (!isRolling && modal.classList.contains('hidden') && settingsModal.classList.contains('hidden')) {
          startRoll();
        }
      }, 1000);
    }
  }, { capture: true });
});

async function loadConfig() {
  try {
    const res = await fetch('/config.json');
    config = await res.json();
    applyConfigToUI();
    await loadTickAudio();
    initCase();
    resetInactivityTimer();
  } catch (err) {
    console.error('Failed to load config', err);
    alert('Could not load configuration. Ensure backend is running.');
  }
}

function applyConfigToUI() {
  uiLogo.src = config.images.logo || '/logo.png';
  uiLogo.style.maxWidth = (config.images.logoSize || 300) + 'px';
  rollButton.textContent = config.texts.rollButton;
  uiModalTitle.textContent = config.texts.modalTitle;
  closeModal.textContent = config.texts.acceptButton;
  document.title = config.texts.title;
}

async function loadTickAudio() {
  const tickPath = config.sounds.tickSound;
  if (!tickPath) {
    tickBuffer = null;
    return;
  }
  try {
    const res = await fetch(tickPath);
    if (!res.ok) return;
    const arrayBuffer = await res.arrayBuffer();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    tickBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('Could not load tick audio:', err);
  }
}

function playTickSound() {
  if (!tickBuffer || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = performance.now();
  let deltaSec = tickBuffer.duration;

  if (lastTickTime) {
    const delta = now - lastTickTime;
    if (delta > 0) {
      deltaSec = delta / 1000;
    }
  }
  lastTickTime = now;

  if (currentTickSource) {
    try { currentTickSource.stop(); } catch (e) { }
  }

  const source = audioCtx.createBufferSource();
  source.buffer = tickBuffer;
  source.connect(audioCtx.destination);

  let offset = 0;
  let playDuration = tickBuffer.duration;

  // Если времени на проигрывание меньше чем длина звука, берем кусок из центра
  if (deltaSec < tickBuffer.duration) {
    playDuration = deltaSec;
    offset = (tickBuffer.duration / 2) - (playDuration / 2);
  }

  source.start(0, offset, playDuration);
  currentTickSource = source;
}

function checkTicks() {
  if (!isRolling) return;
  const style = window.getComputedStyle(itemsStrip);
  // Using DOMMatrix to get current transform value
  const matrix = new DOMMatrixReadOnly(style.transform);
  const currentX = matrix.m41;
  const containerWidth = caseContainer.clientWidth;

  const pointInStrip = (containerWidth / 2) - currentX;
  const currentIndex = Math.floor(pointInStrip / 200);

  if (lastTickIndex !== -1 && currentIndex > lastTickIndex) {
    playTickSound();
  }
  lastTickIndex = currentIndex;

  requestAnimationFrame(checkTicks);
}


function getRandomPrize() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const prize of config.prizes) {
    cumulative += parseFloat(prize.probability);
    if (rand < cumulative) {
      return prize;
    }
  }
  return config.prizes[config.prizes.length - 1]; // Fallback
}

function createItemElement(prize) {
  const div = document.createElement('div');
  div.className = 'item';
  div.dataset.rarity = prize.id;

  const img = document.createElement('img');
  img.src = prize.src;
  img.onerror = () => {
    img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPj88L3RleHQ+PC9zdmc+';
  };

  div.appendChild(img);
  return div;
}

function initCase() {
  itemsStrip.innerHTML = '';
  itemsStrip.style.transition = 'none';
  itemsStrip.style.transform = 'translateX(0px)';
  currentTranslate = 0;

  // Fill initial items
  for (let i = 0; i < 20; i++) {
    itemsStrip.appendChild(createItemElement(getRandomPrize()));
  }
}

function startRoll() {
  if (isRolling || !config) return;
  isRolling = true;
  rollButton.disabled = true;
  
  // Clear timer so screensaver doesn't appear during the 6s spin
  if (inactivityTimer) clearTimeout(inactivityTimer);

  // Audio
  if (config.sounds.mainSpinSound) {
    mainAudio = new Audio(config.sounds.mainSpinSound);
    mainAudio.play().catch(e => console.warn('Audio play prevented:', e));
  }

  const winningPrize = getRandomPrize();

  // We append more items to the strip dynamically so it doesn't jump
  // 60 items will be added for the spin
  const itemsToAdd = 60;
  const currentChildCount = itemsStrip.children.length;
  const winningIndex = currentChildCount + itemsToAdd - 10; // place winner 10 items before the end of the new batch

  for (let i = currentChildCount; i < currentChildCount + itemsToAdd; i++) {
    let prize = (i === winningIndex) ? winningPrize : getRandomPrize();
    itemsStrip.appendChild(createItemElement(prize));
  }

  const itemWidth = 200;
  const containerWidth = caseContainer.clientWidth;
  const winningItemCenter = (winningIndex * itemWidth) + (itemWidth / 2);
  const randomOffset = (Math.random() * 160) - 80;

  currentTranslate = -(winningItemCenter - (containerWidth / 2) + randomOffset);

  // Animate
  itemsStrip.style.transition = 'transform 6s cubic-bezier(0.15, 0.85, 0.1, 1)';
  itemsStrip.style.transform = `translateX(${currentTranslate}px)`;

  // Start tick tracking
  lastTickIndex = -1;
  lastTickTime = 0;
  requestAnimationFrame(checkTicks);

  setTimeout(() => {
    // Play drop sound
    if (winningPrize.sound) {
      const dropAudio = new Audio(winningPrize.sound);
      dropAudio.play().catch(e => console.warn('Drop audio prevented:', e));
    }
    showWinner(winningPrize);
  }, 6100);
}

function showWinner(prize) {
  winnerImg.src = prize.src;
  winnerImg.onerror = () => {
    winnerImg.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPj88L3RleHQ+PC9zdmc+';
  };
  winnerName.textContent = prize.name;
  winnerName.className = `rarity-text ${prize.rarityClass}`;

  modal.classList.remove('hidden');
  resetInactivityTimer(); // Restart timer now that modal is open
}

function closeWinnerModal() {
  modal.classList.add('hidden');
  rollButton.disabled = false;
  if (mainAudio) {
    mainAudio.pause();
    mainAudio.currentTime = 0;
  }

  // Cleanup off-screen DOM elements to prevent infinite DOM growth
  setTimeout(() => {
    const itemsToRemove = itemsStrip.children.length - 20;
    if (itemsToRemove > 0) {
      // Remove from beginning
      for (let i = 0; i < itemsToRemove; i++) {
        itemsStrip.removeChild(itemsStrip.firstElementChild);
      }
      // Adjust translation instantly
      currentTranslate += (itemsToRemove * 200);
      itemsStrip.style.transition = 'none';
      itemsStrip.style.transform = `translateX(${currentTranslate}px)`;
    }
    isRolling = false; // Allow next roll only after cleanup is done
  }, 500); // Wait for modal fade out
}

// Controls
rollButton.addEventListener('click', startRoll);
closeModal.addEventListener('click', closeWinnerModal);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    if (isScreensaverFading) return;
    
    if (!isRolling && modal.classList.contains('hidden') && settingsModal.classList.contains('hidden')) {
      startRoll();
    } else if (!modal.classList.contains('hidden')) {
      closeWinnerModal();
    }
  }
});

// ------------- SETTINGS LOGIC ------------- //

function renderSettings() {
  document.getElementById('set-logo-path').value = config.images.logo || '';
  document.getElementById('set-logo-size').value = config.images.logoSize || 300;
  document.getElementById('set-roll-btn').value = config.texts.rollButton || '';
  document.getElementById('set-modal-title').value = config.texts.modalTitle || '';
  document.getElementById('set-accept-btn').value = config.texts.acceptButton || '';
  document.getElementById('set-main-sound').value = config.sounds.mainSpinSound || '';
  document.getElementById('set-tick-sound').value = config.sounds.tickSound || '';

  const ss = config.screensaver || {};
  document.getElementById('set-screensaver-timeout').value = ss.timeout || '';
  document.getElementById('set-screensaver-media').value = ss.mediaPath || '';

  prizesContainer.innerHTML = `
    <div class="prize-row" style="font-weight:bold; background:none;">
      <div>ID</div>
      <div>Prob (%)</div>
      <div>Image Src</div>
      <div>Name & Class</div>
      <div>Sound Src</div>
      <div>Action</div>
    </div>
  `;

  config.prizes.forEach((prize, index) => {
    addPrizeRow(prize, index);
  });
}

function addPrizeRow(prize = {}, index = Date.now()) {
  const row = document.createElement('div');
  row.className = 'prize-row';
  row.innerHTML = `
    <input type="number" class="p-id" value="${prize.id || index}" />
    <input type="number" step="0.01" class="p-prob" value="${prize.probability || 0}" />
    <input type="text" class="p-img" value="${prize.src || ''}" placeholder="/prizes/x.png" />
    <input type="text" class="p-name" value="${prize.name || ''}" placeholder="Name" />
    <input type="text" class="p-sound" value="${prize.sound || ''}" placeholder="/sounds/x.mp3" />
    <button class="remove-btn">X</button>
  `;

  // Hidden input for rarity class
  const classInput = document.createElement('input');
  classInput.type = 'hidden';
  classInput.className = 'p-class';
  classInput.value = prize.rarityClass || 'rarity-3';
  row.appendChild(classInput);

  row.querySelector('.remove-btn').addEventListener('click', () => {
    row.remove();
  });
  prizesContainer.appendChild(row);
}

openSettingsBtn.addEventListener('click', () => {
  renderSettings();
  settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

addPrizeBtn.addEventListener('click', () => addPrizeRow());

saveSettingsBtn.addEventListener('click', async () => {
  const newConfig = {
    texts: {
      title: config.texts.title, // keep hidden
      rollButton: document.getElementById('set-roll-btn').value,
      modalTitle: document.getElementById('set-modal-title').value,
      acceptButton: document.getElementById('set-accept-btn').value
    },
    images: {
      logo: document.getElementById('set-logo-path').value,
      logoSize: parseInt(document.getElementById('set-logo-size').value) || 300
    },
    sounds: {
      mainSpinSound: document.getElementById('set-main-sound').value,
      tickSound: document.getElementById('set-tick-sound').value
    },
    screensaver: {
      timeout: parseInt(document.getElementById('set-screensaver-timeout').value) || 0,
      mediaPath: document.getElementById('set-screensaver-media').value
    },
    prizes: []
  };

  const rows = prizesContainer.querySelectorAll('.prize-row:not(:first-child)');
  rows.forEach(row => {
    newConfig.prizes.push({
      id: parseInt(row.querySelector('.p-id').value) || 0,
      probability: parseFloat(row.querySelector('.p-prob').value) || 0,
      src: row.querySelector('.p-img').value,
      name: row.querySelector('.p-name').value,
      sound: row.querySelector('.p-sound').value,
      rarityClass: row.querySelector('.p-class').value
    });
  });

  try {
    saveSettingsBtn.textContent = 'Saving...';
    const res = await fetch('/api/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    });

    if (res.ok) {
      config = newConfig;
      applyConfigToUI();
      await loadTickAudio();
      initCase();
      resetInactivityTimer();
      settingsModal.classList.add('hidden');
    } else {
      alert('Failed to save configuration');
    }
  } catch (e) {
    alert('Error saving configuration');
    console.error(e);
  } finally {
    saveSettingsBtn.textContent = 'Save Changes';
  }
});

// Boot
document.getElementById('set-logo-size').addEventListener('input', (e) => {
  uiLogo.style.maxWidth = e.target.value + 'px';
});

loadConfig();
