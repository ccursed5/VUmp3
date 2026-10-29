# D0FY3 — GoPay Premium (Midtrans Snap)

Starter integration: the browser asks the server to create a GoPay-only transaction; Premium is activated only after the server asks Midtrans for the transaction status and confirms `settlement` (or accepted `capture`). The browser's “I paid” button is not treated as proof of payment.

## Important
- This is a starter, not a live payment service until deployed and configured with an active Midtrans merchant account.
- This integration uses Midtrans GoPay checkout, not a manual transfer to the displayed GoPay phone number. The payment is processed through Midtrans.
- Current room list and Premium display are stored in browser `localStorage`. For production/multi-device use, replace this with a real database and authenticated users; a local HTML dashboard cannot securely manage entitlements across devices.
- Keep `MIDTRANS_SERVER_KEY` secret. Never place it in the HTML or commit `.env` to source control.

## Setup
1. Install Node.js 18 or newer.
2. Create/activate a Midtrans merchant account and enable GoPay in the Midtrans dashboard.
3. Copy `.env.example` to `.env`, then fill in the Server Key and Client Key from Midtrans. Start in Sandbox first (`MIDTRANS_IS_PRODUCTION=false`).
4. In this folder, run:
   ```sh
   npm install
   npm start
   ```
5. Open `http://localhost:3000/dashboard.html` (not by double-clicking the HTML file).
6. Deploy the server to a public HTTPS host before configuring notifications. Set the Midtrans Payment Notification URL to `https://YOUR-DOMAIN/api/midtrans-notification`.
7. Test with Midtrans Sandbox. Switch `MIDTRANS_IS_PRODUCTION=true` only after production onboarding and testing are complete.

## Flow
- Click Activate/Extend -> server creates a fixed-price GoPay transaction.
- Checkout opens using Midtrans Snap.
- Dashboard polls server status. Server queries Midtrans; only a confirmed successful status updates Premium.
- Notifications are also checked against Midtrans status API.

## Notes
- Price is controlled by `PREMIUM_PRICE_IDR` on the server (default Rp13.000), not by browser input.
- Premium duration is controlled by `PREMIUM_DAYS` (default 30).
- The JSON order file is a simple starter store. Use a transactional database for production and back it up.
