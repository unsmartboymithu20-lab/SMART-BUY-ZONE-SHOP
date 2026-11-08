require("dotenv").config();
const express=require("express"), path=require("path"), fs=require("fs"), multer=require("multer"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), Database=require("better-sqlite3");
const app=express(); app.use(express.json({limit:"2mb"})); app.use(express.urlencoded({extended:true}));
const root=__dirname, dataDir=path.dirname(process.env.DATABASE_PATH||"./data/store.db"), uploadDir=process.env.UPLOAD_DIR||path.join(root,"uploads");
fs.mkdirSync(dataDir,{recursive:true}); fs.mkdirSync(uploadDir,{recursive:true});
const db=new Database(process.env.DATABASE_PATH||path.join(dataDir,"store.db")); db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT DEFAULT 'customer',active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,brand TEXT,description TEXT,price REAL NOT NULL,compare_price REAL,category TEXT,images TEXT DEFAULT '[]',sizes TEXT DEFAULT '[]',colors TEXT DEFAULT '[]',stock INTEGER DEFAULT 0,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,email TEXT,phone TEXT,address TEXT,items TEXT,total REAL,status TEXT DEFAULT 'Pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,user_id INTEGER,name TEXT,rating INTEGER CHECK(rating BETWEEN 1 AND 5),comment TEXT,status TEXT DEFAULT 'Pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS coupons(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,discount REAL,type TEXT DEFAULT 'percent',active INTEGER DEFAULT 1,expires_at TEXT);
`);
function ensureColumn(table,column,definition){
 const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
 if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("orders","division","TEXT");
ensureColumn("orders","district","TEXT");
ensureColumn("orders","upazila","TEXT");
ensureColumn("orders","postcode","TEXT");
ensureColumn("orders","note","TEXT");
ensureColumn("orders","payment_method","TEXT DEFAULT 'Cash on Delivery'");
ensureColumn("orders","delivery_charge","REAL DEFAULT 0");
ensureColumn("orders","discount","REAL DEFAULT 0");
ensureColumn("orders","order_code","TEXT");
ensureColumn("products","featured","INTEGER DEFAULT 0");
// Seed a starter catalogue from the product photos already included in the supplied ZIP.
if(db.prepare("SELECT COUNT(*) n FROM products").get().n===0){
 const seedProducts=[["Cartoon Astronaut T-Shirt","adidas","Classic everyday cotton T-shirt",650,"T-Shirts","f1.jpg"],["Graphic Print T-Shirt","adidas","Modern graphic print casual T-shirt",720,"T-Shirts","f2.jpg"],["Premium Casual Shirt","adidas","Comfortable premium casual wear",850,"Shirts","f3.jpg"],["Everyday Fashion Tee","adidas","Soft fabric everyday T-shirt",590,"T-Shirts","f4.jpg"],["Streetwear T-Shirt","adidas","Streetwear inspired relaxed fit",790,"T-Shirts","f5.jpg"],["Classic Fit Shirt","adidas","Classic fit wardrobe essential",920,"Shirts","f6.jpg"],["Urban Style Tee","adidas","Urban style casual top",680,"T-Shirts","f7.jpg"],["Minimal Graphic Tee","adidas","Minimal graphic design",750,"T-Shirts","f8.jpg"],["New Arrival Shirt 1","Smart Buy Zone","New season fashion arrival",890,"New Arrivals","n1.jpg"],["New Arrival Shirt 2","Smart Buy Zone","New season fashion arrival",950,"New Arrivals","n2.jpg"],["New Arrival Shirt 3","Smart Buy Zone","New season fashion arrival",820,"New Arrivals","n3.jpg"],["New Arrival Shirt 4","Smart Buy Zone","New season fashion arrival",780,"New Arrivals","n4.jpg"],["New Arrival Shirt 5","Smart Buy Zone","New season fashion arrival",990,"New Arrivals","n5.jpg"],["New Arrival Shirt 6","Smart Buy Zone","New season fashion arrival",870,"New Arrivals","n6.jpg"],["New Arrival Shirt 7","Smart Buy Zone","New season fashion arrival",920,"New Arrivals","n7.jpg"],["New Arrival Shirt 8","Smart Buy Zone","New season fashion arrival",860,"New Arrivals","n8.jpg"]];
 const insert=db.prepare("INSERT INTO products(name,brand,description,price,category,images,sizes,colors,stock) VALUES(?,?,?,?,?,?,?, ?,?)");
 const tx=db.transaction(()=>seedProducts.forEach((p)=>insert.run(p[0],p[1],p[2],p[3],p[4],JSON.stringify(["img/products/"+p[5]]),JSON.stringify(["S","M","L","XL","XXL"]),JSON.stringify(["Black","White","Blue"]),25)));
 tx();
}
const adminEmail=(process.env.ADMIN_EMAIL||"admin@example.com").toLowerCase();
if(!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)){
 const pw=process.env.ADMIN_PASSWORD||"ChangeThisStrongPassword!";
 db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')").run("Store Admin",adminEmail,bcrypt.hashSync(pw,12));
 console.log("Initial admin created:",adminEmail,"— change ADMIN_PASSWORD before production.");
}
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:5*1024*1024,files:8},fileFilter:(req,file,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))});
app.use("/uploads",express.static(uploadDir,{maxAge:"7d"}));
const auth=(req,res,next)=>{try{const token=(req.headers.authorization||"").replace(/^Bearer /,"");req.user=jwt.verify(token,process.env.JWT_SECRET||"dev-secret-change-me");next()}catch(e){res.status(401).json({error:"Please log in"})}};
const admin=(req,res,next)=>req.user.role==="admin"?next():res.status(403).json({error:"Admin access required"});
const safe=u=>({id:u.id,name:u.name,email:u.email,role:u.role,active:u.active});
app.post("/api/auth/register",(req,res)=>{const {name,email,password}=req.body;if(!name||!email||!password||password.length<8)return res.status(400).json({error:"Name, email and password (8+ characters) required"});try{const r=db.prepare("INSERT INTO users(name,email,password) VALUES(?,?,?)").run(name,email.toLowerCase(),bcrypt.hashSync(password,12));const u=db.prepare("SELECT * FROM users WHERE id=?").get(r.lastInsertRowid);res.json({token:jwt.sign({id:u.id,role:u.role},process.env.JWT_SECRET||"dev-secret-change-me",{expiresIn:"7d"}),user:safe(u)})}catch(e){res.status(409).json({error:"Email already registered"})}});
app.post("/api/auth/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(req.body.email||"").toLowerCase());if(!u||!u.active||!bcrypt.compareSync(req.body.password||"",u.password))return res.status(401).json({error:"Invalid login details"});res.json({token:jwt.sign({id:u.id,role:u.role},process.env.JWT_SECRET||"dev-secret-change-me",{expiresIn:"7d"}),user:safe(u)})});
app.get("/api/auth/me",auth,(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);res.json(safe(u))});
app.get("/api/products",(req,res)=>{let sql="SELECT * FROM products WHERE active=1",args=[];if(req.query.q){sql+=" AND (name LIKE ? OR description LIKE ?)";args.push("%"+req.query.q+"%","%"+req.query.q+"%")}if(req.query.category){sql+=" AND category=?";args.push(req.query.category)}sql+=" ORDER BY id DESC";res.json(db.prepare(sql).all(...args).map(p=>({...p,images:JSON.parse(p.images),sizes:JSON.parse(p.sizes),colors:JSON.parse(p.colors)})))});
app.get("/api/products/:id",(req,res)=>{const p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(req.params.id);if(!p)return res.status(404).json({error:"Product not found"});const rating=db.prepare("SELECT AVG(rating) average,COUNT(*) count FROM reviews WHERE product_id=? AND status='Approved'").get(p.id);res.json({...p,images:JSON.parse(p.images),sizes:JSON.parse(p.sizes),colors:JSON.parse(p.colors),rating})});
app.get("/api/products/:id/reviews",(req,res)=>res.json(db.prepare("SELECT id,name,rating,comment,created_at FROM reviews WHERE product_id=? AND status='Approved' ORDER BY id DESC").all(req.params.id)));
app.post("/api/products/:id/reviews",auth,(req,res)=>{const {rating,comment}=req.body;if(!Number.isInteger(+rating)||rating<1||rating>5||!comment)return res.status(400).json({error:"Choose 1–5 stars and write a review"});db.prepare("INSERT INTO reviews(product_id,user_id,name,rating,comment) VALUES(?,?,?,?,?)").run(req.params.id,req.user.id,db.prepare("SELECT name FROM users WHERE id=?").get(req.user.id).name,+rating,comment);res.json({message:"Review submitted for approval"})});
app.post("/api/orders",(req,res)=>{const {name,email,phone,address,division,district,upazila,postcode,note,items,deliveryCharge=80,discount=0,paymentMethod="Cash on Delivery"}=req.body;
 if(!name||!phone||!address||!division||!district||!upazila||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Please complete all required checkout fields."});
 const clean=[];let subtotal=0;
 for(const item of items){const id=String(item.productId||item.id||"").replace(/^db-/,"");const qty=Math.max(1,Math.floor(Number(item.quantity||item.qty||1)));const p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(id);
 if(!p||p.stock<qty)return res.status(400).json({error:"A product is unavailable or has insufficient stock."});
 const sizes=JSON.parse(p.sizes||"[]"),colors=JSON.parse(p.colors||"[]");
 if(sizes.length&&!item.size)return res.status(400).json({error:"Please select a size for "+p.name});
 if(colors.length&&!item.color)return res.status(400).json({error:"Please select a color for "+p.name});
 subtotal+=p.price*qty;clean.push({productId:p.id,name:p.name,image:JSON.parse(p.images||"[]")[0]||"",price:p.price,quantity:qty,size:item.size||"",color:item.color||""});
 }
 const shipping=Math.max(0,Number(deliveryCharge)||0),off=Math.max(0,Number(discount)||0),total=Math.max(0,subtotal+shipping-off),code="SBZ-"+Date.now().toString().slice(-8);
 const saveOrder=db.transaction(()=>{for(const item of clean)db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(item.quantity,item.productId);
 const result=db.prepare("INSERT INTO orders(user_id,name,email,phone,address,items,total,division,district,upazila,postcode,note,payment_method,delivery_charge,discount,order_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(req.user?.id||null,name,email||"",phone,address,JSON.stringify(clean),total,division,district,upazila,postcode||"",note||"",paymentMethod,shipping,off,code);
 return {orderId:result.lastInsertRowid,orderCode:code,total,subtotal,deliveryCharge:shipping,discount:off};});
 res.json(saveOrder());
});
app.get("/api/orders/track",(req,res)=>{const code=String(req.query.orderId||"").trim(),phone=String(req.query.phone||"").trim();if(!code||!phone)return res.status(400).json({error:"Order ID and mobile number are required."});const o=db.prepare("SELECT id,order_code,name,phone,address,division,district,upazila,items,total,status,created_at FROM orders WHERE (order_code=? OR CAST(id AS TEXT)=?) AND phone=?").get(code,code,phone);if(!o)return res.status(404).json({error:"No matching order found. Check the Order ID and mobile number."});res.json({...o,items:JSON.parse(o.items||"[]")});});
app.get("/api/orders/mine",auth,(req,res)=>res.json(db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.post("/api/admin/upload",auth,admin,upload.array("images",8),(req,res)=>res.json({files:req.files.map(f=>"/uploads/"+f.filename)}));
app.get("/api/admin/stats",auth,admin,(req,res)=>res.json({products:db.prepare("SELECT COUNT(*) n FROM products").get().n,orders:db.prepare("SELECT COUNT(*) n FROM orders").get().n,customers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer'").get().n,revenue:db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status='Delivered'").get().n,pending:db.prepare("SELECT COUNT(*) n FROM orders WHERE status='Pending'").get().n}));
app.get("/api/admin/products",auth,admin,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(p=>({...p,images:JSON.parse(p.images),sizes:JSON.parse(p.sizes),colors:JSON.parse(p.colors)}))));
app.post("/api/admin/products",auth,admin,(req,res)=>{const p=req.body;if(!p.name||!Number.isFinite(+p.price))return res.status(400).json({error:"Product name and valid price required"});const r=db.prepare("INSERT INTO products(name,brand,description,price,compare_price,category,images,sizes,colors,stock,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(p.name,p.brand||"",p.description||"",+p.price,+p.compare_price||null,p.category||"General",JSON.stringify(p.images||[]),JSON.stringify(p.sizes||[]),JSON.stringify(p.colors||[]),+p.stock||0,p.active===false?0:1);res.json({id:r.lastInsertRowid})});
app.put("/api/admin/products/:id",auth,admin,(req,res)=>{const p=req.body;db.prepare("UPDATE products SET name=?,brand=?,description=?,price=?,compare_price=?,category=?,images=?,sizes=?,colors=?,stock=?,active=? WHERE id=?").run(p.name,p.brand||"",p.description||"",+p.price,+p.compare_price||null,p.category||"General",JSON.stringify(p.images||[]),JSON.stringify(p.sizes||[]),JSON.stringify(p.colors||[]),+p.stock||0,p.active===false?0:1,req.params.id);res.json({ok:true})});
app.delete("/api/admin/products/:id",auth,admin,(req,res)=>{db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);res.json({ok:true})});
app.get("/api/admin/orders",auth,admin,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC").all()));
app.patch("/api/admin/orders/:id",auth,admin,(req,res)=>{const allowed=["Pending","Processing","Shipped","Delivered","Cancelled"];if(!allowed.includes(req.body.status))return res.status(400).json({error:"Invalid status"});db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);res.json({ok:true})});
app.get("/api/admin/customers",auth,admin,(req,res)=>res.json(db.prepare("SELECT id,name,email,active,created_at FROM users WHERE role='customer' ORDER BY id DESC").all()));
app.patch("/api/admin/customers/:id",auth,admin,(req,res)=>{db.prepare("UPDATE users SET active=? WHERE id=? AND role='customer'").run(req.body.active?1:0,req.params.id);res.json({ok:true})});
app.get("/api/admin/reviews",auth,admin,(req,res)=>res.json(db.prepare("SELECT r.*,p.name product_name FROM reviews r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.id DESC").all()));
app.patch("/api/admin/reviews/:id",auth,admin,(req,res)=>{if(!["Approved","Rejected","Pending"].includes(req.body.status))return res.status(400).json({error:"Invalid status"});db.prepare("UPDATE reviews SET status=? WHERE id=?").run(req.body.status,req.params.id);res.json({ok:true})});
app.get("/api/admin/coupons",auth,admin,(req,res)=>res.json(db.prepare("SELECT * FROM coupons ORDER BY id DESC").all()));
app.post("/api/admin/coupons",auth,admin,(req,res)=>{try{db.prepare("INSERT INTO coupons(code,discount,type,expires_at) VALUES(?,?,?,?)").run(req.body.code.toUpperCase(),+req.body.discount,req.body.type||"percent",req.body.expires_at||null);res.json({ok:true})}catch(e){res.status(409).json({error:"Coupon code already exists"})}});
app.use(express.static(root));
app.get("*",(req,res)=>res.sendFile(path.join(root,"index.html")));
const port=process.env.PORT||3000;app.listen(port,()=>console.log("Smart Buy Zone running on "+port));
