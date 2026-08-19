const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

/*
=========================================================
HEAVY LUX CARD
SERVER.JS
VERSION 6.0.0

PLAYER VS PLAYER
NO AI
NO FACTIONS

SYSTEMS:
- Telegram WebApp Auth
- Players
- HC Economy
- XP / Levels / Titles
- Cars
- Heavy Exclusive Cars
- Tuning Atelier
- License Plates
- Beautiful Plates
- GIBDD
- Real Estate
- Businesses
- Business Income
- PvP Rooms
- Durak 1v1
- Socket.IO
- Reconnect
- Room Cleanup
=========================================================
*/

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || "";

/*
=========================================================
CONFIG
=========================================================
*/

const GAME_VERSION = "6.0.0";

const START_MONEY = 5000;

const MAX_LEVEL = 100;

const MAX_HAND = 6;

const MAX_CHAT_MESSAGES = 100;

const MAX_ROOM_CHAT_MESSAGES = 50;

const GIBDD_REGISTRATION_PRICE = 25000;

const BUSINESS_MAX_STORAGE_HOURS = 72;

const BUSINESS_MAX_STORAGE_MS =
    BUSINESS_MAX_STORAGE_HOURS *
    60 *
    60 *
    1000;

const ROOM_CODE_LENGTH = 6;

const ROOM_RECONNECT_TIMEOUT = 60 * 1000;

const ROOM_CLEANUP_TIMEOUT = 30 * 60 * 1000;

const MAX_ROOMS = 10000;

const DECK_SUITS = [
    "hearts",
    "diamonds",
    "clubs",
    "spades"
];

const DECK_VALUES = [
    6,
    7,
    8,
    9,
    10,
    "J",
    "Q",
    "K",
    "A"
];

const VALUE_POWER = {
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
};

/*
=========================================================
DATABASE
=========================================================
*/

const DATA_FILE = path.join(
    __dirname,
    "players.json"
);

let players = {};

function loadPlayers() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            players = {};
            return;
        }

        const raw = fs.readFileSync(
            DATA_FILE,
            "utf8"
        );

        players = JSON.parse(raw) || {};

        if (
            !players ||
            typeof players !== "object" ||
            Array.isArray(players)
        ) {
            players = {};
        }
    } catch (error) {
        console.error(
            "[DATABASE] LOAD ERROR:",
            error
        );

        players = {};
    }
}

function savePlayers() {
    try {
        const tempFile =
            `${DATA_FILE}.tmp`;

        fs.writeFileSync(
            tempFile,
            JSON.stringify(
                players,
                null,
                2
            ),
            "utf8"
        );

        fs.renameSync(
            tempFile,
            DATA_FILE
        );
    } catch (error) {
        console.error(
            "[DATABASE] SAVE ERROR:",
            error
        );
    }
}

loadPlayers();

/*
=========================================================
MIDDLEWARE
=========================================================
*/

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
    })
);

/*
=========================================================
UTILITY
=========================================================
*/

function now() {
    return Date.now();
}

function randomId(prefix = "") {
    return (
        prefix +
        crypto.randomUUID()
    );
}

function randomInt(min, max) {
    return Math.floor(
        Math.random() *
        (max - min + 1)
    ) + min;
}

function shuffle(array) {
    const result = [...array];

    for (
        let i = result.length - 1;
        i > 0;
        i--
    ) {
        const j = randomInt(0, i);

        [
            result[i],
            result[j]
        ] = [
            result[j],
            result[i]
        ];
    }

    return result;
}

function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function normalizeString(value) {
    return String(
        value || ""
    ).trim();
}

/*
=========================================================
TELEGRAM AUTH
=========================================================
*/

function validateTelegramInitData(initData) {
    if (!BOT_TOKEN) {
        console.warn(
            "[AUTH] BOT_TOKEN is not configured"
        );

        return null;
    }

    if (
        !initData ||
        typeof initData !== "string"
    ) {
        return null;
    }

    const params = new URLSearchParams(
        initData
    );

    const hash = params.get("hash");

    if (!hash) {
        return null;
    }

    params.delete("hash");

    const dataCheckString =
        [...params.entries()]
            .sort(
                ([a], [b]) =>
                    a.localeCompare(b)
            )
            .map(
                ([key, value]) =>
                    `${key}=${value}`
            )
            .join("\n");

    const secretKey = crypto
        .createHmac(
            "sha256",
            "WebAppData"
        )
        .update(BOT_TOKEN)
        .digest();

    const calculatedHash = crypto
        .createHmac(
            "sha256",
            secretKey
        )
        .update(dataCheckString)
        .digest("hex");

    if (
        calculatedHash.length !==
        hash.length
    ) {
        return null;
    }

    try {
        if (
            !crypto.timingSafeEqual(
                Buffer.from(
                    calculatedHash,
                    "utf8"
                ),
                Buffer.from(
                    hash,
                    "utf8"
                )
            )
        ) {
            return null;
        }
    } catch {
        return null;
    }

    const authDate = Number(
        params.get("auth_date") || 0
    );

    if (!authDate) {
        return null;
    }

    const age =
        Date.now() / 1000 -
        authDate;

    if (
        age < -60 ||
        age > 86400
    ) {
        return null;
    }

    let user;

    try {
        user = JSON.parse(
            params.get("user") || "{}"
        );
    } catch {
        return null;
    }

    if (
        !user ||
        !user.id
    ) {
        return null;
    }

    return user;
}

function getHttpInitData(req) {
    const headerValue =
        req.headers[
            "x-telegram-init-data"
        ];

    if (
        typeof headerValue === "string" &&
        headerValue.trim()
    ) {
        return headerValue;
    }

    if (
        typeof req.body?.initData ===
        "string"
    ) {
        return req.body.initData;
    }

    if (
        typeof req.query?.initData ===
        "string"
    ) {
        return req.query.initData;
    }

    return "";
}

/*
=========================================================
PLAYER / TITLES
=========================================================
*/

function getTitle(level) {
    if (level >= 100) {
        return "Легенда";
    }

    if (level >= 80) {
        return "Император";
    }

    if (level >= 60) {
        return "Магнат";
    }

    if (level >= 40) {
        return "Мастер";
    }

    if (level >= 20) {
        return "Ветеран";
    }

    return "Новичок";
}

function createPlayer(user) {
    const id = String(user.id);

    if (!players[id]) {
        players[id] = {
            telegram_id: id,

            first_name:
                user.first_name ||
                "Игрок",

            last_name:
                user.last_name ||
                "",

            username:
                user.username ||
                "",

            balance:
                START_MONEY,

            level: 1,

            xp: 0,

            title: "Новичок",

            wins: 0,

            losses: 0,

            games: 0,

            cars: [],

            beautifulPlates: [],

            realEstate: [],

            businesses: [],

            created_at: now(),

            updated_at: now()
        };

        savePlayers();

        return players[id];
    }

    const player = players[id];

    player.first_name =
        user.first_name ||
        player.first_name ||
        "Игрок";

    player.last_name =
        user.last_name ||
        player.last_name ||
        "";

    player.username =
        user.username ||
        player.username ||
        "";

    if (!Array.isArray(player.cars)) {
        player.cars = [];
    }

    if (
        !Array.isArray(
            player.beautifulPlates
        )
    ) {
        player.beautifulPlates = [];
    }

    if (
        !Array.isArray(
            player.realEstate
        )
    ) {
        player.realEstate = [];
    }

    if (
        !Array.isArray(
            player.businesses
        )
    ) {
        player.businesses = [];
    }

    player.balance =
        safeNumber(
            player.balance,
            START_MONEY
        );

    player.level =
        Math.max(
            1,
            Math.min(
                MAX_LEVEL,
                safeNumber(
                    player.level,
                    1
                )
            )
        );

    player.xp =
        Math.max(
            0,
            safeNumber(
                player.xp,
                0
            )
        );

    player.wins =
        Math.max(
            0,
            safeNumber(
                player.wins,
                0
            )
        );

    player.losses =
        Math.max(
            0,
            safeNumber(
                player.losses,
                0
            )
        );

    player.games =
        Math.max(
            0,
            safeNumber(
                player.games,
                0
            )
        );

    player.title =
        getTitle(
            player.level
        );

    player.updated_at = now();

    savePlayers();

    return player;
}

function publicPlayer(player) {
    if (!player) {
        return null;
    }

    return {
        telegram_id:
            player.telegram_id,

        first_name:
            player.first_name,

        last_name:
            player.last_name,

        username:
            player.username,

        balance:
            player.balance,

        level:
            player.level,

        xp:
            player.xp,

        title:
            player.title,

        wins:
            player.wins,

        losses:
            player.losses,

        games:
            player.games,

        cars:
            player.cars || [],

        beautifulPlates:
            player.beautifulPlates || [],

        realEstate:
            player.realEstate || [],

        businesses:
            player.businesses || []
    };
}

function addXP(player, amount) {
    if (!player) {
        return;
    }

    let xp = Math.max(
        0,
        safeNumber(
            player.xp,
            0
        )
    );

    let level = Math.max(
        1,
        Math.min(
            MAX_LEVEL,
            safeNumber(
                player.level,
                1
            )
        )
    );

    xp += Math.max(
        0,
        safeNumber(
            amount,
            0
        )
    );

    while (
        level < MAX_LEVEL &&
        xp >= level * 100
    ) {
        xp -= level * 100;
        level++;
    }

    if (level >= MAX_LEVEL) {
        level = MAX_LEVEL;
        xp = 0;
    }

    player.level = level;
    player.xp = xp;
    player.title = getTitle(level);
    player.updated_at = now();

    savePlayers();
}

function addMoney(player, amount) {
    if (!player) {
        return false;
    }

    amount = safeNumber(
        amount,
        0
    );

    if (amount <= 0) {
        return false;
    }

    player.balance += amount;

    player.updated_at = now();

    return true;
}

