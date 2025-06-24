// script.js
// Combinaison Google Books / Open Library, édition manuelle et gestion optimisée des couvertures

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKE...",
  authDomain: "bpsn-74f1b.firebaseapp.com",
  databaseURL: "https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bpsn-74f1b",
  storageBucket: "bpsn-74f1b.firebasestorage.app",
  messagingSenderId: "1057707303676",
  appId: "1:1057707303676:web:63dd292678dead41c2ed79",
  measurementId: "G-DZGXBJERKQ"
};

function convertISBN10toISBN13(isbn10) {
  let core = isbn10.substring(0, 9);
  let isbn13WithoutCheck = "978" + core;
  let sum = 0;
  for (let i = 0; i < isbn13WithoutCheck.length; i++) {
    let digit = parseInt(isbn13WithoutCheck[i]);
    sum += (i % 2 === 0 ? digit : digit * 3);
  }
  let remainder = sum % 10;
  let checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return isbn13WithoutCheck + checkDigit;
}

document.addEventListener('DOMContentLoaded', () => {
  // --------- Gestion du mode sombre / clair ---------
  const modeToggleBtn = document.getElementById('mode-toggle');
  if (modeToggleBtn) {
    // Met à jour l'icône du bouton selon la présence de la classe 'dark'
    function updateToggleIcon() {
      modeToggleBtn.textContent = document.documentElement.classList.contains('dark')
        ? '☀️'
        : '🌙';
    }

    modeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateToggleIcon();
    });

    // Initialisation de l'icône au chargement
    updateToggleIcon();
  }
  // -------------------------------------------------

  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);

  const stocksRef = ref(database, 'stocks');
  const booksDataRef = ref(database, 'booksData');

  const spinner = document.getElementById('spinner');
  function showSpinner() { spinner.classList.remove('hidden'); }
  function hideSpinner() { spinner.classList.add('hidden'); }

  const engineSelect = document.getElementById('search-engine');
  if (engineSelect) {
    const storedEngine = localStorage.getItem('search-engine');
    if (storedEngine) { engineSelect.value = storedEngine; }
    engineSelect.addEventListener('change', () => {
      localStorage.setItem('search-engine', engineSelect.value);
    });
  }

  function sanitizeISBN(isbn) {
    return isbn.replace(/[-\s]/g, "");
  }

  function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
  }

  // Fonction pour définir l'image de couverture et gérer l'erreur
  function setCoverImage(imgElement, isbn, fallback = 'https://via.placeholder.com/150x200?text=No+Cover') {
    imgElement.src = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    imgElement.onerror = () => {
      if (fallback) {
        imgElement.src = fallback;
        imgElement.onerror = () => { imgElement.style.display = 'none'; };
      } else {
        imgElement.style.display = 'none';
      }
    };
  }

  // Récupère titre, auteur, résumé et possible cover depuis Google Books
  function parseVolumeInfo(volumeInfo) {
    const title = volumeInfo.title || "Sans titre";
    const author = (volumeInfo.authors && volumeInfo.authors.length > 0) ? volumeInfo.authors[0] : "Auteur inconnu";
    const summary = volumeInfo.description || "Aucune information";
    const cover = volumeInfo.imageLinks ? volumeInfo.imageLinks.thumbnail : null;
    return { title, author, summary, cover };
  }

  async function fetchBookDataFromAPIs(isbn) {
    try {
      const googleRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const googleData = await googleRes.json();
      if (googleData.items && googleData.items.length > 0) {
        return { googleBooksResults: googleData.items };
      }
    } catch (e) {
      console.warn("Erreur Google Books:", e);
    }
    try {
      const openRes = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
      if (openRes.ok) {
        const openData = await openRes.json();
        const title = openData.title || "Sans titre";
        let author = "Auteur inconnu";
        let summary = "Aucune information";
        if (typeof openData.by_statement === 'string') { author = openData.by_statement; }
        if (typeof openData.description === 'string') { summary = openData.description; }
        else if (typeof openData.description === 'object' && openData.description.value) { summary = openData.description.value; }
        return { openLibraryResult: { title, author, summary } };
      }
    } catch (e) {
      console.warn("Erreur Open Library:", e);
    }
    return null;
  }

  async function completeWithGoogleIfNeeded(isbn, baseData) {
    let { title, author, summary } = baseData;
    const MIN_SUMMARY_LENGTH = 50;
    if (author === "Auteur inconnu" || summary.length < MIN_SUMMARY_LENGTH) {
      try {
        const googleRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const googleData = await googleRes.json();
        if (googleData.items && googleData.items.length > 0) {
          const volumeInfo = googleData.items[0].volumeInfo || {};
          if (author === "Auteur inconnu" && volumeInfo.authors && volumeInfo.authors[0]) {
            author = volumeInfo.authors[0];
          }
          const googleSummary = volumeInfo.description || "";
          if (googleSummary.length > summary.length) {
            summary = googleSummary;
          }
        }
      } catch (err) {
        console.warn("Impossible de compléter avec Google Books :", err);
      }
    }
    return { title, author, summary };
  }

  let globalBooksData = {};
  let globalStocksData = {};

  function updateTotalBooksCount() {
    const total = Object.values(globalStocksData).reduce((acc, val) => acc + (val || 0), 0);
    const totalElem = document.getElementById('total-books-count');
    if (totalElem) {
      totalElem.textContent = `Total des livres disponibles : ${total}`;
    }
  }

  // Affiche la liste en tenant compte du filtre et des couvertures
  function renderBookList(filter = '') {
    const bookListElement = document.getElementById('book-list');
    if (!bookListElement) return;
    bookListElement.innerHTML = '';
    const normalizedFilter = filter.toLowerCase();

    for (const isbn in globalBooksData) {
      if (!globalBooksData.hasOwnProperty(isbn)) continue;

      const title = globalBooksData[isbn].title || "Sans titre";
      const author = globalBooksData[isbn].author || "Auteur inconnu";
      const summary = globalBooksData[isbn].summary || "Aucune information";
      const stock = globalStocksData[isbn] || 0;

      if (filter) {
        if (!title.toLowerCase().includes(normalizedFilter) &&
            !author.toLowerCase().includes(normalizedFilter)) {
          continue;
        }
      }

      const bookItem = document.createElement('div');
      bookItem.classList.add('book-item');

      const imgElement = document.createElement('img');
      imgElement.classList.add('book-cover');
      imgElement.loading = "lazy";
      
      // Utilise d'abord l'URL stockée, sinon Open Library
      const cover = globalBooksData[isbn].cover;
      if (cover) {
        imgElement.src = cover;
        imgElement.onerror = () => {
          setCoverImage(imgElement, isbn, "");
        };
      } else {
        setCoverImage(imgElement, isbn, "");
      }
      
      bookItem.appendChild(imgElement);

      const contentEl = document.createElement('div');
      contentEl.classList.add('book-details');
      contentEl.innerHTML = `
        <div class="book-title"><strong>Titre : ${title}</strong></div>
        <div class="book-identifier">ISBN : <strong>${isbn}</strong></div>
        <div class="book-summary">Résumé : ${summary}</div>
        <div class="stock-info">${stock > 0 ? `En stock : ${stock} exemplaires` : 'Hors stock'}</div>
        <span class="book-author">Auteur : ${author}</span>
        <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
      `;
      bookItem.appendChild(contentEl);
      bookListElement.appendChild(bookItem);
    }
    updateTotalBooksCount();
  }

  window.deleteBook = function(isbn) {
    if (confirm(`Confirmer la suppression du livre avec l'ISBN ${isbn} ?`)) {
      Promise.all([
        set(child(stocksRef, isbn), null),
        set(child(booksDataRef, isbn), null)
      ])
      .then(() => {
        alert("Livre supprimé.");
        updateTotalBooksCount();
      })
      .catch(console.error);
    }
  };

  const isbnForm = document.getElementById('isbn-form');
  const bookInfoSection = document.getElementById('book-info');
  const coverImg = document.getElementById('cover');
  const titleSpan = document.getElementById('title');
  const authorSpan = document.getElementById('author');
  const summarySpan = document.getElementById('summary');
  const stockSpan = document.getElementById('stock');

  const confirmAddButton = document.getElementById('confirm-add-book');
  const cancelAddButton = document.getElementById('cancel-add-book');
  const stockFormEl = document.getElementById('stock-form');
  const searchInput = document.getElementById('search-book');
  const searchResultsDiv = document.getElementById('search-results');

  // Édition manuelle si nécessaire
  const fillInfoButton = document.getElementById('fill-info-button');
  const manualEditDiv = document.getElementById('manual-edit');
  const manualAuthorInput = document.getElementById('manual-author');
  const manualSummaryInput = document.getElementById('manual-summary');
  const saveManualInfoButton = document.getElementById('save-manual-info');
  const cancelManualInfoButton = document.getElementById('cancel-manual-info');

  let bookDataPending = null;
  let currentISBN = null;

  function checkIfManualNeeded(author, summary) {
    if (author === "Auteur inconnu" || summary === "Aucune information") {
      fillInfoButton.classList.remove('hidden');
    } else {
      fillInfoButton.classList.add('hidden');
    }
  }

  fillInfoButton.addEventListener('click', () => {
    manualEditDiv.classList.remove('hidden');
    manualAuthorInput.value = bookDataPending.author === "Auteur inconnu" ? "" : bookDataPending.author;
    manualSummaryInput.value = bookDataPending.summary === "Aucune information" ? "" : bookDataPending.summary;
  });

  saveManualInfoButton.addEventListener('click', () => {
    const newAuthor = manualAuthorInput.value.trim();
    const newSummary = manualSummaryInput.value.trim();
    if (newAuthor) { bookDataPending.author = newAuthor; }
    if (newSummary) { bookDataPending.summary = newSummary; }
    authorSpan.textContent = bookDataPending.author;
    summarySpan.textContent = bookDataPending.summary;
    manualEditDiv.classList.add('hidden');
    checkIfManualNeeded(bookDataPending.author, bookDataPending.summary);
  });

  cancelManualInfoButton.addEventListener('click', () => {
    manualEditDiv.classList.add('hidden');
  });

  isbnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showSpinner();

    const isbnInput = document.getElementById('isbn');
    if (!isbnInput) return;
    const rawISBN = sanitizeISBN(isbnInput.value.trim());
    if (!isValidISBN(rawISBN)) {
      alert('ISBN non valide (10 ou 13 chiffres).');
      hideSpinner();
      return;
    }
    currentISBN = rawISBN;
    let dataFromApi = null;
    const selectedEngine = engineSelect.value || "auto";
    if (selectedEngine === "google") {
      try {
        const googleRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${rawISBN}`);
        const googleData = await googleRes.json();
        if (googleData.items && googleData.items.length > 0) {
          dataFromApi = { googleBooksResults: googleData.items };
        }
      } catch (e) {
        console.warn("Erreur Google Books:", e);
      }
    } else if (selectedEngine === "openlibrary") {
      try {
        const openRes = await fetch(`https://openlibrary.org/isbn/${rawISBN}.json`);
        if (openRes.ok) {
          const openData = await openRes.json();
          let title = openData.title || "Sans titre";
          let author = "Auteur inconnu";
          let summary = "Aucune information";
          if (typeof openData.by_statement === 'string') { author = openData.by_statement; }
          if (typeof openData.description === 'string') { summary = openData.description; }
          else if (typeof openData.description === 'object' && openData.description.value) { summary = openData.description.value; }
          const merged = await completeWithGoogleIfNeeded(rawISBN, { title, author, summary });
          dataFromApi = { openLibraryResult: merged };
        }
      } catch (e) {
        console.warn("Erreur Open Library:", e);
      }
    } else {
      dataFromApi = await fetchBookDataFromAPIs(rawISBN);
      if (!dataFromApi && rawISBN.length === 10) {
        const isbn13 = convertISBN10toISBN13(rawISBN);
        dataFromApi = await fetchBookDataFromAPIs(isbn13);
        if (dataFromApi) { currentISBN = isbn13; }
      }
    }
    bookInfoSection.classList.add('hidden');
    searchResultsDiv.classList.add('hidden');
    searchResultsDiv.innerHTML = '';

    if (dataFromApi && dataFromApi.googleBooksResults) {
      const googleResults = dataFromApi.googleBooksResults;
      if (googleResults.length > 1) {
        searchResultsDiv.classList.remove('hidden');
        googleResults.forEach((item, index) => {
          const volumeInfo = item.volumeInfo || {};
          const { title, author, summary, cover } = parseVolumeInfo(volumeInfo);
          const tabBtn = document.createElement('button');
          tabBtn.classList.add('tab');
          tabBtn.textContent = title + " - " + author;
          tabBtn.dataset.index = index;
          tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            tabBtn.classList.add('active');
            showBookInfos(title, author, summary, cover);
          });
          if (index === 0) {
            tabBtn.classList.add('active');
            showBookInfos(title, author, summary, cover);
          }
          searchResultsDiv.appendChild(tabBtn);
        });
        hideSpinner();
        return;
      } else {
        const volumeInfo = googleResults[0].volumeInfo || {};
        const { title, author, summary, cover } = parseVolumeInfo(volumeInfo);
        showBookInfos(title, author, summary, cover);
      }
    } else if (dataFromApi && dataFromApi.openLibraryResult) {
      const { title, author, summary } = dataFromApi.openLibraryResult;
      showBookInfos(title, author, summary, null);
    } else {
      showBookInfos("Nouveau livre", "Auteur inconnu", "Aucune information", null);
    }
    hideSpinner();
  });

  function showBookInfos(title, author, summary, cover) {
    bookDataPending = { title, author, summary, cover };
    bookInfoSection.classList.remove('hidden');
    coverImg.loading = "eager";
    coverImg.fetchPriority = "high";
    if (cover) {
      coverImg.src = cover;
    } else {
      setCoverImage(coverImg, currentISBN);
    }
    titleSpan.textContent = title;
    authorSpan.textContent = author;
    summarySpan.textContent = summary;
    checkIfManualNeeded(author, summary);

    get(child(stocksRef, currentISBN))
      .then(snap => {
        const stockVal = snap.exists() ? snap.val() : 0;
        updateStockInfo(stockVal);
      })
      .catch(console.error);

    get(child(booksDataRef, currentISBN))
      .then(snap => {
        if (snap.exists()) {
          confirmAddButton.style.display = 'none';
          cancelAddButton.style.display = 'none';
        } else {
          confirmAddButton.style.display = 'inline-block';
          cancelAddButton.style.display = 'inline-block';
        }
      })
      .catch(console.error);
  }

  function updateStockInfo(stockVal) {
    if (stockVal > 0) {
      stockSpan.textContent = `En stock : ${stockVal} exemplaires`;
      stockSpan.classList.add('in-stock');
      stockSpan.classList.remove('out-of-stock');
    } else {
      stockSpan.textContent = 'Hors stock';
      stockSpan.classList.remove('in-stock');
      stockSpan.classList.add('out-of-stock');
    }
  }

  confirmAddButton.addEventListener('click', async () => {
    if (!bookDataPending || !currentISBN) {
      alert('Aucune donnée à insérer.');
      return;
    }
    await Promise.all([
      set(child(booksDataRef, currentISBN), bookDataPending),
      set(child(stocksRef, currentISBN), 0)
    ]);
    alert('Livre créé en base, stock = 0.');
    confirmAddButton.style.display = 'none';
    cancelAddButton.style.display = 'none';
    isbnForm.dispatchEvent(new Event('submit'));
  });

  cancelAddButton.addEventListener('click', () => {
    bookInfoSection.classList.add('hidden');
    confirmAddButton.style.display = 'none';
    cancelAddButton.style.display = 'none';
    bookDataPending = null;
    currentISBN = null;
  });

  if (stockFormEl) {
    stockFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const isbnInput = document.getElementById('isbn');
      const newStockInput = document.getElementById('new-stock');
      if (!isbnInput || !newStockInput) return;
      let rawISBN = sanitizeISBN(isbnInput.value.trim());
      let newStockVal = parseInt(newStockInput.value, 10);
      if (!isValidISBN(rawISBN)) {
        alert('ISBN invalide.');
        return;
      }
      if (isNaN(newStockVal) || newStockVal < 0) {
        alert('Quantité invalide.');
        return;
      }
      await set(child(stocksRef, rawISBN), newStockVal);
      alert('Stock mis à jour.');
      updateStockInfo(newStockVal);
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderBookList(searchInput.value);
    });
  }

  function initializeBookListListener() {
    onValue(booksDataRef, (snapBooks) => {
      globalBooksData = snapBooks.val() || {};
      onValue(stocksRef, (snapStocks) => {
        globalStocksData = snapStocks.val() || {};
        renderBookList(searchInput.value);
      });
    });
  }

