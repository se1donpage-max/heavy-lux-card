const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

/* =========================================================
   CONFIG
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

const BOT_TOKEN = process.env.BOT_TOKEN || "";

const START_MONEY = 5000;

const MAX_HAND = 6;

const MAX_CHAT_MESSAGES = 100;

const MREO_REGISTRATION_PRICE = 25000;

const DATA_FILE = path.join(__dirname, "players.json");


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(express.json());


/* =========================================================
   DATABASE
========================================================= */

let players = {};

function loadPlayers() {

    try {

        if (fs.existsSync(DATA_FILE)) {

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
   TELEGRAM AUTH
========================================================= */

function validateTelegramInitData(initData) {

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
        new URLSearchParams(initData);

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
            .update(BOT_TOKEN)
            .digest();

    const calculatedHash =
        crypto
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

    if (
        !crypto.timingSafeEqual(
            Buffer.from(calculatedHash),
            Buffer.from(hash)
        )
    ) {

        return null;

    }

    const authDate =
        Number(
            params.get("auth_date") || 0
        );

    if (
        !authDate ||
        Date.now() / 1000 - authDate > 86400
    ) {

        return null;

    }

    let user = null;

    try {

        user =
            JSON.parse(
                params.get("user") || "{}"
            );

    } catch {

        return null;

    }

    if (!user || !user.id) {

        return null;

    }

    return user;

}


/* =========================================================
   PLAYER
========================================================= */

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

            level: 1,

            xp: 0,

            title:
                "Новичок",

            wins: 0,

            losses: 0,

            games: 0,

            cars: [],

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

        if (!Array.isArray(player.cars)) {

            player.cars = [];

        }

        player.updated_at =
            Date.now();

        savePlayers();

    }

    return players[id];

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
            player.cars || []

    };

}


/* =========================================================
   TITLES
========================================================= */

function getTitle(level) {

    if (level >= 100) return "Легенда";

    if (level >= 80) return "Император";

    if (level >= 60) return "Магнат";

    if (level >= 40) return "Мастер";

    if (level >= 20) return "Ветеран";

    return "Новичок";

}


function addXP(player, amount) {

    player.xp += amount;

    while (
        player.level < 100 &&
        player.xp >= player.level * 100
    ) {

        player.xp -=
            player.level * 100;

        player.level++;

    }

    player.title =
        getTitle(player.level);

    player.updated_at =
        Date.now();

    savePlayers();

}


/* =========================================================
   AUTOMOBILE DATABASE
========================================================= */

const CARS = [

    {
        id: "mercedes_g63",
        brand: "Mercedes-AMG",
        model: "G 63",
        name: "Mercedes-AMG G 63",
        price: 2500000,
        emoji: "🚙",
        category: "SUV"
    },

    {
        id: "bmw_m5",
        brand: "BMW",
        model: "M5",
        name: "BMW M5",
        price: 1800000,
        emoji: "🚘",
        category: "Sport"
    },

    {
        id: "bmw_x7",
        brand: "BMW",
        model: "X7",
        name: "BMW X7",
        price: 2200000,
        emoji: "🚙",
        category: "SUV"
    },

    {
        id: "mercedes_s63",
        brand: "Mercedes-Benz",
        model: "S 63",
        name: "Mercedes-Benz S 63 AMG",
        price: 3200000,
        emoji: "🚘",
        category: "Luxury"
    },

    {
        id: "porsche_911",
        brand: "Porsche",
        model: "911",
        name: "Porsche 911",
        price: 3500000,
        emoji: "🏎️",
        category: "Sport"
    },

    {
        id: "range_rover",
        brand: "Range Rover",
        model: "Autobiography",
        name: "Range Rover Autobiography",
        price: 2800000,
        emoji: "🚙",
        category: "Luxury"
    },

    {
        id: "audi_rs7",
        brand: "Audi",
        model: "RS7",
        name: "Audi RS7",
        price: 2700000,
        emoji: "🏎️",
        category: "Sport"
    },

    {
        id: "lamborghini_urus",
        brand: "Lamborghini",
        model: "Urus",
        name: "Lamborghini Urus",
        price: 5500000,
        emoji: "🏎️",
        category: "Supercar"
    },

    {
        id: "bentley_continental",
        brand: "Bentley",
        model: "Continental GT",
        name: "Bentley Continental GT",
        price: 6000000,
        emoji: "🚘",
        category: "Luxury"
    },

    {
        id: "rolls_royce_cullinan",
        brand: "Rolls-Royce",
        model: "Cullinan",
        name: "Rolls-Royce Cullinan",
        price: 12000000,
        emoji: "🚙",
        category: "Luxury"
    }

];


