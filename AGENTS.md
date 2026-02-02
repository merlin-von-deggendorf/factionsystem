# AGENTS.md

## Non-negotiable rules (read first)
1) **Do not install packages, dependencies, tools, or SDKs.**
   - No editing lockfiles to implicitly add deps (`package-lock.json`)
2) If you believe a dependency is required, you must:
   - install it using npm i  (don't specify a version because we always want to use the latest version)

## Database update workflow
We operate on a MariaDB database.

1) If `schema.sql` does not exist, run `npm run dump`.
2) Read `schema.sql`.
3) Decide the required schema changes and write the SQL into `test.sql`.
4) Implement the required DB functions in `dbfunctions.js`.
5) Add or update tests in `test/dbfunctions.test.js`.
6) Run `npm test`.
7) If the test fails, adjust `test.sql`, `dbfunctions.js`, and/or `test/dbfunctions.test.js`, then run `npm test` again.
8) Repeat until the desired functions are implemented and `npm test` succeeds, or cancel if the changes are not feasible.
9) During this loop, only modify these files: `test.sql`, `dbfunctions.js`, `test/dbfunctions.test.js`.
10) When tests pass, run `npm run deploy`.

