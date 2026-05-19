import { app } from "./firebase-init.js";
import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDocs,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const db = getFirestore(app);
const productsRef = collection(db, "products");
const featureTagsRef = collection(db, "featureTags");
const stockAdjustmentsRef = collection(db, "stockAdjustments");

const tableBody = document.getElementById("stockTableBody");
const stockForm = document.getElementById("stockForm");
const formTitle = document.getElementById("formTitle");
const formStatus = document.getElementById("formStatus");
const saveItemBtn = document.getElementById("saveItemBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const openStockItemModalBtn = document.getElementById("openStockItemModalBtn");
const stockItemModal = document.getElementById("stockItemModal");
const closeStockItemModalBtn = document.getElementById("closeStockItemModalBtn");
const createFeatureTagBtn = document.getElementById("createFeatureTagBtn");
const featureTagModal = document.getElementById("featureTagModal");
const featureTagForm = document.getElementById("featureTagForm");
const featureTagNameInput = document.getElementById("featureTagName");
const cancelFeatureTagBtn = document.getElementById("cancelFeatureTagBtn");
const cancelFeatureTagSecondaryBtn = document.getElementById("cancelFeatureTagSecondaryBtn");
const openFeatureTagPickerBtn = document.getElementById("openFeatureTagPickerBtn");
const featureTagPickerModal = document.getElementById("featureTagPickerModal");
const featureTagOptions = document.getElementById("featureTagOptions");
const cancelFeatureTagPickerBtn = document.getElementById("cancelFeatureTagPickerBtn");
const applyFeatureTagsBtn = document.getElementById("applyFeatureTagsBtn");
const selectedFeatureTagChips = document.getElementById("selectedFeatureTagChips");
const featureTagCategoryInput = document.getElementById("featureTagCategory");
const addFeatureTagCategoryBtn = document.getElementById("addFeatureTagCategoryBtn");
const featureTagCategoryChips = document.getElementById("featureTagCategoryChips");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const importCsvBtn = document.getElementById("importCsvBtn");
const csvImportModal = document.getElementById("csvImportModal");
const csvImportForm = document.getElementById("csvImportForm");
const csvImportFile = document.getElementById("csvImportFile");
const csvImportSummary = document.getElementById("csvImportSummary");
const applyCsvImportBtn = document.getElementById("applyCsvImportBtn");
const cancelCsvImportBtn = document.getElementById("cancelCsvImportBtn");
const stockAdjustModal = document.getElementById("stockAdjustModal");
const stockAdjustForm = document.getElementById("stockAdjustForm");
const stockAdjustType = document.getElementById("stockAdjustType");
const stockAdjustQty = document.getElementById("stockAdjustQty");
const stockAdjustReason = document.getElementById("stockAdjustReason");
const stockAdjustItemLabel = document.getElementById("stockAdjustItemLabel");

const inputs = {
    name: document.getElementById("itemName"),
    price: document.getElementById("itemPrice"),
    stockQty: document.getElementById("itemStock"),
    reorderLevel: document.getElementById("itemReorder"),
    active: document.getElementById("itemActive")
};

let editingId = null;
let cachedRows = [];
let availableFeatureTags = [];
let availableFeatureCategories = [];
let selectedFeatureTags = [];
let pickerOptions = [];
let inventoryLoadTimeoutId = null;
let csvPreviewRows = [];
let adjustingItem = null;

const demoSeed = [
    {
        name: "Iced Americano",
        category: "coffee",
        price: 65,
        stockQty: 24,
        reorderLevel: 8,
        featureTags: [{ name: "Americano", category: "Coffee" }],
        active: true
    },
    {
        name: "Hot Latte",
        category: "coffee",
        price: 60,
        stockQty: 18,
        reorderLevel: 8,
        featureTags: [{ name: "Latte", category: "Coffee" }],
        active: true
    },
    {
        name: "Butter Croissant",
        category: "bakery",
        price: 85,
        stockQty: 9,
        reorderLevel: 6,
        featureTags: [{ name: "Croissant", category: "Bakery" }],
        active: true
    },
    {
        name: "Matcha Latte",
        category: "tea",
        price: 75,
        stockQty: 11,
        reorderLevel: 6,
        featureTags: [{ name: "Matcha Latte", category: "Tea" }],
        active: true
    }
];

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeCategory(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ");
}

function normalizeCategoryKey(value) {
    return normalizeCategory(value).toLowerCase();
}

function getFeatureTagSignature(name, tags) {
    const tagPart = normalizeFeatureTags(tags)
        .map((tag) => `${normalizeCategoryKey(tag.category)}:${normalizeCategoryKey(tag.name)}`)
        .sort()
        .join("|");
    return `${normalizeCategoryKey(name)}::${tagPart}`;
}

function getAuthSnapshot() {
    const state = window.webPosAuthState || {};
    return {
        uid: state.user?.uid || "",
        email: state.user?.email || "",
        role: state.role || ""
    };
}

function renderCategoryChips() {
    if (!featureTagCategoryChips) {
        return;
    }

    if (availableFeatureCategories.length === 0) {
        featureTagCategoryChips.innerHTML = '<span class="feature-tag-chip">No Tags Groups yet</span>';
        return;
    }

    featureTagCategoryChips.innerHTML = availableFeatureCategories.map((category) => {
        const active = normalizeCategoryKey(category) === normalizeCategoryKey(featureTagCategoryInput?.value) ? "is-selected" : "";
        return `<button type="button" class="category-chip ${active}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`;
    }).join("");

    featureTagCategoryChips.querySelectorAll(".category-chip").forEach((button) => {
        button.addEventListener("click", () => {
            if (featureTagCategoryInput) {
                featureTagCategoryInput.value = button.dataset.category || "";
            }
            renderCategoryChips();
        });
    });
}

function setStatus(message, isError = false) {
    formStatus.textContent = message;
    formStatus.style.color = isError ? "#b91c1c" : "#64748b";
}

function openModal(modal) {
    if (!modal) {
        return;
    }

    modal.hidden = false;
    if (window.lucide) {
        lucide.createIcons();
    }
}

function closeModal(modal) {
    if (!modal) {
        return;
    }

    modal.hidden = true;
}

function normalizeFeatureTag(tag, fallbackCategory = "") {
    if (typeof tag === "string") {
        const name = tag.trim();
        if (!name) {
            return null;
        }

        return {
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
            name,
            category: ""
        };
    }

    if (!tag || typeof tag !== "object") {
        return null;
    }

    const name = String(tag.name || tag.label || tag.title || "").trim();
    if (!name) {
        return null;
    }

    const id = String(tag.id || tag.featureTagId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));

    return {
        id,
        name,
        category: normalizeCategory(tag.category || fallbackCategory)
    };
}

