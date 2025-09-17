import os
import sqlite3

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "instance", "users.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# create users table
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL
)
""")

conn.commit()
conn.close()

print(f"✅ Database initialized at: {DB_PATH}")
