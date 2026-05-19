import { app } from "./firebase-init.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const db = getFirestore(app);
const receiptRef = doc(db, "settings", "receipt");

const DEFAULT_LINES = [
    { id: "storeName", type: "field", source: "storeName", label: "", align: "center", visible: true },
    { id: "address", type: "field", source: "address", label: "", align: "center", visible: true },
    { id: "phone", type: "field", source: "phone", label: "Tel", align: "center", visible: true },
    { id: "receiptId", type: "field", source: "receiptId", label: "Receipt", align: "center", visible: true },
    { id: "date", type: "field", source: "date", label: "", align: "center", visible: true },
    { id: "dividerTop", type: "divider", label: "", align: "left", visible: true },
    { id: "items", type: "items", label: "Items", align: "left", visible: true },
    { id: "dividerBottom", type: "divider", label: "", align: "left", visible: true },
    { id: "totals", type: "totals", label: "Totals", align: "left", visible: true },
    { id: "payment", type: "payment", label: "Payment", align: "left", visible: true },
    { id: "footer", type: "footer", source: "footer", label: "", align: "center", visible: true }
];

const DEFAULT_SETTINGS = {
    storeName: "Otterton's Point of Sale",
    address: "",
    phone: "",
    footer: "Thank you",
    maxFeatureTagsOnReceipt: 3,
    lines: DEFAULT_LINES
};

const sampleReceipt = {
    receiptId: "20260518-0001",
    date: "18/5/2569 14:30",
    items: [
        {
            qty: "1x",
            name: "Canvas Tote",
            tagLine: "Color: Black / Size: M / Drop: Summer",
            price: "390.00"
        },
        {
            qty: "2x",
            name: "Sticker Pack",
            tagLine: "Set: Cafe / Finish: Matte",
            price: "160.00"
        }
    ],
    subtotal: "550.00",
    tax: "38.50",
    total: "588.50",
    cash: "588.50",
    change: "0.00"
};

const els = {
    storeName: document.getElementById("storeNameInput"),
    address: document.getElementById("addressInput"),
    phone: document.getElementById("phoneInput"),
    footer: document.getElementById("footerInput"),
    maxFeatureTags: document.getElementById("maxFeatureTagsInput"),
    lineList: document.getElementById("lineList"),
    preview: document.getElementById("receiptPreview"),
    save: document.getElementById("saveReceiptBtn"),
    reset: document.getElementById("resetReceiptBtn"),
    status: document.getElementById("saveStatus"),
    toast: document.getElementById("receiptToast"),
    downloadJson: document.getElementById("downloadReceiptJsonBtn"),
    uploadJson: document.getElementById("uploadReceiptJsonBtn"),
    jsonInput: document.getElementById("receiptJsonInput")
};

let settings = structuredClone(DEFAULT_SETTINGS);
let toastTimer = null;
let draggedLineIndex = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function cloneLines(lines) {
    const source = Array.isArray(lines) && lines.length ? lines : DEFAULT_LINES;
    return source.map((line, index) => ({
        id: String(line.id || `${line.type || "line"}-${index}`),
        type: String(line.type || "field"),
        source: String(line.source || ""),
        label: String(line.label || ""),
        align: ["left", "center", "right"].includes(line.align) ? line.align : "left",
        visible: line.visible !== false,
        text: String(line.text || "")
    }));
}

function normalizeSettings(data = {}) {
    return {
        ...DEFAULT_SETTINGS,
        ...data,
        maxFeatureTagsOnReceipt: Math.min(3, Math.max(0, Math.floor(Number(data.maxFeatureTagsOnReceipt ?? 3) || 0))),
        lines: cloneLines(data.lines)
    };
}

function syncInputs() {
    els.storeName.value = settings.storeName || "";
    els.address.value = settings.address || "";
    els.phone.value = settings.phone || "";
    els.footer.value = settings.footer || "";
    els.maxFeatureTags.value = settings.maxFeatureTagsOnReceipt ?? 3;
}

function fieldValue(source) {
    const receipt = { ...sampleReceipt, ...settings };
    return receipt[source] || "";
}

function lineTitle(line) {
    if (line.type === "divider") {
        return "Divider";
    }
    if (line.type === "items") {
        return "Item rows";
    }
    if (line.type === "totals") {
        return "Subtotal / Tax / Total";
    }
    if (line.type === "payment") {
        return "Cash / Change";
    }
    if (line.type === "footer") {
        return "Footer";
    }
    return line.source || "Text line";
}

function setStatus(message, tone = "") {
    els.status.textContent = message;
    els.status.dataset.tone = tone;
}

function showToast(message, tone = "success") {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.dataset.tone = tone;
    els.toast.hidden = false;

    toastTimer = window.setTimeout(() => {
        els.toast.hidden = true;
    }, 3200);
}

