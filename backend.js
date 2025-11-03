/**
 * 🌸 LuxeStore Backend (Single-File Version)
 * Supports:
 *   - Signup/Login/Reset
 *   - Products (fetch by category)
 *   - Cart (add, view, update, delete)
 *   - Checkout (order generation)
 * Storage: local JSON file via lowdb (db.json)
 */

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { Low, JSONFile } = require("lowdb");
const path = require("path");

// ---------- Initialize App ----------
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---------- Database Setup ----------
const file = path.join(__dirname, "db.json");
const adapter = new JSONFile(file);
const db = new Low(adapter);

// ---------- Initialize Default Data ----------
async function initDB() {
  await db.read();
  db.data = db.data || { users: [], products: [], carts: [], orders: [] };

  // Preload some sample products
  if (db.data.products.length === 0) {
    db.data.products = [
      {
        id: "p1",
        title: "Smartphone X",
        category: "electronics",
        price: 29999,
        image: "https://via.placeholder.com/200",
        rating: 4.5,
      },
      {
        id: "p2",
        title: "Wireless Earbuds",
        category: "electronics",
        price: 4999,
        image: "https://via.placeholder.com/200",
        rating: 4.2,
      },
      {
        id: "p3",
        title: "Luxury Perfume",
        category: "beauty",
        price: 2599,
        image: "https://via.placeholder.com/200",
        rating: 4.3,
      },
      {
        id: "p4",
        title: "Stylish T-Shirt",
        category: "clothes",
        price: 999,
        image: "https://via.placeholder.com/200",
        rating: 4.4,
      },
      {
        id: "p5",
        title: "Home LED Lamp",
        category: "home",
        price: 1499,
        image: "https://via.placeholder.com/200",
        rating: 4.1,
      },
    ];
    await db.write();
  }
}
initDB();

// ========== Helper: Get User From Header ==========
async function getUser(req) {
  const token = req.headers["x-session-token"];
  await db.read();
  if (!token) return null;
  return db.data.users.find((u) => u.session === token);
}

// ========== AUTH ROUTES ==========

// Signup
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });

  await db.read();
  const exists = db.data.users.find((u) => u.email === email.toLowerCase());
  if (exists) return res.status(409).json({ error: "User already exists" });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: nanoid(),
    email: email.toLowerCase(),
    password: hash,
    createdAt: Date.now(),
  };
  db.data.users.push(user);
  await db.write();
  res.json({ message: "Signup successful", email: user.email });
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing credentials" });

  await db.read();
  const user = db.data.users.find((u) => u.email === email.toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const sessionToken = nanoid(24);
  user.session = sessionToken;
  await db.write();
  res.json({ id: user.id, email: user.email, sessionToken });
});

// Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword)
    return res.status(400).json({ error: "Missing fields" });

  await db.read();
  const user = db.data.users.find((u) => u.email === email.toLowerCase());
  if (!user) return res.status(404).json({ error: "User not found" });

  user.password = await bcrypt.hash(newPassword, 10);
  await db.write();
  res.json({ message: "Password reset successful" });
});

// ========== PRODUCT ROUTES ==========

// Get all or by category
app.get("/api/products", async (req, res) => {
  await db.read();
  const cat = req.query.category;
  let list = db.data.products;
  if (cat) list = list.filter((p) => p.category === cat);
  res.json(list);
});

// Get product by ID
app.get("/api/products/:id", async (req, res) => {
  await db.read();
  const p = db.data.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(p);
});

// ========== CART ROUTES ==========

// Get cart
app.get("/api/cart", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  await db.read();
  const cart = db.data.carts.find((c) => c.userId === user.id) || {
    userId: user.id,
    items: [],
  };
  res.json(cart);
});

// Add to cart
app.post("/api/cart", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { productId, qty = 1 } = req.body;
  if (!productId) return res.status(400).json({ error: "Missing productId" });

  await db.read();
  const prod = db.data.products.find((p) => p.id === productId);
  if (!prod) return res.status(404).json({ error: "Product not found" });

  let cart = db.data.carts.find((c) => c.userId === user.id);
  if (!cart) {
    cart = { userId: user.id, items: [] };
    db.data.carts.push(cart);
  }

  const item = cart.items.find((i) => i.productId === productId);
  if (item) item.qty += qty;
  else
    cart.items.push({
      productId,
      title: prod.title,
      price: prod.price,
      qty,
      image: prod.image,
    });

  await db.write();
  res.json({ message: "Added to cart", cart });
});

// Update cart item qty
app.put("/api/cart", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { productId, qty } = req.body;
  if (!productId) return res.status(400).json({ error: "Missing productId" });

  await db.read();
  const cart = db.data.carts.find((c) => c.userId === user.id);
  if (!cart) return res.status(404).json({ error: "Cart not found" });

  const item = cart.items.find((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: "Item not found" });

  item.qty = qty;
  if (item.qty <= 0)
    cart.items = cart.items.filter((i) => i.productId !== productId);

  await db.write();
  res.json({ message: "Cart updated", cart });
});

// Delete item from cart
app.delete("/api/cart/:productId", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const productId = req.params.productId;
  await db.read();
  const cart = db.data.carts.find((c) => c.userId === user.id);
  if (!cart) return res.status(404).json({ error: "Cart not found" });

  cart.items = cart.items.filter((i) => i.productId !== productId);
  await db.write();
  res.json({ message: "Item removed", cart });
});

// ========== CHECKOUT ROUTE ==========
app.post("/api/checkout", async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  await db.read();
  const cart = db.data.carts.find((c) => c.userId === user.id);
  if (!cart || cart.items.length === 0)
    return res.status(400).json({ error: "Cart empty" });

  const total = cart.items.reduce((s, i) => s + i.qty * i.price, 0);

  const order = {
    id: "order_" + nanoid(8),
    userId: user.id,
    items: cart.items,
    total,
    date: new Date().toISOString(),
  };
  db.data.orders.push(order);
  db.data.carts = db.data.carts.filter((c) => c.userId !== user.id);
  await db.write();

  res.json({ message: "Order placed successfully", order });
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Luxe backend running on http://localhost:${PORT}`));
