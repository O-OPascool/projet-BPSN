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

// 🔹 Fonction pour mettre à jour le nombre total de livres disponibles
function updateTotalBooksCount() {
    let totalCount = 0;
    for (const isbn in globalStocksData) {
        totalCount += globalStocksData[isbn] || 0;
    }
    document.getElementById('total-books-count').innerText = `Total des livres disponibles : ${totalCount}`;
}

// Variables globales pour stocker les données récupérées
let globalBooksData = {};
let globalStocksData = {};

// Fonction de rendu de la liste des livres avec filtrage
function renderBookList(filter = '') {
    const bookListElement = document.getElementById('book-list');
    bookListElement.innerHTML = '';
    for (const isbn in globalBooksData) {
        const bookData = globalBooksData[isbn];
        // Application du filtre sur le titre et l'auteur
        if (filter && !((bookData.title && bookData.title.toLowerCase().includes(filter)) ||
                        (bookData.author && bookData.author.toLowerCase().includes(filter)))) {
            continue;
        }
        const stock = globalStocksData[isbn] || 0;
        const bookItem = document.createElement('div');
        bookItem.classList.add('book-item');
        bookItem.innerHTML = `
            <img class="book-cover" src="${bookData.cover || 'default_cover.jpg'}" alt="Couverture de ${bookData.title}" style="max-width:100px; display:block; margin-bottom:10px;">
            <div class="book-title">Titre : ${bookData.title}</div>
            <div class="book-identifier">ISBN : <strong>${isbn}</strong></div>
            <div class="book-summary">Résumé : ${bookData.summary}</div>
            <div class="stock-info">${stock > 0 ? 'En stock : ' + stock + ' exemplaires' : 'Hors stock'}</div>
            <span class="book-author">Auteur : ${bookData.author || 'Auteur inconnu'}</span>
            <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
        `;
        bookListElement.appendChild(bookItem);
    }
    updateTotalBooksCount();
}

// 🔹 Initialisation du listener pour mettre à jour la liste des livres
function initializeBookListListener() {
    onValue(booksDataRef, (booksDataSnapshot) => {
        globalBooksData = booksDataSnapshot.val() || {};
        onValue(stocksRef, (stocksSnapshot) => {
            globalStocksData = stocksSnapshot.val() || {};
            let filterValue = document.getElementById('search-book').value.toLowerCase();
            renderBookList(filterValue);
        });
    });
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

// Gestion de la mise à jour du stock
document.getElementById('stock-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const newStock = parseInt(document.getElementById('new-stock').value);
    const isbn = document.getElementById('isbn').value.trim();

    if (!isValidISBN(isbn)) {
        alert("ISBN non valide.");
        return;
    }

    if (!isNaN(newStock) && newStock >= 0) {
        if (confirm(`Confirmer la mise à jour du stock pour ${isbn} ?`)) {
            await set(child(stocksRef, isbn), newStock);
            alert('Stock mis à jour.');
            // displayStock(isbn); // La fonction displayStock n'est pas définie ; à implémenter si besoin.
            updateTotalBooksCount();
        }
    } else {
        alert('Veuillez entrer une quantité valide.');
    }
});

// Événement pour filtrer la liste via la barre de recherche
document.getElementById('search-book').addEventListener('input', function() {
    let filterValue = this.value.toLowerCase();
    renderBookList(filterValue);
});

// Rendre la fonction deleteBook accessible globalement
window.deleteBook = deleteBook;

// Initialiser la liste des livres
initializeBookListListener();
