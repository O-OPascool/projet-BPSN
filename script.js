// Import des modules Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import {
getDatabase,
ref,
child,
set,
get,
onValue,
remove
} from "https://www.gstatic.com/firebasejs/9.6.7/firebase-database.js";

// Configuration Firebase
const firebaseConfig = {
apiKey: "AIzaSyDKEewyRf8TgMjXCsfHfzvnCpBUG-GYDig",
authDomain: "bpsn-74f1b.firebaseapp.com",
databaseURL:
"https://bpsn-74f1b-default-rtdb.europe-west1.firebasedatabase.app",
projectId: "bpsn-74f1b",
storageBucket: "bpsn-74f1b.firebasestorage.app",
messagingSenderId: "1057707303676",
appId: "1:1057707303676:web:63dd292678dead41c2ed79",
measurementId: "G-DZGXBJERKQ"
};

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Références Firebase pour les stocks et données des livres
const stocksRef = ref(database, "stocks");
const booksDataRef = ref(database, "booksData");

// Fonction pour valider l'ISBN (10 ou 13 chiffres)
function isValidISBN(isbn) {
return (isbn.length === 10 || isbn.length === 13) && !isNaN(isbn);
}

// Gestion du formulaire de recherche
document.getElementById("isbn-form").addEventListener("submit", async function (
event
) {
event.preventDefault();
const isbn = document.getElementById("isbn").value.trim();
if (!isValidISBN(isbn)) {
alert("Veuillez entrer un ISBN valide (10 ou 13 chiffres).");
return;
}
// Masquer la section d'affichage jusqu'à récupération des données
document.getElementById("book-info").classList.add("hidden");
await fetchBookData(isbn);
});

// Récupérer ou ajouter les données d'un livre
async function fetchBookData(isbn) {
try {
const snapshot = await get(child(booksDataRef, isbn));
if (snapshot.exists()) {
const book = snapshot.val();
displayBookData(isbn, book);
displayStock(isbn);
} else {
// Si le livre n'existe pas en BDD, on fait appel à l'API Google Books
const apiUrl = https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn};
const response = await fetch(apiUrl);
if (!response.ok) throw new Error(Erreur API : ${response.status});
const data = await response.json();
if (data.totalItems > 0) {
const book = data.items.volumeInfo;
const bookData = {
title: book.title || "Titre non disponible",
author: book.authors ? book.authors.join(", ") : "Auteur inconnu",
summary: book.description || "Aucun résumé disponible.",
cover:
book.imageLinks && book.imageLinks.thumbnail
? book.imageLinks.thumbnail
: "image.png"
};
// Enregistrer les données du livre dans la BDD
await set(child(booksDataRef, isbn), bookData);
displayBookData(isbn, bookData);
displayStock(isbn);
} else {
alert("Aucun livre trouvé avec cet ISBN.");
}
}
} catch (error) {
console.error("Erreur lors de la récupération des données :", error);
alert(Erreur : ${error.message});
}
}

// Afficher les informations du livre dans la section dédiée
function displayBookData(isbn, bookData) {
document.getElementById("title").innerText = bookData.title;
document.getElementById("author").innerText = bookData.author;
document.getElementById("summary").innerText = bookData.summary;
document.getElementById("cover").src = bookData.cover;
document.getElementById("book-info").classList.remove("hidden");
}

// Afficher le stock d'un livre
async function displayStock(isbn) {
const stockElement = document.getElementById("stock");
try {
const snapshot = await get(child(stocksRef, isbn));
const stockValue = snapshot.val();
if (stockValue !== null) {
stockElement.innerText =
stockValue > 0
? En stock : ${stockValue} exemplaires
: "Hors stock";
} else {
stockElement.innerText = "Stock non défini.";
}
} catch (error) {
console.error("Erreur lors de la récupération du stock :", error);
}
}

// Gestion du formulaire de mise à jour du stock
document.getElementById("stock-form").addEventListener("submit", async function (
event
) {
event.preventDefault();
const newStock = parseInt(document.getElementById("new-stock").value);
const isbn = document.getElementById("isbn").value.trim();
if (!isValidISBN(isbn)) {
alert("ISBN non valide.");
return;
}
if (!isNaN(newStock) && newStock >= 0) {
try {
await set(child(stocksRef, isbn), newStock);
alert("Stock mis à jour avec succès !");
displayStock(isbn);
// Réinitialiser les champs de saisie
document.getElementById("isbn").value = "";
document.getElementById("new-stock").value = "";
} catch (error) {
console.error("Erreur lors de la mise à jour du stock :", error);
alert("Impossible de mettre à jour le stock.");
}
} else {
alert("Veuillez entrer une quantité valide.");
}
});

// Initialiser la liste des livres avec écoute en temps réel
function initializeBookListListener() {
const bookListElement = document.getElementById("book-list");
// L'écoute sur booksDataRef permet de réagir aux ajouts/suppressions des livres
onValue(booksDataRef, (booksDataSnapshot) => {
// Pour être certain d'avoir le stock à jour, on écoute également stocksRef
onValue(stocksRef, (stocksSnapshot) => {
const booksData = booksDataSnapshot.val() || {};
const stocks = stocksSnapshot.val() || {};
bookListElement.innerHTML = ""; // Réinitialiser la liste
for (const isbn in booksData) {
const bookData = booksData[isbn];
const stock = stocks[isbn] || 0;
const bookItem = document.createElement("div");
bookItem.classList.add("book-item");
bookItem.innerHTML = <span class="book-title">${bookData.title}</span> <span class="book-author">${bookData.author}</span> <span class="stock-info">${ stock > 0 ?En stock : ${stock} exemplaires: "Hors stock" }</span> <button class="delete-button">Supprimer</button> ;
// Ajout du gestionnaire d'événement pour supprimer le livre
bookItem
.querySelector(".delete-button")
.addEventListener("click", function () {
deleteBook(isbn);
});
bookListElement.appendChild(bookItem);
}
});
});
}

// Fonction pour supprimer un livre (et son stock associé)
function deleteBook(isbn) {
remove(child(booksDataRef, isbn))
.then(() => {
// Optionnel : supprimer également le stock associé
remove(child(stocksRef, isbn));
alert("Livre supprimé avec succès !");
})
.catch((error) => {
console.error("Erreur lors de la suppression du livre :", error);
alert("Erreur lors de la suppression.");
});
}

// Lancer l'initialisation de la liste dès le chargement du script
initializeBookListListener();
