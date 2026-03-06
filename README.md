
# DEX AMM Project

## Overview

This project is a simplified Decentralized Exchange (DEX) implemented using the Automated Market Maker (AMM) model, inspired by Uniswap V2.  
The goal of this project was to deeply understand how decentralized trading works **without order books**, purely through smart contracts and mathematical formulas.

The DEX allows users to:
- Provide liquidity to a token pair
- Earn fees as liquidity providers
- Swap between two ERC-20 tokens using the constant product formula
- Withdraw liquidity along with accumulated trading fees

This project focuses on **correctness, transparency, and reproducibility**, rather than adding unnecessary features.

---

## Key Features

- Initial and subsequent liquidity provision
- Liquidity removal based on proportional ownership
- Constant product AMM pricing (x * y = k)
- 0.3% trading fee retained in the pool for LPs
- LP share tracking inside the DEX contract
- Comprehensive test suite with edge cases
- Fully Dockerised for reproducible evaluation

---

## Architecture Overview

The project consists of two main smart contracts:

### 1. DEX.sol
This is the core contract that:
- Manages token reserves
- Handles liquidity accounting
- Executes swaps
- Calculates prices and fees

LP tokens are implemented internally using a mapping rather than a separate ERC-20 contract to keep the system simple and focused.

### 2. MockERC20.sol
A simple ERC-20 token used for testing:
- Allows minting for test scenarios
- Represents Token A and Token B in the DEX

LP tokens are implemented as internal accounting within the DEX contract rather than a separate ERC-20 token, as transferable LP tokens were not required for this implementation.

The project uses **Hardhat** for development and testing, and **Docker** to ensure the environment is reproducible on any machine.

---

## Mathematical Implementation

### Constant Product Formula

The AMM follows the invariant:

x * y = k

Where:
- x = reserve of Token A
- y = reserve of Token B
- k = constant

After every swap, the product of reserves must remain the same or increase slightly due to fees.

---

### Fee Calculation (0.3%)

For each swap, a 0.3% fee is applied:

amountInWithFee = amountIn * 997  
denominator = (reserveIn * 1000) + amountInWithFee  
amountOut = (amountInWithFee * reserveOut) / denominator  

This ensures:
- Traders pay a small fee
- Fees remain in the pool
- Liquidity providers benefit over time

---

### Liquidity Provision

#### Initial Liquidity
The first liquidity provider sets the initial price:

liquidityMinted = sqrt(amountA * amountB)

#### Subsequent Liquidity
Liquidity must follow the existing price ratio:

liquidityMinted = (amountA * totalLiquidity) / reserveA

This preserves fairness between providers.

---

### Liquidity Removal

When liquidity is removed, tokens are returned proportionally:

amountA = (liquidityBurned * reserveA) / totalLiquidity  
amountB = (liquidityBurned * reserveB) / totalLiquidity  

This includes accumulated fees.

---

## Testing Strategy

The test suite is written using **Hardhat + Chai** and includes:

- Liquidity management tests
- Swap correctness tests
- Fee accumulation tests
- Price calculation tests
- Edge cases (zero inputs, invalid states)
- Event emission verification

More than 25 test cases are implemented, and all tests pass successfully.

### Coverage

Overall coverage is well above the required 80% threshold.
Some defensive branches remain intentionally uncovered because they represent unreachable or revert-only states, which is standard practice in production-grade smart contracts.

---

## Contract Addresses

This project is configured for local development using the Hardhat network (chainId: 31337).
It has not been deployed to a public testnet.

To deploy to a testnet (e.g., Sepolia), update `hardhat.config.js` with network credentials
and run:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Contract addresses will be printed to the console after successful deployment.

---

## Dockerisation

This project is fully Dockerised to ensure consistent execution across environments.

### Docker Image

Docker Image URL:
https://hub.docker.com/r/rushi5706/dex-amm

The image:
- Installs dependencies
- Compiles smart contracts
- Runs the full test suite

### Running with Docker

```bash
docker-compose up -d
docker-compose exec app npm run compile
docker-compose exec app npm test
docker-compose exec app npm run coverage
docker-compose down
```

---

## Screenshots

Screenshots demonstrating the following are included in the repository:

- [Docker image published on Docker Hub](screenshots/01-dockerhub-image.png)
- [Successful Docker build](screenshots/02-docker-build-success.png)
- [Tests passing inside Docker container](screenshots/03-docker-tests-passing.png)
- [Coverage report](screenshots/04-coverage-report.png)
- [Project structure](screenshots/05-project-structure.png)

All screenshots are stored in the `screenshots/` directory.

---

## Setup Instructions (Local)

### Prerequisites
- Node.js
- npm
- Docker & Docker Compose

### Local Execution

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat coverage
```

---

## Security Considerations

- Solidity 0.8+ is used for built-in overflow protection
- Input validation is enforced on all state-changing functions
- No external state dependencies are used for reserve tracking
- Fees are handled internally without external transfers
- No privileged admin operations exist

---

## Known Limitations

- Only a single token pair is supported
- No slippage protection for swaps
- No deadline parameter for transactions
- No flash swaps

These were intentionally excluded to keep the implementation focused and clear.

---

## Conclusion

This project demonstrates a complete, working AMM-based DEX with:
- Correct mathematical modeling
- Robust testing
- Proper Dockerisation
- Clean and reproducible setup

The emphasis throughout the project was on **correctness, clarity, and real-world best practices**, rather than unnecessary complexity.
