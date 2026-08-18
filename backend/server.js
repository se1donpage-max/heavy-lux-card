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
VERSION 5.1
PLAYER VS PLAYER
NO AI
NO FACTIONS
FULL DURAK ROUND LOGIC
=========================================================
*/

const app = express();

const server =
    http.createServer(app);

const io =
    new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

const PORT =
    process.env.PORT || 3000;

const BOT_TOKEN =
    process.env.BOT_TOKEN || "";

/*
=========================================================
CONFIG
=========================================================
*/

const START_MONEY = 5000;

const MAX_LEVEL = 100;

const MAX_HAND = 6;

const MAX_CHAT_MESSAGES = 100;

const GIBDD_REGISTRATION_PRICE = 25000;

const BUSINESS_MAX_STORAGE_HOURS = 72;

const BUSINESS_MAX_STORAGE_MS =
    BUSINESS_MAX_STORAGE_HOURS *
    60 *
    60 *
    1000;

const ROOM_CODE_LENGTH = 6;

const ROOM_RECONNECT_TIMEOUT =
    60 * 1000;

const ROOM_CLEANUP_TIMEOUT =
    30 * 60 * 1000;

/*
=========================================================
DATABASE
=========================================================
*/

const DATA_FILE =
    path.join(
        __dirname,
        "players.json"
    );

let players = {};

function loadPlayers() {
    try {
        if (
            fs.existsSync(
                DATA_FILE
            )
        ) {
            const data =
                fs.readFileSync(
                    DATA_FILE,
                    "utf8"
                );

            players =
                JSON.parse(
                    data
                ) || {};
        }
    } catch (error) {
        console.error(
            "LOAD PLAYERS ERROR:",
            error
        );

        players = {};
    }
}

function savePlayers() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(
                players,
                null,
                2
            ),
            "utf8"
        );
    } catch (error) {
        console.error(
            "SAVE PLAYERS ERROR:",
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

app.use(
    cors()
);

app.use(
    express.json({
        limit: "1mb"
    })
);

/*
=========================================================
TELEGRAM AUTH
=========================================================
*/

function validateTelegramInitData(
    initData
) {
    if (!BOT_TOKEN) {
        console.warn(
            "BOT_TOKEN is not configured"
        );

        return null;
    }

    if (
        !initData ||
        typeof initData !==
            "string"
    ) {
        return null;
    }

    const params =
        new URLSearchParams(
            initData
        );

    const hash =
        params.get("hash");

    if (!hash) {
        return null;
    }

    params.delete("hash");

    /*
     * Telegram WebApp data-check-string:
     * fields sorted alphabetically.
     */
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

    const secretKey =
        crypto
            .createHmac(
                "sha256",
                "WebAppData"
            )
            .update(
                BOT_TOKEN
            )
            .digest();

    const calculatedHash =
        crypto
            .createHmac(
                "sha256",
                secretKey
            )
            .update(
                dataCheckString
            )
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

    const authDate =
        Number(
            params.get(
                "auth_date"
            ) || 0
        );

    if (!authDate) {
        return null;
    }

    /*
     * InitData не старше 24 часов.
     */
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
        user =
            JSON.parse(
                params.get(
                    "user"
                ) || "{}"
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

/*
=========================================================
HTTP TELEGRAM AUTH
=========================================================
*/

function getHttpInitData(req) {
    const headerValue =
        req.headers[
            "x-telegram-init-data"
        ];

    if (
        typeof headerValue ===
        "string" &&
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

function requirePlayer(
    req,
    res
) {
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

    const player =
        createPlayer(user);

    return player;
}

/*
=========================================================
PLAYER
=========================================================
*/

function createPlayer(user) {
    const id =
        String(user.id);

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

            level:
                1,

            xp:
                0,

            title:
                "Новичок",

            wins:
                0,

            losses:
                0,

            games:
                0,

            cars:
                [],

            beautifulPlates:
                [],

            realEstate:
                [],

            businesses:
                [],

            created_at:
                Date.now(),

            updated_at:
                Date.now()
        };

        savePlayers();

        return players[id];
    }

    const player =
        players[id];

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

    if (
        !Array.isArray(
            player.cars
        )
    ) {
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

    if (
        typeof player.balance !==
        "number"
    ) {
        player.balance =
            Number(
                player.balance
            ) || 0;
    }

    if (
        typeof player.level !==
        "number"
    ) {
        player.level = 1;
    }

    if (
        typeof player.xp !==
        "number"
    ) {
        player.xp = 0;
    }

    if (
        typeof player.wins !==
        "number"
    ) {
        player.wins =
            Number(
                player.wins
            ) || 0;
    }

    if (
        typeof player.losses !==
        "number"
    ) {
        player.losses =
            Number(
                player.losses
            ) || 0;
    }

    if (
        typeof player.games !==
        "number"
    ) {
        player.games =
            Number(
                player.games
            ) || 0;
    }

    player.title =
        getTitle(
            player.level
        );

    player.updated_at =
        Date.now();

    savePlayers();

    return player;
}

function publicPlayer(
    player
) {
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
            player.beautifulPlates ||
            [],

        realEstate:
            player.realEstate ||
            [],

        businesses:
            player.businesses ||
            []
    };
}

/*
=========================================================
LEVELS
=========================================================
*/

function getTitle(level) {
    if (
        level >= 100
    ) {
        return "Легенда";
    }

    if (
        level >= 80
    ) {
        return "Император";
    }

    if (
        level >= 60
    ) {
        return "Магнат";
    }

    if (
        level >= 40
    ) {
        return "Мастер";
    }

    if (
        level >= 20
    ) {
        return "Ветеран";
    }

    return "Новичок";
}

function addXP(
    player,
    amount
) {
    if (!player) {
        return;
    }

    player.xp =
        Number(
            player.xp || 0
        ) +
        Number(
            amount || 0
        );

    while (
        player.level <
            MAX_LEVEL &&
        player.xp >=
            player.level * 100
    ) {
        player.xp -=
            player.level * 100;

        player.level++;
    }

    if (
        player.level >=
        MAX_LEVEL
    ) {
        player.level =
            MAX_LEVEL;

        player.xp = 0;
    }

    player.title =
        getTitle(
            player.level
        );

    player.updated_at =
        Date.now();

    savePlayers();
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

function getColor(
    colorId
) {
    return CAR_COLORS.find(
        color =>
            color.id ===
            colorId
    );
}

/*
=========================================================
CARS
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

/*
=========================================================
HEAVY EXCLUSIVE CARS
=========================================================
*/

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

/*
=========================================================
HELPERS
=========================================================
*/

function getPlayerById(id) {
    if (!id) {
        return null;
    }

    return (
        players[
            String(id)
        ] || null
    );
}

function normalizePlate(
    number
) {
    return String(
        number || ""
    )
        .replace(/\s/g, "")
        .toUpperCase();
}

/*
=========================================================
PLATE REGISTRY
=========================================================
*/

function isPlateUsed(
    number
) {
    const normalized =
        normalizePlate(
            number
        );

    for (
        const player
        of Object.values(
            players
        )
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
            of player.beautifulPlates ||
            []
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
    let plate;

    let attempts = 0;

    do {
        const first =
            LETTERS[
                Math.floor(
                    Math.random() *
                    LETTERS.length
                )
            ];

        const digits =
            String(
                Math.floor(
                    Math.random() *
                    1000
                )
            ).padStart(
                3,
                "0"
            );

        const second =
            LETTERS[
                Math.floor(
                    Math.random() *
                    LETTERS.length
                )
            ];

        const third =
            LETTERS[
                Math.floor(
                    Math.random() *
                    LETTERS.length
                )
            ];

        const region =
            REGIONS[
                Math.floor(
                    Math.random() *
                    REGIONS.length
                )
            ];

        plate =
            `${first}${digits}${second}${third}${region}`;

        attempts++;
    } while (
        isPlateUsed(
            plate
        ) &&
        attempts < 10000
    );

    if (
        isPlateUsed(
            plate
        )
    ) {
        throw new Error(
            "No free plate available"
        );
    }

    return plate;
}

function getCatalogCar(
    carId
) {
    return CARS.find(
        car =>
            car.id === carId
    );
}

function getExclusiveCar(
    carId
) {
    return EXCLUSIVE_CARS.find(
        car =>
            car.id === carId
    );
}

function findPlayerCar(
    player,
    carId
) {
    return (
        player.cars || []
    ).find(
        car =>
            car.id === carId
    );
}

function getCatalogEstate(
    estateId
) {
    return REAL_ESTATE.find(
        item =>
            item.id === estateId
    );
}

function getCatalogBusiness(
    businessId
) {
    return BUSINESSES.find(
        item =>
            item.id === businessId
    );
}

/*
=========================================================
BASE
=========================================================
*/

app.get(
    "/",
    (req, res) => {
        res.json({
            success: true,
            game:
                "Heavy Lux Card",
            status:
                "online",
            version:
                "5.1.0",
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
            version:
                "5.1.0",

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
                        success:
                            false,
                        error:
                            "Telegram authorization failed"
                    });
            }

            const player =
                createPlayer(
                    user
                );

            res.json({
                success:
                    true,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "AUTH ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
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
            success:
                true,

            player:
                publicPlayer(
                    player
                )
        });
    }
);

/*
=========================================================
CAR CATALOG
=========================================================
*/

app.get(
    "/api/car-colors",
    (req, res) => {
        res.json({
            success:
                true,
            colors:
                CAR_COLORS
        });
    }
);

app.get(
    "/api/cars",
    (req, res) => {
        res.json({
            success:
                true,
            cars:
                CARS
        });
    }
);

app.get(
    "/api/dealership",
    (req, res) => {
        res.json({
            success:
                true,
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
            success:
                true,

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
                        success:
                            false,
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
                        success:
                            false,
                        error:
                            "Выберите цвет автомобиля"
                    });
            }

            if (
                player.balance <
                car.price
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
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
                    crypto.randomUUID(),

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
                    Date.now(),

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

            player.balance -=
                car.price;

            player.cars.push(
                playerCar
            );

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                message:
                    "Автомобиль приобретён",

                car:
                    playerCar,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "BUY CAR ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
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
                        success:
                            false,
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
                        success:
                            false,
                        error:
                            "Выберите цвет автомобиля"
                    });
            }

            if (
                player.balance <
                car.price
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
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
                    crypto.randomUUID(),

                catalogId:
                    car.id,

                brand:
                    car.brand,

                model:
                    car.model,

                name:
                    car.name,

                tuning:
                    car.tuning,

                tuningAtelier:
                    true,

                price:
                    car.price,

                category:
                    car.category,

                colorId:
                    color.id,

                colorName:
                    color.name,

                colorHex:
                    color.hex,

                purchasedAt:
                    Date.now(),

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

            player.balance -=
                car.price;

            player.cars.push(
                playerCar
            );

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                message:
                    "Эксклюзивный автомобиль приобретён в тюнинг-ателье",

                car:
                    playerCar,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "BUY EXCLUSIVE CAR ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
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
            success:
                true,

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

        const cars =
            (
                player.cars ||
                []
            ).map(
                car => ({
                    ...car,

                    registrationAvailable:
                        !car.registered,

                    registrationPrice:
                        GIBDD_REGISTRATION_PRICE
                })
            );

        res.json({
            success:
                true,

            department:
                "ГИБДД",

            registrationPrice:
                GIBDD_REGISTRATION_PRICE,

            cars
        });
    }
);

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
            success:
                false,
            status:
                404,
            error:
                "Автомобиль не найден"
        };
    }

    if (
        car.registered
    ) {
        return {
            success:
                false,
            status:
                400,
            error:
                "Автомобиль уже зарегистрирован"
        };
    }

    if (
        player.balance <
        GIBDD_REGISTRATION_PRICE
    ) {
        return {
            success:
                false,
            status:
                400,
            error:
                "Недостаточно HC",
            required:
                GIBDD_REGISTRATION_PRICE,
            balance:
                player.balance
        };
    }

    const plate =
        generatePlate();

    player.balance -=
        GIBDD_REGISTRATION_PRICE;

    car.registered =
        true;

    car.plate =
        plate;

    car.registrationDate =
        Date.now();

    car.gibdd =
        true;

    car.technicalInspection =
        true;

    player.updated_at =
        Date.now();

    savePlayers();

    return {
        success:
            true,
        car,
        plate
    };
}

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

            if (
                !result.success
            ) {
                return res
                    .status(
                        result.status
                    )
                    .json(
                        result
                    );
            }

            res.json({
                success:
                    true,

                message:
                    "Автомобиль зарегистрирован в ГИБДД",

                department:
                    "ГИБДД",

                plate:
                    result.plate,

                car:
                    result.car,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "GIBDD ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка регистрации автомобиля"
            });
        }
    }
);

