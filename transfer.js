// transfer.js
import 'dotenv/config';
import bs58 from 'bs58';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import {
  createUmi,
} from '@metaplex-foundation/umi-bundle-defaults';
import {
  publicKey,
  createSignerFromKeypair,
  signerIdentity,
} from '@metaplex-foundation/umi';
import {
  transferV1,
  fetchAssetV1,
  collectionAddress,
} from '@metaplex-foundation/mpl-core';
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  transfer,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Load configuration from environment variables
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const HOLDER_SECRET = process.env.HOLDER_SECRET;
const FEEPAYER_SECRET = process.env.FEEPAYER_SECRET;
const ASSET_ADDRESS = process.env.ASSET_ADDRESS;
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS;

// Validate required environment variables
function validateEnv() {
  const required = {
    RPC_ENDPOINT,
    HOLDER_SECRET,
    FEEPAYER_SECRET,
    ASSET_ADDRESS,
    RECIPIENT_ADDRESS,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in your values.'
    );
  }
}

// Create keypair from base58 secret key
function createKeypairFromSecret(secret) {
  const secretKey = bs58.decode(secret);
  const seed = new Uint8Array(
    secretKey.length >= 32 ? secretKey.slice(0, 32) : secretKey
  );
  return Keypair.fromSeed(seed);
}

// Transfer Metaplex Core Asset
async function transferCoreAsset(umi, assetAddress, holder, feePayer, recipient) {
  console.log('Detected Metaplex Core Asset');
  
  // Fetch the asset to check if it's in a collection
  const asset = await fetchAssetV1(umi, assetAddress);
  console.log('Asset owner:', asset.owner);
  console.log('Asset name:', asset.name);
  
  // Check if asset is in a collection
  const collectionId = collectionAddress(asset);
  
  // Set identity and payer
  umi.use(signerIdentity(holder));
  umi.payer = feePayer;

  // Build transferV1 for Core Asset
  const transferParams = {
    asset: assetAddress,
    newOwner: recipient,
    authority: holder,
    payer: feePayer,
  };
  
  // If asset is in a collection, include collection address
  if (collectionId) {
    transferParams.collection = collectionId;
    console.log('Asset is in collection:', collectionId);
  }

  console.log('Transferring Core Asset...');
  const tx = await transferV1(umi, transferParams).sendAndConfirm(umi);
  
  return tx;
}

// Transfer SPL Token (traditional token ATA)
async function transferSPLToken(
  connection,
  mintAddress,
  holderKeypair,
  feePayerKeypair,
  recipientAddress
) {
  console.log('Detected SPL Token');
  
  const mintPublicKey = new PublicKey(mintAddress);
  const recipientPublicKey = new PublicKey(recipientAddress);

  // Get holder's associated token account
  const holderTokenAccount = await getAssociatedTokenAddress(
    mintPublicKey,
    holderKeypair.publicKey
  );

  console.log('Holder token account:', holderTokenAccount.toBase58());

  // Get or create recipient's associated token account
  console.log('Getting or creating recipient token account...');
  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    feePayerKeypair, // Payer for the account creation if needed
    mintPublicKey,
    recipientPublicKey
  );

  console.log('Recipient token account:', recipientTokenAccount.address.toBase58());

  // Get token account balance to determine amount
  const tokenAccountInfo = await connection.getTokenAccountBalance(holderTokenAccount);
  const amount = tokenAccountInfo.value.amount;
  
  console.log(`Transferring ${amount} tokens...`);

  // Transfer tokens
  const signature = await transfer(
    connection,
    feePayerKeypair, // Payer for transaction fees
    holderTokenAccount, // Source token account
    recipientTokenAccount.address, // Destination token account
    holderKeypair, // Owner/authority of the source token account
    BigInt(amount),
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );

  return { signature };
}

// Detect asset type and transfer accordingly
async function transferAsset() {
  try {
    // Validate environment variables
    validateEnv();

    // Parse addresses
    const assetAddress = publicKey(ASSET_ADDRESS);
    const recipientAddress = publicKey(RECIPIENT_ADDRESS);

    // Create keypairs
    const holderKeypair = createKeypairFromSecret(HOLDER_SECRET);
    const feePayerKeypair = createKeypairFromSecret(FEEPAYER_SECRET);

    // Derive holder public key
    const holderPublicKey = publicKey(holderKeypair.publicKey.toBase58());

    console.log('=== Transfer Configuration ===');
    console.log('Holder:', holderPublicKey);
    console.log('Asset:', assetAddress);
    console.log('Recipient:', recipientAddress);
    console.log('============================\n');

    // Create UMI instance
    const umi = createUmi(RPC_ENDPOINT);
    
    // Create Solana connection for SPL token operations
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    // Convert to Umi keypair format
    const holderUmiKeypair = umi.eddsa.createKeypairFromSecretKey(holderKeypair.secretKey);
    const feePayerUmiKeypair = umi.eddsa.createKeypairFromSecretKey(feePayerKeypair.secretKey);

    const holder = createSignerFromKeypair(umi, holderUmiKeypair);
    const feePayer = createSignerFromKeypair(umi, feePayerUmiKeypair);

    // Try to detect asset type
    let tx;
    try {
      // Try to fetch as Core Asset first
      await fetchAssetV1(umi, assetAddress);
      
      // If successful, it's a Core Asset
      tx = await transferCoreAsset(
        umi,
        assetAddress,
        holder,
        feePayer,
        recipientAddress
      );
      
      console.log('\n✅ Transfer successful!');
      console.log('Signature:', bs58.encode(tx.signature));
    } catch (coreError) {
      // If fetchAssetV1 fails, try as SPL token
      console.log('Not a Core Asset, trying as SPL token...');
      
      try {
        tx = await transferSPLToken(
          connection,
          ASSET_ADDRESS,
          holderKeypair,
          feePayerKeypair,
          RECIPIENT_ADDRESS
        );
        
        console.log('\n✅ Transfer successful!');
        console.log('Signature:', tx.signature);
      } catch (splError) {
        throw new Error(
          `Failed to transfer asset. Tried both Core Asset and SPL token.\n` +
          `Core Asset error: ${coreError.message}\n` +
          `SPL Token error: ${splError.message}`
        );
      }
    }
  } catch (error) {
    console.error('\n❌ Transfer failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the transfer
transferAsset();
