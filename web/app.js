const $ = (id) => document.getElementById(id);
const suits = ['♣', '♦', '♥', '♠'];
const rank = (card) => ['A','2','3','4','5','6','7','8','9','10','J','Q','K'][card % 13];
const cardName = (card) => `${rank(card)}${suits[Math.floor(card / 13)]}`;
const storageKey = 'suipi-table-v1';
let wasm, state, selectedHand = null, selectedFloor = [], kind = 'capture', hidden = true;
let saveAvailable = true;
const encoder = new TextEncoder(), decoder = new TextDecoder();

function engine(input) {
  const bytes = encoder.encode(JSON.stringify(input));
  const ptr = wasm.allocate(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  try {
    const output = wasm.request(ptr, bytes.length);
    return JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer, output, wasm.output_len())));
  } finally { wasm.release(ptr, bytes.length); }
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(engine({ type: 'save' }))); }
  catch { saveAvailable = false; }
  $('save-label').textContent = saveAvailable ? 'Saved on this device' : 'Saving unavailable';
}

function cardButton(card, index, area, selected) {
  const button = document.createElement('button');
  const suit = Math.floor(card / 13);
  button.className = `playing-card ${suit === 1 || suit === 2 ? 'red' : ''} ${selected ? 'selected' : ''}`;
  button.setAttribute('aria-label', `${cardName(card)} ${area === 'hand' ? 'in your hand' : 'on the table'}`);
  button.setAttribute('aria-pressed', String(selected));
  button.innerHTML = `<span class="rank">${rank(card)}</span><span class="corner-suit">${suits[suit]}</span><span class="center-suit" aria-hidden="true">${suits[suit]}</span><span class="bottom-rank" aria-hidden="true">${rank(card)}</span>`;
  button.disabled = hidden || state.finished;
  button.addEventListener('click', () => {
    if (area === 'hand') selectedHand = selectedHand === index ? null : index;
    else selectedFloor = selectedFloor.includes(index) ? selectedFloor.filter(i => i !== index) : [...selectedFloor, index];
    $('status').textContent = '';
    renderCards(); updateChoices();
  });
  return button;
}

function renderCards() {
  $('floor').replaceChildren();
  if (!state.finished) for (const pile of state.floor) {
    if (pile.cards.length === 1) $('floor').append(cardButton(pile.cards[0], pile.index, 'floor', selectedFloor.includes(pile.index)));
    else {
      const button = document.createElement('button');
      button.className = `pile ${selectedFloor.includes(pile.index) ? 'selected' : ''}`;
      button.setAttribute('aria-pressed', String(selectedFloor.includes(pile.index)));
      button.setAttribute('aria-label', `${pile.group ? 'Locked group' : 'Build'} of ${pile.value}: ${pile.cards.map(cardName).join(', ')}. Owned by Player ${pile.owner + 1}`);
      button.innerHTML = `<span class="pile-kind">${pile.group ? 'Locked group' : 'Build'}</span><strong>${pile.value}</strong><span class="pile-cards">${pile.cards.map(cardName).join(' · ')}</span><span class="pile-owner">Player ${pile.owner + 1}</span>`;
      button.disabled = hidden;
      button.onclick = () => { selectedFloor = selectedFloor.includes(pile.index) ? selectedFloor.filter(i => i !== pile.index) : [...selectedFloor,pile.index]; renderCards(); updateChoices(); };
      $('floor').append(button);
    }
  }
  if (!$('floor').children.length) {
    const p = document.createElement('p'); p.className = 'empty-floor';
    p.textContent = state.finished ? 'Good game. Time for another?' : 'A clean table. Next player drops a card.';
    $('floor').append(p);
  }
  $('hand').replaceChildren();
  if (!hidden && !state.finished) for (const card of state.hand) $('hand').append(cardButton(card.card, card.index, 'hand', selectedHand === card.index));
}

function clear() { selectedHand = null; selectedFloor = []; $('status').textContent = ''; }
function render() {
  const turn = state.turn + 1, other = 2 - state.turn;
  $('match-label').textContent = state.finished ? 'Match complete' : `Game ${state.game + 1} of 2 · Deal ${state.round + 1} of 3`;
  $('deck-label').textContent = state.finished ? '' : `${state.deck} in deck`;
  $('other-avatar').textContent = other; $('other-name').textContent = `Player ${other}`;
  $('other-meta').textContent = `${state.otherCount} cards in hand · ${state.otherCaptured} captured`;
  $('other-points').textContent = `${state.totals[other-1]} pts`;
  $('your-avatar').textContent = turn; $('your-name').textContent = `Player ${turn}`;
  $('your-meta').textContent = `${state.captured} captured · ${state.sweeps} ${state.sweeps === 1 ? 'sweep' : 'sweeps'}`;
  $('your-points').textContent = `${state.totals[state.turn]} pts`;
  $('floor-count').textContent = `${state.floor.reduce((n,p) => n + p.cards.length,0)} cards in play`;
  $('turn-label').textContent = `Player ${turn}'s turn`;
  $('cardbacks').innerHTML = '<div class="cardback"></div>'.repeat(state.finished ? 0 : state.otherCount);
  $('curtain').hidden = !hidden;
  if (state.finished) {
    const [a,b] = state.totals;
    $('curtain-kicker').textContent = 'MATCH COMPLETE';
    $('curtain-title').textContent = a === b ? 'A well-played tie.' : `Player ${a > b ? 1 : 2} wins!`;
    $('curtain-description').textContent = `Player 1: ${a} points · Player 2: ${b} points`;
    $('reveal-button').textContent = 'See score breakdown →';
  } else {
    $('curtain-kicker').textContent = state.moves.length ? 'PASS THE DEVICE' : 'THE TABLE IS READY';
    $('curtain-title').textContent = `Player ${turn}, your turn.`;
    $('curtain-description').innerHTML = 'Keep your hand to yourself.<br>Tap below when the device is yours.';
    $('reveal-button').textContent = 'Show my hand →';
  }
  for (const button of document.querySelectorAll('[data-kind], #clear-button')) button.disabled = hidden || state.finished;
  renderCards(); updateChoices();
}