function removeMoney(player, amount) {
    if (!player) {
        return false;
    }

    amount = safeNumber(
        amount,
        0
    );

    if (
        amount <= 0 ||
        player.balance < amount
    ) {
        return false;
    }

    player.balance -= amount;

    player.updated_at = now();

    return true;
}

function getPlayerById(id) {
    if (!id) {
        return null;
    }

    return (
        players[String(id)] ||
        null
    );
}

function requirePlayer(req, res) {
    const initData =
        getHttpInitData(req);

    const user =
        validateTelegramInitData(
            initData
        );

    if (!user) {
        res.status(401).json({
            success: false,
            error:
                "Telegram authorization required"
        });

        return null;
    }

    return createPlayer(user);
}

/*
=========================================================
CAR COLORS
=========================================================
*/

const CAR_COLORS = [
    {
        id: "black",
        name: "Черный",
        hex: "#111111"
    },
    {
        id: "white",
        name: "Белый",
        hex: "#F5F5F5"
    },
    {
        id: "graphite",
        name: "Графит",
        hex: "#454545"
    },
    {
        id: "silver",
        name: "Серебристый",
        hex: "#A8A8A8"
    },
    {
        id: "dark_blue",
        name: "Темно-синий",
        hex: "#152B4F"
    },
    {
        id: "blue",
        name: "Синий",
        hex: "#2457A6"
    },
    {
        id: "red",
        name: "Красный",
        hex: "#8E1B1B"
    },
    {
        id: "burgundy",
        name: "Бордовый",
        hex: "#4A111B"
    },
    {
        id: "green",
        name: "Темно-зеленый",
        hex: "#173A2A"
    }
];

function getColor(colorId) {
    return CAR_COLORS.find(
        color =>
            color.id === colorId
    );
}

/*
=========================================================
CAR CATALOG
=========================================================
*/

const CARS = [
    {
        id: "bmw_x7",
        brand: "BMW",
        model: "X7",
        name: "BMW X7",
        price: 2500000,
        category: "Premium"
    },
    {
        id: "mercedes_s580",
        brand: "Mercedes-Benz",
        model: "S 580",
        name: "Mercedes-Benz S 580",
        price: 3000000,
        category: "Premium"
    },
    {
        id: "range_rover_autobiography",
        brand: "Range Rover",
        model: "Autobiography",
        name: "Range Rover Autobiography",
        price: 3500000,
        category: "Premium"
    },
    {
        id: "porsche_cayenne_turbo_gt",
        brand: "Porsche",
        model: "Cayenne Turbo GT",
        name: "Porsche Cayenne Turbo GT",
        price: 4000000,
        category: "Premium"
    },
    {
        id: "bmw_m5_g90",
        brand: "BMW",
        model: "M5 G90",
        name: "BMW M5 G90",
        price: 5000000,
        category: "VIP"
    },
    {
        id: "mercedes_g63",
        brand: "Mercedes-AMG",
        model: "G 63",
        name: "Mercedes-AMG G 63",
        price: 6000000,
        category: "VIP"
    },
    {
        id: "porsche_911_turbo_s",
        brand: "Porsche",
        model: "911 Turbo S",
        name: "Porsche 911 Turbo S",
        price: 7000000,
        category: "VIP"
    },
    {
        id: "mercedes_s63",
        brand: "Mercedes-AMG",
        model: "S 63",
        name: "Mercedes-AMG S 63",
        price: 7500000,
        category: "VIP"
    }
];

const EXCLUSIVE_CARS = [
    {
        id: "bmw_m5_manhart",
        brand: "BMW",
        model: "M5 G90",
        name: "BMW M5 G90 MANHART",
        tuning: "MANHART",
        price: 12000000,
        category: "Exclusive"
    },
    {
        id: "bmw_ac_schnitzer",
        brand: "BMW",
        model: "M Series",
        name: "BMW AC SCHNITZER",
        tuning: "AC SCHNITZER",
        price: 13000000,
        category: "Exclusive"
    },
    {
        id: "bmw_hamann",
        brand: "BMW",
        model: "M Series",
        name: "BMW HAMANN",
        tuning: "HAMANN",
        price: 14000000,
        category: "Exclusive"
    },
    {
        id: "mercedes_g63_brabus",
        brand: "Mercedes-AMG",
        model: "G 63",
        name: "Mercedes-AMG G 63 BRABUS",
        tuning: "BRABUS",
        price: 18000000,
        category: "Exclusive"
    },
    {
        id: "porsche_911_mansory",
        brand: "Porsche",
        model: "911",
        name: "Porsche 911 MANSORY",
        tuning: "MANSORY",
        price: 22000000,
        category: "Exclusive"
    },
    {
        id: "lamborghini_urus_mansory",
        brand: "Lamborghini",
        model: "Urus",
        name: "Lamborghini Urus MANSORY",
        tuning: "MANSORY",
        price: 28000000,
        category: "Exclusive"
    },
    {
        id: "rolls_royce_ghost_mansory",
        brand: "Rolls-Royce",
        model: "Ghost",
        name: "Rolls-Royce Ghost MANSORY",
        tuning: "MANSORY",
        price: 32000000,
        category: "Ultra Exclusive"
    },
    {
        id: "rolls_royce_cullinan_mansory",
        brand: "Rolls-Royce",
        model: "Cullinan",
        name: "Rolls-Royce Cullinan MANSORY",
        tuning: "MANSORY",
        price: 35000000,
        category: "Ultra Exclusive"
    }
];

function getCatalogCar(carId) {
    return CARS.find(
        car => car.id === carId
    );
}

function getExclusiveCar(carId) {
    return EXCLUSIVE_CARS.find(
        car => car.id === carId
    );
}

function findPlayerCar(player, carId) {
    return (
        player.cars || []
    ).find(
        car => car.id === carId
    );
}

/*
=========================================================
PLATES
=========================================================
*/

const LETTERS = [
    "А",
    "В",
    "Е",
    "К",
    "М",
    "Н",
    "О",
    "Р",
    "С",
    "Т",
    "У",
    "Х"
];

const REGIONS = [
    "77",
    "97",
    "99",
    "177",
    "197",
    "199",
    "777",
    "799"
];

const BEAUTIFUL_PLATES = [
    {
        id: "a100aa77",
        number: "А100АА77",
        price: 500000,
        rarity: "Редкий"
    },
    {
        id: "a007aa77",
        number: "А007АА77",
        price: 750000,
        rarity: "Редкий"
    },
    {
        id: "a555aa77",
        number: "А555АА77",
        price: 1500000,
        rarity: "Очень редкий"
    },
    {
        id: "a111aa77",
        number: "А111АА77",
        price: 2000000,
        rarity: "Очень редкий"
    },
    {
        id: "a777aa77",
        number: "А777АА77",
        price: 3000000,
        rarity: "VIP"
    },
    {
        id: "x777xx77",
        number: "Х777ХХ77",
        price: 5000000,
        rarity: "VIP+"
    },
    {
        id: "m777mm77",
        number: "М777ММ77",
        price: 5000000,
        rarity: "VIP+"
    },
    {
        id: "c777cc77",
        number: "С777СС77",
        price: 5000000,
        rarity: "VIP+"
    },
    {
        id: "o777oo77",
        number: "О777ОО77",
        price: 5500000,
        rarity: "VIP+"
    },
    {
        id: "e777ee77",
        number: "Е777ЕЕ77",
        price: 5500000,
        rarity: "VIP+"
    },
    {
        id: "a999aa77",
        number: "А999АА77",
        price: 7500000,
        rarity: "Ultra"
    },
    {
        id: "a001aa77",
        number: "А001АА77",
        price: 7500000,
        rarity: "Ultra"
    }
];

function normalizePlate(number) {
    return String(number || "")
        .replace(/\s/g, "")
        .toUpperCase();
}

function isPlateUsed(number) {
    const normalized =
        normalizePlate(number);

    for (
        const player
        of Object.values(players)
    ) {
        for (
            const car
            of player.cars || []
        ) {
            if (
                normalizePlate(
                    car.plate
                ) === normalized
            ) {
                return true;
            }

            if (
                normalizePlate(
                    car.beautifulPlate
                ) === normalized
            ) {
                return true;
            }
        }

        for (
            const plate
            of player.beautifulPlates || []
        ) {
            if (
                normalizePlate(
                    plate.number
                ) === normalized
            ) {
                return true;
            }
        }
    }

    return false;
}

function generatePlate() {
    let plate = "";
    let attempts = 0;

    do {
        const first =
            LETTERS[
                randomInt(
                    0,
                    LETTERS.length - 1
                )
            ];

        const digits =
            String(
                randomInt(
                    0,
                    999
                )
            ).padStart(
                3,
                "0"
            );

        const second =
            LETTERS[
                randomInt(
                    0,
                    LETTERS.length - 1
                )
            ];

        const third =
            LETTERS[
                randomInt(
                    0,
                    LETTERS.length - 1
                )
            ];

        const region =
            REGIONS[
                randomInt(
                    0,
                    REGIONS.length - 1
                )
            ];

        plate =
            `${first}${digits}${second}${third}${region}`;

        attempts++;
    } while (
        isPlateUsed(plate) &&
        attempts < 10000
    );

    if (isPlateUsed(plate)) {
        throw new Error(
            "No free plate available"
        );
    }

    return plate;
}

/*
=========================================================
REAL ESTATE
=========================================================
*/

const REAL_ESTATE = [
    {
        id: "luxury_apartment",
        name: "Luxury Apartment",
        type: "Apartment",
        price: 8000000,
        category: "Luxury"
    },
    {
        id: "penthouse",
        name: "Penthouse",
        type: "Penthouse",
        price: 20000000,
        category: "VIP"
    },
    {
        id: "luxury_villa",
        name: "Luxury Villa",
        type: "Villa",
        price: 30000000,
        category: "VIP"
    },
    {
        id: "mansion",
        name: "Mansion",
        type: "Mansion",
        price: 50000000,
        category: "Elite"
    },
    {
        id: "private_estate",
        name: "Private Estate",
        type: "Estate",
        price: 80000000,
        category: "Elite"
    },
    {
        id: "heavy_estate",
        name: "Heavy Estate",
        type: "Heavy Estate",
        price: 150000000,
        category: "Heavy"
    }
];