/*
=========================================================
OLD MREO COMPATIBILITY
=========================================================
*/

app.post(
    "/api/mreo/register",
    (req, res) => {
        res.status(
            410
        ).json({
            success:
                false,
            error:
                "MREO больше не используется. Используйте ГИБДД."
        });
    }
);

/*
=========================================================
PLATES
=========================================================
*/

app.get(
    "/api/plates",
    (req, res) => {
        res.json({
            success:
                true,
            plates:
                BEAUTIFUL_PLATES
        });
    }
);

app.get(
    "/api/beautiful-plates",
    (req, res) => {
        res.json({
            success:
                true,
            plates:
                BEAUTIFUL_PLATES
        });
    }
);

app.get(
    "/api/my-plates",
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
            success:
                true,

            plates:
                player.beautifulPlates ||
                []
        });
    }
);

/*
=========================================================
BUY BEAUTIFUL PLATE
=========================================================
*/

app.post(
    "/api/plates/buy",
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

            const plate =
                BEAUTIFUL_PLATES.find(
                    item =>
                        item.id ===
                        req.body?.plateId
                );

            if (!plate) {
                return res
                    .status(404)
                    .json({
                        success:
                            false,
                        error:
                            "Номер не найден"
                    });
            }

            if (
                player.balance <
                plate.price
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
                        error:
                            "Недостаточно HC"
                    });
            }

            if (
                isPlateUsed(
                    plate.number
                )
            ) {
                return res
                    .status(409)
                    .json({
                        success:
                            false,
                        error:
                            "Этот номер уже занят"
                    });
            }

            player.balance -=
                plate.price;

            player.beautifulPlates.push(
                {
                    id:
                        crypto.randomUUID(),

                    plateId:
                        plate.id,

                    number:
                        plate.number,

                    price:
                        plate.price,

                    rarity:
                        plate.rarity,

                    purchasedAt:
                        Date.now(),

                    installedOn:
                        null
                }
            );

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                message:
                    "Красивый номер приобретён",

                plate,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "BUY PLATE ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка покупки номера"
            });
        }
    }
);

