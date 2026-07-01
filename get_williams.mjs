import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: servers } = await supabase.from('servers').select('*').ilike('name', '%Williams%');
  console.log('Found:', servers);
}
run();
