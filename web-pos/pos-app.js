import { app } from "./firebase-init.js";
import {
    getFirestore,
    doc,
    collection,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

console.log("POS App v1.3 - Silent print checkout mode");

const db = getFirestore(app);

const PRINT_SERVICE_URL = "http://127.0.0.1:3011";
const SERVICE_POLL_INTERVAL_MS = 5000;
const DEFAULT_STORE_NAME = "Otterton's Point of Sale";
const DEFAULT_FOOTER = "ขอบคุณที่ใช้บริการ";

const FALLBACK_PRODUCTS = [
    { id: "local-1", name: "Iced Americano", price: 65, category: "coffee", img: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200", stockQty: 99, reorderLevel: 5 },
    { id: "local-2", name: "Hot Latte", price: 60, category: "coffee", img: "https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&q=80&w=200", stockQty: 99, reorderLevel: 5 },
    { id: "local-3", name: "Butter Croissant", price: 85, category: "bakery", img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=200", stockQty: 99, reorderLevel: 5 },
    { id: "local-4", name: "Chocolate Lava", price: 120, category: "bakery", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=200", stockQty: 99, reorderLevel: 5 },
    { id: "local-5", name: "Matcha Latte", price: 75, category: "tea", img: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&q=80&w=200", stockQty: 99, reorderLevel: 5 },
    { id: "local-6", name: "Thai Milk Tea", price: 55, category: "tea", img: "https://images.unsplash.com/photo-1558239027-d09f7a636952?auto=format&fit=crop&q=80&w=200", stockQty: 99, reorderLevel: 5 }
];

let products = [...FALLBACK_PRODUCTS];
let cart = [];
let currentCategory = "coffee";
let serviceReady = false;
let saleInFlight = false;

const productGrid = document.getElementById("productGrid");
const cartList = document.getElementById("cartList");
const subtotalEl = document.getElementById("subtotal");
const taxEl = document.getElementById("tax");
const totalEl = document.getElementById("total");
const checkoutBtn = document.getElementById("checkoutBtn");
const serviceStatus = document.getElementById("serviceStatus");
const serviceStatusText = serviceStatus?.querySelector(".service-status-text");
const checkoutNote = document.getElementById("checkoutNote");

async function init() {
    startProductSync();

    renderProducts();
    updateCartUI();
    document.getElementById("currentDate").innerText = new Date().toLocaleDateString("th-TH");

    document.querySelectorAll(".cat-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelector(".cat-btn.active")?.classList.remove("active");
            btn.classList.add("active");
            currentCategory = btn.dataset.category;
            renderProducts();
        });
    });

    checkoutBtn?.addEventListener("click", completeSale);

    await refreshPrintServiceStatus();
    window.setInterval(refreshPrintServiceStatus, SERVICE_POLL_INTERVAL_MS);
}

function setServiceStatus(state, message, note) {
    if (!serviceStatus || !serviceStatusText) {
        return;
    }

    serviceStatus.classList.remove(
        "service-status-ready",
        "service-status-printing",
        "service-status-error",
        "service-status-offline"
    );
    serviceStatus.classList.add(`service-status-${state}`);
    serviceStatusText.textContent = message;

    if (checkoutNote) {
        checkoutNote.textContent = note;
    }
}

async function refreshPrintServiceStatus() {
    if (saleInFlight) {
        return;
    }

    try {
        const response = await fetch(`${PRINT_SERVICE_URL}/health`);
        const result = await response.json();
        serviceReady = Boolean(result.success);

        if (serviceReady) {
            setServiceStatus(
                "ready",
                "Print Service Ready",
                `Ready to print via ${result.printerName || "configured printer"}.`
            );
        } else {
            setServiceStatus(
                "offline",
                "Print Service Needs Setup",
                result.message || "Configure the local silent print service before completing the sale."
            );
        }
    } catch (error) {
        serviceReady = false;
        setServiceStatus(
            "offline",
            "Print Service Offline",
            "Start the local silent print service before completing the sale."
        );
    } finally {
        updateCartUI();
    }
}

function startProductSync() {
    onSnapshot(collection(db, "products"), (snapshot) => {
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
                    name: data.name || "Unnamed Item",
                    category: data.category || "coffee",
                    price: Number(data.price) || 0,
                    img: data.img || "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200",
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
        console.warn("Could not subscribe to products. Using fallback data.", error);
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

function renderProducts() {
    const filtered = products.filter((product) => product.category === currentCategory && product.stockQty > 0);

    if (filtered.length === 0) {
        productGrid.innerHTML = `
            <div class="empty-cart" style="grid-column: 1 / -1; height: 180px; background: white; border-radius: 14px; border: 1px dashed #cbd5e1;">
                <p>No products in this category.</p>
            </div>
        `;
        return;
    }

    productGrid.innerHTML = filtered.map((product) => `
        <div class="product-card" onclick='addToCart(${JSON.stringify(product.id)})'>
            <img src="${product.img}" alt="${product.name}" class="product-img">
            <div class="product-info">
                <h3>${product.name}</h3>
                <div class="product-price">THB ${product.price.toFixed(2)}</div>
                <div style="font-size:0.8rem;color:#64748b;">Stock: ${product.stockQty}</div>
            </div>
        </div>
    `).join("");
}

window.addToCart = function(id) {
    if (saleInFlight) {
        return;
    }

    const product = products.find((item) => item.id === id);
    if (!product) {
        return;
    }

    const existing = cart.find((item) => item.id === id);
    const qtyInCart = existing ? existing.qty : 0;
    if (qtyInCart >= product.stockQty) {
        alert("Insufficient stock for this item.");
        return;
    }

    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    updateCartUI();
};

function updateCartUI() {
    if (cart.length === 0) {
        cartList.innerHTML = `
            <div class="empty-cart">
                <img src="https://cdn-icons-png.flaticon.com/512/11329/11329060.png" alt="Empty Cart">
                <p>Order is empty</p>
            </div>
        `;
    } else {
        cartList.innerHTML = cart.map((item) => `
            <div class="cart-item">
                <div class="item-details">
                    <div style="font-weight: 600;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: #64748b;">THB ${item.price.toFixed(2)} x ${item.qty}</div>
                </div>
                <div style="font-weight: 700;">THB ${(item.price * item.qty).toFixed(2)}</div>
            </div>
        `).join("");
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const tax = subtotal * 0.07;
    const total = subtotal + tax;

    subtotalEl.innerText = subtotal.toFixed(2);
    taxEl.innerText = tax.toFixed(2);
    totalEl.innerText = total.toFixed(2);

    checkoutBtn.disabled = cart.length === 0 || saleInFlight || !serviceReady;
}

function buildReceiptPayload() {
    const subtotal = subtotalEl.innerText;
    const tax = taxEl.innerText;
    const total = totalEl.innerText;
    const now = new Date();

    return {
        storeName: DEFAULT_STORE_NAME,
        date: `${now.toLocaleDateString("th-TH")} ${now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
        items: cart.map((item) => ({
            qty: `${item.qty}x`,
            name: item.name,
            price: (item.price * item.qty).toFixed(2)
        })),
        subtotal,
        tax,
        total,
        cash: total,
        change: "0.00",
        footer: DEFAULT_FOOTER
    };
}

async function sendPrintRequest(payload) {
    const response = await fetch(`${PRINT_SERVICE_URL}/print`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.message || "Print service rejected the receipt.");
    }
}

async function completeSale() {
    if (saleInFlight) {
        return;
    }

    if (!serviceReady) {
        alert("Print service is offline. Start the local print service before completing the sale.");
        return;
    }

    saleInFlight = true;
    const soldItems = cart.map((item) => ({ id: item.id, qty: item.qty }));
    const originalText = checkoutBtn.innerHTML;

    setServiceStatus("printing", "Printing Receipt", "Sending receipt to the local silent print service.");
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<span class="btn-icon">...</span> Printing Receipt';

    try {
        const payload = buildReceiptPayload();
        await sendPrintRequest(payload);

        checkoutBtn.innerHTML = '<span class="btn-icon">...</span> Updating Inventory';
        await decrementInventoryAfterSale(soldItems);

        cart = [];
        serviceReady = true;
        setServiceStatus("ready", "Print Service Ready", "Receipt printed and sale completed.");
        updateCartUI();
        alert("Receipt printed and sale completed.");
    } catch (error) {
        console.warn("Complete sale failed:", error);
        const errorMessage = error.message || "Could not complete the sale.";
        const inventoryFailure = errorMessage.includes("inventory");

        serviceReady = inventoryFailure ? serviceReady : false;
        setServiceStatus(
            "error",
            inventoryFailure ? "Inventory Update Failed" : "Print Failed",
            errorMessage
        );
        alert(errorMessage);
    } finally {
        saleInFlight = false;
        checkoutBtn.innerHTML = originalText;
        await refreshPrintServiceStatus();
    }
}

async function decrementInventoryAfterSale(soldItems) {
    const firestoreItems = soldItems.filter((item) => !String(item.id).startsWith("local-"));

    for (const item of firestoreItems) {
        const productRef = doc(db, "products", item.id);
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(productRef);
            if (!snap.exists()) {
                throw new Error("Printed receipt, but inventory update failed because an item was missing.");
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

init();
