# sample-shop (LocalCode demo repository)

A deliberately tiny project with one bug, used to demonstrate LocalCode AI.

```bash
npm test        # one test fails: "total applies a percentage discount"
```

## Demo task

Open this folder in LocalCode (or copy it somewhere first so the original stays intact) and ask:

> Run the tests, find out why they fail, fix the bug in src/, and re-run the tests until they pass.

The agent should read `test/cart.test.js` and `src/cart.js`, notice that
`Cart.total()` subtracts the discount percentage instead of applying it, fix
it with a focused edit, and show the passing test run as proof.

A second task to try afterwards:

> Add a `removeItem(name)` method to Cart with tests, then run the test suite.
