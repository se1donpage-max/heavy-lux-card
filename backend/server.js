const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { WebSocketServer } = require("ws");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_ID = String(
    process.env.ADMIN_ID || ""
);

const JWT_SECRET =
    process.env.JWT_SECRET;

const BOT_TOKEN =
    process.env.BOT_TOKEN;


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(express.json());


/* =========================================================
   DATABASE
========================================================= */

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    }
});


/* =========================================================
   CONSTANTS
========================================================= */

const START_BALANCE = 10000;

const BUSINESS_LEVEL_MULTIPLIERS = {
    1: 1.00,
    2: 1.25,
    3: 1.55,
    4: 1.95,
    5: 2.45
};


/* =========================================================
   COLORS
========================================================= */

const COLORS = [
    {
        id: "black",
        name: "Черный",
        emoji: "⚫",
        hex: "#080808"
    },

    {
        id: "white",
        name: "Белый",
        emoji: "⚪",
        hex: "#eeeeee"
    },

    {
        id: "red",
        name: "Красный",
        emoji: "🔴",
        hex: "#7d1111"
    },

    {
        id: "blue",
        name: "Синий",
        emoji: "🔵",
        hex: "#172b52"
    },

    {
        id: "green",
        name: "Зеленый",
        emoji: "🟢",
        hex: "#17351f"
    },

    {
        id: "gold",
        name: "Золотой",
        emoji: "🟡",
        hex: "#8b7020"
    }
];


/* =========================================================
   TITLES
========================================================= */

function getTitle(level) {

    if (level >= 100)
        return "Покровитель";

    if (level >= 80)
        return "Попечитель";

    if (level >= 60)
        return "Почётный член клуба";

    if (level >= 40)
        return "Старший член клуба";

    if (level >= 20)
        return "Член клуба";

    return null;
}


/* =========================================================
   TELEGRAM AUTH
========================================================= */

function validateTelegramInitData(
    initData
) {

    if (!initData) {
        return null;
    }

    if (!BOT_TOKEN) {
        throw new Error(
            "BOT_TOKEN is not configured"
        );
    }

    const params =
        new URLSearchParams(initData);

    const receivedHash =
        params.get("hash");

    if (!receivedHash) {
        return null;
    }

    params.delete("hash");

    const dataCheckString =
        Array.from(
            params.entries()
        )
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
        receivedHash.length
    ) {
        return null;
    }

    if (
        !crypto.timingSafeEqual(
            Buffer.from(calculatedHash),
            Buffer.from(receivedHash)
        )
    ) {
        return null;
    }

    const authDate =
        Number(
            params.get("auth_date")
        );

    if (!authDate) {
        return null;
    }

    const currentTime =
        Math.floor(
            Date.now() / 1000
        );

    if (
        currentTime - authDate >
        86400
    ) {
        return null;
    }

    const userString =
        params.get("user");

    if (!userString) {
        return null;
    }

    try {

        return JSON.parse(
            userString
        );

    } catch {

        return null;
    }
}


/* =========================================================
   JWT
========================================================= */

function createToken(player) {

    if (!JWT_SECRET) {

        throw new Error(
            "JWT_SECRET is not configured"
        );
    }

    return jwt.sign(
        {
            playerId:
                player.id,

            telegramId:
                String(
                    player.telegram_id
                )
        },

        JWT_SECRET,

        {
            expiresIn: "7d"
        }
    );
}


function verifyToken(token) {

    if (!JWT_SECRET) {
        throw new Error(
            "JWT_SECRET is not configured"
        );
    }

    return jwt.verify(
        token,
        JWT_SECRET
    );
}


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

async function authMiddleware(
    req,
    res,
    next
) {

    try {

        const header =
            req.headers.authorization;

        if (
            !header ||
            !header.startsWith(
                "Bearer "
            )
        ) {

            return res.status(401).json({
                success: false,
                error: "Authorization required"
            });
        }

        const token =
            header.substring(7);

        const decoded =
            verifyToken(token);

        const result =
            await pool.query(
                `
                SELECT *
                FROM players
                WHERE id = $1
                `,
                [
                    decoded.playerId
                ]
            );

        if (
            result.rows.length === 0
        ) {

            return res.status(401).json({
                success: false,
                error: "Player not found"
            });
        }

        req.player =
            result.rows[0];

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            error: "Invalid authorization"
        });
    }
}


/* =========================================================
   ADMIN
========================================================= */

function isAdmin(player) {

    return (
        player &&
        String(
            player.telegram_id
        ) === ADMIN_ID
    );
}


/* =========================================================
   DATABASE INIT
========================================================= */