/*
=========================================================
INSTALL BEAUTIFUL PLATE
=========================================================
*/

app.post(
    "/api/plates/install",
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
                        success:
                            false,
                        error:
                            "Автомобиль не найден"
                    });
            }

            if (
                !car.registered
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
                        error:
                            "Сначала зарегистрируйте автомобиль в ГИБДД"
                    });
            }

            const plate =
                player.beautifulPlates.find(
                    item =>
                        item.id ===
                        req.body?.plateId
                );

            if (!plate) {
                return res
                    .status(404)
                    .json({
                        success:
                            false,
                        error:
                            "Номер вам не принадлежит"
                    });
            }

            /*
             * Один красивый номер
             * может стоять только
             * на одной машине.
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
                }
            }

            /*
             * На одной машине
             * может быть только
             * один красивый номер.
             */
            for (
                const ownedPlate
                of player.beautifulPlates
            ) {
                if (
                    ownedPlate.id ===
                    plate.id
                ) {
                    ownedPlate.installedOn =
                        car.id;
                } else if (
                    ownedPlate.installedOn ===
                    car.id
                ) {
                    ownedPlate.installedOn =
                        null;
                }
            }

            car.beautifulPlate =
                plate.number;

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                message:
                    "Красивый номер установлен",

                car,

                plate,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "INSTALL PLATE ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка установки номера"
            });
        }
    }
);

/*
=========================================================
REMOVE BEAUTIFUL PLATE
=========================================================
*/

app.post(
    "/api/plates/remove",
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
                        success:
                            false,
                        error:
                            "Автомобиль не найден"
                    });
            }

            if (
                !car.beautifulPlate
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
                        error:
                            "На автомобиле нет красивого номера"
                    });
            }

            const number =
                car.beautifulPlate;

            car.beautifulPlate =
                null;

            const plate =
                player.beautifulPlates.find(
                    item =>
                        item.number ===
                        number
                );

            if (plate) {
                plate.installedOn =
                    null;
            }

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                message:
                    "Красивый номер снят",

                car,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "REMOVE PLATE ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка снятия номера"
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
    "/api/real-estate",
    (req, res) => {
        res.json({
            success:
                true,

            realEstate:
                REAL_ESTATE
        });
    }
);

app.get(
    "/api/my-real-estate",
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
            success:
                true,

            realEstate:
                player.realEstate ||
                []
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
                        success:
                            false,
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
                    .status(409)
                    .json({
                        success:
                            false,
                        error:
                            "Этот объект уже принадлежит вам"
                    });
            }

            if (
                player.balance <
                estate.price
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
                        error:
                            "Недостаточно HC"
                    });
            }

            player.balance -=
                estate.price;

            const property = {
                id:
                    crypto.randomUUID(),

                catalogId:
                    estate.id,

                name:
                    estate.name,

                type:
                    estate.type,

                price:
                    estate.price,

                category:
                    estate.category,

                purchasedAt:
                    Date.now()
            };

            player.realEstate.push(
                property
            );

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                property,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "BUY ESTATE ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка покупки недвижимости"
            });
        }
    }
);

/*
=========================================================
BUSINESS HELPERS
=========================================================
*/

function calculateBusinessIncome(
    business
) {
    const now =
        Date.now();

    const last =
        Number(
            business.lastIncomeUpdate ||
            business.purchasedAt ||
            now
        );

    let elapsed =
        now - last;

    if (
        elapsed < 0
    ) {
        elapsed = 0;
    }

    elapsed =
        Math.min(
            elapsed,
            BUSINESS_MAX_STORAGE_MS
        );

    const hours =
        elapsed /
        (60 * 60 * 1000);

    return Math.floor(
        hours *
        Number(
            business.incomePerHour ||
            0
        )
    );
}

function updateBusinessIncome(
    business
) {
    if (!business) {
        return 0;
    }

    const income =
        calculateBusinessIncome(
            business
        );

    if (
        income <= 0
    ) {
        return 0;
    }

    business.storedIncome =
        Number(
            business.storedIncome ||
            0
        ) + income;

    /*
     * Важный момент:
     * после расчёта переносим
     * точку отсчёта только
     * на фактически начисленный
     * интервал.
     *
     * Остаток времени не теряется.
     */
    const hoursAdded =
        income /
        Number(
            business.incomePerHour ||
            1
        );

    business.lastIncomeUpdate +=
        hoursAdded *
        60 *
        60 *
        1000;

    return income;
}

/*
=========================================================
BUSINESS CATALOG
=========================================================
*/

app.get(
    "/api/businesses",
    (req, res) => {
        res.json({
            success:
                true,

            maxStorageHours:
                BUSINESS_MAX_STORAGE_HOURS,

            businesses:
                BUSINESSES
        });
    }
);

app.get(
    "/api/my-businesses",
    (req, res) => {
        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) {
            return;
        }

        let changed =
            false;

        for (
            const business
            of player.businesses
        ) {
            const income =
                updateBusinessIncome(
                    business
                );

            if (
                income > 0
            ) {
                changed = true;
            }
        }

        if (changed) {
            player.updated_at =
                Date.now();

            savePlayers();
        }

        res.json({
            success:
                true,

            maxStorageHours:
                BUSINESS_MAX_STORAGE_HOURS,

            businesses:
                player.businesses
        });
    }
);

/*
=========================================================
BUY BUSINESS
=========================================================
*/

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

            const catalog =
                getCatalogBusiness(
                    req.body?.businessId
                );

            if (!catalog) {
                return res
                    .status(404)
                    .json({
                        success:
                            false,
                        error:
                            "Бизнес не найден"
                    });
            }

            const totalOwned =
                Object.values(
                    players
                ).reduce(
                    (
                        total,
                        p
                    ) =>
                        total +
                        (
                            p.businesses ||
                            []
                        ).filter(
                            item =>
                                item.catalogId ===
                                catalog.id
                        ).length,
                    0
                );

            if (
                totalOwned >=
                catalog.maxCount
            ) {
                return res
                    .status(409)
                    .json({
                        success:
                            false,
                        error:
                            "Все объекты этого типа уже проданы"
                    });
            }

            if (
                player.balance <
                catalog.price
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
                        error:
                            "Недостаточно HC"
                    });
            }

            player.balance -=
                catalog.price;

            const business = {
                id:
                    crypto.randomUUID(),

                catalogId:
                    catalog.id,

                name:
                    catalog.name,

                category:
                    catalog.category,

                purchasePrice:
                    catalog.price,

                incomePerHour:
                    catalog.incomePerHour,

                storedIncome:
                    0,

                purchasedAt:
                    Date.now(),

                lastIncomeUpdate:
                    Date.now()
            };

            player.businesses.push(
                business
            );

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                business,

                player:
                    publicPlayer(
                        player
                    )
            });
        } catch (
            error
        ) {
            console.error(
                "BUY BUSINESS ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка покупки бизнеса"
            });
        }
    }
);

