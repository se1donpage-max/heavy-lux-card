const fs = require("fs");
const path = require("path");

/* =========================================================
   PLATE SYSTEM
   Формат: Х777ХХ77
========================================================= */

const DATA_DIR = path.join(__dirname, "..", "data");
const PLATES_FILE = path.join(DATA_DIR, "plates.json");

const LETTERS = [
    "А", "В", "Е", "К", "М",
    "Н", "О", "Р", "С", "Т",
    "У", "Х"
];

const REGIONS = [
    "01", "02", "05", "06", "07",
    "08", "09", "10", "11", "12",
    "13", "14", "15", "16", "17",
    "18", "19", "20", "21", "22",
    "23", "24", "25", "26", "27",
    "28", "29", "30", "31", "32",
    "33", "34", "35", "36", "37",
    "38", "39", "40", "41", "42",
    "43", "44", "45", "46", "47",
    "48", "49", "50", "51", "52",
    "53", "54", "55", "56", "57",
    "58", "59", "60", "61", "62",
    "63", "64", "65", "66", "67",
    "68", "69", "70", "71", "72",
    "73", "74", "75", "76", "77",
    "78", "79", "80", "81", "82",
    "83", "84", "85", "86", "87",
    "89", "90", "91", "92", "93",
    "94", "95", "96", "97", "98",
    "99"
];


/* =========================================================
   DATABASE
========================================================= */

let plates = {};

function ensureDataDirectory() {

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {
            recursive: true
        });
    }

}


function loadPlates() {

    ensureDataDirectory();

    try {

        if (fs.existsSync(PLATES_FILE)) {

            const data =
                fs.readFileSync(
                    PLATES_FILE,
                    "utf8"
                );

            plates =
                JSON.parse(data) || {};

        }

    } catch (error) {

        console.error(
            "LOAD PLATES ERROR:",
            error
        );

        plates = {};

    }

}


function savePlates() {

    ensureDataDirectory();

    try {

        fs.writeFileSync(
            PLATES_FILE,
            JSON.stringify(
                plates,
                null,
                2
            ),
            "utf8"
        );

    } catch (error) {

        console.error(
            "SAVE PLATES ERROR:",
            error
        );

    }

}


loadPlates();


/* =========================================================
   HELPERS
========================================================= */

function randomItem(array) {

    return array[
        Math.floor(
            Math.random() *
            array.length
        )
    ];

}


function randomNumber() {

    return Math.floor(
        Math.random() * 10
    );

}


/* =========================================================
   GENERATE PLATE
========================================================= */

function generatePlate() {

    let plate;

    do {

        const first =
            randomItem(LETTERS);

        const second =
            randomNumber();

        const third =
            randomNumber();

        const fourth =
            randomNumber();

        const letter2 =
            randomItem(LETTERS);

        const letter3 =
            randomItem(LETTERS);

        const region =
            randomItem(REGIONS);

        plate =
            `${first}${second}${third}${fourth}${letter2}${letter3}${region}`;

    } while (
        Object.values(plates)
            .some(
                item =>
                    item.number === plate
            )
    );

    return plate;

}


/* =========================================================
   BEAUTY SCORE
========================================================= */

function calculateBeauty(number) {

    /*
     * Х777ХХ77
     *
     * Индексы:
     * 0 - буква
     * 1-3 - цифры
     * 4-5 - буквы
     * 6-7 - регион
     */

    const digits =
        number
            .slice(1, 4)
            .split("")
            .map(Number);

    const letters =
        number
            .slice(0, 1) +
        number.slice(4, 6);

    const region =
        number.slice(6, 8);

    let score = 0;

    /* =========================
       Одинаковые цифры
    ========================= */

    if (
        digits[0] ===
        digits[1] &&
        digits[1] ===
        digits[2]
    ) {

        score += 5000;

    }

    else if (
        digits[0] ===
        digits[1] ||
        digits[1] ===
        digits[2] ||
        digits[0] ===
        digits[2]
    ) {

        score += 1000;

    }


    /* =========================
       777 / 888 / 999
    ========================= */

    if (
        digits.join("") === "777"
    ) {

        score += 10000;

    }

    if (
        digits.join("") === "888"
    ) {

        score += 8000;

    }

    if (
        digits.join("") === "999"
    ) {

        score += 7000;

    }

    if (
        digits.join("") === "000"
    ) {

        score += 9000;

    }


    /* =========================
       Зеркальные цифры
    ========================= */

    if (
        digits[0] ===
        digits[2]
    ) {

        score += 2500;

    }


    /* =========================
       Последовательность
    ========================= */

    if (
        digits[1] ===
        digits[0] + 1 &&
        digits[2] ===
        digits[1] + 1
    ) {

        score += 3000;

    }

    if (
        digits[1] ===
        digits[0] - 1 &&
        digits[2] ===
        digits[1] - 1
    ) {

        score += 3000;

    }


    /* =========================
       Красивые буквы
    ========================= */

    if (
        letters[0] ===
        letters[1] &&
        letters[1] ===
        letters[2]
    ) {

        score += 7000;

    }

    else if (
        letters[0] ===
        letters[1] ||
        letters[1] ===
        letters[2] ||
        letters[0] ===
        letters[2]
    ) {

        score += 1500;

    }


    /* =========================
       Популярные комбинации
    ========================= */

    const premiumLetters = [
        "ААА",
        "МММ",
        "ЕЕЕ",
        "ККК",
        "ООО",
        "РРР",
        "ССС",
        "ТТТ",
        "ХХХ"
    ];

    if (
        premiumLetters.includes(
            letters
        )
    ) {

        score += 15000;

    }


    /* =========================
       Красивые регионы
    ========================= */

    if (
        region === "77" ||
        region === "97" ||
        region === "99"
    ) {

        score += 3000;

    }


    /* =========================
       Максимальный класс
    ========================= */

    return score;

}