async function initDatabase() {

    await pool.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS players (
            id BIGSERIAL PRIMARY KEY,
            telegram_id BIGINT UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            balance NUMERIC(20,2) NOT NULL DEFAULT 10000,
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            title TEXT,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            games INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS cars_catalog (
            id TEXT PRIMARY KEY,
            brand TEXT NOT NULL,
            model TEXT NOT NULL,
            price NUMERIC(20,2) NOT NULL,
            stock INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS player_cars (
            id BIGSERIAL PRIMARY KEY,
            player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            catalog_id TEXT NOT NULL REFERENCES cars_catalog(id),
            color_id TEXT NOT NULL,
            number TEXT DEFAULT 'Не на учете',
            purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS properties_catalog (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price NUMERIC(20,2) NOT NULL,
            garage INTEGER NOT NULL DEFAULT 0,
            rent NUMERIC(20,2) NOT NULL DEFAULT 0
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS player_properties (
            id BIGSERIAL PRIMARY KEY,
            player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            property_id TEXT NOT NULL REFERENCES properties_catalog(id),
            purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS businesses_catalog (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price NUMERIC(20,2) NOT NULL,
            global_limit INTEGER NOT NULL,
            base_income NUMERIC(20,2) NOT NULL,
            expenses NUMERIC(20,2) NOT NULL,
            max_level INTEGER NOT NULL DEFAULT 5
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS player_businesses (
            id BIGSERIAL PRIMARY KEY,
            player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            business_id TEXT NOT NULL REFERENCES businesses_catalog(id),
            level INTEGER NOT NULL DEFAULT 1,
            purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(player_id, business_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_rooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code TEXT UNIQUE NOT NULL,
            host_player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'waiting',
            max_players INTEGER NOT NULL DEFAULT 2,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_room_players (
            id BIGSERIAL PRIMARY KEY,
            room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
            player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            seat INTEGER NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(room_id, player_id),
            UNIQUE(room_id, seat)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_matches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
            game_type TEXT NOT NULL DEFAULT 'durak',
            state JSONB NOT NULL DEFAULT '{}'::jsonb,
            current_turn INTEGER,
            winner_player_id BIGINT REFERENCES players(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS game_moves (
            id BIGSERIAL PRIMARY KEY,
            match_id UUID NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
            player_id BIGINT NOT NULL REFERENCES players(id),
            action TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await seedDatabase();

    console.log(
        "Database initialized successfully"
    );
}


/* =========================================================
   SEED
========================================================= */

async function seedDatabase() {

    const cars = [

        [
            "mercedes-s",
            "Mercedes-Benz",
            "S-Class",
            15000000,
            20
        ],

        [
            "bmw-7",
            "BMW",
            "7 Series",
            13000000,
            20
        ],

        [
            "range-rover",
            "Range Rover",
            "Autobiography",
            18000000,
            15
        ],

        [
            "porsche-911",
            "Porsche",
            "911",
            22000000,
            12
        ],

        [
            "bentley",
            "Bentley",
            "Continental GT",
            30000000,
            10
        ],

        [
            "rolls-royce",
            "Rolls-Royce",
            "Ghost",
            50000000,
            5
        ]
    ];

    for (
        const car of cars
    ) {

        await pool.query(
            `
            INSERT INTO cars_catalog
            (id, brand, model, price, stock)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (id)
            DO NOTHING
            `,
            car
        );
    }


    const properties = [

        [
            "small-flat",
            "Небольшая квартира",
            5000000,
            1,
            5000
        ],

        [
            "business-flat",
            "Бизнес-класс",
            15000000,
            2,
            18000
        ],

        [
            "penthouse",
            "Пентхаус",
            40000000,
            4,
            55000
        ],

        [
            "mansion",
            "Особняк",
            100000000,
            8,
            150000
        ]
    ];

    for (
        const property of properties
    ) {

        await pool.query(
            `
            INSERT INTO properties_catalog
            (id,name,price,garage,rent)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (id)
            DO NOTHING
            `,
            property
        );
    }


    const businesses = [

        [
            "tobacco",
            "Табачный магазин",
            "Розничная торговля",
            3000000,
            500,
            22000,
            7000
        ],

        [
            "shop24",
            "Магазин 24/7",
            "Розничная торговля",
            7000000,
            300,
            48000,
            15000
        ],

        [
            "pharmacy",
            "Аптека",
            "Медицина",
            12000000,
            200,
            78000,
            27000
        ],

        [
            "carwash",
            "Автомойка",
            "Автомобильный бизнес",
            18000000,
            150,
            115000,
            40000
        ],

        [
            "service",
            "СТО",
            "Автомобильный бизнес",
            35000000,
            100,
            210000,
            75000
        ],

        [
            "restaurant",
            "Ресторан",
            "Общепит",
            50000000,
            80,
            320000,
            125000
        ],

        [
            "nightclub",
            "Ночной клуб",
            "Развлечения",
            90000000,
            50,
            550000,
            230000
        ],

        [
            "logistics",
            "Логистическая компания",
            "Логистика",
            180000000,
            30,
            1100000,
            500000
        ],

        [
            "bank",
            "Частный банк",
            "Финансы",
            500000000,
            10,
            3200000,
            1600000
        ],

        [
            "factory",
            "Промышленный завод",
            "Промышленность",
            1000000000,
            5,
            7000000,
            3700000
        ],

        [
            "oil-refinery",
            "НПЗ",
            "Нефтегаз",
            5000000000,
            2,
            30000000,
            17000000
        ]
    ];

    for (
        const business of businesses
    ) {

        await pool.query(
            `
            INSERT INTO businesses_catalog
            (
                id,
                name,
                category,
                price,
                global_limit,
                base_income,
                expenses
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (id)
            DO NOTHING
            `,
            business
        );
    }
}


/* =========================================================
   PLAYER
========================================================= */

function formatPlayer(player) {

    return {

        id:
            player.id,

        telegram_id:
            String(
                player.telegram_id
            ),

        username:
            player.username,

        first_name:
            player.first_name,

        last_name:
            player.last_name,

        balance:
            Math.floor(
                Number(
                    player.balance
                )
            ),

        xp:
            player.xp,

        level:
            player.level,

        title:
            getTitle(
                player.level
            ),

        wins:
            player.wins,

        losses:
            player.losses,

        games:
            player.games,

        created_at:
            player.created_at
    };
}


/* =========================================================
   ROOT
========================================================= */

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            project:
                "Heavy Lux Card",

            status:
                "online",

            multiplayer:
                true
        });
    }
);


/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/api/health",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT NOW()"
            );

            res.json({

                success: true,

                server:
                    "online",

                database:
                    "connected",

                multiplayer:
                    "enabled"
            });

        } catch {

            res.status(500).json({

                success: false,

                database:
                    "error"
            });
        }
    }
);


/* =========================================================
   TELEGRAM AUTH
========================================================= */

app.post(
    "/api/auth",
    async (req, res) => {

        try {

            const {
                initData
            } = req.body;

            const telegramUser =
                validateTelegramInitData(
                    initData
                );

            if (!telegramUser) {

                return res.status(401).json({

                    success: false,

                    error:
                        "Invalid Telegram authentication"
                });
            }

            const telegramId =
                telegramUser.id;

            const username =
                telegramUser.username ||
                null;

            const firstName =
                telegramUser.first_name ||
                null;

            const lastName =
                telegramUser.last_name ||
                null;


            const result =
                await pool.query(
                    `
                    INSERT INTO players
                    (
                        telegram_id,
                        username,
                        first_name,
                        last_name,
                        balance,
                        xp,
                        level
                    )
                    VALUES
                    ($1,$2,$3,$4,$5,0,1)

                    ON CONFLICT
                    (telegram_id)

                    DO UPDATE SET

                        username =
                            EXCLUDED.username,

                        first_name =
                            EXCLUDED.first_name,

                        last_name =
                            EXCLUDED.last_name,

                        updated_at =
                            NOW()

                    RETURNING *
                    `,
                    [
                        telegramId,
                        username,
                        firstName,
                        lastName,
                        START_BALANCE
                    ]
                );

            const player =
                result.rows[0];

            const token =
                createToken(
                    player
                );

            res.json({

                success: true,

                token,

                player:
                    formatPlayer(
                        player
                    )
            });

        } catch (error) {

            console.error(
                "AUTH ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Authentication server error"
            });
        }
    }
);


/* =========================================================
   CURRENT PLAYER
========================================================= */

app.get(
    "/api/me",
    authMiddleware,
    async (req, res) => {

        res.json({

            success: true,

            player:
                formatPlayer(
                    req.player
                )
        });
    }
);


/* =========================================================
   PLAYER BY ID
========================================================= */

app.get(
    "/api/player/:telegram_id",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM players
                    WHERE telegram_id = $1
                    `,
                    [
                        req.params.telegram_id
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Player not found"
                });
            }

            res.json({

                success: true,

                player:
                    formatPlayer(
                        result.rows[0]
                    )
            });

        } catch {

            res.status(500).json({

                success: false,

                error:
                    "Database error"
            });
        }
    }
);


/* =========================================================
   CARS
========================================================= */

app.get(
    "/api/cars",
    authMiddleware,
    async (req, res) => {

        const result =
            await pool.query(
                `
                SELECT *
                FROM cars_catalog
                ORDER BY price ASC
                `
            );

        const cars = [];

        for (
            const car of result.rows
        ) {

            const sold =
                await pool.query(
                    `
                    SELECT COUNT(*)
                    FROM player_cars
                    WHERE catalog_id = $1
                    `,
                    [
                        car.id
                    ]
                );

            cars.push({

                ...car,

                remaining:
                    Math.max(
                        0,
                        car.stock -
                        Number(
                            sold.rows[0].count
                        )
                    )
            });
        }

        res.json({

            success: true,

            cars,

            colors:
                COLORS
        });
    }
);


/* =========================================================
   BUY CAR
========================================================= */

app.post(
    "/api/cars/buy",
    authMiddleware,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const {
                carId,
                colorId
            } = req.body;

            const color =
                COLORS.find(
                    item =>
                        item.id ===
                        colorId
                );

            if (!color) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Color not found"
                });
            }

            await client.query(
                "BEGIN"
            );

            const carResult =
                await client.query(
                    `
                    SELECT *
                    FROM cars_catalog
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        carId
                    ]
                );

            if (
                carResult.rows.length === 0
            ) {

                throw new Error(
                    "Car not found"
                );
            }

            const car =
                carResult.rows[0];

            const soldResult =
                await client.query(
                    `
                    SELECT COUNT(*)
                    FROM player_cars
                    WHERE catalog_id = $1
                    `,
                    [
                        carId
                    ]
                );

            const sold =
                Number(
                    soldResult.rows[0].count
                );

            if (
                sold >=
                car.stock
            ) {

                throw new Error(
                    "All cars sold"
                );
            }


            const playerResult =
                await client.query(
                    `
                    SELECT *
                    FROM players
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        req.player.id
                    ]
                );

            const player =
                playerResult.rows[0];

            if (
                Number(
                    player.balance
                ) <
                Number(
                    car.price
                )
            ) {

                throw new Error(
                    "Not enough money"
                );
            }


            await client.query(
                `
                UPDATE players

                SET balance =
                    balance - $1,

                    updated_at =
                        NOW()

                WHERE id = $2
                `,
                [
                    car.price,
                    player.id
                ]
            );


            const inserted =
                await client.query(
                    `
                    INSERT INTO player_cars
                    (
                        player_id,
                        catalog_id,
                        color_id
                    )
                    VALUES
                    ($1,$2,$3)

                    RETURNING *
                    `,
                    [
                        player.id,
                        carId,
                        colorId
                    ]
                );


            await client.query(
                "COMMIT"
            );


            res.json({

                success: true,

                car:
                    inserted.rows[0],

                balance:
                    Math.floor(
                        Number(
                            player.balance
                        ) -
                        Number(
                            car.price
                        )
                    )
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            res.status(400).json({

                success: false,

                error:
                    error.message
            });

        } finally {

            client.release();
        }
    }
);


/* =========================================================
   MY CARS
========================================================= */

app.get(
    "/api/my/cars",
    authMiddleware,
    async (req, res) => {

        const result =
            await pool.query(
                `
                SELECT
                    pc.*,

                    c.brand,
                    c.model,
                    c.price,

                    CASE
                        WHEN pc.color_id = 'black'
                            THEN 'Черный'

                        WHEN pc.color_id = 'white'
                            THEN 'Белый'

                        WHEN pc.color_id = 'red'
                            THEN 'Красный'

                        WHEN pc.color_id = 'blue'
                            THEN 'Синий'

                        WHEN pc.color_id = 'green'
                            THEN 'Зеленый'

                        WHEN pc.color_id = 'gold'
                            THEN 'Золотой'

                        ELSE pc.color_id
                    END AS color_name

                FROM player_cars pc

                JOIN cars_catalog c
                    ON c.id = pc.catalog_id

                WHERE pc.player_id = $1

                ORDER BY pc.purchased_at DESC
                `,
                [
                    req.player.id
                ]
            );

        res.json({

            success: true,

            cars:
                result.rows
        });
    }
);


/* =========================================================
   REGISTER CAR
========================================================= */

app.post(
    "/api/cars/register",
    authMiddleware,
    async (req, res) => {

        const {
            carId
        } = req.body;

        const PRICE = 5000;

        const result =
            await pool.query(
                `
                UPDATE player_cars

                SET number =
                    'HL ' ||
                    FLOOR(
                        100 +
                        RANDOM() * 900
                    ) ||
                    ' HE'

                WHERE id = $1

                AND player_id = $2

                AND number =
                    'Не на учете'

                RETURNING *
                `,
                [
                    carId,
                    req.player.id
                ]
            );

        if (
            result.rows.length === 0
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Car cannot be registered"
            });
        }


        const money =
            await pool.query(
                `
                UPDATE players

                SET balance =
                    balance - $1

                WHERE id = $2

                AND balance >= $1

                RETURNING balance
                `,
                [
                    PRICE,
                    req.player.id
                ]
            );

        if (
            money.rows.length === 0
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Not enough money"
            });
        }


        res.json({

            success: true,

            car:
                result.rows[0],

            balance:
                Math.floor(
                    Number(
                        money.rows[0].balance
                    )
                )
        });
    }
);


/* =========================================================
   PROPERTIES
========================================================= */

app.get(
    "/api/properties",
    authMiddleware,
    async (req, res) => {

        const result =
            await pool.query(
                `
                SELECT *
                FROM properties_catalog
                ORDER BY price ASC
                `
            );

        res.json({

            success: true,

            properties:
                result.rows
        });
    }
);


/* =========================================================
   BUY PROPERTY
========================================================= */

app.post(
    "/api/properties/buy",
    authMiddleware,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            await client.query(
                "BEGIN"
            );

            const property =
                await client.query(
                    `
                    SELECT *
                    FROM properties_catalog
                    WHERE id = $1
                    `,
                    [
                        req.body.propertyId
                    ]
                );

            if (
                property.rows.length === 0
            ) {

                throw new Error(
                    "Property not found"
                );
            }

            const item =
                property.rows[0];


            const player =
                await client.query(
                    `
                    SELECT *
                    FROM players
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        req.player.id
                    ]
                );

            if (
                Number(
                    player.rows[0].balance
                ) <
                Number(
                    item.price
                )
            ) {

                throw new Error(
                    "Not enough money"
                );
            }


            await client.query(
                `
                UPDATE players

                SET balance =
                    balance - $1

                WHERE id = $2
                `,
                [
                    item.price,
                    req.player.id
                ]
            );


            await client.query(
                `
                INSERT INTO player_properties
                (
                    player_id,
                    property_id
                )

                VALUES
                ($1,$2)
                `,
                [
                    req.player.id,
                    item.id
                ]
            );


            await client.query(
                "COMMIT"
            );


            res.json({

                success: true,

                message:
                    "Property purchased"
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            res.status(400).json({

                success: false,

                error:
                    error.message
            });

        } finally {

            client.release();
        }
    }
);