function getCatalogEstate(estateId) {
    return REAL_ESTATE.find(
        item => item.id === estateId
    );
}

/*
=========================================================
BUSINESSES
=========================================================
*/

const BUSINESSES = [
    {
        id: "gas_station",
        name: "Заправка",
        price: 15000000,
        incomePerHour: 120000,
        category: "Premium",
        maxCount: 100
    },
    {
        id: "restaurant",
        name: "Ресторан",
        price: 25000000,
        incomePerHour: 220000,
        category: "Premium+",
        maxCount: 50
    },
    {
        id: "night_club",
        name: "Ночной клуб",
        price: 40000000,
        incomePerHour: 400000,
        category: "VIP+",
        maxCount: 30
    },
    {
        id: "hotel",
        name: "Гостиница",
        price: 65000000,
        incomePerHour: 700000,
        category: "VIP",
        maxCount: 20
    },
    {
        id: "factory",
        name: "Завод",
        price: 100000000,
        incomePerHour: 1200000,
        category: "Elite",
        maxCount: 10
    }
];

function getCatalogBusiness(businessId) {
    return BUSINESSES.find(
        item => item.id === businessId
    );
}

function calculateBusinessIncome(business) {
    if (!business) {
        return 0;
    }

    const catalog =
        getCatalogBusiness(
            business.catalogId
        );

    if (!catalog) {
        return 0;
    }

    const last =
        safeNumber(
            business.lastCollection,
            business.purchasedAt || now()
        );

    const elapsed =
        Math.max(
            0,
            now() - last
        );

    const cappedElapsed =
        Math.min(
            elapsed,
            BUSINESS_MAX_STORAGE_MS
        );

    return Math.floor(
        (
            cappedElapsed /
            3600000
        ) *
        catalog.incomePerHour
    );
}

function collectBusinessIncome(
    player,
    businessId
) {
    const business =
        (
            player.businesses ||
            []
        ).find(
            item =>
                item.id ===
                businessId
        );

    if (!business) {
        return {
            success: false,
            error:
                "Бизнес не найден"
        };
    }

    const income =
        calculateBusinessIncome(
            business
        );

    business.lastCollection =
        now();

    business.totalCollected =
        safeNumber(
            business.totalCollected,
            0
        ) + income;

    if (income > 0) {
        addMoney(
            player,
            income
        );
    }

    player.updated_at = now();

    savePlayers();

    return {
        success: true,
        income,
        business
    };
}

/*
=========================================================
ROOMS
=========================================================
*/

const rooms = new Map();

function generateRoomCode() {
    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (
        let attempt = 0;
        attempt < 10000;
        attempt++
    ) {
        let code = "";

        for (
            let i = 0;
            i < ROOM_CODE_LENGTH;
            i++
        ) {
            code +=
                chars[
                    randomInt(
                        0,
                        chars.length - 1
                    )
                ];
        }

        if (!rooms.has(code)) {
            return code;
        }
    }

    throw new Error(
        "Unable to generate room code"
    );
}

function roomPlayerView(room, player) {
    if (!player) {
        return null;
    }

    return {
        id:
            player.id,

        telegram_id:
            player.telegram_id,

        first_name:
            player.first_name,

        last_name:
            player.last_name,

        username:
            player.username,

        connected:
            !!player.connected,

        ready:
            !!player.ready
    };
}

function createRoom(owner) {
    if (rooms.size >= MAX_ROOMS) {
        throw new Error(
            "Maximum rooms reached"
        );
    }

    const code =
        generateRoomCode();

    const room = {
        code,

        createdAt:
            now(),

        updatedAt:
            now(),

        lastActivity:
            now(),

        status:
            "waiting",

        hostId:
            owner.id,

        players: [
            owner
        ],

        game:
            null,

        chat: []
    };

    rooms.set(
        code,
        room
    );

    return room;
}

function getRoom(code) {
    if (!code) {
        return null;
    }

    return rooms.get(
        String(code).toUpperCase()
    ) || null;
}

function broadcastRoom(room) {
    if (!room) {
        return;
    }

    io.to(
        `room:${room.code}`
    ).emit(
        "room:update",
        publicRoom(room)
    );
}

function publicRoom(room) {
    if (!room) {
        return null;
    }

    return {
        code:
            room.code,

        createdAt:
            room.createdAt,

        status:
            room.status,

        hostId:
            room.hostId,

        players:
            room.players.map(
                player =>
                    roomPlayerView(
                        room,
                        player
                    )
            ),

        game:
            publicGameState(
                room
            ),

        chat:
            room.chat || []
    };
}

function findRoomByPlayer(
    telegramId
) {
    const id =
        String(telegramId);

    for (
        const room
        of rooms.values()
    ) {
        if (
            room.players.some(
                player =>
                    String(
                        player.telegram_id
                    ) === id
            )
        ) {
            return room;
        }
    }

    return null;
}

function removeRoomPlayer(
    room,
    telegramId
) {
    const index =
        room.players.findIndex(
            player =>
                String(
                    player.telegram_id
                ) ===
                String(
                    telegramId
                )
        );

    if (index === -1) {
        return null;
    }

    const removed =
        room.players.splice(
            index,
            1
        )[0];

    if (
        room.hostId ===
        removed.id &&
        room.players.length
    ) {
        room.hostId =
            room.players[0].id;
    }

    return removed;
}

/*
=========================================================
DURAK DECK
=========================================================
*/

function createDeck() {
    const deck = [];

    for (
        const suit
        of DECK_SUITS
    ) {
        for (
            const value
            of DECK_VALUES
        ) {
            deck.push({
                id:
                    randomId("card_"),

                suit,

                value,

                power:
                    VALUE_POWER[value]
            });
        }
    }

    return shuffle(deck);
}

function cardName(card) {
    if (!card) {
        return "";
    }

    const value =
        String(card.value);

    const suitMap = {
        hearts: "♥",
        diamonds: "♦",
        clubs: "♣",
        spades: "♠"
    };

    return (
        value +
        (suitMap[
            card.suit
        ] || "")
    );
}

function publicCard(card) {
    if (!card) {
        return null;
    }

    return {
        id: card.id,
        suit: card.suit,
        value: card.value,
        power: card.power,
        name: cardName(card)
    };
}

function findCardInHand(
    hand,
    cardId
) {
    return hand.find(
        card =>
            card.id === cardId
    );
}

function removeCardFromHand(
    hand,
    cardId
) {
    const index =
        hand.findIndex(
            card =>
                card.id === cardId
        );

    if (index === -1) {
        return null;
    }

    return hand.splice(
        index,
        1
    )[0];
}

/*
=========================================================
DURAK RULES
=========================================================
*/

function canBeat(
    attack,
    defense,
    trump
) {
    if (
        !attack ||
        !defense
    ) {
        return false;
    }

    if (
        attack.suit ===
        defense.suit
    ) {
        return (
            defense.power >
            attack.power
        );
    }

    if (
        defense.suit ===
        trump
    ) {
        return true;
    }

    return false;
}

function highestTrump(cards, trump) {
    return cards
        .filter(
            card =>
                card.suit ===
                trump
        )
        .sort(
            (a, b) =>
                a.power -
                b.power
        )[0] || null;
}

function determineFirstAttacker(
    p1,
    p2,
    trump
) {
    const p1Trumps =
        p1.hand.filter(
            card =>
                card.suit ===
                trump
        );

    const p2Trumps =
        p2.hand.filter(
            card =>
                card.suit ===
                trump
        );

    if (
        p1Trumps.length &&
        p2Trumps.length
    ) {
        const p1Min =
            highestTrump(
                p1Trumps,
                trump
            );

        const p2Min =
            highestTrump(
                p2Trumps,
                trump
            );

        return (
            p1Min.power <=
            p2Min.power
        )
            ? p1.id
            : p2.id;
    }

    if (p1Trumps.length) {
        return p1.id;
    }

    if (p2Trumps.length) {
        return p2.id;
    }

    /*
     * В нестандартном случае,
     * когда у обоих нет козыря,
     * первый ход определяется
     * случайно.
     */
    return Math.random() < 0.5
        ? p1.id
        : p2.id;
}

function getAttackCards(
    game
) {
    return game.table
        .map(
            pair =>
                pair.attack
        )
        .filter(Boolean);
}

function getAllTableValues(game) {
    const values = [];

    for (
        const pair
        of game.table
    ) {
        if (pair.attack) {
            values.push(
                pair.attack.value
            );
        }

        if (pair.defense) {
            values.push(
                pair.defense.value
            );
        }
    }

    return values;
}

function canAddAttackCard(
    game,
    card
) {
    if (!card) {
        return false;
    }

    if (!game.table.length) {
        return true;
    }

    const values =
        getAllTableValues(game);

    return values.includes(
        card.value
    );
}

function allAttacksDefended(game) {
    return game.table.every(
        pair =>
            pair.attack &&
            pair.defense
    );
}

function tableHasUncoveredAttack(game) {
    return game.table.some(
        pair =>
            pair.attack &&
            !pair.defense
    );
}

/*
=========================================================
DRAW CARDS
=========================================================
*/

function drawUpToSix(
    game,
    room
) {
    const playersInGame =
        game.players;

    for (
        const player
        of playersInGame
    ) {
        while (
            player.hand.length <
                MAX_HAND &&
            game.deck.length
        ) {
            player.hand.push(
                game.deck.shift()
            );
        }
    }

    /*
     * После добора первый игрок
     * в порядке Дурака меняется.
     * Это определяется отдельно
     * в завершении хода.
     */
    room.updatedAt = now();
}

/*
=========================================================
GAME STATE
=========================================================
*/

