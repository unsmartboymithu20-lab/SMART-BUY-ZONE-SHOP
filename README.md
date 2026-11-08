# Smart Buy Zone — upgraded full-stack build

## What changed
- Preserved the supplied storefront pages and image assets.
- Added a responsive 2-column mobile product grid (3-column tablet grid).
- Added Express API, SQLite database, customer registration/login, guest Cash on Delivery checkout, order tracking and admin APIs. Public product review submission has been removed from the storefront.
- Added admin dashboard at `/admin/` for products, orders, customers, reviews and coupons.
- Product editor supports description, brand, category, price, compare price, sizes, colors, stock and multiple images (up to 8; 4+ recommended).
- Added Render Blueprint (`render.yaml`) with persistent disk for SQLite and uploaded images.

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and set a strong `ADMIN_PASSWORD` and `JWT_SECRET`.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`; admin is at `http://localhost:3000/admin/`.

## Deploy to Render
1. Push this project folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` in Render environment settings. The included persistent disk uses a paid Render plan (`starter`); this keeps the SQLite database and uploaded images between deploys.
4. Deploy. The blueprint mounts `/var/data` so SQLite data and uploaded images persist across deploys.

## Important production notes
- Do not use the default admin password. Set `ADMIN_PASSWORD` and a long random `JWT_SECRET`.
- Render persistent disks are available on paid web service plans; if using a free service, use an external managed PostgreSQL/database and object storage or choose a plan with persistent disk. Do not expect local files on an ephemeral filesystem to persist.
- The app seeds a starter catalogue using the product images already bundled in the ZIP. These products are editable in the admin dashboard. New admin-created products are appended to the storefront product grid.
- Product reviews are not shown or submitted on the storefront in this version.
- Payment gateway is not configured; checkout creates a cash/manual order record. Add a supported payment provider and credentials before accepting online payments.
- This is a functional starter implementation; test checkout, upload size limits, database backup and security settings before production launch.

## Checkout flow
- Cart → `checkout.html` → Cash on Delivery order saved in SQLite → `order-success.html`.
- Customers can track an order at `track-order.html` with the order ID and checkout mobile number.
- The default delivery charge is ৳80 in the checkout UI; update `app.js` and checkout settings together if you change it.