/* =========================================================
   BUSINESSES
========================================================= */

function businessMultiplier(
    level
) {

    return (
        BUSINESS_LEVEL_MULTIPLIERS[
            level
        ] || 1
    );
}


function businessNet(
    business,
    level
) {

    const multiplier =
        businessMultiplier(
            level
        );

    const income =
        Number(
            business.base_income
        ) *
        multiplier;

    const expenses =
        Number(
            business.expenses
        ) *
        multiplier;

    return Math.max(
        0,
        income -
        expenses
    );
}


function upgradePrice(
    business,
    level
) {

    const multipliers = {

        1: 0.45,

        2: 0.65,

        3: 0.90,

        4: 1.20
    };

    return Math.floor(
        Number(
            business.price
        ) *
        (
            multipliers[level] ||
            0
        )
    );
}


/* =========================================================
   BUSINESS CATALOG
========================================================= */

app.get(
    "/api/businesses",
    authMiddleware,
    async (req, res) => {

        const result =
            await pool.query(
                `
                SELECT *
                FROM businesses_catalog
                ORDER BY price ASC
                `
            );

        const businesses = [];

        for (
            const business
            of result.rows
        ) {

            const owners =
                await pool.query(
                    `
                    SELECT COUNT(*)
                    FROM player_businesses
                    WHERE business_id = $1
                    `,
                    [
                        business.id
                    ]
                );

            const occupied =
                Number(
                    owners.rows[0].count
                );

            const available =
                Math.max(
                    0,
                    business.global_limit -
                    occupied
                );

            businesses.push({

                ...business,

                occupied,

                available,

                level_1_income:
                    Number(
                        business.base_income
                    ),

                level_1_expenses:
                    Number(
                        business.expenses
                    ),

                level_1_net:
                    businessNet(
                        business,
                        1
                    ),

                upgrade_prices: {

                    level_2:
                        upgradePrice(
                            business,
                            1
                        ),

                    level_3:
                        upgradePrice(
                            business,
                            2
                        ),

                    level_4:
                        upgradePrice(
                            business,
                            3
                        ),

                    level_5:
                        upgradePrice(
                            business,
                            4
                        )
                }
            });
        }

        res.json({

            success: true,

            businesses
        });
    }
);


