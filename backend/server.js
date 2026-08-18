const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

/* =========================================================
   HEAVY LUX CARD
   SERVER.JS — VERSION 3.0
========================================================= */

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

const BOT_TOKEN =
    process.env.BOT_TOKEN || "";


/* =========================================================
   ECONOMY
========================================================= */

const START_MONEY = 5000;

const MAX_LEVEL = 100;

const MAX_HAND = 6;

const MAX_CHAT_MESSAGES = 100;

const MREO_REGISTRATION_PRICE = 25000;

const BUSINESS_MAX_STORAGE_HOURS = 72;

const BUSINESS_MAX_STORAGE_MS =
    BUSINESS_MAX_STORAGE_HOURS *
    60 *
    60 *
    1000;


/* =========================================================
   DATABASE
========================================================= */

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
                JSON.parse(data) || {};

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


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
    cors()
);

app.use(
    express.json()
);


/* =========================================================
   TELEGRAM AUTH
========================================================= */

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
        typeof initData !== "string"
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

    if (
        !crypto.timingSafeEqual(
            Buffer.from(
                calculatedHash
            ),
            Buffer.from(
                hash
            )
        )
    ) {

        return null;

    }

    const authDate =
        Number(
            params.get(
                "auth_date"
            ) || 0
        );

    if (
        !authDate ||
        Date.now() / 1000 -
            authDate >
            86400
    ) {

        return null;

    }

    let user = null;

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


/* =========================================================
   PLAYER
========================================================= */