function renderLineList() {
    els.lineList.innerHTML = settings.lines.map((line, index) => `
        <article class="line-card" data-line-index="${index}" draggable="true">
            <div class="line-top">
                <button type="button" class="drag-handle" data-action="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">
                    <i data-lucide="grip-vertical"></i>
                </button>
                <label class="toggle">
                    <input type="checkbox" data-action="visible" ${line.visible ? "checked" : ""}>
                    Visible
                </label>
                <div class="line-kind">${escapeHtml(lineTitle(line))}</div>
                <div class="line-source">${escapeHtml(line.type)}</div>
            </div>
            <div class="line-controls">
                <input type="text" data-action="label" value="${escapeHtml(line.type === "text" ? line.text : line.label)}" placeholder="${line.type === "text" ? "Text" : "Label"}" ${["divider", "items", "totals", "payment"].includes(line.type) ? "disabled" : ""}>
                <div class="align-group" aria-label="Alignment">
                    ${["left", "center", "right"].map((align) => `
                        <button type="button" class="icon-btn ${line.align === align ? "is-active" : ""}" data-action="align" data-align="${align}" title="${align}">
                            <i data-lucide="align-${align}"></i>
                        </button>
                    `).join("")}
                </div>
                <div class="move-group" aria-label="Move line">
                    <button type="button" class="icon-btn" data-action="up" ${index === 0 ? "disabled" : ""} title="Move up">
                        <i data-lucide="chevron-up"></i>
                    </button>
                    <button type="button" class="icon-btn" data-action="down" ${index === settings.lines.length - 1 ? "disabled" : ""} title="Move down">
                        <i data-lucide="chevron-down"></i>
                    </button>
                </div>
            </div>
        </article>
    `).join("");

    if (window.lucide) {
        lucide.createIcons();
    }
}

function previewText(text, align = "left") {
    return `<div class="preview-line align-${escapeHtml(align)}">${escapeHtml(text)}</div>`;
}

function renderPreviewLine(line) {
    if (!line.visible) {
        return "";
    }

    if (line.type === "divider") {
        return '<hr class="preview-divider">';
    }

    if (line.type === "items") {
        return sampleReceipt.items.map((item) => `
            <div class="preview-item">
                <div class="preview-item-main"><span>${escapeHtml(item.qty)} ${escapeHtml(item.name)}</span><span>${escapeHtml(item.price)}</span></div>
                <div class="preview-item-tags">${escapeHtml(item.tagLine)}</div>
            </div>
        `).join("");
    }

    if (line.type === "totals") {
        return `
            <div class="preview-total"><span>Subtotal</span><span>${escapeHtml(sampleReceipt.subtotal)}</span></div>
            <div class="preview-total"><span>Tax</span><span>${escapeHtml(sampleReceipt.tax)}</span></div>
            <div class="preview-total is-total"><span>Total</span><span>${escapeHtml(sampleReceipt.total)}</span></div>
        `;
    }

    if (line.type === "payment") {
        return `
            <div class="preview-total"><span>Cash</span><span>${escapeHtml(sampleReceipt.cash)}</span></div>
            <div class="preview-total"><span>Change</span><span>${escapeHtml(sampleReceipt.change)}</span></div>
        `;
    }

    const rawValue = line.type === "footer" ? settings.footer : (line.type === "text" ? line.text : fieldValue(line.source));
    const value = line.label ? `${line.label}: ${rawValue}` : rawValue;
    return value ? previewText(value, line.align) : "";
}

function renderPreview() {
    els.preview.innerHTML = settings.lines.map(renderPreviewLine).join("");
}

function render() {
    syncInputs();
    renderLineList();
    renderPreview();
}

function updateFromInputs() {
    settings.storeName = els.storeName.value.trim();
    settings.address = els.address.value.trim();
    settings.phone = els.phone.value.trim();
    settings.footer = els.footer.value.trim();
    settings.maxFeatureTagsOnReceipt = Math.min(3, Math.max(0, Math.floor(Number(els.maxFeatureTags.value) || 0)));
    renderPreview();
}

async function loadSettings() {
    try {
        const snap = await getDoc(receiptRef);
        settings = normalizeSettings(snap.exists() ? snap.data() : DEFAULT_SETTINGS);
        render();
        setStatus(snap.exists() ? "Receipt settings loaded." : "Using default receipt layout.");
    } catch (error) {
        console.error("Receipt settings load failed:", error);
        settings = normalizeSettings(DEFAULT_SETTINGS);
        render();
        setStatus("Could not load settings. Editing defaults for now.", "error");
    }
}

async function saveSettings() {
    updateFromInputs();
    els.save.disabled = true;
    setStatus("Saving receipt settings...");

    try {
        await setDoc(receiptRef, {
            storeName: settings.storeName,
            address: settings.address,
            phone: settings.phone,
            footer: settings.footer,
            maxFeatureTagsOnReceipt: settings.maxFeatureTagsOnReceipt,
            lines: cloneLines(settings.lines),
            updatedAt: serverTimestamp()
        }, { merge: true });
        setStatus("Receipt settings saved.", "success");
        showToast("Receipt settings saved.");
    } catch (error) {
        console.error("Receipt settings save failed:", error);
        setStatus(error.message || "Could not save receipt settings.", "error");
        showToast(error.message || "Could not save receipt settings.", "error");
    } finally {
        els.save.disabled = false;
    }
}