function createGame(
    room
) {
    if (
        room.players.length !== 2
    ) {
        throw new Error(
            "Exactly two players required"
        );
    }

    const p1 = {
        id:
            room.players[0].id,

        telegram_id:
            room.players[0].telegram_id,

        first_name:
            room.players[0].first_name,

        last_name:
            room.players[0].last_name,

        username:
            room.players[0].username,

        hand: [],

        connected:
            room.players[0].connected
    };

    const p2 = {
        id:
            room.players[1].id,

        telegram_id:
            room.players[1].telegram_id,

        first_name:
            room.players[1].first_name,

        last_name:
            room.players[1].last_name,

        username:
            room.players[1].username,

        hand: [],

        connected:
            room.players[1].connected
    };

    let deck = createDeck();

    /*
     * Последняя карта колоды
     * определяет козырь.
     */
    const trumpCard =
        deck[deck.length - 1];

    const trump =
        trumpCard.suit;

    const game = {
        status:
            "playing",

        deck,

        trump,

        trumpCard,

        players: [
            p1,
            p2
        ],

        attackerId:
            null,

        defenderId:
            null,

        turnId:
            null,

        phase:
            "attack",

        table: [],

        lastAction:
            null,

        winnerId:
            null,

        loserId:
            null,

        startedAt:
            now(),

        updatedAt:
            now(),

        finishedAt:
            null,

        roundNumber:
            1
    };

    /*
     * Первоначальный добор.
     */
    drawUpToSix(
        game,
        room
    );

    game.attackerId =
        determineFirstAttacker(
            p1,
            p2,
            trump
        );

    game.defenderId =
        game.players.find(
            player =>
                player.id !==
                game.attackerId
        ).id;

    game.turnId =
        game.attackerId;

    room.game = game;
    room.status = "playing";
    room.updatedAt = now();

    return game;
}

function getGamePlayer(
    game,
    playerId
) {
    return game.players.find(
        player =>
            player.id ===
            playerId
    );
}

function getOpponent(
    game,
    playerId
) {
    return game.players.find(
        player =>
            player.id !==
            playerId
    );
}

function publicGameState(room) {
    const game = room?.game;

    if (!game) {
        return null;
    }

    return {
        status:
            game.status,

        trump:
            game.trump,

        trumpCard:
            publicCard(
                game.trumpCard
            ),

        deckCount:
            game.deck.length,

        attackerId:
            game.attackerId,

        defenderId:
            game.defenderId,

        turnId:
            game.turnId,

        phase:
            game.phase,

        table:
            game.table.map(
                pair => ({
                    id:
                        pair.id,

                    attack:
                        publicCard(
                            pair.attack
                        ),

                    defense:
                        publicCard(
                            pair.defense
                        )
                })
            ),

        players:
            game.players.map(
                player => ({
                    id:
                        player.id,

                    telegram_id:
                        player.telegram_id,

                    first_name:
                        player.first_name,

                    last_name:
                        player.last_name,

                    username:
                        player.username,

                    handCount:
                        player.hand.length,

                    connected:
                        !!player.connected
                })
            ),

        winnerId:
            game.winnerId,

        loserId:
            game.loserId,

        lastAction:
            game.lastAction,

        roundNumber:
            game.roundNumber,

        startedAt:
            game.startedAt,

        finishedAt:
            game.finishedAt
    };
}

function privateGameState(
    room,
    playerId
) {
    const state =
        publicGameState(room);

    if (!state) {
        return null;
    }

    const game = room.game;

    const player =
        getGamePlayer(
            game,
            playerId
        );

    if (!player) {
        return state;
    }

    return {
        ...state,

        myId:
            playerId,

        myHand:
            player.hand.map(
                publicCard
            )
    };
}

function emitGameState(room) {
    if (!room) {
        return;
    }

    for (
        const roomPlayer
        of room.players
    ) {
        if (!roomPlayer.socketId) {
            continue;
        }

        io.to(
            roomPlayer.socketId
        ).emit(
            "game:state",
            privateGameState(
                room,
                roomPlayer.id
            )
        );
    }
}

/*
=========================================================
GAME FINISH
=========================================================
*/

function finishGame(
    room,
    winnerId,
    loserId,
    reason
) {
    const game = room.game;

    if (
        !game ||
        game.status === "finished"
    ) {
        return;
    }

    game.status = "finished";

    game.winnerId =
        winnerId;

    game.loserId =
        loserId;

    game.finishedAt =
        now();

    game.lastAction = {
        type:
            "game_finished",

        reason:
            reason || "normal",

        winnerId,

        loserId,

        timestamp:
            now()
    };

    room.status = "finished";
    room.updatedAt = now();

    const winnerPlayer =
        getPlayerById(
            winnerId
        );

    const loserPlayer =
        getPlayerById(
            loserId
        );

    if (winnerPlayer) {
        winnerPlayer.wins =
            safeNumber(
                winnerPlayer.wins,
                0
            ) + 1;

        winnerPlayer.games =
            safeNumber(
                winnerPlayer.games,
                0
            ) + 1;

        addXP(
            winnerPlayer,
            100
        );
    }

    if (loserPlayer) {
        loserPlayer.losses =
            safeNumber(
                loserPlayer.losses,
                0
            ) + 1;

        loserPlayer.games =
            safeNumber(
                loserPlayer.games,
                0
            ) + 1;

        addXP(
            loserPlayer,
            30
        );
    }

    savePlayers();

    broadcastRoom(room);
    emitGameState(room);

    io.to(
        `room:${room.code}`
    ).emit(
        "game:finished",
        {
            winnerId,
            loserId,
            reason,
            timestamp:
                now()
        }
    );
}

/*
=========================================================
ROUND / TURN
=========================================================
*/

function prepareNextTurn(
    room
) {
    const game = room.game;

    if (!game) {
        return;
    }

    /*
     * Если атакующий закончил ход
     * успешно, роли меняются.
     */
    const oldAttacker =
        game.attackerId;

    const oldDefender =
        game.defenderId;

    game.attackerId =
        oldDefender;

    game.defenderId =
        oldAttacker;

    game.turnId =
        game.attackerId;

    game.phase =
        "attack";

    game.table = [];

    game.roundNumber++;

    game.lastAction = {
        type:
            "new_round",

        attackerId:
            game.attackerId,

        defenderId:
            game.defenderId,

        timestamp:
            now()
    };

    drawUpToSix(
        game,
        room
    );

    checkGameEnd(room);
}

function prepareAfterDefenderTakes(
    room
) {
    const game = room.game;

    if (!game) {
        return;
    }

    /*
     * Защищающийся забирает карты.
     * После этого атакующий начинает
     * следующий ход снова.
     */

    const attackerId =
        game.attackerId;

    const defenderId =
        game.defenderId;

    const defender =
        getGamePlayer(
            game,
            defenderId
        );

    for (
        const pair
        of game.table
    ) {
        if (pair.attack) {
            defender.hand.push(
                pair.attack
            );
        }

        if (pair.defense) {
            defender.hand.push(
                pair.defense
            );
        }
    }

    game.table = [];

    game.turnId =
        attackerId;

    game.phase =
        "attack";

    game.lastAction = {
        type:
            "defender_took",

        attackerId,

        defenderId,

        timestamp:
            now()
    };

    drawUpToSix(
        game,
        room
    );

    checkGameEnd(room);
}

function checkGameEnd(room) {
    const game = room.game;

    if (!game) {
        return false;
    }

    /*
     * Пока колода не закончилась,
     * отсутствие карт не означает победу.
     */
    if (game.deck.length > 0) {
        return false;
    }

    for (
        const player
        of game.players
    ) {
        if (
            player.hand.length === 0
        ) {
            const opponent =
                getOpponent(
                    game,
                    player.id
                );

            finishGame(
                room,
                player.id,
                opponent.id,
                "no_cards"
            );

            return true;
        }
    }

    return false;
}

/*
=========================================================
ATTACK
=========================================================
*/

function attackWithCard(
    room,
    playerId,
    cardId
) {
    const game = room.game;

    if (
        !game ||
        game.status !== "playing"
    ) {
        return {
            success: false,
            error:
                "Игра не запущена"
        };
    }

    if (
        game.phase !== "attack"
    ) {
        return {
            success: false,
            error:
                "Сейчас нельзя атаковать"
        };
    }

    if (
        game.turnId !== playerId
    ) {
        return {
            success: false,
            error:
                "Сейчас не ваш ход"
        };
    }

    const attacker =
        getGamePlayer(
            game,
            playerId
        );

    if (!attacker) {
        return {
            success: false,
            error:
                "Игрок не найден"
        };
    }

    const card =
        findCardInHand(
            attacker.hand,
            cardId
        );

    if (!card) {
        return {
            success: false,
            error:
                "Карта не найдена"
        };
    }

    if (
        game.table.length >
            0 &&
        !canAddAttackCard(
            game,
            card
        )
    ) {
        return {
            success: false,
            error:
                "Нельзя подкинуть карту этого значения"
        };
    }

    /*
     * Максимум 6 атакующих карт
     * одновременно.
     */
    if (
        game.table.length >=
        MAX_HAND
    ) {
        return {
            success: false,
            error:
                "Нельзя подкинуть больше шести карт"
        };
    }

    const removed =
        removeCardFromHand(
            attacker.hand,
            cardId
        );

    if (!removed) {
        return {
            success: false,
            error:
                "Не удалось взять карту"
        };
    }

    game.table.push({
        id:
            randomId("pair_"),

        attack:
            removed,

        defense:
            null
    });

    game.phase =
        "defense";

    game.turnId =
        game.defenderId;

    game.lastAction = {
        type:
            "attack",

        playerId,

        card:
            publicCard(
                removed
            ),

        timestamp:
            now()
    };

    room.updatedAt = now();

    return {
        success: true
    };
}

/*
=========================================================
DEFENSE
=========================================================
*/