function createPlayer(user) {

    const id =
        String(
            user.id
        );

    if (!players[id]) {

        players[id] = {

            telegram_id:
                id,

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

    } else {

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

        player.updated_at =
            Date.now();

        savePlayers();

    }

    return players[id];

}


/* =========================================================
   PUBLIC PLAYER
========================================================= */

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


/* =========================================================
   TITLES
========================================================= */

function getTitle(level) {

    if (level >= 100)
        return "Легенда";

    if (level >= 80)
        return "Император";

    if (level >= 60)
        return "Магнат";

    if (level >= 40)
        return "Мастер";

    if (level >= 20)
        return "Ветеран";

    return "Новичок";

}


function addXP(
    player,
    amount
) {

    player.xp += amount;

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

    player.title =
        getTitle(
            player.level
        );

    player.updated_at =
        Date.now();

    savePlayers();

}


/* =========================================================
   HEAVY CARS
========================================================= */

const CARS = [

    {
        id: "bmw_x7",
        brand: "BMW",
        model: "X7",
        name: "BMW X7",
        price: 2500000,
        emoji: "🚙",
        category: "Premium"
    },

    {
        id: "mercedes_s580",
        brand: "Mercedes-Benz",
        model: "S 580",
        name: "Mercedes-Benz S 580",
        price: 3000000,
        emoji: "🚘",
        category: "Premium"
    },

    {
        id: "range_rover_autobiography",
        brand: "Range Rover",
        model: "Autobiography",
        name: "Range Rover Autobiography",
        price: 3500000,
        emoji: "🚙",
        category: "Premium"
    },

    {
        id: "porsche_cayenne_turbo_gt",
        brand: "Porsche",
        model: "Cayenne Turbo GT",
        name: "Porsche Cayenne Turbo GT",
        price: 4000000,
        emoji: "🚙",
        category: "Premium"
    },

    {
        id: "bmw_m5_g90",
        brand: "BMW",
        model: "M5 G90",
        name: "BMW M5 G90",
        price: 5000000,
        emoji: "🏎️",
        category: "VIP"
    },

    {
        id: "mercedes_g63",
        brand: "Mercedes-AMG",
        model: "G 63",
        name: "Mercedes-AMG G 63",
        price: 6000000,
        emoji: "🚙",
        category: "VIP"
    },

    {
        id: "porsche_911_turbo_s",
        brand: "Porsche",
        model: "911 Turbo S",
        name: "Porsche 911 Turbo S",
        price: 7000000,
        emoji: "🏎️",
        category: "VIP"
    },

    {
        id: "mercedes_s63",
        brand: "Mercedes-AMG",
        model: "S 63",
        name: "Mercedes-AMG S 63",
        price: 7500000,
        emoji: "🚘",
        category: "VIP"
    }

];


/* =========================================================
   HEAVY EXCLUSIVE CARS
========================================================= */

const EXCLUSIVE_CARS = [

    {
        id: "bmw_m5_manhart",
        brand: "BMW",
        model: "M5 G90",
        name: "BMW M5 G90 MANHART",
        tuning: "MANHART",
        price: 12000000,
        emoji: "🏎️",
        category: "Exclusive"
    },

    {
        id: "bmw_ac_schnitzer",
        brand: "BMW",
        model: "M Series",
        name: "BMW AC SCHNITZER",
        tuning: "AC SCHNITZER",
        price: 13000000,
        emoji: "🏎️",
        category: "Exclusive"
    },

    {
        id: "bmw_hamann",
        brand: "BMW",
        model: "M Series",
        name: "BMW HAMANN",
        tuning: "HAMANN",
        price: 14000000,
        emoji: "🏎️",
        category: "Exclusive"
    },

    {
        id: "mercedes_g63_brabus",
        brand: "Mercedes-AMG",
        model: "G 63",
        name: "Mercedes-AMG G 63 BRABUS",
        tuning: "BRABUS",
        price: 18000000,
        emoji: "🚙",
        category: "Exclusive"
    },

    {
        id: "porsche_911_mansory",
        brand: "Porsche",
        model: "911",
        name: "Porsche 911 MANSORY",
        tuning: "MANSORY",
        price: 22000000,
        emoji: "🏎️",
        category: "Exclusive"
    },

    {
        id: "lamborghini_urus_mansory",
        brand: "Lamborghini",
        model: "Urus",
        name: "Lamborghini Urus MANSORY",
        tuning: "MANSORY",
        price: 28000000,
        emoji: "🏎️",
        category: "Exclusive"
    },

    {
        id: "rolls_royce_ghost_mansory",
        brand: "Rolls-Royce",
        model: "Ghost",
        name: "Rolls-Royce Ghost MANSORY",
        tuning: "MANSORY",
        price: 32000000,
        emoji: "🚘",
        category: "Ultra Exclusive"
    },

    {
        id: "rolls_royce_cullinan_mansory",
        brand: "Rolls-Royce",
        model: "Cullinan",
        name: "Rolls-Royce Cullinan MANSORY",
        tuning: "MANSORY",
        price: 35000000,
        emoji: "🚙",
        category: "Ultra Exclusive"
    }

];


/* =========================================================
   PLATES
========================================================= */

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


/* =========================================================
   REAL ESTATE
========================================================= */

const REAL_ESTATE = [

    {
        id: "luxury_apartment",
        name: "Luxury Apartment",
        type: "Apartment",
        price: 8000000,
        emoji: "🏢",
        category: "Luxury"
    },

    {
        id: "penthouse",
        name: "Penthouse",
        type: "Penthouse",
        price: 20000000,
        emoji: "🌆",
        category: "VIP"
    },

    {
        id: "luxury_villa",
        name: "Luxury Villa",
        type: "Villa",
        price: 30000000,
        emoji: "🏡",
        category: "VIP"
    },

    {
        id: "mansion",
        name: "Mansion",
        type: "Mansion",
        price: 50000000,
        emoji: "🏰",
        category: "Elite"
    },

    {
        id: "private_estate",
        name: "Private Estate",
        type: "Estate",
        price: 80000000,
        emoji: "🌴",
        category: "Elite"
    },

    {
        id: "heavy_estate",
        name: "Heavy Estate",
        type: "Heavy Estate",
        price: 150000000,
        emoji: "👑",
        category: "Heavy"
    }

];


/* =========================================================
   BUSINESS
========================================================= */

const BUSINESSES = [

    {
        id: "gas_station",
        name: "Заправка",
        emoji: "⛽",
        price: 15000000,
        incomePerHour: 120000,
        category: "Premium",
        maxCount: 100
    },

    {
        id: "restaurant",
        name: "Ресторан",
        emoji: "🍽️",
        price: 25000000,
        incomePerHour: 220000,
        category: "Premium+",
        maxCount: 50
    },

    {
        id: "night_club",
        name: "Ночной клуб",
        emoji: "🌃",
        price: 40000000,
        incomePerHour: 400000,
        category: "VIP+",
        maxCount: 30
    },

    {
        id: "hotel",
        name: "Гостиница",
        emoji: "🏨",
        price: 65000000,
        incomePerHour: 700000,
        category: "VIP",
        maxCount: 20
    },

    {
        id: "factory",
        name: "Завод",
        emoji: "🏭",
        price: 100000000,
        incomePerHour: 1200000,
        category: "Elite",
        maxCount: 10
    }

];


/* =========================================================
   HELPERS
========================================================= */

function getPlayerById(id) {

    if (!id)
        return null;

    return players[
        String(id)
    ] || null;

}


function requirePlayer(
    req,
    res
) {

    const telegramId =
        String(
            req.headers[
                "x-telegram-id"
            ] ||
            req.body?.telegramId ||
            req.query?.telegramId ||
            ""
        );

    if (!telegramId) {

        res.status(401).json({

            success: false,

            error:
                "Telegram ID required"

        });

        return null;

    }

    const player =
        getPlayerById(
            telegramId
        );

    if (!player) {

        res.status(401).json({

            success: false,

            error:
                "Player not found"

        });

        return null;

    }

    return player;

}


function normalizePlate(
    number
) {

    return String(
        number || ""
    )
        .replace(
            /\s/g,
            ""
        )
        .toUpperCase();

}


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
            of (
                player.cars || []
            )
        ) {

            if (
                car.plate ===
                normalized
            ) {

                return true;

            }

        }

        for (
            const plate
            of (
                player.beautifulPlates ||
                []
            )
        ) {

            if (
                plate.number ===
                normalized
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
            )
                .padStart(
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


function getCarFromCatalog(
    carId
) {

    return CARS.find(
        car =>
            car.id ===
            carId
    );

}


function getExclusiveCar(
    carId
) {

    return EXCLUSIVE_CARS.find(
        car =>
            car.id ===
            carId
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
            car.id ===
            carId
    );

}


function getRealEstate(
    estateId
) {

    return REAL_ESTATE.find(
        item =>
            item.id ===
            estateId
    );

}


function getBusiness(
    businessId
) {

    return BUSINESSES.find(
        item =>
            item.id ===
            businessId
    );

}


/* =========================================================
   BASE API
========================================================= */

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
                "3.0.0"

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
                BEAUTIFUL_PLATES.length

        });

    }
);


/* =========================================================
   AUTH
========================================================= */

