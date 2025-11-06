# Solana Asset Transfer with Separate Fee Payer

Simple app to transfer Solana assets including Metaplex Core Assets and traditional SPL tokens (ATAs) with a separate fee payer account.

## Features

- **Dual Asset Support**: Automatically detects and transfers both:
  - Metaplex Core Assets
  - Traditional SPL Tokens 
- **Automatic Detection**: No need to specify asset type - the script detects it automatically

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your values in `.env`:
   - `RPC_ENDPOINT`: Your Solana RPC endpoint (e.g., Helius, QuickNode, etc.)
   - `HOLDER_SECRET`: Base58 encoded private key of the current asset owner
   - `FEEPAYER_SECRET`: Base58 encoded private key of the account that will pay transaction fees
   - `ASSET_ADDRESS`: The asset address (mint address for Core Assets or token mint for SPL tokens)
   - `RECIPIENT_ADDRESS`: Public key of the recipient

## Usage

```bash
npm start
```

or

```bash
npm run transfer
```

## How It Works

1. The script loads configuration from environment variables
2. It attempts to fetch the asset as a Metaplex Core Asset
3. If successful, it transfers using the Core Asset protocol
4. If not a Core Asset, it treats it as an SPL token and transfers accordingly
5. The script handles associated token accounts (ATAs) automatically for SPL tokens

## Security Notes

- Never commit your `.env` file to version control
- Keep your private keys secure
- The `.env` file is already included in `.gitignore`