function getBackupPayload() {
    updateFromInputs();
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
            storeName: settings.storeName,
            address: settings.address,
            phone: settings.phone,
            footer: settings.footer,
            maxFeatureTagsOnReceipt: settings.maxFeatureTagsOnReceipt,
            lines: cloneLines(settings.lines)
        }
    };
}

function downloadSettingsJson() {
    const payload = getBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateKey = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `receipt-settings-${dateKey}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Receipt settings JSON downloaded.");
}

async function uploadSettingsJson(file) {
    if (!file) {
        return;
    }

    try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const imported = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : parsed;
        settings = normalizeSettings(imported);
        render();
        setStatus("JSON backup loaded. Review it, then save to Firestore.");
        showToast("JSON backup loaded. Click Save Receipt to apply.");
    } catch (error) {
        console.error("Receipt JSON import failed:", error);
        showToast("Could not read that JSON backup.", "error");
    } finally {
        els.jsonInput.value = "";
    }
}

els.lineList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-line-index]");
    const button = event.target.closest("button[data-action]:not([data-action='drag-handle'])");
    if (!card || !button) {
        return;
    }

    const index = Number(card.dataset.lineIndex);
    const line = settings.lines[index];
    const action = button.dataset.action;

    if (action === "align") {
        line.align = button.dataset.align || "left";
    } else if (action === "up" && index > 0) {
        settings.lines.splice(index - 1, 0, settings.lines.splice(index, 1)[0]);
    } else if (action === "down" && index < settings.lines.length - 1) {
        settings.lines.splice(index + 1, 0, settings.lines.splice(index, 1)[0]);
    }

    renderLineList();
    renderPreview();
});

els.lineList.addEventListener("input", (event) => {
    const card = event.target.closest("[data-line-index]");
    if (!card) {
        return;
    }

    const line = settings.lines[Number(card.dataset.lineIndex)];
    if (event.target.dataset.action === "label") {
        if (line.type === "text") {
            line.text = event.target.value;
        } else {
            line.label = event.target.value;
        }
        renderPreview();
    }
});

els.lineList.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-line-index]");
    if (!card) {
        return;
    }

    draggedLineIndex = Number(card.dataset.lineIndex);
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(draggedLineIndex));
});

els.lineList.addEventListener("dragover", (event) => {
    const card = event.target.closest("[data-line-index]");
    if (!card || draggedLineIndex == null) {
        return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    els.lineList.querySelectorAll(".line-card").forEach((lineCard) => {
        lineCard.classList.toggle("is-drop-target", lineCard === card);
    });
});

els.lineList.addEventListener("dragleave", (event) => {
    const card = event.target.closest("[data-line-index]");
    if (card) {
        card.classList.remove("is-drop-target");
    }
});

els.lineList.addEventListener("drop", (event) => {
    const card = event.target.closest("[data-line-index]");
    if (!card || draggedLineIndex == null) {
        return;
    }

    event.preventDefault();
    const targetIndex = Number(card.dataset.lineIndex);
    if (targetIndex !== draggedLineIndex) {
        const [movedLine] = settings.lines.splice(draggedLineIndex, 1);
        settings.lines.splice(targetIndex, 0, movedLine);
    }

    draggedLineIndex = null;
    renderLineList();
    renderPreview();
});

els.lineList.addEventListener("dragend", () => {
    draggedLineIndex = null;
    els.lineList.querySelectorAll(".line-card").forEach((card) => {
        card.classList.remove("is-dragging", "is-drop-target");
    });
});

els.lineList.addEventListener("change", (event) => {
    const card = event.target.closest("[data-line-index]");
    if (!card) {
        return;
    }

    const line = settings.lines[Number(card.dataset.lineIndex)];
    if (event.target.dataset.action === "visible") {
        line.visible = event.target.checked;
        renderPreview();
    }
});

[els.storeName, els.address, els.phone, els.footer, els.maxFeatureTags].forEach((input) => {
    input.addEventListener("input", updateFromInputs);
});

els.save.addEventListener("click", saveSettings);
els.downloadJson.addEventListener("click", downloadSettingsJson);
els.uploadJson.addEventListener("click", () => els.jsonInput.click());
els.jsonInput.addEventListener("change", () => uploadSettingsJson(els.jsonInput.files?.[0]));
els.reset.addEventListener("click", () => {
    settings = normalizeSettings(DEFAULT_SETTINGS);
    render();
    setStatus("Default receipt layout restored. Save to apply it.");
    showToast("Default layout restored. Save to apply.");
});

loadSettings();