app.post(
    "/api/auth",
    (req, res) => {

        try {

            const {
                initData
            } =
                req.body || {};

            const user =
                validateTelegramInitData(
                    initData
                );

            if (!user) {

                return res.status(
                    401
                ).json({

                    success: false,

                    error:
                        "Telegram authorization failed"

                });

            }

            const player =
                createPlayer(
                    user
                );

            return res.json({

                success: true,

                player:
                    publicPlayer(
                        player
                    )

            });

        } catch (error) {

            console.error(
                "AUTH ERROR:",
                error
            );

            return res.status(
                500
            ).json({

                success: false,

                error:
                    "Internal server error"

            });

        }

    }
);


/* =========================================================
   PLAYER
========================================================= */

app.get(
    "/api/player",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        res.json({

            success: true,

            player:
                publicPlayer(
                    player
                )

        });

    }
);


/* =========================================================
   CARS
========================================================= */

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
                CARS

        });

    }
);


/* =========================================================
   EXCLUSIVE CARS
========================================================= */

app.get(
    "/api/exclusive-cars",
    (req, res) => {

        res.json({

            success: true,

            category:
                "Heavy Exclusive Cars",

            cars:
                EXCLUSIVE_CARS

        });

    }
);


/* =========================================================
   BUY CAR
========================================================= */

app.post(
    "/api/cars/buy",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const carId =
                req.body?.carId;

            const car =
                getCarFromCatalog(
                    carId
                );

            if (!car) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (
                player.balance <
                car.price
            ) {

                return res.status(
                    400
                ).json({

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

                emoji:
                    car.emoji,

                category:
                    car.category,

                purchasedAt:
                    Date.now(),

                registered:
                    false,

                plate:
                    null,

                beautifulPlate:
                    null

            };

            player.balance -=
                car.price;

            player.cars.push(
                playerCar
            );

            player.updated_at =
                Date.now();

            savePlayers();

            return res.json({

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
                "BUY CAR ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка покупки автомобиля"

            });

        }

    }
);


/* =========================================================
   BUY EXCLUSIVE CAR
========================================================= */

app.post(
    "/api/exclusive-cars/buy",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const carId =
                req.body?.carId;

            const car =
                getExclusiveCar(
                    carId
                );

            if (!car) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Эксклюзивный автомобиль не найден"

                });

            }

            if (
                player.balance <
                car.price
            ) {

                return res.status(
                    400
                ).json({

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

                price:
                    car.price,

                emoji:
                    car.emoji,

                category:
                    car.category,

                purchasedAt:
                    Date.now(),

                registered:
                    false,

                plate:
                    null,

                beautifulPlate:
                    null

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

                success: true,

                message:
                    "Автомобиль Heavy Exclusive Cars приобретён",

                car:
                    playerCar,

                player:
                    publicPlayer(
                        player
                    )

            });

        } catch (error) {

            console.error(
                "BUY EXCLUSIVE CAR ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка покупки эксклюзивного автомобиля"

            });

        }

    }
);


/* =========================================================
   GARAGE
========================================================= */

app.get(
    "/api/garage",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

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


app.get(
    "/api/my-cars",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        res.json({

            success: true,

            cars:
                player.cars || []

        });

    }
);


/* =========================================================
   MREO
========================================================= */

app.get(
    "/api/mreo",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        const cars =
            (
                player.cars || []
            ).map(
                car => ({

                    ...car,

                    registrationAvailable:
                        !car.registered,

                    registrationPrice:
                        MREO_REGISTRATION_PRICE

                })
            );

        res.json({

            success: true,

            registrationPrice:
                MREO_REGISTRATION_PRICE,

            cars

        });

    }
);


/* =========================================================
   REGISTER CAR
========================================================= */

app.post(
    "/api/mreo/register",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const carId =
                req.body?.carId;

            const car =
                findPlayerCar(
                    player,
                    carId
                );

            if (!car) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (
                car.registered
            ) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "Автомобиль уже зарегистрирован"

                });

            }

            if (
                player.balance <
                MREO_REGISTRATION_PRICE
            ) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "Недостаточно HC",

                    required:
                        MREO_REGISTRATION_PRICE

                });

            }

            const plate =
                generatePlate();

            player.balance -=
                MREO_REGISTRATION_PRICE;

            car.registered =
                true;

            car.plate =
                plate;

            car.registrationDate =
                Date.now();

            car.mreo =
                "Heavy Lux";

            car.technicalInspection =
                true;

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({

                success: true,

                message:
                    "Автомобиль зарегистрирован",

                plate,

                car,

                player:
                    publicPlayer(
                        player
                    )

            });

        } catch (error) {

            console.error(
                "MREO ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка регистрации автомобиля"

            });

        }

    }
);


app.post(
    "/api/cars/register",
    (req, res) => {

        req.url =
            "/api/mreo/register";

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        const carId =
            req.body?.carId;

        const car =
            findPlayerCar(
                player,
                carId
            );

        if (!car) {

            return res.status(
                404
            ).json({

                success: false,

                error:
                    "Автомобиль не найден"

            });

        }

        if (
            car.registered
        ) {

            return res.status(
                400
            ).json({

                success: false,

                error:
                    "Автомобиль уже зарегистрирован"

            });

        }

        if (
            player.balance <
            MREO_REGISTRATION_PRICE
        ) {

            return res.status(
                400
            ).json({

                success: false,

                error:
                    "Недостаточно HC"

            });

        }

        const plate =
            generatePlate();

        player.balance -=
            MREO_REGISTRATION_PRICE;

        car.registered =
            true;

        car.plate =
            plate;

        car.registrationDate =
            Date.now();

        car.mreo =
            "Heavy Lux";

        car.technicalInspection =
            true;

        player.updated_at =
            Date.now();

        savePlayers();

        res.json({

            success: true,

            message:
                "Автомобиль зарегистрирован",

            plate,

            car,

            player:
                publicPlayer(
                    player
                )

        });

    }
);


