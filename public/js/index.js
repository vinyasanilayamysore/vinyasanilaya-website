import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const logToScreen = (lvl, msg) => {
  if (window.logToScreen) window.logToScreen(lvl, msg);
  else console.log(`[${lvl}] ${msg}`);
};

async function loadGuestRecords() {
  const tableBody = document.getElementById('guestTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="7" class="text-center"><span class="spinner-border spinner-border-sm"></span> Loading database content...</td></tr>';
  
  try {
    const q = query(collection(db, "guests"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    tableBody.innerHTML = '';
    
    if (querySnapshot.empty) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No records found in database.</td></tr>';
      return;
    }

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'N/A';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="small">${createdAt}</td>
        <td class="fw-bold">${data.guestDetails?.name || 'N/A'}</td>
        <td>${data.guestDetails?.phone || 'N/A'}</td>
        <td>${data.verification?.idType || 'N/A'}</td>
        <td>${data.travelDetails?.arrivingCity || 'N/A'}</td>
        <td><span class="badge ${data.verifiedStatus === 'Verified' ? 'bg-success' : 'bg-secondary'}">${data.verifiedStatus || 'PENDING'}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1 edit-trigger">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-trigger">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      
      tr.querySelector('.edit-trigger').onclick = () => window.openEditModal(id, data);
      tr.querySelector('.delete-trigger').onclick = () => window.deleteGuestRecord(id);
      
      tableBody.appendChild(tr);
    });
    
    logToScreen('INFO', `Successfully fetched ${querySnapshot.size} guest records.`);
  } catch (error) {
    logToScreen('ERROR', `Failed to load records: ${error.message}`);
  }
}

async function handleCheckinSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const payload = {
    guestDetails: {
      name: document.getElementById('guestName').value.trim(),
      phone: document.getElementById('guestPhone').value.trim()
    },
    verification: {
      idType: document.getElementById('idType').value,
      idNo: document.getElementById('idNo').value.trim(),
      idFrontUrl: document.getElementById('govtIdFrontUrl').value.trim(),
      idBackUrl: document.getElementById('govtIdBackUrl').value.trim()
    },
    travelDetails: {
      arrivingCity: document.getElementById('arrivingCity').value.trim(),
      purpose: document.getElementById('purposeOfTravel').value.trim()
    },
    emergencyContact: {
      name: document.getElementById('emergencyName').value.trim(),
      phone: document.getElementById('emergencyPhone').value.trim()
    },
    selfieUrl: document.getElementById('selfieUrl').value.trim(),
    address: document.getElementById('address').value.trim(),
    verifiedStatus: "Verified",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "guests"), payload);
    logToScreen('SUCCESS', 'Test guest record created successfully.');
    e.target.reset();
  } catch (error) {
    logToScreen('ERROR', `Failed to insert record: ${error.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function deleteGuestRecord(id) {
  if (!confirm("Are you sure you want to delete this test record?")) return;
  
  try {
    await deleteDoc(doc(db, "guests", id));
    logToScreen('INFO', `Deleted record ID: ${id}`);
    loadGuestRecords();
  } catch (error) {
    logToScreen('ERROR', `Delete operation failed: ${error.message}`);
  }
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editDocId').value;
  
  const payload = {
    'guestDetails.name': document.getElementById('editGuestName').value.trim(),
    'guestDetails.phone': document.getElementById('editGuestPhone').value.trim(),
    'verification.idType': document.getElementById('editIdType').value,
    'verification.idNo': document.getElementById('editIdNo').value.trim(),
    'travelDetails.arrivingCity': document.getElementById('editArrivingCity').value.trim(),
    'verifiedStatus': document.getElementById('editCheckinStatus').value,
    updatedAt: serverTimestamp()
  };

  try {
    await updateDoc(doc(db, "guests", id), payload);
    const modalEl = document.getElementById('editModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    logToScreen('SUCCESS', `Updated record ID: ${id}`);
    loadGuestRecords();
  } catch (error) {
    logToScreen('ERROR', `Update operation failed: ${error.message}`);
  }
}

window.openEditModal = function(id, data) {
  document.getElementById('editDocId').value = id;
  document.getElementById('editGuestName').value = data.guestDetails?.name || '';
  document.getElementById('editGuestPhone').value = data.guestDetails?.phone || '';
  document.getElementById('editIdType').value = data.verification?.idType || 'Aadhaar';
  document.getElementById('editIdNo').value = data.verification?.idNo || '';
  document.getElementById('editArrivingCity').value = data.travelDetails?.arrivingCity || '';
  document.getElementById('editCheckinStatus').value = data.verifiedStatus || 'Verified';
  
  const setPreview = (containerId, url) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (url) {
      container.innerHTML = `<a href="${url}" target="_blank"><img src="${url}" class="img-fluid" style="max-height: 80px; object-fit: contain;"></a>`;
    } else {
      container.innerHTML = `<span class="text-muted small">No Image</span>`;
    }
  };

  setPreview('editIdFrontPreview', data.verification?.idFrontUrl);
  setPreview('editIdBackPreview', data.verification?.idBackUrl);
  setPreview('editSelfiePreview', data.selfieUrl);

  const modal = new bootstrap.Modal(document.getElementById('editModal'));
  modal.show();
};

window.loadGuestRecords = loadGuestRecords;
window.deleteGuestRecord = deleteGuestRecord;

document.addEventListener('DOMContentLoaded', () => {
  const checkinForm = document.getElementById('guestCheckinForm');
  if (checkinForm) checkinForm.addEventListener('submit', handleCheckinSubmit);
  
  const editForm = document.getElementById('editGuestForm');
  if (editForm) editForm.addEventListener('submit', handleEditSubmit);
});