function normalizeFeatureTags(value) {
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    const seen = new Set();

    return raw
        .map((tag) => normalizeFeatureTag(tag))
        .filter(Boolean)
        .filter((tag) => {
            const key = `${tag.id}:${tag.name.toLowerCase()}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function tagSummary(tags) {
    if (!tags.length) {
        return "No feature tags selected";
    }

    return tags.map((tag) => tag.category ? `${tag.name} (${tag.category})` : tag.name).join(", ");
}

function renderFeatureTagChips(tags, emptyText = "No tags") {
    if (!tags.length) {
        return `<span class="feature-tag-chip">${escapeHtml(emptyText)}</span>`;
    }

    return tags.map((tag) => {
        return `
            <span class="feature-tag-chip">${escapeHtml(tag.category ? `${tag.name} · ${tag.category}` : tag.name)}</span>
        `;
    }).join("");
}

function updateSelectedFeatureTagUI() {
    if (selectedFeatureTagChips) {
        selectedFeatureTagChips.innerHTML = renderFeatureTagChips(selectedFeatureTags, "No feature tags chosen yet.");
    }
}

function getPickerOptions() {
    const merged = [...availableFeatureTags];
    const existingIds = new Set(merged.map((tag) => tag.id));

    for (const tag of selectedFeatureTags) {
        if (!existingIds.has(tag.id)) {
            merged.push(tag);
        }
    }

    return merged;
}

function renderFeatureTagPicker() {
    pickerOptions = getPickerOptions();

    if (!featureTagOptions) {
        return;
    }

    if (pickerOptions.length === 0) {
        featureTagOptions.innerHTML = '<div class="picker-empty">No feature tags yet. Create one first.</div>';
        return;
    }

    const selectedIds = new Set(selectedFeatureTags.map((tag) => tag.id));
    const groups = new Map();

    for (const tag of pickerOptions) {
        const group = normalizeCategory(tag.category || "Uncategorized") || "Uncategorized";
        if (!groups.has(group)) {
            groups.set(group, []);
        }

        groups.get(group).push({ ...tag, category: group });
    }

    featureTagOptions.innerHTML = Array.from(groups.entries()).map(([groupName, tags]) => `
        <section class="feature-tag-group">
            <div class="feature-tag-group-title">
                <span>${escapeHtml(groupName)} Tags Group</span>
                <span>${tags.length} tag${tags.length === 1 ? "" : "s"}</span>
            </div>
            <div class="feature-tag-card-grid">
                ${tags.map((tag) => {
                    const checked = selectedIds.has(tag.id) ? "checked" : "";
                    return `
                        <div class="feature-tag-card">
                            <label>
                                <input type="checkbox" data-feature-tag-id="${escapeHtml(tag.id)}" ${checked}>
                                <span>
                                    <strong>${escapeHtml(tag.name)}</strong>
                                    <span>${escapeHtml(groupName)} Tags Group</span>
                                </span>
                            </label>
                        </div>
                    `;
                }).join("")}
            </div>
        </section>
    `).join("");
}

function resetForm() {
    editingId = null;
    stockForm.reset();
    formTitle.textContent = "Add Stock Item";
    saveItemBtn.textContent = "Save Item";
    cancelEditBtn.textContent = "Cancel";
    selectedFeatureTags = [];
    updateSelectedFeatureTagUI();
    setStatus("Ready.");
}

function openStockItemForm(mode = "add") {
    if (mode === "add") {
        resetForm();
    }
    openModal(stockItemModal);
    window.setTimeout(() => inputs.name?.focus(), 50);
}

function closeStockItemForm() {
    closeModal(stockItemModal);
    resetForm();
}

function toSafeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function renderRows(rows) {
    cachedRows = rows;

    if (rows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No items yet. Add your first stock item.</td></tr>';
        return;
    }

    tableBody.innerHTML = rows
        .map((item) => {
            const isLow = item.stockQty <= item.reorderLevel;
            const statusClass = isLow ? "low" : "ok";
            const statusLabel = isLow ? "Low Stock" : "Healthy";
            const tagsHtml = renderFeatureTagChips(item.featureTags, item.category || "No tags");

            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${tagsHtml}</td>
                    <td>${item.stockQty}</td>
                    <td>${item.reorderLevel}</td>
                    <td><span class="stock-pill ${statusClass}">${statusLabel}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="mini-btn adjust" data-action="adjust" data-id="${item.id}">Adjust</button>
                            <button class="mini-btn edit" data-action="edit" data-id="${item.id}">Edit</button>
                            <button class="mini-btn delete" data-action="delete" data-id="${item.id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function renderTableLoading(message = "Loading inventory...") {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(message)}</td></tr>`;
}

function renderTableError(message) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(message)}</td></tr>`;
}

async function seedIfEmpty() {
    const existing = await getDocs(productsRef);
    if (!existing.empty) {
        return;
    }

    for (const product of demoSeed) {
        await addDoc(productsRef, {
            ...product,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    }

    setStatus("Seeded demo inventory to Firestore.");
}

function startFeatureTagSync() {
    const q = query(featureTagsRef, orderBy("name"));

    onSnapshot(q, (snapshot) => {
        availableFeatureTags = snapshot.docs.map((snap) => {
            const data = snap.data();
            return {
                id: snap.id,
                name: String(data.name || "Unnamed Feature Tag").trim(),
                category: normalizeCategory(data.category || "Uncategorized")
            };
        });

        availableFeatureCategories = Array.from(new Set(availableFeatureTags.map((tag) => tag.category || "Uncategorized")));

        if (!featureTagPickerModal?.hidden) {
            renderFeatureTagPicker();
        }

        renderCategoryChips();
    }, (error) => {
        console.error("Feature tag snapshot error:", error);
    });
}

function startRealtimeSync() {
    const q = query(productsRef, orderBy("name"));

    if (inventoryLoadTimeoutId) {
        window.clearTimeout(inventoryLoadTimeoutId);
    }

    renderTableLoading("Loading inventory from Firestore...");

    inventoryLoadTimeoutId = window.setTimeout(() => {
        if (cachedRows.length === 0) {
            setStatus("Inventory is taking too long to load.", true);
            renderTableError("Could not load inventory from Firestore.");
        }
    }, 8000);

    onSnapshot(q, (snapshot) => {
        if (inventoryLoadTimeoutId) {
            window.clearTimeout(inventoryLoadTimeoutId);
            inventoryLoadTimeoutId = null;
        }

        const rows = snapshot.docs.map((snap) => {
            const data = snap.data();
            const featureTags = normalizeFeatureTags(data.featureTags || data.category);

            return {
                id: snap.id,
                name: data.name || "Unnamed",
                price: toSafeNumber(data.price),
                stockQty: toSafeNumber(data.stockQty),
                reorderLevel: toSafeNumber(data.reorderLevel),
                category: data.category || featureTags[0]?.name || "uncategorized",
                featureTags,
                active: data.active !== false
            };
        });

        renderRows(rows);
    }, (error) => {
        if (inventoryLoadTimeoutId) {
            window.clearTimeout(inventoryLoadTimeoutId);
            inventoryLoadTimeoutId = null;
        }

        console.error("Stock snapshot error:", error);
        setStatus("Realtime sync failed. Check Firestore rules.", true);
        renderTableError("Could not load inventory from Firestore.");
    });
}

function readFormPayload() {
    const name = inputs.name.value.trim();
    const price = toSafeNumber(inputs.price.value);
    const stockQty = Math.max(0, Math.floor(toSafeNumber(inputs.stockQty.value)));
    const reorderLevel = Math.max(0, Math.floor(toSafeNumber(inputs.reorderLevel.value)));
    const featureTags = normalizeFeatureTags(selectedFeatureTags);

    if (!name || featureTags.length === 0) {
        throw new Error("Item name and at least one feature tag are required.");
    }

    const nextSignature = getFeatureTagSignature(name, featureTags);
    const duplicate = cachedRows.find((item) => getFeatureTagSignature(item.name, item.featureTags) === nextSignature && item.id !== editingId);
    if (duplicate) {
        throw new Error("An item with the same name and feature tags already exists.");
    }

    return {
        name,
        category: featureTags[0]?.category || "uncategorized",
        featureTags,
        price,
        stockQty,
        reorderLevel,
        active: inputs.active.checked,
        updatedAt: serverTimestamp()
    };
}

async function createFeatureTag() {
    const name = featureTagNameInput.value.trim();
    const category = normalizeCategory(featureTagCategoryInput?.value);

    if (!name || !category) {
        throw new Error("Feature tag name and group are required.");
    }

    await addDoc(featureTagsRef, {
        name,
        category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

function applyPickerSelection() {
    const checked = Array.from(featureTagOptions.querySelectorAll('input[type="checkbox"][data-feature-tag-id]'));
    const selectedIds = new Set(checked.filter((input) => input.checked).map((input) => input.dataset.featureTagId));
    selectedFeatureTags = pickerOptions.filter((tag) => selectedIds.has(tag.id));
    updateSelectedFeatureTagUI();
    closeModal(featureTagPickerModal);
}

function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (quoted) {
            if (char === '"' && next === '"') {
                cell += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                cell += char;
            }
            continue;
        }

        if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            row.push(cell);
            cell = "";
        } else if (char === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else if (char !== "\r") {
            cell += char;
        }
    }

    row.push(cell);
    rows.push(row);
    return rows.filter((entry) => entry.some((value) => String(value).trim()));
}

function parseBool(value, fallback = true) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) {
        return fallback;
    }
    return ["1", "true", "yes", "y", "active"].includes(text);
}

function buildCsvPayload(row, index, existingBySignature, seenSignatures) {
    const errors = [];
    const price = Number(row.price);
    const stockQty = Math.floor(Number(row.stockQty));
    const reorderLevel = Math.floor(Number(row.reorderLevel));

    if (!String(row.name || "").trim()) errors.push("missing name");
    if (!Number.isFinite(price) || price < 0) errors.push("invalid price");
    if (!Number.isFinite(stockQty) || stockQty < 0) errors.push("invalid stockQty");
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) errors.push("invalid reorderLevel");

    const featureTags = normalizeFeatureTags(
        String(row.featureTags || "")
            .split("|")
            .map((name) => ({ name: name.trim(), category: row.category || "Uncategorized" }))
            .filter((tag) => tag.name)
    );

    if (featureTags.length === 0) {
        featureTags.push({ id: normalizeCategoryKey(row.category || "Uncategorized"), name: row.category || "Uncategorized", category: row.category || "Uncategorized" });
    }

    const name = String(row.name || "").trim();
    const signature = getFeatureTagSignature(name, featureTags);
    if (seenSignatures.has(signature)) errors.push("duplicate name + featureTags in CSV");
    seenSignatures.add(signature);

    return {
        rowNumber: index + 2,
        mode: existingBySignature.has(signature) ? "update" : "create",
        id: existingBySignature.get(signature)?.id || null,
        errors,
        payload: {
            name,
            category: String(row.category || featureTags[0]?.category || "Uncategorized").trim(),
            featureTags,
            price,
            stockQty,
            reorderLevel,
            active: parseBool(row.active, true),
            updatedAt: serverTimestamp()
        }
    };
}

function renderCsvPreview() {
    const valid = csvPreviewRows.filter((row) => row.errors.length === 0);
    const createCount = valid.filter((row) => row.mode === "create").length;
    const updateCount = valid.filter((row) => row.mode === "update").length;
    const errorRows = csvPreviewRows.filter((row) => row.errors.length > 0);

    applyCsvImportBtn.disabled = valid.length === 0;
    csvImportSummary.innerHTML = `
        <strong>${valid.length} ready (${createCount} new, ${updateCount} updates)</strong>
        ${errorRows.length ? `<span class="import-row-error">${errorRows.length} row(s) will be skipped until fixed.</span>` : ""}
        ${csvPreviewRows.slice(0, 12).map((row) => {
            const code = row.payload.name || "(missing name)";
            const message = row.errors.length ? row.errors.join(", ") : row.mode;
            return `<div class="${row.errors.length ? "import-row-error" : ""}">Row ${row.rowNumber}: ${escapeHtml(code)} - ${escapeHtml(message)}</div>`;
        }).join("")}
    `;
}

async function previewCsvFile(file) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
        throw new Error("CSV needs a header row and at least one item row.");
    }

    const headers = rows[0].map((header) => String(header || "").trim());
    const records = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    const existingBySignature = new Map(cachedRows.map((item) => [getFeatureTagSignature(item.name, item.featureTags), item]));
    const seenSignatures = new Set();
    csvPreviewRows = records.map((row, index) => buildCsvPayload(row, index, existingBySignature, seenSignatures));
    renderCsvPreview();
}

function exportInventoryCsv() {
    const headers = ["name", "category", "featureTags", "price", "stockQty", "reorderLevel", "active"];
    const lines = [
        headers.join(","),
        ...cachedRows.map((item) => {
            const tags = normalizeFeatureTags(item.featureTags).map((tag) => tag.name).join("|");
            const values = [
                item.name,
                item.category,
                tags,
                item.price,
                item.stockQty,
                item.reorderLevel,
                item.active !== false ? "true" : "false"
            ];
            return values.map(csvEscape).join(",");
        })
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `otterton-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

async function applyCsvImport() {
    const valid = csvPreviewRows.filter((row) => row.errors.length === 0);
    for (const row of valid) {
        if (row.mode === "update" && row.id) {
            await updateDoc(doc(db, "products", row.id), row.payload);
        } else {
            await addDoc(productsRef, {
                ...row.payload,
                createdAt: serverTimestamp()
            });
        }
    }

    setStatus(`Imported ${valid.length} CSV row(s).`);
    csvPreviewRows = [];
    closeModal(csvImportModal);
}

async function saveStockAdjustment() {
    if (!adjustingItem) {
        return;
    }

    const type = stockAdjustType.value;
    const qty = Math.max(0, Math.floor(toSafeNumber(stockAdjustQty.value)));
    const reason = stockAdjustReason.value.trim();
    if (!reason) {
        throw new Error("Adjustment reason is required.");
    }

    const productRef = doc(db, "products", adjustingItem.id);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(productRef);
        if (!snap.exists()) {
            throw new Error("Item no longer exists.");
        }

        const beforeQty = Math.max(0, Math.floor(Number(snap.data().stockQty) || 0));
        const afterQty = type === "set"
            ? qty
            : type === "remove"
                ? Math.max(0, beforeQty - qty)
                : beforeQty + qty;
        const delta = afterQty - beforeQty;

        transaction.update(productRef, {
            stockQty: afterQty,
            updatedAt: serverTimestamp()
        });

        transaction.set(doc(stockAdjustmentsRef), {
            productId: adjustingItem.id,
            productName: adjustingItem.name || "",
            featureTags: normalizeFeatureTags(adjustingItem.featureTags),
            type,
            reason,
            beforeQty,
            afterQty,
            delta,
            user: getAuthSnapshot(),
            createdAt: serverTimestamp()
        });
    });

    setStatus("Stock adjustment saved.");
    closeModal(stockAdjustModal);
    adjustingItem = null;
}

stockForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
        const payload = readFormPayload();

        if (editingId) {
            await updateDoc(doc(db, "products", editingId), payload);
            setStatus("Item updated.");
        } else {
            await addDoc(productsRef, {
                ...payload,
                createdAt: serverTimestamp()
            });
            setStatus("Item added.");
        }

        closeModal(stockItemModal);
        resetForm();
    } catch (error) {
        console.error("Save stock item failed:", error);
        setStatus(error.message || "Could not save item.", true);
    }
});

cancelEditBtn.addEventListener("click", () => {
    closeStockItemForm();
});

openStockItemModalBtn?.addEventListener("click", () => {
    openStockItemForm("add");
});

closeStockItemModalBtn?.addEventListener("click", closeStockItemForm);

stockItemModal?.addEventListener("click", (event) => {
    if (event.target === stockItemModal) {
        closeStockItemForm();
    }
});

createFeatureTagBtn?.addEventListener("click", () => {
    featureTagForm?.reset();
    if (featureTagCategoryInput) {
        featureTagCategoryInput.value = availableFeatureCategories[0] || "";
    }
    renderCategoryChips();
    openModal(featureTagModal);
    featureTagNameInput?.focus();
});

cancelFeatureTagBtn?.addEventListener("click", () => {
    closeModal(featureTagModal);
});

