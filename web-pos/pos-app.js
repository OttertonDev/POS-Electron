import { app } from "./firebase-init.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    collection,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

console.log("POS App v1.4 - Silent print + receipts");

const db = getFirestore(app);

const PRINT_SERVICE_URL = "http://127.0.0.1:3011";
const SERVICE_POLL_INTERVAL_MS = 5000;

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
let pendingPrintedSale = null;

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
    await loadReceiptSettings();
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
            const note = pendingPrintedSale
                ? `Receipt ${pendingPrintedSale.receiptId} already printed. Finish saving the sale.`
                : `Ready to print via ${result.printerName || "configured printer"}.`;
            setServiceStatus("ready", "Print Service Ready", note);
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

async function loadReceiptSettings() {
    try {
        const snap = await getDoc(doc(db, "settings", "receipt"));
        if (snap.exists()) {
            receiptSettings = { ...receiptSettings, ...snap.data() };
        }
    } catch (error) {
        console.warn("Could not load receipt settings:", error);
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

    checkoutBtn.disabled = (cart.length === 0 && !pendingPrintedSale) || saleInFlight || !serviceReady;
}

function getBusinessDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

async function reserveReceiptId() {
    const businessDate = getBusinessDateKey();
    const counterRef = doc(db, "receiptCounters", businessDate);

    return runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        const currentSequence = snap.exists() ? Math.max(0, Number(snap.data().lastSequence) || 0) : 0;
        const nextSequence = currentSequence + 1;

        transaction.set(counterRef, {
            businessDate,
            lastSequence: nextSequence,
            updatedAt: serverTimestamp()
        }, { merge: true });

        return `${businessDate}-${String(nextSequence).padStart(4, "0")}`;
    });
}

function buildReceiptPayload(receiptId) {
    const subtotal = subtotalEl.innerText;
    const tax = taxEl.innerText;
    const total = totalEl.innerText;
    const now = new Date();

    return {
        receiptId,
        storeName: receiptSettings.storeName || "Otterton's Point of Sale",
        address: receiptSettings.address || "",
        phone: receiptSettings.phone || "",
        date: `${now.toLocaleDateString("th-TH")} ${now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`,
        items: cart.map((item) => ({
            productId: item.id,
            qty: `${item.qty}x`,
            quantity: item.qty,
            name: item.name,
            unitPrice: item.price.toFixed(2),
            price: (item.price * item.qty).toFixed(2)
        })),
        subtotal,
        tax,
        total,
        cash: total,
        change: "0.00",
        footer: receiptSettings.footer || "---"
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

function getAuthSnapshot() {
    const state = window.webPosAuthState || {};
    return {
        uid: state.user?.uid || "",
        email: state.user?.email || "",
        role: state.role || ""
    };
}

async function writeReceiptRecord(payload) {
    const receiptRef = doc(db, "receipts", payload.receiptId);
    const authSnapshot = getAuthSnapshot();
    const businessDate = payload.receiptId.split("-")[0];

    await setDoc(receiptRef, {
        receiptId: payload.receiptId,
        businessDate,
        printedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        storeName: payload.storeName,
        address: payload.address,
        phone: payload.phone,
        dateLabel: payload.date,
        subtotal: payload.subtotal,
        tax: payload.tax,
        total: payload.total,
        cash: payload.cash,
        change: payload.change,
        footer: payload.footer,
        items: payload.items.map((item) => ({
            productId: item.productId || "",
            qty: item.qty,
            quantity: item.quantity,
            name: item.name,
            unitPrice: item.unitPrice,
            price: item.price
        })),
        printer: {
            serviceUrl: PRINT_SERVICE_URL,
            mode: "raw-thai-255"
        },
        cashier: authSnapshot
    });
}

async function finalizePrintedSale(context) {
    await writeReceiptRecord(context.payload);
    await decrementInventoryAfterSale(context.soldItems);
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
    const originalText = checkoutBtn.innerHTML;

    try {
        let context = pendingPrintedSale;

        if (!context) {
            const receiptId = await reserveReceiptId();
            const payload = buildReceiptPayload(receiptId);
            const soldItems = cart.map((item) => ({ id: item.id, qty: item.qty }));

            setServiceStatus("printing", "Printing Receipt", `Printing receipt ${receiptId}.`);
            checkoutBtn.disabled = true;
            checkoutBtn.innerHTML = '<span class="btn-icon">...</span> Printing Receipt';

            await sendPrintRequest(payload);
            context = { receiptId, payload, soldItems };
            pendingPrintedSale = context;
        } else {
            setServiceStatus(
                "printing",
                "Saving Printed Sale",
                `Receipt ${context.receiptId} already printed. Finishing Firestore save and inventory update.`
            );
            checkoutBtn.disabled = true;
            checkoutBtn.innerHTML = '<span class="btn-icon">...</span> Saving Sale';
        }

        await finalizePrintedSale(context);

        pendingPrintedSale = null;
        cart = [];
        setServiceStatus("ready", "Print Service Ready", `Receipt ${context.receiptId} printed and sale saved.`);
        updateCartUI();
        alert(`Receipt ${context.receiptId} printed and sale completed.`);
    } catch (error) {
        console.warn("Complete sale failed:", error);
        const printedAlready = Boolean(pendingPrintedSale);
        const errorMessage = printedAlready
            ? `${error.message || "Sale save failed."} Receipt already printed. Retry to finish saving without reprinting.`
            : (error.message || "Could not complete the sale.");

        setServiceStatus(
            "error",
            printedAlready ? "Sale Save Failed" : "Print Failed",
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
                throw new Error("Inventory update failed because a product was missing.");
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
