import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kcfhpgviahnycusjlonj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRole() {
  const { data } = await supabase.from('servers').select('role').limit(1);
  console.log('Role example:', data[0].role);
}

checkRole();
