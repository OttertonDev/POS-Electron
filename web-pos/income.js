import { app } from "./firebase-init.js";
import {
    getFirestore,
    collection,
    limit,
    onSnapshot,
    orderBy,
    query
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const db = getFirestore(app);
const PRINT_SERVICE_URL = "http://127.0.0.1:3011";

const receiptList = document.getElementById("receiptList");
const receiptDetail = document.getElementById("receiptDetail");
const receiptSearch = document.getElementById("receiptSearch");
const receiptSummary = document.getElementById("receiptSummary");
const serviceStatus = document.getElementById("serviceStatus");
const serviceStatusText = serviceStatus?.querySelector(".service-status-text");

let receipts = [];
let selectedReceiptId = "";
let serviceReady = false;
let searchTerm = "";

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function receiptSearchBlob(receipt) {
    return [
        receipt.receiptId,
        receipt.dateLabel,
        receipt.total,
        ...(receipt.items || []).flatMap((item) => [
            item.name,
            item.tagLine,
            item.variantLine,
            ...(Array.isArray(item.featureTags) ? item.featureTags.map((tag) => `${tag.category || ""} ${tag.name || ""}`) : [])
        ])
    ].join(" ").toLowerCase();
}

function getFilteredReceipts() {
    if (!searchTerm) {
        return receipts;
    }
    return receipts.filter((receipt) => receiptSearchBlob(receipt).includes(searchTerm));
}

function setServiceStatus(state, message) {
    if (!serviceStatus || !serviceStatusText) {
        return;
    }

    serviceStatus.classList.remove("service-status-ready", "service-status-offline", "service-status-error");
    serviceStatus.classList.add(`service-status-${state}`);
    serviceStatusText.textContent = message;
}

async function refreshPrintServiceStatus() {
    try {
        const response = await fetch(`${PRINT_SERVICE_URL}/health`);
        const result = await response.json();
        serviceReady = Boolean(result.success);
        setServiceStatus(serviceReady ? "ready" : "offline", serviceReady ? "Print Service Ready" : "Print Service Needs Setup");
    } catch (error) {
        serviceReady = false;
        setServiceStatus("offline", "Print Service Offline");
    }
    renderDetail();
}

function renderList() {
    const filtered = getFilteredReceipts();
    receiptSummary.textContent = `${filtered.length} receipt${filtered.length === 1 ? "" : "s"} shown`;

    if (filtered.length === 0) {
        receiptList.innerHTML = '<div class="empty-state">No receipts found.</div>';
        return;
    }

    receiptList.innerHTML = filtered.map((receipt) => `
        <article class="receipt-row ${receipt.receiptId === selectedReceiptId ? "is-selected" : ""}" data-receipt-id="${escapeHtml(receipt.receiptId)}">
            <div>
                <div class="receipt-id">${escapeHtml(receipt.receiptId)}</div>
                <div class="receipt-meta">${escapeHtml(receipt.dateLabel || "")} · ${(receipt.items || []).length} item(s)</div>
            </div>
            <div class="receipt-total">THB ${escapeHtml(receipt.total || "0.00")}</div>
        </article>
    `).join("");
}

function buildPrintPayload(receipt) {
    return {
        receiptId: receipt.receiptId,
        storeName: receipt.storeName || "Otterton's Point of Sale",
        address: receipt.address || "",
        phone: receipt.phone || "",
        date: receipt.dateLabel || "",
        items: (receipt.items || []).map((item) => ({
            qty: item.qty || `${item.quantity || 1}x`,
            quantity: item.quantity || 1,
            name: item.name || "Unnamed Item",
            featureTags: Array.isArray(item.featureTags) ? item.featureTags : [],
            tagLine: item.tagLine || item.variantLine || "",
            unitPrice: item.unitPrice || "",
            price: item.price || "0.00"
        })),
        subtotal: receipt.subtotal || "",
        tax: receipt.tax || "",
        total: receipt.total || "0.00",
        cash: receipt.cash || receipt.total || "0.00",
        change: receipt.change || "0.00",
        footer: receipt.footer || "---",
        receiptLayout: Array.isArray(receipt.receiptLayout) ? receipt.receiptLayout : []
    };
}

function renderDetail() {
    const receipt = receipts.find((entry) => entry.receiptId === selectedReceiptId);
    if (!receipt) {
        receiptDetail.innerHTML = '<div class="empty-state">Select a receipt to view details.</div>';
        return;
    }

    receiptDetail.innerHTML = `
        <h2>${escapeHtml(receipt.receiptId)}</h2>
        <div class="receipt-meta">${escapeHtml(receipt.dateLabel || "")}</div>
        <div class="detail-line"><span>Subtotal</span><strong>THB ${escapeHtml(receipt.subtotal || "0.00")}</strong></div>
        <div class="detail-line"><span>Tax</span><strong>THB ${escapeHtml(receipt.tax || "0.00")}</strong></div>
        <div class="detail-line"><span>Total</span><strong>THB ${escapeHtml(receipt.total || "0.00")}</strong></div>
        <div class="detail-items">
            ${(receipt.items || []).map((item) => `
                <div class="detail-item">
                    <strong>${escapeHtml(item.qty || `${item.quantity || 1}x`)} ${escapeHtml(item.name || "Unnamed Item")}</strong>
                    <span>${escapeHtml(item.tagLine || item.variantLine || "")}</span>
                    <span>THB ${escapeHtml(item.price || "0.00")}</span>
                </div>
            `).join("")}
        </div>
        <button class="reprint-btn" id="reprintBtn" ${serviceReady ? "" : "disabled"}>Reprint Receipt</button>
    `;

    document.getElementById("reprintBtn")?.addEventListener("click", async () => {
        try {
            const response = await fetch(`${PRINT_SERVICE_URL}/print`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildPrintPayload(receipt))
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Print service rejected the receipt.");
            }
            setServiceStatus("ready", "Receipt Reprinted");
        } catch (error) {
            console.error("Reprint failed:", error);
            setServiceStatus("error", error.message || "Reprint Failed");
        }
    });
}

function startReceiptSync() {
    const receiptsQuery = query(collection(db, "receipts"), orderBy("createdAt", "desc"), limit(100));
    onSnapshot(receiptsQuery, (snapshot) => {
        receipts = snapshot.docs.map((snap) => {
            const data = snap.data();
            return {
                ...data,
                receiptId: data.receiptId || snap.id,
                items: Array.isArray(data.items) ? data.items : []
            };
        });

        if (!selectedReceiptId && receipts.length > 0) {
            selectedReceiptId = receipts[0].receiptId;
        }

        renderList();
        renderDetail();
    }, (error) => {
        console.error("Receipt history failed:", error);
        receiptSummary.textContent = "Could not load receipt history.";
        receiptList.innerHTML = '<div class="empty-state">Check Firestore rules and connection.</div>';
    });
}

receiptSearch?.addEventListener("input", () => {
    searchTerm = receiptSearch.value.trim().toLowerCase();
    renderList();
});

receiptList?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-receipt-id]");
    if (!row) {
        return;
    }
    selectedReceiptId = row.dataset.receiptId || "";
    renderList();
    renderDetail();
});

startReceiptSync();
refreshPrintServiceStatus();
window.setInterval(refreshPrintServiceStatus, 5000);
