const SUITS = ["♠", "♥", "♦", "♣"];

const RANKS = [
  {
    name: "6",
    value: 6
  },
  {
    name: "7",
    value: 7
  },
  {
    name: "8",
    value: 8
  },
  {
    name: "9",
    value: 9
  },
  {
    name: "10",
    value: 10
  },
  {
    name: "J",
    value: 11
  },
  {
    name: "Q",
    value: 12
  },
  {
    name: "K",
    value: 13
  },
  {
    name: "A",
    value: 14
  }
];

function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank.name}${suit}`,
        suit,
        rank: rank.name,
        value: rank.value
      });
    }
  }

  return deck;
}

function shuffle(deck) {
  const result = [...deck];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] =
      [result[j], result[i]];
  }

  return result;
}

module.exports = {
  SUITS,
  RANKS,
  createDeck,
  shuffle
};
