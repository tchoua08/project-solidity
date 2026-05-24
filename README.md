# Collateralized Loan Project

This project implements a Solidity smart contract for collateralized ETH loans.
Borrowers can deposit ETH as collateral and request a loan, lenders can fund open
loan requests, borrowers can repay with interest before the due date, and lenders
can claim collateral when a funded loan defaults.

## Project Structure

- `contracts/CollateralizedLoan.sol`: main Solidity contract.
- `test/CollateralizedLoan.js`: Hardhat tests for deployment, loan requests, funding, repayment, collateral claims, and error handling.
- `scripts/deploy.js`: deployment script for Sepolia.
- `hardhat.config.js`: Hardhat configuration with Solidity `0.8.19`.

## Commands

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Deploy to Sepolia:

```bash
npm run deploy
```

## Environment Variables

Create a `.env` file with:

```bash
INFURA_API_KEY=your_infura_api_key
ACCOUNT_PRIVATE_KEY=your_wallet_private_key
```

## Sepolia Etherscan

Deployment link:

```text
Add the Sepolia Etherscan URL after deploying the contract.
```
