// script.js

// On écoute DOMContentLoaded pour s'assurer que le HTML est prêt
document.addEventListener('DOMContentLoaded', () => {
  // Import des modules Firebase (V9) en mode module
  import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
  import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

  // Configuration Firebase
  const firebaseConfig = {
    apiKey: "XXX",
    authDomain: "XXX.firebaseapp.com",
    databaseURL: "https://XXX-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "XXX",
    storageBucket: "XXX.appspot.com",
    messagingSenderId: "XXX",
    appId: "XXX",
    measurementId: "XXX"
  };

  // Initialisation Firebase
  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);

  // Références Firebase
  const stocksRef = ref(database, 'stocks');
  const booksDataRef = ref(database, 'booksData');

  // -----------
  // Fonctions
  // -----------

  // Nettoie un ISBN (retire les tirets / espaces)
  function sanitizeISBN(isbn) {
    return isbn.replace(/[-\\s]/g, "");
  }

  // Vérifie qu'un ISBN est valide
  function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
  }

  // Construction URL de couverture Open Library
  function getCoverUrl(isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  }

  // Affecte la couverture, masque si introuvable
  function setCoverImage(imgElement, isbn, fallback = 'default_cover.jpg') {
    imgElement.src = getCoverUrl(isbn);
    imgElement.onerror = () => {
      // Si introuvable sur OpenLibrary, on tente un fallback local
      imgElement.src = fallback;
      // S'il est aussi introuvable en local, on masque
      imgElement.onerror = () => {
        imgElement.style.display = 'none';
      };
    };
  }

  // Normalisation de l'auteur (pour éviter duplicats genre J.K. / Joanne K.)
  function normalizeAuthorName(name) {
    return name
      .toLowerCase()
      .replace(/[\\.,]/g, '')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  // Données globales
  let globalBooksData = {};
  let globalStocksData = {};

  // Met à jour l'affichage du total
  function updateTotalBooksCount() {
    const totalCount = Object.values(globalStocksData).reduce((acc, val) => acc + (val || 0), 0);
    const totalElem = document.getElementById('total-books-count');
    if (totalElem) {
      totalElem.textContent = `Total des livres disponibles : ${totalCount}`;
    }
  }

  // Affiche la liste de tous les livres, avec filtrage sur titre/auteur
  function renderBookList(filter = '') {
    const bookListElement = document.getElementById('book-list');
    if (!bookListElement) return;

    bookListElement.innerHTML = '';
    const normalizedFilter = filter.toLowerCase();

    // Dictionnaire pour unifier les noms d'auteurs
    let uniqueAuthors = {};

    for (const isbn in globalBooksData) {
      const rawAuthor = globalBooksData[isbn].author || 'Auteur inconnu';
      const normalizedAuthor = normalizeAuthorName(rawAuthor);

      // Unifie l'auteur
      if (!uniqueAuthors[normalizedAuthor]) {
        uniqueAuthors[normalizedAuthor] = rawAuthor;
      }
      // Remplace la version stockée par la version unifiée
      globalBooksData[isbn].author = uniqueAuthors[normalizedAuthor];

      // Filtrage par titre / auteur
      if (filter) {
        const titleMatch = globalBooksData[isbn].title.toLowerCase().includes(normalizedFilter);
        const authorMatch = normalizeAuthorName(globalBooksData[isbn].author).includes(normalizedFilter);
        if (!titleMatch && !authorMatch) continue;
      }

      const stock = globalStocksData[isbn] || 0;

      // Elément livre
      const bookItem = document.createElement('div');
      bookItem.classList.add('book-item');

      // Image de couverture
      const imgElement = document.createElement('img');
      imgElement.classList.add('book-cover');
      setCoverImage(imgElement, isbn);
      bookItem.appendChild(imgElement);

      // Infos texte
      const contentElement = document.createElement('div');
      contentElement.classList.add('book-details');
      contentElement.innerHTML = `
        <div class="book-title"><strong>Titre : ${globalBooksData[isbn].title}</strong></div>
        <div class="book-identifier">ISBN : <strong>${isbn}</strong></div>
        <div class="book-summary">Résumé : ${globalBooksData[isbn].summary}</div>
        <div class="stock-info">${stock > 0 ? 'En stock : ' + stock + ' exemplaires' : 'Hors stock'}</div>
        <span class="book-author">Auteur : ${globalBooksData[isbn].author}</span>
        <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
      `;
      bookItem.appendChild(contentElement);

      bookListElement.appendChild(bookItem);
    }

    updateTotalBooksCount();
  }

  // Supprime un livre
  window.deleteBook = function(isbn) {
    if (confirm(`Confirmer la suppression du livre avec l'ISBN ${isbn} ?`)) {
      Promise.all([
        set(child(stocksRef, isbn), null),
        set(child(booksDataRef, isbn), null)
      ]).then(() => {
        alert(`Livre supprimé.`);
        updateTotalBooksCount();
      }).catch(console.error);
    }
  };

  // ----------------------------
  // 1) Gestion du formulaire ISBN
  // ----------------------------
  const isbnForm = document.getElementById('isbn-form');
  const bookInfoSection = document.getElementById('book-info');
  const coverImg = document.getElementById('cover');
  const titleSpan = document.getElementById('title');
  const authorSpan = document.getElementById('author');
  const summarySpan = document.getElementById('summary');
  const stockSpan = document.getElementById('stock');

  if (isbnForm && bookInfoSection) {
    isbnForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const isbnInput = document.getElementById('isbn');
      if (!isbnInput) return;

      const rawISBN = sanitizeISBN(isbnInput.value.trim());
      if (!isValidISBN(rawISBN)) {
        alert('ISBN non valide (10 ou 13 chiffres).');
        return;
      }

      // Recherche du livre dans la DB
      get(child(booksDataRef, rawISBN)).then(bookSnap => {
        if (bookSnap.exists()) {
          // Livre existant => on l'affiche
          const data = bookSnap.val();
          // Normalisation auteur
          data.author = data.author || 'Auteur inconnu';

          // Affiche dans la section
          bookInfoSection.classList.remove('hidden');
          setCoverImage(coverImg, rawISBN);
          titleSpan.textContent = data.title || 'Sans titre';
          authorSpan.textContent = data.author;
          summarySpan.textContent = data.summary || 'Pas de résumé.';
          
          // On va aussi chercher le stock
          get(child(stocksRef, rawISBN)).then(stockSnap => {
            let stockValue = stockSnap.exists() ? stockSnap.val() : 0;
            if (stockValue > 0) {
              stockSpan.textContent = `En stock : ${stockValue} exemplaires`;
              stockSpan.classList.remove('out-of-stock');
              stockSpan.classList.add('in-stock');
            } else {
              stockSpan.textContent = 'Hors stock';
              stockSpan.classList.remove('in-stock');
              stockSpan.classList.add('out-of-stock');
            }
          });
        } else {
          // Livre inexistant => on propose de le créer
          if (confirm('Le livre n’existe pas. Voulez-vous le créer ?')) {
            // On crée le livre dans booksData avec titre minimal
            const newBook = {
              title: 'Nouveau livre',
              author: 'Auteur inconnu',
              summary: 'Aucune information'
            };
            Promise.all([
              set(child(booksDataRef, rawISBN), newBook),
              set(child(stocksRef, rawISBN), 0)
            ])
            .then(() => {
              alert('Nouveau livre créé ! Il est à 0 en stock pour le moment.');
              // Forçons un refresh
              bookInfoSection.classList.add('hidden');
            })
            .catch(console.error);
          } else {
            // L’utilisateur ne veut pas créer, on masque la section
            bookInfoSection.classList.add('hidden');
          }
        }
      });
    });
  }

  // ----------------------------
  // 2) Mise à jour du stock
  // ----------------------------
  const stockFormEl = document.getElementById('stock-form');
  if (stockFormEl) {
    stockFormEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const isbnInput = document.getElementById('isbn');
      const newStockInput = document.getElementById('new-stock');
      if (!isbnInput || !newStockInput) return;

      let rawISBN = sanitizeISBN(isbnInput.value.trim());
      let newStockVal = parseInt(newStockInput.value, 10);

      if (!isValidISBN(rawISBN)) {
        alert('ISBN non valide.');
        return;
      }
      if (isNaN(newStockVal) || newStockVal < 0) {
        alert('Quantité invalide.');
        return;
      }
      // On met à jour
      set(child(stocksRef, rawISBN), newStockVal).then(() => {
        alert('Stock mis à jour.');
        // Mise à jour du label stock dans la section
        if (newStockVal > 0) {
          stockSpan.textContent = `En stock : ${newStockVal} exemplaires`;
          stockSpan.classList.remove('out-of-stock');
          stockSpan.classList.add('in-stock');
        } else {
          stockSpan.textContent = 'Hors stock';
          stockSpan.classList.remove('in-stock');
          stockSpan.classList.add('out-of-stock');
        }
      }).catch(console.error);
    });
  }

  // ----------------------------
  // 3) Recherche globale (titre/auteur)
  // ----------------------------
  const searchInput = document.getElementById('search-book');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderBookList(searchInput.value);
    });
  }

  // ----------------------------
  // 4) Listener global Firebase
  // ----------------------------
  function initializeBookListListener() {
    onValue(booksDataRef, (snapBooks) => {
      globalBooksData = snapBooks.val() || {};
      onValue(stocksRef, (snapStocks) => {
        globalStocksData = snapStocks.val() || {};
        // Actualise la liste
        if (searchInput) {
          renderBookList(searchInput.value);
        } else {
          renderBookList();
        }
      });
    });
  }
  initializeBookListListener();

  // Petit rappel
  console.info(
    \"Vérifie tes règles Firebase pour autoriser la lecture/écriture si nécessaire.\" +
    \"\\nExemple en dev : { 'rules': { '.read': true, '.write': true } }\\n\" +
    \"En production, il faut des règles plus fines.\"
  );
});
