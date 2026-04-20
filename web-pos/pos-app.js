import { app } from "./firebase-init.js";
import {
    getFirestore,
    doc,
    getDoc,
    collection,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

console.log("POS App v1.2 - Loading with Cloud Settings...");

const db = getFirestore(app);

const PLUGIN_URL = 'http://localhost:3001';
const PRINT_STRATEGY = 'browser-first';

// Receipt settings loaded from Firestore (populated on init)
let receiptSettings = {
    storeName: "Otterton's Point of Sale (Loading...)", 
  address: "---",
  phone: "---",
  footer: "---",
  fontSize: 13,
  storeNameFontSize: 16,
  storeNameAlign: "center",
  addressFontSize: 11,
  addressAlign: "center"
};

const FALLBACK_PRODUCTS = [
    { id: 'local-1', name: 'Iced Americano', price: 65, category: 'coffee', img: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200', stockQty: 99, reorderLevel: 5 },
    { id: 'local-2', name: 'Hot Latte', price: 60, category: 'coffee', img: 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&q=80&w=200', stockQty: 99, reorderLevel: 5 },
    { id: 'local-3', name: 'Butter Croissant', price: 85, category: 'bakery', img: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=200', stockQty: 99, reorderLevel: 5 },
    { id: 'local-4', name: 'Chocolate Lava', price: 120, category: 'bakery', img: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=200', stockQty: 99, reorderLevel: 5 },
    { id: 'local-5', name: 'Matcha Latte', price: 75, category: 'tea', img: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&q=80&w=200', stockQty: 99, reorderLevel: 5 },
    { id: 'local-6', name: 'Thai Milk Tea', price: 55, category: 'tea', img: 'https://images.unsplash.com/photo-1558239027-d09f7a636952?auto=format&fit=crop&q=80&w=200', stockQty: 99, reorderLevel: 5 }
];

let products = [...FALLBACK_PRODUCTS];

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
async function init() {
    // Do not block POS boot forever if Firestore is slow/unreachable.
    await loadReceiptSettingsWithTimeout(2500);
    startProductSync();

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

async function loadReceiptSettingsWithTimeout(timeoutMs) {
    let timerId;
    try {
        await Promise.race([
            loadReceiptSettings(),
            new Promise((resolve) => {
                timerId = setTimeout(resolve, timeoutMs);
            })
        ]);
    } finally {
        if (timerId) {
            clearTimeout(timerId);
        }
    }
}

function startProductSync() {
    onSnapshot(collection(db, 'products'), (snapshot) => {
        if (snapshot.empty) {
            products = [...FALLBACK_PRODUCTS];
            renderProducts();
            updateCartUI();
            return;
        }

        products = snapshot.docs
            .map((snap) => {
                const data = snap.data();
                return {
                    id: snap.id,
                    name: data.name || 'Unnamed Item',
                    category: data.category || 'coffee',
                    price: Number(data.price) || 0,
                    img: data.img || 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200',
                    stockQty: Math.max(0, Math.floor(Number(data.stockQty) || 0)),
                    reorderLevel: Math.max(0, Math.floor(Number(data.reorderLevel) || 0)),
                    active: data.active !== false
                };
            })
            .filter((item) => item.active);

        syncCartWithInventory();
        renderProducts();
        updateCartUI();
    }, (error) => {
        console.warn('Could not subscribe to products. Using fallback data.', error);
        products = [...FALLBACK_PRODUCTS];
        renderProducts();
        updateCartUI();
    });
}

function syncCartWithInventory() {
    cart = cart
        .map((item) => {
            const latest = products.find((product) => product.id === item.id);
            if (!latest) {
                return null;
            }

            const maxQty = Math.max(0, latest.stockQty);
            if (maxQty === 0) {
                return null;
            }

            return {
                ...latest,
                qty: Math.min(item.qty, maxQty)
            };
        })
        .filter(Boolean);
}

/**
 * Load saved receipt settings from Firestore.
 * Falls back to defaults if the document doesn't exist yet.
 */
async function loadReceiptSettings() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'receipt'));
        if (snap.exists()) {
            receiptSettings = { ...receiptSettings, ...snap.data() };
            console.log('Receipt settings loaded from Firestore:', receiptSettings);
        } else {
            console.log('No saved receipt settings found, using defaults.');
        }
    } catch (err) {
        console.warn('Could not load receipt settings:', err);
    }
}

/**
 * Render products based on selected category
 */
function renderProducts() {
    const filtered = products.filter((p) => p.category === currentCategory && p.stockQty > 0);

    if (filtered.length === 0) {
        productGrid.innerHTML = `
            <div class="empty-cart" style="grid-column: 1 / -1; height: 180px; background: white; border-radius: 14px; border: 1px dashed #cbd5e1;">
                <p>No products in this category.</p>
            </div>
        `;
        return;
    }

    productGrid.innerHTML = filtered.map(p => `
        <div class="product-card" onclick='addToCart(${JSON.stringify(p.id)})'>
            <img src="${p.img}" alt="${p.name}" class="product-img">
            <div class="product-info">
                <h3>${p.name}</h3>
                <div class="product-price">฿${p.price.toFixed(2)}</div>
                <div style="font-size:0.8rem;color:#64748b;">Stock: ${p.stockQty}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Add product to cart
 */
window.addToCart = function(id) {
    const product = products.find(p => p.id === id);
    if (!product) {
        return;
    }

    const existing = cart.find(item => item.id === id);
    const qtyInCart = existing ? existing.qty : 0;
    if (qtyInCart >= product.stockQty) {
        alert('Insufficient stock for this item.');
        return;
    }
    
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
        printBtn.disabled = false;
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
                        statusText.innerText = 'Plugin Online (Fallback Ready)';
        } else {
            throw new Error();
        }
    } catch (err) {
        pluginStatus.classList.remove('online');
        pluginStatus.classList.add('offline');
                statusText.innerText = 'Plugin Offline (Browser Print Active)';
    }
}

function escapeHtml(value) {
        return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
}

function toMultilineHtml(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
}

function resolveAlign(value, fallback = 'center') {
        const align = String(value || fallback).toLowerCase();
        if (align === 'left' || align === 'right' || align === 'center') {
                return align;
        }
        return fallback;
}

function buildReceiptPayload() {
        const now = new Date();
        const formattedDate = `${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;

        return {
                storeName: receiptSettings.storeName,
                storeNameFontSize: receiptSettings.storeNameFontSize,
                storeNameAlign: receiptSettings.storeNameAlign,
                address: receiptSettings.address,
                addressFontSize: receiptSettings.addressFontSize,
                addressAlign: receiptSettings.addressAlign,
                phone: receiptSettings.phone,
                footer: receiptSettings.footer,
                fontSize: receiptSettings.fontSize,
                date: formattedDate,
                items: cart.map(item => ({
                        qty: `${item.qty}x`,
                        name: item.name,
                        price: (item.price * item.qty).toFixed(2)
                })),
                total: totalEl.innerText,
                cash: totalEl.innerText,
                change: '0.00'
        };
}

    const PAPER_WIDTH_MM = 58;
    const CONTENT_WIDTH_MM = 52;

function buildBrowserReceiptHtml(data) {
        const baseFontSize = Math.max(10, Math.min(16, Number(data.fontSize) || 13));
        const storeNameFontSize = Math.max(12, Math.min(22, Number(data.storeNameFontSize) || 16));
        const addressFontSize = Math.max(9, Math.min(16, Number(data.addressFontSize) || 11));

        const storeNameAlign = resolveAlign(data.storeNameAlign, 'center');
        const addressAlign = resolveAlign(data.addressAlign, 'center');

        const itemRows = (data.items || []).map((item) => `
                <div class="item-row">
                        <div class="item-qty">${escapeHtml(item.qty || '1x')}</div>
                        <div class="item-name">${escapeHtml(item.name || '---')}</div>
                        <div class="item-price">${escapeHtml(item.price || '0.00')}</div>
                </div>
        `).join('');

        return `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>Receipt Print</title>
    <style>
        @page { size: ${PAPER_WIDTH_MM}mm 160mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            width: ${PAPER_WIDTH_MM}mm !important;
            min-width: ${PAPER_WIDTH_MM}mm !important;
            max-width: ${PAPER_WIDTH_MM}mm !important;
        }
        body {
            width: ${PAPER_WIDTH_MM}mm;
            margin: 0 auto;
            color: #000;
            font-family: Tahoma, Prompt, "Noto Sans Thai", sans-serif;
            font-size: ${baseFontSize}px;
            line-height: 1.35;
            -webkit-font-smoothing: none;
            text-rendering: geometricPrecision;
            overflow: hidden;
        }
        @media print {
            html, body {
                width: ${PAPER_WIDTH_MM}mm !important;
                min-width: ${PAPER_WIDTH_MM}mm !important;
                max-width: ${PAPER_WIDTH_MM}mm !important;
                transform: none !important;
            }
            body {
                margin: 0 auto !important;
                writing-mode: horizontal-tb !important;
            }
            .receipt {
                page-break-after: avoid;
            }
        }
        .receipt {
            width: ${CONTENT_WIDTH_MM}mm;
            margin: 0 auto;
            padding: 0;
            padding-right: 0.4mm;
        }
        .header { text-align: center; margin-bottom: 8px; }
        .store-name {
            font-size: ${storeNameFontSize}px;
            font-weight: 700;
            text-align: ${storeNameAlign};
            margin-bottom: 3px;
            white-space: pre-line;
            word-break: break-word;
        }
        .address, .phone {
            text-align: ${addressAlign};
            font-size: ${addressFontSize}px;
            white-space: pre-line;
            word-break: break-word;
        }
        .date {
            text-align: center;
            font-size: 10px;
            margin-top: 3px;
        }
        .divider {
            border-top: 1px dashed #000;
            margin: 6px 0;
        }
        .item-row {
            display: flex;
            align-items: flex-start;
            margin-bottom: 2px;
            gap: 1px;
        }
        .item-qty { width: 14%; }
        .item-name { width: 54%; word-break: break-word; }
        .item-price { width: 32%; text-align: right; padding-right: 0.2mm; }
        .totals-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
        }
        .totals-row strong { font-weight: 700; }
        .footer {
            margin-top: 8px;
            text-align: center;
            white-space: pre-line;
            font-size: ${Math.max(10, baseFontSize - 1)}px;
            word-break: break-word;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <div class="store-name">${toMultilineHtml(data.storeName || "Otterton's Point of Sale")}</div>
            <div class="address">${toMultilineHtml(data.address || '')}</div>
            <div class="phone">โทร: ${escapeHtml(data.phone || '-')}</div>
            <div class="date">วันที่: ${escapeHtml(data.date || '')}</div>
        </div>

        <div class="divider"></div>
        ${itemRows || '<div class="item-row"><div class="item-name">No items</div></div>'}
        <div class="divider"></div>

        <div class="totals-row"><span>รวมเงิน (Total)</span><strong>${escapeHtml(data.total || '0.00')}</strong></div>
        <div class="totals-row"><span>เงินสด (Cash)</span><strong>${escapeHtml(data.cash || '0.00')}</strong></div>
        <div class="totals-row"><span>เงินทอน (Change)</span><strong>${escapeHtml(data.change || '0.00')}</strong></div>

        <div class="divider"></div>
        <div class="footer">${toMultilineHtml(data.footer || 'ขอบคุณที่ใช้บริการ')}</div>
    </div>

    <script>
        function applyDynamicPageSize() {
            const receipt = document.querySelector('.receipt');
            if (!receipt) {
                return;
            }

            const pxToMm = 25.4 / 96;
            const heightPx = Math.ceil(receipt.getBoundingClientRect().height);
            const targetHeightMm = Math.max(52, Math.min(500, (heightPx * pxToMm) + 0.6));

            const pageStyle = document.createElement('style');
            pageStyle.id = 'dynamic-page-size';
            pageStyle.textContent = '@page { size: ${PAPER_WIDTH_MM}mm ' + targetHeightMm.toFixed(2) + 'mm; margin: 0; }';
            document.head.appendChild(pageStyle);
        }

        window.addEventListener('load', function () {
            setTimeout(function () {
                applyDynamicPageSize();
                window.focus();
                window.print();
            }, 180);
        });

        window.addEventListener('afterprint', function () {
            setTimeout(function () {
                window.close();
            }, 80);
        });
    </script>
</body>
</html>`;
}

function printInBrowser(receiptPayload) {
        const printWindow = window.open('', '_blank', 'width=460,height=900');
        if (!printWindow) {
                return false;
        }

        printWindow.document.open();
        printWindow.document.write(buildBrowserReceiptHtml(receiptPayload));
        printWindow.document.close();
        return true;
}

async function sendPrintToPlugin(receiptPayload) {
        const res = await fetch(`${PLUGIN_URL}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: receiptPayload })
        });

        const result = await res.json();
        if (!result.success) {
                throw new Error(result.error || 'Plugin print failed.');
        }
}

/**
 * Send print request to the local plugin
 */
async function sendPrintJob() {
    const originalText = printBtn.innerHTML;
    printBtn.disabled = true;
    printBtn.innerHTML = 'Preparing receipt...';

    const receiptPayload = buildReceiptPayload();

    try {
        let printedVia = '';

        if (PRINT_STRATEGY === 'browser-first') {
            printBtn.innerHTML = 'Opening print dialog...';
            const browserPrinted = printInBrowser(receiptPayload);
            if (browserPrinted) {
                printedVia = 'browser';
            }
        }

        if (!printedVia) {
            printBtn.innerHTML = 'Sending to plugin...';
            await sendPrintToPlugin(receiptPayload);
            printedVia = 'plugin';
        }

        const soldItems = cart.map((item) => ({ id: item.id, qty: item.qty }));

        try {
            await decrementInventoryAfterSale(soldItems);
        } catch (inventoryErr) {
            console.warn('Inventory sync failed after print:', inventoryErr);
            alert('Print completed, but inventory sync failed. Please review stock page.');
        }

        if (printedVia === 'browser') {
            alert('Browser print dialog opened. Please complete printing from your browser dialog.');
        } else {
            alert('Print sent via local plugin successfully.');
        }

        cart = [];
        updateCartUI();
    } catch (err) {
        alert(`Print Error: ${err.message || err}`);
    } finally {
        printBtn.innerHTML = originalText;
        printBtn.disabled = (cart.length === 0);
    }
}

async function decrementInventoryAfterSale(soldItems) {
    const firestoreItems = soldItems.filter((item) => !String(item.id).startsWith('local-'));

    for (const item of firestoreItems) {
        const productRef = doc(db, 'products', item.id);
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(productRef);
            if (!snap.exists()) {
                return;
            }

            const currentQty = Math.max(0, Math.floor(Number(snap.data().stockQty) || 0));
            const nextQty = Math.max(0, currentQty - item.qty);
            transaction.update(productRef, {
                stockQty: nextQty,
                updatedAt: serverTimestamp()
            });
        });
    }
}

// Start the app
init();
