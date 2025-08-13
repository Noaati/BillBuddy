const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;  // קורא את ה־URI מקובץ ה־.env
  if (!uri) {
    console.log('No MONGODB_URI in .env — skipping DB connection');
    return;  // אם אין URI, לא מחברים למסד
  }
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    throw error;  // זורק שגיאה למעלה אם החיבור נכשל
  }
}

module.exports = connectDB;