function updateChoices() {
  $('choices').replaceChildren();
  for (const button of document.querySelectorAll('[data-kind]')) button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  if (hidden || state.finished) {
    $('move-title').textContent = 'Your hand stays private';
    $('move-detail').textContent = 'Reveal your hand when the device is yours.'; return;
  }
  if (selectedHand === null) {
    $('move-title').textContent = 'Choose a card from your hand';
    $('move-detail').textContent = kind === 'discard' ? 'Drop places that card on the table, when legal.' : 'Then select table cards to capture or build.'; return;
  }
  const card = state.hand.find(c => c.index === selectedHand);
  $('move-title').textContent = `${cardName(card.card)}${selectedFloor.length ? ` + ${selectedFloor.length} table ${selectedFloor.length === 1 ? 'pile' : 'piles'}` : ' selected'}`;
  const request = { type:'choices', hand:selectedHand, floor:selectedFloor, kind };
  const options = engine(request).choices;
  if (!options.length) {
    $('move-detail').textContent = kind === 'discard'
      ? (selectedFloor.length ? 'Clear table selections to drop a card.' : 'Cannot drop this card: it matches a table value, or you own a pile.')
      : !selectedFloor.length ? 'Select the table cards you want to use.'
      : kind === 'capture' ? 'Selected piles must match your card, individually or in sums. Try another selection.'
      : 'Keep a card that can capture the build. Respect locked groups and pile ownership.';
    return;
  }
  $('move-detail').textContent = kind === 'capture' ? 'Legal capture. Selected cards and your hand card go into your pile.'
    : kind === 'build' ? 'Legal build. Your remaining hand can capture it; your opponent can take it too.'
    : 'Legal drop. Your card stays on the table.';
  for (const option of options) {
    const button = document.createElement('button'); button.className = 'primary';
    button.textContent = `${option.label} →`;
    button.onclick = () => {
      const result = engine({ ...request, type:'play', annotation:option.annotation });
      if (result.error) { $('status').textContent = result.error; return; }
      state = result.state; hidden = true; clear(); save(); render();
      if (result.sweep) { $('sweep').classList.remove('show'); void $('sweep').offsetWidth; $('sweep').classList.add('show'); }
    };
    $('choices').append(button);
  }
}

function scoreTable(rows) {
  const table = document.createElement('table'); table.className = 'score-grid';
  table.innerHTML = '<thead><tr><th>Points</th><th>Player 1</th><th>Player 2</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const [name, a, b] of rows) {
    const tr = document.createElement('tr');
    for (const value of [name,a,b]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    body.append(tr);
  }
  table.append(body); return table;
}

function showScores() {
  $('score-content').replaceChildren();
  $('scores-title').textContent = state.finished ? 'Final scores' : 'Match scores';
  $('score-content').append(scoreTable([['Completed games', ...state.totals]]));
  for (const [index, game] of state.games.entries()) {
    const heading = document.createElement('p'); heading.className = 'score-game-label';
    heading.textContent = `Game ${index+1} · ${game.complete ? 'Final' : 'Provisional'}`;
    $('score-content').append(heading);
    const rows = game.categories.map(c => [c.name, ... (game.opponentSeat === 0 ? c.points : [...c.points].reverse())]);
    rows.push(['Total', ...game.points]); $('score-content').append(scoreTable(rows));
  }
  $('scores-dialog').showModal();
}

for (const button of document.querySelectorAll('[data-kind]')) button.onclick = () => { kind = button.dataset.kind; $('status').textContent=''; updateChoices(); };
$('clear-button').onclick = () => { clear(); render(); };
$('reveal-button').onclick = () => {
  if (state.finished) { showScores(); return; }
  hidden = false; render(); $('hand').querySelector('button')?.focus();
};
$('rules-button').onclick = () => $('rules-dialog').showModal();
$('scores-button').onclick = () => state && showScores();
$('new-button').onclick = () => state && $('new-dialog').showModal();
for (const dialog of document.querySelectorAll('dialog')) {
  for (const button of dialog.querySelectorAll('.dialog-close, .dialog-close-button')) button.onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
}
$('confirm-new').onclick = () => {
  state = engine({ type:'new' }).state; hidden = true; kind = 'capture'; clear(); save(); render(); $('new-dialog').close();
};

try {
  const bytes = await (await fetch('engine.wasm')).arrayBuffer();
  const module = await WebAssembly.instantiate(bytes, { env:{ random_bytes:(ptr,len) => crypto.getRandomValues(new Uint8Array(wasm.memory.buffer,ptr,len)) } });
  wasm = module.instance.exports;
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) { const result = engine({ type:'restore', ...saved }); if (!result.error) { state = result.state; restored = true; } }
  } catch { /* A damaged or unavailable saved game falls back to a fresh deal. */ }
  if (!restored) state = engine({ type:'new' }).state;
  render(); save();
} catch (error) {
  console.error('Suipi initialization failed:', error);
  $('curtain-title').textContent = 'Table could not load.';
  $('curtain-description').textContent = 'Reload to try again. This game needs a browser with WebAssembly support.';
  $('reveal-button').textContent = 'Reload table'; $('reveal-button').onclick = () => location.reload();
}