function defendWithCard(
    room,
    playerId,
    pairId,
    cardId
) {
    const game = room.game;

    if (
        !game ||
        game.status !== "playing"
    ) {
        return {
            success: false,
            error:
                "Игра не запущена"
        };
    }

    if (
        game.phase !== "defense"
    ) {
        return {
            success: false,
            error:
                "Сейчас нельзя защищаться"
        };
    }

    if (
        game.turnId !== playerId
    ) {
        return {
            success: false,
            error:
                "Сейчас не ваш ход"
        };
    }

    const defender =
        getGamePlayer(
            game,
            playerId
        );

    if (!defender) {
        return {
            success: false,
            error:
                "Игрок не найден"
        };
    }

    const pair =
        game.table.find(
            item =>
                item.id === pairId
        );

    if (!pair) {
        return {
            success: false,
            error:
                "Атакующая карта не найдена"
        };
    }

    if (pair.defense) {
        return {
            success: false,
            error:
                "Эта карта уже побита"
        };
    }

    const defense =
        findCardInHand(
            defender.hand,
            cardId
        );

    if (!defense) {
        return {
            success: false,
            error:
                "Карта защиты не найдена"
        };
    }

    if (
        !canBeat(
            pair.attack,
            defense,
            game.trump
        )
    ) {
        return {
            success: false,
            error:
                "Этой картой нельзя побить"
        };
    }

    const removed =
        removeCardFromHand(
            defender.hand,
            cardId
        );

    if (!removed) {
        return {
            success: false,
            error:
                "Не удалось взять карту"
        };
    }

    pair.defense =
        removed;

    game.lastAction = {
        type:
            "defense",

        playerId,

        attack:
            publicCard(
                pair.attack
            ),

        defense:
            publicCard(
                removed
            ),

        timestamp:
            now()
    };

    /*
     * Если все карты побиты,
     * ход возвращается атакующему
     * для возможного подкидывания.
     */
    if (
        allAttacksDefended(
            game
        )
    ) {
        game.phase =
            "attack";

        game.turnId =
            game.attackerId;
    } else {
        game.phase =
            "defense";

        game.turnId =
            game.defenderId;
    }

    room.updatedAt = now();

    return {
        success: true
    };
}

/*
=========================================================
TAKE CARDS
=========================================================
*/

function takeCards(
    room,
    playerId
) {
    const game = room.game;

    if (
        !game ||
        game.status !== "playing"
    ) {
        return {
            success: false,
            error:
                "Игра не запущена"
        };
    }

    if (
        game.defenderId !==
        playerId
    ) {
        return {
            success: false,
            error:
                "Только защищающийся может забрать карты"
        };
    }

    if (
        game.turnId !==
        playerId
    ) {
        return {
            success: false,
            error:
                "Сейчас не ваш ход"
        };
    }

    if (
        !tableHasUncoveredAttack(
            game
        )
    ) {
        return {
            success: false,
            error:
                "Все карты уже побиты"
        };
    }

    prepareAfterDefenderTakes(
        room
    );

    return {
        success: true
    };
}

/*
=========================================================
END ATTACK
=========================================================
*/

function endAttack(
    room,
    playerId
) {
    const game = room.game;

    if (
        !game ||
        game.status !== "playing"
    ) {
        return {
            success: false,
            error:
                "Игра не запущена"
        };
    }

    if (
        game.attackerId !==
        playerId
    ) {
        return {
            success: false,
            error:
                "Завершить атаку может только атакующий"
        };
    }

    if (
        game.turnId !==
        playerId
    ) {
        return {
            success: false,
            error:
                "Сейчас не ваш ход"
        };
    }

    if (
        game.table.length === 0
    ) {
        return {
            success: false,
            error:
                "Нужно сделать хотя бы одну атаку"
        };
    }

    if (
        !allAttacksDefended(
            game
        )
    ) {
        return {
            success: false,
            error:
                "Не все карты побиты"
        };
    }

    const defender =
        getGamePlayer(
            game,
            game.defenderId
        );

    /*
     * Все карты стола уходят
     * в сброс.
     */
    game.table = [];

    game.phase =
        "attack";

    game.lastAction = {
        type:
            "attack_finished",

        playerId,

        timestamp:
            now()
    };

    /*
     * Перед сменой ролей проверяем
     * возможность закончить игру.
     */
    if (
        game.deck.length === 0
    ) {
        const attacker =
            getGamePlayer(
                game,
                game.attackerId
            );

        if (
            attacker.hand.length === 0
        ) {
            finishGame(
                room,
                attacker.id,
                defender.id,
                "no_cards"
            );

            return {
                success: true
            };
        }

        if (
            defender.hand.length === 0
        ) {
            finishGame(
                room,
                defender.id,
                attacker.id,
                "no_cards"
            );

            return {
                success: true
            };
        }
    }

    prepareNextTurn(room);

    return {
        success: true
    };
}

/*
=========================================================
ROOM GAME VALIDATION
=========================================================
*/

function canStartRoom(room) {
    if (!room) {
        return {
            success: false,
            error:
                "Комната не найдена"
        };
    }

    if (
        room.players.length !== 2
    ) {
        return {
            success: false,
            error:
                "Нужны два игрока"
        };
    }

    for (
        const player
        of room.players
    ) {
        if (!player.connected) {
            return {
                success: false,
                error:
                    "Оба игрока должны быть подключены"
            };
        }
    }

    return {
        success: true
    };
}

function startRoomGame(room) {
    const check =
        canStartRoom(room);

    if (!check.success) {
        return check;
    }

    if (
        room.game &&
        room.game.status ===
            "playing"
    ) {
        return {
            success: false,
            error:
                "Игра уже идет"
        };
    }

    try {
        createGame(room);

        broadcastRoom(room);
        emitGameState(room);

        io.to(
            `room:${room.code}`
        ).emit(
            "game:started",
            publicGameState(
                room
            )
        );

        return {
            success: true
        };
    } catch (error) {
        console.error(
            "[GAME] START ERROR:",
            error
        );

        return {
            success: false,
            error:
                "Не удалось начать игру"
        };
    }
}

/*
=========================================================
HTTP BASE
=========================================================
*/

app.get(
    "/",
    (req, res) => {
        res.json({
            success: true,

            game:
                "Heavy Lux Card",

            version:
                GAME_VERSION,

            status:
                "online",

            ai:
                false,

            factions:
                false,

            pvp:
                true
        });
    }
);

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            success: true,

            status:
                "online",

            game:
                "Heavy Lux Card",

            version:
                GAME_VERSION,

            players:
                Object.keys(
                    players
                ).length,

            rooms:
                rooms.size,

            cars:
                CARS.length,

            exclusiveCars:
                EXCLUSIVE_CARS.length,

            realEstate:
                REAL_ESTATE.length,

            businesses:
                BUSINESSES.length,

            beautifulPlates:
                BEAUTIFUL_PLATES.length,

            ai:
                false,

            factions:
                false,

            pvp:
                true
        });
    }
);

/*
=========================================================
AUTH
=========================================================
*/

app.post(
    "/api/auth",
    (req, res) => {
        try {
            const user =
                validateTelegramInitData(
                    req.body?.initData
                );

            if (!user) {
                return res
                    .status(401)
                    .json({
                        success: false,
                        error:
                            "Telegram authorization failed"
                    });
            }

            const player =
                createPlayer(
                    user
                );

            res.json({
                success: true,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[AUTH]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Internal server error"
            });
        }
    }
);

app.get(
    "/api/player",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        res.json({
            success: true,

            player:
                publicPlayer(
                    player
                )
        });
    }
);

/*
=========================================================
CATALOG API
=========================================================
*/

app.get(
    "/api/car-colors",
    (req, res) => {
        res.json({
            success: true,
            colors:
                CAR_COLORS
        });
    }
);

app.get(
    "/api/cars",
    (req, res) => {
        res.json({
            success: true,
            cars:
                CARS
        });
    }
);

app.get(
    "/api/dealership",
    (req, res) => {
        res.json({
            success: true,
            cars:
                CARS,
            colors:
                CAR_COLORS
        });
    }
);

app.get(
    "/api/exclusive-cars",
    (req, res) => {
        res.json({
            success: true,

            category:
                "Heavy Exclusive Cars",

            atelier:
                "Tuning Atelier",

            cars:
                EXCLUSIVE_CARS,

            colors:
                CAR_COLORS
        });
    }
);

app.get(
    "/api/plates",
    (req, res) => {
        res.json({
            success: true,

            plates:
                BEAUTIFUL_PLATES
        });
    }
);

app.get(
    "/api/real-estate",
    (req, res) => {
        res.json({
            success: true,

            realEstate:
                REAL_ESTATE
        });
    }
);

app.get(
    "/api/businesses",
    (req, res) => {
        res.json({
            success: true,

            businesses:
                BUSINESSES
        });
    }
);

/*
=========================================================
BUY NORMAL CAR
=========================================================
*/

app.post(
    "/api/cars/buy",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const car =
                getCatalogCar(
                    req.body?.carId
                );

            if (!car) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Автомобиль не найден"
                    });
            }

            const color =
                getColor(
                    req.body?.colorId
                );

            if (!color) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Выберите цвет автомобиля"
                    });
            }

            if (
                !removeMoney(
                    player,
                    car.price
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Недостаточно HC",
                        required:
                            car.price,
                        balance:
                            player.balance
                    });
            }

            const playerCar = {
                id:
                    randomId("car_"),

                catalogId:
                    car.id,

                brand:
                    car.brand,

                model:
                    car.model,

                name:
                    car.name,

                price:
                    car.price,

                category:
                    car.category,

                tuning:
                    null,

                tuningAtelier:
                    false,

                colorId:
                    color.id,

                colorName:
                    color.name,

                colorHex:
                    color.hex,

                purchasedAt:
                    now(),

                registered:
                    false,

                plate:
                    null,

                beautifulPlate:
                    null,

                registrationDate:
                    null,

                gibdd:
                    false,

                technicalInspection:
                    false
            };

            player.cars.push(
                playerCar
            );

            player.updated_at =
                now();

            savePlayers();

            res.json({
                success: true,

                message:
                    "Автомобиль приобретён",

                car:
                    playerCar,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[BUY CAR]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка покупки автомобиля"
            });
        }
    }
);

