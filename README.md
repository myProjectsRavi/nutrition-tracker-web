# 🥗 Nutrition Tracker Web

A comprehensive web-based nutrition tracking application built with Node.js, Express, and SQLite. Track your daily food intake, monitor nutritional values, and maintain a healthy lifestyle with ease.

## ✨ Features

- **📝 Food Logging**: Log food items with quantity and unit measurements
- **📊 Daily Summaries**: Get comprehensive daily nutrition summaries
- **🔍 USDA Integration**: Automatic nutritional data lookup using USDA FoodData Central API
- **💾 SQLite Database**: Local database storage for reliability and performance
- **🌐 RESTful API**: Clean, documented API endpoints
- **🔒 Environment Configuration**: Secure environment variable management
- **☁️ Cloud Ready**: Optimized for Render.com deployment

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- USDA API key (free at https://fdc.nal.usda.gov/api-guide.html)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/myProjectsRavi/nutrition-tracker-web.git
   cd nutrition-tracker-web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your USDA API key
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Test the API**
   ```bash
   curl http://localhost:3000/api/health
   ```

## 📡 API Endpoints

### Health Check
- **GET** `/api/health` - Check API status

### Food Logging
- **POST** `/api/food-log` - Log a food item
- **GET** `/api/food-log` - Retrieve food log entries

### Daily Summary
- **GET** `/api/daily-summary` - Get daily nutrition summary

### Example Usage

#### Log a Food Item
```bash
curl -X POST http://localhost:3000/api/food-log \
  -H "Content-Type: application/json" \
  -d '{
    "food_name": "banana",
    "quantity": 120,
    "unit": "g"
  }'
```

#### Get Daily Summary
```bash
curl "http://localhost:3000/api/daily-summary?date=2025-09-22"
```

## 🏗️ Project Structure

```
nutrition-tracker-web/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore patterns
├── README.md             # Project documentation
└── nutrition.db          # SQLite database (created automatically)
```

## 🛠️ Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite3
- **External API**: USDA FoodData Central
- **Environment**: dotenv
- **CORS**: cors middleware
- **HTTP Client**: axios

## 🌍 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment mode | No | development |
| `USDA_API_KEY` | USDA FoodData Central API key | Recommended | - |
| `DATABASE_PATH` | SQLite database path | No | ./nutrition.db |
| `CORS_ORIGIN` | CORS allowed origins | No | * |

## 📦 Deployment

### Render.com Deployment

1. **Connect your GitHub repository** to Render.com
2. **Set environment variables** in Render dashboard:
   - `NODE_ENV=production`
   - `USDA_API_KEY=your_api_key_here`
3. **Deploy** using the following settings:
   - Build Command: `npm install`
   - Start Command: `npm start`

### Local Production Build

```bash
# Set production environment
export NODE_ENV=production

# Start the server
npm start
```

## 🧪 Testing the API

You can test the API using curl, Postman, or any HTTP client:

```bash
# Health check
curl http://localhost:3000/api/health

# Log food
curl -X POST http://localhost:3000/api/food-log \
  -H "Content-Type: application/json" \
  -d '{"food_name":"apple", "quantity":150, "unit":"g"}'

# Get today's summary
curl http://localhost:3000/api/daily-summary

# Get food log entries
curl http://localhost:3000/api/food-log
```

## 🔧 Development

### Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (to be implemented)

### Database Schema

#### food_logs table
```sql
CREATE TABLE food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default_user',
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
  date DATE DEFAULT (DATE('now'))
);
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Acknowledgments

- [USDA FoodData Central](https://fdc.nal.usda.gov/) for nutritional data
- [Express.js](https://expressjs.com/) for the web framework
- [SQLite](https://www.sqlite.org/) for the database
- [Render.com](https://render.com/) for hosting recommendations

## 📞 Support

If you have any questions or run into issues, please:

1. Check the existing issues on GitHub
2. Create a new issue with detailed information
3. Join our community discussions

---

**Built with ❤️ by myProjectsRavi**
