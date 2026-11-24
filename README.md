# SplitWise Pro (MERN)

Group expense splitting with AI receipt scanning, wallet settlements, reminders and analytics.

## Features
- JWT auth (bcrypt), profile (name, currency), zod validation, central error handling
- Groups, invite by email (unregistered emails join automatically on sign-up)
- Splits: equal, exact, percentage, and by item. All math is in integer cents, so shares always add up exactly
- Balances, debt simplification (fewest payments), settlements (cash or wallet), payment reminders
- Wallet: top-up, wallet-to-wallet settlement, transaction history
- Analytics: your share by category and month
- Receipt scan: Tesseract OCR, then Claude (if `ANTHROPIC_API_KEY` is set) to extract items, prices, tax and veg / non-veg. Without a key a built-in parser is used. Assign items per member, or assign all veg / all non-veg items to one person in one click. Tax is shared in proportion to items.

## Setup
Requires Node 18+ and MongoDB running locally (or an Atlas URI).
```
cp .env.example server/.env     # edit JWT_SECRET, MONGO_URI, optional ANTHROPIC_API_KEY
npm run install-all
npm run dev                     # API :5000, UI http://localhost:5173
```
Production: `npm run build && npm start` serves UI and API on :5000.

Tests: `npm test` (split, balance and simplification logic).

## API (all under /api, Bearer token except auth)
`POST /auth/register|login` · `GET|PUT /me` · `GET|POST /groups` · `GET /groups/:id` · `POST /groups/:id/invite|expenses|settle|remind` · `DELETE /expenses/:id` · `GET /wallet` · `POST /wallet/topup` · `GET /reminders` · `POST /reminders/:id/read` · `GET /analytics` · `POST /receipts/scan` (multipart field `receipt`)

Note: wallet top-up is simulated (no real payment gateway).