/* =========================================================
   BUY BUSINESS
========================================================= */

app.post(
    "/api/businesses/buy",
    authMiddleware,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            await client.query(
                "BEGIN"
            );

            const result =
                await client.query(
                    `
                    SELECT *
                    FROM businesses_catalog
                    WHERE id = $1
                    `,
                    [
                        req.body.businessId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                throw new Error(
                    "Business not found"
                );
            }

            const business =
                result.rows[0];


            const existing =
                await client.query(
                    `
                    SELECT *
                    FROM player_businesses

                    WHERE player_id = $1

                    AND business_id = $2
                    `,
                    [
                        req.player.id,
                        business.id
                    ]
                );

            if (
                existing.rows.length > 0
            ) {

                throw new Error(
                    "You already own this business"
                );
            }


            const owners =
                await client.query(
                    `
                    SELECT COUNT(*)
                    FROM player_businesses

                    WHERE business_id = $1
                    `,
                    [
                        business.id
                    ]
                );

            if (
                Number(
                    owners.rows[0].count
                ) >=
                business.global_limit
            ) {

                throw new Error(
                    "Business limit reached"
                );
            }


            const player =
                await client.query(
                    `
                    SELECT *
                    FROM players
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        req.player.id
                    ]
                );

            if (
                Number(
                    player.rows[0].balance
                ) <
                Number(
                    business.price
                )
            ) {

                throw new Error(
                    "Not enough money"
                );
            }


            await client.query(
                `
                UPDATE players

                SET balance =
                    balance - $1

                WHERE id = $2
                `,
                [
                    business.price,
                    req.player.id
                ]
            );


            await client.query(
                `
                INSERT INTO player_businesses
                (
                    player_id,
                    business_id,
                    level
                )

                VALUES
                ($1,$2,1)
                `,
                [
                    req.player.id,
                    business.id
                ]
            );


            await client.query(
                "COMMIT"
            );


            res.json({

                success: true,

                message:
                    "Business purchased"
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            res.status(400).json({

                success: false,

                error:
                    error.message
            });

        } finally {

            client.release();
        }
    }
);


/* =========================================================
   MY BUSINESSES
========================================================= */

app.get(
    "/api/my/businesses",
    authMiddleware,
    async (req, res) => {

        const result =
            await pool.query(
                `
                SELECT

                    pb.id,

                    pb.business_id,

                    pb.level,

                    pb.purchased_at,

                    bc.name,

                    bc.category,

                    bc.price,

                    bc.base_income,

                    bc.expenses,

                    bc.max_level

                FROM player_businesses pb

                JOIN businesses_catalog bc
                    ON bc.id =
                    pb.business_id

                WHERE pb.player_id = $1

                ORDER BY pb.purchased_at DESC
                `,
                [
                    req.player.id
                ]
            );


        const businesses =
            result.rows.map(
                business => {

                    const net =
                        businessNet(
                            business,
                            business.level
                        );

                    return {

                        ...business,

                        hourlyIncome:
                            net,

                        dailyIncome:
                            net * 24,

                        weeklyIncome:
                            net * 24 * 7,

                        nextUpgradePrice:
                            business.level <
                            business.max_level

                                ? upgradePrice(
                                    business,
                                    business.level
                                )

                                : 0
                    };
                }
            );


        res.json({

            success: true,

            businesses
        });
    }
);


/* =========================================================
   UPGRADE BUSINESS
========================================================= */

app.post(
    "/api/businesses/upgrade",
    authMiddleware,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            await client.query(
                "BEGIN"
            );


            const result =
                await client.query(
                    `
                    SELECT

                        pb.*,

                        bc.*

                    FROM player_businesses pb

                    JOIN businesses_catalog bc
                        ON bc.id =
                        pb.business_id

                    WHERE pb.player_id = $1

                    AND pb.business_id = $2

                    FOR UPDATE
                    `,
                    [
                        req.player.id,
                        req.body.businessId
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                throw new Error(
                    "Business not found"
                );
            }


            const business =
                result.rows[0];


            if (
                business.level >=
                business.max_level
            ) {

                throw new Error(
                    "Maximum level reached"
                );
            }


            const price =
                upgradePrice(
                    business,
                    business.level
                );


            const player =
                await client.query(
                    `
                    SELECT *
                    FROM players
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        req.player.id
                    ]
                );


            if (
                Number(
                    player.rows[0].balance
                ) <
                price
            ) {

                throw new Error(
                    "Not enough money"
                );
            }


            await client.query(
                `
                UPDATE players

                SET balance =
                    balance - $1

                WHERE id = $2
                `,
                [
                    price,
                    req.player.id
                ]
            );


            const upgraded =
                await client.query(
                    `
                    UPDATE player_businesses

                    SET level =
                        level + 1

                    WHERE id = $1

                    RETURNING *
                    `,
                    [
                        business.id
                    ]
                );


            await client.query(
                "COMMIT"
            );


            res.json({

                success: true,

                level:
                    upgraded.rows[0].level,

                price
            });

        } catch (error) {

            await client.query(
                "ROLLBACK"
            );

            res.status(400).json({

                success: false,

                error:
                    error.message
            });

        } finally {

            client.release();
        }
    }
);