/*
=========================================================
COLLECT BUSINESS
=========================================================
*/

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

            const business =
                player.businesses.find(
                    item =>
                        item.id ===
                        req.body?.businessId
                );

            if (!business) {
                return res
                    .status(404)
                    .json({
                        success:
                            false,
                        error:
                            "Бизнес не найден"
                    });
            }

            updateBusinessIncome(
                business
            );

            const amount =
                Number(
                    business.storedIncome ||
                    0
                );

            if (
                amount <= 0
            ) {
                return res
                    .status(400)
                    .json({
                        success:
                            false,
                        error:
                            "Доход ещё не накоплен",
                        amount:
                            0
                    });
            }

            player.balance +=
                amount;

            business.storedIncome =
                0;

            business.lastIncomeUpdate =
                Date.now();

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                collected:
                    amount,

                balance:
                    player.balance,

                business
            });
        } catch (
            error
        ) {
            console.error(
                "COLLECT ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка сбора дохода"
            });
        }
    }
);

/*
=========================================================
COLLECT ALL BUSINESSES
=========================================================
*/

app.post(
    "/api/businesses/collect-all",
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

            let total =
                0;

            for (
                const business
                of player.businesses
            ) {
                updateBusinessIncome(
                    business
                );

                total +=
                    Number(
                        business.storedIncome ||
                        0
                    );

                business.storedIncome =
                    0;

                business.lastIncomeUpdate =
                    Date.now();
            }

            player.balance +=
                total;

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({
                success:
                    true,

                collected:
                    total,

                balance:
                    player.balance,

                businesses:
                    player.businesses
            });
        } catch (
            error
        ) {
            console.error(
                "COLLECT ALL ERROR:",
                error
            );

            res.status(
                500
            ).json({
                success:
                    false,
                error:
                    "Ошибка сбора дохода"
            });
        }
    }
);

/*
=========================================================
36 CARD DURAK
=========================================================
*/

const SUITS = [
    "♠",
    "♥",
    "♦",
    "♣"
];

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
        name: "В",
        value: 11
    },
    {
        name: "Д",
        value: 12
    },
    {
        name: "К",
        value: 13
    }
];

function shuffle(
    array
) {
    for (
        let i =
            array.length - 1;
        i > 0;
        i--
    ) {
        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );

        [
            array[i],
            array[j]
        ] = [
            array[j],
            array[i]
        ];
    }

    return array;
}

function createDeck() {
    const deck = [];

    let id = 0;

    for (
        const suit
        of SUITS
    ) {
        for (
            const rank
            of RANKS
        ) {
            deck.push({
                id:
                    `card_${id++}`,

                suit,

                rank:
                    rank.name,

                value:
                    rank.value
            });
        }
    }

    return shuffle(
        deck
    );
}

/*
=========================================================
ROOMS
=========================================================
*/

const rooms =
    new Map();

function generateRoomCode() {
    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = "";

        for (
            let i = 0;
            i <
            ROOM_CODE_LENGTH;
            i++
        ) {
            code +=
                chars[
                    Math.floor(
                        Math.random() *
                        chars.length
                    )
                ];
        }
    } while (
        rooms.has(code)
    );

    return code;
}

function createRoom(
    playerId,
    socket
) {
    const room = {
        code:
            generateRoomCode(),

        status:
            "waiting",

        phase:
            "waiting",

        players: [
            {
                id:
                    playerId,

                socketId:
                    socket.id,

                ready:
                    false,

                disconnected:
                    false,

                disconnectedAt:
                    null
            }
        ],

        deck:
            [],

        trumpSuit:
            null,

        hands:
            {},

        table:
            [],

        attacker:
            null,

        defender:
            null,

        /*
         * Лимит текущего захода.
         * Он фиксируется в начале
         * каждого захода.
         */
        roundLimit:
            MAX_HAND,

        finished:
            false,

        winner:
            null,

        createdAt:
            Date.now(),

        lastActivity:
            Date.now()
    };

    rooms.set(
        room.code,
        room
    );

    return room;
}

function findRoomByPlayer(
    playerId
) {
    for (
        const room
        of rooms.values()
    ) {
        if (
            room.players.some(
                player =>
                    player.id ===
                    playerId
            )
        ) {
            return room;
        }
    }

    return null;
}

function touchRoom(
    room
) {
    if (room) {
        room.lastActivity =
            Date.now();
    }
}

/*
=========================================================
ROOM PUBLIC
=========================================================
*/

function publicRoom(
    room
) {
    return {
        code:
            room.code,

        status:
            room.status,

        phase:
            room.phase,

        playerCount:
            room.players.length,

        maxPlayers:
            2,

        players:
            room.players.map(
                player => {
                    const p =
                        getPlayerById(
                            player.id
                        );

                    return {
                        id:
                            player.id,

                        first_name:
                            p?.first_name ||
                            "Игрок",

                        last_name:
                            p?.last_name ||
                            "",

                        username:
                            p?.username ||
                            "",

                        ready:
                            player.ready,

                        disconnected:
                            player.disconnected
                    };
                }
            )
    };
}

function publicRoomGame(
    room,
    playerId
) {
    const ownHand =
        room.hands[
            playerId
        ] || [];

    const opponent =
        room.players.find(
            player =>
                player.id !==
                playerId
        );

    const opponentHand =
        opponent
            ? (
                room.hands[
                    opponent.id
                ] || []
            )
            : [];

    return {
        roomCode:
            room.code,

        status:
            room.status,

        phase:
            room.phase,

        attacker:
            room.attacker,

        defender:
            room.defender,

        trumpSuit:
            room.trumpSuit,

        deckCount:
            room.deck.length,

        playerHand:
            ownHand,

        opponentCount:
            opponentHand.length,

        table:
            room.table,

        roundLimit:
            room.roundLimit,

        winner:
            room.winner,

        canAttack:
            room.phase ===
                "attack" &&
            room.attacker ===
                playerId,

        canDefend:
            room.phase ===
                "defense" &&
            room.defender ===
                playerId,

        canContinueAttack:
            room.phase ===
                "attack_continue" &&
            room.attacker ===
                playerId,

        canTake:
            room.phase ===
                "defense" &&
            room.defender ===
                playerId
    };
}

function sendRoomState(
    room
) {
    if (!room) {
        return;
    }

    touchRoom(
        room
    );

    for (
        const player
        of room.players
    ) {
        const socket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!socket) {
            continue;
        }

        socket.emit(
            "room_state",
            publicRoom(
                room
            )
        );

        socket.emit(
            "game_state",
            publicRoomGame(
                room,
                player.id
            )
        );
    }
}

/*
=========================================================
GAME HELPERS
=========================================================
*/

function isTrump(
    room,
    card
) {
    return (
        card &&
        card.suit ===
            room.trumpSuit
    );
}

function canBeat(
    room,
    attack,
    defense
) {
    if (
        !attack ||
        !defense
    ) {
        return false;
    }

    const attackTrump =
        isTrump(
            room,
            attack
        );

    const defenseTrump =
        isTrump(
            room,
            defense
        );

    if (
        defenseTrump &&
        !attackTrump
    ) {
        return true;
    }

    if (
        attackTrump &&
        !defenseTrump
    ) {
        return false;
    }

    return (
        attack.suit ===
            defense.suit &&
        defense.value >
            attack.value
    );
}

function tableRanks(
    room
) {
    const ranks = [];

    for (
        const pair
        of room.table
    ) {
        if (
            pair.attack
        ) {
            ranks.push(
                pair.attack.rank
            );
        }

        if (
            pair.defense
        ) {
            ranks.push(
                pair.defense.rank
            );
        }
    }

    return ranks;
}

