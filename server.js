require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const midtransClient = require('midtrans-client');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));
const PORT = Number(process.env.PORT || 3000);
const PRICE = Number(process.env.PREMIUM_PRICE_IDR || 13000);
const PREMIUM_DAYS = Number(process.env.PREMIUM_DAYS || 30);
const DATA_FILE = path.join(__dirname, 'orders.json');

if (!process.env.MIDTRANS_SERVER_KEY) {
  console.warn('WARNING: MIDTRANS_SERVER_KEY is missing. Payment creation will not work until .env is configured.');
}
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'NOT_CONFIGURED',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});
const core = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'NOT_CONFIGURED',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});

function readOrders() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}
function writeOrders(orders) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
}
function safeEqual(a, b) { return typeof a === 'string' && typeof b === 'string' && a === b; }
function isSettled(status) {
  return status && (status.transaction_status === 'settlement' ||
    (status.transaction_status === 'capture' && status.fraud_status === 'accept'));
}
function activateOrder(orders, orderId, status) {
  const order = orders[orderId];
  if (!order || order.status === 'paid' || !isSettled(status)) return false;
  // Verify order amount against our server-side order record.
  if (Number(status.gross_amount) !== Number(order.amount)) return false;
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  order.transactionId = status.transaction_id || null;
  order.premiumUntil = new Date(Date.now() + PREMIUM_DAYS * 86400000).toISOString();
  writeOrders(orders);
  return true;
}

app.get('/api/config', (_req, res) => {
  res.json({ price: PRICE, currency: 'IDR', paymentMethod: 'GoPay', configured: Boolean(process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_CLIENT_KEY) });
});

app.post('/api/payments', async (req, res) => {
  try {
    if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
      return res.status(503).json({ error: 'Payment gateway belum dikonfigurasi. Isi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di .env.' });
    }
    const roomId = String(req.body.roomId || '').slice(0, 100);
    const roomName = String(req.body.roomName || 'Premium Room').slice(0, 80);
    if (!roomId) return res.status(400).json({ error: 'roomId wajib diisi.' });
    const orderId = `D0FY3-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const transaction = await snap.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: PRICE },
      item_details: [{ id: 'premium-30d', price: PRICE, quantity: 1, name: `Premium 30 hari - ${roomName}`.slice(0, 50) }],
      enabled_payments: ['gopay'],
      callbacks: { finish: `${req.protocol}://${req.get('host')}/dashboard.html?payment=finish&order_id=${encodeURIComponent(orderId)}` }
    });
    const orders = readOrders();
    orders[orderId] = { orderId, roomId, roomName, amount: PRICE, status: 'pending', createdAt: new Date().toISOString(), premiumDays: PREMIUM_DAYS };
    writeOrders(orders);
    res.json({ orderId, token: transaction.token, redirectUrl: transaction.redirect_url, amount: PRICE });
  } catch (err) {
    console.error('Create payment failed:', err.message);
    res.status(502).json({ error: 'Gagal membuat transaksi GoPay. Periksa konfigurasi Midtrans dan coba lagi.' });
  }
});

app.get('/api/payments/:orderId', async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '');
    const orders = readOrders();
    const order = orders[orderId];
    if (!order) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    if (order.status !== 'paid') {
      // Ask Midtrans directly; never trust a browser callback or the user's "I paid" click.
      const status = await core.transaction.status(orderId);
      activateOrder(orders, orderId, status);
    }
    const latest = readOrders()[orderId] || order;
    res.json({ orderId, status: latest.status, premiumUntil: latest.premiumUntil || null, roomId: latest.roomId });
  } catch (err) {
    // Pending is not a successful payment. UI can safely retry polling.
    res.status(200).json({ status: 'pending', message: 'Status pembayaran belum tersedia; coba periksa lagi sebentar.' });
  }
});

app.post('/api/midtrans-notification', async (req, res) => {
  try {
    // SDK queries Midtrans status using the secret server key, avoiding trust in posted status fields.
    const notification = req.body;
    if (!notification || !notification.order_id) return res.status(400).json({ error: 'Invalid notification' });
    const status = await core.transaction.status(notification.order_id);
    const orders = readOrders();
    activateOrder(orders, notification.order_id, status);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Notification verification failed:', err.message);
    res.status(500).json({ error: 'Could not verify notification' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`D0FY3 payment server listening on port ${PORT}`));
