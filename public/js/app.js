// js/app.js
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { db, storage } from "./firebase-config.js";

// Global Variables
let currentStream = null;
let selfieDataBase64 = null;
let existingSelfieUrl = null;


window.handlePreview = function(input, previewId) {
  const previewContainer = document.getElementById(previewId);
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewContainer.innerHTML = `<img src="${e.target.result}" class="img-fluid rounded" style="max-height: 120px; object-fit: contain;">`;
      updateScanButtonState();
    };
    reader.readAsDataURL(input.files[0]);
  }
};
/* ==========================================================================
   OCR ENGINE & PARSING LOGIC
   ========================================================================== */

// Helper to convert input files to base64
async function convertAndCompressToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDimension = 1200; // Resizing for optimal Firestore storage
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality to keep size well under 1MB
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// Helper to convert dataURL to Blob for Firebase Storage
function dataURLToBlob(dataURL) {
  const byteString = atob(dataURL.split(',')[1]);
  const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

let frontImageBase64 = null;
let backImageBase64 = null;

// Attach event listeners to your file input elements
['idFrontFile', 'idFrontCamera', 'idBackFile', 'idBackCamera'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', updateScanButtonState);
  }
});

/**
 * Handles the click trigger for identity card scanning.
 */
window.handleIdScan = async function() {
  const frontFileInput = document.getElementById('idFrontFile')?.files[0] ? 'idFrontFile' : 'idFrontCamera';
  const backFileInput = document.getElementById('idBackFile')?.files[0] ? 'idBackFile' : 'idBackCamera';

  const frontFile = document.getElementById(frontFileInput)?.files[0];
  const backFile = document.getElementById(backFileInput)?.files[0];
  const currentMobile = document.getElementById('searchMobile')?.value?.replace(/\D/g, '');

  const nationalityEl = document.querySelector('input[name="nationality"]:checked');
  const nationality = nationalityEl ? nationalityEl.value : 'Indian';
  const idType = document.getElementById('idType')?.value || 'Document';

  if (!frontFile || !backFile) {
    return showNotification("Upload Required", "Please upload both Front and Back side images of your ID card.", "warning");
  }
  if (!currentMobile) {
    return showNotification("Mobile Required", "Mobile number is required for registration matching.", "warning");
  }

  const btn = document.getElementById('scanBtn');
  const spinner = document.getElementById('scanSpinner');
  const btnText = document.getElementById('scanBtnText');

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('d-none');
  if (btnText) btnText.innerText = 'Analyzing ' + idType;

  try {
    // 1. Read both images simultaneously to Base64
    const [frontBase64, backBase64] = await Promise.all([
      convertAndCompressToBase64(frontFile),
      convertAndCompressToBase64(backFile)
    ]);

    frontImageBase64 = frontBase64;
    backImageBase64 = backBase64;

    // 2. Execute OCR Extraction via Cloud Run Vision API backend
    const res = await executeOcrFlow(frontBase64, backBase64, idType, nationality);

    // 3. Verify against backend API to avoid duplicate ID registrations
    const checkRes = await checkIdMobileAssociation(res.idNumber, currentMobile);

    if (checkRes && checkRes.conflict) {
      if (btn) {
        btn.disabled = false;
        btn.className = "btn btn-indigo w-100 py-3 fw-bold mb-4 shadow-sm";
        if (btnText) btnText.innerText = 'Verify & Scan Document Now';
      }

      document.getElementById('name').value = "";
      document.getElementById('idNumber').value = "";
      document.getElementById('address').value = "";

      showNotification(
        "Security Alert", 
        `This identification document is recorded under another profile (${checkRes.existingName || 'Existing Guest'}).`, 
        "error"
      );

      updateScanButtonState();
      return;
    }

    // 4. Update Form Fields with parsed details
    const ocrConfirmEl = document.getElementById('ocrConfirmation');
    if (ocrConfirmEl) ocrConfirmEl.classList.remove('d-none');

    document.getElementById('name').value = (res.name && res.name !== "Not found") ? res.name : "";
    document.getElementById('idNumber').value = res.idNumber || "";
    document.getElementById('address').value = res.address || "";

    if (spinner) spinner.classList.add('d-none');
    if (btn) {
      btn.disabled = false;
      btn.className = "btn btn-success w-100 mb-4 shadow-sm text-white py-3 fw-bold";
      if (btnText) btnText.innerText = 'Scan Complete ✓';
    }

    setTimeout(() => {
      const ocrConfirmView = document.getElementById('ocrConfirmation');
      if (ocrConfirmView) ocrConfirmView.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.className = "btn btn-indigo w-100 py-3 fw-bold mb-4 shadow-sm";
      if (btnText) btnText.innerText = 'Verify & Scan Document Now';
    }
    if (spinner) spinner.classList.add('d-none');

    // Reset ID inputs and global Base64 holders if scan/validation fails
    ['idFrontFile', 'idFrontCamera', 'idBackFile', 'idBackCamera'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    frontImageBase64 = null;
    backImageBase64 = null;

    // Reset Preview Boxes to original instructional state
    const frontPreview = document.getElementById('idFrontPreview');
    const backPreview = document.getElementById('idBackPreview');
    if (frontPreview) frontPreview.innerHTML = '<div class="py-4 text-muted"><i class="bi bi-card-image fs-1 d-block mb-2"></i>FRONT SIDE</div>';
    if (backPreview) backPreview.innerHTML = '<div class="py-4 text-muted"><i class="bi bi-card-image fs-1 d-block mb-2"></i>BACK SIDE</div>';

    updateScanButtonState();
    showNotification("Scan Failed", err.message || "Could not read ID details. Please try with clearer photos.", "error");
  }
};


/**
 * Server-side function to check if an ID is already registered under a different mobile number.
 */
async function checkIdMobileAssociation(extractedId, currentMobile) {
  // Clean inputs
  const searchId = String(extractedId || '').replace(/[\s-]/g, '').toUpperCase();
  const searchMobile = String(currentMobile || '').replace(/[\s-+\d]{0,2}/, '').trim();

  // 1. Skip if ID is empty or redacted to avoid false positives
  if (!searchId || searchId.includes("REDACTED") || searchId === "") {
    return { conflict: false };
  }

  try {
    // 2. Query your database for an existing guest with this ID
    const guestsRef = collection(db, "guests");
    const q = query(guestsRef, where("verification.idNo", "==", searchId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const existingGuest = querySnapshot.docs[0].data();
      const existingMobile = String(existingGuest.guestDetails?.phone || '').replace(/[\s-+\d]{0,2}/, '').trim();

      // 3. Flag conflict if mobile numbers don't match
      if (existingMobile !== searchMobile && searchMobile !== "") {
        return {
          conflict: true,
          existingName: existingGuest.guestDetails?.name,
          existingMobile: existingGuest.guestDetails?.phone
        };
      }
    }

    return { conflict: false };
  } catch (error) {
    console.error("Conflict check error:", error);
    return { conflict: false };
  }
}

/**
 * Sends Base64 images to Google Cloud Vision API endpoint or handles browser extraction
 */
async function extractTextFromImage(base64Data) {
  // Strip Base64 header string if included
  const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  try {
    const response = await fetch('https://ocr-proxy-547333535578.asia-south1.run.app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: cleanBase64 })
    });

    if (!response.ok) {
      throw new Error(`OCR Processing error from server: ${response.status}`);
    }

    const data = await response.json();
    return data.text || "";
  } catch (error) {
    console.error("Failed to extract text from image:", error);
    return "";
  }
}
/**
 * Main OCR Orchestrator Flow
 */
async function executeOcrFlow(frontBase64, backBase64, idType, nationality) {
  try {
    const frontText = frontBase64 ? await extractTextFromImage(frontBase64) : "";
    const backText = backBase64 ? await extractTextFromImage(backBase64) : "";

    const combinedRawText = `${frontText}\n${backText}`.trim();

    // If combined text is empty (during testing/mock), return empty schema cleanly
    if (!combinedRawText) {
      return { name: "", idNumber: "", address: "", raw: "" };
    }

    const upperText = combinedRawText.toUpperCase();

    // Specific Aadhaar Verification Check
    if (idType === "Aadhaar") {
      const hasAadhaarKeyword = upperText.includes("AADHAAR") || upperText.includes("AADHAR");
      
      if (!hasAadhaarKeyword) {
        throw new Error("Aadhaar keyword not detected in uploaded images. Please upload a valid Aadhaar card (Front & Back).");
      }
    }

    const idKeywords = ["GOVERNMENT", "INDIA", "INCOME TAX", "ELECTION", "DRIVING", "LICENSE", "ID", "CARD", "UNIQUE", "PASSPORT", "REPUBLIC", "AADHAAR", "AADHAR"];
    const hasIdKeywords = idKeywords.some(keyword => upperText.includes(keyword));

    if (!hasIdKeywords) {
      throw new Error("This doesn't look like a valid Government ID. Please upload clear photos.");
    }

    switch (idType) {
      case "Aadhaar":
        return parseAadhaarData(combinedRawText);
      case "VoterID":
        return parseVoterIDData(combinedRawText);
      case "DL":
        return parseDrivingLicenseData(combinedRawText);
      case "Passport":
        return parsePassportData(combinedRawText);
      default:
        throw new Error("Unsupported ID type selected.");
    }
  } catch (e) {
    console.error("OCR Flow Error: " + e.message);
    throw e;
  }
}

/* ==========================================================================
   DOCUMENT PARSERS
   ========================================================================== */
function parseAadhaarData(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const standardizedText = rawText.replace(/[x*×K]/g, 'X');

  // 1. Identification Number Extraction
  const idRegex = /(\b[X\d]{4}\s[X\d]{4}\s\d{4}\b)|(\b\d{4}\b$)/gm;
  const matches = standardizedText.match(idRegex) || [];
  let idNumber = "";
  let fallbackId = "";
  const blacklisted = ["1947", "2021", "2022", "2023", "2024", "2025", "2026"];

  for (let i = 0; i < matches.length; i++) {
    let candidate = matches[i].trim();
    let cleanDigits = candidate.replace(/\s/g, "");

    if (cleanDigits.length === 12) {
      const matchIndex = standardizedText.indexOf(candidate);
      const contextBefore = standardizedText.substring(Math.max(0, matchIndex - 15), matchIndex).toUpperCase();
      if (!contextBefore.includes("VID")) {
        idNumber = candidate.toUpperCase();
        break;
      }
    } else if (cleanDigits.length === 4 && !idNumber) {
      const matchIndex = standardizedText.indexOf(candidate);
      const contextBefore = standardizedText.substring(Math.max(0, matchIndex - 15), matchIndex).toUpperCase();
      if (!blacklisted.includes(candidate) && !contextBefore.includes("VID")) {
        fallbackId = "[Aadhaar Redacted] " + candidate;
      }
    }
  }
  idNumber = idNumber || fallbackId;

  // 2. Structural Name Extraction using Anchors (DOB/Gender)
  let detectedName = "Not found";
  const noiseKeywords = [
    "GOVERNMENT", "INDIA", "FATHER", "DOB", "MALE", "FEMALE",
    "ENROLLMENT", "UNIQUE", "HELP", "YEAR", "VID", "INDA",
    "WWW.", "HELP@", "ELITEBOOK", "LATITUDE", "THINKPAD", "MACBOOK", "HP", "DELL",
    "AADHAAR", "NUMBER", "NO.", "ISSUE", "DATE", "GOVERNMENT OF INDIA", "BHARAT"
  ];

  // Helper function: Validate if a line is a real English name (including initials like 'M D' or 'M.D.')
function isValidNameString(str) {
  if (!str || str.length < 2) return false;

  // 1. Strip non-ASCII characters
  const cleanStr = str.replace(/[^\x00-\x7F]/g, "").trim();
  if (!/^[A-Za-z\s.]+$/.test(cleanStr)) return false;

  const uStr = cleanStr.toUpperCase();

  // 2. Filter system noise and labels
  if (noiseKeywords.some(word => uStr.includes(word))) return false;
  if (/\d/.test(cleanStr)) return false;
  if (/S\/O|D\/O|W\/O|SON OF|DAUGHTER OF|WIFE OF/i.test(uStr)) return false;

  const words = cleanStr.split(/\s+/).filter(w => w.length > 0);

  // 3. Reject OCR garbage generated from regional script
  // Common Kannada OCR artifacts produce strings like "Jnavr", "wear", "wo", "woa", "dwo"
  const ocrGarbageRegex = /\b(jnavr|wear|wo|woa|dwo|eaar|jne|vnay)\b/i;
  if (ocrGarbageRegex.test(cleanStr)) return false;

  // 4. Reject improbable English phonetic starts (e.g., "Jn...")
  const invalidLetterClusters = /\b(jn|yx|qj|xj|zg|vj)\w+/i;
  if (invalidLetterClusters.test(cleanStr)) return false;

  // 5. Must contain at least one valid core name word (3+ chars)
  const hasCoreNameWord = words.some(w => /^[A-Za-z]{3,}$/.test(w));

  return hasCoreNameWord;
}

  // Strategy A: Locate DOB / Gender anchor line and scan upwards
  let anchorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const uLine = lines[i].toUpperCase();
    if (uLine.includes("DOB") || uLine.includes("MALE") || uLine.includes("FEMALE") || uLine.includes("DATE OF BIRTH")) {
      anchorIndex = i;
      break;
    }
  }

  if (anchorIndex > 0) {
    let collectedNameParts = [];

    // Scan up to 5 lines prior to anchor
    for (let i = anchorIndex - 1; i >= Math.max(0, anchorIndex - 5); i--) {
      let candidate = lines[i].replace(/[^\x00-\x7F]/g, "").trim();

      if (isValidNameString(candidate)) {
        collectedNameParts.unshift(candidate);
      } else if (collectedNameParts.length > 0) {
        // Stop scanning only once we've already found a valid name and then hit a non-name line
        break;
      }
    }

    if (collectedNameParts.length > 0) {
      detectedName = collectedNameParts.join(" ");
    }
  }

  // Strategy B: Fallback scan if anchor line was not found or failed
  if (detectedName === "Not found") {
    const searchLimit = Math.floor(lines.length * 0.6);
    for (let i = 0; i < searchLimit; i++) {
      let candidate = lines[i].replace(/[^\x00-\x7F]/g, "").trim();
      if (isValidNameString(candidate)) {
        detectedName = candidate;
        break;
      }
    }
  }

  // 3. Address Extraction
  let detectedAddress = "Not found";
  let capturingAddress = false;
  let addressLines = [];

  for (let i = 0; i < lines.length; i++) {
    let englishOnlyLine = lines[i].replace(/[^\x00-\x7F]/g, "").trim();
    const upperLine = englishOnlyLine.toUpperCase();

    const isAddressLabel = upperLine.includes("ADDRESS");
    const isRelationTrigger = upperLine.includes("S/O") || upperLine.includes("D/O") || upperLine.includes("W/O");

    if (isAddressLabel || isRelationTrigger) {
      if (capturingAddress) { addressLines = []; }
      capturingAddress = true;

      let startText = englishOnlyLine.replace(/Address[:\s]*/i, "").trim();
      startText = startText.replace(/^[:,\s\d]+/, "").trim();

      if (startText.replace(/[^a-zA-Z]/g, "").length > 3) {
        addressLines.push(startText);
      }
      continue;
    }

    if (capturingAddress) {
      const isFooter = ["WWW.", "UNIQUE", "HELP", "1947", "UIDAI"].some(word => upperLine.includes(word));
      const isIdRepeat = idNumber && englishOnlyLine.replace(/\s/g, '').includes(idNumber.replace(/\s/g, '').slice(-4));

      if (isFooter || isIdRepeat) {
        capturingAddress = false;
      } else {
        if (englishOnlyLine.replace(/[^a-zA-Z]/g, "").length > 3) {
          addressLines.push(englishOnlyLine);
        }
      }
    }
  }

  if (addressLines.length > 0) {
    detectedAddress = addressLines.join(", ").replace(/,\s*,/g, ",").trim();
    detectedAddress = detectedAddress.replace(/^(Address|S\/O|D\/O|W\/O)\s+\1/i, "$1");
  }

  return { name: detectedName, idNumber: idNumber || "", address: detectedAddress, raw: rawText };
}

function parseVoterIDData(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const idMatch = rawText.match(/[A-Z]{3}\d{7}/i);

  let detectedName = "Not found";
  let detectedAddress = "Not found";

  for (let i = 0; i < lines.length; i++) {
    const upperLine = lines[i].toUpperCase();
    if (upperLine.includes("ELECTOR'S NAME") || upperLine.includes("ELECTORS NAME") || upperLine.includes("NAME")) {
      let namePart = lines[i].split(/[:|-]/).pop().trim();
      if (namePart.length < 3 && i + 1 < lines.length) {
        namePart = lines[i + 1].trim();
      }
      detectedName = namePart.replace(/[^\x00-\x7F]/g, "").trim();
      if (detectedName.length > 3) break;
    }
  }

  let capturingAddress = false;
  let addressLines = [];
  const stopKeywords = ["DATE", "PLACE", "ELECTORAL", "REGISTRATION", "OFFICER", "FACSIMILE", "CHANGE", "OBTAIN"];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let englishOnlyLine = line.replace(/[^\x00-\x7F]/g, "").trim();
    const upperLine = englishOnlyLine.toUpperCase();

    const isAddressStart = upperLine.includes("ADDRESS") || englishOnlyLine.startsWith("#") || /^\d{1,4}[/-]\d+/.test(englishOnlyLine);

    if (isAddressStart && !capturingAddress) {
      capturingAddress = true;
      let startText = englishOnlyLine.replace(/Address[:\s]*/i, "").trim();
      startText = startText.replace(/^[:,\s]+/, "").trim();

      if (startText.length > 3) {
        addressLines.push(startText);
      }
      continue;
    }

    if (capturingAddress) {
      const shouldStop = stopKeywords.some(word => upperLine.includes(word)) || /\d{2}\/\d{2}\/\d{4}/.test(englishOnlyLine);

      if (shouldStop) {
        capturingAddress = false;
        break;
      } else {
        if (englishOnlyLine.replace(/[^a-zA-Z]/g, "").length > 3) {
          addressLines.push(englishOnlyLine);
        }
      }
    }
  }

  if (addressLines.length > 0) {
    detectedAddress = addressLines.join(", ").replace(/,\s*,/g, ",").trim();
  }

  return { name: detectedName, idNumber: idMatch ? idMatch[0].toUpperCase() : "", address: detectedAddress, raw: rawText };
}