/*
=========================================================
BUY EXCLUSIVE CAR
=========================================================
*/

app.post(
    "/api/exclusive-cars/buy",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const car =
                getExclusiveCar(
                    req.body?.carId
                );

            if (!car) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Эксклюзивный автомобиль не найден"
                    });
            }

            const color =
                getColor(
                    req.body?.colorId
                );

            if (!color) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Выберите цвет автомобиля"
                    });
            }

            if (
                !removeMoney(
                    player,
                    car.price
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Недостаточно HC",
                        required:
                            car.price,
                        balance:
                            player.balance
                    });
            }

            const playerCar = {
                id:
                    randomId("car_"),

                catalogId:
                    car.id,

                brand:
                    car.brand,

                model:
                    car.model,

                name:
                    car.name,

                price:
                    car.price,

                category:
                    car.category,

                tuning:
                    car.tuning,

                tuningAtelier:
                    true,

                colorId:
                    color.id,

                colorName:
                    color.name,

                colorHex:
                    color.hex,

                purchasedAt:
                    now(),

                registered:
                    false,

                plate:
                    null,

                beautifulPlate:
                    null,

                registrationDate:
                    null,

                gibdd:
                    false,

                technicalInspection:
                    false
            };

            player.cars.push(
                playerCar
            );

            player.updated_at =
                now();

            savePlayers();

            res.json({
                success: true,

                message:
                    "Эксклюзивный автомобиль приобретён",

                car:
                    playerCar,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[BUY EXCLUSIVE]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка покупки эксклюзивного автомобиля"
            });
        }
    }
);

/*
=========================================================
GARAGE
=========================================================
*/

app.get(
    "/api/garage",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        res.json({
            success: true,

            cars:
                player.cars || [],

            player:
                publicPlayer(
                    player
                )
        });
    }
);

/*
=========================================================
GIBDD
=========================================================
*/

function registerCar(
    player,
    carId
) {
    const car =
        findPlayerCar(
            player,
            carId
        );

    if (!car) {
        return {
            success: false,
            status: 404,
            error:
                "Автомобиль не найден"
        };
    }

    if (car.registered) {
        return {
            success: false,
            status: 400,
            error:
                "Автомобиль уже зарегистрирован"
        };
    }

    if (
        !removeMoney(
            player,
            GIBDD_REGISTRATION_PRICE
        )
    ) {
        return {
            success: false,
            status: 400,
            error:
                "Недостаточно HC",
            required:
                GIBDD_REGISTRATION_PRICE,
            balance:
                player.balance
        };
    }

    let plate;

    try {
        plate =
            generatePlate();
    } catch {
        addMoney(
            player,
            GIBDD_REGISTRATION_PRICE
        );

        return {
            success: false,
            status: 500,
            error:
                "Не удалось выдать государственный номер"
        };
    }

    car.registered = true;
    car.plate = plate;
    car.registrationDate = now();
    car.gibdd = true;
    car.technicalInspection = true;

    player.updated_at = now();

    savePlayers();

    return {
        success: true,
        car,
        plate
    };
}

app.get(
    "/api/gibdd",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        res.json({
            success: true,

            department:
                "ГИБДД",

            registrationPrice:
                GIBDD_REGISTRATION_PRICE,

            cars:
                (
                    player.cars ||
                    []
                ).map(
                    car => ({
                        ...car,

                        registrationAvailable:
                            !car.registered
                    })
                )
        });
    }
);

app.post(
    "/api/gibdd/register",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const result =
                registerCar(
                    player,
                    req.body?.carId
                );

            if (!result.success) {
                return res
                    .status(
                        result.status ||
                        400
                    )
                    .json({
                        success:
                            false,
                        error:
                            result.error,
                        required:
                            result.required,
                        balance:
                            result.balance
                    });
            }

            res.json({
                success: true,

                message:
                    "Автомобиль зарегистрирован в ГИБДД",

                plate:
                    result.plate,

                car:
                    result.car,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[GIBDD]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка регистрации"
            });
        }
    }
);

/*
=========================================================
BEAUTIFUL PLATES
=========================================================
*/

app.get(
    "/api/beautiful-plates",
    (req, res) => {
        res.json({
            success: true,

            plates:
                BEAUTIFUL_PLATES
        });
    }
);

app.post(
    "/api/beautiful-plates/buy",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const catalogPlate =
                BEAUTIFUL_PLATES.find(
                    plate =>
                        plate.id ===
                        req.body?.plateId
                );

            if (!catalogPlate) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Номер не найден"
                    });
            }

            if (
                isPlateUsed(
                    catalogPlate.number
                )
            ) {
                return res
                    .status(409)
                    .json({
                        success: false,
                        error:
                            "Этот номер уже занят"
                    });
            }

            if (
                !removeMoney(
                    player,
                    catalogPlate.price
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Недостаточно HC",
                        required:
                            catalogPlate.price,
                        balance:
                            player.balance
                    });
            }

            const ownedPlate = {
                id:
                    randomId("plate_"),

                catalogId:
                    catalogPlate.id,

                number:
                    catalogPlate.number,

                price:
                    catalogPlate.price,

                rarity:
                    catalogPlate.rarity,

                purchasedAt:
                    now(),

                installedOn:
                    null
            };

            player.beautifulPlates.push(
                ownedPlate
            );

            player.updated_at =
                now();

            savePlayers();

            res.json({
                success: true,

                message:
                    "Красивый номер приобретён",

                plate:
                    ownedPlate,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[PLATE BUY]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка покупки номера"
            });
        }
    }
);

app.post(
    "/api/beautiful-plates/install",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const car =
                findPlayerCar(
                    player,
                    req.body?.carId
                );

            if (!car) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Автомобиль не найден"
                    });
            }

            if (!car.registered) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Сначала зарегистрируйте автомобиль в ГИБДД"
                    });
            }

            const plate =
                (
                    player.beautifulPlates ||
                    []
                ).find(
                    item =>
                        item.id ===
                        req.body?.plateId
                );

            if (!plate) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Красивый номер не найден"
                    });
            }

            /*
             * Снимаем красивый номер
             * с другого автомобиля.
             */
            for (
                const otherCar
                of player.cars
            ) {
                if (
                    otherCar.beautifulPlate ===
                    plate.number
                ) {
                    otherCar.beautifulPlate =
                        null;

                    /*
                     * Возвращаем обычный
                     * государственный номер.
                     */
                    if (
                        otherCar.plate &&
                        otherCar.registered
                    ) {
                        otherCar.displayPlate =
                            otherCar.plate;
                    }
                }
            }

            car.beautifulPlate =
                plate.number;

            car.displayPlate =
                plate.number;

            plate.installedOn =
                car.id;

            player.updated_at =
                now();

            savePlayers();

            res.json({
                success: true,

                message:
                    "Красивый номер установлен",

                car,

                plate,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[PLATE INSTALL]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка установки номера"
            });
        }
    }
);

/*
=========================================================
REAL ESTATE
=========================================================
*/

app.get(
    "/api/real-estate/owned",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        res.json({
            success: true,

            realEstate:
                player.realEstate || []
        });
    }
);

app.post(
    "/api/real-estate/buy",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const estate =
                getCatalogEstate(
                    req.body?.estateId
                );

            if (!estate) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Объект недвижимости не найден"
                    });
            }

            if (
                player.realEstate.some(
                    item =>
                        item.catalogId ===
                        estate.id
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Этот объект уже принадлежит вам"
                    });
            }

            if (
                !removeMoney(
                    player,
                    estate.price
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Недостаточно HC",
                        required:
                            estate.price,
                        balance:
                            player.balance
                    });
            }

            const owned = {
                id:
                    randomId("estate_"),

                catalogId:
                    estate.id,

                name:
                    estate.name,

                type:
                    estate.type,

                category:
                    estate.category,

                price:
                    estate.price,

                purchasedAt:
                    now()
            };

            player.realEstate.push(
                owned
            );

            player.updated_at =
                now();

            savePlayers();

            res.json({
                success: true,

                message:
                    "Недвижимость приобретена",

                estate:
                    owned,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[REAL ESTATE BUY]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка покупки недвижимости"
            });
        }
    }
);

/*
=========================================================
BUSINESS
=========================================================
*/

app.get(
    "/api/businesses/owned",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        const businesses =
            (
                player.businesses ||
                []
            ).map(
                business => ({
                    ...business,

                    catalog:
                        getCatalogBusiness(
                            business.catalogId
                        ),

                    availableIncome:
                        calculateBusinessIncome(
                            business
                        )
                })
            );

        res.json({
            success: true,
            businesses
        });
    }
);

app.post(
    "/api/businesses/buy",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const business =
                getCatalogBusiness(
                    req.body?.businessId
                );

            if (!business) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Бизнес не найден"
                    });
            }

            const totalOwned =
                Object.values(
                    players
                ).reduce(
                    (sum, otherPlayer) =>
                        sum +
                        (
                            otherPlayer.businesses ||
                            []
                        ).filter(
                            item =>
                                item.catalogId ===
                                business.id
                        ).length,
                    0
                );

            if (
                totalOwned >=
                business.maxCount
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Все предприятия этого типа уже проданы"
                    });
            }

            if (
                !removeMoney(
                    player,
                    business.price
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Недостаточно HC",
                        required:
                            business.price,
                        balance:
                            player.balance
                    });
            }

            const owned = {
                id:
                    randomId("business_"),

                catalogId:
                    business.id,

                name:
                    business.name,

                price:
                    business.price,

                incomePerHour:
                    business.incomePerHour,

                category:
                    business.category,

                purchasedAt:
                    now(),

                lastCollection:
                    now(),

                totalCollected:
                    0
            };

            player.businesses.push(
                owned
            );

            player.updated_at =
                now();

            savePlayers();

            res.json({
                success: true,

                message:
                    "Бизнес приобретён",

                business:
                    owned,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[BUSINESS BUY]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка покупки бизнеса"
            });
        }
    }
);