function canAddCard(
    room,
    card
) {
    if (!card) {
        return false;
    }

    /*
     * Лимит текущего захода
     * зафиксирован в roundLimit.
     */
    if (
        room.table.length >=
        room.roundLimit
    ) {
        return false;
    }

    /*
     * Первая карта захода.
     */
    if (
        room.table.length ===
        0
    ) {
        return true;
    }

    /*
     * Подкидывать можно
     * только по существующим
     * номиналам на столе.
     */
    return tableRanks(
        room
    ).includes(
        card.rank
    );
}

function allBeaten(
    room
) {
    if (
        room.table.length ===
        0
    ) {
        return false;
    }

    return room.table.every(
        pair =>
            !!pair.defense
    );
}

function firstUnbeaten(
    room
) {
    return room.table.findIndex(
        pair =>
            !pair.defense
    );
}

/*
=========================================================
BEGIN ROUND
=========================================================
*/

function beginAttackRound(
    room
) {
    room.table = [];

    const defender =
        room.players.find(
            player =>
                player.id !==
                room.attacker
        );

    room.defender =
        defender
            ? defender.id
            : null;

    const defenderHand =
        room.defender
            ? (
                room.hands[
                    room.defender
                ] || []
            )
            : [];

    /*
     * Максимум карт в заходе:
     * не больше 6 и не больше
     * количества карт защитника
     * в момент начала захода.
     */
    room.roundLimit =
        Math.min(
            MAX_HAND,
            defenderHand.length
        );

    room.phase =
        "attack";

    touchRoom(
        room
    );
}

/*
=========================================================
FIRST ATTACKER
=========================================================
*/

function determineFirstAttacker(
    room
) {
    const p1 =
        room.players[0];

    const p2 =
        room.players[1];

    const h1 =
        room.hands[
            p1.id
        ] || [];

    const h2 =
        room.hands[
            p2.id
        ] || [];

    const trumps1 =
        h1
            .filter(
                card =>
                    isTrump(
                        room,
                        card
                    )
            )
            .sort(
                (a, b) =>
                    a.value -
                    b.value
            );

    const trumps2 =
        h2
            .filter(
                card =>
                    isTrump(
                        room,
                        card
                    )
            )
            .sort(
                (a, b) =>
                    a.value -
                    b.value
            );

    if (
        trumps1.length &&
        trumps2.length
    ) {
        return (
            trumps1[0].value <=
            trumps2[0].value
        )
            ? p1.id
            : p2.id;
    }

    if (
        trumps1.length
    ) {
        return p1.id;
    }

    if (
        trumps2.length
    ) {
        return p2.id;
    }

    const min1 =
        h1.length
            ? Math.min(
                ...h1.map(
                    card =>
                        card.value
                )
            )
            : Infinity;

    const min2 =
        h2.length
            ? Math.min(
                ...h2.map(
                    card =>
                        card.value
                )
            )
            : Infinity;

    return min1 <= min2
        ? p1.id
        : p2.id;
}

/*
=========================================================
START GAME
=========================================================
*/

function startRoomGame(
    room
) {
    if (
        room.players.length !==
        2
    ) {
        return false;
    }

    room.deck =
        createDeck();

    room.hands = {
        [room.players[0].id]:
            [],

        [room.players[1].id]:
            []
    };

    for (
        let i = 0;
        i < MAX_HAND;
        i++
    ) {
        const c1 =
            room.deck.shift();

        const c2 =
            room.deck.shift();

        if (c1) {
            room.hands[
                room.players[0].id
            ].push(c1);
        }

        if (c2) {
            room.hands[
                room.players[1].id
            ].push(c2);
        }
    }

    /*
     * Последняя карта колоды
     * определяет козырь.
     * Она остаётся в колоде.
     */
    const trumpCard =
        room.deck[
            room.deck.length - 1
        ];

    room.trumpSuit =
        trumpCard
            ? trumpCard.suit
            : SUITS[0];

    room.attacker =
        determineFirstAttacker(
            room
        );

    room.defender =
        null;

    room.table =
        [];

    room.roundLimit =
        MAX_HAND;

    room.status =
        "playing";

    room.phase =
        "attack";

    room.finished =
        false;

    room.winner =
        null;

    beginAttackRound(
        room
    );

    touchRoom(
        room
    );

    return true;
}

/*
=========================================================
REFILL HANDS
=========================================================
*/

function refillHands(
    room
) {
    /*
     * Классический порядок
     * добора:
     *
     * 1. атакующий
     * 2. защитник
     *
     * В нашем формате 2 игрока.
     */
    const order = [
        room.attacker,
        room.defender
    ];

    for (
        const playerId
        of order
    ) {
        if (!playerId) {
            continue;
        }

        const hand =
            room.hands[
                playerId
            ];

        if (
            !Array.isArray(
                hand
            )
        ) {
            continue;
        }

        while (
            hand.length <
                MAX_HAND &&
            room.deck.length >
                0
        ) {
            hand.push(
                room.deck.shift()
            );
        }
    }
}

/*
=========================================================
FINISH ROOM
=========================================================
*/

function finishRoom(
    room,
    winnerId,
    reason = "normal"
) {
    if (
        !room ||
        room.finished
    ) {
        return;
    }

    room.finished =
        true;

    room.status =
        "finished";

    room.phase =
        "finished";

    room.winner =
        winnerId || null;

    if (
        winnerId
    ) {
        const winner =
            getPlayerById(
                winnerId
            );

        const loserEntry =
            room.players.find(
                player =>
                    player.id !==
                    winnerId
            );

        const loser =
            loserEntry
                ? getPlayerById(
                    loserEntry.id
                )
                : null;

        if (winner) {
            winner.wins =
                Number(
                    winner.wins ||
                    0
                ) + 1;

            winner.games =
                Number(
                    winner.games ||
                    0
                ) + 1;

            winner.balance =
                Number(
                    winner.balance ||
                    0
                ) + 500;

            addXP(
                winner,
                50
            );
        }

        if (loser) {
            loser.losses =
                Number(
                    loser.losses ||
                    0
                ) + 1;

            loser.games =
                Number(
                    loser.games ||
                    0
                ) + 1;

            addXP(
                loser,
                15
            );
        }
    } else {
        /*
         * Только настоящая ничья.
         */
        for (
            const player
            of room.players
        ) {
            const p =
                getPlayerById(
                    player.id
                );

            if (!p) {
                continue;
            }

            p.games =
                Number(
                    p.games ||
                    0
                ) + 1;

            addXP(
                p,
                20
            );
        }
    }

    savePlayers();

    for (
        const player
        of room.players
    ) {
        const socket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!socket) {
            continue;
        }

        socket.emit(
            "game_finished",
            {
                winner:
                    winnerId ||
                    null,

                reason,

                message:
                    winnerId ===
                    player.id
                        ? "Ты победил!"
                        : winnerId
                            ? "Ты проиграл"
                            : "Ничья",

                player:
                    publicPlayer(
                        getPlayerById(
                            player.id
                        )
                    )
            }
        );
    }

    sendRoomState(
        room
    );
}

/*
=========================================================
GAME OVER CHECK
=========================================================
*/