/* =========================================================
   GAME ROOM HELPERS
========================================================= */

function generateRoomCode() {

    return crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase();
}


async function getRoom(
    code
) {

    const room =
        await pool.query(
            `
            SELECT *
            FROM game_rooms
            WHERE code = $1
            `,
            [
                code
            ]
        );

    if (
        room.rows.length === 0
    ) {
        return null;
    }

    const players =
        await pool.query(
            `
            SELECT

                grp.seat,

                p.id,

                p.telegram_id,

                p.username,

                p.first_name,

                p.level,

                p.title

            FROM game_room_players grp

            JOIN players p
                ON p.id =
                grp.player_id

            WHERE grp.room_id = $1

            ORDER BY grp.seat
            `,
            [
                room.rows[0].id
            ]
        );

    return {

        ...room.rows[0],

        players:
            players.rows.map(
                player => ({

                    seat:
                        player.seat,

                    id:
                        player.id,

                    telegram_id:
                        String(
                            player.telegram_id
                        ),

                    username:
                        player.username,

                    first_name:
                        player.first_name,

                    level:
                        player.level,

                    title:
                        getTitle(
                            player.level
                        )
                })
            )
    };
}


/* =========================================================
   CREATE ROOM
========================================================= */

app.post(
    "/api/game/create",
    authMiddleware,
    async (req, res) => {

        let code;

        for (;;) {

            code =
                generateRoomCode();

            const check =
                await pool.query(
                    `
                    SELECT 1
                    FROM game_rooms
                    WHERE code = $1
                    `,
                    [
                        code
                    ]
                );

            if (
                check.rows.length === 0
            ) {
                break;
            }
        }


        const room =
            await pool.query(
                `
                INSERT INTO game_rooms
                (
                    code,
                    host_player_id,
                    max_players
                )

                VALUES
                ($1,$2,$3)

                RETURNING *
                `,
                [
                    code,
                    req.player.id,
                    2
                ]
            );


        await pool.query(
            `
            INSERT INTO game_room_players
            (
                room_id,
                player_id,
                seat
            )

            VALUES
            ($1,$2,0)
            `,
            [
                room.rows[0].id,
                req.player.id
            ]
        );


        const data =
            await getRoom(
                code
            );


        broadcastRoom(
            code,
            {
                type:
                    "room_update",

                room:
                    data
            }
        );


        res.json({

            success: true,

            room:
                data
        });
    }
);