cancelFeatureTagSecondaryBtn?.addEventListener("click", () => {
    closeModal(featureTagModal);
});

featureTagModal?.addEventListener("click", (event) => {
    if (event.target === featureTagModal) {
        closeModal(featureTagModal);
    }
});

featureTagForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
        await createFeatureTag();
        closeModal(featureTagModal);
        setStatus("Feature tag created.");
        featureTagForm.reset();
        if (featureTagCategoryInput) {
            featureTagCategoryInput.value = availableFeatureCategories[0] || "";
        }
        renderCategoryChips();
    } catch (error) {
        console.error("Create feature tag failed:", error);
        setStatus(error.message || "Could not create feature tag.", true);
    }
});

addFeatureTagCategoryBtn?.addEventListener("click", () => {
    const category = normalizeCategory(featureTagCategoryInput?.value);
    if (!category) {
        return;
    }

    if (!availableFeatureCategories.some((entry) => normalizeCategoryKey(entry) === normalizeCategoryKey(category))) {
        availableFeatureCategories.push(category);
    }

    if (featureTagCategoryInput) {
        featureTagCategoryInput.value = category;
    }

    renderCategoryChips();
});

openFeatureTagPickerBtn?.addEventListener("click", () => {
    renderFeatureTagPicker();
    openModal(featureTagPickerModal);
});