const manualToggleBtn = document.getElementById('manual-add-toggle');
  const manualForm      = document.getElementById('manual-add-form');

  manualToggleBtn.addEventListener('click', () => {
    manualForm.classList.toggle('hidden');
  });

  manualForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title    = document.getElementById('manual-title').value.trim();
  const author   = document.getElementById('manual-author-full').value.trim();
  const summary  = document.getElementById('manual-summary-full').value.trim();
  const isbn     = sanitizeISBN(document.getElementById('manual-isbn').value.trim());
  const coverUrl = document.getElementById('manual-cover-url').value.trim();
 const cover = coverUrl && (/^https?:\/\//.test(coverUrl) || /^data:image\/[a-zA-Z]+;base64,/.test(coverUrl))
  ? coverUrl
  : "";

console.log("coverUrl brut :", coverUrl);
  console.log("cover validé ?", cover);

  const stockVal = parseInt(document.getElementById('manual-stock').value, 10) || 0;
  if (stockVal < 0) {
    alert("Le stock ne peut pas être négatif.");
    return;
  }

  if (!title || !author || !summary || !isbn || !isValidISBN(isbn)) {
    alert("Tous les champs sauf la couverture et le stock sont obligatoires, avec un ISBN valide.");
    return;
  }

  const bookSnap = await get(child(booksDataRef, isbn));
  if (bookSnap.exists()) {
    alert("Ce livre existe déjà.");
    return;
  }

  const bookData = { title, author, summary, cover };
  // On écrit d’abord les données du livre, puis le stock choisi
  await Promise.all([
    set(child(booksDataRef, isbn), bookData),
    set(child(stocksRef,      isbn), stockVal)
  ]);

  alert(`Livre ajouté avec succès (stock initial : ${stockVal}).`);
  manualForm.reset();
  manualForm.classList.add('hidden');
});


  initializeBookListListener();
});