/* =========================================================
   PLATES
========================================================= */

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
    "/api/beautiful-plates",
    (req, res) => {

        res.json({

            success: true,

            plates:
                BEAUTIFUL_PLATES

        });

    }
);


/* =========================================================
   BUY PLATE
========================================================= */

app.post(
    "/api/plates/buy",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const plateId =
                req.body?.plateId;

            const plate =
                BEAUTIFUL_PLATES.find(
                    item =>
                        item.id ===
                        plateId
                );

            if (!plate) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Номер не найден"

                });

            }

            if (
                player.balance <
                plate.price
            ) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "Недостаточно HC"

                });

            }

            for (
                const otherPlayer
                of Object.values(
                    players
                )
            ) {

                for (
                    const owned
                    of (
                        otherPlayer.beautifulPlates ||
                        []
                    )
                ) {

                    if (
                        owned.number ===
                        plate.number
                    ) {

                        return res.status(
                            409
                        ).json({

                            success: false,

                            error:
                                "Этот номер уже занят"

                        });

                    }

                }

            }

            player.balance -=
                plate.price;

            player.beautifulPlates.push({

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

            });

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({

                success: true,

                message:
                    "Красивый номер приобретён",

                plate,

                player:
                    publicPlayer(
                        player
                    )

            });

        } catch (error) {

            console.error(
                "BUY PLATE ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка покупки номера"

            });

        }

    }
);


/* =========================================================
   MY PLATES
========================================================= */

app.get(
    "/api/my-plates",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        res.json({

            success: true,

            plates:
                player.beautifulPlates ||
                []

        });

    }
);


app.get(
    "/api/player/plates",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        res.json({

            success: true,

            plates:
                player.beautifulPlates ||
                []

        });

    }
);


/* =========================================================
   INSTALL PLATE
========================================================= */

app.post(
    "/api/plates/install",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const carId =
                req.body?.carId;

            const plateId =
                req.body?.plateId;

            const car =
                findPlayerCar(
                    player,
                    carId
                );

            if (!car) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (!car.registered) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "Сначала зарегистрируйте автомобиль"

                });

            }

            const ownedPlate =
                (
                    player.beautifulPlates ||
                    []
                ).find(
                    plate =>
                        plate.id ===
                        plateId
                );

            if (!ownedPlate) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Номер вам не принадлежит"

                });

            }

            for (
                const otherCar
                of player.cars
            ) {

                if (
                    otherCar.beautifulPlate ===
                    ownedPlate.number
                ) {

                    otherCar.beautifulPlate =
                        null;

                }

            }

            car.beautifulPlate =
                ownedPlate.number;

            ownedPlate.installedOn =
                car.id;

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({

                success: true,

                message:
                    "Красивый номер установлен",

                car,

                plate:
                    ownedPlate

            });

        } catch (error) {

            console.error(
                "INSTALL PLATE ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка установки номера"

            });

        }

    }
);


/* =========================================================
   REMOVE PLATE
========================================================= */

app.post(
    "/api/plates/remove",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const car =
                findPlayerCar(
                    player,
                    req.body?.carId
                );

            if (!car) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (
                !car.beautifulPlate
            ) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "На автомобиле нет красивого номера"

                });

            }

            const number =
                car.beautifulPlate;

            car.beautifulPlate =
                null;

            const owned =
                (
                    player.beautifulPlates ||
                    []
                ).find(
                    plate =>
                        plate.number ===
                        number
                );

            if (owned) {

                owned.installedOn =
                    null;

            }

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({

                success: true,

                message:
                    "Номер снят",

                car

            });

        } catch (error) {

            console.error(
                "REMOVE PLATE ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка снятия номера"

            });

        }

    }
);


/* =========================================================
   REAL ESTATE API
========================================================= */

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
    "/api/realestate",
    (req, res) => {

        res.json({

            success: true,

            realEstate:
                REAL_ESTATE

        });

    }
);


/* =========================================================
   BUY REAL ESTATE
========================================================= */

app.post(
    "/api/real-estate/buy",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const estate =
                getRealEstate(
                    req.body?.estateId
                );

            if (!estate) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Объект недвижимости не найден"

                });

            }

            if (
                player.balance <
                estate.price
            ) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "Недостаточно HC"

                });

            }

            const owned =
                player.realEstate.find(
                    item =>
                        item.catalogId ===
                        estate.id
                );

            if (owned) {

                return res.status(
                    409
                ).json({

                    success: false,

                    error:
                        "Этот объект уже принадлежит вам"

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

                emoji:
                    estate.emoji,

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

                success: true,

                message:
                    "Недвижимость приобретена",

                property,

                player:
                    publicPlayer(
                        player
                    )

            });

        } catch (error) {

            console.error(
                "BUY REAL ESTATE ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка покупки недвижимости"

            });

        }

    }
);


/* =========================================================
   MY REAL ESTATE
========================================================= */