/* =========================================================
   PLATE DATABASE
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


/* =========================================================
   BEAUTIFUL PLATES
========================================================= */

const BEAUTIFUL_PLATES = [

    {
        id: "a001aa77",
        number: "А001АА77",
        price: 150000,
        rarity: "Редкий"
    },

    {
        id: "a777aa77",
        number: "А777АА77",
        price: 350000,
        rarity: "Очень редкий"
    },

    {
        id: "x777xx77",
        number: "Х777ХХ77",
        price: 500000,
        rarity: "VIP"
    },

    {
        id: "m777mm77",
        number: "М777ММ77",
        price: 500000,
        rarity: "VIP"
    },

    {
        id: "c777cc77",
        number: "С777СС77",
        price: 500000,
        rarity: "VIP"
    },

    {
        id: "a999aa77",
        number: "А999АА77",
        price: 450000,
        rarity: "VIP"
    },

    {
        id: "a555aa77",
        number: "А555АА77",
        price: 300000,
        rarity: "Очень редкий"
    },

    {
        id: "a111aa77",
        number: "А111АА77",
        price: 250000,
        rarity: "Редкий"
    },

    {
        id: "a007aa77",
        number: "А007АА77",
        price: 200000,
        rarity: "Редкий"
    },

    {
        id: "a100aa77",
        number: "А100АА77",
        price: 180000,
        rarity: "Редкий"
    },

    {
        id: "o777oo77",
        number: "О777ОО77",
        price: 550000,
        rarity: "VIP"
    },

    {
        id: "e777ee77",
        number: "Е777ЕЕ77",
        price: 500000,
        rarity: "VIP"
    }

];


/* =========================================================
   HELPERS
========================================================= */

function getPlayerById(id) {

    if (!id) {

        return null;

    }

    return players[String(id)] || null;

}


function requirePlayer(req, res) {

    const telegramId =
        String(
            req.headers["x-telegram-id"] ||
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


function isPlateUsed(number) {

    const normalized =
        String(number)
            .replace(/\s/g, "")
            .toUpperCase();

    for (
        const player of Object.values(players)
    ) {

        if (
            !Array.isArray(player.cars)
        ) {

            continue;

        }

        for (
            const car of player.cars
        ) {

            if (
                car.plate === normalized
            ) {

                return true;

            }

            if (
                car.beautifulPlate ===
                normalized
            ) {

                return true;

            }

        }

    }

    return false;

}


function getCarFromCatalog(carId) {

    return CARS.find(
        car =>
            car.id === carId
    );

}


function findPlayerCar(
    player,
    carId
) {

    if (
        !player ||
        !Array.isArray(player.cars)
    ) {

        return null;

    }

    return player.cars.find(
        car =>
            car.id === carId
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
                "2.0.0"

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
                Object.keys(players).length,

            cars:
                CARS.length,

            beautifulPlates:
                BEAUTIFUL_PLATES.length

        });

    }
);


/* =========================================================
   AUTH API
========================================================= */

app.post(
    "/api/auth",
    (req, res) => {

        try {

            const {
                initData
            } = req.body || {};

            const user =
                validateTelegramInitData(
                    initData
                );

            if (!user) {

                return res.status(401).json({

                    success: false,

                    error:
                        "Telegram authorization failed"

                });

            }

            const player =
                createPlayer(user);

            return res.json({

                success: true,

                player:
                    publicPlayer(player)

            });

        } catch (error) {

            console.error(
                "AUTH ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Internal server error"

            });

        }

    }
);


/* =========================================================
   PLAYER API
========================================================= */

app.get(
    "/api/player",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) return;

        res.json({

            success: true,

            player:
                publicPlayer(player)

        });

    }
);


/* =========================================================
   CAR DEALERSHIP
========================================================= */

/*
    GET /api/cars

    Возвращает весь автосалон.
*/

