// js/storage.js
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

/**
 * Uploads a file directly to Firebase Storage
 * @param {Object} storage - The initialized Firebase Storage instance
 * @param {File|Blob} file - The file/blob object from input element or canvas
 * @param {string} folderPath - Path in bucket (e.g. 'ids/front')
 * @returns {Promise<string|null>} - Public download URL or null
 */
export async function uploadFileToFirebase(storage, file, folderPath) {
  if (!file || !storage) return null;
  
  const cleanName = file.name ? file.name.replace(/[^a-zA-Z0-9.]/g, "_") : "file.jpg";
  const fileName = `${Date.now()}_${cleanName}`;
  const fileRef = ref(storage, `${folderPath}/${fileName}`);

  try {
    const snapshot = await uploadBytes(fileRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    if (typeof window.logToScreen === 'function') {
      window.logToScreen('ERROR', `Failed to upload file to ${folderPath}`, error.message);
    }
    return null;
  }
}

/**
 * Converts canvas image or direct file input to a Firebase Blob & uploads
 * @param {Object} storage - The initialized Firebase Storage instance
 * @param {HTMLCanvasElement} canvas 
 * @param {HTMLInputElement} fileInput 
 * @param {string} folderPath 
 * @returns {Promise<string|null>}
 */
export async function uploadSelfieToFirebase(storage, canvas, fileInput, folderPath = 'selfies') {
  let blob = null;

  if (canvas && canvas.width > 0) {
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } else if (fileInput && fileInput.files && fileInput.files.length > 0) {
    blob = fileInput.files[0];
  }

  if (!blob) return null;
  return await uploadFileToFirebase(storage, blob, folderPath);
}