let currentHalf = 'first';
const firstHalfScorers = [];
const secondHalfScorers = [];
const yellowCards = [];
const redCards = [];

function updateScorerList() {
  const list = document.getElementById('scorerList');
  list.innerHTML = '';

  const scorersToUse =
    currentHalf === 'first' ? firstHalfScorers : secondHalfScorers;

  scorersToUse.forEach((s, index) => {
    const li = document.createElement('li');
    li.className =
      'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      ${s.name}${s.assist ? ' (Assisted by ' + s.assist + ')' : ''}
      <button class="btn btn-sm btn-danger" onclick="removeScorer(${index})">❌</button>
    `;
    list.appendChild(li);
  });

  document.getElementById('firstHalfScorersInput').value =
    JSON.stringify(firstHalfScorers);
  document.getElementById('secondHalfScorersInput').value =
    JSON.stringify(secondHalfScorers);
}

function addScorer() {
  const name = document.getElementById('scorerName').value;
  const assist = document.getElementById('assistName').value;

  if (!name) return;

  const scorerObj = { name };
  if (assist) scorerObj.assist = assist;

  if (currentHalf === 'first') {
    firstHalfScorers.push(scorerObj);
  } else {
    secondHalfScorers.push(scorerObj);
  }

  updateScorerList();
}

function removeScorer(index) {
  if (currentHalf === 'first') {
    firstHalfScorers.splice(index, 1);
  } else {
    secondHalfScorers.splice(index, 1);
  }
  updateScorerList();
}

function switchHalf(half) {
  currentHalf = half;
  updateScorerList();

  const btnFirst = document.getElementById('btnFirstHalf');
  const btnSecond = document.getElementById('btnSecondHalf');
  if (half === 'first') {
    btnFirst.classList.add('btn-primary');
    btnFirst.classList.remove('btn-outline-primary');
    btnSecond.classList.remove('btn-primary');
    btnSecond.classList.add('btn-outline-primary');
  } else {
    btnSecond.classList.add('btn-primary');
    btnSecond.classList.remove('btn-outline-primary');
    btnFirst.classList.remove('btn-primary');
    btnFirst.classList.add('btn-outline-primary');
  }
}

function updateCardList(type, listId, inputId) {
  const list = document.getElementById(listId);
  const input = document.getElementById(inputId);
  const cards = type === 'yellow' ? yellowCards : redCards;

  list.innerHTML = '';
  cards.forEach((c, index) => {
    const li = document.createElement('li');
    li.className =
      'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      ${c.name}
      <button class="btn btn-sm btn-outline-danger" onclick="removeCard('${type}', ${index})">❌</button>
    `;
    list.appendChild(li);
  });

  input.value = JSON.stringify(cards);
}

function addCard(type) {
  const inputId = type === 'yellow' ? 'yellowCardPlayer' : 'redCardPlayer';
  const name = document.getElementById(inputId).value;
  if (!name) return;

  const cardObj = { name };
  if (type === 'yellow') {
    yellowCards.push(cardObj);
    updateCardList('yellow', 'yellowCardList', 'yellowCardsInput');
  } else {
    redCards.push(cardObj);
    updateCardList('red', 'redCardList', 'redCardsInput');
  }
}

function removeCard(type, index) {
  if (type === 'yellow') {
    yellowCards.splice(index, 1);
    updateCardList('yellow', 'yellowCardList', 'yellowCardsInput');
  } else {
    redCards.splice(index, 1);
    updateCardList('red', 'redCardList', 'redCardsInput');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  switchHalf('first'); // default
});
