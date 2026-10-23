import { Cart } from './cart.js';
import { formatCents } from './format.js';

const cart = new Cart().add('Coffee beans', 1299, 2).add('Mug', 850);
console.log(`Subtotal: ${formatCents(cart.subtotal())}`);
console.log(`Total with 10% off: ${formatCents(cart.total(10))}`);
