import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [foodData, setFoodData] = useState({
    food: '',
    quantity: '',
    unit: ''
  });
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('food-entry');
  const [foodLog, setFoodLog] = useState([]);

  // API base URL - uses proxy from package.json
  const API_BASE = process.env.REACT_APP_API_URL || '/api';

  // Load initial data when component mounts
  useEffect(() => {
    fetchDailySummary();
    fetchFoodLog();
  }, []);

  // Fetch daily summary from backend
  const fetchDailySummary = async () => {
    try {
      const response = await axios.get(`${API_BASE}/daily-summary`);
      setDailySummary(response.data);
    } catch (error) {
      console.error('Error fetching daily summary:', error);
    }
  };

  // Fetch food log entries
  const fetchFoodLog = async () => {
    try {
      const response = await axios.get(`${API_BASE}/food-log`);
      setFoodLog(response.data);
    } catch (error) {
      console.error('Error fetching food log:', error);
    }
  };

  // Handle food form submission
  const handleFoodSubmit = async (e) => {
    e.preventDefault();
    if (!foodData.food || !foodData.quantity) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/food-log`, {
        food_name: foodData.food,
        quantity: parseFloat(foodData.quantity),
        unit: foodData.unit || 'grams'
      });
      
      // Reset form
      setFoodData({ food: '', quantity: '', unit: '' });
      
      // Refresh data
      await fetchFoodLog();
      await fetchDailySummary();
      
      alert('Food logged successfully!');
    } catch (error) {
      console.error('Error logging food:', error);
      alert('Error logging food. Please try again.');
    }
    setLoading(false);
  };

  // Handle chat message submission
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const userMessage = { type: 'user', message: chatMessage };
    setChatMessages(prev => [...prev, userMessage]);
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/chat`, {
        message: chatMessage
      });
      
      const botMessage = { type: 'bot', message: response.data.response };
      setChatMessages(prev => [...prev, botMessage]);
      
      setChatMessage('');
    } catch (error) {
      console.error('Error sending chat message:', error);
      const errorMessage = { type: 'bot', message: 'Sorry, I encountered an error. Please try again.' };
      setChatMessages(prev => [...prev, errorMessage]);
    }
    setLoading(false);
  };

  // Handle form input changes
  const handleInputChange = (field, value) => {
    setFoodData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Nutrition Tracker</h1>
        <p>Track your daily food intake and nutritional values</p>
      </header>

      <nav className="tab-navigation">
        <button 
          className={activeTab === 'food-entry' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('food-entry')}
        >
          Food Entry
        </button>
        <button 
          className={activeTab === 'daily-summary' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('daily-summary')}
        >
          Daily Summary
        </button>
        <button 
          className={activeTab === 'chat' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('chat')}
        >
          Interactive Chat
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'food-entry' && (
          <section className="food-entry-section">
            <h2>Log Your Food</h2>
            <form onSubmit={handleFoodSubmit} className="food-form">
              <div className="form-group">
                <label htmlFor="food">Food Item:</label>
                <input
                  type="text"
                  id="food"
                  value={foodData.food}
                  onChange={(e) => handleInputChange('food', e.target.value)}
                  placeholder="e.g., banana, chicken breast"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="quantity">Quantity:</label>
                <input
                  type="number"
                  id="quantity"
                  value={foodData.quantity}
                  onChange={(e) => handleInputChange('quantity', e.target.value)}
                  placeholder="e.g., 100"
                  step="0.1"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="unit">Unit:</label>
                <select
                  id="unit"
                  value={foodData.unit}
                  onChange={(e) => handleInputChange('unit', e.target.value)}
                >
                  <option value="grams">Grams</option>
                  <option value="ounces">Ounces</option>
                  <option value="cups">Cups</option>
                  <option value="pieces">Pieces</option>
                  <option value="servings">Servings</option>
                </select>
              </div>
              
              <button type="submit" disabled={loading} className="submit-btn">
                {loading ? 'Logging...' : 'Log Food'}
              </button>
            </form>

            {/* Recent food log entries */}
            <div className="recent-entries">
              <h3>Recent Entries</h3>
              {foodLog.length > 0 ? (
                <ul className="food-log-list">
                  {foodLog.slice(-5).reverse().map((entry, index) => (
                    <li key={index} className="food-entry">
                      <strong>{entry.food_name}</strong> - {entry.quantity} {entry.unit}
                      {entry.nutrition && (
                        <div className="nutrition-info">
                          Calories: {entry.nutrition.calories} | 
                          Protein: {entry.nutrition.protein}g | 
                          Carbs: {entry.nutrition.carbs}g | 
                          Fat: {entry.nutrition.fat}g
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No food entries yet. Start logging your meals!</p>
              )}
            </div>
          </section>
        )}

        {activeTab === 'daily-summary' && (
          <section className="daily-summary-section">
            <h2>Daily Summary</h2>
            {dailySummary ? (
              <div className="summary-content">
                <div className="summary-card">
                  <h3>Today's Nutrition</h3>
                  <div className="nutrition-grid">
                    <div className="nutrition-item">
                      <span className="label">Calories:</span>
                      <span className="value">{dailySummary.total_calories || 0}</span>
                    </div>
                    <div className="nutrition-item">
                      <span className="label">Protein:</span>
                      <span className="value">{dailySummary.total_protein || 0}g</span>
                    </div>
                    <div className="nutrition-item">
                      <span className="label">Carbohydrates:</span>
                      <span className="value">{dailySummary.total_carbs || 0}g</span>
                    </div>
                    <div className="nutrition-item">
                      <span className="label">Fat:</span>
                      <span className="value">{dailySummary.total_fat || 0}g</span>
                    </div>
                  </div>
                </div>
                
                <div className="summary-card">
                  <h3>Food Items ({dailySummary.food_count || 0})</h3>
                  {dailySummary.foods && dailySummary.foods.length > 0 ? (
                    <ul className="foods-list">
                      {dailySummary.foods.map((food, index) => (
                        <li key={index}>{food.name} - {food.quantity} {food.unit}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No foods logged today.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="loading-message">
                <p>Loading daily summary...</p>
              </div>
            )}
          </section>
        )}

        {activeTab === 'chat' && (
          <section className="chat-section">
            <h2>Nutrition Assistant</h2>
            <div className="chat-container">
              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <div className="welcome-message">
                    <p>👋 Hi! I'm your nutrition assistant. Ask me about:</p>
                    <ul>
                      <li>Nutritional information about foods</li>
                      <li>Healthy meal suggestions</li>
                      <li>Your daily nutrition goals</li>
                      <li>Diet tips and advice</li>
                    </ul>
                  </div>
                )}
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`message ${msg.type}`}>
                    <div className="message-content">{msg.message}</div>
                  </div>
                ))}
                {loading && (
                  <div className="message bot">
                    <div className="message-content">Typing...</div>
                  </div>
                )}
              </div>
              
              <form onSubmit={handleChatSubmit} className="chat-form">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask about nutrition, foods, or health tips..."
                  disabled={loading}
                  className="chat-input"
                />
                <button type="submit" disabled={loading || !chatMessage.trim()} className="send-btn">
                  Send
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
