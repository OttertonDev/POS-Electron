import { app } from "./firebase-init.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const db = getFirestore(app);
const preferencesRef = doc(db, "settings", "systemPreferences");

const DEFAULT_PREFERENCES = {
    language: "en",
    uiSize: "comfortable",
    thailandPost: {
        enabled: false,
        apiKey: "",
        senderName: "",
        senderPhone: "",
        senderAddress: "",
        serviceNotes: "Coming soon"
    }
};

const validLanguages = new Set(["en", "th"]);
const validUiSizes = new Set(["compact", "comfortable", "large"]);

const statusEl = document.getElementById("preferencesStatus");
const saveBtn = document.getElementById("savePreferencesBtn");
const languageChoices = document.getElementById("languageChoices");
const uiSizeChoices = document.getElementById("uiSizeChoices");

let preferences = structuredClone(DEFAULT_PREFERENCES);

function setStatus(message, tone = "") {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
}

function normalizePreferences(data = {}) {
    const language = validLanguages.has(data.language) ? data.language : DEFAULT_PREFERENCES.language;
    const uiSize = validUiSizes.has(data.uiSize) ? data.uiSize : DEFAULT_PREFERENCES.uiSize;
    const post = data.thailandPost && typeof data.thailandPost === "object" ? data.thailandPost : {};

    return {
        language,
        uiSize,
        thailandPost: {
            ...DEFAULT_PREFERENCES.thailandPost,
            apiKey: "",
            senderName: String(post.senderName || ""),
            senderPhone: String(post.senderPhone || ""),
            senderAddress: String(post.senderAddress || ""),
            serviceNotes: String(post.serviceNotes || "Coming soon"),
            enabled: false
        }
    };
}

function applySelection() {
    document.querySelectorAll("[data-language]").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.language === preferences.language);
    });

    document.querySelectorAll("[data-ui-size]").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.uiSize === preferences.uiSize);
    });

    document.body.dataset.language = preferences.language;
    document.body.dataset.uiSize = preferences.uiSize;
}

async function loadPreferences() {
    try {
        const snap = await getDoc(preferencesRef);
        preferences = normalizePreferences(snap.exists() ? snap.data() : DEFAULT_PREFERENCES);
        applySelection();
        setStatus(snap.exists() ? "Preferences loaded." : "Using default preferences.");
    } catch (error) {
        console.error("Preferences load failed:", error);
        preferences = normalizePreferences(DEFAULT_PREFERENCES);
        applySelection();
        setStatus("Could not load preferences. Editing defaults for now.", "error");
    }
}

async function savePreferences() {
    saveBtn.disabled = true;
    setStatus("Saving preferences...");

    try {
        await setDoc(preferencesRef, {
            language: preferences.language,
            uiSize: preferences.uiSize,
            thailandPost: {
                ...preferences.thailandPost,
                enabled: false,
                apiKey: ""
            },
            updatedAt: serverTimestamp()
        }, { merge: true });
        setStatus("Preferences saved.", "success");
    } catch (error) {
        console.error("Preferences save failed:", error);
        setStatus(error.message || "Could not save preferences.", "error");
    } finally {
        saveBtn.disabled = false;
    }
}

languageChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-language]");
    if (!button) {
        return;
    }
    preferences.language = button.dataset.language;
    applySelection();
});

uiSizeChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ui-size]");
    if (!button) {
        return;
    }
    preferences.uiSize = button.dataset.uiSize;
    applySelection();
});

saveBtn.addEventListener("click", savePreferences);

loadPreferences();
