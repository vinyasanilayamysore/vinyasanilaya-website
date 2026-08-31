# Vinyasa Nilaya - Digital Check-in & Guest Portal

Vinyasa Nilaya is a professional hospitality platform designed to provide a seamless, secure, and touchless digital check-in experience for guests. This repository contains the frontend portal and integration logic with Firebase and high-performance OCR services.

## 🚀 Live Links
- **Main Website:** [vinyasanilaya.com](https://vinyasanilaya.com)
- **Guest Verification Portal:** [vinyasanilaya.com/guestverification](https://vinyasanilaya.com/guestverification)

---

## 🛠 Functional Overview

The portal follows a structured, 5-step verification process to ensure guest data integrity and compliance with house policies.

### 1. Booking Lookup (WhatsApp Integration)
Guests begin by entering their primary WhatsApp number used during booking.
- **Existing Guests:** Automatically fetches and pre-populates previous identity and contact details from Firestore to speed up the process.
- **New Guests:** Triggers the ID upload and scanning workflow.

### 2. Intelligent Identity Verification (OCR)
The system employs a specialized OCR (Optical Character Recognition) engine that adapts based on the guest's nationality:
- **🇮🇳 Indian Guests:** Restricted to **Aadhaar Card** only. The system requires both front and back images, specifically prompting for a clear view of the **QR code** on the backside for digital validation.
- **🌐 Foreign Guests:** Restricted to **Passport** only. Requires a scan of the Bio-data page and the Address page.
- **Conflict Prevention:** The system checks the database in real-time to ensure the provided ID is not already registered under a different mobile number, preventing duplicate or fraudulent profiles.

### 3. Identity Guide & Capture
- **Visual Templates:** Guests are shown dashed-line guides for Aadhaar and Passport positioning to ensure all fields and security features (like QR codes) are visible.
- **Hybrid Capture:** 
  - **Mobile:** Triggers the native environment camera.
  - **Desktop:** Opens a custom webcam modal with semi-transparent overlays for alignment.
  - **Fallback:** Allows file/gallery selection if camera access is denied.

### 4. Emergency & Travel Coordination
- **Primary vs. Emergency:** A strict validation ensures the **Emergency Contact** number is distinct from the primary WhatsApp number, guaranteeing a secondary point of contact.
- **Travel Profiling:** Collects arrival city and purpose of travel (Tourism, Business, Ayurveda/Therapy, etc.) for statutory reporting.

### 5. Face Verification (Selfie)
A live selfie capture process with an oval face-guide ensures that the person checking in matches the identity document provided. Images are compressed locally to under 150KB before being uploaded to **Firebase Storage** to optimize performance.

### 6. Healthy Environment Policy
Guests must explicitly agree to the Vinyasa Nilaya House Rules, which emphasize:
- **Zero Tolerance:** No alcohol, smoking, or non-vegetarian food.
- **Guest Policy:** We host married families and single-gender groups. We do not accommodate unmarried couples or unapproved visitors.

---

## 🏗 Technical Stack

- **Frontend:** Vanilla JavaScript (ES Modules), Bootstrap 5, CSS3.
- **Backend/Database:** Firebase Firestore (NoSQL) for guest records.
- **Cloud Storage:** Firebase Storage for encrypted identity proofs and selfies.
- **OCR Engine:** Cloud Run hosted Proxy for Google Cloud Vision API.
- **CI/CD:** GitHub Actions for automated hosting and Firestore rules deployment.

---

## 📂 Project Structure

```text
vinyasa-nilaya/
├── .github/workflows/    # Firebase Deployment Workflows
├── public/
│   ├── js/
│   │   ├── app.js        # Core Orchestrator (OCR, Logic, Validation)
│   │   ├── firebase-config.js
│   │   └── storage.js    # Firebase Storage wrappers
│   ├── css/
│   │   └── styles.css    # Branding and UI components
│   └── guestverification.html  # Main Check-in Portal
├── firestore.rules       # Security rules for guest data
└── firebase.json         # Hosting & Routing configuration
```

---

## 🔒 Security & Privacy

- **Data Redaction:** The OCR logic is designed to recognize and handle masked or redacted documents where applicable.
- **Storage Architecture:** Files are named using a `YYYY-MM-DD-phone-type-side.jpg` convention and stored in timestamped folders for easy auditing.
- **Access Control:** Firestore rules ensure that guest data can only be written by the portal and cannot be publicly queried.

---
© 2024 Vinyasa Nilaya. All rights reserved.
```

