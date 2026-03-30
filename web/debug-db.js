// Database Debug Tool for CounterPro
import { neon } from "@neondatabase/serverless";
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function debugDatabase() {
  console.log('🔍 Debugging CounterPro Database...\n');

  try {
    // 1. Check all negotiations
    console.log('📋 All negotiations:');
    const negotiations = await sql`SELECT * FROM negotiations ORDER BY created_at DESC LIMIT 10`;
    console.table(negotiations);

    // 2. Check for the specific email alias
    console.log('\n🔍 Looking for sales+neg8@counterproai.com:');
    const specificNeg = await sql`
      SELECT * FROM negotiations 
      WHERE alias_email = ${'sales+neg8@counterproai.com'} 
      OR counterparty_email = ${'yasonrohan@gmail.com'}
    `;
    console.table(specificNeg);

    // 3. Check recent negotiation messages
    console.log('\n💬 Recent negotiation messages:');
    const messages = await sql`
      SELECT nm.*, n.address, n.alias_email 
      FROM negotiation_messages nm 
      JOIN negotiations n ON nm.negotiation_id = n.id 
      ORDER BY nm.created_at DESC 
      LIMIT 10
    `;
    console.table(messages);

    // 4. Check webhook logs
    console.log('\n📡 Recent webhook logs:');
    const logs = await sql`
      SELECT * FROM webhook_logs 
      ORDER BY created_at DESC 
      LIMIT 20
    `;
    console.table(logs);

  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

debugDatabase();