/* =========================================================
   JOIN ROOM
========================================================= */

app.post(
    "/api/game/join",
    authMiddleware,
    async (req, res) => {

        const code =
            String(
                req.body.code ||
                ""
            )
            .trim()
            .toUpperCase();


        const room =
            await pool.query(
                `
                SELECT *
                FROM game_rooms
                WHERE code = $1
                `,
                [
                    code
                ]
            );


        if (
            room.rows.length === 0
        ) {

            return res.status(404).json({

                success: false,

                error:
                    "Room not found"
            });
        }


        const roomData =
            room.rows[0];


        if (
            roomData.status !==
            "waiting"
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Game already started"
            });
        }


        const count =
            await pool.query(
                `
                SELECT COUNT(*)
                FROM game_room_players
                WHERE room_id = $1
                `,
                [
                    roomData.id
                ]
            );


        if (
            Number(
                count.rows[0].count
            ) >=
            roomData.max_players
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Room is full"
            });
        }


        const existing =
            await pool.query(
                `
                SELECT *
                FROM game_room_players
                WHERE room_id = $1
                AND player_id = $2
                `,
                [
                    roomData.id,
                    req.player.id
                ]
            );


        if (
            existing.rows.length === 0
        ) {

            const seats =
                await pool.query(
                    `
                    SELECT seat
                    FROM game_room_players
                    WHERE room_id = $1
                    ORDER BY seat
                    `,
                    [
                        roomData.id
                    ]
                );

            const used =
                seats.rows.map(
                    x => x.seat
                );

            let seat = 0;

            while (
                used.includes(seat)
            ) {
                seat++;
            }


            await pool.query(
                `
                INSERT INTO game_room_players
                (
                    room_id,
                    player_id,
                    seat
                )

                VALUES
                ($1,$2,$3)
                `,
                [
                    roomData.id,
                    req.player.id,
                    seat
                ]
            );
        }


        const players =
            await pool.query(
                `
                SELECT COUNT(*)
                FROM game_room_players
                WHERE room_id = $1
                `,
                [
                    roomData.id
                ]
            );


        if (
            Number(
                players.rows[0].count
            ) >=
            roomData.max_players
        ) {

            await pool.query(
                `
                UPDATE game_rooms

                SET status = 'ready'

                WHERE id = $1
                `,
                [
                    roomData.id
                ]
            );
        }


        const data =
            await getRoom(
                code
            );


        broadcastRoom(
            code,
            {

                type:
                    "room_update",

                room:
                    data
            }
        );


        res.json({

            success: true,

            room:
                data
        });
    }
);


