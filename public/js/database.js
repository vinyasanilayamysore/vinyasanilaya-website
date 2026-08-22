/**
 * DATABASE & STORAGE OPERATIONS
 */

// Initialize Firebase Storage
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const storage = firebase.storage();

/**
 * Uploads a file directly to Firebase Storage
 * @param {File} file - The file object from input element
 * @param {string} folderPath - Path in bucket (e.g. 'ids/front')
 * @returns {Promise<string|null>} - Public download URL or null
 */
async function uploadFileToFirebase(file, folderPath) {
  if (!file) return null;
  const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
  const fileName = `${Date.now()}_${cleanName}`;
  const storageRef = storage.ref(`${folderPath}/${fileName}`);

  const snapshot = await storageRef.put(file);
  return await snapshot.ref.getDownloadURL();
}

/**
 * Converts canvas image or direct file input to a Firebase Blob & uploads
 * @param {HTMLCanvasElement} canvas 
 * @param {HTMLInputElement} fileInput 
 * @param {string} folderPath 
 * @returns {Promise<string|null>}
 */
async function uploadSelfieToFirebase(canvas, fileInput, folderPath = 'selfies') {
  let blob = null;

  if (canvas && canvas.width > 0) {
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } else if (fileInput && fileInput.files && fileInput.files.length > 0) {
    blob = fileInput.files[0];
  }

  if (!blob) return null;

  const fileName = `${Date.now()}_selfie.jpg`;
  const storageRef = storage.ref(`${folderPath}/${fileName}`);
  const snapshot = await storageRef.put(blob);
  return await snapshot.ref.getDownloadURL();
}

/**
 * Submits structured form data & Firebase URLs to Google Apps Script
 * @param {Object} payload 
 * @returns {Promise<Object>}
 */
function sendDataToGoogleSheets(payload) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      .processSubmission(payload);
  });
}