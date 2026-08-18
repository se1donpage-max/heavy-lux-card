-- =========================================================
-- HEAVY LUX CARD
-- DATABASE SCHEMA
-- =========================================================

BEGIN;

-- =========================================================
-- PLAYERS
-- =========================================================

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

CREATE INDEX IF NOT EXISTS idx_players_telegram_id
ON players(telegram_id);


-- =========================================================
-- CARS CATALOG
-- =========================================================

CREATE TABLE IF NOT EXISTS cars_catalog (
    id TEXT PRIMARY KEY,

    brand TEXT NOT NULL,
    model TEXT NOT NULL,

    price NUMERIC(20,2) NOT NULL,

    stock INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- PLAYER CARS
-- =========================================================

CREATE TABLE IF NOT EXISTS player_cars (
    id BIGSERIAL PRIMARY KEY,

    player_id BIGINT NOT NULL
        REFERENCES players(id)
        ON DELETE CASCADE,

    catalog_id TEXT NOT NULL
        REFERENCES cars_catalog(id),

    color_id TEXT NOT NULL,

    number TEXT DEFAULT 'Не на учете',

    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_cars_player
ON player_cars(player_id);


-- =========================================================
-- PROPERTIES CATALOG
-- =========================================================

CREATE TABLE IF NOT EXISTS properties_catalog (
    id TEXT PRIMARY KEY,

    name TEXT NOT NULL,

    price NUMERIC(20,2) NOT NULL,

    garage INTEGER NOT NULL DEFAULT 0,

    rent NUMERIC(20,2) NOT NULL DEFAULT 0
);


-- =========================================================
-- PLAYER PROPERTIES
-- =========================================================

CREATE TABLE IF NOT EXISTS player_properties (
    id BIGSERIAL PRIMARY KEY,

    player_id BIGINT NOT NULL
        REFERENCES players(id)
        ON DELETE CASCADE,

    property_id TEXT NOT NULL
        REFERENCES properties_catalog(id),

    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_properties_player
ON player_properties(player_id);


-- =========================================================
-- BUSINESSES CATALOG
-- =========================================================

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


-- =========================================================
-- PLAYER BUSINESSES
-- =========================================================

CREATE TABLE IF NOT EXISTS player_businesses (
    id BIGSERIAL PRIMARY KEY,

    player_id BIGINT NOT NULL
        REFERENCES players(id)
        ON DELETE CASCADE,

    business_id TEXT NOT NULL
        REFERENCES businesses_catalog(id),

    level INTEGER NOT NULL DEFAULT 1,

    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(player_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_player_businesses_player
ON player_businesses(player_id);


-- =========================================================
-- GAME ROOMS
-- =========================================================

CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code TEXT UNIQUE NOT NULL,

    host_player_id BIGINT NOT NULL
        REFERENCES players(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'waiting',

    max_players INTEGER NOT NULL DEFAULT 2,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    started_at TIMESTAMPTZ,

    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_status
ON game_rooms(status);


-- =========================================================
-- GAME ROOM PLAYERS
-- =========================================================

CREATE TABLE IF NOT EXISTS game_room_players (
    id BIGSERIAL PRIMARY KEY,

    room_id UUID NOT NULL
        REFERENCES game_rooms(id)
        ON DELETE CASCADE,

    player_id BIGINT NOT NULL
        REFERENCES players(id)
        ON DELETE CASCADE,

    seat INTEGER NOT NULL,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(room_id, player_id),
    UNIQUE(room_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_game_room_players_room
ON game_room_players(room_id);


-- =========================================================
-- GAME MATCHES
-- =========================================================

CREATE TABLE IF NOT EXISTS game_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    room_id UUID NOT NULL
        REFERENCES game_rooms(id)
        ON DELETE CASCADE,

    game_type TEXT NOT NULL DEFAULT 'durak',

    state JSONB NOT NULL DEFAULT '{}'::jsonb,

    current_turn INTEGER,

    winner_player_id BIGINT
        REFERENCES players(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    finished_at TIMESTAMPTZ
);


-- =========================================================
-- GAME MOVES
-- =========================================================

CREATE TABLE IF NOT EXISTS game_moves (
    id BIGSERIAL PRIMARY KEY,

    match_id UUID NOT NULL
        REFERENCES game_matches(id)
        ON DELETE CASCADE,

    player_id BIGINT NOT NULL
        REFERENCES players(id),

    action TEXT NOT NULL,

    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_moves_match
ON game_moves(match_id);


-- =========================================================
-- SEED CARS
-- =========================================================

INSERT INTO cars_catalog
(id, brand, model, price, stock)
VALUES
('mercedes-s', 'Mercedes-Benz', 'S-Class', 15000000, 20),
('bmw-7', 'BMW', '7 Series', 13000000, 20),
('range-rover', 'Range Rover', 'Autobiography', 18000000, 15),
('porsche-911', 'Porsche', '911', 22000000, 12),
('bentley', 'Bentley', 'Continental GT', 30000000, 10),
('rolls-royce', 'Rolls-Royce', 'Ghost', 50000000, 5)
ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- SEED PROPERTIES
-- =========================================================

INSERT INTO properties_catalog
(id, name, price, garage, rent)
VALUES
('small-flat', 'Небольшая квартира', 5000000, 1, 5000),
('business-flat', 'Бизнес-класс', 15000000, 2, 18000),
('penthouse', 'Пентхаус', 40000000, 4, 55000),
('mansion', 'Особняк', 100000000, 8, 150000)
ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- SEED BUSINESSES
-- =========================================================

INSERT INTO businesses_catalog
(id, name, category, price, global_limit, base_income, expenses, max_level)
VALUES
('tobacco', 'Табачный магазин', 'Розничная торговля', 3000000, 500, 22000, 7000, 5),

('shop24', 'Магазин 24/7', 'Розничная торговля', 7000000, 300, 48000, 15000, 5),

('pharmacy', 'Аптека', 'Медицина', 12000000, 200, 78000, 27000, 5),

('carwash', 'Автомойка', 'Автомобильный бизнес', 18000000, 150, 115000, 40000, 5),

('service', 'СТО', 'Автомобильный бизнес', 35000000, 100, 210000, 75000, 5),

('restaurant', 'Ресторан', 'Общепит', 50000000, 80, 320000, 125000, 5),

('nightclub', 'Ночной клуб', 'Развлечения', 90000000, 50, 550000, 230000, 5),

('logistics', 'Логистическая компания', 'Логистика', 180000000, 30, 1100000, 500000, 5),

('bank', 'Частный банк', 'Финансы', 500000000, 10, 3200000, 1600000, 5),

('factory', 'Промышленный завод', 'Промышленность', 1000000000, 5, 7000000, 3700000, 5),

('oil-refinery', 'НПЗ', 'Нефтегаз', 5000000000, 2, 30000000, 17000000, 5)

ON CONFLICT (id) DO NOTHING;


COMMIT;
