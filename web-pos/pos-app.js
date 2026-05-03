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

let products = [];
let cart = [];
let selectedCategoryKeys = new Set();
let selectedTagKeys = new Set();
let expandedCategoryKeys = new Set();
let serviceReady = false;
let saleInFlight = false;
let pendingPrintedSale = null;
let featureTagTree = [];
let productsLoaded = false;

const productGrid = document.getElementById("productGrid");
const cartList = document.getElementById("cartList");
const subtotalEl = document.getElementById("subtotal");
const taxEl = document.getElementById("tax");
const totalEl = document.getElementById("total");
const checkoutBtn = document.getElementById("checkoutBtn");
const serviceStatus = document.getElementById("serviceStatus");
const serviceStatusText = serviceStatus?.querySelector(".service-status-text");
const checkoutNote = document.getElementById("checkoutNote");
const featureTagTreeListEl = document.getElementById("featureTagTreeList");
const featureTagAllCheckbox = document.getElementById("featureTagAllCheckbox");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getCategoryAccent(category) {
    switch (category) {
        case "coffee":
            return "#8b5cf6";
        case "bakery":
            return "#f97316";
        case "tea":
            return "#14b8a6";
        default:
            return "#0f172a";
    }
}

function normalizeTagKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeCategoryName(value) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    return text || "Uncategorized";
}

function getCategoryKey(value) {
    return normalizeTagKey(normalizeCategoryName(value));
}

function normalizeFeatureTags(value, fallbackCategory = "") {
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    const tags = raw
        .map((tag) => {
            if (typeof tag === "string") {
                const name = tag.trim();
                if (!name) {
                    return null;
                }
                return {
                    name,
                    category: normalizeCategoryName(fallbackCategory)
                };
            }

            if (!tag || typeof tag !== "object") {
                return null;
            }

            const name = String(tag.name || tag.label || tag.title || "").trim();
            if (!name) {
                return null;
            }

            return {
                name,
                category: normalizeCategoryName(tag.category || fallbackCategory)
            };
        })
        .filter(Boolean);

    if (tags.length === 0 && fallbackCategory) {
        tags.push({ name: fallbackCategory, category: normalizeCategoryName(fallbackCategory) });
    }

    return tags;
}

function getTagKey(tag) {
    return normalizeTagKey(tag?.name || tag?.label || tag?.title || "");
}

function buildFeatureTagTree() {
    const tree = new Map();

    for (const product of products) {
        const tags = normalizeFeatureTags(product.featureTags, product.category);
        for (const tag of tags) {
            const categoryName = normalizeCategoryName(tag.category || product.category);
            const categoryKey = getCategoryKey(categoryName);
            const tagKey = getTagKey(tag);
            if (!tagKey) {
                continue;
            }

            if (!tree.has(categoryKey)) {
                tree.set(categoryKey, {
                    key: categoryKey,
                    name: categoryName,
                    tags: new Map()
                });
            }

            tree.get(categoryKey).tags.set(tagKey, {
                key: tagKey,
                name: tag.name,
                category: categoryName
            });
        }
    }

    featureTagTree = Array.from(tree.values())
        .map((category) => ({
            ...category,
            tags: Array.from(category.tags.values()).sort((a, b) => a.name.localeCompare(b.name, "th"))
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "th"));

    if (expandedCategoryKeys.size === 0) {
        expandedCategoryKeys = new Set(featureTagTree.map((category) => category.key));
    } else {
        expandedCategoryKeys = new Set(
            featureTagTree
                .filter((category) => expandedCategoryKeys.has(category.key))
                .map((category) => category.key)
        );
    }
}

function syncAllCheckboxState() {
    if (!featureTagAllCheckbox) {
        return;
    }

    featureTagAllCheckbox.checked = selectedCategoryKeys.size === 0 && selectedTagKeys.size === 0;
}

function clearFeatureTagFilters() {
    selectedCategoryKeys.clear();
    selectedTagKeys.clear();
}

function renderFeatureTagTree() {
    if (!featureTagTreeListEl) {
        return;
    }

    if (featureTagTree.length === 0) {
        featureTagTreeListEl.innerHTML = '<div class="tree-empty">No feature tags found in Firestore.</div>';
        syncAllCheckboxState();
        return;
    }

    featureTagTreeListEl.innerHTML = featureTagTree.map((category) => {
        const categoryChecked = selectedCategoryKeys.has(category.key);
        const categoryOpen = expandedCategoryKeys.has(category.key);
        const tagCount = category.tags.length;

        return `
            <section class="tree-folder ${categoryOpen ? "is-open" : ""}" data-category-key="${escapeHtml(category.key)}">
                <button type="button" class="tree-folder-header" data-category-toggle="${escapeHtml(category.key)}">
                    <span class="folder-left">
                        <input type="checkbox" class="category-checkbox" data-category-checkbox="${escapeHtml(category.key)}" ${categoryChecked ? "checked" : ""}>
                        <span>${escapeHtml(category.name)}</span>
                    </span>
                    <span class="folder-meta">${tagCount} tag${tagCount === 1 ? "" : "s"}</span>
                    <i data-lucide="chevron-right" class="folder-toggle"></i>
                </button>
                <div class="tree-folder-body" ${categoryOpen ? "" : "hidden"}>
                    ${category.tags.map((tag) => {
                        const tagChecked = selectedTagKeys.has(tag.key);
                        return `
                            <label class="tree-tag-option">
                                <input type="checkbox" data-tag-checkbox="${escapeHtml(tag.key)}" data-category-key="${escapeHtml(category.key)}" ${tagChecked ? "checked" : ""}>
                                <span>${escapeHtml(tag.name)}</span>
                            </label>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }).join("");

    featureTagTreeListEl.querySelectorAll("[data-category-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const categoryKey = button.dataset.categoryToggle;
            if (!categoryKey) {
                return;
            }

            if (expandedCategoryKeys.has(categoryKey)) {
                expandedCategoryKeys.delete(categoryKey);
            } else {
                expandedCategoryKeys.add(categoryKey);
            }

            renderFeatureTagTree();
        });
    });

    featureTagTreeListEl.querySelectorAll("[data-category-checkbox]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const categoryKey = checkbox.dataset.categoryCheckbox;
            if (!categoryKey) {
                return;
            }

            const category = featureTagTree.find((entry) => entry.key === categoryKey);
            if (!category) {
                return;
            }

            if (checkbox.checked) {
                selectedCategoryKeys.add(categoryKey);
                category.tags.forEach((tag) => selectedTagKeys.add(tag.key));
            } else {
                selectedCategoryKeys.delete(categoryKey);
                category.tags.forEach((tag) => selectedTagKeys.delete(tag.key));
            }

            syncAllCheckboxState();
            renderFeatureTagTree();
            renderProducts();
        });
    });

    featureTagTreeListEl.querySelectorAll("[data-tag-checkbox]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const tagKey = checkbox.dataset.tagCheckbox;
            const categoryKey = checkbox.dataset.categoryKey;
            if (!tagKey || !categoryKey) {
                return;
            }

            const category = featureTagTree.find((entry) => entry.key === categoryKey);
            if (!category) {
                return;
            }

            if (checkbox.checked) {
                selectedTagKeys.add(tagKey);
                if (category.tags.every((tag) => selectedTagKeys.has(tag.key))) {
                    selectedCategoryKeys.add(categoryKey);
                }
            } else {
                selectedTagKeys.delete(tagKey);
                selectedCategoryKeys.delete(categoryKey);
            }

            syncAllCheckboxState();
            renderFeatureTagTree();
            renderProducts();
        });
    });

    if (featureTagAllCheckbox) {
        featureTagAllCheckbox.onchange = () => {
            if (featureTagAllCheckbox.checked) {
                clearFeatureTagFilters();
                expandedCategoryKeys = new Set(featureTagTree.map((category) => category.key));
                renderFeatureTagTree();
                renderProducts();
                return;
            }

            if (selectedCategoryKeys.size === 0 && selectedTagKeys.size === 0) {
                featureTagAllCheckbox.checked = true;
            }
        };
    }

    syncAllCheckboxState();

    if (window.lucide) {
        lucide.createIcons();
    }
}