app.get(
    "/api/cars",
    (req, res) => {

        res.json({

            success: true,

            cars: CARS

        });

    }
);


/*
    GET /api/dealership

    Алиас для автосалона.
*/

app.get(
    "/api/dealership",
    (req, res) => {

        res.json({

            success: true,

            cars: CARS

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

            if (!player) return;

            const carId =
                req.body?.carId;

            const catalogCar =
                getCarFromCatalog(
                    carId
                );

            if (!catalogCar) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (
                !Array.isArray(player.cars)
            ) {

                player.cars = [];

            }

            if (
                player.balance <
                catalogCar.price
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно HC",

                    required:
                        catalogCar.price,

                    balance:
                        player.balance

                });

            }

            const car = {

                id:
                    crypto.randomUUID(),

                modelId:
                    catalogCar.id,

                brand:
                    catalogCar.brand,

                model:
                    catalogCar.model,

                name:
                    catalogCar.name,

                price:
                    catalogCar.price,

                emoji:
                    catalogCar.emoji,

                category:
                    catalogCar.category,

                purchasedAt:
                    Date.now(),

                registered:
                    false,

                registrationPrice:
                    MREO_REGISTRATION_PRICE,

                plate:
                    null,

                beautifulPlate:
                    null

            };

            player.balance -=
                catalogCar.price;

            player.cars.push(car);

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({

                success: true,

                message:
                    "Автомобиль успешно приобретён",

                car,

                player:
                    publicPlayer(player)

            });

        } catch (error) {

            console.error(
                "BUY CAR ERROR:",
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

        if (!player) return;

        res.json({

            success: true,

            cars:
                player.cars || [],

            player:
                publicPlayer(player)

        });

    }
);


/*
    Алиас
*/

app.get(
    "/api/my-cars",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) return;

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

        if (!player) return;

        const cars =
            (player.cars || [])
                .map(car => ({

                    ...car,

                    registrationAvailable:
                        !car.registered,

                    registrationPrice:
                        MREO_REGISTRATION_PRICE

                }));

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

            if (!player) return;

            const carId =
                req.body?.carId;

            const car =
                findPlayerCar(
                    player,
                    carId
                );

            if (!car) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (car.registered) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Автомобиль уже зарегистрирован",

                    car

                });

            }

            if (
                player.balance <
                MREO_REGISTRATION_PRICE
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        `Для регистрации необходимо ${MREO_REGISTRATION_PRICE.toLocaleString("ru-RU")} HC`,

                    balance:
                        player.balance

                });

            }

            const plate =
                generatePlate();

            player.balance -=
                MREO_REGISTRATION_PRICE;

            car.registered =
                true;

            car.registrationPrice =
                MREO_REGISTRATION_PRICE;

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
                    "Т/О зарегистрировано",

                car,

                plate,

                player:
                    publicPlayer(player)

            });

        } catch (error) {

            console.error(
                "MREO REGISTER ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Ошибка регистрации автомобиля"

            });

        }

    }
);


/*
    Алиас для фронтенда.
*/

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

        if (!player) return;

        const carId =
            req.body?.carId;

        const car =
            findPlayerCar(
                player,
                carId
            );

        if (!car) {

            return res.status(404).json({

                success: false,

                error:
                    "Автомобиль не найден"

            });

        }

        if (car.registered) {

            return res.status(400).json({

                success: false,

                error:
                    "Автомобиль уже зарегистрирован"

            });

        }

        if (
            player.balance <
            MREO_REGISTRATION_PRICE
        ) {

            return res.status(400).json({

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
                "Т/О зарегистрировано",

            car,

            plate,

            player:
                publicPlayer(player)

        });

    }
);


