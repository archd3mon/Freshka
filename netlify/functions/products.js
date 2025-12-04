// netlify/functions/products.js
const fs = require('fs');
const path = require('path');

// In-memory storage (temporary - resets on redeploy)
let productsCache = null;

// Helper to load products from file
function loadProducts() {
  if (productsCache) return productsCache;
  
  try {
    const dataPath = path.join(__dirname, '../../data/products.json');
    const data = fs.readFileSync(dataPath, 'utf-8');
    productsCache = JSON.parse(data);
    return productsCache;
  } catch (error) {
    console.error('Error loading products:', error);
    return [];
  }
}

// Main handler
exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/products', '');
  const method = event.httpMethod;

  try {
    let products = loadProducts();

    // GET all products
    if (method === 'GET' && path === '') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(products)
      };
    }

    // GET single product by ID
    if (method === 'GET' && path.startsWith('/')) {
      const id = path.substring(1);
      for (const category of products) {
        const product = category.items.find(item => item.id === id);
        if (product) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(product)
          };
        }
      }
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Product not found' })
      };
    }

    // POST - Create new product
    if (method === 'POST' && path === '') {
      const newProduct = JSON.parse(event.body);
      
      // Generate ID if not provided
      if (!newProduct.id) {
        const prefix = newProduct.category.substring(0, 2).toUpperCase();
        newProduct.id = `${prefix}${Date.now()}`;
      }
      
      // Find or create category
      let categoryIndex = products.findIndex(c => c.category === newProduct.category);
      
      if (categoryIndex === -1) {
        products.push({
          category: newProduct.category,
          items: [newProduct]
        });
      } else {
        products[categoryIndex].items.push(newProduct);
      }
      
      productsCache = products;
      
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(newProduct)
      };
    }

    // PUT - Update product
    if (method === 'PUT' && path.startsWith('/')) {
      const id = path.substring(1);
      const updatedProduct = JSON.parse(event.body);
      let found = false;
      
      for (const category of products) {
        const index = category.items.findIndex(item => item.id === id);
        if (index !== -1) {
          category.items[index] = { ...category.items[index], ...updatedProduct };
          found = true;
          break;
        }
      }
      
      if (!found) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Product not found' })
        };
      }
      
      productsCache = products;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedProduct)
      };
    }

    // DELETE - Remove product
    if (method === 'DELETE' && path.startsWith('/')) {
      const id = path.substring(1);
      let found = false;
      
      for (const category of products) {
        const index = category.items.findIndex(item => item.id === id);
        if (index !== -1) {
          category.items.splice(index, 1);
          found = true;
          break;
        }
      }
      
      if (!found) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Product not found' })
        };
      }
      
      productsCache = products;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Product deleted successfully' })
      };
    }

    // Route not found
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Route not found' })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};