/* =========================================================
   GET ROOM
========================================================= */

app.get(
    "/api/game/:code",
    authMiddleware,
    async (req, res) => {

        const room =
            await getRoom(
                req.params.code
                    .toUpperCase()
            );


        if (!room) {

            return res.status(404).json({

                success: false,

                error:
                    "Room not found"
            });
        }


        res.json({

            success: true,

            room
        });
    }
);


/* =========================================================
   START GAME
========================================================= */

app.post(
    "/api/game/start",
    authMiddleware,
    async (req, res) => {

        const code =
            String(
                req.body.code
            )
            .toUpperCase();


        const room =
            await pool.query(
                `
                SELECT *
                FROM game_rooms
                WHERE code = $1
                `,
                [
                    code
                ]
            );


        if (
            room.rows.length === 0
        ) {

            return res.status(404).json({

                success: false,

                error:
                    "Room not found"
            });
        }


        if (
            Number(
                room.rows[0].host_player_id
            ) !==
            Number(
                req.player.id
            )
        ) {

            return res.status(403).json({

                success: false,

                error:
                    "Only host can start game"
            });
        }


        const players =
            await pool.query(
                `
                SELECT *
                FROM game_room_players

                WHERE room_id = $1

                ORDER BY seat
                `,
                [
                    room.rows[0].id
                ]
            );


        if (
            players.rows.length <
            2
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Need at least 2 players"
            });
        }


        const state = {

            phase:
                "dealing",

            players:
                players.rows.map(
                    p => ({
                        playerId:
                            p.player_id,

                        seat:
                            p.seat,

                        hand: []
                    })
                ),

            deck: [],

            table: [],

            trump: null,

            currentTurn:
                0,

            winner:
                null
        };


        await pool.query(
            `
            UPDATE game_rooms

            SET status = 'playing',
                started_at = NOW()

            WHERE id = $1
            `,
            [
                room.rows[0].id
            ]
        );


        const match =
            await pool.query(
                `
                INSERT INTO game_matches
                (
                    room_id,
                    game_type,
                    state,
                    current_turn
                )

                VALUES
                ($1,'durak',$2,$3)

                RETURNING *
                `,
                [
                    room.rows[0].id,
                    JSON.stringify(
                        state
                    ),
                    0
                ]
            );


        broadcastRoom(
            code,
            {

                type:
                    "game_started",

                matchId:
                    match.rows[0].id
            }
        );


        res.json({

            success: true,

            match:
                match.rows[0]
        });
    }
);


/* =========================================================
   MATCH STATE
========================================================= */

app.get(
    "/api/game/match/:id",
    authMiddleware,
    async (req, res) => {

        const result =
            await pool.query(
                `
                SELECT *
                FROM game_matches
                WHERE id = $1
                `,
                [
                    req.params.id
                ]
            );


        if (
            result.rows.length === 0
        ) {

            return res.status(404).json({

                success: false,

                error:
                    "Match not found"
            });
        }


        res.json({

            success: true,

            match:
                result.rows[0]
        });
    }
);


/* =========================================================
   WEBSOCKET
========================================================= */

const server =
    app.listen(
        PORT,
        () => {

            console.log(
                `Heavy Lux Card backend running on port ${PORT}`
            );
        }
    );


const wss =
    new WebSocketServer({
        server,
        path: "/ws"
    });


const sockets =
    new Map();


function sendSocket(
    ws,
    data
) {

    if (
        ws.readyState === 1
    ) {

        ws.send(
            JSON.stringify(
                data
            )
        );
    }
}


function broadcastRoom(
    code,
    data
) {

    const roomSockets =
        sockets.get(
            code
        );

    if (!roomSockets) {
        return;
    }

    for (
        const ws
        of roomSockets
    ) {

        sendSocket(
            ws,
            data
        );
    }
}