app.get(
    "/api/my-real-estate",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        res.json({

            success: true,

            realEstate:
                player.realEstate ||
                []

        });

    }
);


/* =========================================================
   BUSINESSES
========================================================= */

app.get(
    "/api/businesses",
    (req, res) => {

        res.json({

            success: true,

            maxStorageHours:
                BUSINESS_MAX_STORAGE_HOURS,

            businesses:
                BUSINESSES

        });

    }
);


/* =========================================================
   BUSINESS INCOME CALCULATION
========================================================= */

function calculateBusinessIncome(
    business
) {

    if (!business)
        return 0;

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

    if (elapsed < 0)
        elapsed = 0;

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
        business.incomePerHour
    );

}


/* =========================================================
   UPDATE BUSINESS INCOME
========================================================= */

function updateBusinessIncome(
    business
) {

    const income =
        calculateBusinessIncome(
            business
        );

    if (income <= 0)
        return;

    business.storedIncome =
        Number(
            business.storedIncome || 0
        ) + income;

    business.lastIncomeUpdate =
        Date.now();

}


/* =========================================================
   BUY BUSINESS
========================================================= */

app.post(
    "/api/businesses/buy",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const catalog =
                getBusiness(
                    req.body?.businessId
                );

            if (!catalog) {

                return res.status(
                    404
                ).json({

                    success: false,

                    error:
                        "Бизнес не найден"

                });

            }

            const currentCount =
                player.businesses.filter(
                    item =>
                        item.catalogId ===
                        catalog.id
                ).length;

            const totalOwned =
                Object.values(
                    players
                ).reduce(
                    (
                        total,
                        otherPlayer
                    ) =>
                        total +
                        (
                            otherPlayer.businesses ||
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

                return res.status(
                    409
                ).json({

                    success: false,

                    error:
                        "Все объекты этого типа уже проданы"

                });

            }

            if (
                player.balance <
                catalog.price
            ) {

                return res.status(
                    400
                ).json({

                    success: false,

                    error:
                        "Недостаточно HC",

                    required:
                        catalog.price,

                    balance:
                        player.balance

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

                emoji:
                    catalog.emoji,

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

                success: true,

                message:
                    `${catalog.name} приобретён`,

                business,

                player:
                    publicPlayer(
                        player
                    )

            });

        } catch (error) {

            console.error(
                "BUY BUSINESS ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка покупки бизнеса"

            });

        }

    }
);


/* =========================================================
   MY BUSINESSES
========================================================= */

app.get(
    "/api/my-businesses",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player)
            return;

        for (
            const business
            of player.businesses
        ) {

            updateBusinessIncome(
                business
            );

        }

        savePlayers();

        res.json({

            success: true,

            maxStorageHours:
                BUSINESS_MAX_STORAGE_HOURS,

            businesses:
                player.businesses

        });

    }
);


/* =========================================================
   COLLECT BUSINESS INCOME
========================================================= */

app.post(
    "/api/businesses/collect",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

            const business =
                player.businesses.find(
                    item =>
                        item.id ===
                        req.body?.businessId
                );

            if (!business) {

                return res.status(
                    404
                ).json({

                    success: false,

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

            if (amount <= 0) {

                return res.status(
                    400
                ).json({

                    success: false,

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

                success: true,

                message:
                    "Доход собран",

                collected:
                    amount,

                business,

                balance:
                    player.balance

            });

        } catch (error) {

            console.error(
                "COLLECT BUSINESS ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка сбора дохода"

            });

        }

    }
);


/* =========================================================
   COLLECT ALL BUSINESS INCOME
========================================================= */

app.post(
    "/api/businesses/collect-all",
    (req, res) => {

        try {

            const player =
                requirePlayer(
                    req,
                    res
                );

            if (!player)
                return;

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

                success: true,

                collected:
                    total,

                balance:
                    player.balance,

                businesses:
                    player.businesses

            });

        } catch (error) {

            console.error(
                "COLLECT ALL ERROR:",
                error
            );

            res.status(
                500
            ).json({

                success: false,

                error:
                    "Ошибка сбора дохода"

            });

        }

    }
);


/* =========================================================
   POKER / DURAK GAME
   36 CARDS
========================================================= */

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


/* =========================================================
   DECK
========================================================= */

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


/* =========================================================
   ROOMS
========================================================= */

const rooms =
    new Map();


const ROOM_CODE_LENGTH =
    6;


function generateRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    do {

        code = "";

        for (
            let i = 0;
            i < ROOM_CODE_LENGTH;
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


/* =========================================================
   CREATE ROOM
========================================================= */

function createRoom(
    playerId,
    socket
) {

    const code =
        generateRoomCode();

    const room = {

        code,

        status:
            "waiting",

        players: [

            {

                id:
                    playerId,

                socketId:
                    socket.id,

                ready:
                    false

            }

        ],

        deck: [],

        trumpSuit:
            null,

        hands: {},

        table: [],

        attacker:
            null,

        defender:
            null,

        phase:
            "waiting",

        roundLimit:
            6,

        finished:
            false

    };

    rooms.set(
        code,
        room
    );

    return room;

}


/* =========================================================
   FIND ROOM BY PLAYER
========================================================= */

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


/* =========================================================
   ROOM PUBLIC STATE
========================================================= */

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

                        username:
                            p?.username ||
                            "",

                        ready:
                            player.ready

                    };

                }
            )

    };

}