function parseDrivingLicenseData(combinedText) {
  const lines = combinedText.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const dlPattern = /([A-Z]{2}\d{2})[\s\-]?(\d{4})[\s\-]?(\d{5,7})/i;
  const dlMatch = combinedText.match(dlPattern);
  let idNumber = dlMatch ? (dlMatch[1] + " " + dlMatch[2] + " " + dlMatch[3]).toUpperCase() : "";

  let detectedName = "Not found";
  let detectedAddress = "Not found";
  let capturingAddress = false;
  let addressLines = [];

  const noiseKeywords = ["TRANSPORT", "DATE", "BIRTH", "D.O.B", "ISSUE", "EXPIRY", "VALID", "ADDRESS", "S/O", "D/O", "W/O", "FATHER", "HUSBAND", "COV", "DOI", "INDIA", "CARD"];
  const stopKeywords = ["VALID", "TILL", "SIGN", "DOI", "COV", "AUTHORITY", "BLOOD", "B.G"];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upperLine = line.toUpperCase();
    const cleanLine = line.replace(/[^\x00-\x7F]/g, "").trim();

    if (detectedName === "Not found") {
      const isNameLine = /N[A-Z0-4\s]{2,3}E|HOLDER/i.test(upperLine);
      if (isNameLine) {
        let potentialName = line.includes(":") ? line.split(":").pop().trim() : "";

        let searchOffset = 1;
        while (potentialName.length < 3 && searchOffset <= 3 && (i + searchOffset) < lines.length) {
          const candidate = lines[i + searchOffset].trim();
          const isDate = /\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(candidate);
          const isNoise = noiseKeywords.some(word => candidate.toUpperCase().includes(word));
          const hasNumbers = /\d/.test(candidate);

          if (candidate.length > 3 && !isDate && !isNoise && !hasNumbers) {
            potentialName = candidate;
          }
          searchOffset++;
        }
        const cleanNameResult = potentialName.replace(/[^\x00-\x7F]/g, "").replace(/^[:\s\-]+/, "").trim();
        if (cleanNameResult.length > 3) detectedName = cleanNameResult.toUpperCase();
      }
    }

    if (upperLine.includes("ADDRESS")) {
      capturingAddress = true;
      let startText = cleanLine.split(/[:|-]/).pop().trim();

      if (startText.toUpperCase() === "ADDRESS" || startText.length < 2) {
        continue;
      }
      addressLines.push(startText);
      continue;
    }

    if (capturingAddress) {
      const shouldStop = stopKeywords.some(word => upperLine.includes(word)) || /\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(cleanLine);

      if (shouldStop) {
        capturingAddress = false;
      } else {
        const isNoise = noiseKeywords.some(word => upperLine.includes(word) && word !== "ADDRESS");
        if (!isNoise && cleanLine.length > 2) {
          addressLines.push(cleanLine);
        }
      }
    }
  }

  if (addressLines.length > 0) {
    detectedAddress = addressLines.join(", ").replace(/[:]/g, "").replace(/,\s*,/g, ",").trim();
  }

  return { name: detectedName, idNumber: idNumber, address: detectedAddress, raw: combinedText };
}

