const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Initialize SQLite Database
const db = new sqlite3.Database('./nutrition.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');

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
      CREATE TABLE IF NOT EXISTS foods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT,
        serving_size REAL,
        serving_unit TEXT,
        calories REAL,
        protein REAL,
        carbs REAL,
        fat REAL,
        fiber REAL,
        sugar REAL,
        sodium REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date DATE NOT NULL DEFAULT (DATE('now')),
        meal_type TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS food_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        diary_entry_id INTEGER,
        food_id INTEGER,
        food_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        calories REAL,
        protein REAL,
        carbs REAL,
        fat REAL,
        fiber REAL,
        sugar REAL,
        sodium REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        date DATE DEFAULT (DATE('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (diary_entry_id) REFERENCES diary_entries(id),
        FOREIGN KEY (food_id) REFERENCES foods(id)
      )
    `);

    // Insert default user if not exists
    db.run(`
      INSERT OR IGNORE INTO users (id, name, email, password)
      VALUES (1, 'Default User', 'user@example.com', 'changeme')
    `);
  }
});

// Helper function to get nutrition data from USDA API
async function getNutritionData(foodName) {
  try {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      console.log('USDA API key not found, using default nutritional values');
      return getDefaultNutrition(foodName);
    }

    const response = await axios.get(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(foodName)}&api_key=${apiKey}&pageSize=1`
    );

    if (response.data.foods && response.data.foods.length > 0) {
      const food = response.data.foods[0];
      const nutrients = food.foodNutrients;

      return {
        calories: findNutrient(nutrients, 'Energy') || 50,
        protein: findNutrient(nutrients, 'Protein') || 2,
        carbs: findNutrient(nutrients, 'Carbohydrate') || 10,
        fat: findNutrient(nutrients, 'Total lipid') || 1,
        fiber: findNutrient(nutrients, 'Fiber') || 1,
        sugar: findNutrient(nutrients, 'Sugars') || 2,
        sodium: findNutrient(nutrients, 'Sodium') || 50
      };
    }
  } catch (error) {
    console.log('Error fetching nutrition data:', error.message);
  }

  return getDefaultNutrition(foodName);
}

function findNutrient(nutrients, name) {
  const nutrient = nutrients.find(n => n.nutrientName && n.nutrientName.includes(name));
  return nutrient ? nutrient.value : null;
}

function getDefaultNutrition(foodName) {
  // Provide reasonable defaults based on common foods
  const defaults = {
    apple: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10, sodium: 1 },
    banana: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12, sodium: 1 },
    rice: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1, sodium: 5 },
    chicken: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, sodium: 74 },
    bread: { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.8, sugar: 5, sodium: 491 }
  };

  const lowerFoodName = foodName.toLowerCase();
  for (const [key, value] of Object.entries(defaults)) {
    if (lowerFoodName.includes(key)) {
      return value;
    }
  }

  // Generic default
  return { calories: 100, protein: 3, carbs: 15, fat: 2, fiber: 1, sugar: 5, sodium: 50 };
}

// API Routes
// POST /api/food-log - Log a food item
app.post('/api/food-log', async (req, res) => {
  try {
    const { food_name, quantity, unit, user_id = 1, diary_entry_id, food_id } = req.body;

    if (!food_name || !quantity || !unit) {
      return res.status(400).json({ 
        error: 'Missing required fields: food_name, quantity, unit' 
      });
    }

    // Get nutrition data
    const nutritionData = await getNutritionData(food_name);

    // Calculate nutritional values based on quantity
    const multiplier = quantity / 100; // Assuming nutrition data is per 100g/ml
    const calculatedNutrition = {
      calories: Math.round(nutritionData.calories * multiplier * 10) / 10,
      protein: Math.round(nutritionData.protein * multiplier * 10) / 10,
      carbs: Math.round(nutritionData.carbs * multiplier * 10) / 10,
      fat: Math.round(nutritionData.fat * multiplier * 10) / 10,
      fiber: Math.round(nutritionData.fiber * multiplier * 10) / 10,
      sugar: Math.round(nutritionData.sugar * multiplier * 10) / 10,
      sodium: Math.round(nutritionData.sodium * multiplier * 10) / 10
    };

    // Insert into database
    const sql = `
      INSERT INTO food_logs (
        user_id, diary_entry_id, food_id, food_name, quantity, unit, calories, protein, carbs, fat, fiber, sugar, sodium
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      user_id,
      diary_entry_id || null,
      food_id || null,
      food_name,
      quantity,
      unit,
      calculatedNutrition.calories,
      calculatedNutrition.protein,
      calculatedNutrition.carbs,
      calculatedNutrition.fat,
      calculatedNutrition.fiber,
      calculatedNutrition.sugar,
      calculatedNutrition.sodium
    ], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to log food item' });
      }

      res.status(201).json({
        id: this.lastID,
        message: 'Food logged successfully',
        data: {
          food_name,
          quantity,
          unit,
          ...calculatedNutrition
        }
      });
    });

  } catch (error) {
    console.error('Error logging food:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/daily-summary - Get daily nutrition summary
app.get('/api/daily-summary', (req, res) => {
  try {
    const { date, user_id = 1 } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const sql = `
      SELECT 
        COUNT(*) as total_items,
        SUM(calories) as total_calories,
        SUM(protein) as total_protein,
        SUM(carbs) as total_carbs,
        SUM(fat) as total_fat,
        SUM(fiber) as total_fiber,
        SUM(sugar) as total_sugar,
        SUM(sodium) as total_sodium
      FROM food_logs 
      WHERE user_id = ? AND date = ?
    `;

    db.get(sql, [user_id, targetDate], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch daily summary' });
      }

      const summary = {
        date: targetDate,
        total_items: row.total_items || 0,
        nutrition: {
          calories: Math.round((row.total_calories || 0) * 10) / 10,
          protein: Math.round((row.total_protein || 0) * 10) / 10,
          carbs: Math.round((row.total_carbs || 0) * 10) / 10,
          fat: Math.round((row.total_fat || 0) * 10) / 10,
          fiber: Math.round((row.total_fiber || 0) * 10) / 10,
          sugar: Math.round((row.total_sugar || 0) * 10) / 10,
          sodium: Math.round((row.total_sodium || 0) * 10) / 10
        }
      };

      res.json(summary);
    });

  } catch (error) {
    console.error('Error fetching daily summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/food-log - Get food log entries
app.get('/api/food-log', (req, res) => {
  try {
    const { date, user_id = 1, limit = 50 } = req.query;
    let sql = 'SELECT * FROM food_logs WHERE user_id = ?';
    const params = [user_id];

    if (date) {
      sql += ' AND date = ?';
      params.push(date);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit));

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch food log' });
      }

      res.json({
        count: rows.length,
        food_logs: rows
      });
    });

  } catch (error) {
    console.error('Error fetching food log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Nutrition Tracker API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend', 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server - bind to 0.0.0.0 for cloud deployment
app.listen(PORT, HOST, () => {
  console.log(`🚀 Nutrition Tracker API server running on ${HOST}:${PORT}`);
  console.log(`📊 Database: SQLite (nutrition.db)`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📝 API Docs: http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed.');
    }
    process.exit(0);
  });
});
