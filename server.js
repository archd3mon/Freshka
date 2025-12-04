const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/images', express.static('images'));

// Configure file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '-');
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

async function readProducts() {
  const data = await fs.readFile('products.json', 'utf-8');
  return JSON.parse(data);
}

async function writeProducts(products) {
  await fs.writeFile('products.json', JSON.stringify(products, null, 2));
}

app.get('/api/products', async (req, res) => {
  try {
    const products = await readProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load products' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const products = await readProducts();
    const newProduct = req.body;
    
    if (!newProduct.id) {
      const prefix = newProduct.category.substring(0, 2).toUpperCase();
      newProduct.id = `${prefix}${Date.now()}`;
    }
    
    let categoryIndex = products.findIndex(c => c.category === newProduct.category);
    
    if (categoryIndex === -1) {
      products.push({
        category: newProduct.category,
        items: [newProduct]
      });
    } else {
      products[categoryIndex].items.push(newProduct);
    }
    
    await writeProducts(products);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const products = await readProducts();
    const updatedProduct = req.body;
    let found = false;
    
    for (const category of products) {
      const index = category.items.findIndex(item => item.id === req.params.id);
      if (index !== -1) {
        category.items[index] = { ...category.items[index], ...updatedProduct };
        found = true;
        break;
      }
    }
    
    if (!found) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    await writeProducts(products);
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const products = await readProducts();
    let found = false;
    
    for (const category of products) {
      const index = category.items.findIndex(item => item.id === req.params.id);
      if (index !== -1) {
        category.items.splice(index, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    await writeProducts(products);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    message: 'File uploaded',
    filename: req.file.filename,
    path: `/images/${req.file.filename}`
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin.html`);
  console.log(`🛒 Store: http://localhost:${PORT}/index.html`);
});