function parsePassportData(rawText, pageType = "auto") {
  const upperRawText = rawText.toUpperCase();

  // 1. Strict Disqualification for Non-Passport Documents (DL, National IDs, Tax IDs)
  const nonPassportKeywords = [
    "DRIVING LICENCE", "DRIVING LICENSE", "MOTOR VEHICLE", "UNION MOTOR", 
    "TRANSPORT DEPARTMENT", "DL NO", "DL NUMBER", "AUTHORITY TO DRIVE",
    "AADHAAR", "AADHAR", "UIDAI", "UNIQUE IDENTIFICATION", 
    "PERMANENT ACCOUNT NUMBER", "INCOME TAX DEPARTMENT", 
    "ELECTION COMMISSION", "VOTER"
  ];

  const containsForbiddenKeyword = nonPassportKeywords.some(keyword => upperRawText.includes(keyword));

  // 2. Strict Positive Passport Identification
  const hasMRZ = /P<[A-Z0-9<]+/i.test(upperRawText) || /P[A-Z0-9<]{5,}/i.test(upperRawText);
  const containsPassportWord = upperRawText.includes("PASSPORT") || upperRawText.includes("पासपोर्ट");
  const containsRepublicOf = upperRawText.includes("REPUBLIC OF INDIA") || upperRawText.includes("REPUBLIC OF");
  
  // Specific Back Page Check (Indian Passport Back Page structure)
  const isPassportBackPage = (
    (upperRawText.includes("FILE NO") || upperRuleIncludesAny(upperRawText, ["NAME OF FATHER", "NAME OF MOTHER", "NAME OF SPOUSE"])) &&
    (upperRawText.includes("ADDRESS") || upperRawText.includes("OLD PASSPORT"))
  );

  const isValidPassportDoc = !containsForbiddenKeyword && (hasMRZ || containsPassportWord || containsRepublicOf || isPassportBackPage);

  // Reject non-passport documents immediately
  if (!isValidPassportDoc) {
    return {
      isValidPassport: false,
      error: "Invalid document uploaded. Please upload a valid Passport image.",
      name: "",
      idNumber: "",
      nationality: "",
      address: "Not found",
      raw: rawText
    };
  }

  // --- Proceed with Parsing Valid Passport Document ---
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let extractedData = {
    surname: "",
    givenName: "",
    idNumber: "",
    nationality: "",
    address: "Not found"
  };

  // 3. Primary MRZ Extraction
  const cleanMRZText = upperRawText.replace(/[^\S\r\n]+/g, ""); 
  
  // MRZ Line 1: P<[3-letter country][Surname]<<[Given Name]
  const mrzLine1Match = cleanMRZText.match(/P<([A-Z]{3})([A-Z<]+)<<([A-Z<]+)/);
  if (mrzLine1Match) {
    extractedData.nationality = mrzLine1Match[1];
    extractedData.surname = mrzLine1Match[2].replace(/</g, " ").trim();
    extractedData.givenName = mrzLine1Match[3].replace(/</g, " ").trim();
  }

  // MRZ Line 2: Passport Number (9 alphanumeric characters)
  const mrzLine2Match = cleanMRZText.match(/([A-Z0-9<]{9})[0-9][A-Z]{3}[0-9]{6}/i);
  if (mrzLine2Match) {
    extractedData.idNumber = mrzLine2Match[1].replace(/</g, "");
  }

  // 4. Visual Label Extractions & Fallbacks
  const headers = ["SURNAME", "GIVEN NAME", "NAME", "दिया गया नाम", "उपनाम", "PASSPORT"];
  const ignoredWords = ["PASSPORT", "INDIAN", "REPUBLIC", "COUNTRY", "NATIONALITY", "SURNAME", "GIVEN", "DETAILS", "DRIVING", "LICENCE"];

  let capturingAddress = false;
  let addressLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upperLine = line.toUpperCase();

    // Passport ID label parsing
    if (!extractedData.idNumber && (upperLine.includes("PASSPORT NO") || upperLine.includes("PASSPORT") || upperLine.includes("पासपोर्ट"))) {
      let val = line.split(/[:/|-]/).pop().trim();
      let candidate = val.match(/\b[A-PR-WYA-Z0-9]{7,9}\b/i);
      if (candidate && !ignoredWords.includes(candidate[0].toUpperCase())) {
        extractedData.idNumber = candidate[0].toUpperCase();
      }
    }

    // Surname parsing
    if (!extractedData.surname && (upperLine.includes("SURNAME") || upperLine.includes("उपनाम"))) {
      let val = line.split(/[:/|-]/).pop().trim();
      if ((val.length < 2 || headers.some(h => val.toUpperCase() === h)) && i + 1 < lines.length) {
        val = lines[i + 1].trim();
      }
      if (!headers.some(h => val.toUpperCase().includes(h))) {
        extractedData.surname = val.replace(/[^\x00-\x7F]/g, "").trim();
      }
    }

    // Given Name parsing
    if (!extractedData.givenName && (upperLine.includes("GIVEN NAME") || upperLine.includes("दिया गया नाम"))) {
      let val = line.split(/[:/|-]/).pop().trim();
      if ((val.length < 2 || headers.some(h => val.toUpperCase() === h)) && i + 1 < lines.length) {
        val = lines[i + 1].trim();
      }
      if (!headers.some(h => val.toUpperCase().includes(h)) && !/\d/.test(val)) {
        extractedData.givenName = val.replace(/[^\x00-\x7F]/g, "").trim();
      }
    }

    // Address Parsing
    if (upperLine.includes("ADDRESS") || upperLine.includes("पता")) {
      capturingAddress = true;
      let startText = line.split(/[:/|-]/).pop().trim();
      if (!startText.toUpperCase().includes("ADDRESS") && startText.length > 2) {
        addressLines.push(startText);
      }
      continue;
    }

    if (capturingAddress) {
      const isStopWord = ["FILE NO", "PHOTO", "OLD PASSPORT", "DATE OF ISSUE", "PLACE OF ISSUE", "PIN:"].some(w => upperLine.includes(w));
      const isBarcode = /^R\d{7,}/i.test(line) || /BN\d{10,}/i.test(line);

      if (isStopWord || isBarcode) {
        if (upperLine.includes("PIN:")) {
          let cleanPinLine = line.replace(/[^\x00-\x7F]/g, "").trim();
          if (cleanPinLine.length > 3) addressLines.push(cleanPinLine);
        }
        capturingAddress = false;
      } else {
        let englishOnlyLine = line.replace(/[^\x00-\x7F]/g, "").trim();
        const cleanedLine = englishOnlyLine.replace(/^[^a-zA-Z0-9#]+/, "").trim();
        if ((cleanedLine.match(/[a-zA-Z0-9]/g) || []).length > 3) {
          addressLines.push(cleanedLine);
        }
      }
    }
  }

  // Fallback Passport ID Extraction
  if (!extractedData.idNumber) {
    const allMatches = rawText.match(/\b[A-PR-WYA-Z][0-9]{7}\b/gi) || [];
    if (allMatches.length > 0) {
      extractedData.idNumber = allMatches[0].toUpperCase();
    }
  }

  // Final Assembly
  let fullName = "";
  if (extractedData.givenName && extractedData.surname) {
    fullName = `${extractedData.givenName} ${extractedData.surname}`;
  } else {
    fullName = extractedData.givenName || extractedData.surname || "Not found";
  }

  if (addressLines.length > 0) {
    extractedData.address = addressLines.join(", ").replace(/,\s*,/g, ",").trim();
  }

  return {
    isValidPassport: true,
    name: fullName.toUpperCase().trim(),
    idNumber: extractedData.idNumber || "Not found",
    nationality: extractedData.nationality || "Not found",
    address: extractedData.address,
    raw: rawText
  };
}

// Helper utility
function upperRuleIncludesAny(str, arr) {
  return arr.some(item => str.includes(item));
}

/**
 * Mobile Search & Pre-population Handler
 */
window.handleMobileSearch = async function() {
  const searchInput = document.getElementById('searchMobile');
  const searchBtn = document.getElementById('searchBtn');

  if (!searchInput) {
    console.error("❌ 'searchMobile' element not found in DOM.");
    return;
  }

  const mobileInput = searchInput.value ? searchInput.value.trim().replace(/\D/g, '') : '';

  console.log("🔍 [Search Started] Cleaned Mobile Input:", mobileInput);
  if (typeof window.logToScreen === 'function') {
    window.logToScreen('INFO', `Initiating search for mobile: ${mobileInput}`);
  }

  if (!mobileInput || mobileInput.length !== 10) {
    console.warn("⚠️ [Search Cancelled] Invalid mobile number:", mobileInput);
    if (typeof window.logToScreen === 'function') {
      window.logToScreen('WARN', 'Search cancelled: Mobile number must be exactly 10 digits.');
    }

    // Clear input and refocus as requested
    searchInput.value = '';
    searchInput.focus();

    if (typeof showNotification === 'function') {
      showNotification("Invalid Mobile", "Please enter a valid 10-digit mobile number.", false);
    } else {
      alert("Please enter a valid 10-digit mobile number.");
    }
    return;
  }

  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.innerText = "Searching...";
  }

  try {
    console.log("📡 [Firestore Query] Querying 'guests' collection where guestDetails.phone ==", mobileInput);
    const guestsRef = collection(db, "guests");
    const q = query(guestsRef, where("guestDetails.phone", "==", mobileInput));
    const querySnapshot = await getDocs(q);

    console.log(`📊 [Firestore Result] Documents found: ${querySnapshot.size}`);
    if (typeof window.logToScreen === 'function') {
      window.logToScreen('INFO', `Query executed. Found ${querySnapshot.size} record(s) matching ${mobileInput}`);
    }

    const whatsappEl = document.getElementById('whatsapp');
    if (whatsappEl) whatsappEl.value = mobileInput;

    if (!querySnapshot.empty) {
      // Record found in Firestore
      const docSnapshot = querySnapshot.docs[0];
      const docData = docSnapshot.data();

      // Capture existing selfie URL to allow cleanup if updated
      existingSelfieUrl = docData.selfieUrl || null;

      console.log("✅ [Record Found] Document ID:", docSnapshot.id);

      const isExistingEl = document.getElementById('isExistingGuest');
      const rowNumEl = document.getElementById('rowNumber');
      if (isExistingEl) isExistingEl.value = "true";
      if (rowNumEl) rowNumEl.value = docSnapshot.id;

      // Populate UI fields
      const guestName = docData.guestDetails?.name || '';
      const idNo = docData.verification?.idNo || '';

      const nameEl = document.getElementById('name');
      const idNumEl = document.getElementById('idNumber');
      if (nameEl) nameEl.value = guestName;
      if (idNumEl) idNumEl.value = idNo;

      if (docData.emergencyContact) {
        const emName = document.getElementById('emergencyName');
        const emPhone = document.getElementById('emergencyPhone');
        if (emName) emName.value = docData.emergencyContact.name || '';
        if (emPhone) emPhone.value = docData.emergencyContact.phone || '';
      }

      if (docData.travelDetails) {
        const cityEl = document.getElementById('city');
        const purposeEl = document.getElementById('purpose');
        if (cityEl) cityEl.value = docData.travelDetails.arrivingCity || '';
        if (purposeEl) purposeEl.value = docData.travelDetails.purpose || '';
      }

      // UI state toggles for existing user
      const welcomeMsg = document.getElementById('welcomeMsg');
      const idUploadSec = document.getElementById('idUploadSection');
      const ocrConfirm = document.getElementById('ocrConfirmation');

      if (welcomeMsg) welcomeMsg.classList.remove('d-none');
      if (idUploadSec) idUploadSec.classList.add('d-none');
      if (ocrConfirm) ocrConfirm.classList.remove('d-none');

      if (typeof toggleSecondarySections === 'function') toggleSecondarySections(true);

      if (typeof window.logToScreen === 'function') {
        window.logToScreen('INFO', `Pre-populated existing record for ${guestName} (${docSnapshot.id})`);
      }
    } else {
      // New User - Open Upload Sections
      console.log("ℹ️ [No Record Found] Opening ID Upload UI.");

      existingSelfieUrl = null;

      const isExistingEl = document.getElementById('isExistingGuest');
      const welcomeMsg = document.getElementById('welcomeMsg');
      const ocrConfirm = document.getElementById('ocrConfirmation');
      const idUploadSec = document.getElementById('idUploadSection');

      if (isExistingEl) isExistingEl.value = "false";
      if (welcomeMsg) welcomeMsg.classList.add('d-none');
      if (ocrConfirm) ocrConfirm.classList.add('d-none');
      if (idUploadSec) idUploadSec.classList.remove('d-none');

      if (typeof toggleSecondarySections === 'function') toggleSecondarySections(false);
      updateScanButtonState();
    }
  } catch (error) {
    console.error("❌ [Firestore Lookup Error]:", error);
    if (typeof window.logToScreen === 'function') {
      window.logToScreen('ERROR', `Lookup failed for ${mobileInput}`, `${error.code || 'Error'}: ${error.message}`);
    }
    if (typeof showNotification === 'function') {
      showNotification("Error", "Could not fetch details: " + error.message, "error");
    }
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerText = "Search";
    }
    console.log("🔚 [Search Completed] UI state restored.");
  }
};



