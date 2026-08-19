const LETTERS = [
  "А", "В", "Е", "К", "М",
  "Н", "О", "Р", "С", "Т",
  "У", "Х"
];

const REGIONS = [
  "77",
  "97",
  "99",
  "177",
  "197",
  "199",
  "777",
  "799",
  "98"
];

module.exports = {
  LETTERS,

  REGIONS,

  BASE_PRICE: 10000,

  generateRandom() {
    const random = array =>
      array[Math.floor(Math.random() * array.length)];

    const a = random(LETTERS);
    const b = random(LETTERS);
    const c = random(LETTERS);

    const numbers =
      Math.floor(100 + Math.random() * 900);

    const region = random(REGIONS);

    return `${a}${numbers}${b}${c}${region}`;
  },

  calculatePrice(plate) {
    if (!plate) return 0;

    const normalized = plate.toUpperCase();

    const match = normalized.match(
      /^([АВЕКМНОРСТУХ])(\d{3})([АВЕКМНОРСТУХ]{2})(\d{2,3})$/
    );

    if (!match) {
      throw new Error("Неверный формат госномера");
    }

    const first = match[1];
    const numbers = match[2];
    const letters = match[3];
    const region = match[4];

    let price = 10000;

    if (numbers === "777") {
      price += 1500000;
    } else if (numbers === "001") {
      price += 1000000;
    } else if (
      numbers[0] === numbers[1] &&
      numbers[1] === numbers[2]
    ) {
      price += 500000;
    }

    if (
      letters[0] === letters[1] &&
      letters[1] === letters[2]
    ) {
      price += 500000;
    }

    if (letters === "ХХ") {
      price += 750000;
    }

    if (region === "77") {
      price += 150000;
    }

    if (region === "777") {
      price += 1000000;
    }

    if (normalized === "Х777ХХ77") {
      price = 5000000;
    }

    return price;
  }
};
