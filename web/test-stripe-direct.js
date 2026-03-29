// Direct test of Stripe key without any test framework
import Stripe from 'stripe';
import { config } from 'dotenv';

// Load .env directly
config({ path: '.env' });

console.log('=== Direct Stripe Key Test ===');
console.log('Raw key from env:', process.env.STRIPE_SECRET_KEY);

const testKey = process.env.STRIPE_SECRET_KEY;

if (!testKey) {
  console.error('❌ No STRIPE_SECRET_KEY found in .env');
  process.exit(1);
}

console.log('Key starts with:', testKey.substring(0, 10) + '...');
console.log('Key length:', testKey.length);

// Test the key
async function testStripeKey() {
  try {
    const stripe = new Stripe(testKey);
    console.log('✅ Stripe instance created');
    
    const balance = await stripe.balance.retrieve();
    console.log('✅ Stripe API call successful!');
    console.log('Balance:', balance);
    
  } catch (error) {
    console.error('❌ Stripe API call failed:', error.message);
    
    if (error.message.includes('Invalid API Key')) {
      console.error('💡 This means the key is invalid, revoked, or not a real Stripe key');
    }
  }
}

testStripeKey();
