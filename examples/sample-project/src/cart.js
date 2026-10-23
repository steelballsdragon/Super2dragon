/**
 * A minimal shopping cart. Prices are in cents to avoid floating point errors.
 */
export class Cart {
  constructor() {
    this.items = [];
  }

  add(name, priceCents, quantity = 1) {
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw new Error(`Invalid price for ${name}`);
    }
    const existing = this.items.find((item) => item.name === name);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ name, priceCents, quantity });
    }
    return this;
  }

  subtotal() {
    return this.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  }

  /**
   * Total after applying a percentage discount (e.g. 10 for 10% off),
   * rounded to the nearest cent.
   */
  total(discountPercent = 0) {
    const subtotal = this.subtotal();
    return Math.round(subtotal - discountPercent);
  }
}
