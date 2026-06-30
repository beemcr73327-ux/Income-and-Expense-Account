DROP TABLE IF EXISTS transactions;

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    saving_type TEXT, -- สำหรับหมวดออมเงิน (ซื้อ, ขาย, ออม, spend)
    saving_group TEXT, -- สำหรับกลุ่มของออมเงิน
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);

-- ตารางเก็บหมวดหมู่และงบประมาณที่ดึงมาจาก Google Sheets
DROP TABLE IF EXISTS sync_data;
CREATE TABLE sync_data (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL, -- เก็บเป็น JSON string
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);