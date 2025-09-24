const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const axios = require('axios');
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
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          calories REAL,
          protein REAL,
          carbs REAL,
          fat REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          date DATE DEFAULT (DATE('now')),
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
  const usdaApiKey = process.env.USDA_API_KEY || '';
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

// Helper to get nutrition data from USDA
const getNutritionData = async (foodName, quantity, unit) => {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.warn('USDA_API_KEY not set. Nutritional data will be null.');
    return { calories: null, protein: null, carbs: null, fat: null };
  }

  try {
    // The USDA API works best with simple food names.
    // We'll use the food name as the query.
    const query = `${quantity} ${unit} ${foodName}`;
    const usdaResponse = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
      params: {
        api_key: apiKey,
        query: foodName,
        pageSize: 1, // Get the most relevant food
      },
    });

    if (!usdaResponse.data.foods || usdaResponse.data.foods.length === 0) {
      console.warn(`USDA API returned no food matches for query: "${foodName}"`);
      return { calories: null, protein: null, carbs: null, fat: null };
    }

    const food = usdaResponse.data.foods[0];
    const nutrients = {};
    
    // Nutrient IDs for common nutrients
    const nutrientMap = {
      '208': 'calories', // Energy in kcal
      '203': 'protein',  // Protein
      '205': 'carbs',    // Carbohydrate, by difference
      '204': 'fat',      // Total lipid (fat)
    };

    food.foodNutrients.forEach(n => {
      if (nutrientMap[n.nutrientId]) {
        nutrients[nutrientMap[n.nutrientId]] = n.value;
      }
    });

    // The API returns values per 100g. We need to adjust for the user's quantity.
    // This is a simplification; accurate conversion between units (e.g., cups to grams) is complex.
    const servingSize = 100; // USDA data is per 100g/100ml
    let multiplier = 1;

    if (unit.toLowerCase() === 'grams' || unit.toLowerCase() === 'g') {
      // If unit is grams, scale based on the 100g standard
      multiplier = parseFloat(quantity) / servingSize;
    } else {
      // For other units ('servings', 'pieces', etc.), assume the API's 100g value is a reasonable default for one serving/piece.
      // Then, multiply by the number of servings the user entered.
      multiplier = parseFloat(quantity);
    }

    // Round the results to 2 decimal places to avoid floating point inaccuracies
    return {
      calories: parseFloat(((nutrients.calories || 0) * multiplier).toFixed(2)),
      protein: parseFloat(((nutrients.protein || 0) * multiplier).toFixed(2)),
      carbs: parseFloat(((nutrients.carbs || 0) * multiplier).toFixed(2)),
      fat: parseFloat(((nutrients.fat || 0) * multiplier).toFixed(2)),
    };
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.error('CRITICAL: USDA API request failed with 403 Forbidden. This almost always means the USDA_API_KEY is missing or invalid in your environment variables.');
    }
    console.error('Error fetching from USDA API:', error.message);
    return { calories: null, protein: null, carbs: null, fat: null };
  }
};

// Add a food log entry
app.post('/api/food-log', async (req, res) => {
  const { food_name, quantity, unit } = req.body || {};

  if (!food_name || !quantity || !unit) {
    return res.status(400).json(makeError('VALIDATION_ERROR', 'food_name is required', {
      details: { fields: ['food_name', 'quantity', 'unit'], reason: 'required' },
    }));
  }

  try {
    // Fetch nutritional data
    const nutrition = await getNutritionData(food_name, quantity, unit);

    const result = await runExecute(
      `INSERT INTO food_logs (food_name, quantity, unit, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [food_name, quantity, unit, nutrition.calories, nutrition.protein, nutrition.carbs, nutrition.fat]
    );
    return res.status(201).json(makeSuccess('Food log created', { id: result.lastID }));
  } catch (e) {
    return res.status(500).json(makeError('DB_ERROR', 'Failed to create food log', { details: e.message }));
  }
});

// Example: list food logs
app.get('/api/food-log', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM food_logs ORDER BY timestamp DESC LIMIT 100');
    return res.status(200).json(makeSuccess('Food logs fetched', { items: rows }));
  } catch (e) {
    return res.status(500).json(makeError('DB_ERROR', 'Failed to fetch food logs', { details: e.message }));
  }
});

// Get daily summary
app.get('/api/daily-summary', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const rows = await runQuery(
      `SELECT 
        SUM(calories) as total_calories,
        SUM(protein) as total_protein,
        SUM(carbs) as total_carbs,
        SUM(fat) as total_fat,
        COUNT(*) as food_count
      FROM food_logs WHERE date = ?`,
      [today]
    );

    const foodItems = await runQuery(
      `SELECT food_name as name, quantity, unit FROM food_logs WHERE date = ? ORDER BY timestamp DESC`,
      [today]
    );

    const summary = rows[0] || {};
    summary.foods = foodItems;

    return res.status(200).json(makeSuccess('Daily summary fetched', summary));
  } catch (e) {
    return res.status(500).json(makeError('DB_ERROR', 'Failed to fetch daily summary', { details: e.message }));
  }
});

// Mock chat endpoint
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  res.json({ response: `I received your message: "${message}". I am a mock assistant.` });
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
});
