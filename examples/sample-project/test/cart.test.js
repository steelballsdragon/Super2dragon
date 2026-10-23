import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cart } from '../src/cart.js';
import { formatCents } from '../src/format.js';

test('subtotal sums price times quantity', () => {
  const cart = new Cart().add('A', 500, 2).add('B', 250);
  assert.equal(cart.subtotal(), 1250);
});

test('adding the same item twice increases quantity', () => {
  const cart = new Cart().add('A', 100).add('A', 100, 3);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 4);
});

test('total applies a percentage discount', () => {
  const cart = new Cart().add('A', 2000);
  assert.equal(cart.total(10), 1800);
  assert.equal(cart.total(0), 2000);
  assert.equal(cart.total(25), 1500);
});

test('formatCents renders dollars and cents', () => {
  assert.equal(formatCents(1234), '$12.34');
  assert.equal(formatCents(5), '$0.05');
  assert.equal(formatCents(-250), '-$2.50');
});
