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
// Health check: verify Open Food Facts API connectivity
app.get('/health', async (req, res) => {
  let offStatus = { reachable: false, ok: false, status: null, error: null };
  try {
    // Test Open Food Facts API (completely free, no API key required)
    const url = 'https://world.openfoodfacts.org/api/v2/search';
    const resp = await axios.get(url, {
      params: { 
        categories_tags: 'fruits',
        fields: 'product_name,nutriments',
        page_size: 1
      },
      timeout: 4000,
    });
    offStatus.reachable = true;
    offStatus.status = resp.status;
    offStatus.ok = resp.status >= 200 && resp.status < 300;
  } catch (e) {
    offStatus.status = e.response?.status || null;
    offStatus.error = e.message;
    // Consider reachable if we got a response, even if not 2xx
    if (e.response) offStatus.reachable = true;
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
    openFoodFacts: offStatus,
  }));
});
// Helper to safely read numbers
const n = (v) => (v === undefined || v === null || isNaN(Number(v)) ? undefined : Number(v));
// Helper to get nutrition data from Open Food Facts API (completely free!)
const getNutritionData = async (foodName, quantity, unit) => {
  try {
    console.log(`Searching for nutrition data for: ${foodName}`);
    // Search for food in Open Food Facts database
    const searchResponse = await axios.get('https://world.openfoodfacts.org/api/v2/search', {
      params: {
        q: foodName,
        fields: 'product_name,nutriments',
        page_size: 5, // Get top 5 matches
        json: 1
      },
      timeout: 10000,
    });
    if (!searchResponse.data.products || searchResponse.data.products.length === 0) {
      console.warn(`Open Food Facts API returned no matches for: "${foodName}"`);
      return { calories: null, protein: null, carbs: null, fat: null };
    }
    // Get the first product that has nutrition data
    let selectedProduct = null;
    for (const product of searchResponse.data.products) {
      if (product.nutriments && Object.keys(product.nutriments).length > 0) {
        selectedProduct = product;
        break;
      }
    }
    if (!selectedProduct) {
      console.warn(`No product with nutrition data found for: "${foodName}"`);
      return { calories: null, protein: null, carbs: null, fat: null };
    }
    const nutriments = selectedProduct.nutriments || {};
    console.log(`Found nutrition data for: ${selectedProduct.product_name}`);
    // Build calories (kcal) with robust fallbacks and kJ->kcal conversion (1 kcal = 4.184 kJ)
    let kcal = n(nutriments['energy-kcal_100g'])
      ?? n(nutriments['energy-kcal'])
      ?? n(nutriments['energy_100g']) // often kJ
      ?? n(nutriments['energy']);
    // If we only have energy in kJ, convert to kcal
    if ((kcal === undefined || kcal === 0) && (n(nutriments['energy-kj_100g']) ?? n(nutriments['energy-kj'])) !== undefined) {
      const kj = n(nutriments['energy-kj_100g']) ?? n(nutriments['energy-kj']);
      if (kj !== undefined) kcal = kj / 4.184;
    }
    // If energy_100g is actually in kJ (common), convert
    if (kcal !== undefined && kcal > 0 && n(nutriments['energy-kcal_100g']) === undefined && n(nutriments['energy-kcal']) === undefined) {
      // Heuristic: if no kcal fields but we have energy, assume it's kJ
      // Convert kJ to kcal
      kcal = kcal / 4.184;
    }
    // Protein, carbs, fat with fallbacks
    const proteinPer100 = n(nutriments['proteins_100g']) ?? n(nutriments['proteins']) ?? n(nutriments['protein_100g']) ?? n(nutriments['protein']) ?? 0;
    const carbsPer100 = n(nutriments['carbohydrates_100g']) ?? n(nutriments['carbohydrates']) ?? n(nutriments['carbs_100g']) ?? n(nutriments['carbs']) ?? 0;
    const fatPer100 = n(nutriments['fat_100g']) ?? n(nutriments['fat']) ?? n(nutriments['fats_100g']) ?? n(nutriments['fats']) ?? 0;
    const caloriesPer100 = (kcal === undefined || isNaN(kcal)) ? 0 : kcal;
    // Calculate nutrition values based on user's quantity and unit
    let multiplier = 1;
    const qty = parseFloat(quantity) || 0;
    const unitLower = String(unit || '').toLowerCase();
    // Convert different units to grams for calculation
    if (unitLower.includes('g') || unitLower === 'grams' || unitLower === 'gram') {
      multiplier = qty / 100;
    } else if (unitLower.includes('kg') || unitLower === 'kilograms' || unitLower === 'kilogram') {
      multiplier = (qty * 1000) / 100;
    } else if (unitLower.includes('oz') || unitLower === 'ounces' || unitLower === 'ounce') {
      multiplier = (qty * 28.35) / 100;
    } else if (unitLower.includes('lb') || unitLower.includes('pound')) {
      multiplier = (qty * 453.592) / 100;
    } else if (unitLower.includes('ml')) {
      // assume density ~ water 1g/ml as a reasonable fallback
      multiplier = qty / 100;
    } else if (unitLower.includes('l') || unitLower === 'liter' || unitLower === 'litre') {
      multiplier = (qty * 1000) / 100;
    } else {
      // For other units (pieces, servings, cups, etc.), assume qty represents servings
      // and use a reasonable serving size (e.g., 100g per serving)
      multiplier = qty;
    }
    // Calculate final nutrition values and round to 2 decimal places
    const finalNutrition = {
      calories: parseFloat((caloriesPer100 * multiplier).toFixed(2)),
      protein: parseFloat((proteinPer100 * multiplier).toFixed(2)),
      carbs: parseFloat((carbsPer100 * multiplier).toFixed(2)),
      fat: parseFloat((fatPer100 * multiplier).toFixed(2)),
    };
    console.log(`Calculated nutrition for ${qty} ${unit} of ${foodName}:`, finalNutrition);
    return finalNutrition;
  } catch (error) {
    console.error('Error fetching from Open Food Facts API:', error.message);
    // Return null values but don't fail the request
    return { calories: null, protein: null, carbs: null, fat: null };
  }
};
// Add a food log entry
app.post('/api/food-log', async (req, res) => {
  const { food_name, quantity, unit } = req.body || {};
  if (!food_name || !quantity || !unit) {
    return res.status(400).json(makeError('VALIDATION_ERROR', 'Missing required fields', {
      details: { fields: ['food_name', 'quantity', 'unit'], reason: 'required' },
    }));
  }
  try {
    // Fetch nutritional data from Open Food Facts
    const nutrition = await getNutritionData(food_name, quantity, unit);
    const result = await runExecute(
      `INSERT INTO food_logs (food_name, quantity, unit, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [food_name, quantity, unit, nutrition.calories, nutrition.protein, nutrition.carbs, nutrition.fat]
    );
    return res.status(201).json(makeSuccess('Food log created successfully', { 
      id: result.lastID,
      nutrition: nutrition
    }));
  } catch (e) {
    console.error('Database error:', e.message);
    return res.status(500).json(makeError('DB_ERROR', 'Failed to create food log', { details: e.message }));
  }
});
// List food logs
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
      `SELECT food_name as name, quantity, unit, calories, protein, carbs, fat FROM food_logs WHERE date = ? ORDER BY timestamp DESC`,
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
  console.log('Using Open Food Facts API (completely free, no API key required)');
});
