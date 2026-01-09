const fs = require('fs');

// Load the JSON file
const rawData = fs.readFileSync('ecl.json');
const cards = JSON.parse(rawData);

// Extract name and collector_number, then sort by collector_number (numerically)
const sortedCards = cards
  .map(card => ({
    name: card.name,
    collector_number: parseInt(card.collector_number, 10)
  }))
  .sort((a, b) => a.collector_number - b.collector_number);

// Output the list
console.log("Ordered Card List:");
sortedCards.forEach(card => {
  console.log(`#${card.collector_number}: ${card.name}`);
});

// Calculate count and check for duplicates based on 'id'
const totalCount = cards.length;
const uniqueIds = new Set(cards.map(card => card.id));
const hasDuplicates = uniqueIds.size !== totalCount;

console.log(`\nTotal Count of Cards: ${totalCount}`);
console.log(`Are there any duplicates? ${hasDuplicates ? "Yes" : "No"}`);