app.post(
    "/api/businesses/collect",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const result =
                collectBusinessIncome(
                    player,
                    req.body?.businessId
                );

            if (!result.success) {
                return res
                    .status(404)
                    .json(result);
            }

            res.json({
                success: true,

                income:
                    result.income,

                business:
                    result.business,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (error) {
            console.error(
                "[BUSINESS COLLECT]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка получения дохода"
            });
        }
    }
);

/*
=========================================================
ECONOMY
=========================================================
*/

app.get(
    "/api/economy",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        res.json({
            success: true,

            balance:
                player.balance,

            xp:
                player.xp,

            level:
                player.level,

            title:
                player.title
        });
    }
);

/*
=========================================================
ROOM HTTP API
=========================================================
*/

app.get(
    "/api/rooms",
    (req, res) => {
        const result = [];

        for (
            const room
            of rooms.values()
        ) {
            if (
                room.players.length >= 2
            ) {
                continue;
            }

            result.push({
                code:
                    room.code,

                status:
                    room.status,

                players:
                    room.players.length,

                maxPlayers:
                    2,

                createdAt:
                    room.createdAt
            });
        }

        res.json({
            success: true,
            rooms: result
        });
    }
);

app.post(
    "/api/rooms/create",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const existing =
                findRoomByPlayer(
                    player.telegram_id
                );

            if (existing) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Вы уже находитесь в комнате",
                        room:
                            publicRoom(
                                existing
                            )
                    });
            }

            const roomPlayer = {
                id:
                    randomId("rp_"),

                telegram_id:
                    player.telegram_id,

                first_name:
                    player.first_name,

                last_name:
                    player.last_name,

                username:
                    player.username,

                socketId:
                    null,

                connected:
                    false,

                ready:
                    false,

                disconnectedAt:
                    null
            };

            const room =
                createRoom(
                    roomPlayer
                );

            res.json({
                success: true,

                room:
                    publicRoom(
                        room
                    )
            });
        } catch (error) {
            console.error(
                "[ROOM CREATE]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка создания комнаты"
            });
        }
    }
);

app.post(
    "/api/rooms/join",
    (req, res) => {
        try {
            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player) {
                return;
            }

            const code =
                normalizeString(
                    req.body?.roomCode
                ).toUpperCase();

            const room =
                getRoom(code);

            if (!room) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Комната не найдена"
                    });
            }

            const existing =
                room.players.find(
                    item =>
                        String(
                            item.telegram_id
                        ) ===
                        String(
                            player.telegram_id
                        )
                );

            if (existing) {
                return res.json({
                    success: true,

                    room:
                        publicRoom(
                            room
                        )
                });
            }

            if (
                room.players.length >= 2
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Комната уже заполнена"
                    });
            }

            if (
                room.status ===
                "playing"
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Игра уже началась"
                    });
            }

            room.players.push({
                id:
                    randomId("rp_"),

                telegram_id:
                    player.telegram_id,

                first_name:
                    player.first_name,

                last_name:
                    player.last_name,

                username:
                    player.username,

                socketId:
                    null,

                connected:
                    false,

                ready:
                    false,

                disconnectedAt:
                    null
            });

            room.updatedAt = now();
            room.lastActivity = now();

            broadcastRoom(room);

            res.json({
                success: true,

                room:
                    publicRoom(
                        room
                    )
            });
        } catch (error) {
            console.error(
                "[ROOM JOIN]",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Ошибка входа в комнату"
            });
        }
    }
);

/*
=========================================================
SOCKET AUTH
=========================================================
*/

function socketAuthenticate(socket) {
    const initData =
        socket.handshake.auth?.initData ||
        socket.handshake.headers?.[
            "x-telegram-init-data"
        ];

    const user =
        validateTelegramInitData(
            initData
        );

    if (!user) {
        return null;
    }

    const player =
        createPlayer(user);

    socket.telegramUser = user;
    socket.player = player;

    return player;
}

/*
=========================================================
SOCKET.IO
=========================================================
*/

io.on(
    "connection",
    socket => {
        console.log(
            `[SOCKET] connected ${socket.id}`
        );

        const player =
            socketAuthenticate(
                socket
            );

        if (!player) {
            socket.emit(
                "auth:error",
                {
                    error:
                        "Telegram authorization required"
                }
            );

            socket.disconnect(true);

            return;
        }

        socket.emit(
            "auth:success",
            {
                player:
                    publicPlayer(
                        player
                    )
            }
        );

        /*
         * Восстанавливаем игрока
         * в существующей комнате.
         */
        const existingRoom =
            findRoomByPlayer(
                player.telegram_id
            );

        if (existingRoom) {
            const roomPlayer =
                existingRoom.players.find(
                    item =>
                        String(
                            item.telegram_id
                        ) ===
                        String(
                            player.telegram_id
                        )
                );

            if (roomPlayer) {
                roomPlayer.socketId =
                    socket.id;

                roomPlayer.connected =
                    true;

                roomPlayer.disconnectedAt =
                    null;

                socket.join(
                    `room:${existingRoom.code}`
                );

                socket.currentRoom =
                    existingRoom.code;

                existingRoom.updatedAt =
                    now();

                existingRoom.lastActivity =
                    now();

                socket.emit(
                    "room:reconnected",
                    publicRoom(
                        existingRoom
                    )
                );

                broadcastRoom(
                    existingRoom
                );

                emitGameState(
                    existingRoom
                );
            }
        }

        /*
        =================================================
        CREATE ROOM
        =================================================
        */

        socket.on(
            "room:create",
            () => {
                try {
                    const oldRoom =
                        findRoomByPlayer(
                            player.telegram_id
                        );

                    if (oldRoom) {
                        socket.emit(
                            "room:error",
                            {
                                error:
                                    "Вы уже находитесь в комнате"
                            }
                        );

                        return;
                    }

                    const roomPlayer = {
                        id:
                            randomId(
                                "rp_"
                            ),

                        telegram_id:
                            player.telegram_id,

                        first_name:
                            player.first_name,

                        last_name:
                            player.last_name,

                        username:
                            player.username,

                        socketId:
                            socket.id,

                        connected:
                            true,

                        ready:
                            false,

                        disconnectedAt:
                            null
                    };

                    const room =
                        createRoom(
                            roomPlayer
                        );

                    socket.join(
                        `room:${room.code}`
                    );

                    socket.currentRoom =
                        room.code;

                    socket.emit(
                        "room:created",
                        publicRoom(
                            room
                        )
                    );

                    broadcastRoom(
                        room
                    );
                } catch (error) {
                    console.error(
                        "[SOCKET ROOM CREATE]",
                        error
                    );

                    socket.emit(
                        "room:error",
                        {
                            error:
                                "Не удалось создать комнату"
                        }
                    );
                }
            }
        );

        /*
        =================================================
        JOIN ROOM
        =================================================
        */

        socket.on(
            "room:join",
            payload => {
                try {
                    const code =
                        normalizeString(
                            payload?.roomCode ||
                            payload?.code
                        ).toUpperCase();

                    const room =
                        getRoom(code);

                    if (!room) {
                        socket.emit(
                            "room:error",
                            {
                                error:
                                    "Комната не найдена"
                            }
                        );

                        return;
                    }

                    const existing =
                        room.players.find(
                            item =>
                                String(
                                    item.telegram_id
                                ) ===
                                String(
                                    player.telegram_id
                                )
                        );

                    if (existing) {
                        existing.socketId =
                            socket.id;

                        existing.connected =
                            true;

                        existing.disconnectedAt =
                            null;

                        socket.join(
                            `room:${room.code}`
                        );

                        socket.currentRoom =
                            room.code;

                        broadcastRoom(
                            room
                        );

                        emitGameState(
                            room
                        );

                        return;
                    }

                    if (
                        room.players.length >=
                        2
                    ) {
                        socket.emit(
                            "room:error",
                            {
                                error:
                                    "Комната заполнена"
                            }
                        );

                        return;
                    }

                    if (
                        room.status ===
                        "playing"
                    ) {
                        socket.emit(
                            "room:error",
                            {
                                error:
                                    "Игра уже началась"
                            }
                        );

                        return;
                    }

                    const roomPlayer = {
                        id:
                            randomId(
                                "rp_"
                            ),

                        telegram_id:
                            player.telegram_id,

                        first_name:
                            player.first_name,

                        last_name:
                            player.last_name,

                        username:
                            player.username,

                        socketId:
                            socket.id,

                        connected:
                            true,

                        ready:
                            false,

                        disconnectedAt:
                            null
                    };

                    room.players.push(
                        roomPlayer
                    );

                    room.updatedAt =
                        now();

                    room.lastActivity =
                        now();

                    socket.join(
                        `room:${room.code}`
                    );

                    socket.currentRoom =
                        room.code;

                    broadcastRoom(
                        room
                    );

                    socket.emit(
                        "room:joined",
                        publicRoom(
                            room
                        )
                    );

                    /*
                     * Когда второй игрок
                     * вошел, можно начинать
                     * игру автоматически,
                     * если оба подключены.
                     */
                    if (
                        room.players.length ===
                            2 &&
                        room.players.every(
                            p =>
                                p.connected
                        )
                    ) {
                        startRoomGame(
                            room
                        );
                    }
                } catch (error) {
                    console.error(
                        "[SOCKET ROOM JOIN]",
                        error
                    );

                    socket.emit(
                        "room:error",
                        {
                            error:
                                "Не удалось войти в комнату"
                        }
                    );
                }
            }
        );

        /*
        =================================================
        ROOM STATE
        =================================================
        */

        socket.on(
            "room:state",
            () => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                socket.emit(
                    "room:update",
                    publicRoom(
                        room
                    )
                );

                if (room.game) {
                    socket.emit(
                        "game:state",
                        privateGameState(
                            room,
                            findRoomPlayerId(
                                room,
                                player.telegram_id
                            )
                        )
                    );
                }
            }
        );

        /*
        =================================================
        READY
        =================================================
        */

        socket.on(
            "room:ready",
            payload => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    socket.emit(
                        "room:error",
                        {
                            error:
                                "Комната не найдена"
                        }
                    );

                    return;
                }

                const roomPlayer =
                    findRoomPlayer(
                        room,
                        player.telegram_id
                    );

                if (!roomPlayer) {
                    return;
                }

                roomPlayer.ready =
                    payload?.ready !==
                    false;

                room.updatedAt =
                    now();

                broadcastRoom(
                    room
                );
            }
        );

        /*
        =================================================
        START GAME
        =================================================
        */

        socket.on(
            "game:start",
            () => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                const result =
                    startRoomGame(
                        room
                    );

                if (!result.success) {
                    socket.emit(
                        "game:error",
                        {
                            error:
                                result.error
                        }
                    );
                }
            }
        );

        /*
        =================================================
        ATTACK
        =================================================
        */

        socket.on(
            "game:attack",
            payload => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                const roomPlayer =
                    findRoomPlayer(
                        room,
                        player.telegram_id
                    );

                if (!roomPlayer) {
                    return;
                }

                const result =
                    attackWithCard(
                        room,
                        roomPlayer.id,
                        payload?.cardId
                    );

                if (!result.success) {
                    socket.emit(
                        "game:error",
                        {
                            error:
                                result.error
                        }
                    );

                    return;
                }

                broadcastRoom(
                    room
                );

                emitGameState(
                    room
                );
            }
        );

        /*
        =================================================
        DEFENSE
        =================================================
        */

        socket.on(
            "game:defend",
            payload => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                const roomPlayer =
                    findRoomPlayer(
                        room,
                        player.telegram_id
                    );

                if (!roomPlayer) {
                    return;
                }

                const result =
                    defendWithCard(
                        room,
                        roomPlayer.id,
                        payload?.pairId,
                        payload?.cardId
                    );

                if (!result.success) {
                    socket.emit(
                        "game:error",
                        {
                            error:
                                result.error
                        }
                    );

                    return;
                }

                broadcastRoom(
                    room
                );

                emitGameState(
                    room
                );
            }
        );

        /*
        =================================================
        TAKE
        =================================================
        */

        socket.on(
            "game:take",
            () => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                const roomPlayer =
                    findRoomPlayer(
                        room,
                        player.telegram_id
                    );

                if (!roomPlayer) {
                    return;
                }

                const result =
                    takeCards(
                        room,
                        roomPlayer.id
                    );

                if (!result.success) {
                    socket.emit(
                        "game:error",
                        {
                            error:
                                result.error
                        }
                    );

                    return;
                }

                broadcastRoom(
                    room
                );

                emitGameState(
                    room
                );
            }
        );

        /*
        =================================================
        END ATTACK
        =================================================
        */

        socket.on(
            "game:endAttack",
            () => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                const roomPlayer =
                    findRoomPlayer(
                        room,
                        player.telegram_id
                    );

                if (!roomPlayer) {
                    return;
                }

                const result =
                    endAttack(
                        room,
                        roomPlayer.id
                    );

                if (!result.success) {
                    socket.emit(
                        "game:error",
                        {
                            error:
                                result.error
                        }
                    );

                    return;
                }

                broadcastRoom(
                    room
                );

                emitGameState(
                    room
                );
            }
        );

        /*
        =================================================
        CHAT
        =================================================
        */

        socket.on(
            "room:chat",
            payload => {
                const room =
                    getRoom(
                        socket.currentRoom
                    );

                if (!room) {
                    return;
                }

                const text =
                    normalizeString(
                        payload?.text
                    );

                if (!text) {
                    return;
                }

                const safeText =
                    text.slice(
                        0,
                        500
                    );

                const message = {
                    id:
                        randomId(
                            "msg_"
                        ),

                    telegram_id:
                        player.telegram_id,

                    first_name:
                        player.first_name,

                    username:
                        player.username,

                    text:
                        safeText,

                    timestamp:
                        now()
                };

                room.chat.push(
                    message
                );

                if (
                    room.chat.length >
                    MAX_ROOM_CHAT_MESSAGES
                ) {
                    room.chat =
                        room.chat.slice(
                            -MAX_ROOM_CHAT_MESSAGES
                        );
                }

                room.updatedAt =
                    now();

                io.to(
                    `room:${room.code}`
                ).emit(
                    "room:chat",
                    message
                );
            }
        );

        /*
        =================================================
        LEAVE ROOM
        =================================================
        */

        socket.on(
            "room:leave",
            () => {
                leaveRoomBySocket(
                    socket,
                    false
                );
            }
        );

        /*
        =================================================
        DISCONNECT
        =================================================
        */

        socket.on(
            "disconnect",
            reason => {
                console.log(
                    `[SOCKET] disconnected ${socket.id}: ${reason}`
                );

                leaveRoomBySocket(
                    socket,
                    true
                );
            }
        );
    }
);

