const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const axios = require('axios');
// Add compromise for natural language processing
const nlp = require('compromise');
// Add node-cron for scheduled tasks
const cron = require('node-cron');
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
        CREATE TABLE IF NOT EXISTS food_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          food_name TEXT NOT NULL,
          calories REAL,
          protein REAL,
          carbs REAL,
          fat REAL,
          quantity REAL DEFAULT 1,
          logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);
    });
  }
});

// Function to clear food logs with structured error handling
const clearFoodLogs = () => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM food_logs', function(err) {
      if (err) {
        const error = {
          success: false,
          error: 'DATABASE_ERROR',
          message: 'Failed to clear food logs',
          details: err.message,
          timestamp: new Date().toISOString()
        };
        console.error('Error clearing food logs:', error);
        reject(error);
      } else {
        const result = {
          success: true,
          message: 'Food logs cleared successfully',
          rowsDeleted: this.changes,
          timestamp: new Date().toISOString()
        };
        console.log('Food logs cleared:', result);
        resolve(result);
      }
    });
  });
};

// Schedule daily clearing of food_logs at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running scheduled task: clearing food logs at midnight');
  try {
    await clearFoodLogs();
    console.log('Scheduled food logs clearing completed successfully');
  } catch (error) {
    console.error('Scheduled food logs clearing failed:', error);
  }
}, {
  timezone: 'UTC'
});

// API endpoint for manual clearing of food logs
app.post('/api/clear-logs', async (req, res) => {
  try {
    console.log('Manual clear-logs request received');
    const result = await clearFoodLogs();
    
    res.status(200).json({
      success: true,
      message: 'Food logs cleared successfully',
      data: {
        rowsDeleted: result.rowsDeleted,
        clearedAt: result.timestamp
      }
    });
  } catch (error) {
    console.error('Manual clear-logs failed:', error);
    
    // Return structured JSON error response
    res.status(500).json({
      success: false,
      error: error.error || 'CLEAR_LOGS_ERROR',
      message: error.message || 'Failed to clear food logs',
      details: error.details || 'Unknown error occurred',
      timestamp: error.timestamp || new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('Food logs will be automatically cleared daily at midnight UTC');
});