wss.on(
    "connection",
    async (
        ws,
        request
    ) => {

        try {

            const url =
                new URL(
                    request.url,
                    `http://${request.headers.host}`
                );


            const token =
                url.searchParams.get(
                    "token"
                );

            const roomCode =
                url.searchParams.get(
                    "room"
                );


            if (
                !token ||
                !roomCode
            ) {

                ws.close(
                    1008,
                    "Authorization required"
                );

                return;
            }


            const decoded =
                verifyToken(
                    token
                );


            const playerResult =
                await pool.query(
                    `
                    SELECT *
                    FROM players
                    WHERE id = $1
                    `,
                    [
                        decoded.playerId
                    ]
                );


            if (
                playerResult.rows.length === 0
            ) {

                ws.close(
                    1008,
                    "Player not found"
                );

                return;
            }


            const room =
                await getRoom(
                    roomCode.toUpperCase()
                );


            if (!room) {

                ws.close(
                    1008,
                    "Room not found"
                );

                return;
            }


            const code =
                roomCode.toUpperCase();


            if (
                !sockets.has(code)
            ) {

                sockets.set(
                    code,
                    new Set()
                );
            }


            sockets
                .get(code)
                .add(ws);


            ws.playerId =
                decoded.playerId;

            ws.roomCode =
                code;


            sendSocket(
                ws,
                {

                    type:
                        "connected",

                    playerId:
                        decoded.playerId,

                    room
                }
            );


            broadcastRoom(
                code,
                {

                    type:
                        "player_connected",

                    playerId:
                        decoded.playerId
                }
            );


            ws.on(
                "message",
                async raw => {

                    try {

                        const message =
                            JSON.parse(
                                raw.toString()
                            );


                        /*
                         * Пока мы не разрешаем
                         * клиенту самостоятельно
                         * менять игровую экономику.
                         *
                         * Клиент только отправляет
                         * игровые действия.
                         */


                        if (
                            message.type ===
                            "ping"
                        ) {

                            sendSocket(
                                ws,
                                {
                                    type:
                                        "pong"
                                }
                            );

                            return;
                        }


                        if (
                            message.type ===
                            "game_action"
                        ) {

                            await handleGameAction(
                                ws,
                                message
                            );

                            return;
                        }


                        sendSocket(
                            ws,
                            {

                                type:
                                    "error",

                                error:
                                    "Unknown message type"
                            }
                        );

                    } catch (error) {

                        sendSocket(
                            ws,
                            {

                                type:
                                    "error",

                                error:
                                    "Invalid message"
                            }
                        );
                    }
                }
            );


            ws.on(
                "close",
                () => {

                    const set =
                        sockets.get(
                            code
                        );

                    if (set) {

                        set.delete(ws);

                        if (
                            set.size === 0
                        ) {

                            sockets.delete(
                                code
                            );
                        }
                    }


                    broadcastRoom(
                        code,
                        {

                            type:
                                "player_disconnected",

                            playerId:
                                decoded.playerId
                        }
                    );
                }
            );

        } catch (error) {

            console.error(
                "WebSocket error:",
                error
            );

            ws.close(
                1011,
                "Server error"
            );
        }
    }
);


/* =========================================================
   GAME ACTION
========================================================= */

async function handleGameAction(
    ws,
    message
) {

    const matchId =
        message.matchId;

    const action =
        message.action;

    const payload =
        message.payload ||
        {};


    if (!matchId) {

        sendSocket(
            ws,
            {

                type:
                    "error",

                error:
                    "matchId required"
            }
        );

        return;
    }


    const result =
        await pool.query(
            `
            SELECT *
            FROM game_matches
            WHERE id = $1
            `,
            [
                matchId
            ]
        );


    if (
        result.rows.length === 0
    ) {

        sendSocket(
            ws,
            {

                type:
                    "error",

                error:
                    "Match not found"
            }
        );

        return;
    }


    const match =
        result.rows[0];


    const room =
        await pool.query(
            `
            SELECT *
            FROM game_room_players
            WHERE room_id = $1
            AND player_id = $2
            `,
            [
                match.room_id,
                ws.playerId
            ]
        );


    if (
        room.rows.length === 0
    ) {

        sendSocket(
            ws,
            {

                type:
                    "error",

                error:
                    "You are not in this game"
            }
        );

        return;
    }


    /*
     * Сейчас действие сохраняется
     * в журнал.
     *
     * Следующим этапом сюда
     * подключаем полноценную
     * механику Дурака:
     *
     * attack
     * defend
     * throw
     * take
     * pass
     * finish
     */

    await pool.query(
        `
        INSERT INTO game_moves
        (
            match_id,
            player_id,
            action,
            payload
        )

        VALUES
        ($1,$2,$3,$4)
        `,
        [
            matchId,
            ws.playerId,
            action,
            JSON.stringify(
                payload
            )
        ]
    );


    broadcastRoom(
        ws.roomCode,
        {

            type:
                "game_action",

            matchId,

            playerId:
                ws.playerId,

            action,

            payload
        }
    );
}


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            error
        );

        res.status(500).json({

            success: false,

            error:
                "Internal server error"
        });
    }
);


/* =========================================================
   SHUTDOWN
========================================================= */

process.on(
    "SIGTERM",
    async () => {

        console.log(
            "SIGTERM received"
        );

        await pool.end();

        process.exit(0);
    }
);