/* =========================================================
   GAME STATE
========================================================= */

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

        playerCount:
            ownHand.length,

        opponentCount:
            opponentHand.length,

        table:
            room.table,

        roundLimit:
            room.roundLimit

    };

}


/* =========================================================
   SEND ROOM STATE
========================================================= */

function sendRoomState(
    room
) {

    for (
        const player
        of room.players
    ) {

        const socket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!socket)
            continue;

        socket.emit(
            "room_state",
            publicRoom(
                room
            )
        );

        if (
            room.status ===
            "playing"
        ) {

            socket.emit(
                "game_state",
                publicRoomGame(
                    room,
                    player.id
                )
            );

        }

    }

}


/* =========================================================
   ROOM PLAYER REMOVE
========================================================= */

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

}


/* =========================================================
   ROOM DELETE
========================================================= */

function deleteRoom(
    room
) {

    rooms.delete(
        room.code
    );

}


/* =========================================================
   ROOM JOIN
========================================================= */

function joinRoom(
    room,
    playerId,
    socket
) {

    if (
        room.players.some(
            player =>
                player.id ===
                playerId
        )
    ) {

        const existing =
            room.players.find(
                player =>
                    player.id ===
                    playerId
            );

        existing.socketId =
            socket.id;

        return {

            success:
                true,

            room

        };

    }

    if (
        room.players.length >=
        2
    ) {

        return {

            success:
                false,

            error:
                "Комната заполнена"

        };

    }

    if (
        room.status !==
        "waiting"
    ) {

        return {

            success:
                false,

            error:
                "Игра уже началась"

        };

    }

    room.players.push({

        id:
            playerId,

        socketId:
            socket.id,

        ready:
            false

    });

    return {

        success:
            true,

        room

    };

}


/* =========================================================
   FIRST ATTACKER
========================================================= */

function determineFirstAttacker(
    room
) {

    const first =
        room.players[0];

    const second =
        room.players[1];

    const firstHand =
        room.hands[
            first.id
        ] || [];

    const secondHand =
        room.hands[
            second.id
        ] || [];

    const firstTrumps =
        firstHand
            .filter(
                card =>
                    card.suit ===
                    room.trumpSuit
            )
            .sort(
                (a, b) =>
                    a.value -
                    b.value
            );

    const secondTrumps =
        secondHand
            .filter(
                card =>
                    card.suit ===
                    room.trumpSuit
            )
            .sort(
                (a, b) =>
                    a.value -
                    b.value
            );

    if (
        firstTrumps.length &&
        secondTrumps.length
    ) {

        return (
            firstTrumps[0].value <=
            secondTrumps[0].value
        )
            ? first.id
            : second.id;

    }

    if (
        firstTrumps.length
    ) {

        return first.id;

    }

    if (
        secondTrumps.length
    ) {

        return second.id;

    }

    const firstMin =
        Math.min(
            ...firstHand.map(
                card =>
                    card.value
            )
        );

    const secondMin =
        Math.min(
            ...secondHand.map(
                card =>
                    card.value
            )
        );

    return (
        firstMin <=
        secondMin
    )
        ? first.id
        : second.id;

}


/* =========================================================
   START ROOM GAME
========================================================= */

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

        room.hands[
            room.players[0].id
        ].push(
            room.deck.shift()
        );

        room.hands[
            room.players[1].id
        ].push(
            room.deck.shift()
        );

    }

    const trumpCard =
        room.deck[
            room.deck.length - 1
        ];

    room.trumpSuit =
        trumpCard.suit;

    room.table =
        [];

    room.attacker =
        determineFirstAttacker(
            room
        );

    room.defender =
        room.players.find(
            player =>
                player.id !==
                room.attacker
        ).id;

    room.phase =
        "attack";

    room.roundLimit =
        MAX_HAND;

    room.status =
        "playing";

    room.finished =
        false;

    return true;

}


/* =========================================================
   CARD HELPERS
========================================================= */

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

    if (
        isTrump(
            room,
            defense
        ) &&
        !isTrump(
            room,
            attack
        )
    ) {

        return true;

    }

    if (
        !isTrump(
            room,
            defense
        ) &&
        isTrump(
            room,
            attack
        )
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

    const result = [];

    for (
        const pair
        of room.table
    ) {

        result.push(
            pair.attack.rank
        );

        if (
            pair.defense
        ) {

            result.push(
                pair.defense.rank
            );

        }

    }

    return result;

}


function canAddCard(
    room,
    card
) {

    if (!card)
        return false;

    if (
        room.table.length >=
        room.roundLimit
    ) {

        return false;

    }

    if (
        room.table.length ===
        0
    ) {

        return true;

    }

    return tableRanks(
        room
    ).includes(
        card.rank
    );

}


function firstUnbeaten(
    room
) {

    for (
        let i = 0;
        i <
        room.table.length;
        i++
    ) {

        if (
            !room.table[i].defense
        ) {

            return i;

        }

    }

    return -1;

}


function allBeaten(
    room
) {

    return (
        room.table.length >
            0 &&
        firstUnbeaten(
            room
        ) === -1
    );

}


/* =========================================================
   REFILL HANDS
========================================================= */

