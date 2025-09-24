const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const axios = require('axios');
// Add compromise for natural language processing
const nlp = require('compromise');
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
        CREATE TABLE IF NOT EXISTS food_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
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
          logged_date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
    });
  }
});

// Helper function to parse natural language food descriptions
function parseFoodDescription(text) {
  let parsedItems = [];
  
  try {
    // Use compromise for better natural language parsing
    const doc = nlp(text);
    
    // Extract quantities and units
    const quantities = doc.match('#Value+ #Noun?').out('array');
    const foods = doc.match('#Noun').not('#Value').not('#Unit').out('array');
    
    // If compromise parsing works, use it
    if (quantities.length > 0 && foods.length > 0) {
      quantities.forEach((quantityText, index) => {
        const food = foods[index] || foods[0]; // fallback to first food if not enough
        const match = quantityText.match(/(\d+(?:\.\d+)?)\s*(\w+)?/);
        
        if (match && food) {
          parsedItems.push({
            food: food.toLowerCase().trim(),
            quantity: parseFloat(match[1]),
            unit: match[2] || 'serving'
          });
        }
      });
    }
  } catch (error) {
    console.log('Compromise parsing failed, falling back to regex:', error.message);
  }
  
  // Fallback: regex-based parsing if compromise fails
  if (parsedItems.length === 0) {
    // Common patterns: "2 apples", "1 cup rice", "3 slices bread"
    const patterns = [
      /(\d+(?:\.\d+)?)\s*(cups?|slices?|pieces?|servings?|grams?|g|oz|ounces?|lbs?|pounds?)\s+(?:of\s+)?([\w\s]+)/gi,
      /(\d+(?:\.\d+)?)\s+([\w\s]+?)(?:\s|$)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        parsedItems.push({
          food: (match[3] || match[2]).toLowerCase().trim(),
          quantity: parseFloat(match[1]),
          unit: match[3] ? match[2] : 'serving'
        });
      }
      if (parsedItems.length > 0) break;
    }
  }
  
  return parsedItems;
}

// Helper function to search USDA FoodData Central API
async function searchUSDAFood(foodName) {
  const apiKey = process.env.USDA_API_KEY;
  
  if (!apiKey) {
    throw new Error('USDA_API_KEY not found in environment variables. Please check your .env file.');
  }
  
  try {
    const searchResponse = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
      params: {
        query: foodName,
        api_key: apiKey,
        pageSize: 1,
        dataType: ['Branded', 'Foundation', 'SR Legacy']
      }
    });
    
    if (!searchResponse.data.foods || searchResponse.data.foods.length === 0) {
      return null;
    }
    
    const food = searchResponse.data.foods[0];
    const nutrients = {};
    
    // Extract key nutrients
    if (food.foodNutrients) {
      food.foodNutrients.forEach(nutrient => {
        switch (nutrient.nutrientId) {
          case 1008: // Energy (calories)
            nutrients.calories = nutrient.value;
            break;
          case 1003: // Protein
            nutrients.protein = nutrient.value;
            break;
          case 1005: // Carbohydrates
            nutrients.carbs = nutrient.value;
            break;
          case 1004: // Total lipid (fat)
            nutrients.fat = nutrient.value;
            break;
          case 1079: // Fiber
            nutrients.fiber = nutrient.value;
            break;
          case 2000: // Sugars
            nutrients.sugar = nutrient.value;
            break;
          case 1093: // Sodium
            nutrients.sodium = nutrient.value;
            break;
        }
      });
    }
    
    return {
      name: food.description,
      brand: food.brandOwner || null,
      nutrients
    };
    
  } catch (error) {
    console.error('USDA API error:', error.message);
    return null;
  }
}

// /api/chat POST endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message is required'
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User ID is required'
      });
    }
    
    // Check if USDA API key is available
    if (!process.env.USDA_API_KEY) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'USDA API key not configured. Please add USDA_API_KEY to your .env file. Check .env.example for reference.'
      });
    }
    
    // Parse the natural language food description
    const parsedItems = parseFoodDescription(message);
    
    if (parsedItems.length === 0) {
      return res.status(400).json({
        error: 'Parse Error',
        message: 'Could not understand the food description. Please try something like "2 apples" or "1 cup rice"'
      });
    }
    
    const breakdown = [];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Process each parsed food item
    for (const item of parsedItems) {
      try {
        const nutritionData = await searchUSDAFood(item.food);
        
        if (!nutritionData) {
          breakdown.push({
            food: item.food,
            quantity: item.quantity,
            unit: item.unit,
            status: 'error',
            message: 'Nutrition data not found'
          });
          continue;
        }
        
        // Calculate nutrition based on quantity (assuming USDA data is per 100g)
        const multiplier = item.quantity / 100; // Rough estimation
        const calculatedNutrition = {
          calories: (nutritionData.nutrients.calories || 0) * multiplier,
          protein: (nutritionData.nutrients.protein || 0) * multiplier,
          carbs: (nutritionData.nutrients.carbs || 0) * multiplier,
          fat: (nutritionData.nutrients.fat || 0) * multiplier,
          fiber: (nutritionData.nutrients.fiber || 0) * multiplier,
          sugar: (nutritionData.nutrients.sugar || 0) * multiplier,
          sodium: (nutritionData.nutrients.sodium || 0) * multiplier
        };
        
        // Log to database
        db.run(`
          INSERT INTO food_logs (
            user_id, food_name, quantity, unit, calories, protein, carbs, 
            fat, fiber, sugar, sodium, logged_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          userId,
          nutritionData.name,
          item.quantity,
          item.unit,
          calculatedNutrition.calories,
          calculatedNutrition.protein,
          calculatedNutrition.carbs,
          calculatedNutrition.fat,
          calculatedNutrition.fiber,
          calculatedNutrition.sugar,
          calculatedNutrition.sodium,
          today
        ]);
        
        breakdown.push({
          food: nutritionData.name,
          brand: nutritionData.brand,
          quantity: item.quantity,
          unit: item.unit,
          nutrition: calculatedNutrition,
          status: 'logged'
        });
        
      } catch (error) {
        console.error('Error processing food item:', error.message);
        breakdown.push({
          food: item.food,
          quantity: item.quantity,
          unit: item.unit,
          status: 'error',
          message: error.message
        });
      }
    }
    
    res.json({
      status: 'Noted',
      breakdown: breakdown
    });
    
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing your request'
    });
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
