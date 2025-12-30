import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pmuflzyopjyecdvprynq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWZsenlvcGp5ZWNkdnByeW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNjE1NjgsImV4cCI6MjA4MjYzNzU2OH0.8nu8F5QWw3zP9d9etq7Z-721VyD1c-nwvOl-3aB6j4c';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