cancelFeatureTagPickerBtn?.addEventListener("click", () => {
    closeModal(featureTagPickerModal);
});

applyFeatureTagsBtn?.addEventListener("click", applyPickerSelection);

featureTagPickerModal?.addEventListener("click", (event) => {
    if (event.target === featureTagPickerModal) {
        closeModal(featureTagPickerModal);
    }
});

exportCsvBtn?.addEventListener("click", exportInventoryCsv);

importCsvBtn?.addEventListener("click", () => {
    csvImportForm?.reset();
    csvPreviewRows = [];
    applyCsvImportBtn.disabled = true;
    csvImportSummary.textContent = "Choose a CSV file to preview changes.";
    openModal(csvImportModal);
});

cancelCsvImportBtn?.addEventListener("click", () => {
    closeModal(csvImportModal);
});

csvImportModal?.addEventListener("click", (event) => {
    if (event.target === csvImportModal) {
        closeModal(csvImportModal);
    }
});

csvImportFile?.addEventListener("change", async () => {
    try {
        const file = csvImportFile.files?.[0];
        if (!file) {
            return;
        }
        await previewCsvFile(file);
    } catch (error) {
        console.error("CSV preview failed:", error);
        csvPreviewRows = [];
        applyCsvImportBtn.disabled = true;
        csvImportSummary.innerHTML = `<span class="import-row-error">${escapeHtml(error.message || "Could not preview CSV.")}</span>`;
    }
});

csvImportForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        applyCsvImportBtn.disabled = true;
        await applyCsvImport();
    } catch (error) {
        console.error("CSV import failed:", error);
        setStatus(error.message || "Could not import CSV.", true);
        applyCsvImportBtn.disabled = false;
    }
});

cancelStockAdjustBtn?.addEventListener("click", () => {
    adjustingItem = null;
    closeModal(stockAdjustModal);
});

stockAdjustModal?.addEventListener("click", (event) => {
    if (event.target === stockAdjustModal) {
        adjustingItem = null;
        closeModal(stockAdjustModal);
    }
});

stockAdjustForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await saveStockAdjustment();
    } catch (error) {
        console.error("Stock adjustment failed:", error);
        setStatus(error.message || "Could not save stock adjustment.", true);
    }
});

tableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) {
        return;
    }

    if (action === "delete") {
        const ok = window.confirm("Delete this item from inventory?");
        if (!ok) {
            return;
        }

        try {
            await deleteDoc(doc(db, "products", id));
            if (editingId === id) {
                resetForm();
            }
            setStatus("Item deleted.");
        } catch (error) {
            console.error("Delete failed:", error);
            setStatus("Could not delete item.", true);
        }
        return;
    }

    if (action === "edit") {
        try {
            const item = cachedRows.find((entry) => entry.id === id);
            if (!item) {
                return;
            }

            inputs.name.value = item.name;
            inputs.stockQty.value = item.stockQty;
            inputs.reorderLevel.value = item.reorderLevel;
            inputs.price.value = item.price;
            inputs.active.checked = item.active !== false;
            selectedFeatureTags = normalizeFeatureTags(item.featureTags || item.category);
            updateSelectedFeatureTagUI();

            editingId = id;
            formTitle.textContent = "Edit Stock Item";
            saveItemBtn.textContent = "Update Item";
            cancelEditBtn.textContent = "Cancel";
            setStatus("Editing selected item.");
            openStockItemForm("edit");
        } catch (error) {
            console.error("Edit setup failed:", error);
            setStatus("Could not load item for edit.", true);
        }
        return;
    }

    if (action === "adjust") {
        const item = cachedRows.find((entry) => entry.id === id);
        if (!item) {
            return;
        }

        adjustingItem = item;
        stockAdjustForm?.reset();
        stockAdjustType.value = "add";
        if (stockAdjustItemLabel) {
            stockAdjustItemLabel.textContent = `${item.name} current stock: ${item.stockQty}`;
        }
        openModal(stockAdjustModal);
    }
});

if (window.lucide) {
    lucide.createIcons();
}

renderTableLoading("Loading inventory from Firestore...");
startFeatureTagSync();
startRealtimeSync();

seedIfEmpty().catch((error) => {
    console.error("Seed/init failed:", error);
    setStatus("Could not initialize stock data. Check Firestore rules.", true);
});

updateSelectedFeatureTagUI();
