require('dotenv').config();
const mongoose = require('mongoose'), app = require('./app');
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/splitwise_clone')
  .then(() => app.listen(process.env.PORT || 5000, () => console.log(`API on :${process.env.PORT || 5000}`)))
  .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
