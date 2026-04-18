const PLUGIN_URL = 'http://localhost:3001';

// Sample Product Data
const products = [
    { id: 1, name: 'Iced Americano', price: 65, category: 'coffee', img: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200' },
    { id: 2, name: 'Hot Latte', price: 60, category: 'coffee', img: 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&q=80&w=200' },
    { id: 3, name: 'Butter Croissant', price: 85, category: 'bakery', img: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=200' },
    { id: 4, name: 'Chocolate Lava', price: 120, category: 'bakery', img: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=200' },
    { id: 5, name: 'Matcha Latte', price: 75, category: 'tea', img: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&q=80&w=200' },
    { id: 6, name: 'Thai Milk Tea', price: 55, category: 'tea', img: 'https://images.unsplash.com/photo-1558239027-d09f7a636952?auto=format&fit=crop&q=80&w=200' }
];

let cart = [];
let currentCategory = 'coffee';

// UI Elements
const productGrid = document.getElementById('productGrid');
const cartList = document.getElementById('cartList');
const subtotalEl = document.getElementById('subtotal');
const taxEl = document.getElementById('tax');
const totalEl = document.getElementById('total');
const printBtn = document.getElementById('printBtn');
const pluginStatus = document.getElementById('pluginStatus');
const statusText = pluginStatus.querySelector('.status-text');

/**
 * Initialize Web POS
 */
function init() {
    renderProducts();
    updateCartUI();
    checkPluginConnection();
    setInterval(checkPluginConnection, 5000);
    
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('th-TH');

    // Category Switching
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.cat-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            renderProducts();
        });
    });

    printBtn.addEventListener('click', sendPrintJob);
}

/**
 * Render products based on selected category
 */
function renderProducts() {
    const filtered = products.filter(p => p.category === currentCategory);
    productGrid.innerHTML = filtered.map(p => `
        <div class="product-card" onclick="addToCart(${p.id})">
            <img src="${p.img}" alt="${p.name}" class="product-img">
            <div class="product-info">
                <h3>${p.name}</h3>
                <div class="product-price">฿${p.price.toFixed(2)}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Add product to cart
 */
window.addToCart = function(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ ...product, qty: 1 });
    }
    updateCartUI();
};

/**
 * Update the Cart sidebar UI
 */
function updateCartUI() {
    if (cart.length === 0) {
        cartList.innerHTML = `
            <div class="empty-cart">
                <img src="https://cdn-icons-png.flaticon.com/512/11329/11329060.png" alt="Empty Cart">
                <p>Order is empty</p>
            </div>
        `;
        printBtn.disabled = true;
    } else {
        cartList.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="item-details">
                    <div style="font-weight: 600;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: #64748b;">฿${item.price.toFixed(2)} x ${item.qty}</div>
                </div>
                <div style="font-weight: 700;">฿${(item.price * item.qty).toFixed(2)}</div>
            </div>
        `).join('');
        printBtn.disabled = !(pluginStatus.classList.contains('online'));
    }

    // Calculations
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const tax = subtotal * 0.07;
    const total = subtotal + tax;

    subtotalEl.innerText = subtotal.toFixed(2);
    taxEl.innerText = tax.toFixed(2);
    totalEl.innerText = total.toFixed(2);
}

/**
 * Check connectivity to the local Electron Plugin
 */
async function checkPluginConnection() {
    try {
        const response = await fetch(`${PLUGIN_URL}/printers`);
        if (response.ok) {
            pluginStatus.classList.remove('offline');
            pluginStatus.classList.add('online');
            statusText.innerText = 'Plugin Online';
            if (cart.length > 0) printBtn.disabled = false;
        } else {
            throw new Error();
        }
    } catch (err) {
        pluginStatus.classList.remove('online');
        pluginStatus.classList.add('offline');
        statusText.innerText = 'Plugin Offline';
        printBtn.disabled = true;
    }
}

/**
 * Send print request to the local plugin
 */
async function sendPrintJob() {
    const originalText = printBtn.innerHTML;
    printBtn.disabled = true;
    printBtn.innerHTML = 'Sending to printer...';

    const receiptData = {
        data: {
            storeName: "Vozy Premium Cafe",
            address: "Building B, Sukhumvit Road",
            phone: "02-XXX-XXXX",
            items: cart.map(item => ({
                qty: `${item.qty}x`,
                name: item.name,
                price: (item.price * item.qty).toFixed(2)
            })),
            total: totalEl.innerText,
            cash: totalEl.innerText, // Assuming exact cash for demo
            change: "0.00",
            footer: "Thank you! Please enjoy your coffee."
        }
    };

    try {
        const res = await fetch(`${PLUGIN_URL}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(receiptData)
        });

        const result = await res.json();
        if (result.success) {
            alert('Print Successful!');
            cart = [];
            updateCartUI();
        } else {
            alert('Print Error: ' + result.error);
        }
    } catch (err) {
        alert('Could not connect to printer plugin.');
    } finally {
        printBtn.innerHTML = originalText;
        printBtn.disabled = (cart.length === 0);
    }
}

// Start the app
init();
