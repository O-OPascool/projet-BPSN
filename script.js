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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const stocksRef = ref(database, 'stocks');
const booksDataRef = ref(database, 'booksData');

function isValidISBN(isbn) {
    const cleanIsbn = isbn.replace(/-/g, ''); // Retire les tirets
    return (cleanIsbn.length === 10 || cleanIsbn.length === 13) && !isNaN(cleanIsbn);
}

function showConfirmation(message, callback) {
    const modal = document.getElementById('confirmation-modal');
    const messageElement = document.getElementById('confirmation-message');
    const confirmYes = document.getElementById('confirm-yes');
    const confirmNo = document.getElementById('confirm-no');

    messageElement.innerText = message;
    modal.classList.remove('hidden');

    confirmYes.onclick = () => {
        modal.classList.add('hidden');
        callback(true);
    };

    confirmNo.onclick = () => {
        modal.classList.add('hidden');
        callback(false);
    };
}

function deleteBook(isbn) {
    showConfirmation(`Supprimer le livre avec l'ISBN ${isbn} ?`, (confirmed) => {
        if (confirmed) {
            Promise.all([
                set(child(stocksRef, isbn), null),
                set(child(booksDataRef, isbn), null)
            ])
            .then(() => alert(`Livre supprimé.`))
            .catch(error => alert('Erreur lors de la suppression : ' + error.message)); // Message utilisateur
        }
    });
}

// Rendre deleteBook globalement accessible
window.deleteBook = deleteBook;

document.getElementById('stock-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const newStock = parseInt(document.getElementById('new-stock').value);
    const isbn = document.getElementById('isbn').value.trim();

    if (isValidISBN(isbn) && newStock >= 0) {
        showConfirmation(`Confirmer la mise à jour du stock pour ${isbn} ?`, async (confirmed) => {
            if (confirmed) {
                try {
                    await set(child(stocksRef, isbn), newStock);
                    alert('Stock mis à jour.');
                } catch (error) {
                    alert('Erreur lors de la mise à jour : ' + error.message);
                }
            }
        });
    }
});

function initializeBookListListener() {
    const bookListElement = document.getElementById('book-list');
    onValue(booksDataRef, (booksSnapshot) => {
        onValue(stocksRef, (stocksSnapshot) => {
            bookListElement.innerHTML = '';
            const books = booksSnapshot.val() || {};
            const stocks = stocksSnapshot.val() || {};
            Object.keys(books).forEach((isbn) => {
                const book = books[isbn];
                const stock = stocks[isbn] || 0;
                const bookItem = `
                    <div class="book-item">
                        <div><strong>${book.title}</strong></div>
                        <div>Auteur : ${book.author}</div>
                        <div>Résumé : ${book.summary}</div>
                        <div>Stock : ${stock > 0 ? `${stock} disponibles` : 'Hors stock'}</div>
                        <button class="delete-button" onclick="deleteBook('${isbn}')">Supprimer</button>
                    </div>`;
                bookListElement.innerHTML += bookItem;
            });
        });
    });
}

initializeBookListListener();
