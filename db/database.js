const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'patent-royalty.db');
const schemaPath = path.join(__dirname, 'schema.sql');

function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
    });

    db.serialize(() => {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schema, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('Database schema initialized');
        resolve(db);
      });
    });
  });
}

function getDatabase() {
  return new sqlite3.Database(dbPath);
}

module.exports = { initDatabase, getDatabase };