// --- 4. FORM DISPLAY SECTIONS ---
window.toggleSecondarySections = function(checked) {
  const secEmergency = document.getElementById('sec_emergency');
  const secTravel = document.getElementById('sec_travel');
  const secSelfie = document.getElementById('sec_selfie');
  const secTerms = document.getElementById('sec_terms');
  const submitContainer = document.getElementById('submitContainer');

  if (checked) {
    secEmergency.classList.remove('d-none');
    secTravel.classList.remove('d-none');
    secSelfie.classList.remove('d-none');
    secTerms.classList.remove('d-none');
    submitContainer.classList.remove('d-none');
  } else {
    secEmergency.classList.add('d-none');
    secTravel.classList.add('d-none');
    secSelfie.classList.add('d-none');
    secTerms.classList.add('d-none');
    submitContainer.classList.add('d-none');
  }
};

window.validateFormCompletion = function() {
  const accepted = document.getElementById('termsAccepted').checked;
  const submitBtn = document.getElementById('submitBtn');
  const warningMsg = document.getElementById('submitWarningMessage');

  if (accepted) {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50');
    warningMsg.classList.add('d-none');
  } else {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50');
    warningMsg.classList.remove('d-none');
  }
};

// Global camera stream holder
let activeCameraStream = null;

/**
 * Attaches global cleanup listeners for keyboard Escape and window unload.
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopDesktopCamera();
});

window.addEventListener('beforeunload', () => {
  stopDesktopCamera();
});

/**
 * Opens the desktop webcam stream with fallback constraints.
 */
