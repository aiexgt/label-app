-- Drop tables if they exist (for clean initialization)
DROP TABLE IF EXISTS global_payments CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS labels CASCADE;
DROP TABLE IF EXISTS printers CASCADE;
DROP TABLE IF EXISTS qualities CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS status_enum CASCADE;

-- Create ENUM for order status
CREATE TYPE status_enum AS ENUM ('pendiente', 'imprimiendo', 'impreso', 'cortando', 'terminado', 'entregado');

-- Create Tables
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE qualities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE printers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50)
);

CREATE TABLE labels (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    height NUMERIC(10,2) NOT NULL,
    width NUMERIC(10,2) NOT NULL,
    image_path VARCHAR(255),
    word_path VARCHAR(255),
    pdf_path VARCHAR(255),
    quality_id INTEGER REFERENCES qualities(id) ON DELETE SET NULL,
    qty_per_sheet INTEGER NOT NULL DEFAULT 1,
    paper_type VARCHAR(50) DEFAULT 'Matte',
    tags VARCHAR(255),
    printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    label_id INTEGER REFERENCES labels(id) ON DELETE CASCADE,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    quantity INTEGER NOT NULL,
    total_sheets INTEGER NOT NULL,
    status status_enum DEFAULT 'pendiente',
    observations TEXT,
    operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Admin User
-- Password is 'LabelAdmin2026!' (hashed with bcrypt, 10 rounds)
INSERT INTO users (username, password_hash, is_admin)
VALUES ('admin', '$2b$10$sUHPKWZ3rULGtKems6M4Y.5cVYrI8FI3It8JISCvgf.7QaLthHAYu', TRUE);

-- Sample Data (Solo Calidades Base)
INSERT INTO qualities (name) VALUES ('Premium'), ('Standard');