/*
=========================================================
ROOM PLAYER HELPERS
=========================================================
*/

function findRoomPlayer(
    room,
    telegramId
) {
    if (!room) {
        return null;
    }

    return room.players.find(
        item =>
            String(
                item.telegram_id
            ) ===
            String(
                telegramId
            )
    ) || null;
}

function findRoomPlayerId(
    room,
    telegramId
) {
    const player =
        findRoomPlayer(
            room,
            telegramId
        );

    return player
        ? player.id
        : null;
}

function leaveRoomBySocket(
    socket,
    disconnected
) {
    const code =
        socket.currentRoom;

    if (!code) {
        return;
    }

    const room =
        getRoom(code);

    if (!room) {
        socket.currentRoom =
            null;

        return;
    }

    const roomPlayer =
        room.players.find(
            item =>
                item.socketId ===
                socket.id
        );

    if (!roomPlayer) {
        socket.currentRoom =
            null;

        return;
    }

    if (disconnected) {
        /*
         * При disconnect не удаляем
         * игрока мгновенно.
         * Это позволяет переподключиться.
         */
        roomPlayer.connected =
            false;

        roomPlayer.socketId =
            null;

        roomPlayer.disconnectedAt =
            now();

        room.updatedAt =
            now();

        room.lastActivity =
            now();

        broadcastRoom(
            room
        );

        return;
    }

    /*
     * Явный выход.
     */
    const game =
        room.game;

    if (
        game &&
        game.status ===
            "playing"
    ) {
        const quitter =
            game.players.find(
                item =>
                    item.id ===
                    roomPlayer.id
            );

        const opponent =
            game.players.find(
                item =>
                    item.id !==
                    roomPlayer.id
            );

        if (
            quitter &&
            opponent
        ) {
            finishGame(
                room,
                opponent.id,
                quitter.id,
                "opponent_left"
            );
        }
    }

    removeRoomPlayer(
        room,
        roomPlayer.telegram_id
    );

    socket.leave(
        `room:${room.code}`
    );

    socket.currentRoom =
        null;

    room.updatedAt =
        now();

    room.lastActivity =
        now();

    if (
        room.players.length ===
        0
    ) {
        rooms.delete(
            room.code
        );

        return;
    }

    if (
        room.game &&
        room.game.status ===
            "playing"
    ) {
        room.status =
            "finished";
    } else {
        room.status =
            "waiting";
    }

    broadcastRoom(
        room
    );
}

/*
=========================================================
ROOM CLEANUP
=========================================================
*/

function cleanupRooms() {
    const current =
        now();

    for (
        const room
        of rooms.values()
    ) {
        /*
         * Удаляем комнаты,
         * в которых все вышли.
         */
        if (
            room.players.length ===
            0
        ) {
            rooms.delete(
                room.code
            );

            continue;
        }

        /*
         * Если игрок отключился
         * более чем на минуту,
         * он считается вышедшим.
         */
        for (
            const roomPlayer
            of [
                ...room.players
            ]
        ) {
            if (
                !roomPlayer.connected &&
                roomPlayer.disconnectedAt &&
                current -
                    roomPlayer.disconnectedAt >=
                    ROOM_RECONNECT_TIMEOUT
            ) {
                const game =
                    room.game;

                if (
                    game &&
                    game.status ===
                        "playing"
                ) {
                    const quitter =
                        game.players.find(
                            item =>
                                item.id ===
                                roomPlayer.id
                        );

                    const opponent =
                        game.players.find(
                            item =>
                                item.id !==
                                roomPlayer.id
                        );

                    if (
                        quitter &&
                        opponent
                    ) {
                        finishGame(
                            room,
                            opponent.id,
                            quitter.id,
                            "disconnect_timeout"
                        );
                    }
                }

                removeRoomPlayer(
                    room,
                    roomPlayer.telegram_id
                );
            }
        }

        if (
            room.players.length ===
            0
        ) {
            rooms.delete(
                room.code
            );

            continue;
        }

        /*
         * Долго неактивные комнаты.
         */
        if (
            current -
                room.lastActivity >
            ROOM_CLEANUP_TIMEOUT
        ) {
            rooms.delete(
                room.code
            );

            continue;
        }
    }
}

setInterval(
    cleanupRooms,
    30 * 1000
);

/*
=========================================================
GLOBAL ERROR HANDLING
=========================================================
*/

app.use(
    (
        err,
        req,
        res,
        next
    ) => {
        console.error(
            "[EXPRESS ERROR]",
            err
        );

        if (res.headersSent) {
            return next(err);
        }

        res.status(500).json({
            success: false,
            error:
                "Internal server error"
        });
    }
);

/*
=========================================================
START SERVER
=========================================================
*/

server.listen(
    PORT,
    () => {
        console.log(
            "================================================="
        );

        console.log(
            "HEAVY LUX CARD"
        );

        console.log(
            `VERSION: ${GAME_VERSION}`
        );

        console.log(
            `PORT: ${PORT}`
        );

        console.log(
            "PLAYER VS PLAYER: ON"
        );

        console.log(
            "AI: OFF"
        );

        console.log(
            "FACTIONS: OFF"
        );

        console.log(
            `PLAYERS: ${Object.keys(players).length}`
        );

        console.log(
            "================================================="
        );
    }
);
