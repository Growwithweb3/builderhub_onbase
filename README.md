**I had used curosrAI pro to resolve the bug realted to this project: Idea and structue was mine**

# Builder Hub on Base

A decentralized directory for Base developers to register, verify, and rank their projects using real on-chain data.

[ I already shutdown the server and database ofthis project but if you want to expolore this project check the code - for now only frontend part is active https://mini-app-for-farcaster.vercel.app/ ]

---

##  Project Overview

**Builder Hub on Base** is a platform designed to highlight and rank Base blockchain developers. It ensures transparency, ownership verification, and fair ranking based on real network activity.

###  Key Features

* Developers can list their projects.
* Contract ownership verification to prevent fake listings. (we are working on this)
* Approval system to maintain quality.
* Developer dashboard with detailed statistics.
* Global Leaderboard (Top 100) based on:

  * Transaction count
  * Unique wallet interactions
* Becomes the official developer directory of the Base chain.

---

##  Project Structure & Logic

### 1. `index.html` — Entry Page

When users open the site, they see:

* Title: **Developer Hub on Base**
* Subtitle: *Connecting Base Builders*
* Button: **Connect MetaMask Wallet**

#### 🔍 Logic

After wallet connects:

* Backend checks if the wallet is **approved**.

  * **APPROVED →** redirect to `profile.html`
  * **NOT APPROVED →** redirect to `createprofile.html`

This creates a seamless onboarding flow.

---

### 2. `createprofile.html` — Developer Registration

This page collects necessary user data.

####  Required Inputs

* Connected wallet (auto)
* X (Twitter) username — required (`@username`)
* Project X account — optional
* GitHub link — optional
* Contract addresses:

  * Main contract — required
  * Two optional contracts — optional

---

###  Contract Ownership Verification (Security Fix)

To prevent fake submissions:

1. User enters contract address.
2. Backend fetches **deployer address** via BaseScan API / Alchemy.
3. If deployer wallet == connected wallet → **Valid**.
4. If NOT:

   * Ask user to **sign message**:

     > "Sign this message to verify ownership of contract 0x..."
   * Verify signature.
5. Only then allow submission.

This ensures only real creators list their contracts.

---

###  Data Stored in Backend (`Profile.js`)

* `walletAddress`
* `xUsername`
* `projectX` (optional)
* `github` (optional)
* `mainContractAddress`
* `optionalContractAddresses`
* `ownershipSignature`
* `approvalStatus` (`pending` | `approved` | `rejected`)

---

## 3. `review.html` — Admin Panel

**Private page** accessible only to admin wallet:

```
0xb0dfc6ca6aafd3b0719949aa029d30d79fed30a4
```

####  Admin pannel

* Wallet address
* X username
* GitHub link
* Contract addresses
* Contract activity
* Signature proof of ownership

#### Admin Actions

* **Approve** submission
* **Reject** submission
* Add admin notes

Once approved:

* Backend sets `approvalStatus = "approved"`
* User gains access to their dashboard (`profile.html`)

---

## 4. `profile.html` — Developer Dashboard

Only accessible if user wallet is **approved**.

###  What Developer Sees

#### Top Section (Project Summary)

* Contract address
* Total transactions (last 12 hours & all-time)
* Unique wallet interactions
* Growth rate
* Social links (X + GitHub)

#### Bottom Section (Rankings)

* Rank by **transactions**
* Rank by **unique wallets**

---

##  Leaderboard System (Top 100)

Public page visible to all.

###  Ranking Logic (Every 12 Hours)

Backend performs:

1. Fetch contract stats for all approved projects

   * Total transactions
   * Unique wallet interactions
2. Sort into two lists:

   * **Top 100 — Transactions**
   * **Top 100 — Unique Wallets**
3. Save leaderboard entries

###  Leaderboard Format

| Project | Contract | Tx Rank | Unique Wallet Rank | X ID |
| ------- | -------- | ------- | ------------------ | ---- |
| Name    | 0x....   | 1       | 1                  | @... |
| Name    | 0x....   | 2       | 2                  | @... |
| ...     | ...      | ...     | ...                | ...  |
| N=100   | N=100    |         |                    |      |

---

##  Ranking Types

* **Rank based on total transactions**
* **Rank based on unique wallets interacting with contract**

---

##  Contribution

Feel free to fork, open issues, or contribute pull requests.

---


##  Powered by Base

Building a transparent and verifiable directory for Base developers.