/* =========================================================
   PRICE
========================================================= */

function calculatePrice(number) {

    const beauty =
        calculateBeauty(number);

    const basePrice = 5000;

    const price =
        basePrice +
        beauty * 10;

    return Math.max(
        5000,
        Math.floor(price)
    );

}


/* =========================================================
   CATEGORY
========================================================= */

function getPlateCategory(
    number
) {

    const beauty =
        calculateBeauty(number);

    if (beauty >= 20000) {

        return "legendary";

    }

    if (beauty >= 10000) {

        return "premium";

    }

    if (beauty >= 5000) {

        return "beautiful";

    }

    if (beauty >= 1500) {

        return "interesting";

    }

    return "standard";

}


/* =========================================================
   CREATE PLATE
========================================================= */

function createPlate(
    ownerId = null
) {

    const number =
        generatePlate();

    const plate = {

        id:
            `plate_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        number,

        ownerId,

        price:
            calculatePrice(
                number
            ),

        beautyScore:
            calculateBeauty(
                number
            ),

        category:
            getPlateCategory(
                number
            ),

        carId:
            null,

        createdAt:
            Date.now()

    };

    plates[plate.id] =
        plate;

    savePlates();

    return plate;

}


/* =========================================================
   FIND
========================================================= */

function getPlate(
    plateId
) {

    return plates[plateId] || null;

}


function findPlateByNumber(
    number
) {

    return Object.values(
        plates
    ).find(
        plate =>
            plate.number ===
            number
    ) || null;

}


function getPlayerPlates(
    ownerId
) {

    return Object.values(
        plates
    ).filter(
        plate =>
            String(
                plate.ownerId
            ) === String(ownerId)
    );

}


/* =========================================================
   BUY PLATE
========================================================= */

function buyPlate(
    player,
    plateId
) {

    const plate =
        getPlate(
            plateId
        );

    if (!plate) {

        return {
            success: false,
            error:
                "Номер не найден"
        };

    }

    if (plate.ownerId) {

        return {
            success: false,
            error:
                "Этот номер уже принадлежит игроку"
        };

    }

    if (
        player.balance <
        plate.price
    ) {

        return {
            success: false,
            error:
                "Недостаточно HC"
        };

    }

    player.balance -=
        plate.price;

    plate.ownerId =
        String(
            player.telegram_id
        );

    savePlates();

    return {

        success: true,

        plate

    };

}


/* =========================================================
   SELL PLATE
========================================================= */

function sellPlate(
    player,
    plateId
) {

    const plate =
        getPlate(
            plateId
        );

    if (!plate) {

        return {
            success: false,
            error:
                "Номер не найден"
        };

    }

    if (
        String(
            plate.ownerId
        ) !==
        String(
            player.telegram_id
        )
    ) {

        return {
            success: false,
            error:
                "Это не твой номер"
        };

    }

    if (plate.carId) {

        return {
            success: false,
            error:
                "Сначала сними номер с автомобиля"
        };

    }

    const sellPrice =
        Math.floor(
            plate.price * 0.7
        );

    player.balance +=
        sellPrice;

    plate.ownerId =
        null;

    savePlates();

    return {

        success: true,

        received:
            sellPrice

    };

}


/* =========================================================
   INSTALL ON CAR
========================================================= */

function installPlate(
    player,
    plateId,
    car
) {

    const plate =
        getPlate(
            plateId
        );

    if (!plate) {

        return {
            success: false,
            error:
                "Номер не найден"
        };

    }

    if (
        String(
            plate.ownerId
        ) !==
        String(
            player.telegram_id
        )
    ) {

        return {
            success: false,
            error:
                "Этот номер тебе не принадлежит"
        };

    }

    if (
        plate.carId &&
        plate.carId !== car.id
    ) {

        return {
            success: false,
            error:
                "Номер уже установлен на другой автомобиль"
        };

    }

    if (
        car.plateId &&
        car.plateId !== plate.id
    ) {

        const oldPlate =
            getPlate(
                car.plateId
            );

        if (oldPlate) {

            oldPlate.carId =
                null;

        }

    }

    plate.carId =
        car.id;

    car.plateId =
        plate.id;

    savePlates();

    return {

        success: true,

        plate,

        car

    };

}


/* =========================================================
   REMOVE FROM CAR
========================================================= */

function removePlate(
    player,
    car
) {

    if (!car.plateId) {

        return {
            success: false,
            error:
                "На автомобиле нет номера"
        };

    }

    const plate =
        getPlate(
            car.plateId
        );

    if (
        plate &&
        String(
            plate.ownerId
        ) ===
        String(
            player.telegram_id
        )
    ) {

        plate.carId =
            null;

    }

    car.plateId =
        null;

    savePlates();

    return {

        success: true,

        car

    };

}


/* =========================================================
   MARKET
========================================================= */

function generateMarket(
    count = 20
) {

    const result = [];

    for (
        let i = 0;
        i < count;
        i++
    ) {

        result.push(
            createPlate()
        );

    }

    return result;

}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

    generatePlate,

    calculateBeauty,

    calculatePrice,

    getPlateCategory,

    createPlate,

    getPlate,

    findPlateByNumber,

    getPlayerPlates,

    buyPlate,

    sellPlate,

    installPlate,

    removePlate,

    generateMarket,

    plates

};
