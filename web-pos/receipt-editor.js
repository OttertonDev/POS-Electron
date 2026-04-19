import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Firebase Config (same as firebase-init.js)
const firebaseConfig = {
  apiKey: "AIzaSyCu5qygEHGf9zU5EZQPtoXiYwOeFnOUDrU",
  authDomain: "tippawan-admin.firebaseapp.com",
  projectId: "tippawan-admin",
  storageBucket: "tippawan-admin.firebasestorage.app",
  messagingSenderId: "605672521830",
  appId: "1:605672521830:web:3da57444ebb04b93fbada7",
  measurementId: "G-T7S7Q8K96Y"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Default receipt settings
const DEFAULTS = {
  storeName: "Otterton's Point of Sale",
  address: "Building B, Sukhumvit Road",
  phone: "02-XXX-XXXX",
  footer: "Thank you! Please enjoy your coffee.",
  fontSize: 13,
  storeNameFontSize: 16,
  storeNameAlign: "center",
  addressFontSize: 11,
  addressAlign: "center"
};

// Firestore document reference
const settingsRef = doc(db, "settings", "receipt");

// DOM Elements
const storeNameInput = document.getElementById('storeName');
const addressInput = document.getElementById('storeAddress');
const phoneInput = document.getElementById('storePhone');
const footerInput = document.getElementById('footerMessage');
const fontSizeInput = document.getElementById('fontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');

// New controls
const storeNameFontSizeInput = document.getElementById('storeNameFontSize');
const storeNameFontSizeValue = document.getElementById('storeNameFontSizeValue');
const storeNameAlignInput = document.getElementById('storeNameAlign');
const addressFontSizeInput = document.getElementById('addressFontSize');
const addressFontSizeValue = document.getElementById('addressFontSizeValue');
const addressAlignInput = document.getElementById('addressAlign');

// Preview Elements
const previewStoreName = document.getElementById('previewStoreName');
const previewAddress = document.getElementById('previewAddress');
const previewPhone = document.getElementById('previewPhone');
const previewFooter = document.getElementById('previewFooter');
const receiptPreview = document.getElementById('receiptPreview');

/**
 * Load settings from Firestore, or use defaults
 */
async function loadSettings() {
  try {
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      const data = snap.data();
      populateForm(data);
      console.log("Loaded receipt settings from Firestore.");
    } else {
      populateForm(DEFAULTS);
      console.log("No saved settings found, using defaults.");
    }
  } catch (err) {
    console.error("Error loading settings:", err);
    populateForm(DEFAULTS);
    showToast("Could not load settings from cloud.", "error");
  }
}

/**
 * Populate form fields and update preview
 */
function populateForm(data) {
  storeNameInput.value = data.storeName || DEFAULTS.storeName;
  addressInput.value = data.address || DEFAULTS.address;
  phoneInput.value = data.phone || DEFAULTS.phone;
  footerInput.value = data.footer || DEFAULTS.footer;
  fontSizeInput.value = data.fontSize || DEFAULTS.fontSize;
  fontSizeValue.textContent = `${fontSizeInput.value}px`;

  storeNameFontSizeInput.value = data.storeNameFontSize || DEFAULTS.storeNameFontSize;
  storeNameFontSizeValue.textContent = `${storeNameFontSizeInput.value}px`;
  storeNameAlignInput.value = data.storeNameAlign || DEFAULTS.storeNameAlign;

  addressFontSizeInput.value = data.addressFontSize || DEFAULTS.addressFontSize;
  addressFontSizeValue.textContent = `${addressFontSizeInput.value}px`;
  addressAlignInput.value = data.addressAlign || DEFAULTS.addressAlign;

  updatePreview();
}

/**
 * Save settings to Firestore
 */
async function saveSettings() {
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span style="opacity:0.7;">Saving...</span>';
  saveBtn.disabled = true;

  const settings = {
    storeName: storeNameInput.value.trim(),
    address: addressInput.value.trim(),
    phone: phoneInput.value.trim(),
    footer: footerInput.value.trim(),
    fontSize: parseFloat(fontSizeInput.value),
    storeNameFontSize: parseFloat(storeNameFontSizeInput.value),
    storeNameAlign: storeNameAlignInput.value,
    addressFontSize: parseFloat(addressFontSizeInput.value),
    addressAlign: addressAlignInput.value,
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(settingsRef, settings);
    showToast("Receipt settings saved to cloud!", "success");
    console.log("Settings saved:", settings);
  } catch (err) {
    console.error("Error saving settings:", err);
    showToast("Failed to save. Check your connection.", "error");
  } finally {
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
    // Re-init lucide icons inside the button
    if (window.lucide) lucide.createIcons();
  }
}

/**
 * Reset form to defaults
 */
function resetToDefaults() {
  if (confirm("Reset all fields to default values?")) {
    populateForm(DEFAULTS);
    showToast("Fields reset to defaults. Click Save to apply.", "success");
  }
}

/**
 * Update the live preview panel in real-time
 */
function updatePreview() {
  previewStoreName.textContent = storeNameInput.value || DEFAULTS.storeName;
  previewStoreName.style.fontSize = `${storeNameFontSizeInput.value}px`;
  previewStoreName.style.textAlign = storeNameAlignInput.value;

  previewAddress.textContent = addressInput.value || DEFAULTS.address;
  previewAddress.style.fontSize = `${addressFontSizeInput.value}px`;
  previewAddress.style.textAlign = addressAlignInput.value;

  previewPhone.textContent = `โทร: ${phoneInput.value || DEFAULTS.phone}`;
  previewPhone.style.fontSize = `${addressFontSizeInput.value}px`;
  previewPhone.style.textAlign = addressAlignInput.value;

  const footerText = footerInput.value || DEFAULTS.footer;
  previewFooter.innerHTML = footerText;

  const size = parseFloat(fontSizeInput.value);
  receiptPreview.style.fontSize = `${size - 2}px`;
}

/**
 * Toast notification
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = type === 'success' ? '✓' : '✕';
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon}</span> ${message}`;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// --- Event Listeners ---

saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetToDefaults);

// Live preview updates on every keystroke
storeNameInput.addEventListener('input', updatePreview);
addressInput.addEventListener('input', updatePreview);
phoneInput.addEventListener('input', updatePreview);
footerInput.addEventListener('input', updatePreview);
fontSizeInput.addEventListener('input', () => {
  fontSizeValue.textContent = `${fontSizeInput.value}px`;
  updatePreview();
});
storeNameFontSizeInput.addEventListener('input', () => {
  storeNameFontSizeValue.textContent = `${storeNameFontSizeInput.value}px`;
  updatePreview();
});
storeNameAlignInput.addEventListener('change', updatePreview);
addressFontSizeInput.addEventListener('input', () => {
  addressFontSizeValue.textContent = `${addressFontSizeInput.value}px`;
  updatePreview();
});
addressAlignInput.addEventListener('change', updatePreview);

// Initialize Lucide icons + load settings on page ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
});

loadSettings();
