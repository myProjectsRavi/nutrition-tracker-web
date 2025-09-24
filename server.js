const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const nlp = require('compromise');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Standardized success/error helpers
const makeError = (code, message, options = {}) => ({
  success: false,
  error: code,
  message,
  details: options.details || null,
  meta: options.meta || null,
  timestamp: new Date().toISOString(),
});

const makeSuccess = (message, data = {}, meta = null) => ({
  success: true,
  message,
  data,
  meta,
  timestamp: new Date().toISOString(),
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

// Initialize SQLite Database
const db = new sqlite3.Database('./nutrition.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    // Ensure sequential execution of setup queries
    db.serialize(() => {
      // Create tables if they don't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS food_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          food_name TEXT NOT NULL,
          calories REAL,
          protein REAL,
          carbs REAL,
          fat REAL,
          quantity REAL DEFAULT 1,
          log_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `);
    });
  }
});

// Utility: run DB query returning promise
const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

const runExecute = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve({ changes: this.changes, lastID: this.lastID });
  });
});

// Health check: also verify USDA API connectivity
app.get('/health', async (req, res) => {
  const usdaApiKey = process.env.USDA_API_KEY || process.env.FOOD_API_KEY || '';
  let usdaStatus = { reachable: false, ok: false, status: null, error: null };

  try {
    // lightweight USDA test request (example: FoodData Central search endpoint)
    const url = 'https://api.nal.usda.gov/fdc/v1/foods/search';
    const resp = await axios.get(url, {
      params: { query: 'apple', pageSize: 1, api_key: usdaApiKey },
      timeout: 4000,
    });
    usdaStatus.reachable = true;
    usdaStatus.status = resp.status;
    usdaStatus.ok = resp.status >= 200 && resp.status < 300;
  } catch (e) {
    usdaStatus.status = e.response?.status || null;
    usdaStatus.error = e.message;
    // Consider reachable if we got a response, even if not 2xx
    if (e.response) usdaStatus.reachable = true;
  }

  // quick DB check
  let dbOk = true;
  try {
    await runQuery('SELECT 1 as ok');
  } catch (e) {
    dbOk = false;
  }

  return res.status(200).json(makeSuccess('Service health status', {
    server: 'ok',
    db: dbOk ? 'ok' : 'error',
    usda: usdaStatus,
  }));
});

// Example: add food log (ensure structured validation errors)
app.post('/api/food-logs', async (req, res) => {
  const { user_id, food_name, calories = null, protein = null, carbs = null, fat = null, quantity = 1 } = req.body || {};

  if (!food_name) {
    return res.status(400).json(makeError('VALIDATION_ERROR', 'food_name is required', {
      details: { field: 'food_name', reason: 'required' },
    }));
  }

  try {
    const result = await runExecute(
      `INSERT INTO food_logs (user_id, food_name, calories, protein, carbs, fat, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id || null, food_name, calories, protein, carbs, fat, quantity]
    );
    return res.status(201).json(makeSuccess('Food log created', { id: result.lastID }));
  } catch (e) {
    return res.status(500).json(makeError('DB_ERROR', 'Failed to create food log', { details: e.message }));
  }
});

// Example: list food logs
app.get('/api/food-logs', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM food_logs ORDER BY log_date DESC LIMIT 100');
    return res.status(200).json(makeSuccess('Food logs fetched', { items: rows }));
  } catch (e) {
    return res.status(500).json(makeError('DB_ERROR', 'Failed to fetch food logs', { details: e.message }));
  }
});

// Clear logs helper
const clearFoodLogs = () => new Promise((resolve, reject) => {
  const started = new Date().toISOString();
  db.run('DELETE FROM food_logs', [], function (err) {
    if (err) {
      return reject({ error: 'DB_ERROR', message: 'Failed to clear food logs', details: err.message, timestamp: new Date().toISOString() });
    }
    const result = { rowsDeleted: this.changes, timestamp: new Date().toISOString(), startedAt: started };
    resolve(result);
  });
});

// Schedule daily clearing of food_logs at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running scheduled task: clearing food logs at midnight');
  try {
    await clearFoodLogs();
    console.log('Scheduled food logs clearing completed successfully');
  } catch (error) {
    console.error('Scheduled food logs clearing failed:', error);
  }
}, { timezone: 'UTC' });

// API endpoint for manual clearing of food logs
app.post('/api/clear-logs', async (req, res) => {
  try {
    console.log('Manual clear-logs request received');
    const result = await clearFoodLogs();
    res.status(200).json(makeSuccess('Food logs cleared successfully', { rowsDeleted: result.rowsDeleted, clearedAt: result.timestamp }));
  } catch (error) {
    console.error('Manual clear-logs failed:', error);
    res.status(500).json(makeError(error.error || 'CLEAR_LOGS_ERROR', error.message || 'Failed to clear food logs', { details: error.details || 'Unknown error occurred' }));
  }
});

// Catch-all route for SPA - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

// Global 404 for unknown routes
app.use((req, res) => {
  return res.status(404).json(makeError('NOT_FOUND', 'Route not found'));
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  return res.status(status).json(makeError('INTERNAL_ERROR', 'An unexpected error occurred', { details: err.message || err }));
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('Food logs will be automatically cleared daily at midnight UTC');
});
