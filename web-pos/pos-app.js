import { app } from "./firebase-init.js";
import {
    getFirestore,
    doc,
    collection,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

console.log("POS App v1.2 - Checkout mode");

const db = getFirestore(app);

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

const productGrid = document.getElementById("productGrid");
const cartList = document.getElementById("cartList");
const subtotalEl = document.getElementById("subtotal");
const taxEl = document.getElementById("tax");
const totalEl = document.getElementById("total");
const checkoutBtn = document.getElementById("checkoutBtn");

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
        checkoutBtn.disabled = true;
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
        checkoutBtn.disabled = false;
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const tax = subtotal * 0.07;
    const total = subtotal + tax;

    subtotalEl.innerText = subtotal.toFixed(2);
    taxEl.innerText = tax.toFixed(2);
    totalEl.innerText = total.toFixed(2);
}

async function completeSale() {
    const soldItems = cart.map((item) => ({ id: item.id, qty: item.qty }));
    const originalText = checkoutBtn.innerHTML;

    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<span class="btn-icon">...</span> Completing Sale';

    try {
        await decrementInventoryAfterSale(soldItems);
        cart = [];
        updateCartUI();
        alert("Sale completed.");
    } catch (error) {
        console.warn("Inventory sync failed after sale:", error);
        alert("Could not complete the sale. Please review stock and try again.");
    } finally {
        checkoutBtn.innerHTML = originalText;
        checkoutBtn.disabled = cart.length === 0;
    }
}

async function decrementInventoryAfterSale(soldItems) {
    const firestoreItems = soldItems.filter((item) => !String(item.id).startsWith("local-"));

    for (const item of firestoreItems) {
        const productRef = doc(db, "products", item.id);
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

init();