async function openDesktopCamera(targetInputId) {
  // 1. Mobile Check
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    document.getElementById(targetInputId)?.click();
    return;
  }

  let stream = null;

  // 2. Constraint attempts (Progressive relaxation)
  const constraintOptions = [
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } },
    { video: { facingMode: 'user' } },
    { video: true } // Broadest fallback for integrated cameras with strict drivers
  ];

  for (const constraints of constraintOptions) {
    try {
      console.log("Attempting camera constraints:", constraints);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (stream) break; // Successfully acquired stream
    } catch (err) {
      console.warn("Constraint attempt failed:", err.name, err.message);
    }
  }

  // 3. Fallback to file picker if camera devices are unavailable or permission denied
  if (!stream) {
    alert("Unable to access your laptop's camera. Opening file upload selector instead.");
    const fileInput = document.getElementById(targetInputId);
    if (fileInput) fileInput.click();
    return;
  }

  // 4. Modal Setup
  activeCameraStream = stream;

  let modal = document.getElementById('webcamModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'webcamModal';
    modal.style = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;";
    modal.innerHTML = `
      <video id="webcamVideo" autoplay playsinline style="max-width:90%;max-height:70vh;border-radius:12px;border:2px solid #fff;"></video>
      <div class="mt-3">
        <button type="button" id="captureWebcamBtn" class="btn btn-success me-2 px-4 py-2">Capture Photo</button>
        <button type="button" id="closeWebcamBtn" class="btn btn-secondary px-4 py-2">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }

  const videoEl = document.getElementById('webcamVideo');
  videoEl.srcObject = stream;

  // 5. Capture Photo Logic
  document.getElementById('captureWebcamBtn').onclick = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "desktop_capture.jpg", { type: "image/jpeg" });
      const container = new DataTransfer();
      container.items.add(file);

      const fileInput = document.getElementById(targetInputId);
      if (fileInput) {
        fileInput.files = container.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      stopDesktopCamera();
    }, 'image/jpeg', 0.9);
  };

  document.getElementById('closeWebcamBtn').onclick = stopDesktopCamera;
}

function stopDesktopCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  const modal = document.getElementById('webcamModal');
  if (modal) modal.style.display = 'none';
}

// --- 5. CAMERA & SELFIE STREAM ---
window.initiateSelfieProcess = async function() {
  const video = document.getElementById('selfieStream');
  const placeholder = document.getElementById('cameraPlaceholder');
  const captureOverlay = document.getElementById('captureOverlay');
  const selfieGuide = document.getElementById('selfieGuide');
  const selfieStatus = document.getElementById('selfieStatus');

  console.log("🎥 [Camera Init] Requesting camera stream...");
  if (typeof window.logToScreen === 'function') {
    window.logToScreen('INFO', 'Attempting to access device camera...');
  }

  // Progressive fallback constraints (Mobile Front Camera -> Standard HD -> Any Available Webcam)
  const constraintOptions = [
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: true }
  ];

  let stream = null;
  let lastError = null;

  for (const constraints of constraintOptions) {
    try {
      console.log("Attempting camera constraints:", constraints);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (stream) break;
    } catch (err) {
      lastError = err;
      console.warn("Constraint attempt failed:", err.name, err.message);
    }
  }

  if (stream) {
    console.log("✅ [Camera Active] Stream started successfully.");
    currentStream = stream;
    
    video.srcObject = stream;
    
    // Crucial for Desktop: Force play stream once metadata loads
    video.onloadedmetadata = async () => {
      try {
        await video.play();
      } catch (playErr) {
        console.error("Autoplay failed:", playErr);
      }
    };

    if (video) video.classList.remove('d-none');
    if (placeholder) placeholder.classList.add('d-none');
    if (captureOverlay) captureOverlay.classList.remove('d-none');
    if (selfieGuide) selfieGuide.classList.remove('d-none');
    if (selfieStatus) selfieStatus.innerText = "Camera active. Tap capture button below.";
  } else {
    console.error("❌ [Camera Failed] Fallback options exhausted:", lastError);
    if (typeof window.logToScreen === 'function') {
      window.logToScreen('WARN', 'Camera streaming unavailable. Opening file input fallback.');
    }

    // Fall back to native file upload picker
    const selfieInput = document.getElementById('selfieInput');
    if (selfieInput) selfieInput.click();
  }
};

window.takeSnapshot = function() {
  const video = document.getElementById('selfieStream');
  const canvas = document.getElementById('selfieCanvas');
  
  if (!video || !canvas) return;
  const context = canvas.getContext('2d');

  // 1. Cap maximum resolution (1280px max edge) to prevent huge Base64 strings from 4K/HD webcams
  const maxDimension = 1280;
  let width = video.videoWidth || 640;
  let height = video.videoHeight || 480;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  canvas.width = width;
  canvas.height = height;

  // 2. Clear canvas and draw captured camera frame
  context.clearRect(0, 0, width, height);
  context.drawImage(video, 0, 0, width, height);

  // 3. Compress to JPEG with 75% quality (~150KB size max, safely below 1MB Firestore limit)
  selfieDataBase64 = canvas.toDataURL('image/jpeg', 0.75);

  // 4. Update UI toggles
  canvas.classList.remove('d-none');
  video.classList.add('d-none');

  const captureOverlay = document.getElementById('captureOverlay');
  const selfieGuide = document.getElementById('selfieGuide');
  const retakeBtn = document.getElementById('retakeBtn');
  const selfieStatus = document.getElementById('selfieStatus');

  if (captureOverlay) captureOverlay.classList.add('d-none');
  if (selfieGuide) selfieGuide.classList.add('d-none');
  if (retakeBtn) retakeBtn.classList.remove('d-none');
  if (selfieStatus) selfieStatus.innerText = "Selfie captured successfully!";

  // 5. Stop camera tracks once captured to release hardware lock
  if (window.currentStream) {
    window.currentStream.getTracks().forEach(track => track.stop());
    window.currentStream = null;
  }
};

window.restartCamera = function() {
  const canvas = document.getElementById('selfieCanvas');
  const retakeBtn = document.getElementById('retakeBtn');
  const selfieStatus = document.getElementById('selfieStatus');

  if (canvas) canvas.classList.add('d-none');
  if (retakeBtn) retakeBtn.classList.add('d-none');
  if (selfieStatus) selfieStatus.innerText = "Camera ready";
  
  selfieDataBase64 = null;
  window.initiateSelfieProcess();
};

window.handleFallbackSelfie = async function(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];

    try {
      // 1. Compress the file to a lightweight Base64 string to prevent Firestore size limit errors
      selfieDataBase64 = await convertAndCompressToBase64(file);

      // 2. Render preview image
      const placeholder = document.getElementById('cameraPlaceholder');
      if (placeholder) {
        placeholder.innerHTML = `<img src="${selfieDataBase64}" class="w-100 h-100" style="object-fit: cover; border-radius: 8px;">`;
        placeholder.classList.remove('d-none');
      }

      // 3. Update status text
      const selfieStatus = document.getElementById('selfieStatus');
      if (selfieStatus) {
        selfieStatus.innerText = "Selfie uploaded!";
      }
    } catch (err) {
      console.error("Selfie processing error:", err);
      if (typeof showNotification === 'function') {
        showNotification("Upload Error", "Failed to compress selfie image. Please try again.", "error");
      }
    }
  }
};

/**
 * Core Asset Engine: Uploads Blob to Firebase Storage
 * Replicates Apps Script 'uploadToDrive' logic
 */
async function uploadAsset(base64Data, phone, idType, side = "") {
  if (!base64Data) return "";
  
  const currentYear = new Date().getFullYear();
  const folderPath = `identity_proofs/QID-${currentYear}`;
  
  // Format filename: YYYY-MM-DD-phone-type-side.jpg
  const now = new Date();
  const formattedDate = now.toISOString().split('T')[0];
  const fileName = side 
    ? `${formattedDate}-${phone}-${idType}-${side}.jpg`
    : `${formattedDate}-${phone}-${idType}.jpg`;

  const storageRef = ref(storage, `${folderPath}/${fileName}`);
  const blob = dataURLToBlob(base64Data);
  
  const snapshot = await uploadBytes(storageRef, blob);
  return await getDownloadURL(snapshot.ref);
}

// --- 6. FINAL FORM SUBMISSION ---
window.finalSubmit = async function() {
  const submitBtn = document.getElementById('submitBtn');

  // Validation for 10-digit mobile numbers
  const whatsappEl = document.getElementById('whatsapp');
  const emergencyPhoneEl = document.getElementById('emergencyPhone');

  const phone = whatsappEl ? whatsappEl.value.trim().replace(/\D/g, '') : '';
  const emergencyPhone = emergencyPhoneEl ? emergencyPhoneEl.value.trim().replace(/\D/g, '') : '';

  if (phone.length !== 10) {
    showNotification("Invalid Phone", "The guest mobile number (WhatsApp) must be exactly 10 digits.", false);
    if (whatsappEl) { 
      whatsappEl.value = ''; 
      whatsappEl.focus(); 
    }
    return;
  }

  if (emergencyPhone.length !== 10) {
    showNotification("Invalid Emergency Phone", "The emergency contact number must be exactly 10 digits.", false);
    if (emergencyPhoneEl) { 
      emergencyPhoneEl.value = ''; 
      emergencyPhoneEl.focus(); 
    }
    return;
  }

  if (phone === emergencyPhone) {
    showNotification("Invalid Emergency Contact", "The emergency contact number must be different from your primary WhatsApp number to ensure we can reach someone else in case of emergency.", false);
    if (emergencyPhoneEl) { 
      emergencyPhoneEl.value = ''; 
      emergencyPhoneEl.focus(); 
    }
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Submitting Check-in...`;

  const isExisting = document.getElementById('isExistingGuest').value === "true";
  const docId = document.getElementById('rowNumber').value;
  const idType = document.getElementById('idType').value || 'Aadhaar';

  // Safety check: Ensure new guests have captured all required images
  if (!isExisting && (!frontImageBase64 || !backImageBase64 || !selfieDataBase64)) {
    showNotification("Capture Required", "Please ensure both ID sides are scanned and your selfie is captured.", "warning");
    submitBtn.disabled = false;
    submitBtn.innerText = "Complete Check-in";
    return;
  }

  try {
    // 1. Upload Assets to Firebase Storage (Replaces Apps Script uploadToDrive)
    // This removes the 1MB Firestore limit issue entirely.
    const [idFrontUrl, idBackUrl, selfieUrl] = await Promise.all([
      uploadAsset(frontImageBase64, phone, idType, "Front"),
      uploadAsset(backImageBase64, phone, idType, "Back"),
      uploadAsset(selfieDataBase64, phone, "Selfie")
    ]);

    const payload = {
      guestDetails: {
        name: (document.getElementById('name')?.value || "").trim(),
        phone: phone
      },
      verification: {
        idType: idType,
        idNo: (document.getElementById('idNumber')?.value || "").trim(),
        verified: document.getElementById('detailsVerified')?.checked || false,
        // Newly uploaded ID URLs are now stored here
        ...(idFrontUrl && { idFrontUrl }),
        ...(idBackUrl && { idBackUrl })
      },
      emergencyContact: {
        name: (document.getElementById('emergencyName')?.value || "").trim(),
        phone: emergencyPhone
      },
      travelDetails: {
        arrivingCity: document.getElementById('city').value.trim(),
        purpose: document.getElementById('purpose').value
      },
      verifiedStatus: "Verified",
      ...(selfieUrl && { selfieUrl }),
      updatedAt: serverTimestamp()
    };

    if (isExisting && docId) {
      // If a new selfie was captured, delete the old one from storage
      if (selfieUrl && existingSelfieUrl) {
        try {
          const oldSelfieRef = ref(storage, existingSelfieUrl);
          await deleteObject(oldSelfieRef);
        } catch (storageErr) {
          console.warn("Cleanup: Could not delete old selfie from storage:", storageErr);
        }
      }

      // Use dot notation to update specific fields without overwriting 
      // the entire verification object (preserving existing ID URLs)
      const updateData = {
        "guestDetails.name": payload.guestDetails.name,
        "guestDetails.phone": payload.guestDetails.phone,
        "verification.idType": payload.verification.idType,
        "verification.idNo": payload.verification.idNo,
        "verification.verified": payload.verification.verified,
        "emergencyContact": payload.emergencyContact,
        "travelDetails": payload.travelDetails,
        "verifiedStatus": payload.verifiedStatus,
        "updatedAt": payload.updatedAt
      };

      if (selfieUrl) updateData.selfieUrl = selfieUrl;
      
      // Only update ID URLs if new ones were actually uploaded
      if (idFrontUrl) updateData["verification.idFrontUrl"] = idFrontUrl;
      if (idBackUrl) updateData["verification.idBackUrl"] = idBackUrl;

      await updateDoc(doc(db, "guests", docId), updateData);
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "guests"), payload);
    }

    showNotification(
      "Check-in Complete!", 
      "Welcome to Vinyasa Nilaya. Your digital check-in details have been verified and saved.",
      true
    );
  } catch (error) {
    console.error("Submission error:", error);
    showNotification("Submission Failed", error.message);
    submitBtn.disabled = false;
    submitBtn.innerText = "Complete Check-in";
  }
};