/* =========================================================
   BEAUTIFUL PLATES API
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


/*
    Алиас магазина красивых номеров.
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


/* =========================================================
   BUY BEAUTIFUL PLATE
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

            if (!player) return;

            const plateId =
                req.body?.plateId;

            const plate =
                BEAUTIFUL_PLATES.find(
                    item =>
                        item.id ===
                        plateId
                );

            if (!plate) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Номер не найден"

                });

            }

            if (
                player.balance <
                plate.price
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Недостаточно HC",

                    balance:
                        player.balance

                });

            }

            /*
             * Проверяем, не купил ли
             * этот красивый номер
             * уже кто-то другой.
             */

            for (
                const otherPlayer
                of Object.values(players)
            ) {

                if (
                    !Array.isArray(
                        otherPlayer.cars
                    )
                ) {

                    continue;

                }

                for (
                    const car
                    of otherPlayer.cars
                ) {

                    if (
                        car.beautifulPlate ===
                        plate.number
                    ) {

                        return res.status(409).json({

                            success: false,

                            error:
                                "Этот красивый номер уже занят"

                        });

                    }

                }

            }

            /*
             * Красивый номер становится
             * собственностью игрока.
             *
             * Он пока не обязательно
             * устанавливается на автомобиль.
             */

            player.balance -=
                plate.price;

            if (
                !Array.isArray(
                    player.beautifulPlates
                )
            ) {

                player.beautifulPlates = [];

            }

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
                    publicPlayer(player),

                beautifulPlates:
                    player.beautifulPlates

            });

        } catch (error) {

            console.error(
                "BUY BEAUTIFUL PLATE ERROR:",
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


/* =========================================================
   PLAYER BEAUTIFUL PLATES
========================================================= */

app.get(
    "/api/my-plates",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) return;

        res.json({

            success: true,

            plates:
                player.beautifulPlates ||
                []

        });

    }
);


/*
    Алиас.
*/

app.get(
    "/api/player/plates",
    (req, res) => {

        const player =
            requirePlayer(
                req,
                res
            );

        if (!player) return;

        res.json({

            success: true,

            plates:
                player.beautifulPlates ||
                []

        });

    }
);


