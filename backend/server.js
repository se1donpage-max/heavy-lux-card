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

/*
 * Стоимость регистрации автомобиля в МРЭО
 */
const REGISTRATION_PRICE = 25000;

const DATA_FILE = path.join(
    __dirname,
    "players.json"
);


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


/*
 * Сохраняем базу.
 */
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
        String(user.id);


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

            /*
             * АВТОМОБИЛИ ИГРОКА
             */
            cars:
                [],

            created_at:
                Date.now(),

            updated_at:
                Date.now()

        };

        savePlayers();

    } else {

        /*
         * Миграция старых игроков.
         *
         * Если игрок был создан
         * до появления машин,
         * добавляем ему cars.
         */

        if (
            !Array.isArray(
                players[id].cars
            )
        ) {

            players[id].cars = [];

        }


        players[id].first_name =
            user.first_name ||
            players[id].first_name ||
            "Игрок";


        players[id].last_name =
            user.last_name ||
            players[id].last_name ||
            "";


        players[id].username =
            user.username ||
            players[id].username ||
            "";


        players[id].updated_at =
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
            player.cars || []

    };

}


/* =========================================================
   TITLES
========================================================= */

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


/* =========================================================
   XP
========================================================= */

function addXP(
    player,
    amount
) {

    player.xp += amount;


    while (
        player.level < 100 &&
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
   CAR CATALOG
========================================================= */

const CAR_CATALOG = [

    {
        id:
            "mercedes_g63",

        brand:
            "Mercedes-Benz",

        model:
            "Mercedes-AMG G 63",

        price:
            1500000
    },


    {
        id:
            "bmw_m5",

        brand:
            "BMW",

        model:
            "BMW M5 Competition",

        price:
            1200000
    },


    {
        id:
            "porsche_911",

        brand:
            "Porsche",

        model:
            "Porsche 911",

        price:
            1800000
    },


    {
        id:
            "audi_rs6",

        brand:
            "Audi",

        model:
            "Audi RS6 Avant",

        price:
            1300000
    },


    {
        id:
            "lamborghini_urus",

        brand:
            "Lamborghini",

        model:
            "Lamborghini Urus",

        price:
            3000000
    },


    {
        id:
            "rolls_royce_cullinan",

        brand:
            "Rolls-Royce",

        model:
            "Rolls-Royce Cullinan",

        price:
            5000000
    }

];


/* =========================================================
   CAR HELPERS
========================================================= */

function findCatalogCar(
    carId
) {

    return CAR_CATALOG.find(
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
        !Array.isArray(
            player.cars
        )
    ) {

        return null;

    }

    return player.cars.find(
        car =>
            car.id === carId
    );

}


/* =========================================================
   RUSSIAN LICENSE PLATES
========================================================= */

/*
 * Российские буквы,
 * которые используются
 * на государственных номерах.
 */

const PLATE_LETTERS = [
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


/*
 * Основные регионы.
 *
 * Позже можно расширить
 * полноценной системой регионов.
 */

const PLATE_REGIONS = [

    "77",
    "78",
    "50",
    "90",
    "97",
    "99",
    "177",
    "197",
    "199",
    "777",
    "799"

];


/* =========================================================
   GENERATE LICENSE PLATE
========================================================= */

function generateLicensePlate() {

    /*
     * Максимальное количество попыток.
     */
    const maxAttempts = 100000;


    for (
        let attempt = 0;
        attempt < maxAttempts;
        attempt++
    ) {

        const letter1 =
            PLATE_LETTERS[
                Math.floor(
                    Math.random() *
                    PLATE_LETTERS.length
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


        const letter2 =
            PLATE_LETTERS[
                Math.floor(
                    Math.random() *
                    PLATE_LETTERS.length
                )
            ];


        const letter3 =
            PLATE_LETTERS[
                Math.floor(
                    Math.random() *
                    PLATE_LETTERS.length
                )
            ];


        const region =
            PLATE_REGIONS[
                Math.floor(
                    Math.random() *
                    PLATE_REGIONS.length
                )
            ];


        const number =
            `${letter1}${digits}${letter2}${letter3}${region}`;


        if (
            !isLicensePlateUsed(
                number
            )
        ) {

            return number;

        }

    }


    throw new Error(
        "Не удалось подобрать свободный государственный номер"
    );

}


/* =========================================================
   CHECK LICENSE PLATE
========================================================= */

function isLicensePlateUsed(
    number
) {

    for (
        const playerId in players
    ) {

        const player =
            players[playerId];


        if (
            !Array.isArray(
                player.cars
            )
        ) {

            continue;

        }


        for (
            const car of player.cars
        ) {

            if (
                car.registration &&
                car.registration.number ===
                number
            ) {

                return true;

            }

        }

    }


    return false;

}


/* =========================================================
   REGISTER CAR
========================================================= */

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

            error:
                "Автомобиль не найден"

        };

    }


    if (
        car.registration &&
        car.registration.registered
    ) {

        return {

            success:
                false,

            error:
                "Этот автомобиль уже зарегистрирован"

        };

    }


    if (
        player.balance <
        REGISTRATION_PRICE
    ) {

        return {

            success:
                false,

            error:
                `Недостаточно средств. Регистрация стоит ${REGISTRATION_PRICE.toLocaleString("ru-RU")} HC`

        };

    }


    let number;


    try {

        number =
            generateLicensePlate();

    } catch (error) {

        console.error(
            "LICENSE PLATE ERROR:",
            error
        );

        return {

            success:
                false,

            error:
                "Не удалось выдать государственный номер"

        };

    }


    player.balance -=
        REGISTRATION_PRICE;


    car.registration = {

        registered:
            true,

        registered_at:
            Date.now(),

        number:
            number,

        registration_price:
            REGISTRATION_PRICE

    };


    player.updated_at =
        Date.now();


    savePlayers();


    return {

        success:
            true,

        car,

        player:
            publicPlayer(
                player
            )

    };

}


/* =========================================================
   BUY CAR
========================================================= */

function buyCar(
    player,
    catalogId
) {

    const catalogCar =
        findCatalogCar(
            catalogId
        );


    if (!catalogCar) {

        return {

            success:
                false,

            error:
                "Автомобиль не найден в каталоге"

        };

    }


    if (
        player.balance <
        catalogCar.price
    ) {

        return {

            success:
                false,

            error:
                `Недостаточно средств. Цена автомобиля ${catalogCar.price.toLocaleString("ru-RU")} HC`

        };

    }


    const playerCarId =
        crypto.randomUUID();


    const playerCar = {

        id:
            playerCarId,

        catalog_id:
            catalogCar.id,

        brand:
            catalogCar.brand,

        model:
            catalogCar.model,

        price:
            catalogCar.price,

        purchased_at:
            Date.now(),

        registration: {

            registered:
                false,

            registered_at:
                null,

            number:
                null,

            registration_price:
                REGISTRATION_PRICE

        },

        custom_plate: {

            active:
                false,

            number:
                null,

            purchased_at:
                null

        }

    };


    player.balance -=
        catalogCar.price;


    player.cars.push(
        playerCar
    );


    player.updated_at =
        Date.now();


    savePlayers();


    return {

        success:
            true,

        car:
            playerCar,

        player:
            publicPlayer(
                player
            )

    };

}


/* =========================================================
   SELL CAR
========================================================= */

function sellCar(
    player,
    carId
) {

    const index =
        player.cars.findIndex(
            car =>
                car.id ===
                carId
        );


    if (
        index === -1
    ) {

        return {

            success:
                false,

            error:
                "Автомобиль не найден"

        };

    }


    const car =
        player.cars[index];


    /*
     * Пока продаём автомобиль
     * за 70% от первоначальной цены.
     */

    const sellPrice =
        Math.floor(
            car.price * 0.7
        );


    /*
     * Государственный номер
     * освобождается после продажи.
     */

    player.cars.splice(
        index,
        1
    );


    player.balance +=
        sellPrice;


    player.updated_at =
        Date.now();


    savePlayers();


    return {

        success:
            true,

        sold_car:
            car,

        sell_price:
            sellPrice,

        player:
            publicPlayer(
                player
            )

    };

}


/* =========================================================
   API
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.json({

            success:
                true,

            game:
                "Heavy Lux Card",

            status:
                "online"

        });

    }
);


app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success:
                true,

            status:
                "online",

            players:
                Object.keys(
                    players
                ).length

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

                return res.status(
                    401
                ).json({

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


            return res.json({

                success:
                    true,

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

                success:
                    false,

                error:
                    "Internal server error"

            });

        }

    }
);


/* =========================================================
   CAR API
========================================================= */

/*
 * Получить каталог автомобилей.
 */

app.get(
    "/api/cars",
    (req, res) => {

        res.json({

            success:
                true,

            cars:
                CAR_CATALOG

        });

    }
);


/*
 * Покупка автомобиля.
 */

app.post(
    "/api/cars/buy",
    (req, res) => {

        try {

            const {
                initData,
                carId
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


            const result =
                buyCar(
                    player,
                    carId
                );


            if (!result.success) {

                return res.status(
                    400
                ).json(result);

            }


            return res.json(
                result
            );

        } catch (error) {

            console.error(
                "BUY CAR ERROR:",
                error
            );


            return res.status(
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
 * Получить гараж.
 */

app.post(
    "/api/cars/my",
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


            return res.json({

                success:
                    true,

                cars:
                    player.cars || [],

                balance:
                    player.balance

            });

        } catch (error) {

            console.error(
                "GET CARS ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Ошибка получения гаража"

            });

        }

    }
);


/*
 * Регистрация автомобиля
 * в МРЭО.
 */

app.post(
    "/api/cars/register",
    (req, res) => {

        try {

            const {
                initData,
                carId
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


            const result =
                registerCar(
                    player,
                    carId
                );


            if (!result.success) {

                return res.status(
                    400
                ).json(result);

            }


            return res.json(
                result
            );

        } catch (error) {

            console.error(
                "CAR REGISTRATION ERROR:",
                error
            );


            return res.status(
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
 * Продажа автомобиля.
 */

app.post(
    "/api/cars/sell",
    (req, res) => {

        try {

            const {
                initData,
                carId
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


            const result =
                sellCar(
                    player,
                    carId
                );


            if (!result.success) {

                return res.status(
                    400
                ).json(result);

            }


            return res.json(
                result
            );

        } catch (error) {

            console.error(
                "SELL CAR ERROR:",
                error
            );


            return res.status(
                500
            ).json({

                success:
                    false,

                error:
                    "Ошибка продажи автомобиля"

            });

        }

    }
);


/* =========================================================
   CARD DATA
========================================================= */

const SUITS = [
    "♠",
    "♥",
    "♦",
    "♣"
];


const RANKS = [

    {
        name:
            "6",

        value:
            6
    },

    {
        name:
            "7",

        value:
            7
    },

    {
        name:
            "8",

        value:
            8
    },

    {
        name:
            "9",

        value:
            9
    },

    {
        name:
            "10",

        value:
            10
    },

    {
        name:
            "В",

        value:
            11
    },

    {
        name:
            "Д",

        value:
            12
    },

    {
        name:
            "К",

        value:
            13
    },

    {
        name:
            "Т",

        value:
            14
    }

];


/* =========================================================
   DECK
========================================================= */

function createDeck() {

    const result = [];

    let id = 0;


    for (
        const suit of SUITS
    ) {

        for (
            const rank of RANKS
        ) {

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


    return shuffle(
        result
    );

}


/* =========================================================
   SHUFFLE
========================================================= */

function shuffle(array) {

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

const games =
    new Map();


/* =========================================================
   TRUMP
========================================================= */

function isTrump(
    game,
    card
) {

    return (
        card &&
        card.suit ===
        game.trumpSuit
    );

}


/* =========================================================
   CAN BEAT
========================================================= */

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
        isTrump(
            game,
            defense
        ) &&
        !isTrump(
            game,
            attack
        )
    ) {

        return true;

    }


    if (
        !isTrump(
            game,
            defense
        ) &&
        isTrump(
            game,
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


/* =========================================================
   TABLE RANKS
========================================================= */

function tableRanks(game) {

    const result = [];


    for (
        const pair of game.table
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


/* =========================================================
   CAN ADD CARD
========================================================= */

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


    return tableRanks(
        game
    ).includes(
        card.rank
    );

}


/* =========================================================
   FIRST UNBEATEN
========================================================= */

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


/* =========================================================
   ALL BEATEN
========================================================= */

function allBeaten(game) {

    return (

        game.table.length > 0 &&

        firstUnbeaten(
            game
        ) === -1

    );

}


/* =========================================================
   FIND GAME
========================================================= */

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

function determineFirstAttacker(
    game
) {

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
   PUBLIC GAME STATE
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


/* =========================================================
   SEND STATE
========================================================= */

function sendState(game) {

    if (!game.socket) {

        return;

    }


    game.socket.emit(
        "game_state",
        publicGameState(
            game
        )
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


    game.finished =
        true;


    const player =
        players[
            game.playerId
        ];


    if (
        winner ===
        "player"
    ) {

        player.wins++;

        player.games++;

        player.balance +=
            500;

        addXP(
            player,
            50
        );

    } else if (
        winner ===
        "cpu"
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


    sendState(
        game
    );


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
                publicPlayer(
                    player
                )

        }
    );

}


/* =========================================================
   CHECK GAME OVER
========================================================= */

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
   REFILL HANDS
========================================================= */

function refillHands(game) {

    while (
        game.playerHand.length <
        MAX_HAND &&
        game.deck.length > 0
    ) {

        game.playerHand.push(
            game.deck.shift()
        );

    }


    while (
        game.cpuHand.length <
        MAX_HAND &&
        game.deck.length > 0
    ) {

        game.cpuHand.push(
            game.deck.shift()
        );

    }

}


/* =========================================================
   CPU DEFENSE
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


/* =========================================================
   CPU ATTACK CARD
========================================================= */

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
        cpuBestAttack(
            game
        );


    if (!card) {

        checkGameOver(
            game
        );

        return;

    }


    const index =
        game.cpuHand.findIndex(
            c =>
                c.id ===
                card.id
        );


    if (
        index === -1
    ) {

        return;

    }


    game.cpuHand.splice(
        index,
        1
    );


    game.table.push({

        attack:
            card,

        defense:
            null

    });


    game.phase =
        "player_defense";


    sendState(
        game
    );

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
        firstUnbeaten(
            game
        );


    if (
        index === -1
    ) {

        game.phase =
            "player_attack";

        sendState(
            game
        );

        return;

    }


    const target =
        game.table[
            index
        ].attack;


    const card =
        cpuBestDefense(
            game,
            target
        );


    if (!card) {

        cpuTake(
            game
        );

        return;

    }


    const handIndex =
        game.cpuHand.findIndex(
            c =>
                c.id ===
                card.id
        );


    if (
        handIndex === -1
    ) {

        return;

    }


    game.cpuHand.splice(
        handIndex,
        1
    );


    game.table[
        index
    ].defense =
        card;


    sendState(
        game
    );


    setTimeout(
        () => {

            if (
                game.finished
            ) {

                return;

            }


            if (
                allBeaten(
                    game
                )
            ) {

                game.phase =
                    "player_attack";

                sendState(
                    game
                );

            } else {

                cpuDefense(
                    game
                );

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


    refillHands(
        game
    );


    if (
        checkGameOver(
            game
        )
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


    sendState(
        game
    );

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


    refillHands(
        game
    );


    if (
        checkGameOver(
            game
        )
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


    sendState(
        game
    );


    setTimeout(
        () => {

            cpuStartAttack(
                game
            );

        },
        500
    );

}


/* =========================================================
   SUCCESSFUL ROUND
========================================================= */

function finishSuccessfulRound(
    game
) {

    if (
        !allBeaten(
            game
        )
    ) {

        return;

    }


    game.table = [];


    refillHands(
        game
    );


    if (
        checkGameOver(
            game
        )
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


        sendState(
            game
        );


        setTimeout(
            () => {

                cpuStartAttack(
                    game
                );

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


        sendState(
            game
        );

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


    if (
        index === -1
    ) {

        return;

    }


    const card =
        game.playerHand[
            index
        ];


    /* =====================================================
       PLAYER ATTACK
    ===================================================== */

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

            attack:
                card,

            defense:
                null

        });


        game.phase =
            "cpu_defense";


        sendState(
            game
        );


        setTimeout(
            () => {

                cpuDefense(
                    game
                );

            },
            500
        );


        return;

    }


    /* =====================================================
       PLAYER DEFENSE
    ===================================================== */

    if (
        game.phase ===
        "player_defense"
    ) {

        const attackIndex =
            firstUnbeaten(
                game
            );


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


        sendState(
            game
        );


        /*
         * После успешного отбивания
         * компьютер принимает решение.
         */

        setTimeout(
            () => {

                if (
                    allBeaten(
                        game
                    )
                ) {

                    game.phase =
                        "cpu_attack";


                    game.attacker =
                        "cpu";


                    game.defender =
                        "player";


                    game.roundLimit =
                        game.playerHand.length;


                    sendState(
                        game
                    );


                    setTimeout(
                        () => {

                            cpuContinueAttack(
                                game
                            );

                        },
                        500
                    );

                } else {

                    sendState(
                        game
                    );

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
        !allBeaten(
            game
        )
    ) {

        game.phase =
            "player_defense";


        sendState(
            game
        );

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


    if (
        index === -1
    ) {

        return;

    }


    game.cpuHand.splice(
        index,
        1
    );


    game.table.push({

        attack:
            card,

        defense:
            null

    });


    game.phase =
        "player_defense";


    sendState(
        game
    );

}


/* =========================================================
   NEW GAME
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
        deck[
            deck.length - 1
        ];


    const game = {

        id:
            crypto.randomUUID(),

        playerId,

        socket,

        deck,

        playerHand:
            [],

        cpuHand:
            [],

        table:
            [],

        trumpSuit:
            trump.suit,

        attacker:
            null,

        defender:
            null,

        phase:
            "dealing",

        roundLimit:
            6,

        finished:
            false

    };


    /*
     * Раздаём по 6 карт.
     */

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
           START GAME
        ================================================= */

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


                sendState(
                    game
                );


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


        /* =================================================
           PLAY CARD
        ================================================= */

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


                if (
                    game.socket !==
                    socket
                ) {

                    game.socket =
                        socket;

                }


                playerPlay(
                    game,
                    data &&
                    data.cardId
                );

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


                playerTake(
                    game
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
                    !allBeaten(
                        game
                    )
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

                /*
                 * Игру не удаляем.
                 *
                 * При переподключении
                 * игрок сможет продолжить.
                 */

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
            `BOT TOKEN: ${
                BOT_TOKEN
                    ? "configured"
                    : "NOT CONFIGURED"
            }`
        );


        console.log(
            `CAR REGISTRATION: ${REGISTRATION_PRICE} HC`
        );


        console.log(
            `CAR CATALOG: ${CAR_CATALOG.length} vehicles`
        );

    }
);