function refillHands(
    room
) {

    for (
        const player
        of room.players
    ) {

        const hand =
            room.hands[
                player.id
            ];

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


/* =========================================================
   FINISH ROOM
========================================================= */

function finishRoom(
    room,
    winnerId
) {

    if (
        room.finished
    )
        return;

    room.finished =
        true;

    room.status =
        "finished";

    room.phase =
        "finished";

    const winner =
        getPlayerById(
            winnerId
        );

    const loserPlayer =
        room.players.find(
            player =>
                player.id !==
                winnerId
        );

    const loser =
        loserPlayer
            ? getPlayerById(
                loserPlayer.id
            )
            : null;

    if (winner) {

        winner.wins++;

        winner.games++;

        winner.balance +=
            500;

        addXP(
            winner,
            50
        );

    }

    if (loser) {

        loser.losses++;

        loser.games++;

        addXP(
            loser,
            15
        );

    }

    savePlayers();

    for (
        const roomPlayer
        of room.players
    ) {

        const socket =
            io.sockets.sockets.get(
                roomPlayer.socketId
            );

        if (!socket)
            continue;

        socket.emit(
            "game_finished",
            {

                winner:
                    winnerId,

                message:
                    roomPlayer.id ===
                    winnerId
                        ? "Ты победил!"
                        : "Ты проиграл",

                player:
                    publicPlayer(
                        getPlayerById(
                            roomPlayer.id
                        )
                    )

            }
        );

    }

    sendRoomState(
        room
    );

}


/* =========================================================
   CHECK GAME OVER
========================================================= */

function checkRoomGameOver(
    room
) {

    if (
        room.deck.length >
        0
    ) {

        return false;

    }

    const p1 =
        room.players[0];

    const p2 =
        room.players[1];

    const p1Hand =
        room.hands[
            p1.id
        ];

    const p2Hand =
        room.hands[
            p2.id
        ];

    if (
        p1Hand.length ===
            0 &&
        p2Hand.length ===
            0
    ) {

        finishRoom(
            room,
            null
        );

        return true;

    }

    if (
        p1Hand.length ===
        0
    ) {

        finishRoom(
            room,
            p1.id
        );

        return true;

    }

    if (
        p2Hand.length ===
        0
    ) {

        finishRoom(
            room,
            p2.id
        );

        return true;

    }

    return false;

}


/* =========================================================
   PLAYER ATTACK
========================================================= */

function playerAttack(
    room,
    playerId,
    cardId
) {

    if (
        room.status !==
        "playing"
    )
        return;

    if (
        room.phase !==
        "attack"
    )
        return;

    if (
        room.attacker !==
        playerId
    )
        return;

    const hand =
        room.hands[
            playerId
        ];

    const index =
        hand.findIndex(
            card =>
                card.id ===
                cardId
        );

    if (index === -1)
        return;

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
            "Эту карту нельзя положить"
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

    sendRoomState(
        room
    );

}


/* =========================================================
   PLAYER DEFENSE
========================================================= */

function playerDefense(
    room,
    playerId,
    cardId
) {

    if (
        room.status !==
        "playing"
    )
        return;

    if (
        room.phase !==
        "defense"
    )
        return;

    if (
        room.defender !==
        playerId
    )
        return;

    const attackIndex =
        firstUnbeaten(
            room
        );

    if (
        attackIndex ===
        -1
    )
        return;

    const hand =
        room.hands[
            playerId
        ];

    const index =
        hand.findIndex(
            card =>
                card.id ===
                cardId
        );

    if (index === -1)
        return;

    const defense =
        hand[index];

    const attack =
        room.table[
            attackIndex
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
        index,
        1
    );

    room.table[
        attackIndex
    ].defense =
        defense;

    sendRoomState(
        room
    );

}


/* =========================================================
   FINISH ATTACK ROUND
========================================================= */

function finishAttackRound(
    room,
    playerId
) {

    if (
        room.status !==
        "playing"
    )
        return;

    if (
        room.phase !==
        "defense"
    )
        return;

    if (
        room.defender !==
        playerId
    )
        return;

    if (
        !allBeaten(
            room
        )
    ) {

        emitActionError(
            room,
            playerId,
            "Сначала отбейте все карты"
        );

        return;

    }

    room.table =
        [];

    refillHands(
        room
    );

    if (
        checkRoomGameOver(
            room
        )
    ) {

        return;

    }

    const previousAttacker =
        room.attacker;

    room.attacker =
        room.defender;

    room.defender =
        previousAttacker;

    room.phase =
        "attack";

    room.roundLimit =
        room.hands[
            room.attacker
        ].length;

    sendRoomState(
        room
    );

}


/* =========================================================
   TAKE CARDS
========================================================= */

function takeCards(
    room,
    playerId
) {

    if (
        room.status !==
        "playing"
    )
        return;

    if (
        room.phase !==
        "defense"
    )
        return;

    if (
        room.defender !==
        playerId
    )
        return;

    const hand =
        room.hands[
            playerId
        ];

    for (
        const pair
        of room.table
    ) {

        hand.push(
            pair.attack
        );

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

    refillHands(
        room
    );

    if (
        checkRoomGameOver(
            room
        )
    ) {

        return;

    }

    const previousDefender =
        room.defender;

    room.attacker =
        previousDefender;

    room.defender =
        room.players.find(
            player =>
                player.id !==
                room.attacker
        ).id;

    room.phase =
        "attack";

    room.roundLimit =
        room.hands[
            room.attacker
        ].length;

    sendRoomState(
        room
    );

}


/* =========================================================
   ACTION ERROR
========================================================= */

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

    if (!player)
        return;

    const socket =
        io.sockets.sockets.get(
            player.socketId
        );

    if (!socket)
        return;

    socket.emit(
        "action_error",
        {
            message
        }
    );

}


/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "SOCKET CONNECT:",
            socket.id
        );


        /* =================================================
           AUTHENTICATE
        ================================================= */

        socket.on(
            "authenticate",
            data => {

                try {

                    const initData =
                        data &&
                        data.initData;

                    const user =
                        validateTelegramInitData(
                            initData
                        );

                    if (!user) {

                        socket.emit(
                            "server_error",
                            {

                                message:
                                    "Ошибка Telegram авторизации"

                            }
                        );

                        return;

                    }

                    const player =
                        createPlayer(
                            user
                        );

                    socket.playerId =
                        String(
                            player.telegram_id
                        );

                    socket.emit(
                        "authenticated",
                        {

                            player:
                                publicPlayer(
                                    player
                                )

                        }
                    );

                } catch (error) {

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


        /* =================================================
           CREATE ROOM
        ================================================= */

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

                    socket.emit(
                        "room_created",
                        {

                            room:
                                publicRoom(
                                    existing
                                )

                        }
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


        /* =================================================
           JOIN ROOM
        ================================================= */

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

                if (!code) {

                    socket.emit(
                        "action_error",
                        {

                            message:
                                "Введите код комнаты"

                        }
                    );

                    return;

                }

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

                const result =
                    joinRoom(
                        room,
                        socket.playerId,
                        socket
                    );

                if (
                    !result.success
                ) {

                    socket.emit(
                        "action_error",
                        {

                            message:
                                result.error

                        }
                    );

                    return;

                }

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

                if (
                    room.players.length ===
                    2
                ) {

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

            }
        );


        /* =================================================
           GET ROOM
        ================================================= */

        socket.on(
            "get_room",
            data => {

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

                socket.emit(
                    "room_state",
                    publicRoom(
                        room
                    )
                );

            }
        );


        /* =================================================
           START / READY
        ================================================= */

        socket.on(
            "ready_room",
            () => {

                if (
                    !socket.playerId
                )
                    return;

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room)
                    return;

                const player =
                    room.players.find(
                        item =>
                            item.id ===
                            socket.playerId
                    );

                if (!player)
                    return;

                player.ready =
                    true;

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


        /* =================================================
           PLAY CARD
        ================================================= */

        socket.on(
            "play_card",
            data => {

                if (
                    !socket.playerId
                )
                    return;

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room)
                    return;

                const cardId =
                    data?.cardId;

                if (
                    room.phase ===
                    "attack"
                ) {

                    playerAttack(
                        room,
                        socket.playerId,
                        cardId
                    );

                } else if (
                    room.phase ===
                    "defense"
                ) {

                    playerDefense(
                        room,
                        socket.playerId,
                        cardId
                    );

                }

            }
        );


        /* =================================================
           TAKE CARDS
        ================================================= */

        socket.on(
            "take_cards",
            () => {

                if (
                    !socket.playerId
                )
                    return;

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room)
                    return;

                takeCards(
                    room,
                    socket.playerId
                );

            }
        );


        /* =================================================
           FINISH ROUND
        ================================================= */

        socket.on(
            "finish_round",
            () => {

                if (
                    !socket.playerId
                )
                    return;

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room)
                    return;

                finishAttackRound(
                    room,
                    socket.playerId
                );

            }
        );


        /* =================================================
           LEAVE ROOM
        ================================================= */

        socket.on(
            "leave_room",
            () => {

                if (
                    !socket.playerId
                )
                    return;

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room)
                    return;

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

                    deleteRoom(
                        room
                    );

                } else {

                    room.status =
                        "waiting";

                    room.phase =
                        "waiting";

                    room.finished =
                        false;

                    sendRoomState(
                        room
                    );

                }

            }
        );


        /* =================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "SOCKET DISCONNECT:",
                    socket.id
                );

                if (
                    !socket.playerId
                )
                    return;

                const room =
                    findRoomByPlayer(
                        socket.playerId
                    );

                if (!room)
                    return;

                /*
                 * Если игрок отключился
                 * во время игры, второй игрок
                 * автоматически получает победу.
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
                            opponent.id
                        );

                    }

                }

                removePlayerFromRoom(
                    room,
                    socket.playerId
                );

                if (
                    room.players.length ===
                    0
                ) {

                    deleteRoom(
                        room
                    );

                } else {

                    room.status =
                        "waiting";

                    room.phase =
                        "waiting";

                    room.finished =
                        false;

                    sendRoomState(
                        room
                    );

                }

            }
        );

    }
);


/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "      HEAVY LUX CARD SERVER"
        );

        console.log(
            "========================================"
        );

        console.log(
            `PORT: ${PORT}`
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
            `REAL ESTATE: ${REAL_ESTATE.length}`
        );

        console.log(
            `BUSINESSES: ${BUSINESSES.length}`
        );

        console.log(
            `BEAUTIFUL PLATES: ${BEAUTIFUL_PLATES.length}`
        );

        console.log(
            `BUSINESS STORAGE: ${BUSINESS_MAX_STORAGE_HOURS} HOURS`
        );

        console.log(
            "GAME MODE: PLAYER VS PLAYER"
        );

        console.log(
            "ROOMS: ENABLED"
        );

        console.log(
            "AI: DISABLED"
        );

        console.log(
            "========================================"
        );

    }
);