function checkGameOver(
    room
) {
    if (
        room.finished
    ) {
        return true;
    }

    /*
     * Пока колода не пуста,
     * окончательная победа
     * не фиксируется.
     */
    if (
        room.deck.length >
        0
    ) {
        return false;
    }

    if (
        room.players.length !==
        2
    ) {
        return false;
    }

    const p1 =
        room.players[0];

    const p2 =
        room.players[1];

    if (
        !p1 ||
        !p2
    ) {
        return false;
    }

    const h1 =
        room.hands[
            p1.id
        ] || [];

    const h2 =
        room.hands[
            p2.id
        ] || [];

    /*
     * Оба без карт.
     */
    if (
        h1.length === 0 &&
        h2.length === 0
    ) {
        finishRoom(
            room,
            null,
            "draw"
        );

        return true;
    }

    /*
     * Первый без карт.
     */
    if (
        h1.length === 0
    ) {
        finishRoom(
            room,
            p1.id,
            "normal"
        );

        return true;
    }

    /*
     * Второй без карт.
     */
    if (
        h2.length === 0
    ) {
        finishRoom(
            room,
            p2.id,
            "normal"
        );

        return true;
    }

    return false;
}

/*
=========================================================
ATTACK
=========================================================
*/

function playerAttack(
    room,
    playerId,
    cardId
) {
    if (
        room.status !==
        "playing"
    ) {
        return;
    }

    if (
        room.phase !==
            "attack" &&
        room.phase !==
            "attack_continue"
    ) {
        return;
    }

    if (
        room.attacker !==
        playerId
    ) {
        return;
    }

    const hand =
        room.hands[
            playerId
        ];

    if (
        !Array.isArray(
            hand
        )
    ) {
        return;
    }

    const index =
        hand.findIndex(
            card =>
                card.id ===
                cardId
        );

    if (
        index ===
        -1
    ) {
        emitActionError(
            room,
            playerId,
            "Карта не найдена"
        );

        return;
    }

    const card =
        hand[index];

    if (
        !canAddCard(
            room,
            card
        )
    ) {
        emitActionError(
            room,
            playerId,
            "Эту карту нельзя подкинуть"
        );

        return;
    }

    /*
     * Защищающийся не может
     * получить больше карт,
     * чем позволяет roundLimit.
     */
    if (
        room.table.length >=
        room.roundLimit
    ) {
        emitActionError(
            room,
            playerId,
            "Больше карт подкинуть нельзя"
        );

        return;
    }

    hand.splice(
        index,
        1
    );

    room.table.push({
        attack:
            card,

        defense:
            null
    });

    room.phase =
        "defense";

    touchRoom(
        room
    );

    sendRoomState(
        room
    );
}

/*
=========================================================
DEFENSE
=========================================================
*/

function playerDefense(
    room,
    playerId,
    cardId
) {
    if (
        room.status !==
        "playing"
    ) {
        return;
    }

    if (
        room.phase !==
        "defense"
    ) {
        return;
    }

    if (
        room.defender !==
        playerId
    ) {
        return;
    }

    const index =
        firstUnbeaten(
            room
        );

    if (
        index ===
        -1
    ) {
        return;
    }

    const hand =
        room.hands[
            playerId
        ];

    if (
        !Array.isArray(
            hand
        )
    ) {
        return;
    }

    const cardIndex =
        hand.findIndex(
            card =>
                card.id ===
                cardId
        );

    if (
        cardIndex ===
        -1
    ) {
        emitActionError(
            room,
            playerId,
            "Карта не найдена"
        );

        return;
    }

    const defense =
        hand[
            cardIndex
        ];

    const attack =
        room.table[
            index
        ].attack;

    if (
        !canBeat(
            room,
            attack,
            defense
        )
    ) {
        emitActionError(
            room,
            playerId,
            "Этой картой побить нельзя"
        );

        return;
    }

    hand.splice(
        cardIndex,
        1
    );

    room.table[
        index
    ].defense =
        defense;

    /*
     * Если все карты отбиты,
     * атакующий получает право
     * подкинуть ещё или завершить
     * заход.
     */
    if (
        allBeaten(
            room
        )
    ) {
        room.phase =
            "attack_continue";
    }

    touchRoom(
        room
    );

    sendRoomState(
        room
    );
}

/*
=========================================================
FINISH ATTACK ROUND
=========================================================
*/

function finishAttackRound(
    room,
    playerId
) {
    if (
        room.status !==
        "playing"
    ) {
        return;
    }

    if (
        room.phase !==
        "attack_continue"
    ) {
        return;
    }

    if (
        room.attacker !==
        playerId
    ) {
        return;
    }

    if (
        !allBeaten(
            room
        )
    ) {
        emitActionError(
            room,
            playerId,
            "Не все карты отбиты"
        );

        return;
    }

    const oldAttacker =
        room.attacker;

    const oldDefender =
        room.defender;

    /*
     * Завершённый заход.
     */
    room.table =
        [];

    /*
     * Сначала проверяем
     * возможную победу после
     * сыгранных карт.
     *
     * Но только если колода
     * уже пуста.
     */
    if (
        room.deck.length ===
        0
    ) {
        const attackerHand =
            room.hands[
                oldAttacker
            ] || [];

        if (
            attackerHand.length ===
            0
        ) {
            finishRoom(
                room,
                oldAttacker,
                "normal"
            );

            return;
        }
    }

    /*
     * Новый атакующий —
     * бывший защитник.
     */
    room.attacker =
        oldDefender;

    room.defender =
        oldAttacker;

    /*
     * Добор происходит
     * по старому порядку:
     * сначала старый атакующий,
     * затем старый защитник.
     */
    room.attacker =
        oldAttacker;

    room.defender =
        oldDefender;

    refillHands(
        room
    );

    /*
     * Теперь меняем роли.
     */
    room.attacker =
        oldDefender;

    room.defender =
        oldAttacker;

    /*
     * Если после добора
     * кто-то закончил игру.
     */
    if (
        checkGameOver(
            room
        )
    ) {
        return;
    }

    beginAttackRound(
        room
    );

    touchRoom(
        room
    );

    sendRoomState(
        room
    );
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
    if (
        room.status !==
        "playing"
    ) {
        return;
    }

    if (
        room.phase !==
        "defense"
    ) {
        return;
    }

    if (
        room.defender !==
        playerId
    ) {
        return;
    }

    const hand =
        room.hands[
            playerId
        ];

    if (
        !Array.isArray(
            hand
        )
    ) {
        return;
    }

    /*
     * Защитник забирает
     * все карты стола.
     */
    for (
        const pair
        of room.table
    ) {
        if (
            pair.attack
        ) {
            hand.push(
                pair.attack
            );
        }

        if (
            pair.defense
        ) {
            hand.push(
                pair.defense
            );
        }
    }

    room.table =
        [];

    /*
     * Атакующий сохраняет
     * право атаки.
     */
    const attackerId =
        room.attacker;

    const defenderId =
        room.defender;

    /*
     * Добор:
     * сначала атакующий,
     * затем защитник.
     */
    room.attacker =
        attackerId;

    room.defender =
        defenderId;

    refillHands(
        room
    );

    /*
     * Если колода пуста,
     * после взятия проверяем
     * окончание партии.
     */
    if (
        checkGameOver(
            room
        )
    ) {
        return;
    }

    /*
     * Роли НЕ меняются.
     */
    room.attacker =
        attackerId;

    room.defender =
        defenderId;

    beginAttackRound(
        room
    );

    touchRoom(
        room
    );

    sendRoomState(
        room
    );
}

