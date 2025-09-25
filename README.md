# 🥗 Nutrition Tracker Web

A comprehensive web-based nutrition tracking application built with Node.js, Express, and SQLite. Track your daily food intake, monitor nutritional values, and maintain a healthy lifestyle with ease.

## ✨ Features

- **📝 Food Logging**: Log food items with quantity and unit measurements
- **📊 Daily Summaries**: Get comprehensive daily nutrition summaries
- **🍎 Open Food Facts Integration**: Automatic nutritional data lookup using the completely free Open Food Facts API (no API key required!)
- **💾 SQLite Database**: Local database storage for reliability and performance
- **🌐 RESTful API**: Clean, documented API endpoints
- **🔒 Environment Configuration**: Secure environment variable management
- **☁️ Cloud Ready**: Optimized for Render.com deployment
- **🆓 100% Free**: No API keys or paid services required

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- **No API key required!** - Uses Open Food Facts free API

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

3. **Start the server** (No additional setup needed!)
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

4. **Test the API**
   ```bash
   curl http://localhost:3000/health
   ```

## 📡 API Endpoints

### Health Check
- **GET** `/health` - Check API status and Open Food Facts connectivity

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
curl "http://localhost:3000/api/daily-summary"
```

## 🏗️ Project Structure

```
nutrition-tracker-web/
├── server.js              # Main server file with Open Food Facts integration
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template (optional)
├── .gitignore            # Git ignore patterns
├── README.md             # Project documentation
└── nutrition.db          # SQLite database (created automatically)
```

## 🛠️ Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite3
- **External API**: Open Food Facts (100% free, no registration required)
- **Environment**: dotenv (optional)
- **CORS**: cors middleware
- **HTTP Client**: axios

## 🌍 Environment Variables

All environment variables are optional. The app works out of the box with sensible defaults.

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| PORT | Server port | No | 3000 |
| NODE_ENV | Environment mode | No | development |
| HOST | Server host | No | 0.0.0.0 |
| DATABASE_PATH | SQLite database path | No | ./nutrition.db |
| CORS_ORIGIN | CORS allowed origins | No | * |

## 📦 Deployment

### Render.com Deployment

1. Connect your GitHub repository to Render.com
2. **No environment variables required!** The app works with defaults
3. Deploy using the following settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Local Production Build

```bash
# Set production environment (optional)
export NODE_ENV=production

# Start the server
npm start
```

## 🧪 Testing the API

You can test the API using curl, Postman, or any HTTP client:

```bash
# Health check
curl http://localhost:3000/health

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
);
```

## 🍎 About Open Food Facts

[Open Food Facts](https://world.openfoodfacts.org/) is a free, open, collaborative database of food products from around the world. It provides:

- ✅ **Completely Free**: No API keys, registration, or rate limits
- ✅ **Comprehensive Data**: Millions of food products worldwide
- ✅ **Real Nutrition Data**: Actual nutrition facts from product labels
- ✅ **Community Driven**: Crowdsourced and verified by users
- ✅ **No Dependencies**: Works without any external accounts

## 🚨 API Migration Notice

**Updated from USDA API**: This application previously used the USDA FoodData Central API, which required an API key and had rate limits. We've migrated to Open Food Facts API for the following benefits:

- 🆓 No API key required
- 🚫 No rate limits
- 🌍 Global food database (not just US foods)
- ⚡ Faster setup (no registration needed)
- 📈 Better reliability

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Acknowledgments

- [Open Food Facts](https://world.openfoodfacts.org/) for providing free, comprehensive nutrition data
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

*Now with 100% free nutrition data - no API keys required!*
