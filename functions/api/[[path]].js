// functions/api/[[path]].js
// Cloudflare Pages Function for product CRUD operations

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '');
  const method = request.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // GET all products
    if (method === 'GET' && path === '/products') {
      const products = await env.FRESHKA_PRODUCTS.get('products', { type: 'json' });
      
      if (!products) {
        return new Response(JSON.stringify([]), { 
          headers: corsHeaders 
        });
      }
      
      return new Response(JSON.stringify(products), { 
        headers: corsHeaders 
      });
    }

    // GET single product by ID
    if (method === 'GET' && path.startsWith('/products/')) {
      const id = path.split('/').pop();
      const products = await env.FRESHKA_PRODUCTS.get('products', { type: 'json' }) || [];
      
      for (const category of products) {
        const product = category.items.find(item => item.id === id);
        if (product) {
          return new Response(JSON.stringify(product), { 
            headers: corsHeaders 
          });
        }
      }
      
      return new Response(JSON.stringify({ error: 'Product not found' }), { 
        status: 404,
        headers: corsHeaders 
      });
    }

    // POST - Create new product
    if (method === 'POST' && path === '/products') {
      const newProduct = await request.json();
      const products = await env.FRESHKA_PRODUCTS.get('products', { type: 'json' }) || [];
      
      // Generate ID if not provided
      if (!newProduct.id) {
        const prefix = newProduct.category.substring(0, 2).toUpperCase();
        newProduct.id = `${prefix}${Date.now()}`;
      }
      
      // Find or create category
      let categoryIndex = products.findIndex(c => c.category === newProduct.category);
      
      if (categoryIndex === -1) {
        // Create new category
        products.push({
          category: newProduct.category,
          items: [newProduct]
        });
      } else {
        // Add to existing category
        products[categoryIndex].items.push(newProduct);
      }
      
      // Save to KV
      await env.FRESHKA_PRODUCTS.put('products', JSON.stringify(products));
      
      return new Response(JSON.stringify(newProduct), { 
        status: 201,
        headers: corsHeaders 
      });
    }

    // PUT - Update product
    if (method === 'PUT' && path.startsWith('/products/')) {
      const id = path.split('/').pop();
      const updatedProduct = await request.json();
      const products = await env.FRESHKA_PRODUCTS.get('products', { type: 'json' }) || [];
      
      let found = false;
      
      for (const category of products) {
        const index = category.items.findIndex(item => item.id === id);
        if (index !== -1) {
          // Update product while preserving ID
          category.items[index] = { 
            ...category.items[index], 
            ...updatedProduct,
            id: id // Ensure ID doesn't change
          };
          found = true;
          break;
        }
      }
      
      if (!found) {
        return new Response(JSON.stringify({ error: 'Product not found' }), { 
          status: 404,
          headers: corsHeaders 
        });
      }
      
      // Save to KV
      await env.FRESHKA_PRODUCTS.put('products', JSON.stringify(products));
      
      return new Response(JSON.stringify(updatedProduct), { 
        headers: corsHeaders 
      });
    }

    // DELETE - Remove product
    if (method === 'DELETE' && path.startsWith('/products/')) {
      const id = path.split('/').pop();
      const products = await env.FRESHKA_PRODUCTS.get('products', { type: 'json' }) || [];
      
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
        return new Response(JSON.stringify({ error: 'Product not found' }), { 
          status: 404,
          headers: corsHeaders 
        });
      }
      
      // Save to KV
      await env.FRESHKA_PRODUCTS.put('products', JSON.stringify(products));
      
      return new Response(JSON.stringify({ 
        message: 'Product deleted successfully',
        id: id 
      }), { 
        headers: corsHeaders 
      });
    }

    // Route not found
    return new Response(JSON.stringify({ 
      error: 'Route not found',
      path: path,
      method: method
    }), { 
      status: 404,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), { 
      status: 500,
      headers: corsHeaders 
    });
  }
}