/*
=========================================================
ERROR
=========================================================
*/

function emitActionError(
    room,
    playerId,
    message
) {
    const player =
        room.players.find(
            item =>
                item.id ===
                playerId
        );

    if (!player) {
        return;
    }

    const socket =
        io.sockets.sockets.get(
            player.socketId
        );

    if (!socket) {
        return;
    }

    socket.emit(
        "action_error",
        {
            message
        }
    );
}

/*
=========================================================
RESET WAITING ROOM
=========================================================
*/

function resetRoomToWaiting(
    room
) {
    room.status =
        "waiting";

    room.phase =
        "waiting";

    room.finished =
        false;

    room.winner =
        null;

    room.deck =
        [];

    room.table =
        [];

    room.hands =
        {};

    room.attacker =
        null;

    room.defender =
        null;

    room.trumpSuit =
        null;

    room.roundLimit =
        MAX_HAND;

    for (
        const player
        of room.players
    ) {
        player.ready =
            false;

        player.disconnected =
            false;

        player.disconnectedAt =
            null;
    }

    touchRoom(
        room
    );
}

/*
=========================================================
ROOM PLAYER REMOVE
=========================================================
*/

function removePlayerFromRoom(
    room,
    playerId
) {
    room.players =
        room.players.filter(
            player =>
                player.id !==
                playerId
        );

    if (
        room.hands &&
        room.hands[
            playerId
        ]
    ) {
        delete room.hands[
            playerId
        ];
    }

    touchRoom(
        room
    );
}

/*
=========================================================
ROOM RECONNECT
=========================================================
*/

function reconnectPlayer(
    room,
    playerId,
    socket
) {
    const player =
        room.players.find(
            item =>
                item.id ===
                playerId
        );

    if (!player) {
        return false;
    }

    /*
     * Если старый socket всё ещё
     * существует — он больше
     * не считается активным.
     */
    player.socketId =
        socket.id;

    player.disconnected =
        false;

    player.disconnectedAt =
        null;

    touchRoom(
        room
    );

    return true;
}

/*
=========================================================
SOCKET AUTH HELPER
=========================================================
*/

function authenticateSocket(
    socket,
    initData
) {
    const user =
        validateTelegramInitData(
            initData
        );

    if (!user) {
        return null;
    }

    const player =
        createPlayer(
            user
        );

    socket.playerId =
        String(
            player.telegram_id
        );

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
            "SOCKET CONNECT:",
            socket.id
        );

        /*
        ================================================
        AUTH
        ================================================
        */

        socket.on(
            "authenticate",
            data => {
                try {
                    const player =
                        authenticateSocket(
                            socket,
                            data?.initData
                        );

                    if (!player) {
                        socket.emit(
                            "server_error",
                            {
                                message:
                                    "Ошибка Telegram авторизации"
                            }
                        );

                        return;
                    }

                    const existingRoom =
                        findRoomByPlayer(
                            socket.playerId
                        );

                    if (
                        existingRoom
                    ) {
                        reconnectPlayer(
                            existingRoom,
                            socket.playerId,
                            socket
                        );

                        socket.emit(
                            "room_reconnected",
                            {
                                room:
                                    publicRoom(
                                        existingRoom
                                    )
                            }
                        );

                        sendRoomState(
                            existingRoom
                        );
                    }

                    socket.emit(
                        "authenticated",
                        {
                            player:
                                publicPlayer(
                                    player
                                )
                        }
                    );
                } catch (
                    error
                ) {
                    console.error(
                        "SOCKET AUTH ERROR:",
                        error
                    );

                    socket.emit(
                        "server_error",
                        {
                            message:
                                "Ошибка авторизации"
                        }
                    );
                }
            }
        );

        /*
        ================================================
        CREATE ROOM
        ================================================
        */

        socket.on(
            "create_room",
            () => {
                if (
                    !socket.playerId
                ) {
                    socket.emit(
                        "server_error",
                        {
                            message:
                                "Сначала авторизуйтесь"
                        }
                    );

                    return;
                }

                const existing =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (existing) {
                    reconnectPlayer(
                        existing,
                        socket.playerId,
                        socket
                    );

                    socket.emit(
                        "room_created",
                        {
                            room:
                                publicRoom(
                                    existing
                                )
                        }
                    );

                    sendRoomState(
                        existing
                    );

                    return;
                }

                const room =
                    createRoom(
                        socket.playerId,
                        socket
                    );

                socket.emit(
                    "room_created",
                    {
                        room:
                            publicRoom(
                                room
                            )
                    }
                );

                sendRoomState(
                    room
                );
            }
        );

        /*
        ================================================
        JOIN ROOM
        ================================================
        */

        socket.on(
            "join_room",
            data => {
                if (
                    !socket.playerId
                ) {
                    socket.emit(
                        "server_error",
                        {
                            message:
                                "Сначала авторизуйтесь"
                        }
                    );

                    return;
                }

                const code =
                    String(
                        data?.roomCode ||
                        ""
                    )
                        .trim()
                        .toUpperCase();

                const room =
                    rooms.get(
                        code
                    );

                if (!room) {
                    socket.emit(
                        "action_error",
                        {
                            message:
                                "Комната не найдена"
                        }
                    );

                    return;
                }

                /*
                 * Повторный вход
                 * в ту же комнату.
                 */
                if (
                    room.players.some(
                        player =>
                            player.id ===
                            socket.playerId
                    )
                ) {
                    reconnectPlayer(
                        room,
                        socket.playerId,
                        socket
                    );

                    socket.emit(
                        "room_joined",
                        {
                            room:
                                publicRoom(
                                    room
                                )
                        }
                    );

                    sendRoomState(
                        room
                    );

                    return;
                }

                if (
                    room.players.length >=
                    2
                ) {
                    socket.emit(
                        "action_error",
                        {
                            message:
                                "Комната заполнена"
                        }
                    );

                    return;
                }

                if (
                    room.status !==
                    "waiting"
                ) {
                    socket.emit(
                        "action_error",
                        {
                            message:
                                "Игра уже началась"
                        }
                    );

                    return;
                }

                room.players.push({
                    id:
                        socket.playerId,

                    socketId:
                        socket.id,

                    ready:
                        false,

                    disconnected:
                        false,

                    disconnectedAt:
                        null
                });

                touchRoom(
                    room
                );

                socket.emit(
                    "room_joined",
                    {
                        room:
                            publicRoom(
                                room
                            )
                    }
                );

                /*
                 * Текущая версия проекта
                 * запускает игру автоматически
                 * после входа второго игрока.
                 */
                room.players.forEach(
                    player => {
                        player.ready =
                            true;
                    }
                );

                startRoomGame(
                    room
                );

                sendRoomState(
                    room
                );
            }
        );

        /*
        ================================================
        READY
        ================================================
        */

        socket.on(
            "ready_room",
            () => {
                if (
                    !socket.playerId
                ) {
                    return;
                }

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room) {
                    return;
                }

                const player =
                    room.players.find(
                        item =>
                            item.id ===
                            socket.playerId
                    );

                if (!player) {
                    return;
                }

                player.ready =
                    true;

                touchRoom(
                    room
                );

                if (
                    room.players.length ===
                        2 &&
                    room.players.every(
                        item =>
                            item.ready
                    ) &&
                    room.status ===
                        "waiting"
                ) {
                    startRoomGame(
                        room
                    );
                }

                sendRoomState(
                    room
                );
            }
        );

        /*
        ================================================
        PLAY CARD
        ================================================
        */

        socket.on(
            "play_card",
            data => {
                if (
                    !socket.playerId
                ) {
                    return;
                }

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room) {
                    return;
                }

                if (
                    room.phase ===
                        "attack" ||
                    room.phase ===
                        "attack_continue"
                ) {
                    playerAttack(
                        room,
                        socket.playerId,
                        data?.cardId
                    );

                    return;
                }

                if (
                    room.phase ===
                    "defense"
                ) {
                    playerDefense(
                        room,
                        socket.playerId,
                        data?.cardId
                    );
                }
            }
        );

        /*
        ================================================
        FINISH ROUND
        ================================================
        */

        socket.on(
            "finish_round",
            () => {
                if (
                    !socket.playerId
                ) {
                    return;
                }

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room) {
                    return;
                }

                finishAttackRound(
                    room,
                    socket.playerId
                );
            }
        );

        /*
        ================================================
        TAKE CARDS
        ================================================
        */

        socket.on(
            "take_cards",
            () => {
                if (
                    !socket.playerId
                ) {
                    return;
                }

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room) {
                    return;
                }

                takeCards(
                    room,
                    socket.playerId
                );
            }
        );

        /*
        ================================================
        LEAVE ROOM
        ================================================
        */

        socket.on(
            "leave_room",
            () => {
                if (
                    !socket.playerId
                ) {
                    return;
                }

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room) {
                    return;
                }

                /*
                 * Если игрок сознательно
                 * вышел во время игры:
                 *
                 * вышедший проигрывает,
                 * соперник побеждает.
                 */
                if (
                    room.status ===
                    "playing"
                ) {
                    const opponent =
                        room.players.find(
                            player =>
                                player.id !==
                                socket.playerId
                        );

                    if (
                        opponent
                    ) {
                        finishRoom(
                            room,
                            opponent.id,
                            "leave"
                        );
                    }

                    removePlayerFromRoom(
                        room,
                        socket.playerId
                    );

                    socket.emit(
                        "room_left"
                    );

                    if (
                        room.players.length ===
                        0
                    ) {
                        rooms.delete(
                            room.code
                        );
                    } else {
                        /*
                         * Победитель остаётся
                         * в комнате, но старая
                         * партия уже закончена.
                         *
                         * Комната становится
                         * новой waiting-комнатой.
                         */
                        resetRoomToWaiting(
                            room
                        );

                        sendRoomState(
                            room
                        );
                    }

                    return;
                }

                /*
                 * Выход из waiting-комнаты.
                 */
                removePlayerFromRoom(
                    room,
                    socket.playerId
                );

                socket.emit(
                    "room_left"
                );

                if (
                    room.players.length ===
                    0
                ) {
                    rooms.delete(
                        room.code
                    );
                } else {
                    resetRoomToWaiting(
                        room
                    );

                    sendRoomState(
                        room
                    );
                }
            }
        );

        /*
        ================================================
        DISCONNECT
        ================================================
        */

        socket.on(
            "disconnect",
            () => {
                console.log(
                    "SOCKET DISCONNECT:",
                    socket.id
                );

                if (
                    !socket.playerId
                ) {
                    return;
                }

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room) {
                    return;
                }

                const player =
                    room.players.find(
                        item =>
                            item.id ===
                            socket.playerId
                    );

                if (!player) {
                    return;
                }

                /*
                 * Не объявляем поражение
                 * мгновенно.
                 */
                player.disconnected =
                    true;

                player.disconnectedAt =
                    Date.now();

                touchRoom(
                    room
                );

                sendRoomState(
                    room
                );
            }
        );
    }
);

