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
    getDocs
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const db = getFirestore(app);
const productsRef = collection(db, "products");

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200";
const tableBody = document.getElementById("stockTableBody");
const stockForm = document.getElementById("stockForm");
const formTitle = document.getElementById("formTitle");
const formStatus = document.getElementById("formStatus");
const saveItemBtn = document.getElementById("saveItemBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

const inputs = {
    name: document.getElementById("itemName"),
    category: document.getElementById("itemCategory"),
    price: document.getElementById("itemPrice"),
    stockQty: document.getElementById("itemStock"),
    reorderLevel: document.getElementById("itemReorder"),
    img: document.getElementById("itemImage")
};

let editingId = null;
let cachedRows = [];

const demoSeed = [
    {
        name: "Iced Americano",
        category: "coffee",
        price: 65,
        stockQty: 24,
        reorderLevel: 8,
        img: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=200",
        active: true
    },
    {
        name: "Hot Latte",
        category: "coffee",
        price: 60,
        stockQty: 18,
        reorderLevel: 8,
        img: "https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&q=80&w=200",
        active: true
    },
    {
        name: "Butter Croissant",
        category: "bakery",
        price: 85,
        stockQty: 9,
        reorderLevel: 6,
        img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=200",
        active: true
    },
    {
        name: "Matcha Latte",
        category: "tea",
        price: 75,
        stockQty: 11,
        reorderLevel: 6,
        img: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&q=80&w=200",
        active: true
    }
];

function setStatus(message, isError = false) {
    formStatus.textContent = message;
    formStatus.style.color = isError ? "#b91c1c" : "#64748b";
}

function resetForm() {
    editingId = null;
    stockForm.reset();
    formTitle.textContent = "Add Stock Item";
    saveItemBtn.textContent = "Save Item";
    cancelEditBtn.style.display = "none";
    setStatus("Ready.");
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

            return `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.category}</td>
                    <td>${item.stockQty}</td>
                    <td>${item.reorderLevel}</td>
                    <td><span class="stock-pill ${statusClass}">${statusLabel}</span></td>
                    <td>
                        <div class="table-actions">
                            <button class="mini-btn edit" data-action="edit" data-id="${item.id}">Edit</button>
                            <button class="mini-btn delete" data-action="delete" data-id="${item.id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join("");
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

function startRealtimeSync() {
    const q = query(productsRef, orderBy("name"));
    onSnapshot(q, (snapshot) => {
        const rows = snapshot.docs.map((snap) => {
            const data = snap.data();
            return {
                id: snap.id,
                name: data.name || "Unnamed",
                category: data.category || "uncategorized",
                price: toSafeNumber(data.price),
                stockQty: toSafeNumber(data.stockQty),
                reorderLevel: toSafeNumber(data.reorderLevel),
                img: data.img || DEFAULT_IMAGE
            };
        });

        renderRows(rows);
    }, (error) => {
        console.error("Stock snapshot error:", error);
        setStatus("Realtime sync failed. Check Firestore rules.", true);
    });
}

function readFormPayload() {
    const name = inputs.name.value.trim();
    const category = inputs.category.value;
    const price = toSafeNumber(inputs.price.value);
    const stockQty = Math.max(0, Math.floor(toSafeNumber(inputs.stockQty.value)));
    const reorderLevel = Math.max(0, Math.floor(toSafeNumber(inputs.reorderLevel.value)));
    const img = inputs.img.value.trim() || DEFAULT_IMAGE;

    if (!name || !category) {
        throw new Error("Item name and category are required.");
    }

    return {
        name,
        category,
        price,
        stockQty,
        reorderLevel,
        img,
        active: true,
        updatedAt: serverTimestamp()
    };
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

        resetForm();
    } catch (error) {
        console.error("Save stock item failed:", error);
        setStatus(error.message || "Could not save item.", true);
    }
});

cancelEditBtn.addEventListener("click", () => {
    resetForm();
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
            inputs.category.value = item.category;
            inputs.stockQty.value = item.stockQty;
            inputs.reorderLevel.value = item.reorderLevel;
            inputs.price.value = item.price;
            inputs.img.value = item.img === DEFAULT_IMAGE ? "" : item.img;

            editingId = id;
            formTitle.textContent = "Edit Stock Item";
            saveItemBtn.textContent = "Update Item";
            cancelEditBtn.style.display = "block";
            setStatus("Editing selected item.");
        } catch (error) {
            console.error("Edit setup failed:", error);
            setStatus("Could not load item for edit.", true);
        }
    }
});

if (window.lucide) {
    lucide.createIcons();
}

seedIfEmpty()
    .then(() => {
        startRealtimeSync();
    })
    .catch((error) => {
        console.error("Seed/init failed:", error);
        setStatus("Could not initialize stock data. Check Firestore rules.", true);
        startRealtimeSync();
    });
