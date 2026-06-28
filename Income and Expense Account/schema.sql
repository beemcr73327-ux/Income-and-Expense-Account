DROP TABLE IF EXISTS transactions;

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,          -- e.g., '2023-10-25'
    type TEXT NOT NULL,          -- 'รายรับ', 'รายจ่าย', 'เงินออม/ลงทุน'
    category TEXT NOT NULL,      -- e.g., 'เงินเดือน', 'อาหาร', 'เดินทาง'
    amount REAL NOT NULL,        -- e.g., 150.0
    note TEXT,                   -- optional notes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);

-- Create a table to cache budget config from Google Sheets
DROP TABLE IF EXISTS budget_config;

CREATE TABLE budget_config (
    category TEXT PRIMARY KEY,
    limit_amount REAL NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
