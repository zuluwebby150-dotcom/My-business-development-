# Zenta Business

A mobile-friendly single-page business management app built for small businesses.

## Included

- Firebase phone-number authentication + OTP + reCAPTCHA
- Dashboard
- Sales
- Expenses
- Stock
- Customers / Nkongole
- Invoices
- Reports
- Cash Flow
- Settings
- Firestore cloud persistence
- Vercel-ready deployment

## 1. Restore your Firebase connection

Open `firebase-config.js`.

In the Firebase Console for the existing Zenta project:

**Project settings → Your apps → Web app → Firebase SDK configuration**

Copy the existing web configuration values into `ZENTA_FIREBASE_CONFIG`.

Do not create a new Firebase project if the old project is still available.

## 2. Authentication

The app uses Firebase Phone Authentication. Keep the existing Phone provider enabled.

For development/testing, use the existing Firebase test phone numbers if you already configured them.

The deployed Vercel domain must be in Firebase Authentication's authorized domains.

## 3. Firestore

The app stores one document per authenticated user:

`users/{Firebase UID}`

The supplied `firestore.rules` limits each user to their own document.

Deploy those rules in Firebase Console or with Firebase CLI.

## 4. Vercel

Upload this folder to the GitHub repository, then connect the repository to Vercel.

No build command is required. It is a static web app.

## Important recovery design

The app uses one `index.html` and changes pages inside `#pageContent`.

It does NOT navigate to separate `stock.html`, `reports.html`, `cashflow.html`, etc.

That means clicking Stock, Reports or Cash Flow cannot create the old blank-page problem simply because a separate HTML file is missing.

The Firebase login code is also isolated from page rendering. Do not replace the whole `script.js` just to fix a page.

## Future upgrades

For a production SaaS version, move sales/expenses/stock/etc. into separate Firestore subcollections rather than one large user document. Add role-based access, server-side validation, backups, audit logs, invoice PDF generation, subscription billing and analytics.
