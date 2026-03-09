# Component 4 — Security Layer

Zero-Knowledge Proof (ZKP) grade verification with formal verification via the Certora Prover.

## Project Structure

```
component4-security-layer/
├── circuits/           Circom ZKP circuit + tests + compilation script
├── contracts/          Auto-generated Groth16 Solidity verifier + interfaces
├── formal-verification/ CVL specs (access control, state invariants, arithmetic safety)
├── backend/            Express API, proof generator, blockchain event listener
├── test/               Unit + integration tests
├── scripts/            Deployment + trusted-setup automation
└── docs/               Verification report
```

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Circom | ≥ 2.1 |
| snarkjs | ≥ 0.7 |
| Hardhat | ≥ 2.22 |
| Solidity | 0.8.20 |
| Certora CLI | latest |

## Quick Start

### 1. Install dependencies
```bash
cd backend && npm install
```

### 2. Compile the circuit & run trusted setup
```bash
cd circuits && bash compile.sh
```

### 3. Deploy the verifier contract
```bash
npx hardhat run scripts/deploy-verifier.js --network localhost
```

### 4. Configure environment
```bash
cp backend/.env backend/.env      # then edit CONTRACT_ADDRESS, RPC_URL
```

### 5. Start the API server
```bash
cd backend && npm start
```

### 6. Run tests
```bash
cd backend && npm test
```

### 7. Run formal verification
```bash
export CERTORAKEY=<your-certora-api-key>
bash formal-verification/run-verification.sh
```

## Security Properties

- **Grade privacy** — actual grade is a ZKP private input; never revealed.
- **Access control** — only the contract owner can update the verification key.
- **Arithmetic safety** — all public inputs validated within the BN254 scalar field.
- **State invariants** — proof counter monotonically increases; contract holds no ETH.

See [docs/verification-report.md](docs/verification-report.md) for the full report.

## License

MIT
