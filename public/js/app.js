/**
 * Phase 1: Dynamically updates ID options based on Nationality radio selection
 */
function updateIdOptions() {
  const isIndian = document.getElementById('natIndian').checked;
  const idSelect = document.getElementById('idType');
  if (!idSelect) return;
  
  idSelect.innerHTML = '';

  if (isIndian) {
    const indianOptions = [
      { val: 'Aadhaar', text: 'Aadhaar Card' },
      { val: 'VoterID', text: 'Voter ID' },
      { val: 'DL', text: 'Driving License' }
    ];
    indianOptions.forEach(opt => {
      idSelect.options.add(new Option(opt.text, opt.val));
    });
  } else {
    idSelect.options.add(new Option('Passport', 'Passport'));
  }
}

/**
 * Run on DOM Load initialization
 */
document.addEventListener('DOMContentLoaded', function() {
  updateIdOptions();
  // Force the master structural nodes into an initialized hidden state
  toggleSecondarySections(false);
});

/*Handle preview */

async function handlePreview(inputElement, previewContainerId) {
  const container = document.getElementById(previewContainerId);
  const file = inputElement.files[0];
  
  if (!file) {
    if (typeof evaluateUploadStatus === "function") evaluateUploadStatus();
    return;
  }
  
  // 1. Show processing state instantly
  container.innerHTML = `
    <div class="d-flex flex-column align-items-center justify-content-center h-100 py-3">
      <div class="spinner-border spinner-border-sm text-primary mb-1" role="status"></div>
      <span class="small text-muted fw-semibold">Processing...</span>
    </div>`;

  // OPTIMIZATION: Use Object URL instead of FileReader DataURL to preserve mobile memory limits
  const objectUrl = URL.createObjectURL(file);
  
  const img = new Image();
  img.src = objectUrl;
  
  img.onload = function() {
    // 2. Render optimized UI layout
    container.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%;">
        <img src="${objectUrl}" class="preview-image" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">
        <div style="position: absolute; bottom: 0; left: 0; width: 100%; background: rgba(255,255,255,0.85); padding: 5px 0; z-index: 10;">
          <p class="small text-success m-0 fw-bold text-center">
            <i class="bi bi-check-circle-fill me-1"></i>ID Photo Ready ✓
          </p>
        </div>
      </div>`;
      
    // FIX: Status matrix evaluation is now safely triggered AFTER the DOM updates
    if (typeof evaluateUploadStatus === "function") {
      evaluateUploadStatus();
    }
  };
    
  img.onerror = function() {
    URL.revokeObjectURL(objectUrl);
    if (typeof showPermissionError === "function") showPermissionError();
  };
}

// Function to show the permission modal
function showPermissionError() {
  const modalLib = window.bootstrap || bootstrap;
  if (typeof modalLib !== 'undefined') {
    const pModal = new modalLib.Modal(document.getElementById('permissionModal'));
    pModal.show();
  } else {
    alert("Camera Access Denied: Please check your browser's site settings (click the lock icon in the URL bar).");
  }
}

// Evaluate upload status
function evaluateUploadStatus() {
  const frontInput = document.getElementById('idFront');
  const backInput = document.getElementById('idBack');
  const scanBtn = document.getElementById('scanBtn');
  const btnText = document.getElementById('scanBtnText');

  if (!scanBtn || !btnText) return;

  const frontFile = frontInput && frontInput.files ? frontInput.files[0] : null;
  const backFile = backInput && backInput.files ? backInput.files[0] : null;

  if (frontFile && backFile) {
    scanBtn.disabled = false;
    scanBtn.style.opacity = "1";
    btnText.innerText = "Verify & Scan Document Now";
  } else {
    scanBtn.disabled = true;
    scanBtn.style.opacity = "0.5";
    btnText.innerText = "Upload Both Sides First";
  }
}

// Clean mobile number
function cleanMobileNumber(rawNumber) {
  if (rawNumber === undefined || rawNumber === null) return "";
  let numStr = String(rawNumber).trim();
  numStr = numStr.replace(/[\s-+]/g, '');
  if (numStr.startsWith('91') && numStr.length > 10) {
    numStr = numStr.substring(2);
  }
  return numStr;
}

/**
 * Function to handle mobile search pipeline
 */
function handleMobileSearch() {
  const rawMobile = document.getElementById('searchMobile').value;
  const searchMobile = cleanMobileNumber(rawMobile);
  const searchBtn = document.getElementById('searchBtn');
  const whatsappField = document.getElementById('whatsapp');

  if (searchMobile.length < 10) {
    showNotification(
      "Invalid Number",
      "Please enter a valid 10-digit mobile number to proceed with the search.",
      "warning"
    );
    return;
  }

  searchBtn.disabled = true;
  searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Searching...';

  if (whatsappField) whatsappField.value = searchMobile;

  google.script.run
    .withSuccessHandler(function(guest) {
      const sInput = document.getElementById('searchMobile');
      const sBtn = document.getElementById('searchBtn');
      const idUploadSection = document.getElementById('idUploadSection');
      const ocrConfirmation = document.getElementById('ocrConfirmation');
      const welcomeMsg = document.getElementById('welcomeMsg');

      if (guest.exists) {
        sBtn.innerHTML = 'Search';
        sBtn.disabled = true;
        if (sInput) sInput.readOnly = true;

        document.getElementById('isExistingGuest').value = "true";
        document.getElementById('rowNumber').value = guest.rowNumber;

        if (idUploadSection) idUploadSection.classList.add('d-none');
        if (ocrConfirmation) ocrConfirmation.classList.remove('d-none');
        if (welcomeMsg) welcomeMsg.classList.remove('d-none');
        
        document.getElementById('name').value = guest.name || "";
        document.getElementById('idType').value = guest.idType || "Aadhaar";
        document.getElementById('idNumber').value = guest.idNumber || "";
        document.getElementById('emergencyName').value = guest.emergencyName || "";
        document.getElementById('emergencyPhone').value = cleanMobileNumber(guest.emergencyPhone || "");
        document.getElementById('city').value = guest.city || "";
        
        if (document.getElementById('address') && guest.address) {
          document.getElementById('address').value = guest.address;
        }

        // Force fresh explicit check verification for returning workflow
        const verifiedCheckbox = document.getElementById('detailsVerified');
        if (verifiedCheckbox) verifiedCheckbox.checked = false;

        // FIX: Smooth transition down to the verified data card for existing guests
        setTimeout(() => {
          if (ocrConfirmation) {
            ocrConfirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);

      } else {
        document.getElementById('isExistingGuest').value = "false";
        document.getElementById('rowNumber').value = "";

        if (sBtn) {
          sBtn.disabled = false;
          sBtn.innerHTML = 'Search';
        }

        if (idUploadSection) idUploadSection.classList.remove('d-none');
        if (ocrConfirmation) ocrConfirmation.classList.add('d-none');
        if (welcomeMsg) welcomeMsg.classList.add('d-none');

        // FIX: Smooth transition down to the upload boxes for fresh workflows
        setTimeout(() => {
          if (idUploadSection) {
            idUploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }

      if (typeof showVerificationSection === "function") {
        showVerificationSection();
      }
      
      validateFormState();
    })
    .withFailureHandler(function(err) {
      const sBtn = document.getElementById('searchBtn');
      if (sBtn) {
        sBtn.disabled = false;
        sBtn.innerHTML = 'Search';
      }
      showNotification("Error", "System search failed. Please try again.", "error");
    })
    .searchGuestByMobile(searchMobile);
}

/**
 * CRITICAL ACTION HANDLER: Bypasses sections for existing records
 */
function handleIdentityConfirmation() {
  const isExisting = document.getElementById('isExistingGuest').value === "true";
  const verifiedCheckbox = document.getElementById('detailsVerified');
  
  if (verifiedCheckbox) {
    verifiedCheckbox.checked = true;
  }

  if (isExisting) {
    // 1. Reveal hidden downstream layouts instantly so prefilled data is accessible
    const secEmergency = document.getElementById('sec_emergency');
    const secTravel = document.getElementById('sec_travel');
    const secSelfie = document.getElementById('sec_selfie');
    const secTerms = document.getElementById('sec_terms');
    const submitContainer = document.getElementById('submitContainer');

    if (secEmergency) secEmergency.classList.remove('d-none');
    if (secTravel) secTravel.classList.remove('d-none');
    if (secSelfie) secSelfie.classList.remove('d-none');
    if (secTerms) secTerms.classList.remove('d-none');
    if (submitContainer) submitContainer.classList.remove('d-none');

    // 2. Validate Travel Details presence before choosing the scroll target
    const cityVal = document.getElementById('city')?.value.trim() || "";
    const purposeSelect = document.getElementById('purpose');
    const purposeVal = purposeSelect ? purposeSelect.value : "";

    // If travel data is missing, halt the express scroll at the Travel section
    if (cityVal.length <= 1 || purposeVal === "") {
      setTimeout(() => {
        if (secTravel) {
          secTravel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      
      // Refresh validation styles to highlight the empty inputs
      validateFormState();
      return;
    }

    // 3. Clear to proceed route: Snap UI display window straight down to camera section
    setTimeout(() => {
      if (secSelfie) {
        secSelfie.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);

    // 4. Trigger hardware video streams instantly
    initiateSelfieProcess();

  } else {
    // Step-by-step incremental layout engine fallback logic for fresh check-ins
    toggleSecondarySections(true);
  }

  validateFormState();
}

// Shared optimized compression engine for ID Front, ID Back, and File Fallbacks
const convertAndCompressToBase64 = file => new Promise((resolve, reject) => {
  if (!file) resolve(null);
  
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.src = objectUrl;
  
  img.onload = function() {
    const maxBoundary = 1600; // Flawless OCR text resolution, safe size payload
    let width = img.width;
    let height = img.height;
    
    if (width > maxBoundary || height > maxBoundary) {
      if (width > height) {
        height *= maxBoundary / width;
        width = maxBoundary;
      } else {
        width *= maxBoundary / height;
        height = maxBoundary;
      }
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Solid white backdrop to guard against alpha channel transparency inversion
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    
    const base64Result = canvas.toDataURL('image/jpeg', 0.85);
    URL.revokeObjectURL(objectUrl);
    resolve(base64Result);
  };
  
  img.onerror = (err) => {
    URL.revokeObjectURL(objectUrl);
    reject(err);
  };
});

/* Handle OCR Engine Scans */
async function handleIdScan() {
  const frontFile = document.getElementById('idFront').files[0];
  const backFile = document.getElementById('idBack').files[0];
  const currentMobile = cleanMobileNumber(document.getElementById('searchMobile').value);
  
  const nationality = document.querySelector('input[name="nationality"]:checked').value;
  const idType = document.getElementById('idType').value;
  
  if (!frontFile || !backFile) return showNotification("Upload Required", "Please upload both Front and Back side images of your ID card.", "warning");
  if (!currentMobile) return showNotification("Mobile Required", "Mobile number is required for registration matching.", "warning");

  const btn = document.getElementById('scanBtn');
  const spinner = document.getElementById('scanSpinner');
  const btnText = document.getElementById('scanBtnText');
  
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('d-none');
  if (btnText) btnText.innerText = 'Analyzing ' + idType ;

  try {
    // 1. Read and compress both images simultaneously using global shared engine
    const [frontBase64, backBase64] = await Promise.all([
      convertAndCompressToBase64(frontFile),
      convertAndCompressToBase64(backFile)
    ]);

    google.script.run
      .withSuccessHandler(function(res) {
        google.script.run
          .withSuccessHandler(function(checkRes) {
            if (checkRes.conflict) {
              if (btn) {
                btn.disabled = false;
                btn.className = "btn btn-primary w-100 py-3 fw-bold";
                if (btnText) btnText.innerText = 'Verify & Scan Document Now';
              }
              
              document.getElementById('name').value = "";
              document.getElementById('idNumber').value = "";
              document.getElementById('address').value = "";
              
              showNotification(
                "Security Alert",
                `This identification document is already recorded on another guest profile under the name "${checkRes.existingName}".`,
                "error"
              );
              
              resetImageUploads();
              return;
            }

            const ocrConfirmEl = document.getElementById('ocrConfirmation');
            if (ocrConfirmEl) ocrConfirmEl.classList.remove('d-none');
            
            document.getElementById('name').value = (res.name !== "Not found") ? res.name : "";
            document.getElementById('idNumber').value = res.idNumber || "";
            document.getElementById('address').value = res.address || "";

            if (spinner) spinner.classList.add('d-none');
            if (btn) {
              btn.disabled = false;
              btn.className = "btn btn-success w-100 mb-4 shadow-sm text-white";
              if (btnText) btnText.innerText = 'Scan Complete ✓';
            }
            
            validateFormState();
            
            setTimeout(() => {
              const ocrConfirmView = document.getElementById('ocrConfirmation');
              if (ocrConfirmView) ocrConfirmView.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 200);
          })
          .checkIdMobileAssociation(res.idNumber, currentMobile);
      })
      .withFailureHandler(function(err) {
        if (btn) {
          btn.disabled = false;
          btn.className = "btn w-100 py-3 fw-bold btn-primary";
          if (btnText) btnText.innerText = 'Verify & Scan Document Now';
        }
        if (spinner) spinner.classList.add('d-none');
        resetImageUploads();
        showNotification("Scan Failed", "We couldn't extract distinct characters from your " + idType + ". Please attempt using crisp, bright photos.", "error");
      })
      .executeOcrFlow(frontBase64, backBase64, idType, nationality);

  } catch (error) {
    if (btn) {
      btn.disabled = false;
      if (btnText) btnText.innerText = 'Verify & Scan Document Now';
    }
    if (spinner) spinner.classList.add('d-none');
    showNotification("Upload Error", "There was an error reading localized document structures.", "error");
  }
}

/**
 * Progressive Node Visibility Controller
 */
function toggleSecondarySections(isVerified) {
  const secEmergency = document.getElementById('sec_emergency');
  const checkedState = document.getElementById('detailsVerified').checked;
  const isExisting = document.getElementById('isExistingGuest').value === "true";

  if (isExisting) {
    // Keep primary downstream panels visible for existing accounts
    if (secEmergency) secEmergency.classList.remove('d-none');
    document.getElementById('sec_travel')?.classList.remove('d-none');
    
    // Gate section 4 (selfie) based on whether travel details are completed
    const cityVal = document.getElementById('city')?.value.trim() || "";
    const purposeVal = document.getElementById('purpose')?.value || "";
    
    if (cityVal.length > 1 && purposeVal !== "") {
      document.getElementById('sec_selfie')?.classList.remove('d-none');
      document.getElementById('sec_terms')?.classList.remove('d-none');
      document.getElementById('submitContainer')?.classList.remove('d-none');
    } else {
      document.getElementById('sec_selfie')?.classList.add('d-none');
      document.getElementById('sec_terms')?.classList.add('d-none');
      document.getElementById('submitContainer')?.classList.add('d-none');
    }
    return;
  }

  if (isVerified && checkedState) {
    if (secEmergency) {
      secEmergency.classList.remove('d-none');
      setTimeout(() => {
        secEmergency.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  } else {
    if (secEmergency) secEmergency.classList.add('d-none');
    document.getElementById('sec_travel')?.classList.add('d-none');
    document.getElementById('sec_selfie')?.classList.add('d-none');
    document.getElementById('sec_terms')?.classList.add('d-none');
    document.getElementById('submitContainer')?.classList.add('d-none');
  }
  validateFormState();
}

function checkEmergencyCompletion() {
  const isExisting = document.getElementById('isExistingGuest').value === "true";
  const secTravel = document.getElementById('sec_travel');
  
  if (isExisting) {
    if (secTravel) secTravel.classList.remove('d-none');
    return;
  }
  
  const nameVal = document.getElementById('emergencyName').value.trim();
  const phoneVal = document.getElementById('emergencyPhone').value.trim();

  if (nameVal.length > 2 && phoneVal.length >= 10) {
    if (secTravel && secTravel.classList.contains('d-none')) {
      secTravel.classList.remove('d-none');
      setTimeout(() => {
        secTravel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }
  validateFormState();
}

function checkTravelCompletion() {
  const isExisting = document.getElementById('isExistingGuest').value === "true";
  const cityVal = document.getElementById('city').value.trim();
  const purposeVal = document.getElementById('purpose').value;
  const secSelfie = document.getElementById('sec_selfie');
  const secTerms = document.getElementById('sec_terms');
  const submitContainer = document.getElementById('submitContainer');

  if (cityVal.length > 1 && purposeVal !== "") {
    if (secSelfie && secSelfie.classList.contains('d-none')) {
      secSelfie.classList.remove('d-none');
      secTerms.classList.remove('d-none');
      submitContainer.classList.remove('d-none');
      
      setTimeout(() => {
        secSelfie.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  } else {
    // If data is deleted/cleared, hide downstream dependencies immediately
    secSelfie?.classList.add('d-none');
    secTerms?.classList.add('d-none');
    submitContainer?.classList.add('d-none');
  }
  validateFormState();
}

/**
 * Phase 4: Dynamic Matrix System Validator
 */
function validateFormState() {
  const submitBtn = document.getElementById('submitBtn');
  const warningMsg = document.getElementById('submitWarningMessage');
  if (!submitBtn) return;
  
  const isExisting = document.getElementById('isExistingGuest').value === "true";
  const hasName = document.getElementById('name').value.trim() !== "";
  const hasId = document.getElementById('idNumber').value.trim() !== "";
  const idVerified = document.getElementById('detailsVerified').checked;
  
  const purposeSelect = document.getElementById('purpose');
  const hasPurpose = purposeSelect && purposeSelect.value !== "";
  const hasCity = document.getElementById('city').value.trim() !== "";

  const emergencyName = document.getElementById('emergencyName').value.trim() !== "";
  const emergencyPhone = document.getElementById('emergencyPhone').value.trim().length >= 10;

  const selfieCanvas = document.getElementById('selfieCanvas');
  const selfieInput = document.getElementById('selfieInput');
  let hasSelfie = false;
  
  if (selfieCanvas && selfieCanvas.width > 0) {
    const selfieData = selfieCanvas.toDataURL();
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = selfieCanvas.width;
    blankCanvas.height = selfieCanvas.height;
    hasSelfie = (selfieData !== blankCanvas.toDataURL());
  }
  
  if (!hasSelfie && selfieInput && selfieInput.files && selfieInput.files.length > 0) {
    hasSelfie = true;
  }

  const termsAccepted = document.getElementById('termsAccepted').checked;

  let isFormValid = false;
  if (isExisting) {
    isFormValid = hasName && hasId && idVerified && hasPurpose && hasCity && hasSelfie && termsAccepted;
  } else {
    isFormValid = hasName && hasId && idVerified && emergencyName && emergencyPhone && hasCity && hasPurpose && hasSelfie && termsAccepted;
  }

  if (isFormValid) {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-50');
    if (warningMsg) warningMsg.classList.add('d-none');
  } else {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50');
    
    if (warningMsg) {
      warningMsg.classList.remove('d-none');
      if (!idVerified) {
        warningMsg.innerHTML = '<i class="bi bi-person-check-fill me-2"></i>Please verify identity details.';
      } else if (isExisting && (!hasCity || !hasPurpose)) {
        warningMsg.innerHTML = '<i class="bi bi-airplane-fill me-2"></i>Travel tracking info missing.';
      } else if (!isExisting && (!emergencyName || !emergencyPhone)) {
        warningMsg.innerHTML = '<i class="bi bi-telephone-plus-fill me-2"></i>Emergency details required.';
      } else if (!isExisting && (!hasCity || !hasPurpose)) {
        warningMsg.innerHTML = '<i class="bi bi-airplane-fill me-2"></i>Travel tracking info missing.';
      } else if (!hasSelfie) {
        warningMsg.innerHTML = '<i class="bi bi-camera-fill me-2"></i>Verification selfie is missing.';
      } else if (!termsAccepted) {
        warningMsg.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-2"></i>Please accept House Rules.';
      } else {
        warningMsg.innerHTML = '<i class="bi bi-info-circle-fill me-2"></i>Complete all sections to unlock button.';
      }
    }
  }

  // --- INTEGRATED SCROLL AUTOMATION FOR DOWNSTREAM ACTIONS ---
  if (hasSelfie) {
    const secTerms = document.getElementById('sec_terms');
    const submitContainer = document.getElementById('submitContainer');
    
    // Force structural display activation
    if (secTerms) secTerms.classList.remove('d-none');
    if (submitContainer) submitContainer.classList.remove('d-none');

    // Check the global single-fire semaphore flag
    if (!window.hasAutoScrolledToTerms) {
      window.hasAutoScrolledToTerms = true;
      
      setTimeout(() => {
        if (secTerms) {
          secTerms.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 350);
    }
  }
}

// Intercept data modification changes dynamically across the document environment
document.addEventListener('change', function(e) {
  if (e.target.id === 'emergencyName' || e.target.id === 'emergencyPhone') checkEmergencyCompletion();
  if (e.target.id === 'city' || e.target.id === 'purpose') checkTravelCompletion();
  validateFormState();
});

document.addEventListener('input', function(e) {
  if (e.target.id === 'emergencyName' || e.target.id === 'emergencyPhone') checkEmergencyCompletion();
  if (e.target.id === 'city' || e.target.id === 'purpose') checkTravelCompletion();
  validateFormState();
});

/**
 * Camera and Live Video Selfie Processing Routines
 */
async function initiateSelfieProcess() {
  const video = document.getElementById('selfieStream');
  const placeholder = document.getElementById('cameraPlaceholder');
  const guide = document.getElementById('selfieGuide');
  const overlay = document.getElementById('captureOverlay');
  const status = document.getElementById('selfieStatus');
  const container = document.getElementById('selfieContainer');
  const canvas = document.getElementById('selfieCanvas');

  if (!video || !video.classList.contains('d-none') || (canvas && !canvas.classList.contains('d-none'))) return;

  status.innerText = "Accessing camera system devices...";

  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });
    
    stream = mediaStream;
    video.srcObject = mediaStream;
    
    placeholder.classList.add('d-none');
    video.classList.remove('d-none');
    if (guide) guide.classList.remove('d-none');
    if (overlay) overlay.classList.remove('d-none');
    
    status.innerHTML = '<span class="text-success fw-bold">● Live Feed Active</span>';
    if (container) container.onclick = null;

  } catch (err) {
    console.warn("Hardware media streaming blocked or device missing:", err);
    status.innerText = "Opening native system camera fallback capture...";
    const fallbackInput = document.getElementById('selfieInput');
    if (fallbackInput) fallbackInput.click();
  }
}

function takeSnapshot() {
  const video = document.getElementById('selfieStream');
  const canvas = document.getElementById('selfieCanvas');
  const guide = document.getElementById('selfieGuide');
  const status = document.getElementById('selfieStatus');
  const retakeBtn = document.getElementById('retakeBtn');
  const overlay = document.getElementById('captureOverlay');

  if (!video || video.videoWidth === 0) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.classList.remove('d-none');
  video.classList.add('d-none');
  if (guide) guide.classList.add('d-none');
  if (overlay) overlay.classList.add('d-none');
  if (retakeBtn) retakeBtn.classList.remove('d-none');
  
  status.innerText = "Selfie captured successfully ✓";

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  validateFormState();
}

function restartCamera() {
  const placeholder = document.getElementById('cameraPlaceholder');
  const status = document.getElementById('selfieStatus');
  const canvas = document.getElementById('selfieCanvas');
  const retakeBtn = document.getElementById('retakeBtn');
  const guide = document.getElementById('selfieGuide');
  const video = document.getElementById('selfieStream');
  const selfieInput = document.getElementById('selfieInput');

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  if (canvas) {
    canvas.classList.add('d-none');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }
  
  if (selfieInput) selfieInput.value = "";
  if (video) video.classList.add('d-none');
  if (retakeBtn) retakeBtn.classList.add('d-none');
  if (guide) guide.classList.add('d-none');

  if (placeholder) {
    placeholder.classList.remove('d-none');
    placeholder.innerHTML = `
      <div class="rounded-circle bg-primary bg-opacity-10 p-4 mb-3">
        <i class="bi bi-camera-fill h1 text-primary mb-0"></i>
      </div>
      <span class="fw-bold">Tap to Take Verification Selfie</span>
    `;
  }

  status.innerText = "Camera ready";
  
  const container = document.getElementById('selfieContainer');
  if (container) container.onclick = initiateSelfieProcess;
  
  validateFormState();
}