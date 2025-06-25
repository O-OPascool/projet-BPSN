// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

// La ligne "import Quagga..." a été SUPPRIMÉE.
// Quagga sera disponible globalement car il est chargé via une balise <script> dans le fichier HTML.

document.addEventListener('DOMContentLoaded', () => {
  // —— Toggle thème clair/sombre ——
  const modeToggleBtn = document.getElementById('mode-toggle');
  if (modeToggleBtn) {
    const updateIcon = () => {
      modeToggleBtn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
    };
    modeToggleBtn.addEventListener('click', () => {
      const dark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      updateIcon();
    });
    updateIcon();
  }

  // —— Initialisation Firebase ——
  const firebaseConfig = {
    apiKey: "AIzaSyDKE…", // Pensez à sécuriser vos clés API pour la production
    authDomain: "bpsn-74f1b.firebaseapp.com",
    databaseURL: "https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bpsn-74f1b",
    storageBucket: "bpsn-74f1b.firebasestorage.app",
    messagingSenderId: "1057707303676",
    appId: "1:1057707303676:web:63dd292678dead41c2ed79",
    measurementId: "G-DZGXBJERKQ"
  };
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const stocksRef    = ref(db, 'stocks');
  const booksDataRef = ref(db, 'booksData');
  const roomsRef     = ref(db, 'rooms');

  // —— DOM refs ——
  const isbnForm        = document.getElementById('isbn-form');
  const scanISBNBtn     = document.getElementById('scan-search-toggle');
  const engineSelect    = document.getElementById('search-engine');
  const filterRoomSel   = document.getElementById('filter-room');
  const newRoomInput    = document.getElementById('new-room');
  const addRoomBtn      = document.getElementById('add-room');
  const roomListEl      = document.getElementById('room-list');
  const manualRoomSel   = document.getElementById('manual-room');
  const roomSelectEl    = document.getElementById('room-select');
  const manualToggleBtn = document.getElementById('manual-add-toggle');
  const manualForm      = document.getElementById('manual-add-form');
  const scanManualBtn   = document.getElementById('scan-manual-toggle');
  const spinner         = document.getElementById('spinner');
  const searchTabs      = document.getElementById('search-results');
  const bookInfoEl      = document.getElementById('book-info');
  const coverImg        = document.getElementById('cover');
  const titleEl         = document.getElementById('title');
  const authorEl        = document.getElementById('author');
  const summaryEl       = document.getElementById('summary');
  const fillBtn         = document.getElementById('fill-info-button');
  const manualEditDiv   = document.getElementById('manual-edit');
  const editAuthor      = document.getElementById('manual-author');
  const editSummary     = document.getElementById('manual-summary');
  const stockSpan       = document.getElementById('stock');
  const confirmBtn      = document.getElementById('confirm-add-book');
  const cancelBtn       = document.getElementById('cancel-add-book');
  const textFilter      = document.getElementById('search-book');
  const bookListEl      = document.getElementById('book-list');
  const totalCountEl    = document.getElementById('total-books-count');
  const scannerCont     = document.getElementById('scanner-container');
  const scannerVideo    = document.getElementById('scanner-video');
  const stopScanBtn     = document.getElementById('stop-scan');
  const stockForm       = document.getElementById('stock-form');
  const newStockInput   = document.getElementById('new-stock');

  // —— Utilitaires ——
  const showSpinner  = () => spinner.classList.remove('hidden');
  const hideSpinner  = () => spinner.classList.add('hidden');
  const sanitizeISBN = s => s.replace(/[-\s]/g, '');
  const isValidISBN  = s => (s.length === 10 || s.length === 13) && !isNaN(s);
  function convertISBN10toISBN13(isbn10) {
    const core = isbn10.slice(0,9);
    const pref = "978" + core;
    let sum = 0;
    for (let i=0; i<pref.length; i++) {
      const d = +pref[i];
      sum += (i % 2 === 0 ? d : d*3);
    }
    const check = sum % 10;
    return pref + (check === 0 ? 0 : 10 - check);
  }

  async function fetchBookDataFromAPIs(isbn) {
    try {
      const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
                        .then(res => res.json());
      if (g.items?.length) return { googleBooksResults: g.items };
    } catch{}
    try {
      const o = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (o.ok) {
        const d = await o.json();
        let author="Auteur inconnu", summary="Aucune information";
        if (typeof d.by_statement === 'string') author = d.by_statement;
        if (typeof d.description  === 'string') summary = d.description;
        else if (d.description?.value) summary = d.description.value;
        return { openLibraryResult: { title: d.title||"Sans titre", author, summary } };
      }
    } catch{}
    return null;
  }

  async function completeWithGoogleIfNeeded(isbn, base) {
    let { title, author, summary } = base;
    if (author === "Auteur inconnu" || summary.length < 50) {
      try {
        const g = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
                          .then(res => res.json());
        const vi = g.items?.[0]?.volumeInfo || {};
        if (author==="Auteur inconnu" && vi.authors?.[0]) author = vi.authors[0];
        if (vi.description && vi.description.length > summary.length) summary = vi.description;
      } catch{}
    }
    return { title, author, summary };
  }

  function parseVolumeInfo(v) {
    return {
      title:   v.title               || "Sans titre",
      author:  v.authors?.[0]        || "Auteur inconnu",
      summary: v.description         || "Aucune information",
      cover:   v.imageLinks?.thumbnail || null
    };
  }

  // —— Gestion des salles ——
  onValue(roomsRef, snap => {
    const rooms = snap.val() || {};
    roomListEl.innerHTML    = '';
    manualRoomSel.innerHTML = '<option value="">Salle…</option>';
    roomSelectEl.innerHTML  = '<option value="">—</option>';
    filterRoomSel.innerHTML = '<option value="">Toutes</option>';
    Object.values(rooms).sort().forEach(name => { // Ajout de .sort() pour un ordre alphabétique
      // liste
      const li = document.createElement('li');
      li.textContent = name + ' ';
      const del = document.createElement('button');
      del.textContent = '🗑️';
      del.onclick    = () => set(child(roomsRef, encodeURIComponent(name)), null);
      li.appendChild(del);
      roomListEl.appendChild(li);
      // selects
      [manualRoomSel, roomSelectEl, filterRoomSel].forEach(sel => {
        const opt = document.createElement('option');
        opt.value = name; opt.text = name;
        sel.appendChild(opt);
      });
    });
  });
  addRoomBtn.addEventListener('click', async () => {
    const nm = newRoomInput.value.trim();
    if (!nm) return alert('Nom de salle requis');
    await set(child(roomsRef, encodeURIComponent(nm)), nm);
    newRoomInput.value = '';
  });

  // —— Filtrage liste ——
  textFilter.addEventListener('input', renderBookList);
  filterRoomSel.addEventListener('change', renderBookList);

  // —— Rendu de la liste ——
  let allBooks = {}, allStocks = {};
  function updateTotalCount() {
    const tot = Object.values(allStocks).reduce((a,b) => a + (b||0), 0);
    totalCountEl.textContent = `Total des livres disponibles : ${tot}`;
  }
  function renderBookList() {
    bookListEl.innerHTML = '';
    const txt = textFilter.value.toLowerCase();
    const roomF = filterRoomSel.value;
    const bookEntries = Object.entries(allBooks);

    bookEntries
      .sort(([, a], [, b]) => a.title.localeCompare(b.title)) // Tri par titre
      .forEach(([isbn, b]) => {
        const st = allStocks[isbn] || 0;
        if (txt && !b.title.toLowerCase().includes(txt) && !b.author.toLowerCase().includes(txt)) return;
        if (roomF && b.room !== roomF) return;

        const item = document.createElement('div');
        item.className = 'book-item p-4 border rounded-lg shadow-sm flex gap-4';

        const img = document.createElement('img');
        img.className = 'book-cover w-20 h-28 object-cover flex-shrink-0';
        if (b.cover) {
          img.src = b.cover;
          img.alt = `Couverture de ${b.title}`;
          img.onerror = () => img.style.display = 'none';
        } else {
          img.style.display = 'none';
        }
        item.appendChild(img);

        const det = document.createElement('div');
        det.className = 'book-details flex-grow';
        const cls = st > 0 ? (st < 5 ? 'stock-low text-yellow-600' : 'stock-ok text-green-600') : 'stock-out text-red-600';
        det.innerHTML = `
          <div class="book-title font-bold text-lg">${b.title} <em class="text-sm font-normal text-gray-500">(${isbn})</em></div>
          <div class="book-author text-gray-700 dark:text-gray-300">Auteur : ${b.author}</div>
          <p class="book-summary text-sm my-2">${b.summary.substring(0, 150)}${b.summary.length > 150 ? '...' : ''}</p>
          <div class="book-stock font-semibold ${cls}">${st > 0 ? `Stock : ${st}` : 'Hors stock'}</div>
          <div class="book-room text-sm">Salle : ${b.room || 'Non assignée'}</div>
          <div class="book-actions mt-2 flex gap-2">
            <button class="action-btn" onclick="window.editManualBook('${isbn}')">✏️ Éditer</button>
            <button class="action-btn-danger" onclick="window.deleteBook('${isbn}')">🗑️ Supprimer</button>
          </div>`;
        item.appendChild(det);
        bookListEl.appendChild(item);
      });
    updateTotalCount();
  }
  
  window.deleteBook = isbn => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le livre avec l'ISBN ${isbn} ? Cette action est irréversible.`)) return;
    Promise.all([
      set(child(stocksRef, isbn), null),
      set(child(booksDataRef, isbn), null)
    ]).then(() => {
        alert("Livre supprimé avec succès.");
    }).catch(err => {
        alert("Erreur lors de la suppression : " + err.message);
    });
  };

  // Chargement initial des données
  onValue(booksDataRef, snap => {
    allBooks = snap.val() || {};
    // Assurez-vous d'avoir les données de stock avant de rendre la liste
    get(stocksRef).then(snap2 => {
      allStocks = snap2.val() || {};
      renderBookList();
    });
  });
  // Mettre à jour la liste si seulement le stock change
  onValue(stocksRef, snap => {
    allStocks = snap.val() || {};
    renderBookList();
  });


  // —— Recherche / ajout par ISBN ——
  let pending = null, currentISBN = null;
  function checkIfManualNeeded(a,s) {
    const isNeeded = (a === "Auteur inconnu" || s === "Aucune information" || s.length < 20);
    fillBtn.classList.toggle('hidden', !isNeeded);
  }
  fillBtn.onclick = () => {
    manualEditDiv.classList.remove('hidden');
    editAuthor.value  = pending.author === "Auteur inconnu" ? "" : pending.author;
    editSummary.value = pending.summary === "Aucune information" ? "" : pending.summary;
  };
  document.getElementById('save-manual-info').onclick = () => {
    if (editAuthor.value)  pending.author  = editAuthor.value.trim();
    if (editSummary.value) pending.summary = editSummary.value.trim();
    authorEl.textContent  = pending.author;
    summaryEl.textContent = pending.summary;
    manualEditDiv.classList.add('hidden');
    checkIfManualNeeded(pending.author, pending.summary);
  };
  document.getElementById('cancel-manual-info').onclick = () => {
    manualEditDiv.classList.add('hidden');
  };

  isbnForm.addEventListener('submit', async e => {
    e.preventDefault();
    showSpinner();
    let raw = sanitizeISBN(document.getElementById('isbn').value.trim());
    if (!isValidISBN(raw)) { alert('ISBN invalide'); hideSpinner(); return; }
    currentISBN = raw;
    let data = await fetchBookDataFromAPIs(raw);
    if (!data && raw.length === 10) {
      const alt = convertISBN10toISBN13(raw);
      data = await fetchBookDataFromAPIs(alt);
      if (data) currentISBN = alt;
    }
    searchTabs.innerHTML = ''; searchTabs.classList.add('hidden');
    bookInfoEl.classList.add('hidden');

    if (data?.googleBooksResults?.length > 1) {
      searchTabs.classList.remove('hidden');
      data.googleBooksResults.forEach((vol,i) => {
        const info = parseVolumeInfo(vol.volumeInfo||{});
        const btn  = document.createElement('button');
        btn.className = 'tab px-4 py-2 border-b-2';
        btn.textContent = info.title.substring(0, 30) + (info.title.length > 30 ? '...' : '');
        btn.onclick    = (event) => {
            document.querySelectorAll('#search-results .tab').forEach(t => t.classList.remove('active', 'border-blue-500', 'text-blue-500'));
            event.currentTarget.classList.add('active', 'border-blue-500', 'text-blue-500');
            showBookInfos(info);
        }
        if (i===0) { 
            btn.classList.add('active', 'border-blue-500', 'text-blue-500');
            showBookInfos(info);
        }
        searchTabs.appendChild(btn);
      });
    }
    else if (data?.googleBooksResults) {
      showBookInfos(parseVolumeInfo(data.googleBooksResults[0].volumeInfo||{}));
    }
    else if (data?.openLibraryResult) {
      const { title, author, summary } = data.openLibraryResult;
      const completedData = await completeWithGoogleIfNeeded(currentISBN, { title, author, summary, cover: null });
      showBookInfos(completedData);
    }
    else {
      showBookInfos({ title:"Nouveau livre",author:"Auteur inconnu",summary:"Aucune information",cover:null });
    }
    hideSpinner();
  });

  function showBookInfos({title,author,summary,cover}) {
    pending = { title, author, summary, cover };
    bookInfoEl.classList.remove('hidden');
    titleEl.textContent   = title;
    authorEl.textContent  = author;
    summaryEl.textContent = summary;
    checkIfManualNeeded(author, summary);
    if (cover) {
      coverImg.src = cover;
      coverImg.style.display = 'block';
      coverImg.onerror = () => coverImg.style.display='none';
    } else {
      coverImg.style.display='none';
    }
    get(child(stocksRef, currentISBN)).then(snap => {
      const currentStock = snap.exists() ? snap.val() : 0;
      stockSpan.textContent = currentStock;
      newStockInput.value = currentStock; // Pré-remplir le champ de mise à jour
    });
    get(child(booksDataRef, currentISBN)).then(snap => {
      const exists = snap.exists();
      confirmBtn.style.display = exists ? 'none' : '';
      cancelBtn.style.display  = exists ? 'none' : '';
      stockForm.style.display = exists ? '' : 'none'; // Afficher le form de stock si le livre existe
    });
  }

  confirmBtn.onclick = async () => {
    const room = roomSelectEl.value;
    if (!room) {
        alert("Veuillez sélectionner une salle pour le livre.");
        return;
    }
    await Promise.all([
      set(child(booksDataRef, currentISBN), { ...pending, room }),
      set(child(stocksRef, currentISBN), 1) // On l'ajoute avec un stock initial de 1
    ]);
    alert("Livre ajouté avec un stock de 1 !");
    isbnForm.dispatchEvent(new Event('submit')); // Recharger les infos pour voir le nouvel état
  };
  cancelBtn.onclick = () => {
    bookInfoEl.classList.add('hidden');
    searchTabs.classList.add('hidden');
    isbnForm.reset();
  };

  // —— Mise à jour du stock ——
  stockForm.addEventListener('submit', async e => {
    e.preventDefault();
    const qte = parseInt(newStockInput.value,10);
    if (isNaN(qte) || qte < 0) return alert('Quantité invalide');
    await set(child(stocksRef, currentISBN), qte);
    alert('Stock mis à jour.');
    stockSpan.textContent = qte;
  });

  // —— Ajout / édition manuel ——
  let isEditing=false, editingISBN=null;
  manualToggleBtn.onclick = () => {
    manualForm.classList.toggle('hidden');
    manualForm.reset();
    isEditing = false;
    editingISBN = null;
    document.getElementById('manual-isbn').removeAttribute('readonly');
    document.getElementById('manual-form-title').textContent = "Ajouter un livre manuellement";
  };
  manualForm.onsubmit = async e => {
    e.preventDefault();
    const t = document.getElementById('manual-title').value.trim();
    const a = document.getElementById('manual-author-full').value.trim();
    const s = document.getElementById('manual-summary-full').value.trim();
    const i = sanitizeISBN(document.getElementById('manual-isbn').value.trim());
    const c = document.getElementById('manual-cover-url').value.trim();
    const r = document.getElementById('manual-room').value;
    const sv= parseInt(document.getElementById('manual-stock').value,10);
    if (!t || !a || !i) return alert("Le titre, l'auteur et l'ISBN sont obligatoires.");
    if (!isValidISBN(i)) return alert("L'ISBN fourni est invalide.");
    if (isNaN(sv) || sv < 0) return alert("Le stock doit être un nombre positif ou nul.");
    
    // Vérifier si l'ISBN existe déjà lors d'un ajout (et non d'une édition)
    if (!isEditing && (await get(child(booksDataRef,i))).exists()) {
      return alert("Un livre avec cet ISBN existe déjà. Utilisez la fonction d'édition.");
    }
    const key = isEditing ? editingISBN : i;
    await Promise.all([
      set(child(booksDataRef,key), { title:t,author:a,summary:s || "Aucun résumé.",cover:(c.startsWith('http')||c.startsWith('data:')?c:''),room:r }),
      set(child(stocksRef,key), sv)
    ]);
    alert(isEditing ? "Livre modifié avec succès !" : "Livre ajouté avec succès !");
    isEditing=false; editingISBN=null;
    document.getElementById('manual-isbn').removeAttribute('readonly');
    manualForm.reset();
    manualForm.classList.add('hidden');
  };
  
  window.editManualBook = async isbn => {
    const [bs,ss] = await Promise.all([ get(child(booksDataRef,isbn)), get(child(stocksRef,isbn)) ]);
    if (!bs.exists()) return alert("Livre non trouvé dans la base de données.");
    
    const d  = bs.val(), sv = ss.exists()?ss.val():0;
    document.getElementById('manual-form-title').textContent = "Éditer le livre";
    document.getElementById('manual-title').value        = d.title;
    document.getElementById('manual-author-full').value  = d.author;
    document.getElementById('manual-summary-full').value = d.summary;
    document.getElementById('manual-isbn').value         = isbn;
    document.getElementById('manual-cover-url').value    = d.cover||"";
    document.getElementById('manual-room').value         = d.room||"";
    document.getElementById('manual-stock').value        = sv;
    isEditing=true; editingISBN=isbn;
    document.getElementById('manual-isbn').setAttribute('readonly','');
    manualForm.classList.remove('hidden');
    manualForm.scrollIntoView({behavior:'smooth',block:'start'});
  };

  // —— Scanner QuaggaJS ——
  function startScanner(cb) {
    scannerCont.classList.remove('hidden');
    Quagga.init({
      inputStream: { name:"Live", type:"LiveStream", target:scannerVideo, constraints:{facingMode:"environment"} },
      decoder: { readers:["ean_reader","ean_13_reader"] },
      locate: true
    }, err => {
      if (err) { 
        console.error(err);
        alert("Erreur lors de l'initialisation de la caméra. Assurez-vous d'avoir donné la permission.");
        scannerCont.classList.add('hidden'); 
        return; 
      }
      Quagga.start();
      Quagga.onDetected(({codeResult}) => {
        const code = codeResult.code;
        // Valide les codes EAN-13 (souvent les ISBN)
        if (code && (code.length === 13 && code.startsWith('978')) || code.length === 10) {
          Quagga.stop();
          scannerCont.classList.add('hidden');
          cb(code);
        }
      });
    });
  }
  scanISBNBtn.onclick   = () => startScanner(code => {
    document.getElementById('isbn').value = code;
    isbnForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  scanManualBtn.onclick = () => startScanner(code => {
    const mi = document.getElementById('manual-isbn');
    mi.value = code; 
    mi.focus();
  });
  stopScanBtn.onclick   = () => {
    Quagga.stop();
    scannerCont.classList.add('hidden');
  };

  // Rendre les fonctions d'édition/suppression accessibles globalement
  window.editManualBook = editManualBook;
  window.deleteBook = deleteBook;
});