/*
=========================================================
ROOM CLEANUP / RECONNECT TIMEOUT
=========================================================
*/

setInterval(
    () => {
        const now =
            Date.now();

        for (
            const [
                code,
                room
            ]
            of rooms.entries()
        ) {
            /*
             * Игра идёт.
             */
            if (
                room.status ===
                "playing"
            ) {
                const disconnectedPlayer =
                    room.players.find(
                        player =>
                            player.disconnected &&
                            player.disconnectedAt &&
                            now -
                                player.disconnectedAt >=
                                ROOM_RECONNECT_TIMEOUT
                    );

                if (
                    disconnectedPlayer
                ) {
                    const opponent =
                        room.players.find(
                            player =>
                                player.id !==
                                    disconnectedPlayer.id &&
                                !player.disconnected
                        );

                    if (
                        opponent
                    ) {
                        finishRoom(
                            room,
                            opponent.id,
                            "disconnect_timeout"
                        );

                        /*
                         * Удаляем отключившегося
                         * из комнаты после
                         * фиксации поражения.
                         */
                        removePlayerFromRoom(
                            room,
                            disconnectedPlayer.id
                        );

                        if (
                            room.players.length ===
                            0
                        ) {
                            rooms.delete(
                                code
                            );
                        } else {
                            resetRoomToWaiting(
                                room
                            );

                            sendRoomState(
                                room
                            );
                        }
                    }
                }
            }

            /*
             * Полностью пустые комнаты.
             */
            if (
                room.players.length ===
                0
            ) {
                rooms.delete(
                    code
                );

                continue;
            }

            /*
             * Старые waiting-комнаты.
             */
            if (
                now -
                    room.lastActivity >
                ROOM_CLEANUP_TIMEOUT
            ) {
                rooms.delete(
                    code
                );
            }
        }
    },
    5000
);

/*
=========================================================
EXPRESS ERROR HANDLER
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
            "EXPRESS ERROR:",
            err
        );

        if (
            res.headersSent
        ) {
            return next(
                err
            );
        }

        res.status(
            500
        ).json({
            success:
                false,
            error:
                "Internal server error"
        });
    }
);

/*
=========================================================
START
=========================================================
*/

server.listen(
    PORT,
    () => {
        console.log(
            "========================================"
        );

        console.log(
            "       HEAVY LUX CARD SERVER"
        );

        console.log(
            "========================================"
        );

        console.log(
            `PORT: ${PORT}`
        );

        console.log(
            "VERSION: 5.1.0"
        );

        console.log(
            `BOT TOKEN: ${
                BOT_TOKEN
                    ? "configured"
                    : "NOT CONFIGURED"
            }`
        );

        console.log(
            `CARS: ${CARS.length}`
        );

        console.log(
            `EXCLUSIVE CARS: ${EXCLUSIVE_CARS.length}`
        );

        console.log(
            `CAR COLORS: ${CAR_COLORS.length}`
        );

        console.log(
            `REAL ESTATE: ${REAL_ESTATE.length}`
        );

        console.log(
            `BUSINESSES: ${BUSINESSES.length}`
        );

        console.log(
            `BEAUTIFUL PLATES: ${BEAUTIFUL_PLATES.length}`
        );

        console.log(
            "GIBDD: ENABLED"
        );

        console.log(
            "ONLINE PVP: ENABLED"
        );

        console.log(
            "AI: DISABLED"
        );

        console.log(
            "FACTIONS: DISABLED"
        );

        console.log(
            "TUNING ATELIER: ENABLED"
        );

        console.log(
            "ROOM RECONNECT: ENABLED"
        );

        console.log(
            "FULL DURAK ROUND LOGIC: ENABLED"
        );

        console.log(
            "========================================"
        );
    }
);
