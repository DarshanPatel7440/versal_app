'use strict';

require('dotenv').config();

// Allow connections to databases with self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Pool } = require('pg');
const { createApp } = require('./server');

const PORT = parseInt(process.env.PORT, 10) || 8590;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
};

const app = createApp({ pool, razorpayConfig });

app.listen(PORT, () => {
  console.log(`Global Payment Service listening on port ${PORT}`);
});