function getProductInitials(name) {
    return String(name || "Item")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] || "")
        .join("")
        .toUpperCase() || "IT";
}

async function init() {
    await loadReceiptSettings();
    startProductSync();

    renderProducts();
    updateCartUI();
    document.getElementById("currentDate").innerText = new Date().toLocaleDateString("th-TH");

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
        productsLoaded = true;

        if (snapshot.empty) {
            products = [];
            buildFeatureTagTree();
            renderFeatureTagTree();
            renderProducts();
            updateCartUI();
            return;
        }

        products = snapshot.docs
            .map((snap) => {
                const data = snap.data();
                const featureTags = normalizeFeatureTags(data.featureTags, data.category || "");
                return {
                    id: snap.id,
                    name: data.name || "Unnamed Item",
                    category: data.category || featureTags[0]?.name || "uncategorized",
                    featureTags,
                    price: Number(data.price) || 0,
                    img: data.img || "",
                    stockQty: Math.max(0, Math.floor(Number(data.stockQty) || 0)),
                    reorderLevel: Math.max(0, Math.floor(Number(data.reorderLevel) || 0)),
                    active: data.active !== false
                };
            })
            .filter((item) => item.active);

        syncCartWithInventory();
        buildFeatureTagTree();
        renderFeatureTagTree();
        renderProducts();
        updateCartUI();
    }, (error) => {
        console.warn("Could not subscribe to products from Firestore.", error);
        productsLoaded = true;
        products = [];
        buildFeatureTagTree();
        renderFeatureTagTree();
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
    if (!productsLoaded) {
        productGrid.innerHTML = `
            <div class="empty-cart" style="grid-column: 1 / -1; height: 180px; background: white; border-radius: 14px; border: 1px dashed #cbd5e1;">
                <p>Loading products from Firestore...</p>
            </div>
        `;
        return;
    }

    const filtered = products.filter((product) => {
        if (product.stockQty <= 0) {
            return false;
        }

        if (selectedCategoryKeys.size === 0 && selectedTagKeys.size === 0) {
            return true;
        }

        const tags = normalizeFeatureTags(product.featureTags, product.category);
        const productCategoryKey = getCategoryKey(product.category || tags[0]?.category || "");
        const categoryMatch = selectedCategoryKeys.has(productCategoryKey);
        const tagMatch = tags.some((tag) => selectedTagKeys.has(getTagKey(tag)));

        return categoryMatch || tagMatch;
    });

    if (filtered.length === 0) {
        productGrid.innerHTML = `
            <div class="empty-cart" style="grid-column: 1 / -1; height: 180px; background: white; border-radius: 14px; border: 1px dashed #cbd5e1;">
                <p>No products found in Firestore.</p>
            </div>
        `;
        return;
    }

    productGrid.innerHTML = filtered.map((product) => `
        <div class="product-card" onclick='addToCart(${JSON.stringify(product.id)})'>
            <div class="product-media" style="--media-accent:${getCategoryAccent(product.category)};">
                <span>${escapeHtml(getProductInitials(product.name))}</span>
            </div>
            <div class="product-info">
                <h3>${escapeHtml(product.name)}</h3>
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
            checkoutBtn.textContent = "Printing Receipt";

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
            checkoutBtn.textContent = "Saving Sale";
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
        checkoutBtn.textContent = originalText;
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
