// Import des modules Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getDatabase, ref, child, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDKEewyRf8TgMjXCsfHfzvnCpBUG-GYDig",
    authDomain: "bpsn-74f1b.firebaseapp.com",
    databaseURL: "https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bpsn-74f1b",
    storageBucket: "bpsn-74f1b.firebasestorage.app",
    messagingSenderId: "1057707303676",
    appId: "1:1057707303676:web:63dd292678dead41c2ed79",
    measurementId: "G-DZGXBJERKQ"
};

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Références Firebase
const stocksRef = ref(database, 'stocks');
const booksDataRef = ref(database, 'booksData');

// Fonction pour valider l'ISBN
function isValidISBN(isbn) {
    return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
}

// Fonction pour récupérer l'image de couverture avec fallback
function getCoverUrl(isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

function setCoverImage(imgElement, isbn, defaultCover) {
    imgElement.src = getCoverUrl(isbn);

    imgElement.onerror = function() {
        this.style.display = 'none';  // Masque l'image si non disponible
    };
}

// Fonction pour normaliser les noms d'auteur
function normalizeAuthorName(name) {
    return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

// Variables globales pour stocker les données récupérées
let globalBooksData = {};
let globalStocksData = {};

// Fonction pour mettre à jour le nombre total de livres disponibles
function updateTotalBooksCount() {
    let totalCount = 0;
    for (const isbn in globalStocksData) {
        totalCount += globalStocksData[isbn] || 0;
    }
    document.getElementById('total-books-count').innerText = `Total des livres disponibles : ${totalCount}`;
}

// Fonction de rendu de la liste des livres avec filtrage
function renderBookList(filter = '') {
    const bookListElement = document.getElementById('book-list');
    bookListElement.innerHTML = '';

    let uniqueAuthors = {};

    for (const isbn in globalBooksData) {
        const bookData = globalBooksData[isbn];
        const normalizedAuthor = normalizeAuthorName(bookData.author || 'Auteur inconnu');

        if (!uniqueAuthors[normalizedAuthor]) {
            uniqueAuthors[normalizedAuthor] = bookData.author;
        }

        bookData.author = uniqueAuthors[normalizedAuthor];

        if (filter && !((bookData.title && bookData.title.toLowerCase().includes(filter)) ||
            (bookData.author && bookData.author.toLowerCase().includes(filter)))) {
            continue;
        }

        const stock = globalStocksData[isbn] || 0;
        const bookItem = document.createElement('div');
        bookItem.classList.add('book-item');

        const imgElement = document.createElement('img');
        imgElement.classList.add('book-cover');
        setCoverImage(imgElement, isbn, 'default_cover.jpg');
        bookItem.appendChild(imgElement);

        const contentElement = document.createElement('div');
        contentElement.classList.add('book-details');
        contentElement.innerHTML = `
            <div class="book-title"><strong>Titre : ${bookData.title}</strong></div>
            <div class="book-identifier">ISBN : <strong>${isbn}</strong></div>
            <div class="book-summary">Résumé : ${bookData.summary}</div>
            <div class="stock-info">${stock > 0 ? 'En stock : ' + stock + ' exemplaires' : 'Hors stock'}</div>
            <span class="book-author">Auteur : ${bookData.author}</span>
            <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
        `;
        bookItem.appendChild(contentElement);

        bookListElement.appendChild(bookItem);
    }

    updateTotalBooksCount();
}

// Fonction pour supprimer un livre
function deleteBook(isbn) {
    if (confirm(`Confirmer la suppression du livre avec l'ISBN ${isbn} ?`)) {
        Promise.all([
            set(child(stocksRef, isbn), null),
            set(child(booksDataRef, isbn), null)
        ])
        .then(() => {
            alert(`Livre supprimé.`);
            updateTotalBooksCount();
        })
        .catch(error => console.error('Erreur suppression :', error));
    }
}

// Événement pour filtrer la liste via la barre de recherche
document.getElementById('search-book').addEventListener('input', function() {
    renderBookList(this.value.toLowerCase());
});

// Initialisation du listener pour mettre à jour la liste des livres
function initializeBookListListener() {
    onValue(booksDataRef, (booksDataSnapshot) => {
        globalBooksData = booksDataSnapshot.val() || {};
        onValue(stocksRef, (stocksSnapshot) => {
            globalStocksData = stocksSnapshot.val() || {};
            renderBookList(document.getElementById('search-book').value.toLowerCase());
        });
    });
}

// Initialiser la liste des livres
initializeBookListListener();

// Rendre la fonction deleteBook accessible globalement
window.deleteBook = deleteBook;