/**
 * Helper Modal Notification
 */
function showNotification(title, message, reloadOnClose = false) {
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const modalEl = document.getElementById('notificationModal');

  if (titleEl) titleEl.innerText = title;
  if (msgEl) msgEl.innerText = message;
  
  if (modalEl && typeof bootstrap !== 'undefined') {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (reloadOnClose) {
      modalEl.addEventListener('hidden.bs.modal', () => {
        window.location.reload();
      }, { once: true });
    }
    modal.show();
  } else {
    alert(`${title}: ${message}`);
  }
}

let activeUploadTarget = 'front'; // Track whether user clicked front or back box

window.openUploadOptions = function(side) {
  activeUploadTarget = side;
  const modalEl = document.getElementById('uploadChoiceModal');
  const title = document.getElementById('uploadChoiceTitle');
  title.innerText = `Upload ${side.toUpperCase()} Side ID`;
  
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
};

window.triggerUploadSource = function(sourceType) {
  // Hide choice modal
  const modalEl = document.getElementById('uploadChoiceModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const inputId = activeUploadTarget === 'front' ? 'idFrontFile' : 'idBackFile';

  if (sourceType === 'camera') {
    if (isMobile) {
      // On mobile, trigger native camera input
      const cameraInputId = activeUploadTarget === 'front' ? 'idFrontCamera' : 'idBackCamera';
      document.getElementById(cameraInputId)?.click();
    } else {
      // On desktop, open desktop camera modal for ID capture
      openDesktopCamera(inputId);
    }
  } else {
    // Standard file upload selection
    document.getElementById(inputId)?.click();
  }
};

// Call this function whenever either image is selected/uploaded
function checkUploadStatus() {
  const scanBtn = document.getElementById('scanBtn');
  const scanBtnText = document.getElementById('scanBtnText');

  // Check if both front and back images exist
  if (frontImageBase64 && backImageBase64) {
    scanBtn.removeAttribute('disabled'); // Enable button
    scanBtnText.textContent = 'Verify & Scan Document Now';
  } else {
    scanBtn.setAttribute('disabled', 'true'); // Keep disabled
    scanBtnText.textContent = 'Upload Both Sides First';
  }
}


/**
 * Updates Scan Button state based on file input selections
 */
function updateScanButtonState() {
  const frontFile = document.getElementById('idFrontFile')?.files[0] || document.getElementById('idFrontCamera')?.files[0];
  const backFile = document.getElementById('idBackFile')?.files[0] || document.getElementById('idBackCamera')?.files[0];

  const btn = document.getElementById('scanBtn');
  const btnText = document.getElementById('scanBtnText');

  if (frontFile && backFile) {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerText = 'Verify & Scan Document Now';
  } else {
    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = 'Upload Both Sides First';
  }
}

/**
 * Dynamic Govt ID Type Dropdown Manager
 */
function updateIdOptions() {
  const natIndianRadio = document.getElementById('natIndian');
  const isIndian = natIndianRadio ? natIndianRadio.checked : true;
  const idSelect = document.getElementById('idType');
  
  if (!idSelect) return;

  const aadhaarGuide = document.getElementById('aadhaarGuide');
  const passportGuide = document.getElementById('passportGuide');
  
  // Clear existing options
  idSelect.innerHTML = '';

  if (isIndian) {
    // Restrict Indian guests to only Aadhaar Card as requested
    idSelect.options.add(new Option('Aadhaar Card', 'Aadhaar'));
    if (aadhaarGuide) aadhaarGuide.classList.remove('d-none');
    if (passportGuide) passportGuide.classList.add('d-none');
  } else {
    // Foreign guests are restricted to Passport
    idSelect.options.add(new Option('Passport', 'Passport'));
    if (aadhaarGuide) aadhaarGuide.classList.add('d-none');
    if (passportGuide) passportGuide.classList.remove('d-none');
  }
}

/**
 * Consolidated Initializations & Event Binding
 */
document.addEventListener('DOMContentLoaded', function() {
  // --- 1. SET DEFAULT NATIONALITY & POPULATE ID OPTIONS ---
  const natIndianRadio = document.getElementById('natIndian');
  if (natIndianRadio) {
    natIndianRadio.checked = true;
  }
  
  if (typeof updateIdOptions === 'function') {
    updateIdOptions();
  }

  const nationalityRadios = document.querySelectorAll('input[name="nationality"]');
  nationalityRadios.forEach(radio => {
    radio.addEventListener('change', updateIdOptions);
  });

  // --- 2. SEARCH BUTTON & ENTER KEY BINDINGS ---
  const searchMobileInput = document.getElementById('searchMobile');
  const searchBtn = document.getElementById('searchBtn');

  if (searchMobileInput) {
    searchMobileInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault(); // Stop form submission / page reload
        console.log("⌨️ Enter key pressed in searchMobile. Executing handleMobileSearch...");
        if (typeof window.handleMobileSearch === 'function') {
          window.handleMobileSearch();
        }
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log("🖱️ Search button clicked. Executing handleMobileSearch...");
      if (typeof window.handleMobileSearch === 'function') {
        window.handleMobileSearch();
      }
    });
  }

  // --- 4. INITIAL STATE CHECKS ---
  if (typeof updateScanButtonState === 'function') updateScanButtonState();
  if (typeof toggleSecondarySections === 'function') toggleSecondarySections(false);
});