/* =========================================================
   INSTALL BEAUTIFUL PLATE
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

            if (!player) return;

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

                return res.status(404).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            if (!car.registered) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Сначала зарегистрируйте автомобиль в МРЭО"

                });

            }

            if (
                !Array.isArray(
                    player.beautifulPlates
                )
            ) {

                player.beautifulPlates = [];

            }

            const ownedPlate =
                player.beautifulPlates.find(
                    plate =>
                        plate.id ===
                        plateId
                );

            if (!ownedPlate) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Этот номер вам не принадлежит"

                });

            }

            /*
             * Снимаем красивый номер
             * с другого автомобиля,
             * если он уже установлен.
             */

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
                    ownedPlate,

                player:
                    publicPlayer(player)

            });

        } catch (error) {

            console.error(
                "INSTALL PLATE ERROR:",
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


/* =========================================================
   REMOVE BEAUTIFUL PLATE
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

            if (!player) return;

            const carId =
                req.body?.carId;

            const car =
                findPlayerCar(
                    player,
                    carId
                );

            if (!car) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Автомобиль не найден"

                });

            }

            const currentPlate =
                car.beautifulPlate;

            if (!currentPlate) {

                return res.status(400).json({

                    success: false,

                    error:
                        "На автомобиле нет красивого номера"

                });

            }

            car.beautifulPlate =
                null;

            if (
                Array.isArray(
                    player.beautifulPlates
                )
            ) {

                const ownedPlate =
                    player.beautifulPlates.find(
                        plate =>
                            plate.number ===
                            currentPlate
                    );

                if (ownedPlate) {

                    ownedPlate.installedOn =
                        null;

                }

            }

            player.updated_at =
                Date.now();

            savePlayers();

            res.json({

                success: true,

                message:
                    "Красивый номер снят",

                car,

                player:
                    publicPlayer(player)

            });

        } catch (error) {

            console.error(
                "REMOVE PLATE ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Ошибка снятия номера"

            });

        }

    }
);


/* =========================================================
   CARD GAME
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
    },

    {
        name: "Т",
        value: 14
    }

];


/* =========================================================
   DECK
========================================================= */

function createDeck() {

    const result = [];

    let id = 0;

    for (const suit of SUITS) {

        for (const rank of RANKS) {

            result.push({

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

    return shuffle(result);

}


function shuffle(array) {

    for (
        let i = array.length - 1;
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
        ] =
        [
            array[j],
            array[i]
        ];

    }

    return array;

}


/* =========================================================
   GAME
========================================================= */

const games = new Map();


function isTrump(game, card) {

    return (
        card &&
        card.suit === game.trumpSuit
    );

}


function canBeat(
    game,
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
        isTrump(game, defense) &&
        !isTrump(game, attack)
    ) {

        return true;

    }

    if (
        !isTrump(game, defense) &&
        isTrump(game, attack)
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


function tableRanks(game) {

    const result = [];

    for (
        const pair of game.table
    ) {

        result.push(
            pair.attack.rank
        );

        if (pair.defense) {

            result.push(
                pair.defense.rank
            );

        }

    }

    return result;

}


function canAddCard(
    game,
    card
) {

    if (!card) {

        return false;

    }

    if (
        game.table.length >=
        game.roundLimit
    ) {

        return false;

    }

    if (
        game.table.length === 0
    ) {

        return true;

    }

    return tableRanks(game)
        .includes(
            card.rank
        );

}


function firstUnbeaten(game) {

    for (
        let i = 0;
        i < game.table.length;
        i++
    ) {

        if (
            !game.table[i].defense
        ) {

            return i;

        }

    }

    return -1;

}


function allBeaten(game) {

    return (
        game.table.length > 0 &&
        firstUnbeaten(game) === -1
    );

}


function findGameByPlayer(
    telegramId
) {

    for (
        const game of games.values()
    ) {

        if (
            game.playerId ===
            telegramId
        ) {

            return game;

        }

    }

    return null;

}


/* =========================================================
   FIRST ATTACKER
========================================================= */

function determineFirstAttacker(game) {

    const playerTrumps =
        game.playerHand
            .filter(
                card =>
                    isTrump(
                        game,
                        card
                    )
            )
            .sort(
                (a, b) =>
                    a.value -
                    b.value
            );

    const cpuTrumps =
        game.cpuHand
            .filter(
                card =>
                    isTrump(
                        game,
                        card
                    )
            )
            .sort(
                (a, b) =>
                    a.value -
                    b.value
            );

    if (
        playerTrumps.length &&
        cpuTrumps.length
    ) {

        return (
            playerTrumps[0].value <=
            cpuTrumps[0].value
        )
            ? "player"
            : "cpu";

    }

    if (
        playerTrumps.length
    ) {

        return "player";

    }

    if (
        cpuTrumps.length
    ) {

        return "cpu";

    }

    const playerMin =
        Math.min(
            ...game.playerHand.map(
                card =>
                    card.value
            )
        );

    const cpuMin =
        Math.min(
            ...game.cpuHand.map(
                card =>
                    card.value
            )
        );

    return (
        playerMin <=
        cpuMin
    )
        ? "player"
        : "cpu";

}


/* =========================================================
   GAME STATE
========================================================= */

function publicGameState(game) {

    return {

        id:
            game.id,

        phase:
            game.phase,

        attacker:
            game.attacker,

        defender:
            game.defender,

        trumpSuit:
            game.trumpSuit,

        deckCount:
            game.deck.length,

        playerHand:
            game.playerHand,

        playerCount:
            game.playerHand.length,

        cpuCount:
            game.cpuHand.length,

        table:
            game.table,

        roundLimit:
            game.roundLimit

    };

}


function sendState(game) {

    if (!game.socket) {

        return;

    }

    game.socket.emit(
        "game_state",
        publicGameState(game)
    );

}


/* =========================================================
   GAME OVER
========================================================= */

function finishGame(
    game,
    winner
) {

    if (
        game.finished
    ) {

        return;

    }

    game.finished = true;

    const player =
        players[game.playerId];

    if (!player) {

        return;

    }

    if (winner === "player") {

        player.wins++;

        player.games++;

        player.balance += 500;

        addXP(
            player,
            50
        );

    } else if (
        winner === "cpu"
    ) {

        player.losses++;

        player.games++;

        addXP(
            player,
            15
        );

    } else {

        player.games++;

        addXP(
            player,
            25
        );

    }

    savePlayers();

    sendState(game);

    if (game.socket) {

        game.socket.emit(
            "game_finished",
            {

                winner,

                message:
                    winner === "player"
                        ? "Ты победил!"
                        : winner === "cpu"
                            ? "Компьютер победил"
                            : "Ничья",

                player:
                    publicPlayer(player)

            }
        );

    }

}


function checkGameOver(game) {

    if (
        game.deck.length > 0
    ) {

        return false;

    }

    if (
        game.playerHand.length === 0 &&
        game.cpuHand.length === 0
    ) {

        finishGame(
            game,
            "draw"
        );

        return true;

    }

    if (
        game.playerHand.length === 0
    ) {

        finishGame(
            game,
            "player"
        );

        return true;

    }

    if (
        game.cpuHand.length === 0
    ) {

        finishGame(
            game,
            "cpu"
        );

        return true;

    }

    return false;

}


/* =========================================================
   REFILL
========================================================= */

function refillHands(game) {

    while (
        game.playerHand.length < MAX_HAND &&
        game.deck.length > 0
    ) {

        game.playerHand.push(
            game.deck.shift()
        );

    }

    while (
        game.cpuHand.length < MAX_HAND &&
        game.deck.length > 0
    ) {

        game.cpuHand.push(
            game.deck.shift()
        );

    }

}


/* =========================================================
   CPU
========================================================= */

function cpuBestDefense(
    game,
    attack
) {

    const available =
        game.cpuHand.filter(
            card =>
                canBeat(
                    game,
                    attack,
                    card
                )
        );

    available.sort(
        (a, b) => {

            const aTrump =
                isTrump(
                    game,
                    a
                );

            const bTrump =
                isTrump(
                    game,
                    b
                );

            if (
                aTrump !==
                bTrump
            ) {

                return aTrump
                    ? 1
                    : -1;

            }

            return (
                a.value -
                b.value
            );

        }
    );

    return (
        available[0] ||
        null
    );

}


function cpuBestAttack(game) {

    const available =
        game.cpuHand.slice();

    available.sort(
        (a, b) => {

            const aTrump =
                isTrump(
                    game,
                    a
                );

            const bTrump =
                isTrump(
                    game,
                    b
                );

            if (
                aTrump !==
                bTrump
            ) {

                return aTrump
                    ? 1
                    : -1;

            }

            return (
                a.value -
                b.value
            );

        }
    );

    return (
        available[0] ||
        null
    );

}


/* =========================================================
   CPU ATTACK
========================================================= */

function cpuStartAttack(game) {

    if (
        game.finished
    ) {

        return;

    }

    if (
        game.phase !==
        "cpu_attack"
    ) {

        return;

    }

    const card =
        cpuBestAttack(game);

    if (!card) {

        checkGameOver(game);

        return;

    }

    const index =
        game.cpuHand.findIndex(
            c =>
                c.id ===
                card.id
        );

    if (index === -1) {

        return;

    }

    game.cpuHand.splice(
        index,
        1
    );

    game.table.push({

        attack: card,

        defense: null

    });

    game.phase =
        "player_defense";

    sendState(game);

}


/* =========================================================
   CPU DEFENSE
========================================================= */

function cpuDefense(game) {

    if (
        game.finished
    ) {

        return;

    }

    const index =
        firstUnbeaten(game);

    if (index === -1) {

        game.phase =
            "player_attack";

        sendState(game);

        return;

    }

    const target =
        game.table[index].attack;

    const card =
        cpuBestDefense(
            game,
            target
        );

    if (!card) {

        cpuTake(game);

        return;

    }

    const handIndex =
        game.cpuHand.findIndex(
            c =>
                c.id ===
                card.id
        );

    if (handIndex === -1) {

        return;

    }

    game.cpuHand.splice(
        handIndex,
        1
    );

    game.table[index].defense =
        card;

    sendState(game);

    setTimeout(
        () => {

            if (
                game.finished
            ) {

                return;

            }

            if (
                allBeaten(game)
            ) {

                game.phase =
                    "player_attack";

                sendState(game);

            } else {

                cpuDefense(game);

            }

        },
        500
    );

}


/* =========================================================
   CPU TAKE
========================================================= */

function cpuTake(game) {

    for (
        const pair of game.table
    ) {

        game.cpuHand.push(
            pair.attack
        );

        if (
            pair.defense
        ) {

            game.cpuHand.push(
                pair.defense
            );

        }

    }

    game.table = [];

    refillHands(game);

    if (
        checkGameOver(game)
    ) {

        return;

    }

    game.attacker =
        "player";

    game.defender =
        "cpu";

    game.phase =
        "player_attack";

    game.roundLimit =
        game.cpuHand.length;

    sendState(game);

}


/* =========================================================
   PLAYER TAKE
========================================================= */

function playerTake(game) {

    if (
        game.phase !==
        "player_defense"
    ) {

        return;

    }

    for (
        const pair of game.table
    ) {

        game.playerHand.push(
            pair.attack
        );

        if (
            pair.defense
        ) {

            game.playerHand.push(
                pair.defense
            );

        }

    }

    game.table = [];

    refillHands(game);

    if (
        checkGameOver(game)
    ) {

        return;

    }

    game.attacker =
        "cpu";

    game.defender =
        "player";

    game.phase =
        "cpu_attack";

    game.roundLimit =
        game.playerHand.length;

    sendState(game);

    setTimeout(
        () => {

            cpuStartAttack(game);

        },
        500
    );

}


/* =========================================================
   SUCCESSFUL ROUND
========================================================= */

function finishSuccessfulRound(game) {

    if (
        !allBeaten(game)
    ) {

        return;

    }

    game.table = [];

    refillHands(game);

    if (
        checkGameOver(game)
    ) {

        return;

    }

    if (
        game.attacker ===
        "player"
    ) {

        game.attacker =
            "cpu";

        game.defender =
            "player";

        game.phase =
            "cpu_attack";

        game.roundLimit =
            game.playerHand.length;

        sendState(game);

        setTimeout(
            () => {

                cpuStartAttack(game);

            },
            500
        );

    } else {

        game.attacker =
            "player";

        game.defender =
            "cpu";

        game.phase =
            "player_attack";

        game.roundLimit =
            game.cpuHand.length;

        sendState(game);

    }

}


/* =========================================================
   PLAYER PLAY
========================================================= */

function playerPlay(
    game,
    cardId
) {

    if (
        game.finished
    ) {

        return;

    }

    if (
        game.phase !==
        "player_attack" &&
        game.phase !==
        "player_defense"
    ) {

        return;

    }

    const index =
        game.playerHand.findIndex(
            card =>
                card.id ===
                cardId
        );

    if (index === -1) {

        return;

    }

    const card =
        game.playerHand[index];


    if (
        game.phase ===
        "player_attack"
    ) {

        if (
            !canAddCard(
                game,
                card
            )
        ) {

            game.socket.emit(
                "action_error",
                {
                    message:
                        game.table.length
                            ? "Такую карту нельзя подкинуть"
                            : "Эту карту нельзя положить"
                }
            );

            return;

        }

        game.playerHand.splice(
            index,
            1
        );

        game.table.push({

            attack: card,

            defense: null

        });

        game.phase =
            "cpu_defense";

        sendState(game);

        setTimeout(
            () => {

                cpuDefense(game);

            },
            500
        );

        return;

    }


    if (
        game.phase ===
        "player_defense"
    ) {

        const attackIndex =
            firstUnbeaten(game);

        if (
            attackIndex === -1
        ) {

            return;

        }

        const attack =
            game.table[
                attackIndex
            ].attack;

        if (
            !canBeat(
                game,
                attack,
                card
            )
        ) {

            game.socket.emit(
                "action_error",
                {
                    message:
                        "Этой картой побить нельзя"
                }
            );

            return;

        }

        game.playerHand.splice(
            index,
            1
        );

        game.table[
            attackIndex
        ].defense =
            card;

        sendState(game);

        setTimeout(
            () => {

                if (
                    allBeaten(game)
                ) {

                    game.phase =
                        "cpu_attack";

                    game.attacker =
                        "cpu";

                    game.defender =
                        "player";

                    game.roundLimit =
                        game.playerHand.length;

                    sendState(game);

                    setTimeout(
                        () => {

                            cpuContinueAttack(
                                game
                            );

                        },
                        500
                    );

                } else {

                    sendState(game);

                }

            },
            500
        );

    }

}


/* =========================================================
   CPU CONTINUE ATTACK
========================================================= */

function cpuContinueAttack(game) {

    if (
        game.finished
    ) {

        return;

    }

    if (
        !allBeaten(game)
    ) {

        game.phase =
            "player_defense";

        sendState(game);

        return;

    }

    const candidates =
        game.cpuHand.filter(
            card =>
                canAddCard(
                    game,
                    card
                )
        );

    if (
        candidates.length === 0
    ) {

        finishSuccessfulRound(
            game
        );

        return;

    }

    candidates.sort(
        (a, b) => {

            const aTrump =
                isTrump(
                    game,
                    a
                );

            const bTrump =
                isTrump(
                    game,
                    b
                );

            if (
                aTrump !==
                bTrump
            ) {

                return aTrump
                    ? 1
                    : -1;

            }

            return (
                a.value -
                b.value
            );

        }
    );

    const card =
        candidates[0];

    const index =
        game.cpuHand.findIndex(
            c =>
                c.id ===
                card.id
        );

    if (index === -1) {

        return;

    }

    game.cpuHand.splice(
        index,
        1
    );

    game.table.push({

        attack: card,

        defense: null

    });

    game.phase =
        "player_defense";

    sendState(game);

}


/* =========================================================
   CREATE GAME
========================================================= */

function createGame(
    playerId,
    socket
) {

    const existing =
        findGameByPlayer(
            playerId
        );

    if (existing) {

        existing.socket =
            socket;

        return existing;

    }

    const deck =
        createDeck();

    const trump =
        deck[deck.length - 1];

    const game = {

        id:
            crypto.randomUUID(),

        playerId,

        socket,

        deck,

        playerHand: [],

        cpuHand: [],

        table: [],

        trumpSuit:
            trump.suit,

        attacker: null,

        defender: null,

        phase:
            "dealing",

        roundLimit:
            6,

        finished:
            false

    };


    for (
        let i = 0;
        i < 6;
        i++
    ) {

        game.playerHand.push(
            game.deck.shift()
        );

        game.cpuHand.push(
            game.deck.shift()
        );

    }


    game.attacker =
        determineFirstAttacker(
            game
        );

    game.defender =
        game.attacker ===
        "player"
            ? "cpu"
            : "player";


    game.roundLimit =
        game.defender ===
        "player"
            ? game.playerHand.length
            : game.cpuHand.length;


    game.phase =
        game.attacker ===
        "player"
            ? "player_attack"
            : "cpu_attack";


    games.set(
        game.id,
        game
    );

    return game;

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
                        createPlayer(user);

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


        socket.on(
            "start_game",
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

                const game =
                    createGame(
                        socket.playerId,
                        socket
                    );

                game.socket =
                    socket;

                sendState(game);

                if (
                    game.phase ===
                    "cpu_attack"
                ) {

                    setTimeout(
                        () => {

                            cpuStartAttack(
                                game
                            );

                        },
                        700
                    );

                }

            }
        );


        socket.on(
            "play_card",
            data => {

                if (
                    !socket.playerId
                ) {

                    return;

                }

                const game =
                    findGameByPlayer(
                        socket.playerId
                    );

                if (!game) {

                    return;

                }

                game.socket =
                    socket;

                playerPlay(
                    game,
                    data &&
                    data.cardId
                );

            }
        );


        socket.on(
            "take_cards",
            () => {

                if (
                    !socket.playerId
                ) {

                    return;

                }

                const game =
                    findGameByPlayer(
                        socket.playerId
                    );

                if (!game) {

                    return;

                }

                game.socket =
                    socket;

                playerTake(game);

            }
        );


        socket.on(
            "finish_round",
            () => {

                if (
                    !socket.playerId
                ) {

                    return;

                }

                const game =
                    findGameByPlayer(
                        socket.playerId
                    );

                if (!game) {

                    return;

                }

                game.socket =
                    socket;

                if (
                    game.phase !==
                    "player_attack"
                ) {

                    return;

                }

                if (
                    !allBeaten(game)
                ) {

                    socket.emit(
                        "action_error",
                        {
                            message:
                                "Сначала нужно отбить все карты"
                        }
                    );

                    return;

                }

                finishSuccessfulRound(
                    game
                );

            }
        );


        socket.on(
            "disconnect",
            () => {

                console.log(
                    "SOCKET DISCONNECT:",
                    socket.id
                );

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
            `HEAVY LUX SERVER RUNNING ON PORT ${PORT}`
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
            `MREO REGISTRATION: ${MREO_REGISTRATION_PRICE} HC`
        );

        console.log(
            `BEAUTIFUL PLATES: ${BEAUTIFUL_PLATES.length}`
        );

    }
);
